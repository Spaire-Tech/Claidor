// The backend the MCP manager talks to for a custom URL server (24 September
// 2026). Grok Bot routed every HTTP server through Cursor's backend
// (`cursor-backend/backend-mcp-exec.ts`: ListSandMcpTools, ExecuteSandMcpTool,
// CheckHttpMcpStatus, CompleteMcpOAuth, …), which Simeon Labs' server does
// not serve. This object answers for the servers in the account store
// (`store.ts`) the way `vendor-mcp/backend-exec.ts` answers for the vendor
// connectors: tools listed and called over streamable HTTP by
// `vendor-mcp/http-mcp-client.ts`, with the server's configured headers; a
// 401 or 403 reads as needsAuth; the sign-in is the same OAuth flow as the
// vendors' (discovery, dynamic registration, PKCE, the loopback), started on
// the Mac only. Anything not in the store goes to the fallback unchanged.
//
// A command-configured (stdio) server never reaches this object: the manager
// lists it through the box's own MCP executor
// (`host/extensions/mcp/box-mcp-exec.ts`), which spawns it inside the box.

import { Struct } from "@bufbuild/protobuf";
import { McpResult, McpSuccess } from "../../../packages/proto/generated/agent/v1/mcp_exec_pb.js";
import { contentItem, errorResult } from "../vendor-mcp/backend-exec.js";
import { VendorMcpAuthRequiredError, forgetVendorMcpSession, vendorMcpCallTool, vendorMcpListTools } from "../vendor-mcp/http-mcp-client.js";
import {
  exchangeVendorMcpCode,
  isVendorMcpGrantFresh,
  refreshVendorMcpGrant,
  startVendorMcpOAuth,
  VENDOR_MCP_PENDING_AUTH_TTL_MS,
  type VendorMcpOAuthPending,
} from "../vendor-mcp/oauth.js";
import {
  accountMcpServerById,
  accountMcpServerByName,
  accountMcpServerByUrl,
  clearAccountMcpCredential,
  loadAccountMcpStore,
  setAccountMcpCredential,
  type AccountMcpCredential,
  type AccountMcpLiveServer,
  type McpRemoteConfig,
} from "./store.js";

export interface AccountMcpListedServer {
  readonly serverIdentifier: string;
  readonly status: "connected" | "needsAuth" | "error";
  readonly tools: readonly {
    readonly name: string;
    readonly providerIdentifier: string;
    readonly toolName: string;
    readonly clientKey: string;
    readonly description?: string;
    readonly inputSchema?: unknown;
  }[];
  readonly accountLabel: "default";
  readonly rowServerIdentifier: string;
}

export interface AccountMcpAuthStatus {
  readonly id: string;
  readonly isAvailable: boolean;
  readonly requiresAuth: boolean;
  readonly hasValidToken: boolean;
  readonly authUrl: string;
  readonly error: string;
}

/** The slice of the next backend down the chain; each method is optional. */
export interface AccountMcpFallbackBackend {
  listTools?(serverIdentifiers: readonly string[]): Promise<readonly unknown[]>;
  executeTool?(args: unknown): Promise<unknown>;
  checkAuthStatus?(args: unknown): Promise<unknown>;
  completeOAuth?(args: { stateId: string; code: string }): Promise<void>;
  validateTokens?(targets: readonly { serverUrl: string; accountKey: string }[]): Promise<readonly unknown[]>;
  logoutAccount?(args: unknown): Promise<void>;
  renameAccount?(args: unknown): Promise<void>;
  deleteAccount?(args: unknown): Promise<void>;
}

export interface AccountMcpBackendExecOptions {
  readonly rootDir: () => string;
  readonly fallback?: AccountMcpFallbackBackend;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** True on the Mac only: this side may open a sign-in and refresh a token. */
  readonly canStartAuth: boolean;
  /** Called after this side wrote a credential (a finished sign-in, a refresh, a logout). */
  readonly onCredentialChanged?: (serverId: string) => void;
  readonly log?: (message: string) => void;
}

// Pending sign-ins for custom servers, by state, for this process: the
// manager starts one, the loopback finishes it (`completeOAuth`), the same
// 15-minute life as the vendors'. Kept apart from the vendor table because a
// finished vendor sign-in is stored under a plugin id, ours under a server id.
const pendingAccountMcpAuths = new Map<string, { readonly pending: VendorMcpOAuthPending; readonly startedAtMs: number }>();

export function rememberAccountMcpPendingAuth(pending: VendorMcpOAuthPending, now = Date.now()): void {
  for (const [state, entry] of pendingAccountMcpAuths) if (now - entry.startedAtMs > VENDOR_MCP_PENDING_AUTH_TTL_MS) pendingAccountMcpAuths.delete(state);
  pendingAccountMcpAuths.set(pending.state, { pending, startedAtMs: now });
}

export function takeAccountMcpPendingAuth(state: string, now = Date.now()): VendorMcpOAuthPending | undefined {
  const entry = pendingAccountMcpAuths.get(state);
  if (entry == null) return undefined;
  pendingAccountMcpAuths.delete(state);
  return now - entry.startedAtMs > VENDOR_MCP_PENDING_AUTH_TTL_MS ? undefined : entry.pending;
}

const errorLabel = (error: unknown): string => error instanceof Error ? error.message || error.name : String(error);

function remoteConfig(server: AccountMcpLiveServer): McpRemoteConfig | undefined {
  return "url" in server.config ? server.config : undefined;
}

export function createAccountMcpBackendExec(options: AccountMcpBackendExecOptions) {
  const now = options.now ?? (() => Date.now());
  const fetchImpl = options.fetch ?? fetch;
  const log = options.log ?? (() => undefined);
  const fallback = options.fallback ?? {};

  const store = () => loadAccountMcpStore(options.rootDir());
  const urlServerByName = (name: string): (AccountMcpLiveServer & { readonly config: McpRemoteConfig }) | undefined => {
    const server = accountMcpServerByName(store(), name);
    const config = server == null ? undefined : remoteConfig(server);
    return server == null || config == null ? undefined : { ...server, config };
  };
  const urlServerById = (id: string | number) => {
    const server = accountMcpServerById(store(), id);
    const config = server == null ? undefined : remoteConfig(server);
    return server == null || config == null ? undefined : { ...server, config };
  };
  const urlServerByUrl = (url: string) => {
    const server = accountMcpServerByUrl(store(), url);
    const config = server == null ? undefined : remoteConfig(server);
    return server == null || config == null ? undefined : { ...server, config };
  };

  // A credential that is fresh, or refreshed on the Mac when it can be. In
  // the box an expired token reads as needsAuth: the Mac refreshes and sends
  // the store again, and the box never spends the refresh token.
  const usableCredential = async (server: AccountMcpLiveServer & { readonly config: McpRemoteConfig }): Promise<AccountMcpCredential | undefined> => {
    const credential = server.credential;
    if (credential == null) return undefined;
    if (isVendorMcpGrantFresh(credential, now())) return credential;
    if (!options.canStartAuth || credential.refreshToken == null) return undefined;
    try {
      const refreshed = await refreshVendorMcpGrant({ grant: credential, fetch: fetchImpl, now: now() });
      forgetVendorMcpSession(server.config.url, credential.accessToken, server.config.headers);
      setAccountMcpCredential(options.rootDir(), server.id, refreshed, now());
      options.onCredentialChanged?.(server.id);
      return refreshed;
    } catch (error) {
      log(`account-mcp refresh failed for ${server.name}: ${errorLabel(error)}`);
      return undefined;
    }
  };

  const clientArgs = (server: AccountMcpLiveServer & { readonly config: McpRemoteConfig }, credential: AccountMcpCredential | undefined) => ({
    url: server.config.url,
    ...(credential == null ? {} : { accessToken: credential.accessToken }),
    ...(server.config.headers == null ? {} : { headers: server.config.headers }),
    fetch: fetchImpl,
  });

  const listServer = async (server: AccountMcpLiveServer & { readonly config: McpRemoteConfig }): Promise<AccountMcpListedServer> => {
    const base = { serverIdentifier: server.name, accountLabel: "default" as const, rowServerIdentifier: server.name };
    const credential = await usableCredential(server);
    // A server whose credential has expired and cannot be refreshed here
    // needs a sign-in; one that never had a credential is probed as it is.
    if (server.credential != null && credential == null) return { ...base, status: "needsAuth", tools: [] };
    try {
      const tools = await vendorMcpListTools(clientArgs(server, credential));
      return {
        ...base,
        status: "connected",
        tools: tools.map((tool) => ({
          name: tool.name,
          providerIdentifier: server.name,
          toolName: tool.name,
          clientKey: server.name,
          ...(tool.description == null ? {} : { description: tool.description }),
          ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
        })),
      };
    } catch (error) {
      if (error instanceof VendorMcpAuthRequiredError) return { ...base, status: "needsAuth", tools: [] };
      log(`account-mcp tools/list failed for ${server.name}: ${errorLabel(error)}`);
      return { ...base, status: "error", tools: [] };
    }
  };

  /** Whether the server admits us as configured: `true` connected, `false` a 401/403, a string any other failure. */
  const probe = async (server: AccountMcpLiveServer & { readonly config: McpRemoteConfig }, credential: AccountMcpCredential | undefined): Promise<true | false | string> => {
    try {
      await vendorMcpListTools(clientArgs(server, credential));
      return true;
    } catch (error) {
      if (error instanceof VendorMcpAuthRequiredError) return false;
      return errorLabel(error);
    }
  };

  return {
    async listTools(serverIdentifiers: readonly string[]): Promise<readonly unknown[]> {
      const mine: Array<AccountMcpLiveServer & { readonly config: McpRemoteConfig }> = [];
      const others: string[] = [];
      for (const identifier of serverIdentifiers) {
        const server = urlServerByName(identifier);
        if (server == null) others.push(identifier); else mine.push(server);
      }
      const listed = await Promise.all(mine.map(listServer));
      let rest: readonly unknown[] = [];
      if (others.length > 0 && fallback.listTools != null) {
        try { rest = await fallback.listTools(others); } catch (error) { if (mine.length === 0) throw error; log(`backend list-tools degraded: ${errorLabel(error)}`); }
      }
      return [...listed, ...rest];
    },

    async executeTool(args: { serverIdentifier: string; toolName: string; args: unknown; toolCallId: string; agentId?: string }): Promise<McpResult | unknown> {
      const server = urlServerByName(args.serverIdentifier);
      if (server == null) {
        if (fallback.executeTool == null) return errorResult(`MCP server "${args.serverIdentifier}" is not available here.`);
        return fallback.executeTool(args);
      }
      const credential = await usableCredential(server);
      if (server.credential != null && credential == null) {
        return errorResult(`${server.name} needs authentication before "${args.toolName}" can run. Call AuthenticateMcpServer for it; the user signs in from the connect card.`);
      }
      const plain = args.args instanceof Struct ? args.args.toJson() : args.args;
      try {
        const result = await vendorMcpCallTool({ ...clientArgs(server, credential), name: args.toolName, arguments: plain });
        return new McpResult({
          result: {
            case: "success",
            value: new McpSuccess({ content: result.content.map(contentItem), isError: result.isError }),
          },
        });
      } catch (error) {
        if (error instanceof VendorMcpAuthRequiredError) {
          return errorResult(`${server.name} refused the request (${error.status}). Call AuthenticateMcpServer for it so the user can sign in.`);
        }
        return errorResult(`"${args.toolName}" on ${server.name} failed: ${errorLabel(error)}`);
      }
    },

    async checkAuthStatus(args: { serverId: string | number; accountKey: string; oauthRedirectUri: string; forceReauth?: boolean }): Promise<AccountMcpAuthStatus | unknown> {
      const id = String(args.serverId);
      const server = urlServerById(args.serverId);
      if (server == null) {
        if (fallback.checkAuthStatus == null) throw new Error(`MCP server ${id} is not in the account's configuration and no backend serves it.`);
        return fallback.checkAuthStatus(args);
      }
      const credential = args.forceReauth === true ? undefined : await usableCredential(server);
      if (credential != null) return { id, isAvailable: true, requiresAuth: false, hasValidToken: true, authUrl: "", error: "" };
      if (args.forceReauth !== true) {
        // Many custom servers need no sign-in at all (public, or the token is
        // in `headers`); only a 401 or 403 means one is needed.
        const admitted = await probe(server, undefined);
        if (admitted === true) return { id, isAvailable: true, requiresAuth: false, hasValidToken: false, authUrl: "", error: "" };
        if (typeof admitted === "string") return { id, isAvailable: false, requiresAuth: false, hasValidToken: false, authUrl: "", error: admitted };
      }
      if (!options.canStartAuth) {
        // The box cannot open a browser. It reports "sign-in needed" with the
        // server's own URL as the (never opened) link so the manager draws
        // the connect card; the Mac starts the real sign-in from that card.
        return { id, isAvailable: true, requiresAuth: true, hasValidToken: false, authUrl: server.config.url, error: "" };
      }
      try {
        // A CLIENT_ID in the server's `auth` block is an app the person registered
        // by hand; the sign-in uses it and skips dynamic registration (ledger F-171).
        const clientId = server.config.auth?.CLIENT_ID;
        const started = await startVendorMcpOAuth({ pluginId: `account-${server.id}`, mcpUrl: server.config.url, redirectUri: args.oauthRedirectUri, fetch: fetchImpl, remember: false, ...(clientId == null || clientId.length === 0 ? {} : { clientId }) });
        rememberAccountMcpPendingAuth(started.pending, now());
        return { id, isAvailable: true, requiresAuth: true, hasValidToken: false, authUrl: started.authorizationUrl, error: "" };
      } catch (error) {
        const detail = errorLabel(error);
        const message = /register/i.test(detail)
          ? `${server.name} asks for a sign-in but does not accept a client Simeon registers on the spot (no dynamic registration at ${server.config.url}). Configure its token in the server's headers instead.`
          : detail;
        return { id, isAvailable: false, requiresAuth: false, hasValidToken: false, authUrl: "", error: message };
      }
    },

    async completeOAuth(args: { stateId: string; code: string }): Promise<void> {
      const pending = takeAccountMcpPendingAuth(args.stateId, now());
      if (pending == null) {
        if (fallback.completeOAuth == null) throw new Error("No pending sign-in matches this callback.");
        return fallback.completeOAuth(args);
      }
      const serverId = pending.pluginId.replace(/^account-/, "");
      const grant = await exchangeVendorMcpCode({ pending, code: args.code, fetch: fetchImpl, now: now() });
      const stored = setAccountMcpCredential(options.rootDir(), serverId, grant, now());
      if (stored == null) throw new Error(`MCP server ${serverId} is no longer configured; the sign-in was discarded.`);
      forgetVendorMcpSession(pending.mcpUrl, undefined, remoteConfig(stored)?.headers);
      log(`account-mcp credential stored for ${stored.name}`);
      options.onCredentialChanged?.(serverId);
    },

    async validateTokens(targets: readonly { serverUrl: string; accountKey: string }[]): Promise<readonly unknown[]> {
      const mine: unknown[] = [];
      const others: { serverUrl: string; accountKey: string }[] = [];
      for (const target of targets) {
        const server = urlServerByUrl(target.serverUrl);
        if (server == null) { others.push(target); continue; }
        mine.push({ serverUrl: target.serverUrl, accountKey: target.accountKey, hasValidToken: (await usableCredential(server)) != null });
      }
      let rest: readonly unknown[] = [];
      if (others.length > 0 && fallback.validateTokens != null) { try { rest = await fallback.validateTokens(others); } catch { rest = []; } }
      return [...mine, ...rest];
    },

    async logoutAccount(args: { serverUrl: string; accountKey: string }): Promise<void> {
      const server = urlServerByUrl(args.serverUrl);
      if (server == null) { await fallback.logoutAccount?.(args); return; }
      if (server.credential != null) forgetVendorMcpSession(server.config.url, server.credential.accessToken, server.config.headers);
      if (clearAccountMcpCredential(options.rootDir(), server.id, now())) options.onCredentialChanged?.(server.id);
    },

    async renameAccount(args: { serverId: string; accountKey: string; newAccountKey: string }): Promise<void> {
      if (urlServerById(args.serverId) != null) return;
      await fallback.renameAccount?.(args);
    },

    async deleteAccount(args: { serverId: string; accountKey: string }): Promise<void> {
      const server = urlServerById(args.serverId);
      if (server == null) { await fallback.deleteAccount?.(args); return; }
      if (server.credential != null) forgetVendorMcpSession(server.config.url, server.credential.accessToken, server.config.headers);
      if (clearAccountMcpCredential(options.rootDir(), server.id, now())) options.onCredentialChanged?.(server.id);
    },
  };
}

export type AccountMcpBackendExec = ReturnType<typeof createAccountMcpBackendExec>;

// The backend the MCP manager talks to for HTTP servers, served locally for
// vendor connectors (24 September 2026). Grok Bot's manager routes every
// HTTP MCP server through one object with Cursor's backend behind it:
// tool listing, tool calls, the OAuth start (checkAuthStatus), the OAuth
// finish (completeOAuth), token checks and account removal. Claidor serves
// none of that, so until now a vendor connector could be installed and
// nothing else. This object answers for the vendor connectors in our store
// and hands anything else to the old backend unchanged.
//
// Two sides run it. On the Mac (`canStartAuth: true`) it starts sign-ins,
// finishes them from the loopback, refreshes tokens and is the only writer
// of a credential. In the box (`canStartAuth: false`) it only reads the
// store the Mac sent, lists tools and calls them; with no credential it
// reports needsAuth, which is what makes the connect card appear.

import { Struct } from "@bufbuild/protobuf";
import {
  McpError,
  McpResult,
  McpSuccess,
  McpTextContent,
  McpToolResultContentItem,
} from "../../../packages/proto/generated/agent/v1/mcp_exec_pb.js";
import { vendorMcpConnectorById, vendorMcpPluginIdForServerId, vendorMcpServerId } from "./catalog.js";
import {
  appendVendorMcpSigninLog,
  clearVendorMcpCredential,
  loadVendorMcpInstalls,
  setVendorMcpCredential,
  vendorMcpInstallById,
  type VendorMcpCredential,
  type VendorMcpInstall,
} from "./installs.js";
import {
  exchangeVendorMcpCode,
  isVendorMcpGrantFresh,
  refreshVendorMcpGrant,
  startVendorMcpOAuth,
  takeVendorMcpPendingAuth,
} from "./oauth.js";
import { VendorMcpAuthRequiredError, forgetVendorMcpSession, vendorMcpCallTool, vendorMcpListTools } from "./http-mcp-client.js";

export interface VendorMcpListedServer {
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

export interface VendorMcpAuthStatus {
  readonly id: string;
  readonly isAvailable: boolean;
  readonly requiresAuth: boolean;
  readonly hasValidToken: boolean;
  readonly authUrl: string;
  readonly error: string;
}

/** The slice of Cursor's backend exec the manager calls; the fallback is optional per method. */
export interface VendorMcpFallbackBackend {
  listTools?(serverIdentifiers: readonly string[]): Promise<readonly unknown[]>;
  executeTool?(args: unknown): Promise<unknown>;
  checkAuthStatus?(args: unknown): Promise<unknown>;
  completeOAuth?(args: { stateId: string; code: string }): Promise<void>;
  validateTokens?(targets: readonly { serverUrl: string; accountKey: string }[]): Promise<readonly unknown[]>;
  logoutAccount?(args: unknown): Promise<void>;
  renameAccount?(args: unknown): Promise<void>;
  deleteAccount?(args: unknown): Promise<void>;
}

export interface VendorMcpBackendExecOptions {
  readonly rootDir: () => string;
  readonly fallback?: VendorMcpFallbackBackend;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** True on the Mac only: this side may open a sign-in and refresh a token. */
  readonly canStartAuth: boolean;
  /** Called after this side wrote a credential (a finished sign-in, a refresh, a logout). */
  readonly onCredentialChanged?: (pluginId: string) => void;
  /** On the Mac: merges the box's copy of the store in before a read, so a connector the agent installed in the box has a row here (`box-pull.ts`). */
  readonly syncStore?: () => Promise<void>;
  readonly log?: (message: string) => void;
}

const errorLabel = (error: unknown): string => error instanceof Error ? error.message || error.name : String(error);

export function errorResult(message: string): McpResult {
  return new McpResult({ result: { case: "error", value: new McpError({ error: message }) } });
}

export function contentItem(item: Record<string, unknown>): McpToolResultContentItem {
  const text = item.type === "text" && typeof item.text === "string" ? item.text : JSON.stringify(item);
  return new McpToolResultContentItem({ content: { case: "text", value: new McpTextContent({ text }) } });
}

export function createVendorMcpBackendExec(options: VendorMcpBackendExecOptions) {
  const now = options.now ?? (() => Date.now());
  const fetchImpl = options.fetch ?? fetch;
  const log = options.log ?? (() => undefined);
  const fallback = options.fallback ?? {};

  const synced = async (): Promise<void> => {
    try { await options.syncStore?.(); } catch (error) { log(`vendor-mcp store sync skipped: ${errorLabel(error)}`); }
  };
  const installFor = (serverIdentifier: string): VendorMcpInstall | undefined => {
    const connector = vendorMcpConnectorById(serverIdentifier);
    if (connector == null || connector.comingSoon === true) return undefined;
    return vendorMcpInstallById(options.rootDir(), serverIdentifier);
  };
  const installForServerId = (serverId: string | number): VendorMcpInstall | undefined => {
    const pluginId = vendorMcpPluginIdForServerId(serverId);
    return pluginId == null ? undefined : installFor(pluginId);
  };
  const installForUrl = (serverUrl: string): VendorMcpInstall | undefined =>
    loadVendorMcpInstalls(options.rootDir()).find((item) => item.url === serverUrl.trim() && vendorMcpConnectorById(item.id) != null);

  // A credential that is fresh, or refreshed on the Mac when it can be. In
  // the box an expired token reads as needsAuth: the Mac refreshes and sends
  // the store again, and the box never spends the refresh token.
  const usableCredential = async (install: VendorMcpInstall): Promise<VendorMcpCredential | undefined> => {
    const credential = install.credential;
    if (credential == null) return undefined;
    if (isVendorMcpGrantFresh(credential, now())) return credential;
    if (!options.canStartAuth || credential.refreshToken == null) return undefined;
    try {
      const refreshed = await refreshVendorMcpGrant({ grant: credential, fetch: fetchImpl, now: now() });
      forgetVendorMcpSession(install.url, credential.accessToken);
      setVendorMcpCredential(options.rootDir(), install.id, refreshed);
      options.onCredentialChanged?.(install.id);
      return refreshed;
    } catch (error) {
      log(`vendor-mcp refresh failed for ${install.id}: ${errorLabel(error)}`);
      // invalid_grant is final (revoked or spent refresh token): the token is
      // dropped so the auth watch stops re-posting it every 5 s (ledger F-174).
      if (/invalid_grant/i.test(errorLabel(error))) { const { refreshToken: _spent, ...kept } = credential; setVendorMcpCredential(options.rootDir(), install.id, kept); options.onCredentialChanged?.(install.id); }
      return undefined;
    }
  };

  const listVendorServer = async (install: VendorMcpInstall): Promise<VendorMcpListedServer> => {
    const base = { serverIdentifier: install.id, accountLabel: "default" as const, rowServerIdentifier: install.id };
    const credential = await usableCredential(install);
    if (credential == null) return { ...base, status: "needsAuth", tools: [] };
    try {
      const tools = await vendorMcpListTools({ url: install.url, accessToken: credential.accessToken, fetch: fetchImpl });
      return {
        ...base,
        status: "connected",
        tools: tools.map((tool) => ({
          name: tool.name,
          providerIdentifier: install.id,
          toolName: tool.name,
          clientKey: install.id,
          ...(tool.description == null ? {} : { description: tool.description }),
          ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
        })),
      };
    } catch (error) {
      if (error instanceof VendorMcpAuthRequiredError) return { ...base, status: "needsAuth", tools: [] };
      log(`vendor-mcp tools/list failed for ${install.id}: ${errorLabel(error)}`);
      return { ...base, status: "error", tools: [] };
    }
  };

  return {
    async listTools(serverIdentifiers: readonly string[]): Promise<readonly unknown[]> {
      await synced();
      const vendor: VendorMcpInstall[] = [];
      const others: string[] = [];
      for (const identifier of serverIdentifiers) {
        const install = installFor(identifier);
        if (install == null) others.push(identifier); else vendor.push(install);
      }
      const listed = await Promise.all(vendor.map(listVendorServer));
      let rest: readonly unknown[] = [];
      if (others.length > 0 && fallback.listTools != null) {
        try { rest = await fallback.listTools(others); } catch (error) { if (vendor.length === 0) throw error; log(`backend list-tools degraded: ${errorLabel(error)}`); }
      }
      return [...listed, ...rest];
    },

    async executeTool(args: { serverIdentifier: string; toolName: string; args: unknown; toolCallId: string; agentId?: string }): Promise<McpResult | unknown> {
      await synced();
      const install = installFor(args.serverIdentifier);
      if (install == null) {
        if (vendorMcpConnectorById(args.serverIdentifier) != null) return errorResult(`${vendorMcpConnectorById(args.serverIdentifier)?.name ?? args.serverIdentifier} is not installed; install it with InstallPlugin first.`);
        if (fallback.executeTool == null) return errorResult(`MCP server "${args.serverIdentifier}" is not available here.`);
        return fallback.executeTool(args);
      }
      const credential = await usableCredential(install);
      if (credential == null) {
        return errorResult(`${vendorMcpConnectorById(install.id)?.name ?? install.id} needs authentication before "${args.toolName}" can run. Call AuthenticateMcpServer for it; the user signs in from the connect card.`);
      }
      const plain = args.args instanceof Struct ? args.args.toJson() : args.args;
      try {
        const result = await vendorMcpCallTool({ url: install.url, accessToken: credential.accessToken, fetch: fetchImpl, name: args.toolName, arguments: plain });
        return new McpResult({
          result: {
            case: "success",
            value: new McpSuccess({ content: result.content.map(contentItem), isError: result.isError }),
          },
        });
      } catch (error) {
        if (error instanceof VendorMcpAuthRequiredError) {
          return errorResult(`${vendorMcpConnectorById(install.id)?.name ?? install.id} refused the credential (${error.status}). Call AuthenticateMcpServer for it so the user can sign in again.`);
        }
        return errorResult(`"${args.toolName}" on ${install.id} failed: ${errorLabel(error)}`);
      }
    },

    async checkAuthStatus(args: { serverId: string | number; accountKey: string; oauthRedirectUri: string; forceReauth?: boolean }): Promise<VendorMcpAuthStatus | unknown> {
      const id = String(args.serverId);
      const vendorPluginId = vendorMcpPluginIdForServerId(args.serverId);
      if (vendorPluginId == null) {
        if (fallback.checkAuthStatus == null) throw new Error(`MCP server ${id} is not a vendor connector and no backend serves it.`);
        return fallback.checkAuthStatus(args);
      }
      await synced();
      const connector = vendorMcpConnectorById(vendorPluginId);
      if (connector?.comingSoon === true) {
        // The catalogue says why (no self-registered client, an allowlist);
        // the card and the agent get that sentence instead of "not installed".
        if (options.canStartAuth) appendVendorMcpSigninLog(options.rootDir(), `${vendorPluginId} sign-in refused: ${connector.description}`, now);
        return { id, isAvailable: false, requiresAuth: false, hasValidToken: false, authUrl: "", error: connector.description };
      }
      const install = installFor(vendorPluginId);
      if (install == null) return { id, isAvailable: false, requiresAuth: false, hasValidToken: false, authUrl: "", error: `${connector?.name ?? vendorPluginId} is not installed.` };
      const credential = args.forceReauth === true ? undefined : await usableCredential(install);
      if (credential != null) return { id, isAvailable: true, requiresAuth: false, hasValidToken: true, authUrl: "", error: "" };
      if (!options.canStartAuth) {
        // The box cannot open a browser. It reports "sign-in needed" with the
        // vendor's own endpoint as the (never opened) link so the manager
        // draws the connect card and starts its watch; the Mac does the rest
        // and sends the credential over, and the watch sees hasValidToken.
        return { id, isAvailable: true, requiresAuth: true, hasValidToken: false, authUrl: install.url, error: "" };
      }
      try {
        const started = await startVendorMcpOAuth({ pluginId: install.id, mcpUrl: install.url, redirectUri: args.oauthRedirectUri, fetch: fetchImpl, ...(connector?.clientId == null ? {} : { clientId: connector.clientId }) });
        appendVendorMcpSigninLog(options.rootDir(), `${install.id} sign-in started: client=${started.pending.clientId} registered=${connector?.clientId == null ? "dynamically" : "by us"} secret=${started.pending.clientSecret == null ? "no" : "yes"} authorize=${started.authorizationUrl.split("?")[0]}`, now);
        return { id, isAvailable: true, requiresAuth: true, hasValidToken: false, authUrl: started.authorizationUrl, error: "" };
      } catch (error) {
        appendVendorMcpSigninLog(options.rootDir(), `${install.id} sign-in failed to start: ${errorLabel(error)}`, now);
        return { id, isAvailable: false, requiresAuth: false, hasValidToken: false, authUrl: "", error: errorLabel(error) };
      }
    },

    async completeOAuth(args: { stateId: string; code: string }): Promise<void> {
      const pending = takeVendorMcpPendingAuth(args.stateId, now());
      if (pending == null) {
        if (fallback.completeOAuth == null) throw new Error("No pending vendor sign-in matches this callback.");
        return fallback.completeOAuth(args);
      }
      let grant;
      try {
        grant = await exchangeVendorMcpCode({ pending, code: args.code, fetch: fetchImpl, now: now() });
      } catch (error) {
        appendVendorMcpSigninLog(options.rootDir(), `${pending.pluginId} sign-in failed at the token exchange: ${errorLabel(error)}`, now);
        throw error;
      }
      const stored = setVendorMcpCredential(options.rootDir(), pending.pluginId, grant);
      if (stored == null) throw new Error(`${pending.pluginId} is no longer installed; the sign-in was discarded.`);
      appendVendorMcpSigninLog(options.rootDir(), `${pending.pluginId} credential stored (refresh=${grant.refreshToken == null ? "no" : "yes"})`, now);
      log(`vendor-mcp credential stored for ${pending.pluginId}`);
      options.onCredentialChanged?.(pending.pluginId);
    },

    async validateTokens(targets: readonly { serverUrl: string; accountKey: string }[]): Promise<readonly unknown[]> {
      const vendor: unknown[] = [];
      const others: { serverUrl: string; accountKey: string }[] = [];
      for (const target of targets) {
        const install = installForUrl(target.serverUrl);
        if (install == null) { others.push(target); continue; }
        vendor.push({ serverUrl: target.serverUrl, accountKey: target.accountKey, hasValidToken: (await usableCredential(install)) != null });
      }
      let rest: readonly unknown[] = [];
      if (others.length > 0 && fallback.validateTokens != null) { try { rest = await fallback.validateTokens(others); } catch { rest = []; } }
      return [...vendor, ...rest];
    },

    async logoutAccount(args: { serverUrl: string; accountKey: string }): Promise<void> {
      const install = installForUrl(args.serverUrl);
      if (install == null) { await fallback.logoutAccount?.(args); return; }
      if (install.credential != null) forgetVendorMcpSession(install.url, install.credential.accessToken);
      if (clearVendorMcpCredential(options.rootDir(), install.id)) options.onCredentialChanged?.(install.id);
    },

    async renameAccount(args: { serverId: string; accountKey: string; newAccountKey: string }): Promise<void> {
      if (installForServerId(args.serverId) != null) return;
      await fallback.renameAccount?.(args);
    },

    async deleteAccount(args: { serverId: string; accountKey: string }): Promise<void> {
      const install = installForServerId(args.serverId);
      if (install == null) { await fallback.deleteAccount?.(args); return; }
      if (install.credential != null) forgetVendorMcpSession(install.url, install.credential.accessToken);
      if (clearVendorMcpCredential(options.rootDir(), install.id)) options.onCredentialChanged?.(install.id);
    },

    /** For the Mac: the numeric server id a plugin's connect card carries. */
    serverIdForPlugin: (pluginId: string) => vendorMcpServerId(pluginId),
  };
}

export type VendorMcpBackendExec = ReturnType<typeof createVendorMcpBackendExec>;

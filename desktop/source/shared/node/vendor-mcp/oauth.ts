import { createHash, randomBytes } from "node:crypto";

import { MCP_OAUTH_LOOPBACK_CALLBACK_URL } from "../mcp/mcp-oauth-loopback.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

export interface VendorMcpOAuthPending {
  readonly pluginId: string;
  readonly mcpUrl: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly verifier: string;
  readonly redirectUri: string;
  /** The `state` in the authorization URL; the loopback callback carries it back. */
  readonly state: string;
}

// Pending sign-ins by state, for this process. The manager that starts a
// sign-in and the loopback that finishes it are different objects in the
// same Electron main process, so the hand-off is a module-level table with
// the same 15-minute life the loopback gives a pending auth.
export const VENDOR_MCP_PENDING_AUTH_TTL_MS = 15 * 60 * 1_000;
const pendingVendorMcpAuths = new Map<string, { readonly pending: VendorMcpOAuthPending; readonly startedAtMs: number }>();

export function rememberVendorMcpPendingAuth(pending: VendorMcpOAuthPending, now = Date.now()): void {
  for (const [state, entry] of pendingVendorMcpAuths) if (now - entry.startedAtMs > VENDOR_MCP_PENDING_AUTH_TTL_MS) pendingVendorMcpAuths.delete(state);
  pendingVendorMcpAuths.set(pending.state, { pending, startedAtMs: now });
}

export function takeVendorMcpPendingAuth(state: string, now = Date.now()): VendorMcpOAuthPending | undefined {
  const entry = pendingVendorMcpAuths.get(state);
  if (entry == null) return undefined;
  pendingVendorMcpAuths.delete(state);
  return now - entry.startedAtMs > VENDOR_MCP_PENDING_AUTH_TTL_MS ? undefined : entry.pending;
}

export function peekVendorMcpPendingAuth(state: string): VendorMcpOAuthPending | undefined {
  return pendingVendorMcpAuths.get(state)?.pending;
}

export interface VendorMcpOAuthStart {
  readonly authorizationUrl: string;
  readonly pending: VendorMcpOAuthPending;
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    const payload = await readJson(response);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function protectedResourceUrls(mcpUrl: string): string[] {
  const parsed = new URL(mcpUrl);
  const path = parsed.pathname.replace(/\/+$/, "");
  const urls = [`${parsed.origin}/.well-known/oauth-protected-resource`];
  if (path.length > 0) urls.unshift(`${parsed.origin}/.well-known/oauth-protected-resource${path}`);
  return urls;
}

export async function discoverAuthorizationServer(mcpUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  for (const url of protectedResourceUrls(mcpUrl)) {
    const payload = await getJson(url, fetchImpl);
    const servers = payload?.authorization_servers;
    if (Array.isArray(servers) && typeof servers[0] === "string" && servers[0].length > 0) return servers[0];
  }
  throw new Error(`Could not discover sign-in for ${mcpUrl}.`);
}

export async function startVendorMcpOAuth(args: {
  readonly pluginId: string;
  readonly mcpUrl: string;
  readonly redirectUri?: string;
  readonly fetch?: typeof fetch;
  /** False keeps the pending sign-in out of the process table (tests). */
  readonly remember?: boolean;
}): Promise<VendorMcpOAuthStart> {
  const fetchImpl = args.fetch ?? fetch;
  const redirectUri = args.redirectUri ?? MCP_OAUTH_LOOPBACK_CALLBACK_URL;
  const issuer = await discoverAuthorizationServer(args.mcpUrl, fetchImpl);
  const metadataUrl = issuer.endsWith("/")
    ? `${issuer}.well-known/oauth-authorization-server`
    : `${issuer}/.well-known/oauth-authorization-server`;
  const metadata = await getJson(metadataUrl, fetchImpl);
  const authorizationEndpoint = metadata?.authorization_endpoint;
  const tokenEndpoint = metadata?.token_endpoint;
  const registrationEndpoint = metadata?.registration_endpoint;
  if (typeof authorizationEndpoint !== "string" || typeof tokenEndpoint !== "string") {
    throw new Error(`The vendor did not advertise OAuth for ${args.mcpUrl}.`);
  }
  if (typeof registrationEndpoint !== "string") {
    throw new Error(`${args.pluginId} needs an app we register first. It is coming soon.`);
  }
  const registered = await fetchImpl(registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Simeon",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const client = await readJson(registered);
  const clientId = isRecord(client) && typeof client.client_id === "string" ? client.client_id : "";
  if (!registered.ok || clientId.length === 0) {
    throw new Error(`Could not register Simeon with the vendor for ${args.pluginId}.`);
  }
  const { verifier, challenge } = pkce();
  const state = `vendor-${args.pluginId}-${base64Url(randomBytes(16))}`;
  const authorize = new URL(authorizationEndpoint);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  const pending: VendorMcpOAuthPending = {
    pluginId: args.pluginId,
    mcpUrl: args.mcpUrl,
    tokenEndpoint,
    clientId,
    verifier,
    redirectUri,
    state,
  };
  if (args.remember !== false) rememberVendorMcpPendingAuth(pending);
  return { authorizationUrl: authorize.toString(), pending };
}

export interface VendorMcpTokenGrant {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAtMs?: number;
  readonly tokenEndpoint: string;
  readonly clientId: string;
}

async function postTokenForm(tokenEndpoint: string, form: Record<string, string>, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload) || typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    const detail = isRecord(payload) ? String(payload.error_description ?? payload.error ?? response.status) : String(response.status);
    throw new Error(`The vendor refused the token request: ${detail}`);
  }
  return payload;
}

function grantFromPayload(payload: Record<string, unknown>, tokenEndpoint: string, clientId: string, previousRefresh: string | undefined, now: number): VendorMcpTokenGrant {
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : typeof payload.expires_in === "string" ? Number(payload.expires_in) : undefined;
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token.length > 0 ? payload.refresh_token : previousRefresh;
  return {
    accessToken: payload.access_token as string,
    ...(refreshToken == null ? {} : { refreshToken }),
    ...(expiresIn != null && Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAtMs: now + expiresIn * 1_000 } : {}),
    tokenEndpoint,
    clientId,
  };
}

/** The second half of the sign-in: the loopback's code for a bearer token, PKCE verifier attached. */
export async function exchangeVendorMcpCode(args: {
  readonly pending: VendorMcpOAuthPending;
  readonly code: string;
  readonly fetch?: typeof fetch;
  readonly now?: number;
}): Promise<VendorMcpTokenGrant> {
  const payload = await postTokenForm(args.pending.tokenEndpoint, {
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.pending.redirectUri,
    client_id: args.pending.clientId,
    code_verifier: args.pending.verifier,
  }, args.fetch ?? fetch);
  return grantFromPayload(payload, args.pending.tokenEndpoint, args.pending.clientId, undefined, args.now ?? Date.now());
}

export async function refreshVendorMcpGrant(args: {
  readonly grant: VendorMcpTokenGrant;
  readonly fetch?: typeof fetch;
  readonly now?: number;
}): Promise<VendorMcpTokenGrant> {
  if (args.grant.refreshToken == null) throw new Error("The vendor gave no refresh token; sign in again.");
  const payload = await postTokenForm(args.grant.tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: args.grant.refreshToken,
    client_id: args.grant.clientId,
  }, args.fetch ?? fetch);
  return grantFromPayload(payload, args.grant.tokenEndpoint, args.grant.clientId, args.grant.refreshToken, args.now ?? Date.now());
}

export const VENDOR_MCP_TOKEN_SKEW_MS = 60_000;

export function isVendorMcpGrantFresh(grant: { readonly expiresAtMs?: number }, now = Date.now()): boolean {
  return grant.expiresAtMs == null || grant.expiresAtMs - VENDOR_MCP_TOKEN_SKEW_MS > now;
}

export async function connectThroughVendorMcp(args: {
  readonly pluginId: string;
  readonly mcpUrl: string;
  readonly openExternal?: (url: string) => Promise<unknown>;
  readonly fetch?: typeof fetch;
}): Promise<"started" | "already-authenticated"> {
  if (args.openExternal == null) throw new Error("Connecting apps needs the desktop Plugins overlay.");
  const started = await startVendorMcpOAuth({
    pluginId: args.pluginId,
    mcpUrl: args.mcpUrl,
    ...(args.fetch == null ? {} : { fetch: args.fetch }),
  });
  await args.openExternal(started.authorizationUrl);
  return "started";
}

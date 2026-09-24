import { createHash, randomBytes } from "node:crypto";

import { MCP_OAUTH_LOOPBACK_CALLBACK_URL } from "../mcp/mcp-oauth-loopback.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

export interface VendorMcpOAuthPending {
  readonly pluginId: string;
  readonly mcpUrl: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  /** Present when the vendor registered Simeon as a confidential client (`client_secret_post`). */
  readonly clientSecret?: string;
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

export interface VendorMcpProtectedResource {
  readonly issuer: string;
  /** The scopes the resource says it needs (RFC 9728 `scopes_supported`); asked for at authorization. */
  readonly scopes: readonly string[];
}

export async function discoverProtectedResource(mcpUrl: string, fetchImpl: typeof fetch = fetch): Promise<VendorMcpProtectedResource> {
  for (const url of protectedResourceUrls(mcpUrl)) {
    const payload = await getJson(url, fetchImpl);
    const servers = payload?.authorization_servers;
    if (Array.isArray(servers) && typeof servers[0] === "string" && servers[0].length > 0) {
      const scopes = Array.isArray(payload?.scopes_supported) ? payload.scopes_supported.filter((scope): scope is string => typeof scope === "string" && scope.length > 0) : [];
      return { issuer: servers[0], scopes };
    }
  }
  throw new Error(`Could not discover sign-in for ${mcpUrl}.`);
}

export async function discoverAuthorizationServer(mcpUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  return (await discoverProtectedResource(mcpUrl, fetchImpl)).issuer;
}

/**
 * Where an authorization server's metadata lives, in the order tried. RFC
 * 8414 puts the well-known segment between the origin and the issuer's
 * path (`https://airtable.com/.well-known/oauth-authorization-server/oauth2/v1`);
 * many vendors also answer the path-less form; OpenID's document is the
 * last resort. Until 24 September 2026 (evening) only the second form was
 * tried, so Airtable, monday.com and Stripe, whose issuers carry a path,
 * read as "did not advertise OAuth".
 */
export function authorizationServerMetadataUrls(issuer: string): string[] {
  const parsed = new URL(issuer);
  const path = parsed.pathname.replace(/\/+$/, "");
  const origin = parsed.origin;
  const urls: string[] = [];
  if (path.length > 0) urls.push(`${origin}/.well-known/oauth-authorization-server${path}`);
  urls.push(`${origin}${path}/.well-known/oauth-authorization-server`);
  if (path.length > 0) urls.push(`${origin}/.well-known/openid-configuration${path}`);
  urls.push(`${origin}${path}/.well-known/openid-configuration`);
  return urls;
}

async function fetchAuthorizationServerMetadata(issuer: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  for (const url of authorizationServerMetadataUrls(issuer)) {
    const metadata = await getJson(url, fetchImpl);
    if (metadata != null && typeof metadata.authorization_endpoint === "string") return metadata;
  }
  return null;
}

/**
 * The client shape the vendor will register. A public client (`none`, PKCE
 * only) when the vendor allows it; otherwise `client_secret_post`, the
 * secret kept with the credential and sent at the token endpoint (Miro,
 * Vercel, Supabase and monday.com advertise no public clients). A vendor
 * whose metadata names neither needs an app registered by hand.
 */
export function registrationAuthMethod(metadata: Record<string, unknown>): "none" | "client_secret_post" | null {
  const methods = metadata.token_endpoint_auth_methods_supported;
  if (!Array.isArray(methods) || methods.length === 0) return "none";
  if (methods.includes("none")) return "none";
  if (methods.includes("client_secret_post")) return "client_secret_post";
  return null;
}

export async function startVendorMcpOAuth(args: {
  readonly pluginId: string;
  readonly mcpUrl: string;
  readonly redirectUri?: string;
  readonly fetch?: typeof fetch;
  /** False keeps the pending sign-in out of the process table (tests). */
  readonly remember?: boolean;
  /** An app registered by hand in the vendor's console (a public client): no dynamic registration. */
  readonly clientId?: string;
}): Promise<VendorMcpOAuthStart> {
  const fetchImpl = args.fetch ?? fetch;
  const redirectUri = args.redirectUri ?? MCP_OAUTH_LOOPBACK_CALLBACK_URL;
  const resource = await discoverProtectedResource(args.mcpUrl, fetchImpl);
  const metadata = await fetchAuthorizationServerMetadata(resource.issuer, fetchImpl);
  const authorizationEndpoint = metadata?.authorization_endpoint;
  const tokenEndpoint = metadata?.token_endpoint;
  const registrationEndpoint = metadata?.registration_endpoint;
  if (metadata == null || typeof authorizationEndpoint !== "string" || typeof tokenEndpoint !== "string") {
    throw new Error(`The vendor did not advertise OAuth for ${args.mcpUrl}.`);
  }
  if (args.clientId != null && args.clientId.length > 0) {
    return finishStart({ ...args, redirectUri, authorizationEndpoint, tokenEndpoint, clientId: args.clientId, scopes: resource.scopes });
  }
  if (typeof registrationEndpoint !== "string") {
    throw new Error(`${args.pluginId} needs an app we register first. It is coming soon.`);
  }
  const authMethod = registrationAuthMethod(metadata);
  if (authMethod == null) {
    throw new Error(`${args.pluginId} accepts neither a public client nor a client secret at its token endpoint; it needs an app we register first.`);
  }
  const registered = await fetchImpl(registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Simeon",
      client_uri: "https://simeonlabs.com",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: authMethod,
      ...(resource.scopes.length === 0 ? {} : { scope: resource.scopes.join(" ") }),
    }),
  });
  const client = await readJson(registered);
  const clientId = isRecord(client) && typeof client.client_id === "string" ? client.client_id : "";
  const clientSecret = isRecord(client) && typeof client.client_secret === "string" && client.client_secret.length > 0 ? client.client_secret : undefined;
  if (!registered.ok || clientId.length === 0) {
    const detail = isRecord(client) ? String(client.error_description ?? client.error ?? registered.status) : `${registered.status}${typeof client === "string" && client.trim().length > 0 ? ` ${client.trim().slice(0, 120)}` : ""}`;
    throw new Error(`Could not register Simeon with the vendor for ${args.pluginId} (${detail}).`);
  }
  if (authMethod === "client_secret_post" && clientSecret == null) {
    throw new Error(`${args.pluginId} registered Simeon without the client secret its token endpoint requires.`);
  }
  return finishStart({ ...args, redirectUri, authorizationEndpoint, tokenEndpoint, clientId, ...(clientSecret == null ? {} : { clientSecret }), scopes: resource.scopes });
}

function finishStart(args: {
  readonly pluginId: string;
  readonly mcpUrl: string;
  readonly redirectUri: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly scopes: readonly string[];
  readonly remember?: boolean;
}): VendorMcpOAuthStart {
  const { verifier, challenge } = pkce();
  const state = `vendor-${args.pluginId}-${base64Url(randomBytes(16))}`;
  const authorize = new URL(args.authorizationEndpoint);
  authorize.searchParams.set("client_id", args.clientId);
  authorize.searchParams.set("redirect_uri", args.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  if (args.scopes.length > 0) authorize.searchParams.set("scope", args.scopes.join(" "));
  const pending: VendorMcpOAuthPending = {
    pluginId: args.pluginId,
    mcpUrl: args.mcpUrl,
    tokenEndpoint: args.tokenEndpoint,
    clientId: args.clientId,
    ...(args.clientSecret == null ? {} : { clientSecret: args.clientSecret }),
    verifier,
    redirectUri: args.redirectUri,
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
  readonly clientSecret?: string;
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

function grantFromPayload(payload: Record<string, unknown>, tokenEndpoint: string, clientId: string, clientSecret: string | undefined, previousRefresh: string | undefined, now: number): VendorMcpTokenGrant {
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : typeof payload.expires_in === "string" ? Number(payload.expires_in) : undefined;
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token.length > 0 ? payload.refresh_token : previousRefresh;
  return {
    accessToken: payload.access_token as string,
    ...(refreshToken == null ? {} : { refreshToken }),
    ...(expiresIn != null && Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAtMs: now + expiresIn * 1_000 } : {}),
    tokenEndpoint,
    clientId,
    ...(clientSecret == null ? {} : { clientSecret }),
  };
}

/** The second half of the sign-in: the loopback's code for a bearer token, PKCE verifier attached (and the client secret, for a confidential client). */
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
    ...(args.pending.clientSecret == null ? {} : { client_secret: args.pending.clientSecret }),
    code_verifier: args.pending.verifier,
  }, args.fetch ?? fetch);
  return grantFromPayload(payload, args.pending.tokenEndpoint, args.pending.clientId, args.pending.clientSecret, undefined, args.now ?? Date.now());
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
    ...(args.grant.clientSecret == null ? {} : { client_secret: args.grant.clientSecret }),
  }, args.fetch ?? fetch);
  return grantFromPayload(payload, args.grant.tokenEndpoint, args.grant.clientId, args.grant.clientSecret, args.grant.refreshToken, args.now ?? Date.now());
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

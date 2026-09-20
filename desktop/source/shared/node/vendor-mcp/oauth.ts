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
      client_name: "Caisra",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const client = await readJson(registered);
  const clientId = isRecord(client) && typeof client.client_id === "string" ? client.client_id : "";
  if (!registered.ok || clientId.length === 0) {
    throw new Error(`Could not register Caisra with the vendor for ${args.pluginId}.`);
  }
  const { verifier, challenge } = pkce();
  const state = base64Url(randomBytes(16));
  const authorize = new URL(authorizationEndpoint);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  return {
    authorizationUrl: authorize.toString(),
    pending: {
      pluginId: args.pluginId,
      mcpUrl: args.mcpUrl,
      tokenEndpoint,
      clientId,
      verifier,
      redirectUri,
    },
  };
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

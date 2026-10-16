// Shop, Shopify's shopping app (14 October 2026, the founder: "build the
// whole shop integration. make sure its the exact flow as link"). Shop MCP
// (`https://mcp.shop.com/`, launched by Shopify on 13 October 2026) searches
// the Shopify Catalog, opens checkouts with Shopify merchants and, once the
// person connects their Shop account, reads their saved addresses and cards,
// pays a Shopify checkout with Shop Pay, and asks them to approve a one-time
// card for a store that doesn't run on Shopify (a spend request, approved in
// the Shop app, as Link does). This file is the client: one HTTP POST per
// tool call (MCP 2026-07-28, which the vendor connectors' client, still on
// 2025-06-18, can't speak: Shop answers it "Unsupported protocol version"),
// and the person's sign-in with Shop's OAuth device flow, kept on the data
// volume like Link's. `shop-tools.ts` turns the tools into the agents' and
// the checkout card's steps.
//
// What was measured on 14 October 2026, from this computer's network:
// `tools/list` answers 17 tools without a token, the approval tools named
// `*_spend_request` (Shop's docs call them `*_approval`); a search for
// "running shoes" answered in 0.7 s; a checkout made signed out came back
// `requires_escalation` (no contact, no address) with no payment instrument,
// its `continue_url` on shop.app; `accounts.shop.app` publishes the device
// endpoint, refresh tokens and client ID metadata documents. Shop's public
// client (`5c733ab2-…`, the one its CLI signs in with) is "meant for a
// shopper's own agent": an app Simeon Labs registers with Shop replaces it
// with `SIMEON_SHOP_CLIENT_ID`, nothing else changing.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SHOP_MCP_URL = "https://mcp.shop.com/";
/** The resource tokens are asked for, exactly as Shop's protected-resource document writes it (no trailing slash). */
export const SHOP_MCP_RESOURCE = "https://mcp.shop.com";
export const SHOP_MCP_PROTOCOL = "2026-07-28";
export const SHOP_ACCOUNTS_URL = "https://accounts.shop.app";
/** Shop's public client, as its docs and its CLI (`@shopify/shop` 1.1.1) give it. */
export const SHOP_PUBLIC_CLIENT_ID = "5c733ab2-1903-400a-891e-7ba20c09e2a3";
/** The one scope Shop MCP checks for. */
export const SHOP_SCOPE = "personal_agent";
/** How the connection appears in the person's Shop account (1 to 64 characters, no ids or hostnames). */
export const SHOP_DEVICE_NAME = "Simeon";
export const SHOP_CLIENT_INFO = { name: "simeon", version: "1.0.0" } as const;

export const shopDir = (rootDir: string): string => join(rootDir, "shop");
export const shopAuthFile = (rootDir: string): string => join(shopDir(rootDir), "auth.json");
const devicePendingFile = (rootDir: string): string => join(shopDir(rootDir), "device.json");

/** The person's Shop sign-in, kept in a file only this computer's owner reads. */
interface ShopGrant {
  readonly accessToken: string;
  readonly refreshToken?: string;
  /** Unix ms; absent when Shop gave no lifetime. */
  readonly expiresAtMs?: number;
  readonly clientId: string;
}

/** A device sign-in the person hasn't approved yet. */
interface ShopPendingSignIn {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly url: string;
  readonly intervalSeconds: number;
  readonly expiresAtMs: number;
  readonly clientId: string;
  readonly lastPollMs?: number;
}

/**
 * One tool call's answer: the result's `structuredContent` (or its text read
 * as JSON) and Shop's own error code when the tool said `isError`; else why
 * nothing ran (`NOT_AUTHENTICATED`: no sign-in, or Shop refused it).
 */
export type ShopAnswer =
  | { readonly ok: true; readonly value: unknown; readonly text: string; readonly isError: boolean; readonly errorCode?: string; readonly retryAfterSeconds?: number }
  | { readonly ok: false; readonly code: string; readonly message: string };

export interface ShopClientOptions {
  /** The data volume's root (`SAND_DATA_ROOT`). */
  readonly rootDir: () => string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
  /** Each call's limit; Shop's own reads answer in about a second, a checkout's writes in a few. */
  readonly timeoutMs?: number;
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

function writePrivate(file: string, value: unknown): void {
  const dir = join(file, "..");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* best effort */ }
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, file);
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** The JSON-RPC answer in a body that is JSON, or server-sent events whose last `data:` line carries it. */
export function readShopRpcBody(body: string): Record<string, unknown> | undefined {
  const trimmed = body.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { return undefined; }
  }
  let found: Record<string, unknown> | undefined;
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const value = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      if (value != null && typeof value === "object" && ("result" in value || "error" in value)) found = value;
    } catch { /* a line that isn't JSON */ }
  }
  return found;
}

/** A `tools/call` result as the wallet reads it. */
export function readShopToolResult(rpc: Record<string, unknown> | undefined): ShopAnswer {
  if (rpc == null) return { ok: false, code: "SHOP_NO_ANSWER", message: "Shop answered with nothing readable." };
  const error = rpc.error != null && typeof rpc.error === "object" ? rpc.error as Record<string, unknown> : undefined;
  if (error != null) return { ok: false, code: `SHOP_RPC_${text(error.code) || "ERROR"}`, message: text(error.message) || "Shop refused the call." };
  const result = rpc.result != null && typeof rpc.result === "object" ? rpc.result as Record<string, unknown> : {};
  const content = Array.isArray(result.content) ? result.content as Record<string, unknown>[] : [];
  const words = content.map((item) => item?.type === "text" ? text(item.text) : "").filter((line) => line.length > 0).join("\n");
  let value: unknown = result.structuredContent;
  if (value == null && words.startsWith("{")) { try { value = JSON.parse(words) as unknown; } catch { value = undefined; } }
  const meta = result._meta != null && typeof result._meta === "object" ? result._meta as Record<string, unknown> : {};
  const shopError = meta["com.shopify/error"] != null && typeof meta["com.shopify/error"] === "object" ? meta["com.shopify/error"] as Record<string, unknown> : undefined;
  const retry = Number(shopError?.retry_after);
  return {
    ok: true,
    value: value ?? null,
    text: words,
    isError: result.isError === true,
    ...(text(shopError?.code).length > 0 ? { errorCode: text(shopError?.code) } : {}),
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
  };
}

export function createShopClient(options: ShopClientOptions) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const timeoutMs = options.timeoutMs ?? 60_000;
  /** Simeon's own client once Shop registers one; Shop's public client until then. */
  const clientId = (): string => env.SIMEON_SHOP_CLIENT_ID?.trim() || SHOP_PUBLIC_CLIENT_ID;
  let refreshing: Promise<ShopGrant | undefined> | undefined;

  const readGrant = (): ShopGrant | undefined => {
    const record = readJson(shopAuthFile(options.rootDir()));
    const accessToken = text(record?.accessToken);
    if (record == null || accessToken.length === 0) return undefined;
    const expires = Number(record.expiresAtMs);
    return { accessToken, clientId: text(record.clientId) || clientId(), ...(text(record.refreshToken).length > 0 ? { refreshToken: text(record.refreshToken) } : {}), ...(Number.isFinite(expires) && expires > 0 ? { expiresAtMs: expires } : {}) };
  };
  const forgetGrant = (): void => { rmSync(shopAuthFile(options.rootDir()), { force: true }); };
  const grantFrom = (body: Record<string, unknown>, used: string, previous?: ShopGrant): ShopGrant | undefined => {
    const accessToken = text(body.access_token);
    if (accessToken.length === 0) return undefined;
    const seconds = Number(body.expires_in);
    const refreshToken = text(body.refresh_token) || previous?.refreshToken || "";
    return { accessToken, clientId: used, ...(refreshToken.length > 0 ? { refreshToken } : {}), ...(Number.isFinite(seconds) && seconds > 0 ? { expiresAtMs: now() + seconds * 1000 } : {}) };
  };

  const form = async (path: string, fields: Record<string, string>): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> => {
    const response = await fetchImpl(`${SHOP_ACCOUNTS_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text().catch(() => "");
    let body: Record<string, unknown> = {};
    try { const parsed = JSON.parse(raw) as unknown; if (parsed != null && typeof parsed === "object") body = parsed as Record<string, unknown>; } catch { /* not JSON */ }
    return { status: response.status, body };
  };

  /** A fresh token from the refresh token, one refresh at a time; a refusal (`invalid_grant`) ends the sign-in. */
  const refresh = async (grant: ShopGrant): Promise<ShopGrant | undefined> => {
    if (grant.refreshToken == null) return undefined;
    refreshing ??= (async () => {
      try {
        const answer = await form("/oauth/token", { grant_type: "refresh_token", client_id: grant.clientId, refresh_token: grant.refreshToken as string });
        const next = answer.status < 300 ? grantFrom(answer.body, grant.clientId, grant) : undefined;
        if (next != null) { writePrivate(shopAuthFile(options.rootDir()), next); return next; }
        const error = text(answer.body.error);
        log(`[shop] refresh refused: ${error || answer.status}`);
        if (error === "invalid_grant" || error === "invalid_client" || answer.status === 400 || answer.status === 401) forgetGrant();
        return undefined;
      } catch (error) {
        log(`[shop] refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    })().finally(() => { refreshing = undefined; });
    return await refreshing;
  };

  /** The token to send: the stored one, refreshed first when it is about to expire. */
  const token = async (): Promise<ShopGrant | undefined> => {
    const grant = readGrant();
    if (grant == null) return undefined;
    if (grant.expiresAtMs != null && grant.expiresAtMs - 60_000 <= now()) return await refresh(grant) ?? (grant.expiresAtMs > now() ? grant : undefined);
    return grant;
  };

  const post = async (tool: string, args: Record<string, unknown>, bearer: string | undefined): Promise<{ readonly status: number; readonly answer: ShopAnswer; readonly authError?: string }> => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": SHOP_MCP_PROTOCOL,
      "mcp-method": "tools/call",
      "mcp-name": tool,
    };
    if (bearer != null) headers.authorization = `Bearer ${bearer}`;
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: tool,
        arguments: args,
        _meta: { "io.modelcontextprotocol/protocolVersion": SHOP_MCP_PROTOCOL, "io.modelcontextprotocol/clientInfo": SHOP_CLIENT_INFO, "io.modelcontextprotocol/clientCapabilities": {} },
      },
    };
    let response: Response;
    try {
      response = await fetchImpl(SHOP_MCP_URL, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return { status: 0, answer: { ok: false, code: timedOut ? "SHOP_TIMEOUT" : "SHOP_UNREACHABLE", message: timedOut ? "Shop didn't answer in time." : "Shop couldn't be reached." } };
    }
    const raw = await response.text().catch(() => "");
    const challenge = response.headers.get("www-authenticate") ?? "";
    const authError = /error="([^"]+)"/.exec(challenge)?.[1];
    if (response.status === 401) return { status: 401, answer: { ok: false, code: "NOT_AUTHENTICATED", message: "Shop isn't connected." }, ...(authError == null ? {} : { authError }) };
    if (response.status === 403) return { status: 403, answer: { ok: false, code: authError === "insufficient_scope" ? "NOT_AUTHENTICATED" : "SHOP_FORBIDDEN", message: authError === "insufficient_scope" ? "Shop's connection doesn't allow this; connect Shop again." : "Shop refused this request." }, ...(authError == null ? {} : { authError }) };
    if (response.status === 429) return { status: 429, answer: { ok: false, code: "SHOP_RATE_LIMITED", message: "Shop is limiting requests; try again in a minute." } };
    if (response.status >= 500) return { status: response.status, answer: { ok: false, code: "SHOP_UNAVAILABLE", message: `Shop answered ${response.status}; try again later.` } };
    if (response.status >= 400) {
      const rpc = readShopRpcBody(raw);
      const read = readShopToolResult(rpc);
      return { status: response.status, answer: read.ok ? { ok: false, code: `SHOP_HTTP_${response.status}`, message: read.text || `Shop answered ${response.status}.` } : read };
    }
    return { status: response.status, answer: readShopToolResult(readShopRpcBody(raw)) };
  };

  /**
   * Calls one tool. `signedIn: "required"` sends the person's token and
   * answers NOT_AUTHENTICATED without one; "optional" sends it when there is
   * one, and runs the call signed out when Shop refuses an expired one
   * (Shop's docs: a token on a tool that doesn't need it still has to be
   * valid); "never" sends none.
   */
  const call = async (tool: string, args: Record<string, unknown>, signedIn: "required" | "optional" | "never" = "optional"): Promise<ShopAnswer> => {
    const grant = signedIn === "never" ? undefined : await token();
    if (signedIn === "required" && grant == null) return { ok: false, code: "NOT_AUTHENTICATED", message: "Shop isn't connected." };
    const first = await post(tool, args, grant?.accessToken);
    if (first.status !== 401 || grant == null) return first.answer;
    // A refused token: one fresh one, else signed out where the tool allows it.
    const renewed = await refresh(grant);
    if (renewed != null) {
      const again = await post(tool, args, renewed.accessToken);
      if (again.status !== 401) return again.answer;
    }
    if (first.authError === "invalid_token" && renewed == null) { forgetGrant(); log("[shop] the sign-in was refused; signed out"); }
    if (signedIn === "optional") return (await post(tool, args, undefined)).answer;
    return { ok: false, code: "NOT_AUTHENTICATED", message: "Shop isn't connected any more." };
  };

  /** Starts the device sign-in: Shop's page with the code in it, for the apps' sign-in sheet. */
  const startSignIn = async (): Promise<{ readonly url: string; readonly phrase: string } | { readonly error: string }> => {
    const used = clientId();
    let answer: { readonly status: number; readonly body: Record<string, unknown> };
    try {
      answer = await form("/oauth/device", { client_id: used, resource: SHOP_MCP_RESOURCE, scope: SHOP_SCOPE, device_name: SHOP_DEVICE_NAME });
    } catch (error) {
      return { error: `Shop couldn't be reached: ${error instanceof Error ? error.message : String(error)}` };
    }
    const deviceCode = text(answer.body.device_code);
    const complete = text(answer.body.verification_uri_complete);
    const plain = text(answer.body.verification_uri);
    const url = complete.startsWith("https://") ? complete : plain;
    if (answer.status >= 300 || deviceCode.length === 0 || !url.startsWith("https://")) {
      return { error: text(answer.body.error_description) || text(answer.body.error) || `Shop's sign-in didn't start (${answer.status}).` };
    }
    const interval = Number(answer.body.interval);
    const expires = Number(answer.body.expires_in);
    const pending: ShopPendingSignIn = { deviceCode, userCode: text(answer.body.user_code), url, intervalSeconds: Number.isFinite(interval) && interval > 0 ? interval : 5, expiresAtMs: now() + (Number.isFinite(expires) && expires > 0 ? expires : 600) * 1000, clientId: used };
    writePrivate(devicePendingFile(options.rootDir()), pending);
    return { url, phrase: pending.userCode };
  };

  /**
   * Whether the person's Shop is connected. A device sign-in they approved
   * is finished here: its code is traded for the token, at most once per
   * Shop's interval.
   */
  const signInStatus = async (): Promise<{ readonly authenticated: boolean; readonly pending: boolean; readonly error?: string }> => {
    if (await token() != null) return { authenticated: true, pending: false };
    const file = devicePendingFile(options.rootDir());
    const record = readJson(file);
    if (record == null) return { authenticated: false, pending: false };
    const pending = record as unknown as ShopPendingSignIn;
    if (!(Number(pending.expiresAtMs) > now())) { rmSync(file, { force: true }); return { authenticated: false, pending: false, error: "The Shop sign-in expired." }; }
    if (pending.lastPollMs != null && now() - pending.lastPollMs < pending.intervalSeconds * 1000) return { authenticated: false, pending: true };
    writePrivate(file, { ...pending, lastPollMs: now() });
    let answer: { readonly status: number; readonly body: Record<string, unknown> };
    try {
      answer = await form("/oauth/token", { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: pending.clientId, device_code: pending.deviceCode });
    } catch {
      return { authenticated: false, pending: true };
    }
    const grant = grantFrom(answer.body, pending.clientId);
    if (grant != null) {
      writePrivate(shopAuthFile(options.rootDir()), grant);
      rmSync(file, { force: true });
      log("[shop] connected");
      return { authenticated: true, pending: false };
    }
    const error = text(answer.body.error);
    if (error === "authorization_pending") return { authenticated: false, pending: true };
    if (error === "slow_down") { writePrivate(file, { ...pending, lastPollMs: now(), intervalSeconds: pending.intervalSeconds + 5 }); return { authenticated: false, pending: true }; }
    rmSync(file, { force: true });
    return { authenticated: false, pending: false, error: error === "access_denied" ? "The Shop sign-in was declined." : error === "expired_token" ? "The Shop sign-in expired." : `Shop's sign-in ended: ${error || answer.status}.` };
  };

  /** Signs out: the tokens are revoked at Shop (best effort) and forgotten here. */
  const signOut = async (): Promise<void> => {
    const grant = readGrant();
    rmSync(devicePendingFile(options.rootDir()), { force: true });
    if (grant == null) return;
    forgetGrant();
    for (const [value, hint] of [[grant.refreshToken, "refresh_token"], [grant.accessToken, "access_token"]] as const) {
      if (value == null) continue;
      try { await form("/oauth/revoke", { token: value, token_type_hint: hint, client_id: grant.clientId }); } catch { /* the token is forgotten here either way */ }
    }
  };

  return {
    call,
    startSignIn,
    signInStatus,
    signOut,
    /** Whether a sign-in is stored (no call made). */
    hasSignIn: (): boolean => existsSync(shopAuthFile(options.rootDir())),
    clientId,
  };
}

export type ShopClient = ReturnType<typeof createShopClient>;

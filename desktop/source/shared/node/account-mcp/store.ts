// The account's MCP configuration, kept on the Mac (24 September 2026).
// Grok Bot kept this on Cursor's server (GetMcpConfig / SetMcpConfig /
// InstallUserPlugin …); Simeon Labs' server serves none of those and will
// not. So the configuration the renderer edits — custom servers with a `url`
// or a `command`, plus installed plugins, plus the credential a custom URL
// server's sign-in left — is a JSON file beside `vendor-mcp-installs.json`.
//
// Two copies exist: the Mac's and the box's. The person's UI writes on the
// Mac; the agent's AddMcpServer / UninstallMcpServer / plugin tools write in
// the box (product turns run there since 22 September). Each entry carries
// its own `updatedAtMs` and a removal is a tombstone, so when the two copies
// meet (the Mac sends its store with every refresh, the box answers with
// its own) the newer entry wins per name and nothing written on one side is
// lost to a refresh from the other.

import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type McpStdioConfig = { readonly type?: "stdio"; readonly command: string; readonly args?: readonly string[]; readonly env?: Readonly<Record<string, string>>; readonly cwd?: string };
export type McpRemoteConfig = { readonly type?: "http" | "sse"; readonly url: string; readonly headers?: Readonly<Record<string, string>>; readonly auth?: { readonly CLIENT_ID: string; readonly CLIENT_SECRET?: string; readonly scopes?: readonly string[] }; readonly tls?: { readonly caBundle: string } };
export type McpServerConfig = McpStdioConfig | McpRemoteConfig;
export interface McpConfig { readonly mcpServers: Readonly<Record<string, McpServerConfig>> }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

/** One server's config as the renderer and the agent write it; null when the shape is not one of ours. */
export function parseAccountMcpServerConfigValue(value: unknown): McpServerConfig | null {
  if (!isRecord(value)) return null;
  const item = value;
  if (typeof item.command === "string") {
    if (item.type !== undefined && item.type !== "stdio") return null;
    if (item.args !== undefined && (!Array.isArray(item.args) || !item.args.every((arg) => typeof arg === "string"))) return null;
    const env = item.env === undefined ? undefined : stringRecord(item.env);
    if (item.env !== undefined && env === undefined) return null;
    if (item.cwd !== undefined && typeof item.cwd !== "string") return null;
    return { ...(item.type === undefined ? {} : { type: "stdio" as const }), command: item.command, ...(item.args === undefined ? {} : { args: [...item.args] as string[] }), ...(env === undefined ? {} : { env }), ...(item.cwd === undefined ? {} : { cwd: item.cwd as string }) };
  }
  if (typeof item.url !== "string" || item.type !== undefined && item.type !== "http" && item.type !== "sse") return null;
  const headers = item.headers === undefined ? undefined : stringRecord(item.headers);
  if (item.headers !== undefined && headers === undefined) return null;
  let auth: McpRemoteConfig["auth"];
  if (item.auth !== undefined) {
    if (!isRecord(item.auth)) return null;
    const source = item.auth;
    if (typeof source.CLIENT_ID !== "string" || source.CLIENT_SECRET !== undefined && typeof source.CLIENT_SECRET !== "string" || source.scopes !== undefined && (!Array.isArray(source.scopes) || !source.scopes.every((scope) => typeof scope === "string"))) return null;
    auth = { CLIENT_ID: source.CLIENT_ID, ...(source.CLIENT_SECRET === undefined ? {} : { CLIENT_SECRET: source.CLIENT_SECRET as string }), ...(source.scopes === undefined ? {} : { scopes: [...source.scopes] as string[] }) };
  }
  let tls: McpRemoteConfig["tls"];
  if (item.tls !== undefined) {
    if (!isRecord(item.tls)) return null;
    const keys = Object.keys(item.tls);
    const caBundle = item.tls.caBundle;
    if (keys.length !== 1 || typeof caBundle !== "string" || caBundle.trim().length === 0 || caBundle.length > 128 * 1024) return null;
    tls = { caBundle: caBundle.trim() };
  }
  return { ...(item.type === undefined ? {} : { type: item.type as "http" | "sse" }), url: item.url, ...(headers === undefined ? {} : { headers }), ...(auth === undefined ? {} : { auth }), ...(tls === undefined ? {} : { tls }) };
}

/** The bearer a custom URL server's OAuth sign-in left; the same shape as a vendor connector's credential. */
export interface AccountMcpCredential {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAtMs?: number;
  readonly tokenEndpoint: string;
  readonly clientId: string;
}

export interface AccountMcpStoredServer {
  /** A positive decimal string, the id the manager and the renderer address the row by. */
  readonly id: string;
  readonly config: McpServerConfig;
  readonly pluginId?: string;
  readonly updatedAtMs: number;
  readonly deleted?: true;
}

export interface AccountMcpStoredPlugin {
  readonly variables?: Readonly<Record<string, string>>;
  readonly isEnabled: boolean;
  readonly updatedAtMs: number;
  readonly deleted?: true;
}

export interface AccountMcpStoredCredential extends AccountMcpCredential {
  readonly updatedAtMs: number;
  readonly deleted?: true;
}

export interface AccountMcpStore {
  readonly version: 1;
  /** Custom servers by name (the name is the server identifier); a removed one stays as a tombstone. */
  readonly servers: Readonly<Record<string, AccountMcpStoredServer>>;
  /** Installed plugins by decimal plugin id. */
  readonly plugins: Readonly<Record<string, AccountMcpStoredPlugin>>;
  /** Credentials by server id. */
  readonly credentials: Readonly<Record<string, AccountMcpStoredCredential>>;
}

export const ACCOUNT_MCP_STORE_FILENAME = "account-mcp-config.json";
export const EMPTY_ACCOUNT_MCP_STORE: AccountMcpStore = { version: 1, servers: {}, plugins: {}, credentials: {} };

/**
 * Custom server ids live far above anything Cursor's account ever numbered
 * and below the vendor connectors' band (`VENDOR_MCP_SERVER_ID_BASE`,
 * 900,000+), within int32 as `parseInt32McpServerId` demands. They are drawn
 * at random so the Mac and the box, which both allocate, cannot collide.
 */
export const ACCOUNT_MCP_SERVER_ID_MIN = 100_000;
export const ACCOUNT_MCP_SERVER_ID_MAX = 899_999;
const SERVER_ID_PATTERN = /^[1-9]\d*$/;
const PLUGIN_ID_PATTERN = /^\d+$/;

function parseTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseStoredServer(value: unknown): AccountMcpStoredServer | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "number" ? String(value.id) : value.id;
  if (typeof id !== "string" || !SERVER_ID_PATTERN.test(id)) return undefined;
  const updatedAtMs = parseTimestamp(value.updatedAtMs) ?? 0;
  if (value.deleted === true) return { id, config: { url: "" }, updatedAtMs, deleted: true };
  const config = parseAccountMcpServerConfigValue(value.config);
  if (config == null) return undefined;
  const pluginId = typeof value.pluginId === "string" && PLUGIN_ID_PATTERN.test(value.pluginId) ? value.pluginId : undefined;
  return { id, config, ...(pluginId == null ? {} : { pluginId }), updatedAtMs };
}

function parseStoredPlugin(value: unknown): AccountMcpStoredPlugin | undefined {
  if (!isRecord(value)) return undefined;
  const updatedAtMs = parseTimestamp(value.updatedAtMs) ?? 0;
  if (value.deleted === true) return { isEnabled: false, updatedAtMs, deleted: true };
  const variables = value.variables === undefined ? undefined : stringRecord(value.variables);
  return { ...(variables == null || Object.keys(variables).length === 0 ? {} : { variables }), isEnabled: value.isEnabled !== false, updatedAtMs };
}

function parseStoredCredential(value: unknown): AccountMcpStoredCredential | undefined {
  if (!isRecord(value)) return undefined;
  const updatedAtMs = parseTimestamp(value.updatedAtMs) ?? 0;
  if (value.deleted === true) return { accessToken: "", tokenEndpoint: "", clientId: "", updatedAtMs, deleted: true };
  if (typeof value.accessToken !== "string" || value.accessToken.length === 0) return undefined;
  if (typeof value.tokenEndpoint !== "string" || typeof value.clientId !== "string") return undefined;
  return {
    accessToken: value.accessToken,
    ...(typeof value.refreshToken === "string" && value.refreshToken.length > 0 ? { refreshToken: value.refreshToken } : {}),
    ...(parseTimestamp(value.expiresAtMs) === undefined ? {} : { expiresAtMs: value.expiresAtMs as number }),
    tokenEndpoint: value.tokenEndpoint,
    clientId: value.clientId,
    updatedAtMs,
  };
}

function parseTable<T>(value: unknown, keyOk: (key: string) => boolean, parse: (item: unknown) => T | undefined): Record<string, T> {
  const result: Record<string, T> = {};
  if (!isRecord(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (!keyOk(key)) continue;
    const parsed = parse(item);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}

const serverNameOk = (name: string): boolean => name.length > 0 && name !== "__proto__" && name !== "constructor" && name !== "prototype";

/** Whatever was on disk or came over the wire, reduced to the shape above; anything else reads as empty. */
export function parseAccountMcpStore(raw: unknown): AccountMcpStore {
  if (!isRecord(raw)) return EMPTY_ACCOUNT_MCP_STORE;
  return {
    version: 1,
    servers: parseTable(raw.servers, serverNameOk, parseStoredServer),
    plugins: parseTable(raw.plugins, (key) => PLUGIN_ID_PATTERN.test(key), parseStoredPlugin),
    credentials: parseTable(raw.credentials, (key) => SERVER_ID_PATTERN.test(key), parseStoredCredential),
  };
}

export function accountMcpStorePath(rootDir: string): string {
  return join(rootDir, ACCOUNT_MCP_STORE_FILENAME);
}

export function loadAccountMcpStore(rootDir: string): AccountMcpStore {
  const path = accountMcpStorePath(rootDir);
  if (!existsSync(path)) return EMPTY_ACCOUNT_MCP_STORE;
  try {
    return parseAccountMcpStore(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return EMPTY_ACCOUNT_MCP_STORE;
  }
}

export function saveAccountMcpStore(rootDir: string, store: AccountMcpStore): void {
  const path = accountMcpStorePath(rootDir);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  // A custom server's headers and OAuth credential live here: owner-only.
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function mergeTable<T extends { readonly updatedAtMs: number }>(local: Readonly<Record<string, T>>, incoming: Readonly<Record<string, T>>): Record<string, T> {
  const merged: Record<string, T> = { ...local };
  for (const [key, entry] of Object.entries(incoming)) {
    const mine = merged[key];
    // A tie keeps the local copy: the side that holds the file decides.
    if (mine == null || entry.updatedAtMs > mine.updatedAtMs) merged[key] = entry;
  }
  return merged;
}

/** Per entry, the newer write wins; tombstones travel so a removal on one side is not undone by the other. */
export function mergeAccountMcpStores(local: AccountMcpStore, incoming: AccountMcpStore): AccountMcpStore {
  return {
    version: 1,
    servers: mergeTable(local.servers, incoming.servers),
    plugins: mergeTable(local.plugins, incoming.plugins),
    credentials: mergeTable(local.credentials, incoming.credentials),
  };
}

export function accountMcpStoresEqual(a: AccountMcpStore, b: AccountMcpStore): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What either side does with the copy it receives from the other: merge it
 * into its own file. Returns the merged store; `changed` says whether the
 * file moved, so the receiver knows whether to restart its manager.
 */
export function adoptAccountMcpStore(rootDir: string, incoming: unknown): { store: AccountMcpStore; changed: boolean } {
  const local = loadAccountMcpStore(rootDir);
  const merged = mergeAccountMcpStores(local, parseAccountMcpStore(incoming));
  const changed = !accountMcpStoresEqual(local, merged);
  if (changed) saveAccountMcpStore(rootDir, merged);
  return { store: merged, changed };
}

export interface AccountMcpLiveServer {
  readonly name: string;
  readonly id: string;
  readonly config: McpServerConfig;
  readonly pluginId?: string;
  readonly credential?: AccountMcpCredential;
}

function liveCredential(store: AccountMcpStore, id: string): AccountMcpCredential | undefined {
  const credential = store.credentials[id];
  if (credential == null || credential.deleted === true) return undefined;
  const { updatedAtMs: _updatedAtMs, deleted: _deleted, ...grant } = credential;
  return grant;
}

/** The servers that exist (no tombstones), in a stable order by name. */
export function listAccountMcpServers(store: AccountMcpStore): AccountMcpLiveServer[] {
  return Object.entries(store.servers)
    .filter(([, server]) => server.deleted !== true)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, server]) => {
      const credential = liveCredential(store, server.id);
      return { name, id: server.id, config: server.config, ...(server.pluginId == null ? {} : { pluginId: server.pluginId }), ...(credential == null ? {} : { credential }) };
    });
}

export function accountMcpServerByName(store: AccountMcpStore, name: string): AccountMcpLiveServer | undefined {
  return listAccountMcpServers(store).find((server) => server.name === name);
}

export function accountMcpServerById(store: AccountMcpStore, id: string | number): AccountMcpLiveServer | undefined {
  const wanted = String(id).trim();
  return listAccountMcpServers(store).find((server) => server.id === wanted);
}

export function accountMcpServerByUrl(store: AccountMcpStore, url: string): AccountMcpLiveServer | undefined {
  const wanted = url.trim();
  return listAccountMcpServers(store).find((server) => "url" in server.config && server.config.url === wanted);
}

export function listAccountMcpPlugins(store: AccountMcpStore): Array<{ pluginId: string; isEnabled: boolean; variables?: Readonly<Record<string, string>> }> {
  return Object.entries(store.plugins)
    .filter(([, plugin]) => plugin.deleted !== true)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([pluginId, plugin]) => ({ pluginId, isEnabled: plugin.isEnabled, ...(plugin.variables == null ? {} : { variables: plugin.variables }) }));
}

function allocateServerId(store: AccountMcpStore, random: () => number): string {
  const taken = new Set(Object.values(store.servers).map((server) => server.id));
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = String(random());
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Could not allocate an MCP server id.");
}

const defaultRandomId = (): number => randomInt(ACCOUNT_MCP_SERVER_ID_MIN, ACCOUNT_MCP_SERVER_ID_MAX + 1);

/**
 * SetMcpConfig, locally: the whole custom-server map as the manager sends it
 * (existing entries spread with the addition, or minus the removal), with
 * the ids it knows. A name absent from the config is a removal; a name whose
 * config did not change keeps its timestamp so it never out-votes a newer
 * write from the other side.
 */
export function setAccountMcpConfig(
  rootDir: string,
  config: McpConfig,
  serverIdsByName: Readonly<Record<string, bigint | number | string>>,
  options: { readonly now?: number; readonly randomId?: () => number } = {},
): AccountMcpStore {
  const now = options.now ?? Date.now();
  const random = options.randomId ?? defaultRandomId;
  const store = loadAccountMcpStore(rootDir);
  const servers: Record<string, AccountMcpStoredServer> = { ...store.servers };
  for (const [name, rawConfig] of Object.entries(config.mcpServers)) {
    if (!serverNameOk(name)) continue;
    const parsed = parseAccountMcpServerConfigValue(rawConfig);
    if (parsed == null) throw new Error(`MCP server "${name}" has a configuration Simeon cannot read.`);
    const previous = servers[name];
    const knownId = serverIdsByName[name];
    const id = knownId != null && SERVER_ID_PATTERN.test(String(knownId)) ? String(knownId) : previous?.deleted !== true && previous != null ? previous.id : allocateServerId({ ...store, servers }, random);
    const unchanged = previous != null && previous.deleted !== true && previous.id === id && JSON.stringify(previous.config) === JSON.stringify(parsed);
    if (unchanged) continue;
    servers[name] = { id, config: parsed, ...(previous?.pluginId == null || previous.deleted === true ? {} : { pluginId: previous.pluginId }), updatedAtMs: now };
  }
  const credentials: Record<string, AccountMcpStoredCredential> = { ...store.credentials };
  for (const [name, previous] of Object.entries(store.servers)) {
    if (previous.deleted === true || name in config.mcpServers) continue;
    servers[name] = { id: previous.id, config: previous.config, updatedAtMs: now, deleted: true };
    const credential = credentials[previous.id];
    if (credential != null && credential.deleted !== true) credentials[previous.id] = { ...credential, updatedAtMs: now, deleted: true };
  }
  const next: AccountMcpStore = { version: 1, servers, plugins: store.plugins, credentials };
  saveAccountMcpStore(rootDir, next);
  return next;
}

export function installAccountMcpPlugin(rootDir: string, pluginId: string, variables: Readonly<Record<string, string>> | undefined, now = Date.now()): AccountMcpStore {
  const store = loadAccountMcpStore(rootDir);
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error(`Invalid plugin id "${pluginId}".`);
  const previous = store.plugins[pluginId];
  const merged = { ...(previous?.deleted === true ? {} : previous?.variables ?? {}), ...(variables ?? {}) };
  const next: AccountMcpStore = {
    ...store,
    plugins: { ...store.plugins, [pluginId]: { ...(Object.keys(merged).length === 0 ? {} : { variables: merged }), isEnabled: true, updatedAtMs: now } },
  };
  saveAccountMcpStore(rootDir, next);
  return next;
}

export function updateAccountMcpPluginInstall(rootDir: string, pluginId: string, variables: Readonly<Record<string, string>>, now = Date.now()): AccountMcpStore {
  const store = loadAccountMcpStore(rootDir);
  const previous = store.plugins[pluginId];
  if (previous == null || previous.deleted === true) throw new Error(`Plugin ${pluginId} is not installed.`);
  const next: AccountMcpStore = {
    ...store,
    plugins: { ...store.plugins, [pluginId]: { ...(Object.keys(variables).length === 0 ? {} : { variables: { ...variables } }), isEnabled: previous.isEnabled, updatedAtMs: now } },
  };
  saveAccountMcpStore(rootDir, next);
  return next;
}

/** Removes the plugin record and every server attributed to it (with their credentials). */
export function uninstallAccountMcpPlugin(rootDir: string, pluginId: string, now = Date.now()): { store: AccountMcpStore; removed: boolean } {
  const store = loadAccountMcpStore(rootDir);
  const previous = store.plugins[pluginId];
  const attributed = Object.entries(store.servers).filter(([, server]) => server.deleted !== true && server.pluginId === pluginId);
  if ((previous == null || previous.deleted === true) && attributed.length === 0) return { store, removed: false };
  const servers: Record<string, AccountMcpStoredServer> = { ...store.servers };
  const credentials: Record<string, AccountMcpStoredCredential> = { ...store.credentials };
  for (const [name, server] of attributed) {
    servers[name] = { id: server.id, config: server.config, updatedAtMs: now, deleted: true };
    const credential = credentials[server.id];
    if (credential != null && credential.deleted !== true) credentials[server.id] = { ...credential, updatedAtMs: now, deleted: true };
  }
  const next: AccountMcpStore = {
    version: 1,
    servers,
    plugins: { ...store.plugins, [pluginId]: { isEnabled: false, updatedAtMs: now, deleted: true } },
    credentials,
  };
  saveAccountMcpStore(rootDir, next);
  return { store: next, removed: true };
}

export function setAccountMcpCredential(rootDir: string, serverId: string, credential: AccountMcpCredential, now = Date.now()): AccountMcpLiveServer | undefined {
  const store = loadAccountMcpStore(rootDir);
  const server = accountMcpServerById(store, serverId);
  if (server == null) return undefined;
  const next: AccountMcpStore = { ...store, credentials: { ...store.credentials, [server.id]: { ...credential, updatedAtMs: now } } };
  saveAccountMcpStore(rootDir, next);
  return { ...server, credential };
}

export function clearAccountMcpCredential(rootDir: string, serverId: string, now = Date.now()): boolean {
  const store = loadAccountMcpStore(rootDir);
  const current = store.credentials[serverId];
  if (current == null || current.deleted === true) return false;
  const next: AccountMcpStore = { ...store, credentials: { ...store.credentials, [serverId]: { ...current, updatedAtMs: now, deleted: true } } };
  saveAccountMcpStore(rootDir, next);
  return true;
}

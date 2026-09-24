import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * What the vendor's sign-in left us (24 September 2026): a bearer token for
 * the MCP endpoint, the refresh token when the vendor gave one, and the two
 * things a refresh needs. The Mac is the only writer of a credential; the
 * host in the box receives a copy through the settings sync and never
 * refreshes it itself, so a rotating refresh token is used by one party.
 */
export interface VendorMcpCredential {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAtMs?: number;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  /** Only for a vendor that registered Simeon as a confidential client; sent with each token request. */
  readonly clientSecret?: string;
}

export interface VendorMcpInstall {
  readonly id: string;
  readonly url: string;
  /** True once a credential is held; kept as a field so old files still read. */
  readonly connected: boolean;
  readonly credential?: VendorMcpCredential;
  /** When this install was recorded; a row from before 24 September 2026 (evening) has none and reads as 0. */
  readonly installedAtMs?: number;
}

/**
 * The store travels both ways since 24 September 2026 (evening). The agent's
 * InstallPlugin and UninstallPlugin run in the box, so the box's copy is
 * where those writes land; the Mac's copy is where credentials are written.
 * Until then the Mac sent its whole file on every refresh and the box wrote
 * it over its own, so a connector the agent installed was wiped by the next
 * refresh and its connect card, answered on the Mac, found no row ("Figma is
 * not installed" → retry). Now each side merges the other's copy: per
 * connector the newest event wins, an install (`installedAtMs`) or a
 * removal (a tombstone, `removedAtMs`), and on a tie the side named as
 * authority. The Mac is the authority for credentials: when both sides hold
 * the same install, the box takes the Mac's row.
 */
export interface VendorMcpTombstone {
  readonly id: string;
  readonly removedAtMs: number;
}

export interface VendorMcpStore {
  readonly installs: VendorMcpInstall[];
  readonly removed: VendorMcpTombstone[];
}

function parseCredential(value: unknown): VendorMcpCredential | undefined {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.accessToken !== "string" || row.accessToken.length === 0) return undefined;
  if (typeof row.tokenEndpoint !== "string" || typeof row.clientId !== "string") return undefined;
  return {
    accessToken: row.accessToken,
    ...(typeof row.refreshToken === "string" && row.refreshToken.length > 0 ? { refreshToken: row.refreshToken } : {}),
    ...(typeof row.expiresAtMs === "number" && Number.isFinite(row.expiresAtMs) ? { expiresAtMs: row.expiresAtMs } : {}),
    tokenEndpoint: row.tokenEndpoint,
    clientId: row.clientId,
    ...(typeof row.clientSecret === "string" && row.clientSecret.length > 0 ? { clientSecret: row.clientSecret } : {}),
  };
}

/**
 * The Mac's record of every sign-in start and finish, `vendor-mcp-signin.log`
 * beside the store. The connect card shows "retry" whatever the reason;
 * until 24 September 2026 (evening) the reason went to the Electron
 * process's stdout, which nobody sees when the app is opened from the
 * Dock. One line per event, newest last.
 */
export function vendorMcpSigninLogPath(rootDir: string): string {
  return join(rootDir, "vendor-mcp-signin.log");
}

export function appendVendorMcpSigninLog(rootDir: string, line: string, now: () => number = Date.now): void {
  try {
    mkdirSync(rootDir, { recursive: true });
    appendFileSync(vendorMcpSigninLogPath(rootDir), `${new Date(now()).toISOString()} ${line.replace(/\s+/g, " ").trim()}\n`, "utf8");
  } catch {
    // The log is a courtesy; a full disk must not stop a sign-in.
  }
}

/** The file's rows: installs (id and url) and tombstones (id and removedAtMs, no url). Anything else is dropped. */
export function parseVendorMcpStore(parsed: unknown): VendorMcpStore {
  const installs: VendorMcpInstall[] = [];
  const removed: VendorMcpTombstone[] = [];
  if (!Array.isArray(parsed)) return { installs, removed };
  for (const item of parsed) {
    if (typeof item !== "object" || item == null || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string") continue;
    if (typeof row.url === "string") {
      const credential = parseCredential(row.credential);
      installs.push({
        id: row.id,
        url: row.url,
        connected: row.connected === true || credential != null,
        ...(credential == null ? {} : { credential }),
        ...(typeof row.installedAtMs === "number" && Number.isFinite(row.installedAtMs) ? { installedAtMs: row.installedAtMs } : {}),
      });
    } else if (typeof row.removedAtMs === "number" && Number.isFinite(row.removedAtMs)) {
      removed.push({ id: row.id, removedAtMs: row.removedAtMs });
    }
  }
  return { installs, removed };
}

export function parseVendorMcpInstalls(parsed: unknown): VendorMcpInstall[] {
  return parseVendorMcpStore(parsed).installs;
}

export function vendorMcpInstallsPath(rootDir: string): string {
  return join(rootDir, "vendor-mcp-installs.json");
}

export function loadVendorMcpStore(rootDir: string): VendorMcpStore {
  const path = vendorMcpInstallsPath(rootDir);
  if (!existsSync(path)) return { installs: [], removed: [] };
  try {
    return parseVendorMcpStore(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return { installs: [], removed: [] };
  }
}

export function loadVendorMcpInstalls(rootDir: string): VendorMcpInstall[] {
  return loadVendorMcpStore(rootDir).installs;
}

/** The rows as the file holds them and as one side sends them to the other. */
export function serializeVendorMcpStore(store: VendorMcpStore): unknown[] {
  return [...store.installs, ...store.removed];
}

export function saveVendorMcpStore(rootDir: string, store: VendorMcpStore): void {
  const path = vendorMcpInstallsPath(rootDir);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(serializeVendorMcpStore(store), null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

/** Writes the installs; the file's tombstones are kept, except for connectors now installed. */
export function saveVendorMcpInstalls(rootDir: string, installs: readonly VendorMcpInstall[]): void {
  const ids = new Set(installs.map((item) => item.id));
  const removed = loadVendorMcpStore(rootDir).removed.filter((item) => !ids.has(item.id));
  saveVendorMcpStore(rootDir, { installs: [...installs], removed });
}

/** Records an install; an existing credential survives a re-install, so "Connect" twice does not sign the person out. */
export function upsertVendorMcpInstall(rootDir: string, install: VendorMcpInstall, now: () => number = Date.now): VendorMcpInstall[] {
  const current = loadVendorMcpInstalls(rootDir);
  const previous = current.find((item) => item.id === install.id);
  const credential = install.credential ?? previous?.credential;
  const next = current.filter((item) => item.id !== install.id);
  next.push({
    id: install.id,
    url: install.url,
    connected: install.connected || credential != null,
    ...(credential == null ? {} : { credential }),
    installedAtMs: Math.max(install.installedAtMs ?? 0, previous?.installedAtMs ?? 0, now()),
  });
  saveVendorMcpInstalls(rootDir, next);
  return next;
}

type VendorMcpEvent =
  | { readonly kind: "install"; readonly at: number; readonly row: VendorMcpInstall }
  | { readonly kind: "removed"; readonly at: number; readonly row: VendorMcpTombstone };

function eventsOf(store: VendorMcpStore): Map<string, VendorMcpEvent> {
  const events = new Map<string, VendorMcpEvent>();
  for (const row of store.installs) events.set(row.id, { kind: "install", at: row.installedAtMs ?? 0, row });
  for (const row of store.removed) {
    const current = events.get(row.id);
    if (current == null || row.removedAtMs > current.at) events.set(row.id, { kind: "removed", at: row.removedAtMs, row });
  }
  return events;
}

/**
 * Per connector the newest event wins; on a tie the authority's. When both
 * sides hold an install, the authority's row is taken whole (its credential
 * included, or its lack of one) with the later of the two install times.
 */
export function mergeVendorMcpStores(local: VendorMcpStore, incoming: VendorMcpStore, authority: "local" | "incoming"): VendorMcpStore {
  const mine = eventsOf(local);
  const theirs = eventsOf(incoming);
  const installs: VendorMcpInstall[] = [];
  const removed: VendorMcpTombstone[] = [];
  for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
    const a = mine.get(id);
    const b = theirs.get(id);
    const preferred = authority === "local" ? a : b;
    const other = authority === "local" ? b : a;
    const winner = preferred == null ? other! : other == null ? preferred : other.at > preferred.at ? other : preferred;
    if (winner.kind === "removed") { removed.push(winner.row); continue; }
    const loser = winner === preferred ? other : preferred;
    if (loser != null && loser.kind === "install") {
      installs.push({ ...winner.row, installedAtMs: Math.max(winner.at, loser.at) });
    } else {
      installs.push(winner.row);
    }
  }
  return { installs, removed };
}

function storesEqual(a: VendorMcpStore, b: VendorMcpStore): boolean {
  return JSON.stringify(serializeVendorMcpStore(a)) === JSON.stringify(serializeVendorMcpStore(b));
}

/** Merges the other side's rows into this side's file; `authority` is which side wins a tie and a shared install. */
export function adoptVendorMcpStore(rootDir: string, incoming: unknown, authority: "local" | "incoming"): { readonly store: VendorMcpStore; readonly changed: boolean } {
  const local = loadVendorMcpStore(rootDir);
  const merged = mergeVendorMcpStores(local, parseVendorMcpStore(incoming), authority);
  const changed = !storesEqual(local, merged);
  if (changed) saveVendorMcpStore(rootDir, merged);
  return { store: merged, changed };
}

export function vendorMcpInstallById(rootDir: string, id: string): VendorMcpInstall | undefined {
  return loadVendorMcpInstalls(rootDir).find((item) => item.id === id);
}

export function setVendorMcpCredential(rootDir: string, id: string, credential: VendorMcpCredential): VendorMcpInstall | undefined {
  const current = vendorMcpInstallById(rootDir, id);
  if (current == null) return undefined;
  // A finished sign-in keeps the install time: it is not a re-install, and
  // the merge orders installs and removals by that time.
  const next: VendorMcpInstall = { id, url: current.url, connected: true, credential, ...(current.installedAtMs == null ? {} : { installedAtMs: current.installedAtMs }) };
  saveVendorMcpInstalls(rootDir, [...loadVendorMcpInstalls(rootDir).filter((item) => item.id !== id), next]);
  return next;
}

export function clearVendorMcpCredential(rootDir: string, id: string): boolean {
  const current = vendorMcpInstallById(rootDir, id);
  if (current?.credential == null) return false;
  const next = loadVendorMcpInstalls(rootDir).filter((item) => item.id !== id);
  // The install time is kept: a logout is not a re-install, and the merge
  // must not read the row as older than the box's copy of it.
  next.push({ id, url: current.url, connected: false, ...(current.installedAtMs == null ? {} : { installedAtMs: current.installedAtMs }) });
  saveVendorMcpInstalls(rootDir, next);
  return true;
}

/** The whole store as the Mac sends it to the host, and as the host writes it. */
export function replaceVendorMcpInstalls(rootDir: string, installs: unknown): VendorMcpInstall[] {
  const parsed = parseVendorMcpInstalls(installs);
  saveVendorMcpInstalls(rootDir, parsed);
  return parsed;
}

/** Removes an install and leaves a tombstone, so the other side's copy does not bring it back. */
export function removeVendorMcpInstall(rootDir: string, id: string, now: () => number = Date.now): boolean {
  const current = loadVendorMcpStore(rootDir);
  const installs = current.installs.filter((item) => item.id !== id);
  if (installs.length === current.installs.length) return false;
  const removed = [...current.removed.filter((item) => item.id !== id), { id, removedAtMs: now() }];
  saveVendorMcpStore(rootDir, { installs, removed });
  return true;
}

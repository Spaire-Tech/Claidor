/**
 * Memory backed up to Simeon Labs' server (25 September 2026,
 * `docs/product/memory-sync-served.md`).
 *
 * The server has served `POST /desktop/api/memory/sync` and
 * `GET /desktop/api/memory` since 11 September (`server/polar/desktop/`),
 * with a per-file version and a merge that is the server's alone; the maty
 * runner already lays a job's memory out from them (`runner/src/memory.ts`).
 * Nothing on the app side ever called them. This is that client: it reads
 * the memory files the host already writes under the sand root
 * (`memory-service.ts`: `agents/<id>/memory/profile.md`, `log/YYYY-MM.md`,
 * the `user-memory/` and `projects/` shards, `projects/<slug>/project.md`),
 * sends the ones that changed since the last round with the version they
 * started from, writes back what the server answers, removes what another
 * machine deleted, and keeps `<sandRoot>/.memory-sync/state.json` (name →
 * version, content hash) so the next round knows what moved.
 *
 * The names it syncs are exactly the shapes the server accepts
 * (`memory_merge.py`, `_APP_NAMES`); `.dreaming/` metadata, transcripts,
 * attachments and everything else under the sand root never leave the box.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";

export const MEMORY_SYNC_STATE_DIRNAME = ".memory-sync";
export const MEMORY_SYNC_STATE_FILENAME = "state.json";
export const MEMORY_SYNC_PATH = "/desktop/api/memory/sync";
export const MEMORY_LIST_PATH = "/desktop/api/memory";
/** One file over this is refused by the server (`MEMORY_FILE_MAX_BYTES`). */
export const MEMORY_SYNC_FILE_MAX_BYTES = 1024 * 1024;

// The server's `_APP_NAMES` and the three names the runner keeps, as one
// predicate. A folder is `isSafeFolderId` narrowed to what the file system
// and a URL both take, with no leading dot, so `.dreaming` matches nothing.
const FOLDER = "[A-Za-z0-9][A-Za-z0-9._-]{0,127}";
const MONTH = "\\d{4}-\\d{2}";
const SYNCED_NAMES: readonly RegExp[] = [
  /^MEMORY\.md$/,
  /^USER\.md$/,
  /^memory\/\d{4}-\d{2}-\d{2}\.md$/,
  new RegExp(`^agents/${FOLDER}/memory/profile\\.md$`),
  new RegExp(`^agents/${FOLDER}/memory/log/${MONTH}\\.md$`),
  new RegExp(`^user-memory/agents/${FOLDER}/profile\\.md$`),
  new RegExp(`^user-memory/agents/${FOLDER}/log/${MONTH}\\.md$`),
  new RegExp(`^projects/${FOLDER}/memory/agents/${FOLDER}/profile\\.md$`),
  new RegExp(`^projects/${FOLDER}/memory/agents/${FOLDER}/log/${MONTH}\\.md$`),
  new RegExp(`^projects/${FOLDER}/project\\.md$`)
];

/** Whether a sand-root-relative name (with `/`) is one the server keeps. */
export function isSyncedMemoryName(name: string): boolean {
  if (name.length === 0 || name.length > 200 || name.includes("\n") || name.includes("\0")) return false;
  return SYNCED_NAMES.some((pattern) => pattern.test(name));
}

/** The subtrees of the sand root that hold memory, and are watched. */
export const MEMORY_SYNC_ROOTS = ["agents", "user-memory", "projects"] as const;

export interface MemorySyncFileState { readonly version: number; readonly hash: string }
export interface MemorySyncState { readonly version: 1; readonly files: Record<string, MemorySyncFileState> }

export function contentHash(content: string): string { return createHash("sha1").update(content, "utf8").digest("hex"); }

export function memorySyncStatePath(sandRoot: string): string { return join(sandRoot, MEMORY_SYNC_STATE_DIRNAME, MEMORY_SYNC_STATE_FILENAME); }

export function readMemorySyncState(sandRoot: string): MemorySyncState {
  try {
    const parsed = JSON.parse(readFileSync(memorySyncStatePath(sandRoot), "utf8")) as { version?: unknown; files?: unknown };
    if (parsed.version !== 1 || typeof parsed.files !== "object" || parsed.files == null) return { version: 1, files: {} };
    const files: Record<string, MemorySyncFileState> = {};
    for (const [name, entry] of Object.entries(parsed.files as Record<string, { version?: unknown; hash?: unknown }>)) {
      if (typeof entry?.version === "number" && typeof entry.hash === "string" && isSyncedMemoryName(name)) files[name] = { version: entry.version, hash: entry.hash };
    }
    return { version: 1, files };
  } catch { return { version: 1, files: {} }; }
}

export function writeMemorySyncState(sandRoot: string, state: MemorySyncState): void { writeAtomic(memorySyncStatePath(sandRoot), `${JSON.stringify(state, null, 2)}\n`); }

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, content, "utf8");
  renameSync(temp, path);
}

/** Every synced memory file under the sand root, name → content. */
export function scanMemoryFiles(sandRoot: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > 6) return;
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const name = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) { walk(join(dir, entry.name), name, depth + 1); continue; }
      if (!entry.isFile() || !isSyncedMemoryName(name)) continue;
      try { found.set(name, readFileSync(join(dir, entry.name), "utf8")); } catch {}
    }
  };
  for (const root of MEMORY_SYNC_ROOTS) walk(join(sandRoot, root), root, 0);
  return found;
}

function localPath(sandRoot: string, name: string): string { return join(sandRoot, ...name.split("/")); }
function readIfPresent(path: string): string | null { try { return readFileSync(path, "utf8"); } catch { return null; } }

export interface MemorySyncOutcome {
  readonly kind: "synced" | "nothing-to-do" | "refused" | "failed" | "no-credential";
  readonly pushed: number;
  readonly pulled: number;
  readonly deleted: number;
  readonly reason?: string;
}

export interface MemorySyncClientDeps {
  readonly sandRoot: string;
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (line: string) => void;
}

interface SyncedFileRow { name: string; content: string; version: number; changed: boolean }

/**
 * One client, one sand root. `syncNow` is one round and never runs twice
 * at once: a request during a round runs one more round after it.
 */
export class MemorySyncClient {
  private inFlight: Promise<MemorySyncOutcome> | null = null;
  private again = false;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;
  constructor(private readonly deps: MemorySyncClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.log = deps.log ?? logHostLine;
  }

  /** A round, or the one already running plus one more after it. */
  syncNow(options: { readonly pullEvenIfNothingChanged?: boolean } = {}): Promise<MemorySyncOutcome> {
    if (this.inFlight != null) { this.again = true; return this.inFlight; }
    this.inFlight = this.round(options).finally(() => {
      this.inFlight = null;
      if (this.again) { this.again = false; void this.syncNow(); }
    });
    return this.inFlight;
  }

  /** What the server holds, without the text: names, versions, sizes. */
  async list(): Promise<Array<{ name: string; version: number; size: number }> | null> {
    const backendUrl = this.deps.getBackendUrl();
    const token = await this.token(backendUrl);
    if (token == null) return null;
    const response = await this.fetchImpl(new URL(MEMORY_LIST_PATH, backendUrl).toString(), { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (!response.ok) throw new Error(`GET ${MEMORY_LIST_PATH} answered ${response.status}`);
    const body = (await response.json()) as { files?: Array<{ name: string; version: number; size: number }> };
    return Array.isArray(body.files) ? body.files : [];
  }

  private async token(backendUrl: string): Promise<string | null> {
    try { const token = await this.deps.getAccessToken({ backendUrl }); return token.length > 0 ? token : null; } catch { return null; }
  }

  private async round(options: { readonly pullEvenIfNothingChanged?: boolean }): Promise<MemorySyncOutcome> {
    const { sandRoot } = this.deps;
    const state = readMemorySyncState(sandRoot);
    const local = scanMemoryFiles(sandRoot);
    const files: Array<{ name: string; content: string; base_version: number }> = [];
    const skipped: string[] = [];
    for (const [name, content] of [...local].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const known = state.files[name];
      if (known != null && known.hash === contentHash(content)) continue;
      if (Buffer.byteLength(content, "utf8") > MEMORY_SYNC_FILE_MAX_BYTES) { skipped.push(name); continue; }
      files.push({ name, content, base_version: known?.version ?? 0 });
    }
    const deleted = Object.keys(state.files).filter((name) => !local.has(name)).sort();
    if (files.length === 0 && deleted.length === 0 && options.pullEvenIfNothingChanged !== true) return { kind: "nothing-to-do", pushed: 0, pulled: 0, deleted: 0 };
    if (skipped.length > 0) this.log(`${HOST_LOG_PREFIX} memory-sync skipped ${skipped.length} file(s) over ${MEMORY_SYNC_FILE_MAX_BYTES / 1024} KB: ${clipForHostLog(skipped.join(", "))}`);

    const backendUrl = this.deps.getBackendUrl();
    const token = await this.token(backendUrl);
    if (token == null) { this.log(`${HOST_LOG_PREFIX} memory-sync skipped: no credential for ${backendUrl}`); return { kind: "no-credential", pushed: 0, pulled: 0, deleted: 0 }; }

    let response: Response;
    try {
      response = await this.fetchImpl(new URL(MEMORY_SYNC_PATH, backendUrl).toString(), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ files, deleted })
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log(`${HOST_LOG_PREFIX} memory-sync failed ${clipForHostLog(reason)}`);
      return { kind: "failed", pushed: 0, pulled: 0, deleted: 0, reason };
    }
    if (!response.ok) {
      let sentence = `${response.status}`;
      try { const body = (await response.json()) as { message?: unknown; detail?: unknown }; if (typeof body.message === "string") sentence = `${response.status} ${body.message}`; else if (typeof body.detail === "string") sentence = `${response.status} ${body.detail}`; } catch {}
      this.log(`${HOST_LOG_PREFIX} memory-sync refused ${clipForHostLog(sentence)}`);
      return { kind: "refused", pushed: 0, pulled: 0, deleted: 0, reason: sentence };
    }
    const body = (await response.json()) as { files?: SyncedFileRow[]; deleted?: string[] };
    const answered = Array.isArray(body.files) ? body.files : [];
    const gone = Array.isArray(body.deleted) ? body.deleted : [];

    const next: Record<string, MemorySyncFileState> = {};
    let pulled = 0;
    const versions: string[] = [];
    const movedUnderneath: string[] = [];
    for (const row of answered) {
      if (typeof row.name !== "string" || typeof row.content !== "string" || typeof row.version !== "number" || !isSyncedMemoryName(row.name)) continue;
      const path = localPath(sandRoot, row.name);
      if (local.get(row.name) !== row.content) {
        // The file may have been written again while the request was out
        // (a turn's addMemory, the agent's shell). What we sent is what
        // we may overwrite; anything newer stays and goes up next round.
        if (readIfPresent(path) !== (local.get(row.name) ?? null)) { movedUnderneath.push(row.name); continue; }
        writeAtomic(path, row.content);
        pulled += 1;
      }
      next[row.name] = { version: row.version, hash: contentHash(row.content) };
      if (files.some((file) => file.name === row.name) || local.get(row.name) !== row.content) versions.push(`${row.name}@${row.version}`);
    }
    let removed = 0;
    for (const name of gone) {
      if (typeof name !== "string" || !isSyncedMemoryName(name)) continue;
      delete next[name];
      const path = localPath(sandRoot, name);
      if (existsSync(path) && statSync(path).isFile()) { rmSync(path, { force: true }); removed += 1; }
    }
    writeMemorySyncState(sandRoot, { version: 1, files: next });
    if (movedUnderneath.length > 0) { this.again = true; this.log(`${HOST_LOG_PREFIX} memory-sync ${movedUnderneath.length} file(s) changed during the round, kept and re-sent: ${clipForHostLog(movedUnderneath.join(", "))}`); }
    this.log(`${HOST_LOG_PREFIX} memory-sync pushed=${files.length} pulled=${pulled} deleted=${removed}${deleted.length > 0 ? ` told-deleted=${deleted.length}` : ""} held=${answered.length}${versions.length > 0 ? ` versions=${clipForHostLog(versions.join(" "), 300)}` : ""}`);
    return { kind: "synced", pushed: files.length, pulled, deleted: removed };
  }
}

/** The path separator-independent name of a file under the sand root, or null. */
export function memoryNameOf(sandRoot: string, absolutePath: string): string | null {
  if (!absolutePath.startsWith(sandRoot + sep)) return null;
  const name = absolutePath.slice(sandRoot.length + 1).split(sep).join("/");
  return isSyncedMemoryName(name) ? name : null;
}

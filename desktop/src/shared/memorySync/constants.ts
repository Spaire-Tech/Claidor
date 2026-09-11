/**
 * The shared memory bundle.
 *
 * The engine keeps its memory as text files in the main agent's workspace.
 * Claidor keeps the shared copy so that a person with two computers — and
 * later the cloud engine — has one assistant instead of several strangers.
 *
 * Contract of record: `docs/maties/cloud.md`, section 3, « The wire, exactly ».
 * Change that note before changing anything here.
 */

/** `POST` under the account protocol base URL (`.../desktop`). */
export const MEMORY_SYNC_ROUTE = '/api/memory/sync';

/**
 * The workspace files that sync, and only these.
 *
 * `IDENTITY.md`, `SOUL.md` and `AGENTS.md` are the app's own: it owns them,
 * Claidor never holds them, and they must never be sent.
 */
export const SyncedMemoryFile = {
  /** The durable facts. Merged by union of blocks. */
  Memory: 'MEMORY.md',
  /** The short profile of the person. Newest wins; the app writes it at setup. */
  User: 'USER.md',
} as const;

export type SyncedMemoryFile = (typeof SyncedMemoryFile)[keyof typeof SyncedMemoryFile];

/** The daily notes live one directory down, one file per day. */
export const MEMORY_SYNC_DAILY_DIRECTORY = 'memory';

/** Every synced name ends in this. */
export const MEMORY_SYNC_FILE_EXTENSION = '.md';

/** `memory/YYYY-MM-DD.md`, forward slash only. The date is checked separately. */
const DAILY_MEMORY_NAME_PATTERN = /^memory\/(\d{4})-(\d{2})-(\d{2})\.md$/;

/** `base_version` 0 means « I have never seen this file from you ». */
export const MEMORY_SYNC_UNSEEN_VERSION = 0;

/** The four moments the app syncs, for the log line. */
export const MemorySyncReason = {
  EngineStarted: 'engine-started',
  ConversationFinished: 'conversation-finished',
  Periodic: 'periodic',
  Quit: 'quit',
} as const;

export type MemorySyncReason = (typeof MemorySyncReason)[keyof typeof MemorySyncReason];

/** One file the app sends up, with the version it last saw for it. */
export interface MemorySyncRequestFile {
  name: string;
  content: string;
  base_version: number;
}

export interface MemorySyncRequest {
  files: MemorySyncRequestFile[];
}

/**
 * One file as Claidor holds it after the merge. The answer always carries
 * every file Claidor holds, so a fresh computer receives the whole memory by
 * sending an empty list.
 */
export interface MemorySyncResponseFile {
  name: string;
  content: string;
  version: number;
  /** True when the answer differs from what was sent. */
  changed: boolean;
}

export interface MemorySyncResponse {
  files: MemorySyncResponseFile[];
  deleted: string[];
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

/**
 * The same strict rule the server applies: a name is a relative path inside
 * the workspace, from a fixed list — `MEMORY.md`, `USER.md`, and
 * `memory/YYYY-MM-DD.md` with a real date. Nothing else is accepted, so no
 * name can escape the workspace.
 */
export function isSyncedMemoryName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  if (name.includes('\\') || name.includes('\0') || name.startsWith('/')) {
    return false;
  }
  if (name.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  if (name === SyncedMemoryFile.Memory || name === SyncedMemoryFile.User) {
    return true;
  }
  const match = DAILY_MEMORY_NAME_PATTERN.exec(name);
  if (!match) {
    return false;
  }
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

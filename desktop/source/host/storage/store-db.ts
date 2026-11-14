/**
 * What the host keeps in mind about each SQLite file it works with: how
 * many times the file was written to, how many handles are open on it, and
 * how to fold its write-ahead log back into it.
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** How long a connection waits for a lock another one holds, in milliseconds. */
export const DB_BUSY_TIMEOUT_MS = 5_000;

/** The files SQLite may keep beside a database: its write-ahead log, that log's index, its rollback journal. */
export const SQLITE_DB_SIDECAR_SUFFIXES = ["-wal", "-shm", "-journal"] as const;

/**
 * A whole number kept for each file, by the file's full path. A file never
 * counted stands at nothing, and one that returns to nothing is forgotten.
 */
function countsByFile() {
  const counts = new Map<string, number>();
  return {
    of(file: string): number {
      return counts.get(file) ?? 0;
    },
    put(file: string, count: number): void {
      if (count > 0) counts.set(file, count);
      else counts.delete(file);
    },
  };
}

/** How many times each database file was written to since the host started, or since it was last forgotten. */
const writes = countsByFile();
/** How many handles the host holds open on each database file. */
const openHandles = countsByFile();

export function getSandAgentDbWriteGeneration(dbPath: string): number {
  return writes.of(resolve(dbPath));
}

export function bumpDbWriteGeneration(dbPath: string): void {
  const file = resolve(dbPath);
  writes.put(file, writes.of(file) + 1);
}

export function deleteSandAgentDbWriteGeneration(dbPath: string): void {
  writes.put(resolve(dbPath), 0);
}

/** Takes the path as it is given, unlike its neighbours: the caller has the full path already. */
export function liveDbHandleCount(resolvedDbPath: string): number {
  return openHandles.of(resolvedDbPath);
}

export function registerLiveDbHandle(dbPath: string): void {
  const file = resolve(dbPath);
  openHandles.put(file, openHandles.of(file) + 1);
}

/** One handle fewer. Releasing more often than registering leaves the count at nothing. */
export function releaseLiveDbHandle(dbPath: string): void {
  const file = resolve(dbPath);
  openHandles.put(file, openHandles.of(file) - 1);
}

export function hasLiveSandAgentDbHandle(dbPath: string): boolean {
  return openHandles.of(resolve(dbPath)) > 0;
}

/** A count of frames as SQLite reports one. It reports -1 for a database that keeps no log, which is no count. */
function frameCount(value: unknown): number | undefined {
  if (typeof value !== "number" || value < 0) return undefined;
  return value;
}

/**
 * Reads the row a checkpoint answers with: whether every frame the log held
 * was written back into the database. Says nothing (undefined) of a row
 * that does not hold the two counts.
 */
export function walFramesFullyFolded(row: unknown): boolean | undefined {
  if (row === null || typeof row !== "object") return undefined;
  const answer = row as { log?: unknown; checkpointed?: unknown };
  const inLog = frameCount(answer.log);
  const writtenBack = frameCount(answer.checkpointed);
  if (inLog === undefined || writtenBack === undefined) return undefined;
  return writtenBack >= inLog;
}

/** What a connection of its own answers to a truncating checkpoint, or nothing when the file will not open or answer. */
function askToFoldLog(dbPath: string, busyTimeoutMs: number): { row: unknown } | undefined {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath);
  } catch {
    return undefined;
  }
  let answered: { row: unknown } | undefined;
  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    answered = { row: db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() };
  } catch {
    answered = undefined;
  }
  // Closed outside the tries above: a connection that will not close is thrown to the caller, whatever was answered.
  db.close();
  return answered;
}

/** With no counts to go by, the log file itself is looked at: empty or gone means nothing is left in it. */
function logFileIsEmptyOrGone(dbPath: string): boolean {
  try {
    return statSync(`${dbPath}-wal`).size === 0;
  } catch (error) {
    return (error as { code?: unknown }).code === "ENOENT";
  }
}

/**
 * Folds a database's write-ahead log back into the database file, and says
 * whether the file alone now holds everything. True for a file that is not
 * there; false when the file cannot be opened or asked.
 */
export function checkpointSandAgentDb(dbPath: string, busyTimeoutMs = DB_BUSY_TIMEOUT_MS): boolean {
  if (!existsSync(dbPath)) return true;
  const answered = askToFoldLog(dbPath, busyTimeoutMs);
  if (answered === undefined) return false;
  return walFramesFullyFolded(answered.row) ?? logFileIsEmptyOrGone(dbPath);
}

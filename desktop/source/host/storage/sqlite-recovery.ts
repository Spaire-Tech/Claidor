/**
 * What is done with a SQLite file that went wrong: its side files removed,
 * the file itself removed or set aside, and whatever can still be read from
 * it copied, row by row, into a new one.
 *
 * Everything here is synchronous: it runs while a database is being opened,
 * and nothing else may touch the file in between.
 */
import { copyFileSync, existsSync, renameSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { SQLITE_DB_SIDECAR_SUFFIXES } from "./store-db.js";

/** How long a removal that failed waits before it is tried again, unless told. */
const DEFAULT_RETRY_WAIT_MS = 50;

/** Removes the files SQLite keeps beside a database. One that will not go is left there. */
export function removeSqliteSidecars(dbPath: string): void {
  for (const suffix of SQLITE_DB_SIDECAR_SUFFIXES) {
    try {
      rmSync(`${dbPath}${suffix}`, { force: true, recursive: true });
    } catch {
      // Left as it is: the caller goes on to the database itself either way.
    }
  }
}

/** Holds this thread still: a wait on a cell of memory nobody else has, which only the time can end. */
function standStill(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Removes a path, trying again after a wait when the removal fails (a file
 * another process still holds). One try unless told. A path that is not
 * there is no failure; a folder goes only when `recursive` is true. When
 * every try failed, the last failure is thrown.
 */
export function removePathWithRetries(options: {
  path: string;
  attempts?: number | undefined;
  retryDelayMs?: number | undefined;
  recursive?: boolean | undefined;
}): void {
  const tries = Math.max(1, options.attempts ?? 1);
  const wait = options.retryDelayMs ?? DEFAULT_RETRY_WAIT_MS;
  const withAllInIt = options.recursive === true;
  let failure: unknown;
  for (let made = 0; made < tries; made += 1) {
    try {
      rmSync(options.path, { force: true, recursive: withAllInIt });
      return;
    } catch (error) {
      failure = error;
    }
    if (made < tries - 1) standStill(wait);
  }
  if (failure != null) throw failure;
}

/** Removes a database and the files beside it. The database goes first: if it will not, its side files stay. */
export function removeSqliteDb(options: {
  dbPath: string;
  attempts?: number | undefined;
  retryDelayMs?: number | undefined;
}): void {
  const { dbPath, attempts, retryDelayMs } = options;
  removePathWithRetries({ path: dbPath, attempts, retryDelayMs });
  for (const suffix of SQLITE_DB_SIDECAR_SUFFIXES) {
    removePathWithRetries({ path: `${dbPath}${suffix}`, attempts, retryDelayMs, recursive: true });
  }
}

/** The moment, written so that it can be part of a file's name: no colon and no full stop. */
function momentForAFileName(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

/** The code a failed file operation carries, as text; "error" when it carries none. */
function codeOf(failure: unknown): string {
  return String((failure as { code?: unknown }).code ?? "error");
}

/**
 * Makes room where a database is about to be set aside. When what is there
 * will not go, the files beside it are left too: the move that follows then
 * fails, and its failure is the one reported.
 */
function clearPlaceFor(asidePath: string): void {
  try {
    rmSync(asidePath, { force: true });
  } catch {
    return;
  }
  removeSqliteSidecars(asidePath);
}

/** Moves a file. Null when it moved; when it did not, the code of the failure. */
function moveOrSayWhyNot(from: string, to: string): string | null {
  try {
    renameSync(from, to);
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

/** After the database has moved: each file beside it follows, and one that cannot follow is removed. */
function moveSidecars(dbPath: string, asidePath: string): void {
  for (const suffix of SQLITE_DB_SIDECAR_SUFFIXES) {
    const beside = `${dbPath}${suffix}`;
    if (!existsSync(beside)) continue;
    try {
      renameSync(beside, `${asidePath}${suffix}`);
    } catch {
      // It must not stay beside the place a new database will take. A failure to remove it stops the work.
      rmSync(beside, { force: true });
    }
  }
}

/** Copies the files beside a database to its copy's side, each on its own: one that cannot be copied is passed over. */
function copySidecars(dbPath: string, asidePath: string): void {
  for (const suffix of SQLITE_DB_SIDECAR_SUFFIXES) {
    const beside = `${dbPath}${suffix}`;
    if (!existsSync(beside)) continue;
    try {
      copyFileSync(beside, `${asidePath}${suffix}`);
    } catch {
      // The database's own copy is what matters.
    }
  }
}

/**
 * Sets a damaged database aside, under `quarantinePath` or, by default, its
 * own name followed by ".corrupt-" and the moment, so that a new database
 * can take its place.
 *
 * It is moved when it can be (`renameErrorCode` is null). When the move
 * fails it is copied instead and the original removed (`copied` is true),
 * and `renameErrorCode` says why the move failed. When it can be neither
 * moved nor copied it is removed all the same and nothing is set aside
 * (`quarantinePath` is null), unless `preserveSourceOnCopyFailure` asks for
 * it to be left where it is: `quarantinePath` is then the database's own path.
 */
export function quarantineCorruptSqliteDb(options: {
  dbPath: string;
  quarantinePath?: string;
  preserveSourceOnCopyFailure?: boolean;
  removeAttempts?: number | undefined;
  removeRetryDelayMs?: number | undefined;
}): { quarantinePath: string | null; copied: boolean; renameErrorCode: string | null } {
  const { dbPath } = options;
  const asidePath = options.quarantinePath ?? `${dbPath}.corrupt-${momentForAFileName()}`;
  clearPlaceFor(asidePath);

  const renameErrorCode = moveOrSayWhyNot(dbPath, asidePath);
  if (renameErrorCode === null) {
    moveSidecars(dbPath, asidePath);
    return { quarantinePath: asidePath, copied: false, renameErrorCode };
  }

  let copied = true;
  try {
    copyFileSync(dbPath, asidePath);
  } catch {
    copied = false;
  }
  if (copied) copySidecars(dbPath, asidePath);
  else if (options.preserveSourceOnCopyFailure === true) return { quarantinePath: dbPath, copied: false, renameErrorCode };

  removeSqliteDb({ dbPath, attempts: options.removeAttempts, retryDelayMs: options.removeRetryDelayMs });
  return { quarantinePath: copied ? asidePath : null, copied, renameErrorCode };
}

/**
 * A connection to the file that has answered one question about its schema,
 * or nothing when the file will not open or will not answer.
 */
function openAndAsk(dbPath: string, busyTimeoutMs: number | undefined): DatabaseSync | undefined {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath);
  } catch {
    return undefined;
  }
  try {
    if (busyTimeoutMs != null) db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    db.prepare("PRAGMA schema_version").get();
    return db;
  } catch {
    try {
      db.close();
    } catch {
      // A handle that will not close is let go.
    }
    return undefined;
  }
}

/**
 * Opens a database to read what is left in it. Tried as it is; then once
 * more with the files beside it removed, which may be what stops it; and
 * when that fails too, a connection that was asked nothing is handed over,
 * since some rows may still be readable. Nothing for a file that is not
 * there or cannot be opened at all.
 */
export function openSqliteForSalvage(options: { dbPath: string; busyTimeoutMs?: number }): DatabaseSync | undefined {
  const { dbPath, busyTimeoutMs } = options;
  if (!existsSync(dbPath)) return undefined;

  const asItIs = openAndAsk(dbPath, busyTimeoutMs);
  if (asItIs !== undefined) return asItIs;

  removeSqliteSidecars(dbPath);
  const withoutSidecars = openAndAsk(dbPath, busyTimeoutMs);
  if (withoutSidecars !== undefined) return withoutSidecars;

  try {
    return new DatabaseSync(dbPath);
  } catch {
    return undefined;
  }
}

/** Said in place of a row when the read itself failed. */
const READ_FAILED = Symbol("read failed");

function readNext(rows: Iterator<unknown>): IteratorResult<unknown> | typeof READ_FAILED {
  try {
    return rows.next();
  } catch {
    return READ_FAILED;
  }
}

/** Writes one row, and says whether it went in. A row that cannot be turned into values, or is refused, did not. */
function writeRow(insert: { run(...params: unknown[]): unknown }, toParams: (row: unknown) => unknown[], row: unknown): boolean {
  try {
    insert.run(...toParams(row));
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies the rows `selectSql` finds in a damaged database into another one,
 * and says how many went in. Rows are read one at a time, so that a read
 * that fails part of the way keeps what came before it, and each row is
 * written on its own, so that one refused row does not stop the others.
 * Nothing is copied when the question cannot even be asked.
 */
export function copySalvageableSqliteRows(
  source: { prepare(sql: string): { iterate(): Iterator<unknown> } },
  selectSql: string,
  insert: { run(...params: unknown[]): unknown },
  toParams: (row: unknown) => unknown[],
): number {
  let rows: Iterator<unknown>;
  try {
    rows = source.prepare(selectSql).iterate();
  } catch {
    return 0;
  }

  let copied = 0;
  try {
    for (;;) {
      const read = readNext(rows);
      if (read === READ_FAILED || read.done) break;
      if (writeRow(insert, toParams, read.value)) copied += 1;
    }
  } finally {
    // The read is closed whatever happened, and a failure to close it changes nothing.
    try {
      rows.return?.();
    } catch {
      // Nothing more to do with it.
    }
  }
  return copied;
}

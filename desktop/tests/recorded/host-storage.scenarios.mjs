/**
 * The engine's folders and SQLite files: which names are safe as a folder's, where an agent's folder is, telling
 * SQLite's failures apart, the counts kept for each database file, folding a write-ahead log back into its database,
 * setting a damaged database aside and reading what can still be read from it.
 *
 * Every database here is made in a temporary folder, the damaged and the locked ones on purpose. Where the part
 * could only be made to fail by a real fault (a move across two disks, a file that will not go), the file system's
 * own call is stood in for inside the scenario and put back after it.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

export const part = "host/storage";
export const modules = {
  busy: "source/host/storage/sqlite-busy.ts",
  folderId: "source/host/storage/folder-id.ts",
  agentPaths: "source/host/storage/agent-paths.ts",
  storeDb: "source/host/storage/store-db.ts",
  recovery: "source/host/storage/sqlite-recovery.ts",
};

// ---------------------------------------------------------------------------------------------------------------
// What the scenarios share

/** An error as SQLite's binding raises one: words and, when given, a result code. */
function sqliteError(message, errcode, Kind = Error) {
  const error = new Kind(message);
  if (errcode !== undefined) error.errcode = errcode;
  return error;
}

/** An error as it is kept: its class, its codes and its words, with the folder's own name taken out. */
function told(error, dir) {
  if (!(error instanceof Error)) return { notAnError: String(error) };
  const words = dir === undefined ? error.message : error.message.split(dir).join("<tmp>");
  return { class: error.constructor.name, ...(error.code === undefined ? {} : { code: error.code }), ...(error.errcode === undefined ? {} : { errcode: error.errcode }), message: words };
}

/** What a call did: what it gave back, or what it threw. */
function outcome(run, dir) {
  try {
    return { returned: run() };
  } catch (error) {
    return { threw: told(error, dir) };
  }
}

/** The same for an error JavaScript itself raises: only its class is kept, its sentence is the runtime's. */
function outcomeByClass(run) {
  try {
    return { returned: run() };
  } catch (error) {
    return { threwA: error?.constructor?.name ?? String(error) };
  }
}

/** A value with the folder's own name taken out of every text in it. */
const scrubbed = (value, dir) => JSON.parse(JSON.stringify(value).split(dir).join("<tmp>"));

/** Files and folders made from a table: a text is a file's content, a table is a folder. */
function seed(dir, layout) {
  for (const [name, value] of Object.entries(layout)) {
    const full = path.join(dir, name);
    if (typeof value === "string") fs.writeFileSync(full, value);
    else {
      fs.mkdirSync(full);
      seed(full, value);
    }
  }
}

/** What a folder holds, by name: each file by what it says, SQLite's own files by their kind, each folder with what is in it. */
function tree(dir, under = "") {
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) out[under + name] = "a link";
    else if (stat.isDirectory()) {
      out[`${under}${name}/`] = "a folder";
      Object.assign(out, tree(full, `${under}${name}/`));
    } else {
      const bytes = fs.readFileSync(full);
      const start = bytes.subarray(0, 8).toString("hex");
      if (bytes.length === 0) out[under + name] = "an empty file";
      else if (bytes.subarray(0, 15).toString("latin1") === "SQLite format 3") out[under + name] = "a database";
      else if (start.startsWith("377f0682") || start.startsWith("377f0683")) out[under + name] = "a write-ahead log";
      else if (start === "d9d505f920a163d7") out[under + name] = "a rollback journal";
      else out[under + name] = bytes.length <= 60 ? `a file saying "${bytes.toString("utf8")}"` : `a file of ${bytes.length} bytes`;
    }
  }
  return out;
}

/** A small database of notes, left open. */
function notesDb(file, { wal = false, rows = 3, pad = 0 } = {}) {
  const db = new DatabaseSync(file);
  if (wal) db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
  const insert = db.prepare("INSERT INTO notes (id, body) VALUES (?, ?)");
  db.exec("BEGIN");
  for (let id = 1; id <= rows; id += 1) insert.run(id, `note ${id}${pad === 0 ? "" : ` ${"x".repeat(pad)}`}`);
  db.exec("COMMIT");
  return db;
}

/** A database of 600 longer notes, twenty pages of them, with the tenth page wiped. */
function tornDb(file) {
  notesDb(file, { rows: 600, pad: 100 }).close();
  if (fs.statSync(file).size < 4096 * 12) throw new Error("the database to damage is smaller than the scenario takes it to be");
  const fd = fs.openSync(file, "r+");
  fs.writeSync(fd, Buffer.alloc(4096), 0, 4096, 4096 * 9);
  fs.closeSync(fd);
}

const notesIn = (db) => db.prepare("SELECT id, body FROM notes ORDER BY id").all().map((row) => ({ ...row }));

/** The notes a database file holds, read by a connection of our own. */
function notesOf(file) {
  const db = new DatabaseSync(file);
  try {
    return notesIn(db);
  } finally {
    db.close();
  }
}

/** Settings put in place while `run` runs (undefined takes one away), and put back after. */
function withEnv(settings, run) {
  const before = {};
  for (const [name, value] of Object.entries(settings)) {
    before[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return run();
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** The settings the data root is read from, all absent unless a case sets one. */
const NO_ROOT_SETTINGS = { SAND_DATA_ROOT: undefined, SAND_USER_DATA_DIR: undefined, SAND_PACKAGED: undefined, SAND_LAB: undefined };

/** One thing of Node's stood in for while `run` runs, and put back after. */
function standingIn(holder, name, makeStandIn, run) {
  const real = holder[name];
  holder[name] = makeStandIn(real);
  try {
    return run();
  } finally {
    holder[name] = real;
  }
}

/**
 * The part watched at work on a folder: every removal, move and copy it asks of the file system, in order and by
 * name, and every wait it takes between two tries. `failMove(name)` may hand back an error for a move to fail with;
 * `duringWait(n)` runs in place of the nth wait.
 */
function watched(dir, run, { failMove = () => undefined, duringWait = () => {} } = {}) {
  const asked = [];
  const waits = [];
  const real = { rmSync: fs.rmSync, renameSync: fs.renameSync, copyFileSync: fs.copyFileSync, wait: Atomics.wait };
  const name = (file) => String(file).split(dir + path.sep).join("");
  fs.rmSync = (file, options) => {
    asked.push(`remove ${name(file)}${options?.recursive ? " and all in it" : ""}${options?.force ? "" : ", which must be there"}`);
    return real.rmSync(file, options);
  };
  fs.renameSync = (from, to) => {
    asked.push(`move ${name(from)} to ${name(to)}`);
    const error = failMove(name(from));
    if (error !== undefined) throw error;
    return real.renameSync(from, to);
  };
  fs.copyFileSync = (from, to, ...rest) => {
    asked.push(`copy ${name(from)} to ${name(to)}`);
    return real.copyFileSync(from, to, ...rest);
  };
  Atomics.wait = (cells, index, value, ms) => {
    // A wait that would really be one: the cell holds the value waited on, and nobody else has the cell.
    waits.push({ ms, wouldBlock: Atomics.load(cells, index) === value });
    asked.push(`wait ${ms}`);
    duringWait(waits.length);
    return "timed-out";
  };
  try {
    return { ...outcome(run, dir), asked, waits, files: tree(dir) };
  } finally {
    fs.rmSync = real.rmSync;
    fs.renameSync = real.renameSync;
    fs.copyFileSync = real.copyFileSync;
    Atomics.wait = real.wait;
  }
}

/** The clock held at one moment while `run` runs. */
function atTime(iso, run) {
  const Real = globalThis.Date;
  globalThis.Date = class extends Real {
    constructor(...args) {
      if (args.length === 0) super(iso);
      else super(...args);
    }
    static now() {
      return new Real(iso).getTime();
    }
  };
  try {
    return run();
  } finally {
    globalThis.Date = Real;
  }
}

const MOMENT = "2026-03-04T05:06:07.089Z";

/** A move that fails as one across two disks does. */
const acrossDisks = () => Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });

// ---------------------------------------------------------------------------------------------------------------
// Made-up errors, asked of each of the four questions

const CODES = [0, 1, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 25, 26, 27, 261, 262, 266, 267, 270, 282, 523, 5898, 4294967306, -246, 5.5, 10.5, 11.5, 14.5, 26.5, Number.NaN, Number.POSITIVE_INFINITY, "5", "10", "11", "14", "26", 5n, null, true];
const WORDS = [
  "",
  "database is locked",
  "database table is locked",
  "database schema is locked",
  "Database Is Locked",
  "SQLITE_BUSY: database is locked (5)",
  "database locked",
  "database table locked",
  "disk I/O error",
  "disk i/o error",
  "DISK I/O ERROR while reading",
  "disk io error",
  "short read",
  "a Short Read of 12 bytes",
  "short reads",
  "shortread",
  "unable to open database file",
  "Unable To Open Database",
  "unable to open the database",
  "database disk image is malformed",
  "malformed",
  "MALFORMED JSON at 3",
  "malform",
  "file is not a database",
  "this is not a database at all",
  "is not a data base",
  "the database disk image was replaced",
  "database disk",
  "no such table: notes",
];

/** Every made-up error, by a name that says what it is. */
function candidates() {
  const list = [];
  for (const code of CODES) list.push([`code ${typeof code === "string" ? `"${code}"` : typeof code === "bigint" ? `${code}n` : String(code)}`, () => sqliteError("it failed", code)]);
  for (const words of WORDS) list.push([`words "${words}"`, () => new Error(words)]);
  list.push(["a TypeError with code 5", () => sqliteError("it failed", 5, TypeError)]);
  list.push(["a TypeError with code 10", () => sqliteError("it failed", 10, TypeError)]);
  list.push(["a TypeError with code 14", () => sqliteError("it failed", 14, TypeError)]);
  list.push(["a TypeError with code 11", () => sqliteError("it failed", 11, TypeError)]);
  list.push(["a code that does not match, with words that do: locked", () => sqliteError("database is locked", 1)]);
  list.push(["a code that does not match, with words that do: read", () => sqliteError("short read", 1)]);
  list.push(["a code that does not match, with words that do: open", () => sqliteError("unable to open database", 1)]);
  list.push(["a code that does not match, with words that do: damaged", () => sqliteError("is not a database", 1)]);
  list.push(["null", () => null]);
  list.push(["undefined", () => undefined]);
  list.push(["the text \"database is locked\"", () => "database is locked"]);
  list.push(["the number 5", () => 5]);
  list.push(["a plain object with the words and codes of all four", () => ({ message: "database is locked, disk i/o error, unable to open database, malformed", errcode: 5 })]);
  list.push(["an error made in another realm, locked", () => vm.runInNewContext("Object.assign(new Error('database is locked'), { errcode: 5 })")]);
  list.push(["an error made in another realm, damaged", () => vm.runInNewContext("Object.assign(new Error('malformed, short read, unable to open database'), { errcode: 11 })")]);
  return list;
}

/** The names of the made-up errors a question answers yes to; every other answers a plain no. */
function yesOf(question) {
  const yes = [];
  let asked = 0;
  for (const [name, make] of candidates()) {
    const answer = question(make());
    asked += 1;
    if (answer === true) yes.push(name);
    else if (answer !== false) yes.push(`${name}: ${String(answer)}`);
  }
  return { asked, yes };
}

/** An error whose words are not a text, with a result code or without one. */
function wordless(message, errcode) {
  const error = sqliteError("it failed", errcode);
  error.message = message;
  return error;
}

/**
 * An operation that follows a plan, call by call ("locked", "locked by its words", "other" or a value to give back;
 * the last step repeats), asked through `retrySqliteBusy`. With `delay: "recorded"` the waits are noted, not taken.
 */
async function retried(retrySqliteBusy, plan, options) {
  const errors = [];
  const waits = [];
  let calls = 0;
  let argsSeen = 0;
  const operation = (...args) => {
    argsSeen += args.length;
    const step = plan[Math.min(calls, plan.length - 1)];
    calls += 1;
    if (step === "locked" || step === "locked by its words" || step === "other") {
      const error = step === "locked" ? sqliteError("it failed", 5) : step === "locked by its words" ? new Error("Database Is Locked") : new Error("no such table: notes");
      errors.push(error);
      throw error;
    }
    return step;
  };
  const given = options?.delay === "recorded" ? { ...options, delay: async (...args) => void waits.push(args) } : options;
  try {
    const value = options === "none" ? await retrySqliteBusy(operation) : await retrySqliteBusy(operation, given);
    return { returned: value, calls, argsSeen, waits };
  } catch (error) {
    const which = errors.indexOf(error);
    return { threw: which === -1 ? told(error) : `the error of call ${which + 1}`, calls, argsSeen, waits };
  }
}

/** A source of rows that is not a database: a list of what each `next` does, and a note of every call made on it. */
function standInRows(steps, { withReturn = true, returnThrows = false, prepareThrows = false, iterateThrows = false } = {}) {
  const log = [];
  let at = 0;
  const iterator = {
    next(...args) {
      log.push(`next(${args.length})`);
      const step = steps[at];
      at += 1;
      if (step === "throw") throw new Error("the read failed");
      return step === "end" || at > steps.length ? { done: true, value: undefined } : step;
    },
  };
  if (withReturn) {
    iterator.return = function (...args) {
      log.push(`return(${args.length})${this === iterator ? "" : " on something else"}`);
      if (returnThrows) throw new Error("closing failed");
      return { done: true, value: undefined };
    };
  }
  const source = {
    prepare(...args) {
      log.push(`prepare(${args.map((arg) => JSON.stringify(arg)).join(", ")})`);
      if (prepareThrows) throw new Error("no such table: notes");
      return {
        iterate(...iterateArgs) {
          log.push(`iterate(${iterateArgs.length})`);
          if (iterateThrows) throw new Error("cannot step");
          return iterator;
        },
      };
    },
  };
  return { source, log };
}

/** A row writer that is not a database: it notes what it is given and fails where told to. */
function standInWriter(log, failsOn = () => false) {
  return {
    run(...params) {
      log.push(`run(${params.map((param) => JSON.stringify(param)).join(", ")})`);
      if (failsOn(params)) throw new Error("UNIQUE constraint failed");
      return { changes: 1 };
    },
  };
}

/** What `openSqliteForSalvage` handed back, asked a few things and then closed. */
function opened(db, dir) {
  if (db === undefined) return "nothing";
  try {
    return {
      handle: db.constructor.name,
      open: db.isOpen,
      busyTimeout: outcome(() => db.prepare("PRAGMA busy_timeout").get().timeout, dir),
      notes: outcome(() => notesIn(db), dir),
    };
  } finally {
    try {
      db.close();
    } catch {
      // Already closed.
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------

export const scenarios = [
  // ----- sqlite-busy.ts
  {
    name: "SQLite's result codes are kept by their own numbers",
    run: ({ busy }) => ({
      SQLITE_BUSY: busy.SQLITE_BUSY,
      SQLITE_LOCKED: busy.SQLITE_LOCKED,
      SQLITE_IOERR: busy.SQLITE_IOERR,
      SQLITE_CORRUPT: busy.SQLITE_CORRUPT,
      SQLITE_CANTOPEN: busy.SQLITE_CANTOPEN,
      SQLITE_NOTADB: busy.SQLITE_NOTADB,
    }),
  },
  {
    name: "a locked database is told by the codes 5 and 6 exactly, or by three phrases in its words",
    run: ({ busy }) => yesOf(busy.isSqliteBusyError),
  },
  {
    name: "a failed read or write is told by the low byte of its code being 10, or by two phrases in its words",
    run: ({ busy }) => yesOf(busy.isSqliteIoError),
  },
  {
    name: "a file that will not open is told by the low byte of its code being 14, or by one phrase in its words",
    run: ({ busy }) => yesOf(busy.isSqliteCantOpenError),
  },
  {
    name: "a damaged database is told by the low byte of its code being 11 or 26, or by three phrases in its words",
    run: ({ busy }) => yesOf(busy.isSqliteCorruptError),
  },
  {
    name: "an error whose words are not a text is still told by its code, but for a damaged database",
    run: ({ busy }) => {
      const questions = { locked: [busy.isSqliteBusyError, 5], readOrWrite: [busy.isSqliteIoError, 10], cannotOpen: [busy.isSqliteCantOpenError, 14], damaged: [busy.isSqliteCorruptError, 11] };
      const out = {};
      for (const [name, [question, code]] of Object.entries(questions)) {
        out[name] = {
          "its own code, words a number": outcomeByClass(() => question(wordless(7, code))),
          "its own code, no words at all": outcomeByClass(() => question(wordless(undefined, code))),
          "another code, words a number": outcomeByClass(() => question(wordless(7, 1))),
          "no code, words a number": outcomeByClass(() => question(wordless(7))),
          "no code, words null": outcomeByClass(() => question(wordless(null))),
        };
      }
      out.sixIsLockedToo = outcomeByClass(() => busy.isSqliteBusyError(wordless(7, 6)));
      out.twentySixIsDamagedToo = outcomeByClass(() => busy.isSqliteCorruptError(wordless(7, 26)));
      return out;
    },
  },
  {
    name: "SQLite's own errors, from databases locked and damaged on purpose, are told apart",
    run: async ({ busy }, tools) => {
      const dir = await tools.tmp();
      const errors = {};
      const caught = (name, run) => {
        try {
          run();
          errors[name] = "no error";
        } catch (error) {
          errors[name] = { errcode: error.errcode, words: error.message, locked: busy.isSqliteBusyError(error), readOrWrite: busy.isSqliteIoError(error), cannotOpen: busy.isSqliteCantOpenError(error), damaged: busy.isSqliteCorruptError(error) };
        }
      };
      // Another connection holds the whole file.
      const held = path.join(dir, "held.db");
      const holder = notesDb(held);
      holder.exec("BEGIN EXCLUSIVE");
      const second = new DatabaseSync(held);
      caught("a file another connection holds", () => second.prepare("SELECT count(*) FROM notes").get());
      second.close();
      holder.exec("COMMIT");
      // A table dropped while it is being read.
      const reading = holder.prepare("SELECT id FROM notes").iterate();
      reading.next();
      caught("a table dropped while it is read", () => holder.exec("DROP TABLE notes"));
      reading.return?.();
      holder.close();
      // Not a database at all.
      const words = path.join(dir, "words.db");
      fs.writeFileSync(words, "only words, ".repeat(400));
      const wordsDb = new DatabaseSync(words);
      caught("a file of words", () => wordsDb.prepare("PRAGMA schema_version").get());
      wordsDb.close();
      // A folder where the file should be.
      caught("a folder", () => new DatabaseSync(dir));
      // A page in the middle wiped.
      const torn = path.join(dir, "torn.db");
      tornDb(torn);
      const tornHandle = new DatabaseSync(torn);
      caught("a database with a wiped page", () => tornHandle.prepare("SELECT id, body FROM notes").all());
      tornHandle.close();
      // A folder where the rollback journal should be.
      const journalled = path.join(dir, "journalled.db");
      notesDb(journalled).close();
      fs.mkdirSync(`${journalled}-journal`);
      const journalledDb = new DatabaseSync(journalled);
      caught("a folder where the journal should be", () => journalledDb.prepare("PRAGMA schema_version").get());
      journalledDb.close();
      // A folder where the write-ahead log should be.
      const logged = path.join(dir, "logged.db");
      notesDb(logged, { wal: true }).close();
      fs.mkdirSync(`${logged}-wal`);
      const loggedDb = new DatabaseSync(logged);
      caught("a folder where the write-ahead log should be", () => loggedDb.prepare("PRAGMA schema_version").get());
      loggedDb.close();
      return errors;
    },
  },
  {
    name: "work that succeeds is done once, with nothing passed to it and no wait",
    run: async ({ busy }) => ({
      "no options at all": await retried(busy.retrySqliteBusy, ["done"], "none"),
      "a value that is not a promise": await retried(busy.retrySqliteBusy, [0], { delay: "recorded" }),
      "a promise": await retried(busy.retrySqliteBusy, [Promise.resolve({ rows: 2 })], { delay: "recorded" }),
      "undefined": await retried(busy.retrySqliteBusy, [undefined], { delay: "recorded" }),
    }),
  },
  {
    name: "work that finds the database locked is tried five times, waiting 100, 200, 400 and 800 ms between",
    run: async ({ busy }) => ({
      "locked every time": await retried(busy.retrySqliteBusy, ["locked"], { delay: "recorded" }),
      "locked by its words every time": await retried(busy.retrySqliteBusy, ["locked by its words"], { delay: "recorded" }),
      "locked twice, then done": await retried(busy.retrySqliteBusy, ["locked", "locked", "done"], { delay: "recorded" }),
      "locked four times, then done": await retried(busy.retrySqliteBusy, ["locked", "locked", "locked", "locked", "done"], { delay: "recorded" }),
      "a promise that fails as locked, then done": await retried(busy.retrySqliteBusy, [Promise.reject(sqliteError("database is locked", 5)), "done"], { delay: "recorded" }),
    }),
  },
  {
    name: "any other failure is thrown at once, the first time or after waits",
    run: async ({ busy }) => ({
      "another failure first": await retried(busy.retrySqliteBusy, ["other"], { delay: "recorded" }),
      "locked, then another failure": await retried(busy.retrySqliteBusy, ["locked", "other"], { delay: "recorded" }),
      "a failure that is not an error": await busy.retrySqliteBusy(() => { throw "database is locked"; }, { delay: async () => {} }).then((value) => ({ returned: value }), (error) => ({ threw: error })),
      "a wait that fails": await (async () => {
        let calls = 0;
        const broken = new Error("the clock broke");
        return busy.retrySqliteBusy(() => { calls += 1; throw sqliteError("it failed", 5); }, { delay: async () => { throw broken; } }).then((value) => ({ returned: value, calls }), (error) => ({ threwTheWaitsOwnError: error === broken, calls }));
      })(),
    }),
  },
  {
    name: "the number of tries is at least one, and what is not a number of tries is taken as it comes",
    run: async ({ busy }) => {
      const out = {};
      for (const attempts of [undefined, null, 1, 0, -1, 2, 3, 2.5, 1.5, Number.NaN, "3", Number.NEGATIVE_INFINITY]) {
        out[`attempts ${typeof attempts === "string" ? `"${attempts}"` : String(attempts)}`] = await retried(busy.retrySqliteBusy, ["locked"], { attempts, delay: "recorded" });
      }
      out["attempts without end, done on the seventh try"] = await retried(busy.retrySqliteBusy, ["locked", "locked", "locked", "locked", "locked", "locked", "done"], { attempts: Number.POSITIVE_INFINITY, baseDelayMs: 1, delay: "recorded" });
      return out;
    },
  },
  {
    name: "each wait is the first one doubled, whatever the first one is",
    run: async ({ busy }) => {
      const out = {};
      for (const baseDelayMs of [undefined, null, 0, 1, 7, 0.5, -1, 250]) {
        out[`first wait ${String(baseDelayMs)}`] = (await retried(busy.retrySqliteBusy, ["locked"], { baseDelayMs, delay: "recorded" })).waits.flat();
      }
      return out;
    },
  },
  {
    name: "without a wait of its own the work waits on the clock",
    run: async ({ busy }) => {
      const started = performance.now();
      const result = await retried(busy.retrySqliteBusy, ["locked", "locked", "done"], { attempts: 3, baseDelayMs: 12 });
      const took = performance.now() - started;
      return { result, waitedAtLeastBothWaits: took >= 12 + 24 - 3, andNotASecond: took < 1000 };
    },
  },

  // ----- folder-id.ts
  {
    name: "a folder's name is a text with something in it, no slash of either kind, no zero byte, and not one or two dots",
    run: ({ folderId }) => {
      const out = {};
      const cases = [
        "a", "agent-1", "A b", " ", " a", "a ", ".hidden", "...", "a.b", "..a", "a..", "é", "名前", "a:b", "a*b", "~", "-", "con",
        "", ".", "..", "a/b", "/", "/a", "a/", "a\\b", "\\", "a\0b", "\0", "../x", "..\\x", "a\nb", "∕", "＼",
      ];
      for (const id of cases) out[JSON.stringify(id)] = folderId.isSafeFolderId(id);
      out["a very long name"] = folderId.isSafeFolderId("n".repeat(5000));
      const others = { undefined, null: null, zero: 0, seven: 7, true: true, "an object": {}, "a list of one name": ["a"], "a String object": new String("a"), "a symbol": Symbol("a"), "a function": () => "a", "a big number": 1n };
      for (const [name, value] of Object.entries(others)) out[name] = folderId.isSafeFolderId(value);
      return out;
    },
  },

  // ----- agent-paths.ts
  {
    name: "the agents' folder is \"agents\" in the data root, wherever the settings put that root",
    run: async ({ agentPaths }, tools) => {
      const cwd = process.cwd();
      const out = {};
      const at = (settings, ...args) => withEnv({ ...NO_ROOT_SETTINGS, ...settings }, () => outcome(() => tools.scrub(agentPaths.getSandAgentsRootDir(...args), { [cwd]: "<cwd>" })));
      out["a home given"] = at({}, "/Users/ada");
      out["a home given, in the app as shipped"] = at({ SAND_PACKAGED: "1" }, "/Users/ada");
      out["a home given, in the lab build"] = at({ SAND_PACKAGED: "1", SAND_LAB: "1" }, "/Users/ada");
      out["the lab setting alone"] = at({ SAND_LAB: "1" }, "/Users/ada");
      out["no home given: the person's own"] = at({ HOME: "/Users/grace" });
      out["undefined for the home: the person's own"] = at({ HOME: "/Users/grace" }, undefined);
      out["no home given, in the app as shipped"] = at({ HOME: "/Users/grace", SAND_PACKAGED: "1" });
      out["a data root set"] = at({ SAND_DATA_ROOT: "/srv/simeon-data" }, "/Users/ada");
      out["a data root set, with spaces around it"] = at({ SAND_DATA_ROOT: "  /srv/simeon-data  " }, "/Users/ada");
      out["a data root that is not a full path is not used"] = at({ SAND_DATA_ROOT: "simeon-data" }, "/Users/ada");
      out["an empty data root is not used"] = at({ SAND_DATA_ROOT: "   " }, "/Users/ada");
      out["a user data folder set"] = at({ SAND_USER_DATA_DIR: "/profiles/one" }, "/Users/ada");
      out["a user data folder that is not a full path, from the working folder"] = at({ SAND_USER_DATA_DIR: "profiles/two" }, "/Users/ada");
      out["a data root and a user data folder: the data root"] = at({ SAND_DATA_ROOT: "/srv/simeon-data", SAND_USER_DATA_DIR: "/profiles/one" }, "/Users/ada");
      out["an empty home"] = at({}, "");
      out["a home that is not a full path"] = at({}, "homes/ada");
      out["a home with dots and doubled slashes"] = at({}, "/Users//ada/../grace/");
      out["null for the home"] = withEnv(NO_ROOT_SETTINGS, () => outcomeByClass(() => agentPaths.getSandAgentsRootDir(null)));
      return out;
    },
  },
  {
    name: "an agent's id must be a safe folder name with no space at either end",
    run: ({ agentPaths }) => {
      const out = {};
      const check = (name, id) => {
        try {
          out[name] = { returned: agentPaths.assertValidSandAgentId(id) };
        } catch (error) {
          out[name] = { threw: error, isTheParts: error instanceof agentPaths.SandInvalidAgentIdError, isAnError: error instanceof Error, class: error.constructor.name };
        }
      };
      for (const id of ["agent-1", "a", "A b", "...", ".hidden", "a​b", "​a", "", ".", "..", " a", "a ", " ", "\ta", "a\n", "a\r\n", " a", "a﻿", " a", "a/b", "a\\b", "a\0", "../x"]) check(JSON.stringify(id), id);
      check("undefined", undefined);
      check("null", null);
      check("the number 7", 7);
      check("an object", {});
      check("a list of one name", ["agent-1"]);
      check("a String object", new String("agent-1"));
      out["a symbol"] = outcomeByClass(() => agentPaths.assertValidSandAgentId(Symbol("agent-1")));
      return out;
    },
  },
  {
    name: "the error for a bad agent id is an Error of its own class, named as any Error",
    run: ({ agentPaths }) => {
      const { SandInvalidAgentIdError } = agentPaths;
      const withWords = new SandInvalidAgentIdError("Invalid Sand agent id: x");
      const bare = new SandInvalidAgentIdError();
      const withCause = new SandInvalidAgentIdError("with a cause", { cause: "why" });
      return {
        className: SandInvalidAgentIdError.name,
        parent: Object.getPrototypeOf(SandInvalidAgentIdError) === Error,
        withWords,
        ownFields: Object.getOwnPropertyNames(withWords).sort(),
        asText: String(withWords),
        bare,
        withCause,
        isError: withWords instanceof Error,
        ownMethods: Object.getOwnPropertyNames(SandInvalidAgentIdError.prototype),
      };
    },
  },
  {
    name: "an agent's folder is its id inside the agents' folder",
    run: ({ agentPaths }) => {
      const out = {};
      const at = (settings, ...args) => withEnv({ ...NO_ROOT_SETTINGS, ...settings }, () => outcome(() => agentPaths.resolveSandAgentDir(...args)));
      out["an id and a home"] = at({}, "agent-1", "/Users/ada");
      out["an id and no home: the person's own"] = at({ HOME: "/Users/grace" }, "agent-1");
      out["an id, in the app as shipped"] = at({ SAND_PACKAGED: "1" }, "agent-1", "/Users/ada");
      out["an id, with a data root set"] = at({ SAND_DATA_ROOT: "/srv/simeon-data" }, "agent-1", "/Users/ada");
      out["an id, with a home that is not a full path"] = at({}, "agent-1", "homes/ada");
      out["an id, with an empty home"] = at({}, "agent-1", "");
      for (const id of ["a", "A b", "...", ".hidden", "a..", "名前", "a​b"]) out[`the id ${JSON.stringify(id)}`] = at({}, id, "/Users/ada");
      for (const id of ["", ".", "..", " a", "a ", "a/b", "a\\b", "a\0", "../x", "a\n"]) out[`the bad id ${JSON.stringify(id)}`] = at({}, id, "/Users/ada");
      out["the bad id undefined"] = at({}, undefined, "/Users/ada");
      out["the bad id 7"] = at({}, 7, "/Users/ada");
      out["a bad id is refused before the home is looked at"] = at({}, "..", null);
      out["a good id with null for the home"] = withEnv(NO_ROOT_SETTINGS, () => outcomeByClass(() => agentPaths.resolveSandAgentDir("agent-1", null)));
      return out;
    },
  },
  {
    name: "an agent's folder is refused when the way to it from the agents' folder is not one plain name",
    run: ({ agentPaths }) => {
      // No id that passes the first check can lead out of the agents' folder on macOS or Linux, so the way between the
      // two folders is stood in for: each answer below is what Node's own `relative` would have to say.
      const out = {};
      for (const way of ["", "..", "../agent-1", "../", "..x", "...", "/abs/agent-1", "/", "a/b", "agent-1/", "agent-1", "anything else", ".", " "]) {
        const asked = [];
        out[`the way ${JSON.stringify(way)}`] = {
          ...withEnv(NO_ROOT_SETTINGS, () => standingIn(path, "relative", () => (...args) => { asked.push(args); return way; }, () => outcome(() => agentPaths.resolveSandAgentDir("agent-1", "/Users/ada")))),
          asked,
        };
      }
      return out;
    },
  },

  // ----- store-db.ts
  {
    name: "a database is given five seconds to come free, and has three files beside it",
    run: ({ storeDb }) => ({ DB_BUSY_TIMEOUT_MS: storeDb.DB_BUSY_TIMEOUT_MS, SQLITE_DB_SIDECAR_SUFFIXES: storeDb.SQLITE_DB_SIDECAR_SUFFIXES, isAList: Array.isArray(storeDb.SQLITE_DB_SIDECAR_SUFFIXES), frozen: Object.isFrozen(storeDb.SQLITE_DB_SIDECAR_SUFFIXES) }),
  },
  {
    name: "the count of writes to a database file starts at nothing, goes up by one, and is kept by the file's full path",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "store.db");
      const sameByAnotherWay = path.join(dir, "inner", "..", "store.db");
      const fromHere = path.relative(process.cwd(), file);
      const other = path.join(dir, "other.db");
      const steps = [];
      const note = (what) => steps.push([what, storeDb.getSandAgentDbWriteGeneration(file), storeDb.getSandAgentDbWriteGeneration(sameByAnotherWay), storeDb.getSandAgentDbWriteGeneration(fromHere), storeDb.getSandAgentDbWriteGeneration(other)]);
      note("at first");
      steps.push(["what a write gives back", storeDb.bumpDbWriteGeneration(file)]);
      note("after one write");
      storeDb.bumpDbWriteGeneration(sameByAnotherWay);
      storeDb.bumpDbWriteGeneration(fromHere);
      note("after two more, by its other paths");
      storeDb.bumpDbWriteGeneration(other);
      note("after a write to another file");
      steps.push(["what forgetting gives back", storeDb.deleteSandAgentDbWriteGeneration(fromHere)]);
      note("after the first file is forgotten");
      storeDb.deleteSandAgentDbWriteGeneration(file);
      note("forgotten twice");
      storeDb.bumpDbWriteGeneration(file);
      note("written to again");
      const again = await tools.fresh();
      steps.push(["in another load of the part", again.storeDb.getSandAgentDbWriteGeneration(file), again.storeDb.getSandAgentDbWriteGeneration(other)]);
      storeDb.deleteSandAgentDbWriteGeneration(file);
      storeDb.deleteSandAgentDbWriteGeneration(other);
      return steps;
    },
  },
  {
    name: "the open handles on a database file are counted up and down, never below nothing",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "store.db");
      const sameByAnotherWay = path.join(dir, "inner", "..", "store.db");
      const fromHere = path.relative(process.cwd(), file);
      const other = path.join(dir, "other.db");
      const steps = [];
      const note = (what) => steps.push({
        what,
        count: storeDb.liveDbHandleCount(file),
        countByAnotherWay: storeDb.liveDbHandleCount(sameByAnotherWay),
        countFromTheWorkingFolder: storeDb.liveDbHandleCount(fromHere),
        has: storeDb.hasLiveSandAgentDbHandle(file),
        hasByAnotherWay: storeDb.hasLiveSandAgentDbHandle(sameByAnotherWay),
        hasFromTheWorkingFolder: storeDb.hasLiveSandAgentDbHandle(fromHere),
        otherCount: storeDb.liveDbHandleCount(other),
        otherHas: storeDb.hasLiveSandAgentDbHandle(other),
      });
      note("at first");
      steps.push({ whatOpeningGivesBack: storeDb.registerLiveDbHandle(file) });
      note("one handle");
      storeDb.registerLiveDbHandle(sameByAnotherWay);
      storeDb.registerLiveDbHandle(fromHere);
      note("three handles, two by its other paths");
      steps.push({ whatClosingGivesBack: storeDb.releaseLiveDbHandle(fromHere) });
      note("one closed");
      storeDb.releaseLiveDbHandle(file);
      note("two closed");
      storeDb.releaseLiveDbHandle(sameByAnotherWay);
      note("all closed");
      storeDb.releaseLiveDbHandle(file);
      storeDb.releaseLiveDbHandle(file);
      note("closed twice more than opened");
      storeDb.registerLiveDbHandle(file);
      note("opened once after that");
      storeDb.registerLiveDbHandle(other);
      note("another file opened");
      const again = await tools.fresh();
      steps.push({ inAnotherLoadOfThePart: [again.storeDb.liveDbHandleCount(file), again.storeDb.hasLiveSandAgentDbHandle(other)] });
      storeDb.releaseLiveDbHandle(file);
      storeDb.releaseLiveDbHandle(other);
      note("all closed again");
      return steps;
    },
  },
  {
    name: "a log is folded when as many frames were written back as it held, and nothing is said of a row that is not two counts",
    run: ({ storeDb }) => {
      const rows = {
        "0 of 0": { busy: 0, log: 0, checkpointed: 0 },
        "2 of 3": { busy: 0, log: 3, checkpointed: 2 },
        "3 of 3": { busy: 0, log: 3, checkpointed: 3 },
        "4 of 3": { log: 3, checkpointed: 4 },
        "3 of 3, though busy": { busy: 1, log: 3, checkpointed: 3 },
        "0 of 1": { log: 1, checkpointed: 0 },
        "half of one": { log: 1, checkpointed: 0.5 },
        "not in that mode: -1 and -1": { busy: 0, log: -1, checkpointed: -1 },
        "-1 of 3": { log: 3, checkpointed: -1 },
        "3 of -1": { log: -1, checkpointed: 3 },
        "a hair below nothing": { log: -Number.MIN_VALUE, checkpointed: 0 },
        "minus zero of minus zero": { log: -0, checkpointed: -0 },
        "not a number of not a number": { log: Number.NaN, checkpointed: Number.NaN },
        "3 of not a number": { log: Number.NaN, checkpointed: 3 },
        "not a number of 3": { log: 3, checkpointed: Number.NaN },
        "without end of without end": { log: Number.POSITIVE_INFINITY, checkpointed: Number.POSITIVE_INFINITY },
        "counts as texts": { log: "3", checkpointed: "3" },
        "one count a text": { log: 3, checkpointed: "3" },
        "the other count a text": { log: "3", checkpointed: 3 },
        "counts as big numbers": { log: 3n, checkpointed: 3n },
        "only the log": { log: 3 },
        "only what was written back": { checkpointed: 3 },
        "counts that are null": { log: null, checkpointed: null },
        "an empty row": {},
        "a list of two counts": [3, 3],
        "a list with the two counts as fields": Object.assign([], { log: 3, checkpointed: 3 }),
        "a row with no prototype": Object.assign(Object.create(null), { log: 2, checkpointed: 2 }),
        "counts inherited": Object.create({ log: 2, checkpointed: 2 }),
        "a function with the two counts": Object.assign(() => {}, { log: 2, checkpointed: 2 }),
        null: null,
        undefined,
        "a number": 3,
        "a text": "3 of 3",
        true: true,
      };
      return Object.fromEntries(Object.entries(rows).map(([name, row]) => [name, storeDb.walFramesFullyFolded(row)]));
    },
  },
  {
    name: "folding a database's log back: a file that is not there, an empty one, and one that keeps no log",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      out["not there"] = { answer: storeDb.checkpointSandAgentDb(path.join(dir, "missing.db")), files: tree(dir) };
      fs.writeFileSync(path.join(dir, "empty.db"), "");
      out["an empty file"] = { answer: storeDb.checkpointSandAgentDb(path.join(dir, "empty.db")), files: tree(dir) };
      const plain = path.join(dir, "plain.db");
      notesDb(plain).close();
      out["a database that keeps no log"] = { answer: storeDb.checkpointSandAgentDb(plain), files: tree(dir), notes: notesOf(plain).length };
      out["the same with a time to wait of nothing"] = { answer: storeDb.checkpointSandAgentDb(plain, 0) };
      out["the same with undefined for the time to wait"] = { answer: storeDb.checkpointSandAgentDb(plain, undefined) };
      return out;
    },
  },
  {
    name: "folding a database's log back: the log is emptied, while the database is open elsewhere or after it was left behind",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const live = path.join(dir, "live.db");
      const holder = notesDb(live, { wal: true });
      const logBefore = fs.statSync(`${live}-wal`).size;
      // A copy of the database and its log, as a process that died would leave them.
      const left = path.join(dir, "left.db");
      fs.copyFileSync(live, left);
      fs.copyFileSync(`${live}-wal`, `${left}-wal`);
      out["open elsewhere"] = { logHeldSomething: logBefore > 0, answer: storeDb.checkpointSandAgentDb(live), logAfter: fs.statSync(`${live}-wal`).size };
      out["open elsewhere, a second time"] = { answer: storeDb.checkpointSandAgentDb(live), logAfter: fs.statSync(`${live}-wal`).size };
      holder.close();
      out["left behind with its log"] = { before: tree(dir), answer: storeDb.checkpointSandAgentDb(left), after: tree(dir), notes: notesOf(left) };
      return out;
    },
  },
  {
    name: "folding a database's log back: a reader in the way leaves frames behind, a writer in the way does not",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const read = path.join(dir, "read.db");
      const reader = notesDb(read, { wal: true });
      const reading = reader.prepare("SELECT id FROM notes").iterate();
      reading.next();
      const writer = new DatabaseSync(read);
      writer.exec("INSERT INTO notes (id, body) VALUES (10, 'written while another reads')");
      out["a reader holds an earlier state"] = { answer: storeDb.checkpointSandAgentDb(read, 1), logStillHoldsSomething: fs.statSync(`${read}-wal`).size > 0 };
      reading.return?.();
      out["the reader is done"] = { answer: storeDb.checkpointSandAgentDb(read, 1), logAfter: fs.statSync(`${read}-wal`).size };
      writer.exec("BEGIN IMMEDIATE");
      writer.exec("INSERT INTO notes (id, body) VALUES (11, 'not yet committed')");
      out["a writer is in the middle of a write"] = { answer: storeDb.checkpointSandAgentDb(read, 1) };
      writer.exec("COMMIT");
      out["the writer is done"] = { answer: storeDb.checkpointSandAgentDb(read, 1), logAfter: fs.statSync(`${read}-wal`).size };
      writer.close();
      reader.close();
      out.files = tree(dir);
      return out;
    },
  },
  {
    name: "folding a database's log back: what cannot be opened or read says no",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      fs.writeFileSync(path.join(dir, "words.db"), "only words, ".repeat(400));
      out["a file of words"] = storeDb.checkpointSandAgentDb(path.join(dir, "words.db"));
      fs.mkdirSync(path.join(dir, "folder.db"));
      out["a folder"] = storeDb.checkpointSandAgentDb(path.join(dir, "folder.db"));
      const logFolder = path.join(dir, "log-folder.db");
      notesDb(logFolder, { wal: true }).close();
      fs.mkdirSync(`${logFolder}-wal`);
      out["a folder where the log should be"] = storeDb.checkpointSandAgentDb(logFolder);
      fs.writeFileSync(path.join(dir, "nothing.db"), "");
      fs.mkdirSync(path.join(dir, "nothing.db-wal"));
      out["an empty file with a folder where the log should be"] = storeDb.checkpointSandAgentDb(path.join(dir, "nothing.db"));
      out.files = tree(dir);
      return out;
    },
  },
  {
    name: "folding a database's log back: the time to wait is put into the SQL as it is given",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const plain = path.join(dir, "plain.db");
      notesDb(plain).close();
      const out = {};
      for (const wait of ["'", "", "soon", Number.NaN, -5, null, 1.9, "1; CREATE TABLE made_by_the_wait (x)"]) out[`the time to wait ${typeof wait === "string" ? JSON.stringify(wait) : String(wait)}`] = storeDb.checkpointSandAgentDb(plain, wait);
      const db = new DatabaseSync(plain);
      out.tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
      db.close();
      return out;
    },
  },
  {
    name: "folding a database's log back: with no counts to go by, a log file that is empty or gone says yes",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const make = (name, log) => {
        const file = path.join(dir, name);
        notesDb(file).close();
        log(`${file}-wal`);
        return file;
      };
      const ask = (name, file) => {
        const before = tree(dir)[`${path.basename(file)}-wal`] ?? "nothing";
        out[name] = { logBefore: before, answer: storeDb.checkpointSandAgentDb(file), logAfter: tree(dir)[`${path.basename(file)}-wal`] ?? "nothing" };
      };
      ask("a database that keeps no log, with an empty log file beside it", make("empty-log.db", (log) => fs.writeFileSync(log, "")));
      ask("the same with words in the log file: SQLite takes it for a log and clears it away", make("worded-log.db", (log) => fs.writeFileSync(log, "not a log at all, only some words")));
      ask("the same with a link to nowhere for a log", make("dangling.db", (log) => fs.symlinkSync(`${log}.nowhere`, log)));
      ask("the same with a link to itself for a log", make("looped.db", (log) => fs.symlinkSync(log, log)));
      fs.writeFileSync(path.join(dir, "nothing.db"), "");
      fs.writeFileSync(path.join(dir, "nothing.db-wal"), "words");
      ask("an empty file with words in the log file: SQLite removes the log", path.join(dir, "nothing.db"));
      // What the log's size says when it is there and has something in it cannot be made to happen with a real file
      // (SQLite takes any such file for a log), so the look at the file is stood in for.
      const plain = make("plain.db", () => {});
      const looks = {
        "the look says 0 bytes": () => ({ size: 0 }),
        "the look says 1 byte": () => ({ size: 1 }),
        "the look says 12,392 bytes": () => ({ size: 12392 }),
        "the look says it is not there": () => { throw Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }); },
        "the look is not allowed": () => { throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }); },
        "the look fails with no code": () => { throw new Error("it failed"); },
        "the look fails with a text for an error": () => { throw "ENOENT"; },
      };
      for (const [name, look] of Object.entries(looks)) {
        const lookedAt = [];
        out[name] = {
          answer: standingIn(fs, "statSync", (real) => (file, ...rest) => {
            if (String(file) !== `${plain}-wal`) return real(file, ...rest);
            lookedAt.push(path.basename(String(file)));
            return look();
          }, () => storeDb.checkpointSandAgentDb(plain)),
          lookedAt,
        };
      }
      return out;
    },
  },
  {
    name: "folding a database's log back: a database that will not close is heard of, whatever the answer would have been",
    run: async ({ storeDb }, tools) => {
      const dir = await tools.tmp();
      notesDb(path.join(dir, "sound.db")).close();
      const logged = notesDb(path.join(dir, "logged.db"), { wal: true });
      seed(dir, { "words.db": "only words, ".repeat(400), "folder.db": {} });
      const out = {};
      for (const name of ["sound.db", "logged.db", "words.db", "folder.db", "missing.db"]) {
        let closes = 0;
        // Closing is stood in for: the handle is really closed, and the close then fails.
        const result = standingIn(DatabaseSync.prototype, "close", (real) => function close() {
          closes += 1;
          real.call(this);
          throw new Error("closing failed");
        }, () => outcome(() => storeDb.checkpointSandAgentDb(path.join(dir, name), 2), dir));
        out[name] = { ...result, closesThatFailed: closes };
      }
      logged.close();
      return out;
    },
  },

  // ----- sqlite-recovery.ts
  {
    name: "the three files beside a database are removed, folders among them, and the database is left",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      seed(dir, {
        "store.db": "the database",
        "store.db-wal": "its log",
        "store.db-shm": { inner: "shared", deeper: { file: "x" } },
        "store.db-journal": "its journal",
        "store.db-other": "not one of the three",
        "store.dbx-wal": "another database's log",
        "bare.db": "a database with nothing beside it",
        "half.db-shm": "a file with no database",
      });
      const db = path.join(dir, "store.db");
      const first = watched(dir, () => recovery.removeSqliteSidecars(db));
      const second = watched(dir, () => recovery.removeSqliteSidecars(db));
      const bare = watched(dir, () => recovery.removeSqliteSidecars(path.join(dir, "bare.db")));
      const half = watched(dir, () => recovery.removeSqliteSidecars(path.join(dir, "half.db")));
      return { first, "a second time": second.returned, "nothing beside it": bare.returned, "no database": half.asked, after: half.files };
    },
  },
  {
    name: "a failure to remove one of the three files is passed over",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      seed(dir, { "store.db-journal": "its journal" });
      // A path with a zero byte in it is refused by the file system's own call, each of the three times.
      return { ...watched(dir, () => recovery.removeSqliteSidecars(path.join(dir, "store\0.db"))), "a path of a zero byte alone": outcome(() => recovery.removeSqliteSidecars("\0")) };
    },
  },
  {
    name: "a path is removed: a file, a link, a folder only when asked to with all in it, and nothing where nothing is",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      seed(dir, { "a-file": "x", "a-folder": { inner: "x" }, "kept-folder": { inner: "x" }, "empty-folder": {}, target: { inner: "kept" }, "by-text": {}, "by-one": {} });
      fs.symlinkSync(path.join(dir, "target"), path.join(dir, "a-link"));
      const remove = (name, options) => watched(dir, () => recovery.removePathWithRetries({ path: path.join(dir, name), ...options }));
      const short = ({ returned, threw, asked, waits }) => ({ ...(threw === undefined ? { returned } : { threw }), asked, waits });
      return {
        "a file": short(remove("a-file")),
        "a link to a folder": short(remove("a-link")),
        "nothing there": short(remove("missing")),
        "a folder, with all in it": short(remove("a-folder", { recursive: true })),
        "a folder, not asked to": short(remove("kept-folder")),
        "a folder, told not to": short(remove("kept-folder", { recursive: false })),
        "an empty folder, not asked to": short(remove("empty-folder")),
        "a folder, asked with a text": short(remove("by-text", { recursive: "yes" })),
        "a folder, asked with a one": short(remove("by-one", { recursive: 1 })),
        "a path with a zero byte in it": outcome(() => recovery.removePathWithRetries({ path: "a\0b" })).threw.code,
        after: tree(dir),
      };
    },
  },
  {
    name: "a path that will not go is tried again after a wait, as many times as asked and at least once",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      seed(dir, { stubborn: { inner: "x" } });
      const out = {};
      const tries = (options) => {
        const { returned, threw, asked, waits } = watched(dir, () => recovery.removePathWithRetries({ path: path.join(dir, "stubborn"), ...options }));
        return { ...(threw === undefined ? { returned } : { threw: threw.code }), asked, waits };
      };
      for (const attempts of [undefined, null, 1, 0, -2, 2, 3, 2.5, 1.5, Number.NaN, "2"]) out[`attempts ${typeof attempts === "string" ? `"${attempts}"` : String(attempts)}`] = tries({ attempts });
      for (const retryDelayMs of [undefined, null, 0, 7, 50, 51, -1]) out[`two tries, a wait of ${String(retryDelayMs)}`] = tries({ attempts: 2, retryDelayMs }).asked.filter((line) => line.startsWith("wait"));
      out["still there after all of it"] = tree(dir);
      return out;
    },
  },
  {
    name: "a path that goes on a later try is removed and nothing is thrown",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      for (const [name, attempts, goesDuringWait] of [["on the second try of five", 5, 1], ["on the last of three tries", 3, 2], ["on the second try of two, told nothing of the wait", 2, 1]]) {
        seed(dir, { stubborn: { inner: "x" } });
        out[name] = watched(dir, () => recovery.removePathWithRetries({ path: path.join(dir, "stubborn"), attempts, ...(attempts === 2 ? {} : { retryDelayMs: 4 }) }), {
          duringWait: (n) => {
            if (n !== goesDuringWait) return;
            // The folder gives way to a file, which the next try can remove.
            fs.unlinkSync(path.join(dir, "stubborn", "inner"));
            fs.rmdirSync(path.join(dir, "stubborn"));
            fs.writeFileSync(path.join(dir, "stubborn"), "now a file");
          },
        });
      }
      return out;
    },
  },
  {
    name: "the wait between two tries is a real one, 50 ms unless told",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      seed(dir, { stubborn: { inner: "x" } });
      const timed = (options) => {
        const started = performance.now();
        const result = outcome(() => recovery.removePathWithRetries({ path: path.join(dir, "stubborn"), ...options }), dir);
        return { threw: result.threw, took: performance.now() - started };
      };
      const told30 = timed({ attempts: 3, retryDelayMs: 30 });
      const untold = timed({ attempts: 2 });
      const once = timed({ attempts: 1, retryDelayMs: 400 });
      return {
        "three tries, 30 ms": { threw: told30.threw, waitedTwice: told30.took >= 58, andNotLong: told30.took < 400 },
        "two tries, not told": { threw: untold.threw, waitedOnce: untold.took >= 48, andNotLong: untold.took < 400 },
        "one try does not wait": { threw: once.threw, didNotWait: once.took < 300 },
      };
    },
  },
  {
    name: "a database is removed with the three files beside it, and not when it is a folder",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      seed(dir, { "store.db": "the database", "store.db-wal": "its log", "store.db-shm": { inner: "shared" }, "store.db-journal": "its journal", "other.db": "another database", "other.db-wal": "its log" });
      out["a database and all three"] = watched(dir, () => recovery.removeSqliteDb({ dbPath: path.join(dir, "store.db") }));
      out["nothing there"] = watched(dir, () => recovery.removeSqliteDb({ dbPath: path.join(dir, "store.db") })).asked;
      seed(dir, { "only.db-shm": "a file with no database" });
      out["only one of the three"] = watched(dir, () => recovery.removeSqliteDb({ dbPath: path.join(dir, "only.db"), attempts: 4, retryDelayMs: 1 })).asked;
      seed(dir, { "folder.db": { inner: "x" }, "folder.db-wal": "its log" });
      out["a folder for a database, tried once"] = watched(dir, () => recovery.removeSqliteDb({ dbPath: path.join(dir, "folder.db") }));
      out["a folder for a database, tried three times 9 ms apart"] = (({ threw, asked, waits }) => ({ threw: threw?.code, asked, waits }))(watched(dir, () => recovery.removeSqliteDb({ dbPath: path.join(dir, "folder.db"), attempts: 3, retryDelayMs: 9 })));
      out["a folder that gives way during the first wait"] = watched(dir, () => recovery.removeSqliteDb({ dbPath: path.join(dir, "folder.db"), attempts: 2, retryDelayMs: 2 }), {
        duringWait: () => {
          fs.unlinkSync(path.join(dir, "folder.db", "inner"));
          fs.rmdirSync(path.join(dir, "folder.db"));
        },
      });
      return out;
    },
  },
  {
    name: "a damaged database is set aside under its name, \".corrupt-\" and the moment, with the files beside it",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      seed(dir, { "store.db": "the database", "store.db-wal": "its log", "store.db-shm": "its shared memory", "store.db-journal": "its journal", "other.db": "another database" });
      out["all four files"] = scrubbed(atTime(MOMENT, () => watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db") }))), dir);
      seed(dir, { "alone.db": "a database alone" });
      out["a database alone, at midnight on the first day of a year"] = scrubbed(atTime("2027-01-01T00:00:00.000Z", () => watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "alone.db") }))), dir);
      seed(dir, { "folder.db": { inner: "x" }, "folder.db-shm": { inner: "y" } });
      out["a folder for a database is moved like a file"] = scrubbed(atTime(MOMENT, () => watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "folder.db"), quarantinePath: undefined }))), dir);
      return out;
    },
  },
  {
    name: "a damaged database is set aside where told, over what was there before",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      seed(dir, {
        "store.db": "the database",
        "store.db-wal": "its log",
        "aside.db": "an earlier one set aside",
        "aside.db-wal": "the earlier one's log",
        "aside.db-shm": { inner: "the earlier one's shared memory" },
        "aside.db-journal": "the earlier one's journal",
      });
      out["over an earlier one"] = scrubbed(atTime(MOMENT, () => watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db") }))), dir);
      seed(dir, { "second.db": "a second database", "second.db-journal": "its journal" });
      out["with every other option set, none of which matters when the move works"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "second.db"), quarantinePath: path.join(dir, "aside-2.db"), preserveSourceOnCopyFailure: true, removeAttempts: 3, removeRetryDelayMs: 1 })), dir);
      seed(dir, { "third.db": "a third database" });
      out["onto itself"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "third.db"), quarantinePath: path.join(dir, "third.db") })), dir);
      return out;
    },
  },
  {
    name: "a database that is not there is not set aside: what is beside it is removed, unless asked to leave it",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      seed(dir, { "gone.db-wal": "a log with no database", "gone.db-shm": { inner: "x" }, "aside.db": "an earlier one set aside", "aside.db-journal": "the earlier one's journal" });
      out["asked to leave it"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "gone.db"), quarantinePath: path.join(dir, "aside.db"), preserveSourceOnCopyFailure: true })), dir);
      seed(dir, { "aside.db": "an earlier one set aside" });
      out["asked with a text, which is not asking"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "gone.db"), quarantinePath: path.join(dir, "aside.db"), preserveSourceOnCopyFailure: "true" })), dir);
      seed(dir, { "gone.db-journal": "a journal with no database" });
      out["not asked, at the moment's own name"] = scrubbed(atTime(MOMENT, () => watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "gone.db") }))), dir);
      out["told not to leave it"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "gone.db"), quarantinePath: path.join(dir, "aside.db"), preserveSourceOnCopyFailure: false })), dir).returned;
      return out;
    },
  },
  {
    name: "a folder in the place a database would be set aside is left with all beside it, and the database is lost or left",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const layout = () => seed(dir, { "store.db": "the database", "store.db-wal": "its log", "aside.db": { inner: "x" }, "aside.db-wal": "an earlier log, not cleared away" });
      layout();
      out["asked to leave it"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db"), preserveSourceOnCopyFailure: true })), dir);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir);
      layout();
      out["not asked"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db") })), dir);
      return out;
    },
  },
  {
    name: "a database that cannot be moved is copied aside with the files beside it, then removed",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      seed(dir, { "store.db": "the database", "store.db-wal": "its log", "store.db-shm": { inner: "a folder cannot be copied" }, "aside.db-journal": "an earlier journal" });
      out["a move across two disks"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db") }), { failMove: acrossDisks }), dir);
      seed(dir, { "all.db": "a database", "all.db-wal": "its log", "all.db-shm": "its shared memory", "all.db-journal": "its journal" });
      out["with all three beside it, at the moment's own name"] = scrubbed(atTime(MOMENT, () => watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "all.db"), preserveSourceOnCopyFailure: true, removeAttempts: 2, removeRetryDelayMs: 1 }), { failMove: acrossDisks })), dir);
      const codes = { "no code": new Error("it failed"), "a code that is null": Object.assign(new Error("it failed"), { code: null }), "a code that is nothing": Object.assign(new Error("it failed"), { code: 0 }), "a code that is an empty text": Object.assign(new Error("it failed"), { code: "" }), "a code that is a number": Object.assign(new Error("it failed"), { code: -18 }), "a text for an error": "EXDEV", "a plain object with a code": { code: "EBUSY" } };
      for (const [name, error] of Object.entries(codes)) {
        seed(dir, { "coded.db": "a database" });
        out[`the move fails with ${name}`] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "coded.db"), quarantinePath: path.join(dir, "coded-aside.db") }), { failMove: () => error }), dir).returned;
      }
      return out;
    },
  },
  {
    name: "a database that can be neither moved nor copied is removed, or left where it is when asked",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const layout = { "store.db": { inner: "a folder cannot be copied" }, "store.db-wal": "its log" };
      seed(dir, layout);
      out["asked to leave it"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db"), preserveSourceOnCopyFailure: true, removeAttempts: 3, removeRetryDelayMs: 1 }), { failMove: acrossDisks }), dir);
      out["not asked, and it will not go: tried once"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db") }), { failMove: acrossDisks }), dir);
      out["not asked, and it will not go: tried three times 6 ms apart"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db"), removeAttempts: 3, removeRetryDelayMs: 6 }), { failMove: acrossDisks }), dir);
      out["not asked, and it goes on the second try"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db"), removeAttempts: 2, removeRetryDelayMs: 6 }), {
        failMove: acrossDisks,
        duringWait: () => {
          fs.unlinkSync(path.join(dir, "store.db", "inner"));
          fs.rmdirSync(path.join(dir, "store.db"));
        },
      }), dir);
      return out;
    },
  },
  {
    name: "a file beside the database that cannot be moved with it is removed, and one that cannot be removed stops the work",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const onlyTheLog = (name) => (name.endsWith("-wal") ? acrossDisks() : undefined);
      seed(dir, { "store.db": "the database", "store.db-wal": "its log", "store.db-shm": "its shared memory", "store.db-journal": "its journal" });
      out["the log will not move"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "store.db"), quarantinePath: path.join(dir, "aside.db") }), { failMove: onlyTheLog }), dir);
      seed(dir, { "second.db": "a second database", "second.db-wal": { inner: "a folder for a log" }, "second.db-shm": "its shared memory" });
      out["a folder for a log will not move, and is not removed either"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "second.db"), quarantinePath: path.join(dir, "aside-2.db") }), { failMove: onlyTheLog }), dir);
      seed(dir, { "third.db": "a third database", "third.db-wal": "its log", "third.db-shm": "its shared memory", "third.db-journal": "its journal" });
      out["none of the three will move"] = scrubbed(watched(dir, () => recovery.quarantineCorruptSqliteDb({ dbPath: path.join(dir, "third.db"), quarantinePath: path.join(dir, "aside-3.db") }), { failMove: (name) => (name.endsWith(".db") ? undefined : acrossDisks()) }), dir);
      return out;
    },
  },
  {
    name: "a database is opened for reading what is left of it: nothing where there is no file, the database where it is sound",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      out["no file"] = opened(recovery.openSqliteForSalvage({ dbPath: path.join(dir, "missing.db") }), dir);
      out["no file, with a time to wait"] = opened(recovery.openSqliteForSalvage({ dbPath: path.join(dir, "missing.db"), busyTimeoutMs: 5 }), dir);
      const sound = path.join(dir, "sound.db");
      notesDb(sound).close();
      seed(dir, { "sound.db-journal": "words that are no journal" });
      out["a sound database"] = opened(recovery.openSqliteForSalvage({ dbPath: sound }), dir);
      for (const busyTimeoutMs of [undefined, null, 0, 250, 1.9, -5, "75"]) out[`a sound database, time to wait ${typeof busyTimeoutMs === "string" ? `"${busyTimeoutMs}"` : String(busyTimeoutMs)}`] = opened(recovery.openSqliteForSalvage({ dbPath: sound, busyTimeoutMs }), dir).busyTimeout;
      fs.writeFileSync(path.join(dir, "empty.db"), "");
      out["an empty file"] = opened(recovery.openSqliteForSalvage({ dbPath: path.join(dir, "empty.db") }), dir);
      const logged = path.join(dir, "logged.db");
      const holder = notesDb(logged, { wal: true });
      out["a database open elsewhere, with its log"] = opened(recovery.openSqliteForSalvage({ dbPath: logged, busyTimeoutMs: 1 }), dir);
      holder.close();
      out.files = tree(dir);
      return out;
    },
  },
  {
    name: "a database that will not open is tried again without the files beside it, and handed over as it is when that fails too",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const out = {};
      const ask = (name, file, options = {}) => {
        const before = tree(dir);
        const got = watched(dir, () => opened(recovery.openSqliteForSalvage({ dbPath: file, ...options }), dir));
        const mine = (files) => Object.fromEntries(Object.entries(files).filter(([entry]) => entry.startsWith(path.basename(file))));
        out[name] = { before: mine(before), opened: got.returned ?? got.threw, asked: got.asked, after: mine(got.files) };
      };
      const logFolder = path.join(dir, "log-folder.db");
      notesDb(logFolder, { wal: true }).close();
      seed(dir, { "log-folder.db-wal": { inner: "x" } });
      ask("a folder where the log should be", logFolder);
      const journalFolder = path.join(dir, "journal-folder.db");
      notesDb(journalFolder).close();
      seed(dir, { "journal-folder.db-journal": { inner: "x" }, "journal-folder.db-shm": "a stray file" });
      ask("a folder where the journal should be", journalFolder, { busyTimeoutMs: 20 });
      seed(dir, { "words.db": "only words, ".repeat(400), "words.db-wal": "a log of words", "words.db-shm": { inner: "x" } });
      ask("a file of words", path.join(dir, "words.db"));
      seed(dir, { "folder.db": { inner: "x" }, "folder.db-journal": "a journal" });
      ask("a folder", path.join(dir, "folder.db"));
      const sound = path.join(dir, "sound.db");
      notesDb(sound).close();
      seed(dir, { "sound.db-shm": "a stray file" });
      ask("a sound database with a time to wait that is not SQL", sound, { busyTimeoutMs: "'" });
      const torn = path.join(dir, "torn.db");
      tornDb(torn);
      ask("a database with a wiped page opens, and fails when read", torn);
      return out;
    },
  },
  {
    name: "a handle that will not close after a failed first look does not stop the next try",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      seed(dir, { "words.db": "only words, ".repeat(400), "words.db-wal": "a log of words" });
      const logFolder = path.join(dir, "log-folder.db");
      notesDb(logFolder, { wal: true }).close();
      seed(dir, { "log-folder.db-wal": { inner: "x" } });
      const out = {};
      for (const name of ["words.db", "log-folder.db"]) {
        let closes = 0;
        // Closing is stood in for: the handle is really closed, and the close then fails.
        const db = standingIn(DatabaseSync.prototype, "close", (real) => function close() {
          closes += 1;
          real.call(this);
          throw new Error("closing failed");
        }, () => outcome(() => recovery.openSqliteForSalvage({ dbPath: path.join(dir, name), busyTimeoutMs: 3 }), dir));
        out[name] = { closesThatFailed: closes, opened: db.threw ?? opened(db.returned, dir) };
      }
      out.files = tree(dir);
      return out;
    },
  },
  {
    name: "a database another connection holds is handed over all the same, and the holder's journal is removed under it",
    run: async ({ recovery, busy }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "held.db");
      const holder = notesDb(file);
      holder.exec("BEGIN EXCLUSIVE");
      holder.exec("INSERT INTO notes (id, body) VALUES (4, 'written by the holder')");
      // By name only: how long the holder's journal is at this point is SQLite's own business.
      const before = Object.keys(tree(dir));
      const got = watched(dir, () => {
        const db = recovery.openSqliteForSalvage({ dbPath: file, busyTimeoutMs: 1 });
        const whileHeld = { handle: db?.constructor.name, open: db?.isOpen, notes: outcome(() => notesIn(db), dir) };
        let commit;
        try {
          holder.exec("COMMIT");
          commit = "done";
        } catch (error) {
          commit = { errcode: error.errcode, words: error.message, readOrWrite: busy.isSqliteIoError(error) };
        }
        const afterCommit = outcome(() => notesIn(db), dir);
        db?.close();
        return { whileHeld, commit, afterCommit };
      });
      holder.close();
      return { before, ...(got.returned ?? { threw: got.threw }), asked: got.asked, after: tree(dir), notesAfter: notesOf(file) };
    },
  },
  {
    name: "rows are copied from one database to another, one at a time, and counted",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const source = notesDb(path.join(dir, "source.db"), { rows: 5 });
      source.exec("INSERT INTO notes (id, body) VALUES (6, NULL)");
      const out = {};
      const into = (name, { sql = "SELECT id, body FROM notes ORDER BY id", insertSql = "INSERT INTO notes (id, body) VALUES (?, ?)", toParams = (row) => [row.id, row.body], seedRows = [] } = {}) => {
        const target = new DatabaseSync(path.join(dir, `${name}.db`));
        target.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL DEFAULT 'none')");
        for (const [id, body] of seedRows) target.prepare("INSERT INTO notes (id, body) VALUES (?, ?)").run(id, body);
        target.exec("BEGIN");
        const copied = outcome(() => recovery.copySalvageableSqliteRows(source, sql, target.prepare(insertSql), toParams), dir);
        target.exec("COMMIT");
        const result = { copied, target: notesIn(target) };
        target.close();
        return result;
      };
      out["every row that the other table takes: the one with no body is passed over"] = into("all");
      out["rows already there are passed over"] = into("some-there", { seedRows: [[2, "there before"], [4, "there before"]] });
      out["rows already there are kept when the insert says so, and counted"] = into("ignored", { insertSql: "INSERT OR IGNORE INTO notes (id, body) VALUES (?, ?)", seedRows: [[2, "there before"]] });
      out["a row whose values cannot be worked out is passed over"] = into("picky", { toParams: (row) => { if (row.id === 3) throw new Error("not this one"); return [row.id, row.body ?? "filled in"]; } });
      out["values that are not a list are passed over"] = into("not-a-list", { toParams: (row) => (row.id % 2 === 0 ? undefined : [row.id, "odd"]) });
      out["too many values are passed over"] = into("too-many", { toParams: (row) => (row.id === 1 ? [row.id, "one", "extra"] : [row.id, "kept"]) });
      out["a table that is not there"] = into("no-table", { sql: "SELECT id, body FROM missing" });
      out["a question that is not SQL"] = into("not-sql", { sql: "not sql at all" });
      out["a question with no rows"] = into("no-rows", { sql: "SELECT id, body FROM notes WHERE id > 100" });
      out["rows in the order asked"] = into("backwards", { sql: "SELECT id, body FROM notes WHERE body IS NOT NULL ORDER BY id DESC", toParams: (row) => [10 - row.id, row.body] });
      source.close();
      const closed = new DatabaseSync(path.join(dir, "closed.db"));
      closed.close();
      out["a database that is closed"] = outcome(() => recovery.copySalvageableSqliteRows(closed, "SELECT 1", standInWriter([]), () => []), dir);
      return out;
    },
  },
  {
    name: "rows are read until the read fails, each is written on its own, and the read is closed whatever happens",
    run: ({ recovery }) => {
      const out = {};
      const copy = (name, steps, options = {}, { failsOn, toParams = (row) => [row.id, row.body] } = {}) => {
        const { source, log } = standInRows(steps, options);
        const result = outcomeByClass(() => recovery.copySalvageableSqliteRows(source, "SELECT id, body FROM notes", standInWriter(log, failsOn), (...args) => { log.push(`values(${args.length})`); return toParams(...args); }));
        out[name] = { ...result, log };
      };
      const row = (id) => ({ done: false, value: { id, body: `note ${id}` } });
      copy("three rows", [row(1), row(2), row(3), "end"]);
      copy("no rows", ["end"]);
      copy("the read fails on the third row", [row(1), row(2), "throw", row(4), "end"]);
      copy("the read fails on the first row", ["throw", row(2), "end"]);
      copy("the second row will not be written", [row(1), row(2), row(3), "end"], {}, { failsOn: ([id]) => id === 2 });
      copy("no row will be written", [row(1), row(2), "end"], {}, { failsOn: () => true });
      copy("the second row's values cannot be worked out", [row(1), row(2), row(3), "end"], {}, { toParams: (value) => { if (value.id === 2) throw new Error("not this one"); return [value.id]; } });
      copy("a row with no value", [{ done: false, value: undefined }, row(2), "end"], {}, { toParams: (value) => [value === undefined ? "nothing" : value.id] });
      copy("the question cannot be prepared", [row(1), "end"], { prepareThrows: true });
      copy("the question cannot be stepped through", [row(1), "end"], { iterateThrows: true });
      copy("a read with nothing to close it", [row(1), row(2), "end"], { withReturn: false });
      copy("a read that fails, with nothing to close it", [row(1), "throw"], { withReturn: false });
      copy("closing the read fails", [row(1), "end"], { returnThrows: true });
      copy("closing the read fails after the read failed", [row(1), "throw"], { returnThrows: true });
      copy("an end said with a one", [row(1), { done: 1, value: { id: 9, body: "after the end" } }, row(3), "end"]);
      copy("an end not said at all", [{ value: { id: 1, body: "no word of an end" } }, { done: 0, value: { id: 2, body: "an end of nothing" } }, { done: "", value: { id: 3, body: "an end of no words" } }, "end"]);
      copy("a read that gives nothing back", [row(1), undefined, row(3), "end"]);
      copy("a read that gives null back", [row(1), null, row(3), "end"]);
      return out;
    },
  },
  {
    name: "what can still be read of a database with a wiped page is copied, up to the page",
    run: async ({ recovery }, tools) => {
      const dir = await tools.tmp();
      const torn = path.join(dir, "torn.db");
      tornDb(torn);
      // As the engine does it: set the damaged file aside, open what was set aside, copy its rows into a new one.
      const aside = atTime(MOMENT, () => recovery.quarantineCorruptSqliteDb({ dbPath: torn }));
      const source = recovery.openSqliteForSalvage({ dbPath: aside.quarantinePath });
      const fresh = notesDb(torn, { rows: 0 });
      fresh.exec("BEGIN");
      const copied = recovery.copySalvageableSqliteRows(source, "SELECT id, body FROM notes", fresh.prepare("INSERT OR IGNORE INTO notes (id, body) VALUES (?, ?)"), (row) => [row.id, row.body]);
      fresh.exec("COMMIT");
      // The same question asked by hand, for the number of rows before the wiped page.
      let readable = 0;
      try {
        for (const row of source.prepare("SELECT id, body FROM notes").iterate()) readable += row === undefined ? 0 : 1;
      } catch {
        // The wiped page.
      }
      source.close();
      const kept = notesIn(fresh);
      fresh.close();
      return { aside: scrubbed(aside, dir), copied, readableByHand: readable, keptRows: kept.length, first: kept[0], last: kept.at(-1), files: tree(dir) };
    },
  },
];

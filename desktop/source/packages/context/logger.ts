/**
 * Logging through the context. A logger writes nothing itself: it hands each
 * line to the backend the context carries, so whoever makes a context
 * decides where the lines of everything below it go. A context that was
 * given no backend has the terminal backend of this file, which writes one
 * readable line through the console.
 */
import { createKey, type Context, type ContextKey } from "./core.js";

export type ContextLogLevel = "debug" | "info" | "warn" | "error";

export interface ContextLogEntry {
  readonly level: ContextLogLevel;
  readonly message: string;
  readonly timestamp: Date;
  readonly context?: unknown | undefined;
  readonly error?: unknown | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ContextLoggerBackend {
  log(context: Context, entry: ContextLogEntry): void;
}

export interface ContextLogger {
  debug(context: Context, message: string, metadata?: Readonly<Record<string, unknown>>): void;
  info(context: Context, message: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn(context: Context, message: string, metadata?: Readonly<Record<string, unknown>>): void;
  error(context: Context, message: string, error: unknown, metadata?: Readonly<Record<string, unknown>>): void;
}

// ── The terminal backend: one line for an entry, short enough to read ──

/** How deep lists, maps and objects are written out; deeper, only their kind is. */
const MAX_DEPTH = 6;
/** How many fields of an object, or pairs of a map, are written before the rest is only counted. */
const MAX_FIELDS = 50;
/** The same for the items of a list. */
const MAX_ITEMS = 40;
/** How many characters of a text are written before it is cut. */
const MAX_TEXT = 200;
/** What sets the lines of an error's trace in from the line they belong to. */
const TRACE_INDENT = "  ";

/**
 * Whether lines are coloured, from where the process runs: NO_COLOR, set to
 * anything, and TERM=dumb say no; then FORCE_COLOR says yes ("1", "true") or
 * no ("0"); otherwise an output that is a terminal says yes.
 */
function colourWanted(): boolean {
  if (typeof process === "undefined") return false;
  const env = process.env ?? {};
  if ("NO_COLOR" in env || env.TERM === "dumb") return false;
  const forced = env.FORCE_COLOR;
  if (forced === "1" || forced === "true") return true;
  if (forced === "0") return false;
  return Boolean(process.stdout?.isTTY);
}

/** Decided once, when this file is loaded, and for every line after. */
const COLOURED = colourWanted();
/** The console as it was when this file was loaded. Its methods are looked up at each line. */
const output = console;

type Paint = (text: string) => string;

/** The text between the codes given and a reset; where nothing is coloured, the very thing it was handed. */
function paint(...codes: number[]): Paint {
  return (text) => (COLOURED ? `\u001b[${codes.join(";")}m${text}\u001b[0m` : text);
}

const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const blue = paint(34);
const magenta = paint(35);
const cyan = paint(36);
const gray = paint(90);

interface LevelLook {
  /** The colour of the level's name. */
  readonly tint: Paint;
  /** Whether the message is written in bold. */
  readonly loud: boolean;
  /** The console's method the line goes through. */
  readonly through: "log" | "warn" | "error";
}

const LEVELS = new Map<unknown, LevelLook>([
  ["debug", { tint: magenta, loud: false, through: "log" }],
  ["info", { tint: blue, loud: false, through: "log" }],
  ["warn", { tint: yellow, loud: false, through: "warn" }],
  ["error", { tint: paint(1, 31), loud: true, through: "error" }],
]);

/** The fields that make an object be written as an error, whatever else it is. */
const ERROR_FIELDS = ["message", "stack", "name", "cause"] as const;

type ErrorLike = Record<PropertyKey, unknown> & {
  readonly name?: unknown;
  readonly message?: unknown;
  readonly stack?: unknown;
  readonly cause?: unknown;
};

function looksLikeAnError(value: unknown): value is ErrorLike {
  if (typeof value !== "object" || value === null) return false;
  return ERROR_FIELDS.some((field) => field in value);
}

/** An object that stands for something too long to write: only its summary is written. */
function isSummary(value: unknown): value is { readonly kind: "summary"; readonly summary: string } {
  if (typeof value !== "object" || value === null) return false;
  const held = value as { kind?: unknown; summary?: unknown };
  return held.kind === "summary" && typeof held.summary === "string";
}

/** Whether an entry's context can say where the line comes from. Anything else is written out like a value. */
function tellsItsPath(value: unknown): value is Pick<Context, "getPath"> {
  if (typeof value !== "object" || value === null) return false;
  return "getPath" in value && typeof value.getPath === "function";
}

/** Twelve characters of the time as ISO writes it: hours, minutes, seconds and milliseconds, in UTC. */
function timeOfDay(timestamp: Date): string {
  return timestamp.toISOString().slice(11, 23);
}

/** Pieces between an opening and a closing mark, with commas, and a count of what was left out. */
function enclosed(opening: string, pieces: string[], leftOut: number, closing: string): string {
  if (leftOut > 0) pieces.push(dim(`... ${leftOut} more`));
  return `${dim(opening)}${pieces.join(dim(", "))}${dim(closing)}`;
}

/**
 * One value, written short. `open` holds the lists, maps, objects and errors
 * being written around it, so that one found inside itself is named and not
 * followed. What a value is taken for is decided in this order: a summary
 * first, then the plain kinds, a date or a pattern, anything with an error's
 * fields, a list, bytes, a map, a set, and last any other object.
 */
function brief(value: unknown, depth: number, open: WeakSet<object>): string {
  if (isSummary(value)) return dim(`<${value.summary}>`);
  if (value === null) return gray("null");
  if (value === undefined) return gray("undefined");
  switch (typeof value) {
    case "string":
      return green(JSON.stringify(value.length <= MAX_TEXT ? value : `${value.slice(0, MAX_TEXT)}...`));
    case "number":
      return yellow(String(value));
    case "boolean":
      return magenta(String(value));
    case "bigint":
      return yellow(`${value}n`);
    case "symbol":
      return cyan(value.toString());
    case "function":
      return dim(`[Function${value.name ? ` ${value.name}` : ""}]`);
  }
  if (value instanceof Date) return green(Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString());
  if (value instanceof RegExp) return cyan(value.toString());
  if (looksLikeAnError(value)) return errorBrief(value, depth, open);
  if (Array.isArray(value)) return listBrief(value, depth, open);
  if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) return dim(`ArrayBuffer(${value.byteLength})`);
    if (typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
      return dim(`${value.constructor?.name ?? "TypedArray"}(${value.byteLength})`);
    }
  }
  if (value instanceof Map) return mapBrief(value, depth, open);
  // A set is written as the list of what it holds. The set itself is not kept in `open`.
  if (value instanceof Set) return listBrief(Array.from(value.values()), depth, open);
  return objectBrief(value, depth, open);
}

/** An error by its name and message, and its cause after it. Errors are followed however deep they are. */
function errorBrief(error: ErrorLike, depth: number, open: WeakSet<object>): string {
  if (open.has(error)) return dim("[Circular]");
  open.add(error);
  const name = typeof error.name === "string" ? error.name : "Error";
  const message = typeof error.message === "string" ? error.message : "";
  let told = red(message ? `${name}: ${message}` : name);
  if ("cause" in error && error.cause !== undefined) {
    told = `${told} ${dim("cause=")}${brief(error.cause, depth + 1, open)}`;
  }
  open.delete(error);
  return told;
}

function listBrief(list: readonly unknown[], depth: number, open: WeakSet<object>): string {
  if (depth >= MAX_DEPTH) return dim(`[Array(${list.length})]`);
  if (open.has(list)) return dim("[Circular]");
  if (list.length === 0) return dim("[]");
  open.add(list);
  const written = Math.min(list.length, MAX_ITEMS);
  // A gap in the list stays a gap here, and is written as nothing between its commas.
  const items = list.slice(0, written).map((item) => brief(item, depth + 1, open));
  open.delete(list);
  return enclosed("[", items, list.length - written, "]");
}

function mapBrief(map: Map<unknown, unknown>, depth: number, open: WeakSet<object>): string {
  if (depth >= MAX_DEPTH) return dim(`Map(${map.size})`);
  if (open.has(map)) return dim("[Circular]");
  open.add(map);
  const pairs = Array.from(map.entries());
  const written = Math.min(pairs.length, MAX_FIELDS);
  const items = pairs.slice(0, written).map(([key, held]) => {
    const keyWritten = brief(key, depth + 1, open);
    // Each key is also turned into a text, as it always was, though that text is not written: a key that cannot be one stops the line here.
    String(key);
    return `${keyWritten} ${dim("=>")} ${brief(held, depth + 1, open)}`;
  });
  open.delete(map);
  return enclosed("Map{", items, pairs.length - written, "}");
}

function objectBrief(value: object, depth: number, open: WeakSet<object>): string {
  if (depth >= MAX_DEPTH) return dim(`[${value.constructor?.name ?? "Object"}]`);
  if (open.has(value)) return dim("[Circular]");
  const fields = Object.entries(value);
  if (fields.length === 0) return dim("{}");
  open.add(value);
  const written = Math.min(fields.length, MAX_FIELDS);
  const items = fields.slice(0, written).map(([field, held]) => `${cyan(field)}: ${brief(held, depth + 1, open)}`);
  open.delete(value);
  return enclosed("{", items, fields.length - written, "}");
}

/**
 * Writes an entry: the time of day, the level, the message, then where it
 * comes from (`ctx=`) or what its context holds (`context=`), what was added
 * (`meta=`) and the error (`error=`), whose trace follows on lines of its
 * own. Everything is written out before the level is looked at for the last
 * time: an entry whose level is none of the four is refused only then.
 */
function writeLine(entry: ContextLogEntry): void {
  const pieces: string[] = [dim(timeOfDay(entry.timestamp))];
  const label = entry.level.toUpperCase().padEnd(5);
  const look = LEVELS.get(entry.level);
  pieces.push(look ? look.tint(label) : label);
  pieces.push(look?.loud ? bold(entry.message) : entry.message);

  const open = new WeakSet<object>();
  const from = entry.context;
  if (tellsItsPath(from)) {
    const path = from.getPath();
    if (path.length > 0) pieces.push(dim(`ctx=${path.join("/")}`));
  } else if (from && Object.keys(from).length > 0) {
    pieces.push(`${dim("context=")}${brief(from, 0, open)}`);
  }
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    pieces.push(`${dim("meta=")}${brief(entry.metadata, 0, open)}`);
  }

  const lines = [pieces.join(" ")];
  const failure = entry.error;
  if (looksLikeAnError(failure)) {
    lines[0] = `${lines[0]} ${dim("error=")}${errorBrief(failure, 0, open)}`;
    if (typeof failure.stack === "string") {
      // The trace's first line says the error again, and is left out.
      for (const traced of failure.stack.split("\n").slice(1)) {
        const trimmed = traced.trim();
        if (trimmed) lines.push(`${TRACE_INDENT}${dim(trimmed)}`);
      }
    }
  } else if (failure !== undefined) {
    lines[0] = `${lines[0]} ${dim("error=")}${brief(failure, 0, open)}`;
  }

  if (look === undefined) throw new Error(`Unhandled log level: ${String(entry.level)}`);
  output[look.through](lines.join("\n"));
}

/** The backend of a context that was given none. */
const terminal: ContextLoggerBackend = { log: (_context, entry) => writeLine(entry) };

// ── What the rest of the engine uses ──

export const loggerKey: ContextKey<ContextLoggerBackend> = createKey(Symbol("loggerBackend"), terminal);

export function getLoggerBackend(context: Context): ContextLoggerBackend {
  return context.get(loggerKey);
}

/** A logger. The name is not used: a line says where it comes from by the names of its context. */
export function createLogger(_name: string): ContextLogger {
  /** Stamps a line with the time, then hands it to the backend its context carries at that moment. */
  function hand(context: Context, line: Omit<ContextLogEntry, "timestamp">): void {
    const timestamp = new Date();
    getLoggerBackend(context).log(context, { ...line, timestamp });
  }
  return {
    debug: (context, message, metadata) => hand(context, { level: "debug", message, context, metadata }),
    info: (context, message, metadata) => hand(context, { level: "info", message, context, metadata }),
    warn: (context, message, metadata) => hand(context, { level: "warn", message, context, metadata }),
    error: (context, message, error, metadata) => hand(context, { level: "error", message, context, error, metadata }),
  };
}

/** A backend that puts the attributes before what each line adds, and hands the line on. Where both name the same thing, the line's own wins. */
function withAttributes(backend: ContextLoggerBackend, attributes: Readonly<Record<string, unknown>>): ContextLoggerBackend {
  return {
    log(context, entry) {
      backend.log(context, { ...entry, metadata: { ...attributes, ...entry.metadata } });
    },
  };
}

/**
 * A context whose lines all carry `attributes`. The attributes are copied
 * now, and the lines go to the backend the context has now.
 */
export function withLogAttributes(context: Context, attributes: Readonly<Record<string, unknown>>): Context {
  return context.with(loggerKey, withAttributes(context.get(loggerKey), { ...attributes }));
}

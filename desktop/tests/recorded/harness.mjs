/**
 * Recorded behaviour of the engine's parts (13 November 2026).
 *
 * A part of the engine is written down here as scenarios: each calls the
 * part's own exports with fixed inputs, and what comes back (or what is
 * thrown) is kept in a file beside the scenarios, `<part>.json`. The test
 * (`tests/recorded-behaviour.test.mjs`) runs every scenario again and fails
 * when an answer differs from the one kept, so a part can be rewritten and
 * shown to behave as it did: its exports the same, its answers the same,
 * key for key and in the same order.
 *
 * - `SIMEON_RECORD=<part>` (or `all`) writes the answers instead of comparing
 *   them. A part is recorded before it is rewritten, never after.
 * - `SIMEON_RECORD_ROOT=<a checkout's desktop folder>` reads the part's code
 *   from another checkout (the commit before a rewrite), and
 *   `SIMEON_RECORD_OUT=<folder>` writes the answers there: the way to check
 *   that the answers kept here are the earlier code's.
 * - Every export of every module a part lists must be used by a scenario, or
 *   named in the part's `skipped` with the reason.
 * - `SIMEON_RECORD_COVERAGE=<part>` (or `all`) also says how much of the
 *   part's code the scenarios ran: for each of its files, the pieces run out
 *   of the pieces of code it holds (a piece is one mapped place in a line,
 *   so a long line counts for all it holds), and which never ran, as
 *   `line` or `line:column`. A piece that never ran is behaviour nothing
 *   here proves; the part's files are the ones under `source/<part>/`, or
 *   the ones it names in `covers`.
 *
 * Scenarios use stand-ins only: no network, no real account, nothing outside
 * a temporary folder.
 */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import inspector from "node:inspector/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { SourceMapConsumer } from "source-map-js";

export const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const recordedDir = path.dirname(fileURLToPath(import.meta.url));

/** Where the part's code is read from: this checkout, or another one named for a cross-check. */
export function sourceRoot() {
  const other = process.env.SIMEON_RECORD_ROOT?.trim();
  return other ? path.resolve(other) : desktopRoot;
}

/** Whether this run writes the answers for the part instead of comparing them. */
export function recording(part) {
  const asked = process.env.SIMEON_RECORD?.trim();
  return asked === "all" || asked === part;
}

export function answersFile(part) {
  const out = process.env.SIMEON_RECORD_OUT?.trim();
  const name = `${part.replaceAll("/", "__")}.json`;
  return out ? path.join(path.resolve(out), name) : path.join(recordedDir, name);
}

/** The scenario files beside this one, by name. */
export async function scenarioFiles() {
  return (await readdir(recordedDir)).filter((name) => name.endsWith(".scenarios.mjs")).sort();
}

/** Whether this run also measures how much of the part's code the scenarios run. */
export function measuring(part) {
  const asked = process.env.SIMEON_RECORD_COVERAGE?.trim();
  return asked === "all" || asked === part;
}

/**
 * The part's modules, built together so that what one defines is the very
 * thing another uses (a key, a class), and loaded once. With `measure`, what
 * runs from now on is counted, and `coverage()` answers it per source file.
 */
export async function loadModules(modules, { measure = false } = {}) {
  const root = sourceRoot();
  const out = await mkdtemp(path.join(os.tmpdir(), "simeon-recorded-"));
  const entryPoints = Object.fromEntries(Object.entries(modules).map(([key, file]) => [key, path.join(root, file)]));
  await build({
    entryPoints,
    outdir: out,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    external: ["electron"],
    sourcemap: measure ? "external" : false,
    outExtension: { ".js": ".mjs" },
    // Another checkout has no packages of its own: they are this checkout's.
    nodePaths: [path.join(desktopRoot, "node_modules")],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  let session;
  if (measure) {
    session = new inspector.Session();
    session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  }
  const loaded = {};
  for (const key of Object.keys(modules)) loaded[key] = await import(`${pathToFileURL(path.join(out, `${key}.mjs`)).href}?${Date.now()}`);
  return {
    loaded,
    /** Per source file (relative to the checkout's desktop folder): how many pieces of code it holds, and where those that never ran are. */
    coverage: async () => (session ? linesRun(await session.post("Profiler.takePreciseCoverage"), out, root) : {}),
    dispose: async () => {
      if (session) {
        await session.post("Profiler.stopPreciseCoverage").catch(() => {});
        session.disconnect();
      }
      await rm(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

/**
 * V8's counts for the built files, carried back to the source files through
 * the build's maps, one count per mapped place (line and column).
 */
async function linesRun({ result }, out, root) {
  const files = {};
  for (const script of result) {
    if (!script.url.startsWith("file:")) continue;
    const built = fileURLToPath(script.url.split("?")[0]);
    if (!built.startsWith(out + path.sep) || !existsSync(`${built}.map`)) continue;
    const text = await readFile(built, "utf8");
    // How often each character of the built file ran: an inner range says more than the one around it.
    const ran = new Int32Array(text.length).fill(-1);
    const ranges = script.functions.flatMap((fn) => fn.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    for (const range of ranges) ran.fill(range.count, range.startOffset, Math.min(range.endOffset, text.length));
    const lineStarts = [0];
    for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) lineStarts.push(at + 1);
    new SourceMapConsumer(JSON.parse(await readFile(`${built}.map`, "utf8"))).eachMapping((piece) => {
      if (!piece.source || piece.originalLine == null) return;
      const source = path.relative(root, path.resolve(path.dirname(built), piece.source)).split(path.sep).join("/");
      if (source.startsWith("..") || source.startsWith("node_modules/")) return;
      const count = ran[lineStarts[piece.generatedLine - 1] + piece.generatedColumn];
      if (count === undefined || count < 0) return;
      const places = (files[source] ??= new Map());
      const place = `${piece.originalLine}:${piece.originalColumn + 1}`;
      places.set(place, Math.max(places.get(place) ?? 0, count));
    });
  }
  return Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([source, places]) => [source, { pieces: places.size, never: neverRan(places) }]),
  );
}

/**
 * Where the pieces that never ran are, as a person reads them: a line's
 * number when none of it ran ("3-7, 12"), `line:column` for each piece of a
 * line that ran in part.
 */
function neverRan(places) {
  const byLine = new Map();
  for (const [place, count] of places) {
    const [line, column] = place.split(":").map(Number);
    const seen = byLine.get(line) ?? byLine.set(line, { ran: false, never: [] }).get(line);
    if (count === 0) seen.never.push(column);
    else seen.ran = true;
  }
  const lines = [...byLine].filter(([, seen]) => seen.never.length > 0).sort(([a], [b]) => a - b);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const [line, seen] = lines[i];
    if (seen.ran) {
      out.push(...seen.never.sort((a, b) => a - b).map((column) => `${line}:${column}`));
      continue;
    }
    let j = i;
    while (j + 1 < lines.length && !lines[j + 1][1].ran && lines[j + 1][0] === lines[j][0] + 1) j += 1;
    out.push(i === j ? `${line}` : `${line}-${lines[j][0]}`);
    i = j;
  }
  return { count: [...places.values()].filter((count) => count === 0).length, where: out };
}

/** What kind of thing an export is, for the part's surface. */
function kindOf(value) {
  if (typeof value === "function") return /^class[\s{]/.test(Function.prototype.toString.call(value)) ? "class" : "function";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Every export of every module, by kind: the part's surface. */
export function surfaceOf(loaded) {
  const surface = {};
  for (const [key, module] of Object.entries(loaded)) {
    surface[key] = Object.fromEntries(Object.keys(module).sort().map((name) => [name, kindOf(module[name])]));
  }
  return surface;
}

/** The modules as the scenarios get them: the same exports, with each one read noted. */
export function tracked(loaded) {
  const used = new Set();
  const modules = {};
  for (const [key, module] of Object.entries(loaded)) {
    modules[key] = new Proxy(module, {
      get(target, name) {
        if (typeof name === "string" && name in target) used.add(`${key}.${name}`);
        return target[name];
      },
    });
  }
  return { modules, used };
}

/**
 * A value as it is kept: plain JSON that tells apart what JSON alone would
 * blur (undefined, NaN, bytes, errors, maps, sets, dates, class instances),
 * with an object's keys in the order the code made them.
 */
export function plain(value, seen = new Set()) {
  if (value === undefined) return { $: "undefined" };
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? { $: "number", v: "-0" } : value) : { $: "number", v: String(value) };
  if (typeof value === "bigint") return { $: "bigint", v: value.toString() };
  if (typeof value === "symbol") return { $: "symbol", v: value.description ?? "" };
  if (typeof value === "function") return { $: kindOf(value), name: value.name };
  if (seen.has(value)) return { $: "cycle" };
  seen.add(value);
  try {
    if (value instanceof Date) return { $: "date", v: Number.isNaN(value.getTime()) ? "invalid" : value.toISOString() };
    if (value instanceof RegExp) return { $: "regexp", v: String(value) };
    if (value instanceof Error) {
      const extra = Object.fromEntries(Object.keys(value).filter((key) => key !== "stack").map((key) => [key, plain(value[key], seen)]));
      return { $: "error", name: value.name, message: value.message, ...(value.cause === undefined ? {} : { cause: plain(value.cause, seen) }), ...(Object.keys(extra).length === 0 ? {} : { extra }) };
    }
    if (value instanceof Uint8Array) return { $: "bytes", v: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex") };
    if (value instanceof ArrayBuffer) return { $: "bytes", v: Buffer.from(value).toString("hex") };
    if (value instanceof Map) return { $: "map", v: [...value.entries()].map(([key, entry]) => [plain(key, seen), plain(entry, seen)]) };
    if (value instanceof Set) return { $: "set", v: [...value.values()].map((entry) => plain(entry, seen)) };
    if (Array.isArray(value)) return Array.from(value, (entry) => plain(entry, seen));
    const fields = Object.fromEntries(Object.keys(value).map((key) => [key, plain(value[key], seen)]));
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return "$" in fields ? { $: "object", v: fields } : fields;
    return { $: "instance", class: prototype.constructor?.name ?? "", v: fields };
  } finally {
    seen.delete(value);
  }
}

/** What a scenario is given besides the modules. */
function toolsFor(cleanups) {
  return {
    /** A fresh temporary folder, gone after the scenario; write its path as "<tmp>" in what is returned (`scrub`). */
    async tmp() {
      const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-recorded-run-"));
      cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
      return dir;
    },
    /** Text with every `from` replaced by its stand-in, so a path or a time that changes between runs is kept as a name. */
    scrub(text, replacements) {
      let out = String(text);
      for (const [from, to] of Object.entries(replacements)) out = out.split(from).join(to);
      return out;
    },
    plain,
  };
}

/** One scenario's answer: what it returned, or what it threw. */
export async function answerOf(scenario, modules) {
  const cleanups = [];
  try {
    return { returned: plain(await scenario.run(modules, toolsFor(cleanups))) };
  } catch (error) {
    return { threw: plain(error) };
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  }
}

export async function readAnswers(part) {
  const file = answersFile(part);
  return existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : undefined;
}

export async function writeAnswers(part, answers) {
  const file = answersFile(part);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(answers, null, 1)}\n`);
}

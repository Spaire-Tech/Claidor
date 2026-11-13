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
 *
 * Scenarios use stand-ins only: no network, no real account, nothing outside
 * a temporary folder.
 */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

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

/**
 * The part's modules, built together so that what one defines is the very
 * thing another uses (a key, a class), and loaded once.
 */
export async function loadModules(modules) {
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
    outExtension: { ".js": ".mjs" },
    // Another checkout has no packages of its own: they are this checkout's.
    nodePaths: [path.join(desktopRoot, "node_modules")],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const loaded = {};
  for (const key of Object.keys(modules)) loaded[key] = await import(`${pathToFileURL(path.join(out, `${key}.mjs`)).href}?${Date.now()}`);
  return { loaded, dispose: () => rm(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) };
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

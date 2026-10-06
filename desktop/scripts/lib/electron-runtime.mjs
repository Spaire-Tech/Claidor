/**
 * The Electron runtime Simeon ships on, and the native add-ons built for it
 * (Track D, piece 1, 5 October 2026).
 *
 * Until this day the packaged app ran on the upstream app's copy of Electron
 * and carried the upstream's native add-ons, taken from its `app.asar.unpacked`
 * at package time. Here the same Electron version comes from Electron's own
 * release (`@electron/packager` fetches it, or reads `SIMEON_ELECTRON_ZIP_DIR`)
 * and the two native add-ons the app loads, `tree-sitter` and
 * `tree-sitter-bash` (`source/packages/shell-exec/shell-parser.ts`), are
 * compiled against Electron's headers with node-gyp, the way
 * `scripts/build-tree-sitter-node.mjs` already does for the Node ABI.
 *
 * The version, ABI and Node version are one triple: Electron 42.1.0 carries
 * Node 24.15.0 and reports NODE_MODULE_VERSION 146. A build whose headers say
 * anything else is refused, because an add-on built for another ABI crashes
 * the process that loads it.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

import { cacheDir, repoRoot } from "./config.mjs";

export const ELECTRON_VERSION = "42.1.0";
export const ELECTRON_ABI = "146";
export const ELECTRON_NODE_VERSION = "24.15.0";
export const ELECTRON_HEADERS_URL = `https://artifacts.electronjs.org/headers/dist/v${ELECTRON_VERSION}/node-v${ELECTRON_VERSION}-headers.tar.gz`;
export const ELECTRON_HEADERS_DIST_URL = "https://artifacts.electronjs.org/headers/dist";

/** The add-ons compiled for Electron, and the packages they resolve at load time. */
export const ELECTRON_NATIVE_PACKAGES = Object.freeze(["tree-sitter", "tree-sitter-bash"]);
export const ELECTRON_NATIVE_DEPENDENCIES = Object.freeze(["node-addon-api", "node-gyp-build"]);
/** Where each add-on's binary lands, relative to `dist/deps`. */
export const ELECTRON_NATIVE_NODE_FILES = Object.freeze([
  "tree-sitter/build/Release/tree_sitter_runtime_binding.node",
  "tree-sitter-bash/build/Release/tree_sitter_bash_binding.node",
]);
export const RUNTIME_DEPS_MANIFEST = "runtime-deps-manifest.json";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

/** Reads `node_version.h` and returns `{ modules, major, minor }`, or throws when the headers are not Electron 42.1.0's. */
export function parseNodeVersionHeader(text) {
  const read = (name) => {
    const match = new RegExp(`#define ${name} (\\d+)`).exec(text);
    return match == null ? null : Number(match[1]);
  };
  const modules = read("NODE_MODULE_VERSION");
  const major = read("NODE_MAJOR_VERSION");
  const minor = read("NODE_MINOR_VERSION");
  if (modules == null || major == null || minor == null) throw new Error("node_version.h does not declare NODE_MODULE_VERSION, NODE_MAJOR_VERSION and NODE_MINOR_VERSION");
  return { modules, major, minor };
}

export function assertElectronHeaders(text, { electronAbi = ELECTRON_ABI, nodeVersion = ELECTRON_NODE_VERSION } = {}) {
  const parsed = parseNodeVersionHeader(text);
  const [major, minor] = nodeVersion.split(".").map(Number);
  if (String(parsed.modules) !== electronAbi) throw new Error(`Electron headers declare NODE_MODULE_VERSION ${parsed.modules}, not ${electronAbi} (Electron ${ELECTRON_VERSION})`);
  if (parsed.major !== major || parsed.minor !== minor) throw new Error(`Electron headers carry Node ${parsed.major}.${parsed.minor}, not ${nodeVersion} (Electron ${ELECTRON_VERSION})`);
  return parsed;
}

function nodeVersionHeaderPath(headersDir) {
  return path.join(headersDir, "include", "node", "node_version.h");
}

/**
 * The directory node-gyp takes as `--nodedir`: it holds `include/node`.
 * `ELECTRON_HEADERS_DIR` names one explicitly (as `build-tree-sitter-electron.mjs`
 * required); otherwise the tarball is fetched once into
 * `.cache/electron-headers/v42.1.0/node_headers` and kept.
 */
export async function ensureElectronHeaders({ headersDir = process.env.ELECTRON_HEADERS_DIR?.trim(), cacheRoot = path.join(cacheDir, "electron-headers", `v${ELECTRON_VERSION}`), fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  if (headersDir) {
    const text = await readFile(nodeVersionHeaderPath(headersDir), "utf8").catch(() => readFile(path.join(headersDir, "node_version.h"), "utf8"));
    assertElectronHeaders(text);
    return headersDir;
  }
  const cached = path.join(cacheRoot, "node_headers");
  if (await exists(nodeVersionHeaderPath(cached))) {
    assertElectronHeaders(await readFile(nodeVersionHeaderPath(cached), "utf8"));
    return cached;
  }
  await mkdir(cacheRoot, { recursive: true });
  const tarball = path.join(cacheRoot, `node-v${ELECTRON_VERSION}-headers.tar.gz`);
  log(`Fetching Electron ${ELECTRON_VERSION} headers from ${ELECTRON_HEADERS_URL}`);
  const response = await fetchImpl(ELECTRON_HEADERS_URL, { redirect: "follow" });
  if (!response.ok || response.body == null) throw new Error(`Electron headers download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tarball, { mode: 0o600 }));
  await runCommand("tar", ["-xzf", tarball, "-C", cacheRoot]);
  if (!(await exists(nodeVersionHeaderPath(cached)))) throw new Error(`Electron headers tarball did not unpack to ${cached}`);
  assertElectronHeaders(await readFile(nodeVersionHeaderPath(cached), "utf8"));
  return cached;
}

function runCommand(command, args, { env = process.env, cwd = repoRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "inherit", "inherit"], shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ""} exited with ${code}`)));
  });
}

function nodeGypEntry() {
  return path.join(repoRoot, "node_modules", "node-gyp", "bin", "node-gyp.js");
}

/** node-gyp's environment for an Electron target: the runtime, the version and where its headers come from. */
export function electronNodeGypEnvironment(base = process.env) {
  const env = { ...base };
  for (const key of ["npm_config_nodedir", "npm_config_build_from_source"]) delete env[key];
  env.npm_config_runtime = "electron";
  env.npm_config_target = ELECTRON_VERSION;
  env.npm_config_disturl = ELECTRON_HEADERS_DIST_URL;
  return env;
}

export function electronRuntimeCacheRoot({ platform = process.platform, arch = process.arch } = {}) {
  return path.join(cacheDir, "tree-sitter-electron", ELECTRON_ABI, `${platform}-${arch}`);
}

async function hasNativeBinaries(root) {
  for (const relative of ELECTRON_NATIVE_NODE_FILES) if (!(await exists(path.join(root, relative)))) return false;
  return true;
}

/**
 * The add-ons compiled for Electron 42.1.0, cached per platform and
 * architecture. Each package is copied out of node_modules into a scratch
 * folder first, so the developer's own node_modules build (the Node ABI,
 * `build-tree-sitter-node.mjs`) is never overwritten.
 */
export async function ensureElectronTreeSitterRuntime({ platform = process.platform, arch = process.arch, headersDir, log = () => {} } = {}) {
  const cacheRoot = electronRuntimeCacheRoot({ platform, arch });
  if (await hasNativeBinaries(cacheRoot)) return cacheRoot;
  if (platform !== process.platform || arch !== process.arch) throw new Error(`Electron add-ons for ${platform}-${arch} can only be built on that platform (this is ${process.platform}-${process.arch})`);
  const headers = headersDir ?? await ensureElectronHeaders({ log });
  const temporaryRoot = await mkdtemp(path.join(repoRoot, ".tmp-tree-sitter-electron-"));
  try {
    const packageRoot = path.join(temporaryRoot, "node_modules");
    await mkdir(packageRoot, { recursive: true });
    for (const packageName of [...ELECTRON_NATIVE_PACKAGES, ...ELECTRON_NATIVE_DEPENDENCIES]) {
      await cp(path.join(repoRoot, "node_modules", packageName), path.join(packageRoot, packageName), { recursive: true, dereference: true });
    }
    const env = electronNodeGypEnvironment();
    for (const packageName of ELECTRON_NATIVE_PACKAGES) {
      log(`Building ${packageName} for Electron ${ELECTRON_VERSION} (ABI ${ELECTRON_ABI}, ${platform}-${arch})`);
      await runCommand(process.execPath, [nodeGypEntry(), "rebuild", "--directory", path.join(packageRoot, packageName), "--release", "--nodedir", headers, "--jobs", "max"], { env });
    }
    for (const packageName of ELECTRON_NATIVE_PACKAGES) {
      // Only the package's files and its Release binary ship: the compiler's
      // object files and the generated Makefiles stay behind.
      const build = path.join(packageRoot, packageName, "build");
      const release = path.join(build, "Release");
      const keep = ELECTRON_NATIVE_NODE_FILES.find((relative) => relative.startsWith(`${packageName}/`)).split("/").pop();
      const kept = await readFile(path.join(release, keep));
      await rm(build, { recursive: true, force: true });
      await mkdir(release, { recursive: true });
      await writeFile(path.join(release, keep), kept, { mode: 0o755 });
    }
    await rm(cacheRoot, { recursive: true, force: true });
    await mkdir(path.dirname(cacheRoot), { recursive: true });
    await cp(packageRoot, cacheRoot, { recursive: true, dereference: true });
    if (!(await hasNativeBinaries(cacheRoot))) throw new Error(`Electron add-on build left no binaries under ${cacheRoot}`);
    return cacheRoot;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

/**
 * The manifest `dist/deps/runtime-deps-manifest.json` carries: the shape the
 * package verification reads (`nodeFiles`, `platform`, `arch`,
 * `resolutionClosure`), plus the Electron triple the add-ons were built for.
 */
export function electronRuntimeDepsManifest({ platform, arch, packages, resolutionPackages }) {
  return {
    schemaVersion: 1,
    origin: "simeon-build",
    electron: ELECTRON_VERSION,
    node: ELECTRON_NODE_VERSION,
    modules: Number(ELECTRON_ABI),
    platform,
    arch,
    copied: [...ELECTRON_NATIVE_PACKAGES, ...ELECTRON_NATIVE_DEPENDENCIES],
    nodeFiles: [...ELECTRON_NATIVE_NODE_FILES],
    packages,
    resolutionClosure: { mode: "byte-exact-sibling-package-copy", packages: resolutionPackages },
  };
}

async function directoryInventory(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await directoryInventory(root, target));
    else if (entry.isFile()) {
      const bytes = await readFile(target);
      files.push({ path: path.relative(root, target).split(path.sep).join("/"), bytes: bytes.byteLength, sha256: sha256(bytes) });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Writes `<outputRoot>/dist/deps`: the two add-ons, the two packages they
 * resolve, a `node_modules` copy of those two for the add-ons' own
 * `require("node-gyp-build")`, and the manifest. Returns the manifest.
 */
export async function stageElectronRuntimeDependencies({ outputRoot, platform = process.platform, arch = process.arch, cacheRoot, log = () => {} } = {}) {
  if (typeof outputRoot !== "string" || outputRoot.length === 0) throw new TypeError("stageElectronRuntimeDependencies requires outputRoot");
  const source = cacheRoot ?? await ensureElectronTreeSitterRuntime({ platform, arch, log });
  const destination = path.join(outputRoot, "dist", "deps");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const packages = [];
  for (const packageName of [...ELECTRON_NATIVE_PACKAGES, ...ELECTRON_NATIVE_DEPENDENCIES]) {
    await cp(path.join(source, packageName), path.join(destination, packageName), { recursive: true, dereference: true });
    const files = await directoryInventory(path.join(destination, packageName));
    const metadata = JSON.parse(await readFile(path.join(destination, packageName, "package.json"), "utf8"));
    packages.push({ name: packageName, version: metadata.version, fileCount: files.length, inventorySha256: sha256(JSON.stringify(files)) });
  }
  const resolutionPackages = [];
  for (const packageName of ELECTRON_NATIVE_DEPENDENCIES) {
    const copy = path.join(destination, "node_modules", packageName);
    await mkdir(path.dirname(copy), { recursive: true });
    await cp(path.join(destination, packageName), copy, { recursive: true, dereference: true });
    const files = await directoryInventory(copy);
    resolutionPackages.push({ name: packageName, source: packageName, destination: `node_modules/${packageName}`, fileCount: files.length, inventorySha256: sha256(JSON.stringify(files)) });
  }
  for (const relative of ELECTRON_NATIVE_NODE_FILES) {
    if (!(await exists(path.join(destination, relative)))) throw new Error(`Staged Electron add-on is missing: ${relative}`);
  }
  const manifest = electronRuntimeDepsManifest({ platform, arch, packages, resolutionPackages });
  await writeFile(path.join(destination, RUNTIME_DEPS_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

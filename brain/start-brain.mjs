#!/usr/bin/env node
// The brain's start (5 November 2026, docs/agents-on-the-server/README.md,
// step 1d): the person's agents' engine, off their cloud computer, on a
// Render service of its own. The computer is reached only for its hands,
// through the API's door (`server/simeon/sand/brain.py`).
//
// What it does, in order:
//   1. asks the API what to start with (`POST /sand-box/brain/bootstrap`,
//      with the brain's token and the person's e-mail address): their
//      computer's gateway token, a credential of the brain's own, the API's
//      address, the two backup stores and where the engine is published;
//   2. downloads that engine (the host bundle the computers run) into
//      /home/box/sand-host;
//   3. on its first start on this disk, brings the agents in: from the
//      brain's own backup if it has one, else once from the computer's
//      (the agents' folder only, `copyInKeepsRelPath`);
//   4. runs the engine as `brain`, and runs it again (asking the API again,
//      for a fresh credential) whenever it stops.
//
// Settings (Render): SIMEON_BRAIN_USER (the person's e-mail address),
// SIMEON_BRAIN_TOKEN (the same secret as the API's), and optionally
// SIMEON_API_URL, SIMEON_BOX_HOST_BUNDLE_URL, SAND_DATA_ROOT and PORT.
// Nothing here ever prints a token or a credential.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_API_URL = "https://api.simeonlabs.com";
export const DEFAULT_DATA_ROOT = "/home/box/sand-data";
export const DEFAULT_HOST_DIR = "/home/box/sand-host";
export const DEFAULT_DEPS_DIR = "/home/box/deps";
export const DEFAULT_PORT = "10000";
export const BRAIN_TOKEN_HEADER = "x-simeon-brain-token";
export const BRAIN_USER_HEADER = "x-simeon-brain-user";
export const LATEST_VERSION_FILE = "sand-host-bundle-latest.version";
export const HOST_BUNDLE_PREFIX = "sand-host-bundle";
/** Written on the disk once the agents are in: later starts keep the disk as it is. */
export const BROUGHT_IN_MARKER = ".simeon-brain-brought-in.json";
/** Left by a copy from an older backup; the brain's own, new store has no use for it. */
export const HYDRATION_HANDOFF_FILE = ".box-store-legacy-hydration-complete";
export const COPY_IN_ARG = "--box-copy-in";
/** Node's own flags, as the computer's supervisor gives them. */
export const ENGINE_NODE_ARGS = ["--disable-warning=ExperimentalWarning"];
export const COPY_IN_EXIT_NOOP = 0;
export const COPY_IN_EXIT_HYDRATED = 10;

const log = (message) => console.log(`[brain] ${message}`);

export class BrainStartError extends Error {
  constructor(message, { status, reason, retryAfterMs } = {}) {
    super(message);
    this.status = status;
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

/** The start's settings, read once. Throws, naming the setting (never its value). */
export function settingsFromEnv(env = process.env) {
  const email = (env.SIMEON_BRAIN_USER ?? "").trim();
  const token = (env.SIMEON_BRAIN_TOKEN ?? "").trim();
  if (email === "") throw new BrainStartError("SIMEON_BRAIN_USER is not set: the e-mail address of the person whose agents run here.");
  if (token === "") throw new BrainStartError("SIMEON_BRAIN_TOKEN is not set: the secret the brain and the API share.");
  const apiUrl = (env.SIMEON_API_URL ?? "").trim().replace(/\/+$/, "") || DEFAULT_API_URL;
  if (!/^https:\/\//.test(apiUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiUrl)) {
    throw new BrainStartError("SIMEON_API_URL must be https (or http on this machine, for a test).");
  }
  return {
    email,
    token,
    apiUrl,
    bundleUrl: (env.SIMEON_BOX_HOST_BUNDLE_URL ?? "").trim(),
    dataRoot: (env.SAND_DATA_ROOT ?? "").trim() || DEFAULT_DATA_ROOT,
    hostDir: (env.SIMEON_BRAIN_HOST_DIR ?? "").trim() || DEFAULT_HOST_DIR,
    depsDir: (env.SAND_TREE_SITTER_NODE_DEPS ?? "").trim() || DEFAULT_DEPS_DIR,
    port: (env.PORT ?? "").trim() || DEFAULT_PORT,
  };
}

/** What the API gives the brain to start the person's engine with. */
export async function bootstrap(settings, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${settings.apiUrl}/sand-box/brain/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", [BRAIN_TOKEN_HEADER]: settings.token },
      body: JSON.stringify({ email: settings.email }),
    });
  } catch (error) {
    throw new BrainStartError(`the API did not answer the bootstrap: ${error?.message ?? error}`, { reason: "unreachable" });
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const reason = typeof body?.error === "string" ? body.error : `http_${response.status}`;
    const message = typeof body?.message === "string" ? body.message : "no reason given";
    throw new BrainStartError(`the API refused the bootstrap (${response.status} ${reason}): ${message}`, { status: response.status, reason });
  }
  for (const field of ["userId", "gatewayToken", "credential", "backendUrl", "computerStoreSource", "brainStoreSource"]) {
    if (typeof body?.[field] !== "string" || body[field] === "") {
      throw new BrainStartError(`the bootstrap's answer has no ${field}`, { reason: "bad_answer" });
    }
  }
  return body;
}

/** The bundle's .tgz: a URL that names one, or the newest in a published folder. */
export async function bundleArchiveUrl(bundleUrl, fetchImpl = fetch) {
  const base = bundleUrl.replace(/\/+$/, "");
  if (/\.(tgz|tar\.gz|tar)$/.test(base)) return base;
  const response = await fetchImpl(`${base}/${LATEST_VERSION_FILE}`);
  if (!response.ok) throw new BrainStartError(`the engine's version file answered ${response.status}`, { reason: "bundle" });
  const version = (await response.text()).trim();
  if (!/^[0-9a-zA-Z._-]{4,64}$/.test(version)) throw new BrainStartError("the engine's version file names no version", { reason: "bundle" });
  return `${base}/${HOST_BUNDLE_PREFIX}-${version}.tgz`;
}

/** Every file under `dir`, as paths relative to it. */
function filesUnder(dir, prefix = "") {
  const found = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(dir, rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

/**
 * The engine downloaded into `hostDir`: the bundle's `host/` folder (the
 * engine and its workers). The exec daemon in it is the computer's, not the
 * brain's: the brain never starts hands of its own.
 */
export async function installBundle(settings, archiveUrl, { fetchImpl = fetch, run = runCommand } = {}) {
  const response = await fetchImpl(archiveUrl);
  if (!response.ok) throw new BrainStartError(`the engine's bundle answered ${response.status}`, { reason: "bundle" });
  const work = mkdtempSync(path.join(tmpdir(), "simeon-brain-bundle-"));
  try {
    const archive = path.join(work, "bundle.tgz");
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    const out = path.join(work, "out");
    mkdirSync(out);
    const code = await run("tar", ["-xzf", archive, "-C", out]);
    if (code !== 0) throw new BrainStartError(`tar could not open the engine's bundle (exit ${code})`, { reason: "bundle" });
    const files = filesUnder(out);
    const main = files.find((file) => file === "host/host-main.cjs" || file.endsWith("/host/host-main.cjs"));
    if (main === undefined) throw new BrainStartError("the engine's bundle has no host/host-main.cjs", { reason: "bundle" });
    const hostRoot = main.slice(0, -"host-main.cjs".length);
    rmSync(settings.hostDir, { recursive: true, force: true });
    let copied = 0;
    for (const file of files.filter((file) => file.startsWith(hostRoot))) {
      const target = path.join(settings.hostDir, file.slice(hostRoot.length));
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(out, file), target);
      copied += 1;
    }
    return copied;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The engine's settings: the computer's (`BoxSpec.environment()`) for an engine off it, as `brain`. */
export function engineEnv(settings, boot, base = process.env) {
  const env = { ...base };
  // The start's own settings, and anything that would run a copy or a restore on its own.
  for (const name of [
    "SIMEON_BRAIN_TOKEN",
    "SIMEON_BRAIN_USER",
    "SAND_BOX_STORE_COPY_IN",
    "SAND_BOX_STORE_RESTORE",
    "SAND_BOX_STORE_RESTORE_ID",
    "SIMEON_BOX_STORE_RESTORE",
    "SIMEON_BOX_STORE_RESTORE_ID",
    "SAND_HOST_IN_BOX",
  ]) {
    delete env[name];
  }
  return {
    ...env,
    SIMEON_ENGINE_ROLE: "brain",
    SIMEON_HANDS_URL: `${settings.apiUrl}/sand-box/brain/hands`,
    SIMEON_HANDS_HEADERS: JSON.stringify({ [BRAIN_TOKEN_HEADER]: settings.token, [BRAIN_USER_HEADER]: boot.userId }),
    SAND_GATEWAY_TOKEN: boot.gatewayToken,
    SAND_INFERENCE_RENEWAL_CREDENTIAL: boot.credential,
    SAND_BACKEND_URL: boot.backendUrl,
    SAND_INFERENCE_PROVIDER: "simeon",
    // As the computer's supervisor starts it (box/bin/simeon-supervisor.mjs),
    // minus SAND_HOST_IN_BOX: this engine is not inside a computer.
    SAND_PACKAGED: "1",
    SAND_USE_EXISTING_BOX_EXEC_DAEMON: "1",
    SAND_BOX_AUTO_UPDATE: "0",
    SAND_DATA_ROOT: settings.dataRoot,
    SAND_TREE_SITTER_NODE_DEPS: settings.depsDir,
    NODE_PATH: settings.depsDir,
    SAND_GATEWAY_BIND_HOST: "0.0.0.0",
    SAND_HOST_PORT: settings.port,
    SAND_DISABLE_TELEMETRY: "1",
    SAND_DISABLE_ANALYTICS: "1",
    SAND_BOX_LOG_SHIP_DISABLED: "1",
    SAND_BOX_STORE_SYNC: "1",
    SAND_BOX_STORE_ID: boot.brainStoreSource,
  };
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", (error) => {
      log(`${command} could not start: ${error.message}`);
      resolve(127);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
}

/** One copy of a backup into the disk, by the engine's own helper; its exit code. */
export function copyInFrom(settings, boot, source, { run = runCommand, base = process.env } = {}) {
  const env = { ...engineEnv(settings, boot, base), SAND_BOX_STORE_COPY_IN: "1", SAND_BOX_STORE_ID: source };
  return run(process.execPath, [...ENGINE_NODE_ARGS, path.join(settings.hostDir, "host-main.cjs"), COPY_IN_ARG], { env, cwd: settings.hostDir });
}

/**
 * The agents brought in once per disk: the brain's own backup when it has
 * one (a new disk), else the computer's (the first start), else nothing (a
 * person with no backup yet: a fresh start). A failed copy is never followed
 * by a start on an empty disk: it throws, and the start is tried again.
 */
export async function bringIn(settings, boot, { run = runCommand, base = process.env } = {}) {
  const marker = path.join(settings.dataRoot, BROUGHT_IN_MARKER);
  if (existsSync(marker)) return "kept";
  mkdirSync(settings.dataRoot, { recursive: true });
  let from = "nothing";
  for (const [name, source] of [["brain", boot.brainStoreSource], ["computer", boot.computerStoreSource]]) {
    log(`bringing the agents in from the ${name}'s backup`);
    const code = await copyInFrom(settings, boot, source, { run, base });
    if (code === COPY_IN_EXIT_HYDRATED) {
      from = name;
      break;
    }
    if (code !== COPY_IN_EXIT_NOOP) {
      throw new BrainStartError(`bringing the agents in from the ${name}'s backup failed (exit ${code})`, { reason: "copy_in" });
    }
    log(`the ${name}'s backup has nothing to bring in`);
  }
  const handoff = path.join(settings.dataRoot, HYDRATION_HANDOFF_FILE);
  if (existsSync(handoff)) rmSync(handoff, { force: true });
  writeFileSync(marker, `${JSON.stringify({ from, at: new Date().toISOString() })}\n`);
  log(from === "nothing" ? "no backup anywhere: a fresh start" : `the agents are in, from the ${from}'s backup`);
  return from;
}

/** How long to wait before the next try: longer for a refusal a retry won't fix soon. */
export function retryDelayMs(error, attempt) {
  if (error instanceof BrainStartError && error.retryAfterMs) return error.retryAfterMs;
  const refused = error instanceof BrainStartError && [401, 403, 404, 409].includes(error.status ?? 0);
  const base = refused ? 60_000 : 5_000;
  return Math.min(base * 2 ** Math.min(attempt, 4), 5 * 60_000);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The start, for ever: bootstrap, engine, copy-in, engine run; again when the engine stops. */
export async function main({ env = process.env, fetchImpl = fetch, run = runCommand, once = false } = {}) {
  const settings = settingsFromEnv(env);
  log(`starting for ${settings.email} against ${settings.apiUrl}, data in ${settings.dataRoot}, gateway on port ${settings.port}`);
  let child = null;
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      stopping = true;
      log(`${signal}: stopping the engine`);
      if (child) child.kill(signal);
      else process.exit(0);
    });
  }
  let attempt = 0;
  let installedFrom = null;
  while (!stopping) {
    try {
      const boot = await bootstrap(settings, fetchImpl);
      log(`the API answered: the person's id ${boot.userId}`);
      const bundleUrl = settings.bundleUrl || (typeof boot.hostBundleUrl === "string" ? boot.hostBundleUrl.trim() : "");
      if (bundleUrl !== "") {
        const archiveUrl = await bundleArchiveUrl(bundleUrl, fetchImpl);
        if (archiveUrl !== installedFrom || !existsSync(path.join(settings.hostDir, "host-main.cjs"))) {
          const copied = await installBundle(settings, archiveUrl, { fetchImpl, run });
          installedFrom = archiveUrl;
          log(`engine downloaded: ${path.basename(archiveUrl)} (${copied} files)`);
        }
      } else if (!existsSync(path.join(settings.hostDir, "host-main.cjs"))) {
        throw new BrainStartError("no engine: the API named no host bundle and none is installed", { reason: "bundle" });
      }
      await bringIn(settings, boot, { run, base: env });
      const started = Date.now();
      log("engine starting as brain");
      const code = await new Promise((resolve) => {
        child = spawn(process.execPath, [...ENGINE_NODE_ARGS, path.join(settings.hostDir, "host-main.cjs")], {
          env: engineEnv(settings, boot, env),
          cwd: settings.hostDir,
          stdio: "inherit",
        });
        child.on("error", (error) => {
          log(`the engine could not start: ${error.message}`);
          resolve(127);
        });
        child.on("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? `signal ${signal}` : 1)));
      });
      child = null;
      log(`engine stopped (${code}) after ${Math.round((Date.now() - started) / 1000)} s`);
      if (stopping || once) return code;
      // A run that lasted a while starts again at once, with a fresh credential.
      attempt = Date.now() - started > 60_000 ? 0 : attempt + 1;
      await sleep(attempt === 0 ? 1_000 : retryDelayMs(new Error("stopped"), attempt));
    } catch (error) {
      if (once) throw error;
      const wait = retryDelayMs(error, attempt);
      log(`${error?.message ?? error}; trying again in ${Math.round(wait / 1000)} s`);
      attempt += 1;
      await sleep(wait);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(typeof code === "number" ? code : 0),
    (error) => {
      log(`${error?.message ?? error}`);
      process.exit(1);
    },
  );
}

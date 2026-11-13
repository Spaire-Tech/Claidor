/**
 * Cursor's command-line agent installed on the person's computer by the
 * engine itself (13 November 2026, the founder: "Cursor now"), as Claude
 * Code and Codex are (`claude-code-install.ts`, `codex-install.ts`): the
 * maker's own package, unmodified and pinned, the first time it is needed
 * (connecting it from the chat's card, or a cloud agent's coding), into a
 * folder outside the person's home and the data root, so it is never in the
 * backup: `/var/tmp/simeon-cursor`.
 *
 * Measured on 2026.11.11-b912975 (the package was read and run with its
 * network cut off; nothing here was run against Cursor's servers):
 *
 * - the maker's install script downloads one archive per platform
 *   (`…/lab/<version>/linux/x64/agent-cli-package.tar.gz`, 176,703,341
 *   bytes, 538 MB unpacked) and unpacks it; there is no npm package. The
 *   engine downloads the same archive with curl, checks it against the
 *   fingerprint written here, and unpacks it with tar;
 * - its top folder holds a launcher (`cursor-agent`, a shell script), its
 *   own Node and its code. The engine runs that launcher from its own
 *   folder, never the person's `~/.local/bin/agent`;
 * - run without a terminal it made no call for an update, so the copy here
 *   stays at the pinned version.
 *
 * One install at a time; a caller that can't wait is told it's still being
 * set up.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The version installed: the maker's release when this was written. */
export const CURSOR_VERSION = "2026.11.11-b912975";
/** Where it goes; `SIMEON_CURSOR_DIR` in tests. */
export const CURSOR_INSTALL_DIR = "/var/tmp/simeon-cursor";
/** The launcher inside the unpacked archive. */
export const CURSOR_LAUNCHER = "cursor-agent";
const INSTALL_TIMEOUT_MS = 10 * 60_000;

/** The maker's archive for each platform the engine installs on, and its fingerprint (sha256), measured on the download. */
export const CURSOR_PACKAGES: Readonly<Record<string, { readonly url: string; readonly sha256: string }>> = {
  "linux-x64": {
    url: `https://downloads.cursor.com/lab/${CURSOR_VERSION}/linux/x64/agent-cli-package.tar.gz`,
    sha256: "be01f42ad334f81d05a9992fcf060a52cc746f52cc451e849eb652146a6e3c91",
  },
};

/** The variables curl and tar get: the way out (proxies, certificates) and nothing of the engine's. */
const PASSED_TO_DOWNLOAD = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE", "CURL_CA_BUNDLE"] as const;

export function cursorInstallDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SIMEON_CURSOR_DIR?.trim() || CURSOR_INSTALL_DIR;
}

/** The launcher the install puts in place. */
export function installedCursorBinary(dir: string): string {
  return path.join(dir, CURSOR_VERSION, CURSOR_LAUNCHER);
}

/** Installed, at this version: the launcher, its own Node and its code are there, and the install finished. */
export function isCursorInstalled(dir: string): boolean {
  try {
    if (readFileSync(path.join(dir, "version"), "utf8").trim() !== CURSOR_VERSION) return false;
    const folder = path.join(dir, CURSOR_VERSION);
    return existsSync(path.join(folder, CURSOR_LAUNCHER)) && existsSync(path.join(folder, "node")) && existsSync(path.join(folder, "index.js"));
  } catch {
    return false;
  }
}

/**
 * The program's path: a stand-in in tests (`SIMEON_CURSOR_BIN`); else the
 * one the engine installed (run before it is there, the turn says "not
 * installed").
 */
export function cursorBinary(base: NodeJS.ProcessEnv = process.env): string {
  const standIn = base.SIMEON_CURSOR_BIN?.trim();
  if (standIn) return standIn;
  return installedCursorBinary(cursorInstallDir(base));
}

let installing: Promise<boolean> | undefined;

function downloadEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_TO_DOWNLOAD) {
    const value = base[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  env.PATH ??= "/usr/local/bin:/usr/bin:/bin";
  return env;
}

/** One command to its end: whether it left with 0, and its last line of error output. */
function runTool(command: string, args: readonly string[], env: Record<string, string>, timeoutMs: number): Promise<{ ok: boolean; why: string }> {
  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const finish = (ok: boolean, why: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, why });
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, [...args], { env, stdio: ["ignore", "ignore", "pipe"] });
    } catch (error) {
      resolve({ ok: false, why: error instanceof Error ? error.message : String(error) });
      return;
    }
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false, "timed out"); }, timeoutMs);
    timer.unref();
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < 4_000) stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => finish(false, error.code === "ENOENT" ? `${command} not found` : error.message));
    child.on("close", (code) => finish(code === 0, code === 0 ? "" : `${command} exited ${code ?? "on a signal"}: ${stderr.trim().split("\n").pop() ?? ""}`));
  });
}

/** A file's sha256, read in pieces (the archive is 176 MB). */
export function fingerprintOf(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export interface CursorInstallOptions {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly waitMs?: number | undefined;
  readonly log?: ((line: string) => void) | undefined;
  /** The archive and its fingerprint; `CURSOR_PACKAGES` for this platform when none is given (tests give a small one). */
  readonly archive?: { readonly url: string; readonly sha256: string } | undefined;
}

async function install(dir: string, base: NodeJS.ProcessEnv, options: CursorInstallOptions): Promise<boolean> {
  const started = Date.now();
  const log = options.log;
  const failed = (reason: string): boolean => {
    log?.(`cursor install failed reason=${reason} ms=${Date.now() - started}`);
    return false;
  };
  const archive = options.archive ?? CURSOR_PACKAGES[`${process.platform}-${process.arch}`];
  if (archive === undefined) return failed(`no package for ${process.platform}-${process.arch}`);
  const env = downloadEnv(base);
  const download = path.join(dir, "download.tar.gz");
  const unpacked = path.join(dir, `${CURSOR_VERSION}.unpacking`);
  const folder = path.join(dir, CURSOR_VERSION);
  try {
    mkdirSync(dir, { recursive: true });
    rmSync(download, { force: true });
    rmSync(unpacked, { recursive: true, force: true });
    const fetched = await runTool("curl", ["-fsSL", "--retry", "2", "--max-time", "480", "-o", download, archive.url], env, INSTALL_TIMEOUT_MS);
    if (!fetched.ok) return failed(fetched.why.slice(0, 200));
    // The maker's archive and no other: its fingerprint is the one measured for this version.
    const found = await fingerprintOf(download);
    if (found !== archive.sha256) return failed("the download isn't the pinned archive");
    mkdirSync(unpacked, { recursive: true });
    const opened = await runTool("tar", ["-xzf", download, "-C", unpacked, "--strip-components=1"], env, INSTALL_TIMEOUT_MS);
    if (!opened.ok) return failed(opened.why.slice(0, 200));
    rmSync(folder, { recursive: true, force: true });
    renameSync(unpacked, folder);
    writeFileSync(path.join(dir, "version"), `${CURSOR_VERSION}\n`);
    if (!isCursorInstalled(dir)) return failed("no launcher after install");
    log?.(`cursor installed version=${CURSOR_VERSION} ms=${Date.now() - started}`);
    return true;
  } catch (error) {
    return failed(error instanceof Error ? error.message.slice(0, 200) : "unknown");
  } finally {
    rmSync(download, { force: true });
    rmSync(unpacked, { recursive: true, force: true });
  }
}

export type CursorReady = "ready" | "installing" | "failed";

/**
 * Cursor's agent on this computer, installed when it isn't: "ready" once it
 * is; "installing" when the install takes longer than `waitMs` (it goes on,
 * and the next ask finds it); "failed" when it couldn't be installed (the
 * next ask tries again). A stand-in named by `SIMEON_CURSOR_BIN` (tests) is
 * always ready.
 */
export async function ensureCursor(options: CursorInstallOptions = {}): Promise<CursorReady> {
  const base = options.env ?? process.env;
  if (base.SIMEON_CURSOR_BIN?.trim()) return "ready";
  const dir = cursorInstallDir(base);
  if (isCursorInstalled(dir)) return "ready";
  const run = installing ??= install(dir, base, options).finally(() => { installing = undefined; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = await Promise.race([
    run.then((ok) => (ok ? "ready" as const : "failed" as const)),
    new Promise<"installing">((resolve) => { timer = setTimeout(() => resolve("installing"), options.waitMs ?? INSTALL_TIMEOUT_MS); timer.unref?.(); }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  return waited;
}

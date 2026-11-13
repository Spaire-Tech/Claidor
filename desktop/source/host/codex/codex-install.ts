/**
 * Codex installed on the person's computer by the engine itself (13
 * November 2026), as Claude Code is (`claude-code-install.ts`): OpenAI's own
 * npm package, unmodified and pinned, the first time a cloud agent's coding
 * needs it, into a folder outside the person's home and the data root, so it
 * is never in the backup: `/var/tmp/simeon-codex`.
 *
 * The package carries a native program per platform (an optional package,
 * `@openai/codex-linux-x64`, whose `vendor/<target>/bin/codex` is the
 * program; measured on 0.168.0). The engine runs that program itself, not
 * the package's Node launcher. One install at a time; a caller that can't
 * wait is told it's still being set up.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The version installed: Codex's release when this was written. */
export const CODEX_VERSION = "0.168.0";
export const CODEX_PACKAGE = "@openai/codex";
/** Where it goes; `SIMEON_CODEX_DIR` in tests. */
export const CODEX_INSTALL_DIR = "/var/tmp/simeon-codex";
const INSTALL_TIMEOUT_MS = 5 * 60_000;
/** The variables npm gets: the way out (proxies, certificates) and nothing of the engine's. */
const PASSED_TO_NPM = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "npm_config_registry"] as const;

export function codexInstallDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SIMEON_CODEX_DIR?.trim() || CODEX_INSTALL_DIR;
}

/** The native program the package's install puts in place, whichever platform's it is; none when there is none. */
export function installedCodexBinary(dir: string): string | undefined {
  const scope = path.join(dir, "node_modules", "@openai");
  let packages: string[];
  try { packages = readdirSync(scope).filter((name) => name.startsWith("codex-")).sort(); } catch { return undefined; }
  for (const name of packages) {
    const vendor = path.join(scope, name, "vendor");
    let targets: string[];
    try { targets = readdirSync(vendor).sort(); } catch { continue; }
    for (const target of targets) {
      const binary = path.join(vendor, target, "bin", "codex");
      if (existsSync(binary)) return binary;
    }
  }
  return undefined;
}

/** Installed, at this version, and a real program (not a script). */
export function isCodexInstalled(dir: string): boolean {
  const binary = installedCodexBinary(dir);
  if (binary === undefined) return false;
  try {
    if (readFileSync(path.join(dir, "version"), "utf8").trim() !== CODEX_VERSION) return false;
    const head = Buffer.alloc(4);
    const fd = openSync(binary, "r");
    try { readSync(fd, head, 0, 4, 0); } finally { closeSync(fd); }
    // An executable for Linux (ELF), or a Mach-O on a Mac running the engine for testing.
    return head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || head.readUInt32LE(0) === 0xfeedfacf;
  } catch {
    return false;
  }
}

/**
 * The program's path: a stand-in in tests (`SIMEON_CODEX_BIN`); the one the
 * engine installed; else `codex` on the PATH.
 */
export function codexBinary(base: NodeJS.ProcessEnv = process.env): string {
  const standIn = base.SIMEON_CODEX_BIN?.trim();
  if (standIn) return standIn;
  const dir = codexInstallDir(base);
  return (isCodexInstalled(dir) ? installedCodexBinary(dir) : undefined) ?? "codex";
}

let installing: Promise<boolean> | undefined;

function npmEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_TO_NPM) {
    const value = base[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  env.PATH ??= "/usr/local/bin:/usr/bin:/bin";
  env.npm_config_update_notifier = "false";
  env.npm_config_fund = "false";
  env.npm_config_audit = "false";
  return env;
}

function install(dir: string, base: NodeJS.ProcessEnv, log: ((line: string) => void) | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      log?.("codex install failed reason=no folder");
      resolve(false);
      return;
    }
    // A package of its own in the folder, so npm installs there and nowhere else.
    if (!existsSync(path.join(dir, "package.json"))) writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "simeon-codex", private: true })}\n`);
    const child = spawn("npm", ["install", "--prefix", dir, "--no-save", "--no-package-lock", "--loglevel=error", `${CODEX_PACKAGE}@${CODEX_VERSION}`], {
      cwd: dir,
      env: npmEnv(base),
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const finish = (ok: boolean, reason?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) {
        writeFileSync(path.join(dir, "version"), `${CODEX_VERSION}\n`);
        ok = isCodexInstalled(dir);
        if (!ok) reason = "no native program after install";
      }
      log?.(ok
        ? `codex installed version=${CODEX_VERSION} ms=${Date.now() - started}`
        : `codex install failed reason=${reason ?? "unknown"} ms=${Date.now() - started}`);
      resolve(ok);
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false, "timed out"); }, INSTALL_TIMEOUT_MS);
    timer.unref();
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < 4_000) stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => finish(false, error.code === "ENOENT" ? "npm not found" : error.message));
    child.on("close", (code) => finish(code === 0, code === 0 ? undefined : `npm exited ${code ?? "on a signal"}: ${stderr.trim().split("\n").pop() ?? ""}`));
  });
}

export type CodexReady = "ready" | "installing" | "failed";

/**
 * Codex on this computer, installed when it isn't: "ready" once it is;
 * "installing" when the install takes longer than `waitMs` (it goes on, and
 * the next ask finds it); "failed" when npm couldn't install it (the next
 * ask tries again). A stand-in named by `SIMEON_CODEX_BIN` (tests) is always
 * ready.
 */
export async function ensureCodex(options: { env?: NodeJS.ProcessEnv | undefined; waitMs?: number | undefined; log?: ((line: string) => void) | undefined } = {}): Promise<CodexReady> {
  const base = options.env ?? process.env;
  if (base.SIMEON_CODEX_BIN?.trim()) return "ready";
  const dir = codexInstallDir(base);
  if (isCodexInstalled(dir)) return "ready";
  const run = installing ??= install(dir, base, options.log).finally(() => { installing = undefined; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = await Promise.race([
    run.then((ok) => (ok ? "ready" as const : "failed" as const)),
    new Promise<"installing">((resolve) => { timer = setTimeout(() => resolve("installing"), options.waitMs ?? INSTALL_TIMEOUT_MS); timer.unref?.(); }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  return waited;
}

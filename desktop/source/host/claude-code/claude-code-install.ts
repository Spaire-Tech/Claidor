/**
 * Claude Code installed on the person's computer by the engine itself (9
 * November 2026, docs/your-own-models.md, section 6). The computers people
 * use run box2's pinned image (box/e2b/build_template.py, BOX2_IMAGE), not
 * `box/Dockerfile`, so the image's own install (step C2) reaches none of
 * them. The engine installs Anthropic's own npm package, unmodified and
 * pinned, the first time it is needed (Connect Claude, or a Claude turn that
 * finds it missing), into a folder outside the person's home and the data
 * root, so it is never in the backup: `/var/tmp/simeon-claude-code`.
 *
 * Since 2.1 the package carries a native program per platform (its
 * postinstall copies it into `bin/claude.exe`): Node runs only the install
 * script, so the image's Node (Debian's 20) is enough. One install at a time;
 * a caller that can't wait is told it's still being set up.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The version installed: Claude Code's stable release when this was written, as the image's (box/Dockerfile). */
export const CLAUDE_CODE_VERSION = "2.1.311";
export const CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
/** Where it goes; `SIMEON_CLAUDE_CODE_DIR` in tests. */
export const CLAUDE_CODE_INSTALL_DIR = "/var/tmp/simeon-claude-code";
const INSTALL_TIMEOUT_MS = 5 * 60_000;
/** The variables npm gets: the way out (proxies, certificates) and nothing of the engine's. */
const PASSED_TO_NPM = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "npm_config_registry"] as const;

export function claudeCodeInstallDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SIMEON_CLAUDE_CODE_DIR?.trim() || CLAUDE_CODE_INSTALL_DIR;
}

/** The program the package's install puts in place. */
export function installedClaudeCodeBinary(dir: string): string {
  return path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
}

/**
 * Installed, at this version, and the real program: the package's
 * placeholder (a few lines of shell saying the native program is missing)
 * doesn't count.
 */
export function isClaudeCodeInstalled(dir: string): boolean {
  const binary = installedClaudeCodeBinary(dir);
  if (!existsSync(binary)) return false;
  try {
    if (readFileSync(path.join(dir, "version"), "utf8").trim() !== CLAUDE_CODE_VERSION) return false;
    const head = Buffer.alloc(4);
    const fd = openSync(binary, "r");
    try { readSync(fd, head, 0, 4, 0); } finally { closeSync(fd); }
    // An executable for Linux (ELF), or a Mach-O on a Mac running the engine for testing.
    return head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || head.readUInt32LE(0) === 0xfeedfacf;
  } catch {
    return false;
  }
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
      log?.(`claude-code install failed reason=no folder`);
      resolve(false);
      return;
    }
    // A package of its own in the folder, so npm installs there and nowhere else.
    if (!existsSync(path.join(dir, "package.json"))) writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "simeon-claude-code", private: true })}\n`);
    const child = spawn("npm", ["install", "--prefix", dir, "--no-save", "--no-package-lock", "--loglevel=error", `${CLAUDE_CODE_PACKAGE}@${CLAUDE_CODE_VERSION}`], {
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
        writeFileSync(path.join(dir, "version"), `${CLAUDE_CODE_VERSION}\n`);
        ok = isClaudeCodeInstalled(dir);
        if (!ok) reason = "no native program after install";
      }
      log?.(ok
        ? `claude-code installed version=${CLAUDE_CODE_VERSION} ms=${Date.now() - started}`
        : `claude-code install failed reason=${reason ?? "unknown"} ms=${Date.now() - started}`);
      resolve(ok);
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false, "timed out"); }, INSTALL_TIMEOUT_MS);
    timer.unref();
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < 4_000) stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => finish(false, error.code === "ENOENT" ? "npm not found" : error.message));
    child.on("close", (code) => finish(code === 0, code === 0 ? undefined : `npm exited ${code ?? "on a signal"}: ${stderr.trim().split("\n").pop() ?? ""}`));
  });
}

export type ClaudeCodeReady = "ready" | "installing" | "failed";

/**
 * Claude Code on this computer, installed when it isn't: "ready" once it
 * is; "installing" when the install takes longer than `waitMs` (it goes
 * on, and the next ask finds it); "failed" when npm couldn't install it
 * (the next ask tries again). A stand-in named by `SIMEON_CLAUDE_CODE_BIN`
 * (tests) is always ready.
 */
export async function ensureClaudeCode(options: { env?: NodeJS.ProcessEnv | undefined; waitMs?: number | undefined; log?: ((line: string) => void) | undefined } = {}): Promise<ClaudeCodeReady> {
  const base = options.env ?? process.env;
  if (base.SIMEON_CLAUDE_CODE_BIN?.trim()) return "ready";
  const dir = claudeCodeInstallDir(base);
  if (isClaudeCodeInstalled(dir)) return "ready";
  const run = installing ??= install(dir, base, options.log).finally(() => { installing = undefined; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = await Promise.race([
    run.then((ok) => (ok ? "ready" as const : "failed" as const)),
    new Promise<"installing">((resolve) => { timer = setTimeout(() => resolve("installing"), options.waitMs ?? INSTALL_TIMEOUT_MS); timer.unref?.(); }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  return waited;
}

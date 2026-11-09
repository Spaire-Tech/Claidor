/**
 * Claude Code on the person's computer (9 November 2026; the founder: "do it
 * like Reason. Claude code."; docs/your-own-models.md, section 6).
 *
 * Anthropic lets a platform run the unmodified Claude Code on its computers,
 * each person signing in to it with their own Claude plan, and forbids a
 * product keeping or passing on that sign-in itself
 * (code.claude.com/docs/en/legal-and-compliance). So the sign-in here is
 * Claude Code's own: `claude auth login` runs on this computer, the person
 * opens the link it prints, approves on claude.ai and pastes the code Claude
 * shows; the code goes straight to Claude Code's prompt, which finishes the
 * sign-in itself and keeps it in its own file
 * (`<config>/.credentials.json`). Nothing here reads, keeps or logs that
 * file or the code. `claude auth status` says who is signed in.
 *
 * Claude Code runs with an environment of its own: the computer's paths and
 * language, its config folder, the updater off (the image carries the
 * version, `box/Dockerfile`), and none of the engine's variables, so no key
 * or token of Simeon's ever reaches it.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { claudeCodeInstallDir, ensureClaudeCode, installedClaudeCodeBinary, isClaudeCodeInstalled } from "./claude-code-install.js";

/** Where Claude Code keeps its settings and sign-in on the computer (`CLAUDE_CONFIG_DIR`). */
export const CLAUDE_CODE_CONFIG_DIR = "/home/box/.claude";
/** Its credentials file inside that folder: never copied into Simeon's backup (`box-store-sync`). */
export const CLAUDE_CODE_CREDENTIALS_FILE = ".credentials.json";

/** How long the link may take to appear after `claude auth login` starts. */
const LINK_WAIT_MS = 30_000;
/** How long Claude Code may take to finish the sign-in once the code is pasted. */
const FINISH_WAIT_MS = 90_000;
/** A sign-in left waiting for its code ends after OpenAI's and Claude's usual quarter hour. */
const SIGN_IN_LIFETIME_MS = 15 * 60_000;
/** The longest code accepted: Claude's is a few dozen characters (`code#state`). */
const MAX_CODE_LENGTH = 2_000;

export interface ClaudeCodeEnvOptions {
  readonly configDir?: string | undefined;
}

/** The variables of the engine's own environment Claude Code is given: the machine's, never Simeon's. */
const PASSED_THROUGH = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"] as const;

/** Claude Code's environment: the machine's own variables, its config folder, the updater off, and nothing of the engine's. */
export function claudeCodeEnv(base: NodeJS.ProcessEnv, options: ClaudeCodeEnvOptions = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_THROUGH) {
    const value = base[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  env.PATH ??= "/usr/local/bin:/usr/bin:/bin";
  env.HOME ??= "/home/box";
  env.TERM = "xterm-256color";
  env.SHELL = "/bin/sh";
  env.CLAUDE_CONFIG_DIR = options.configDir ?? CLAUDE_CODE_CONFIG_DIR;
  env.DISABLE_AUTOUPDATER = "1";
  return env;
}

/**
 * The program's path: a stand-in in tests (`SIMEON_CLAUDE_CODE_BIN`); the one
 * the engine installed (`claude-code-install.ts`); else `claude` on the PATH.
 */
export function claudeCodeBinary(base: NodeJS.ProcessEnv = process.env): string {
  const standIn = base.SIMEON_CLAUDE_CODE_BIN?.trim();
  if (standIn) return standIn;
  const dir = claudeCodeInstallDir(base);
  return isClaudeCodeInstalled(dir) ? installedClaudeCodeBinary(dir) : "claude";
}

/** How long Connect waits for a first install before saying "try again in a moment" (the install goes on). */
const INSTALL_WAIT_MS = 90_000;

/** Claude Code's install lines in the host log. */
export function logClaudeCode(line: string): void {
  logHostLine(`${HOST_LOG_PREFIX} ${line}`);
}

/** Words without the terminal's colours, cursor moves and links' markers. */
export function plainTerminalText(raw: string): string {
  return raw
    // OSC sequences (a link's `ESC ] 8 ;; url BEL` and titles), ended by BEL or ESC \.
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    // CSI sequences: colours, cursor, erase.
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    // Any other single escape.
    .replace(/\u001b[@-Z\\-_]/g, "")
    .replace(/\r/g, "");
}

/** The sign-in link Claude Code printed: Anthropic's own page, nothing else. */
export function signInLink(output: string): string | undefined {
  const match = /https:\/\/(?:claude\.com|claude\.ai|platform\.claude\.com|console\.anthropic\.com)\/[^\s\u0007\u001b"'<>]*oauth\/authorize[^\s\u0007\u001b"'<>]*/.exec(output);
  if (match == null) return undefined;
  try {
    const url = new URL(match[0]);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export interface ClaudeCodeStatus {
  /** Claude Code is on this computer. */
  readonly installed: boolean;
  readonly signedIn: boolean;
  /** `claude.ai` for a Claude plan, else what Claude Code names (`console`, `oauth_token`…). */
  readonly method?: string | undefined;
  readonly email?: string | undefined;
  /** The plan as Claude Code names it (`max`, `pro`…), when it does. */
  readonly plan?: string | undefined;
  readonly organization?: string | undefined;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

/** `claude auth status`'s JSON, read whatever names this version gives the account's fields. */
export function parseClaudeCodeStatus(json: unknown): ClaudeCodeStatus {
  const body = (json != null && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const account = (body.account != null && typeof body.account === "object" ? body.account : {}) as Record<string, unknown>;
  const pick = (...names: string[]): string | undefined => {
    for (const name of names) {
      const value = text(body[name]) ?? text(account[name]);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return {
    installed: true,
    signedIn: body.loggedIn === true,
    method: pick("authMethod"),
    email: pick("email", "emailAddress", "userEmail"),
    plan: pick("subscriptionType", "plan", "subscription"),
    organization: pick("orgName", "organizationName", "organization"),
  };
}

export interface CommandResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The program could not be started (not installed). */
  readonly missing: boolean;
}

/** Runs Claude Code once with its own environment and gives back what it printed. */
export function runClaudeCode(args: readonly string[], options: { env?: NodeJS.ProcessEnv | undefined; timeoutMs?: number | undefined; configDir?: string | undefined } = {}): Promise<CommandResult> {
  const base = options.env ?? process.env;
  return new Promise((resolve) => {
    let stdout = "", stderr = "", settled = false;
    const child = spawn(claudeCodeBinary(base), [...args], { env: claudeCodeEnv(base, { configDir: options.configDir }), stdio: ["ignore", "pipe", "pipe"] });
    const done = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ code: null, stdout, stderr, missing: false });
    }, options.timeoutMs ?? 20_000);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => done({ code: null, stdout, stderr, missing: error.code === "ENOENT" }));
    child.on("close", (code) => done({ code, stdout, stderr, missing: false }));
  });
}

/** Who is signed in to Claude Code on this computer; not installed, said so. */
export async function claudeCodeStatus(options: { env?: NodeJS.ProcessEnv | undefined; configDir?: string | undefined } = {}): Promise<ClaudeCodeStatus> {
  const result = await runClaudeCode(["auth", "status"], options);
  if (result.missing) return { installed: false, signedIn: false };
  try {
    return parseClaudeCodeStatus(JSON.parse(result.stdout));
  } catch {
    // Not signed in exits 1, its JSON still on stdout; anything unreadable is "not signed in".
    return { installed: true, signedIn: false };
  }
}

/** Signs Claude Code out on this computer (its own `claude auth logout`, which revokes the sign-in). */
export async function claudeCodeSignOut(options: { env?: NodeJS.ProcessEnv | undefined; configDir?: string | undefined } = {}): Promise<ClaudeCodeStatus> {
  await runClaudeCode(["auth", "logout"], options);
  return claudeCodeStatus(options);
}

export type ClaudeCodeSignInResult =
  | { readonly status: "connected"; readonly account: ClaudeCodeStatus }
  | { readonly status: "failed"; readonly reason: "no_sign_in" | "bad_code" | "refused" | "timeout" | "not_installed" };

/**
 * One sign-in at a time on this computer: `claude auth login` in a terminal
 * (`script`, so Claude Code sees one and prints its prompt), its link handed
 * back, the code later typed at its prompt. A new start ends the one before.
 */
export class ClaudeCodeSignIn {
  #child: ChildProcessWithoutNullStreams | undefined;
  #output = "";
  #exit: Promise<number | null> | undefined;
  #lifetime: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: { env?: NodeJS.ProcessEnv | undefined; configDir?: string | undefined; linkWaitMs?: number | undefined; finishWaitMs?: number | undefined } = {}) {}

  /** Starts the sign-in and gives back the link Claude Code printed. */
  async start(): Promise<{ url: string }> {
    this.cancel();
    const base = this.options.env ?? process.env;
    // Installed on first use; the first Connect may wait for it, or be told to try again in a moment.
    const ready = await ensureClaudeCode({ env: base, waitMs: INSTALL_WAIT_MS, log: logClaudeCode });
    if (ready === "installing") throw new Error("Claude Code is still being set up on this computer. Try again in a moment.");
    if (ready === "failed") throw new Error("Claude Code couldn't be installed on this computer.");
    const env = { ...claudeCodeEnv(base, { configDir: this.options.configDir }), SIMEON_CLAUDE_CODE_BIN: claudeCodeBinary(base) };
    // `script` gives Claude Code a terminal; `-e` returns its exit code, `-q` keeps script's own lines out.
    const child = spawn("script", ["-q", "-e", "-c", '"$SIMEON_CLAUDE_CODE_BIN" auth login --claudeai', "/dev/null"], { env, stdio: ["pipe", "pipe", "pipe"] });
    this.#child = child;
    this.#output = "";
    const exit = new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
      child.on("error", () => resolve(null));
    });
    this.#exit = exit;
    const onData = (chunk: Buffer) => { this.#output += chunk.toString("utf8"); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    this.#lifetime = setTimeout(() => this.cancel(), SIGN_IN_LIFETIME_MS);
    this.#lifetime.unref?.();
    const url = await this.#waitFor(() => signInLink(plainTerminalText(this.#output)), exit, this.options.linkWaitMs ?? LINK_WAIT_MS);
    if (url === undefined) {
      const missing = (await Promise.race([exit, Promise.resolve("running")])) === 127;
      this.cancel();
      throw new Error(missing ? "Claude Code isn't on this computer." : "Claude Code didn't give a sign-in link.");
    }
    return { url };
  }

  /** Types the code at Claude Code's prompt and waits for it to finish the sign-in. The code is never kept or logged. */
  async finish(code: string, status: () => Promise<ClaudeCodeStatus> = () => claudeCodeStatus(this.options)): Promise<ClaudeCodeSignInResult> {
    const child = this.#child, exit = this.#exit;
    if (child == null || exit == null) return { status: "failed", reason: "no_sign_in" };
    const typed = code.trim();
    if (typed === "" || typed.length > MAX_CODE_LENGTH || /[\r\n\u0000-\u001f]/.test(typed)) return { status: "failed", reason: "bad_code" };
    child.stdin.write(`${typed}\r`);
    // Some versions ask for Enter after "Login successful": pressed once it shows.
    let pressedOn = false;
    await this.#waitFor(() => {
      if (!pressedOn && /login successful/i.test(plainTerminalText(this.#output))) {
        pressedOn = true;
        child.stdin.write("\r");
      }
      return undefined;
    }, exit, this.options.finishWaitMs ?? FINISH_WAIT_MS);
    const exitCode = await Promise.race([exit, Promise.resolve<"running">("running")]);
    this.cancel();
    if (exitCode === "running") return { status: "failed", reason: "timeout" };
    const account = await status();
    if (account.signedIn) return { status: "connected", account };
    return { status: "failed", reason: account.installed ? "refused" : "not_installed" };
  }

  /** Ends a sign-in still waiting; its output, which echoed the code, is dropped. */
  cancel(): void {
    if (this.#lifetime !== undefined) clearTimeout(this.#lifetime);
    this.#lifetime = undefined;
    const child = this.#child;
    this.#child = undefined;
    this.#exit = undefined;
    this.#output = "";
    if (child != null && child.exitCode == null) child.kill("SIGTERM");
  }

  get waiting(): boolean {
    return this.#child != null;
  }

  /** Waits until `found` gives something, the program ends, or the time runs out. */
  async #waitFor<T>(found: () => T | undefined, exit: Promise<number | null>, ms: number): Promise<T | undefined> {
    let ended = false;
    void exit.then(() => { ended = true; });
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const value = found();
      if (value !== undefined) return value;
      if (ended) return found();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return found();
  }
}

/** The computer's one sign-in, shared by the gateway's commands. */
export const claudeCodeSignIn = new ClaudeCodeSignIn();

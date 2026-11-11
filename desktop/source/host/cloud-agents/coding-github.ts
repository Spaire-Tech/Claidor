/**
 * GitHub on the person's computer, for a cloud agent's coding work (11
 * November 2026; the founder asked for it to work as the upstream app's).
 *
 * The upstream app's cloud agents opened a repository through GitHub
 * connected to its maker's account (its "connect GitHub" card, card 8). Here
 * the work is done on the person's own computer (`coding-run.ts`), so GitHub
 * is connected there, with GitHub's own command line: `gh auth login` in its
 * device flow prints a one-time code, the person opens github.com/login/device
 * on any device, signs in to GitHub as usual and types the code; `gh` keeps
 * the sign-in in its own file (`~/.config/gh/hosts.yml`, on the computer's
 * disk beside Claude Code's) and lends it to `git` (`gh auth setup-git`).
 * Nothing here reads, keeps, logs or sends that file or the token, and the
 * code only goes to the chat's Connect GitHub card.
 *
 * `gh` prints its lines as `! First copy your one-time code: ABCD-1234`,
 * `Open this URL to continue in your web browser: https://github.com/login/device`
 * and `✓ Authentication complete.` (read from gh 2.89's own program; the
 * computer's image carries Debian's, `box/Dockerfile`).
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";

/** Where the person types the code. */
export const GITHUB_DEVICE_URL = "https://github.com/login/device";
/** GitHub's device codes last a quarter of an hour. */
export const GITHUB_CODE_LIFETIME_MS = 15 * 60_000;
/** How long `gh` may take to print the code. */
const CODE_WAIT_MS = 30_000;
/** How long a status read is trusted, so the card's polling never reaches GitHub. */
const STATUS_TTL_MS = 60_000;

/** The variables of the engine's own environment `gh` and `git` are given: the machine's, never Simeon's. */
const PASSED_THROUGH = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "GH_CONFIG_DIR"] as const;

/** `gh`'s and `git`'s environment: the machine's own variables, no prompts, no colours, and nothing of the engine's. */
export function gitHubEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_THROUGH) {
    const value = base[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  env.PATH ??= "/usr/local/bin:/usr/bin:/bin";
  env.HOME ??= "/home/box";
  env.NO_COLOR = "1";
  env.GH_NO_UPDATE_NOTIFIER = "1";
  env.GH_SPINNER_DISABLED = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  // `gh` would open a browser on the computer; the person opens the page on their own device instead.
  env.GH_BROWSER = "true";
  env.BROWSER = "true";
  return env;
}

/** The program's path: a stand-in in tests (`SIMEON_GH_BIN`), else `gh`. */
export function gitHubBinary(base: NodeJS.ProcessEnv = process.env): string {
  return base.SIMEON_GH_BIN?.trim() || "gh";
}

/** Token-looking words taken out of anything `gh` or `git` said before it is kept or shown. */
export function withoutTokens(words: string): string {
  return words.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "***");
}

export interface CommandResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a command to its end; never throws (a missing program is code 127). */
export function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: Record<string, string>; readonly input?: string; readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (result: CommandResult): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", stop);
      resolve(result);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, [...args], { ...(options.cwd === undefined ? {} : { cwd: options.cwd }), env: options.env ?? gitHubEnv(), stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve({ code: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    const stop = (): void => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    };
    const timer = setTimeout(stop, options.timeoutMs ?? 10 * 60_000);
    timer.unref();
    options.signal?.addEventListener("abort", stop, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { if (stdout.length < 2_000_000) stdout += chunk; });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { if (stderr.length < 200_000) stderr += chunk; });
    child.on("error", (error: NodeJS.ErrnoException) => finish({ code: error.code === "ENOENT" ? 127 : null, stdout, stderr: stderr || error.message }));
    child.on("close", (code) => finish({ code, stdout, stderr }));
    child.stdin?.on("error", () => { /* closed early: the close event says why */ });
    child.stdin?.end(options.input ?? "");
  });
}

/** The one-time code and the page `gh` printed, from its words so far. */
export function deviceCodeFrom(words: string): { readonly code: string; readonly url: string } | undefined {
  const code = /one-time code(?: \([^)]*\))?:?\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(words)?.[1];
  if (code === undefined) return undefined;
  const url = /(https:\/\/github\.com\/login\/device\S*)/.exec(words)?.[1] ?? GITHUB_DEVICE_URL;
  return { code: code.toUpperCase(), url };
}

export type GitHubSignInState =
  | { readonly state: "connected"; readonly login?: string }
  | { readonly state: "waiting"; readonly code: string; readonly url: string; readonly expiresAtMs: number }
  | { readonly state: "expired" }
  | { readonly state: "failed"; readonly why: string }
  | { readonly state: "none" };

export interface GitHubAccount {
  readonly connected: boolean;
  /** No `gh` on this computer. */
  readonly missing?: boolean;
  readonly login?: string;
  readonly name?: string;
  readonly id?: number;
}

export interface GitHubOnComputerOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
  readonly run?: typeof runCommand;
  /** For tests: starts `gh auth login` (the real one spawns it). */
  readonly spawnLogin?: (args: readonly string[], env: Record<string, string>) => ChildProcessWithoutNullStreams;
}

/**
 * GitHub on this computer: whether it is connected, and its device sign-in,
 * one at a time. `onConnected` hears each agent that waited on the sign-in,
 * once it finishes.
 */
export class GitHubOnComputer {
  private cached?: { readonly at: number; readonly account: GitHubAccount };
  private flow?: { readonly state: GitHubSignInState; readonly child?: ChildProcessWithoutNullStreams; readonly waiters: Set<string> };
  private readonly listeners = new Set<(agentId: string, login: string | undefined) => void>();

  constructor(private readonly options: GitHubOnComputerOptions = {}) {}

  private get env(): Record<string, string> { return gitHubEnv(this.options.env ?? process.env); }
  private get bin(): string { return gitHubBinary(this.options.env ?? process.env); }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private log(line: string): void { (this.options.log ?? logHostLine)(`${HOST_LOG_PREFIX} github ${line}`); }
  private run(args: readonly string[], timeoutMs = 60_000): Promise<CommandResult> { return (this.options.run ?? runCommand)(this.bin, args, { env: this.env, timeoutMs }); }

  /** Each agent that waited on a sign-in, once it finishes. */
  onConnected(listener: (agentId: string, login: string | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Who is signed in to GitHub on this computer, read at most once a minute unless `fresh`. */
  async account(options: { readonly fresh?: boolean } = {}): Promise<GitHubAccount> {
    const cached = this.cached;
    if (cached !== undefined && options.fresh !== true && this.now() - cached.at < STATUS_TTL_MS) return cached.account;
    const status = await this.run(["auth", "status", "--hostname", "github.com"], 30_000);
    let account: GitHubAccount;
    if (status.code === 127) account = { connected: false, missing: true };
    else if (status.code !== 0) account = { connected: false };
    else {
      const user = await this.run(["api", "user"], 30_000);
      let parsed: { login?: unknown; name?: unknown; id?: unknown } = {};
      try { parsed = JSON.parse(user.stdout) as typeof parsed; } catch { /* not JSON: signed in, name unknown */ }
      account = {
        connected: true,
        ...(typeof parsed.login === "string" ? { login: parsed.login } : {}),
        ...(typeof parsed.name === "string" && parsed.name.trim() !== "" ? { name: parsed.name.trim() } : {}),
        ...(typeof parsed.id === "number" ? { id: parsed.id } : {}),
      };
    }
    this.cached = { at: this.now(), account };
    return account;
  }

  /** The sign-in's state as the chat's card reads it (`getGitHubSignIn`); never reaches GitHub while a sign-in runs. */
  async signInState(): Promise<GitHubSignInState> {
    const flow = this.flow;
    if (flow !== undefined) {
      if (flow.state.state === "waiting" && flow.state.expiresAtMs <= this.now()) return { state: "expired" };
      return flow.state;
    }
    const account = await this.account();
    return account.connected ? { state: "connected", ...(account.login === undefined ? {} : { login: account.login }) } : { state: "none" };
  }

  /**
   * A device sign-in for `agentId`: the one already waiting (the same code)
   * or a new one; `connected` when GitHub already is.
   */
  async startSignIn(agentId: string): Promise<GitHubSignInState> {
    const current = this.flow;
    if (current !== undefined && current.state.state === "waiting" && current.state.expiresAtMs > this.now() && current.child !== undefined && current.child.exitCode === null) {
      current.waiters.add(agentId);
      return current.state;
    }
    const account = await this.account({ fresh: true });
    if (account.connected) return { state: "connected", ...(account.login === undefined ? {} : { login: account.login }) };
    if (account.missing === true) return { state: "failed", why: "GitHub's command line (gh) isn't on this computer." };

    const args = ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key", "--insecure-storage", "--scopes", "workflow"];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.options.spawnLogin?.(args, this.env) ?? spawn(this.bin, args, { env: this.env, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      return { state: "failed", why: error instanceof Error ? error.message : String(error) };
    }
    const waiters = new Set([agentId]);
    let words = "";
    const code = await new Promise<{ code: string; url: string } | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), CODE_WAIT_MS);
      timer.unref();
      const read = (chunk: Buffer | string): void => {
        words += String(chunk);
        const found = deviceCodeFrom(words);
        if (found !== undefined) { clearTimeout(timer); resolve(found); }
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      child.on("error", () => { clearTimeout(timer); resolve(undefined); });
      child.on("close", () => { clearTimeout(timer); resolve(deviceCodeFrom(words)); });
      // An interactive gh waits for Enter before it goes on; one that isn't ignores it.
      child.stdin.on("error", () => {});
      child.stdin.write("\n");
    });
    if (code === undefined) {
      child.kill("SIGTERM");
      const why = withoutTokens(words.trim().split("\n").filter(Boolean).at(-1) ?? "gh printed no code");
      this.log(`sign-in failed before a code: ${why.slice(0, 200)}`);
      return { state: "failed", why };
    }
    const waiting: GitHubSignInState = { state: "waiting", code: code.code, url: code.url, expiresAtMs: this.now() + GITHUB_CODE_LIFETIME_MS };
    this.flow = { state: waiting, child, waiters };
    this.log("sign-in waiting for the person's code");
    child.on("close", (exit) => void this.finished(child, exit, words));
    return waiting;
  }

  private async finished(child: ChildProcessWithoutNullStreams, exit: number | null, words: string): Promise<void> {
    const flow = this.flow;
    if (flow?.child !== child) return;
    if (exit !== 0) {
      const expired = flow.state.state === "waiting" && flow.state.expiresAtMs <= this.now() + 30_000;
      this.flow = { state: expired || /expired/i.test(words) ? { state: "expired" } : { state: "failed", why: "GitHub didn't finish the sign-in." }, waiters: new Set() };
      this.log(`sign-in ended without a sign-in (exit ${exit ?? "signal"})`);
      return;
    }
    // git pushes with the same sign-in.
    await this.run(["auth", "setup-git", "--hostname", "github.com"], 30_000);
    const account = await this.account({ fresh: true });
    this.flow = { state: { state: "connected", ...(account.login === undefined ? {} : { login: account.login }) }, waiters: new Set() };
    this.log(`connected${account.login === undefined ? "" : ` as ${account.login}`}`);
    for (const agentId of flow.waiters) for (const listener of this.listeners) {
      try { listener(agentId, account.login); } catch { /* one listener's trouble is its own */ }
    }
  }

  /** For the engine's stop: a sign-in left waiting ends with it. */
  dispose(): void {
    const child = this.flow?.child;
    if (child !== undefined && child.exitCode === null) child.kill("SIGTERM");
    this.listeners.clear();
  }
}

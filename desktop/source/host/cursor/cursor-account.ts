/**
 * Cursor signed in on the person's computer, for a cloud agent's coding in
 * Cursor's own command-line agent on the person's Cursor plan (13 November
 * 2026, the founder: "Cursor now").
 *
 * As GitHub's sign-in on the computer (`cloud-agents/coding-github.ts`),
 * with the maker's own program, unmodified (`agent login`, measured on
 * 2026.11.11-b912975 with its network cut off, against a stand-in; nothing
 * here was run against Cursor's servers):
 *
 * - `agent login` with `NO_OPEN_BROWSER=1` prints a link to Cursor's own
 *   site and waits, asking Cursor every few seconds for about twenty-three
 *   minutes. The person opens the link on their own device and approves
 *   there: there is no code to type back.
 * - On approval it writes the sign-in to its own file on the computer
 *   (`~/.config/cursor/auth.json`, readable by the person alone) and leaves
 *   with 0. The engine never opens that file: that it is there is what
 *   says Cursor is connected. Cursor's program deletes it itself when
 *   Cursor refuses the sign-in.
 * - `agent logout` takes it away.
 *
 * The sign-in stays on the computer's disk, as Claude's and GitHub's do: it
 * is never copied into Simeon's store (`box-store-sync-service.ts`) and
 * never reaches Simeon Labs' server. Nothing here logs the link or a token.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync, statSync } from "node:fs";
import path from "node:path";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { plainTerminalText } from "../claude-code/claude-code-account.js";
import { cursorBinary, ensureCursor, type CursorReady } from "./cursor-install.js";

/** How long the card waits on one sign-in (Cursor's program gives up a little after). */
export const CURSOR_SIGN_IN_LIFETIME_MS = 20 * 60_000;
/** How long `startSignIn` waits for the install and the link before it answers "installing". */
export const CURSOR_SIGN_IN_ANSWER_MS = 8_000;
/** The variables of the engine's own environment Cursor's program is given: the machine's, never Simeon's. */
const PASSED_THROUGH = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "GIT_SSL_CAINFO"] as const;

/** Cursor's program's environment: the machine's own variables, no browser to open, and nothing of the engine's. */
export function cursorEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_THROUGH) {
    const value = base[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  env.PATH ??= "/usr/local/bin:/usr/bin:/bin";
  env.HOME ??= "/home/box";
  env.SHELL = "/bin/bash";
  env.NO_OPEN_BROWSER = "1";
  env.NO_COLOR = "1";
  env.TERM = "dumb";
  // A stand-in server in tests (`SIMEON_CURSOR_ENDPOINT`); Cursor's own otherwise.
  const standIn = base.SIMEON_CURSOR_ENDPOINT?.trim();
  if (standIn) env.CURSOR_API_ENDPOINT = standIn;
  return env;
}

/** Where Cursor's program keeps its sign-in (its own rule: `~/.cursor` on a Mac, `~/.config/cursor` elsewhere). */
export function cursorAuthFile(base: NodeJS.ProcessEnv = process.env): string {
  const home = base.HOME?.trim() || "/home/box";
  return process.platform === "darwin" ? path.join(home, ".cursor", "auth.json") : path.join(home, ".config", "cursor", "auth.json");
}

/** Cursor is signed in on this computer: its sign-in file is there. The file is never opened. */
export function cursorConnected(base: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const found = statSync(cursorAuthFile(base));
    return found.isFile() && found.size > 2;
  } catch {
    return false;
  }
}

/** The sign-in link Cursor's program printed: a page on Cursor's own site, nothing else. */
export function cursorSignInLink(output: string): string | undefined {
  for (const match of plainTerminalText(output).matchAll(/https:\/\/[^\s"'<>]+/g)) {
    try {
      const url = new URL(match[0]);
      if (url.protocol === "https:" && (url.hostname === "cursor.com" || url.hostname.endsWith(".cursor.com"))) return url.href;
    } catch { /* not a link */ }
  }
  return undefined;
}

/** The sign-in as the chat's card reads it (`getCursorSignIn`). */
export type CursorSignInState =
  | { readonly state: "none" }
  /** Cursor's program is being put on the computer (the first time); the link follows. */
  | { readonly state: "installing" }
  | { readonly state: "waiting"; readonly url: string; readonly expiresAtMs: number }
  | { readonly state: "connected" }
  | { readonly state: "failed"; readonly why: string };

export interface CursorOnComputerDeps {
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
  readonly ensure?: (options: { env: NodeJS.ProcessEnv; waitMs: number; log: (line: string) => void }) => Promise<CursorReady>;
  readonly answerMs?: number;
  readonly lifetimeMs?: number;
}

export class CursorOnComputer {
  private attempt: CursorSignInState = { state: "none" };
  private child: ChildProcess | undefined;
  private starting: Promise<void> | undefined;

  constructor(private readonly deps: CursorOnComputerDeps = {}) {}

  private env(): NodeJS.ProcessEnv { return this.deps.env ?? process.env; }
  private now(): number { return (this.deps.now ?? Date.now)(); }
  private log(line: string): void { (this.deps.log ?? logHostLine)(`${HOST_LOG_PREFIX} cursor ${line}`); }

  /** Cursor is signed in on this computer now. */
  connected(): boolean { return cursorConnected(this.env()); }

  /** The sign-in's state as the chat's card reads it; never reaches Cursor. */
  signInState(): CursorSignInState {
    if (this.connected()) return { state: "connected" };
    if (this.attempt.state === "waiting" && this.attempt.expiresAtMs <= this.now()) return { state: "none" };
    // A sign-in that ended well whose file is gone since (signed out) starts over.
    return this.attempt.state === "connected" ? { state: "none" } : this.attempt;
  }

  /**
   * Starts Cursor's sign-in, or says the one already running. Answers
   * within a few seconds: with the link, or "installing" while Cursor's
   * program is still being put in place (the link follows, and the card
   * reads it with `signInState`). The agent whose card it was is resumed by
   * `ModelConnectWait`, which sees the sign-in once it is there.
   */
  async startSignIn(): Promise<CursorSignInState> {
    if (this.connected()) return { state: "connected" };
    const live = this.signInState();
    if (live.state === "waiting" || (live.state === "installing" && this.starting !== undefined)) return live;
    this.attempt = { state: "installing" };
    const starting = this.begin().finally(() => { if (this.starting === starting) this.starting = undefined; });
    this.starting = starting;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      starting,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, this.deps.answerMs ?? CURSOR_SIGN_IN_ANSWER_MS); timer.unref?.(); }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    return this.signInState();
  }

  /** The install when it is needed, then `agent login` until its link is printed (or it ends). */
  private async begin(): Promise<void> {
    const env = this.env();
    const ready = await (this.deps.ensure ?? ensureCursor)({ env, waitMs: 10 * 60_000, log: (line) => this.log(line) });
    if (ready !== "ready") {
      this.attempt = { state: "failed", why: "Cursor couldn't be set up on the computer" };
      return;
    }
    if (this.connected()) { this.finished(); return; }
    await new Promise<void>((resolve) => {
      let output = "";
      let child: ChildProcess;
      try {
        child = spawn(cursorBinary(env), ["login"], { env: cursorEnv(env), stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        this.attempt = { state: "failed", why: "Cursor's sign-in couldn't start" };
        resolve();
        return;
      }
      this.child = child;
      this.log("sign-in started");
      const lifetime = this.deps.lifetimeMs ?? CURSOR_SIGN_IN_LIFETIME_MS;
      const timer = setTimeout(() => child.kill("SIGTERM"), lifetime + 5 * 60_000);
      timer.unref();
      const read = (chunk: string): void => {
        if (output.length < 16_000) output += chunk;
        if (this.attempt.state !== "installing") return;
        const url = cursorSignInLink(output);
        if (url === undefined) return;
        this.attempt = { state: "waiting", url, expiresAtMs: this.now() + lifetime };
        this.log("sign-in link shown");
        resolve();
      };
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", read);
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", read);
      child.on("error", () => {
        clearTimeout(timer);
        if (this.child === child) this.child = undefined;
        this.attempt = { state: "failed", why: "Cursor's sign-in couldn't start" };
        resolve();
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (this.child === child) this.child = undefined;
        this.log(`sign-in ended code=${code ?? "signal"}`);
        if (this.connected()) this.finished();
        else this.attempt = code === 0 ? { state: "none" } : { state: "failed", why: "Cursor's sign-in ended before it was approved" };
        resolve();
      });
    });
  }

  private finished(): void {
    this.attempt = { state: "connected" };
    this.log("connected");
  }

  /** Cursor signed out on this computer, with its own program (`agent logout`); its sign-in file is gone after. */
  async signOut(): Promise<CursorSignInState> {
    this.child?.kill("SIGTERM");
    this.child = undefined;
    this.attempt = { state: "none" };
    const env = this.env();
    await new Promise<void>((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(cursorBinary(env), ["logout"], { env: cursorEnv(env), stdio: "ignore" });
      } catch {
        resolve();
        return;
      }
      const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      timer.unref();
      child.on("error", () => { clearTimeout(timer); resolve(); });
      child.on("close", () => { clearTimeout(timer); resolve(); });
    });
    // Its program not there (a computer made afresh), or it left the file: the person asked for it gone.
    try { rmSync(cursorAuthFile(env), { force: true }); } catch { /* nothing to take away */ }
    this.log("signed out");
    return this.signInState();
  }

  dispose(): void {
    this.child?.kill("SIGTERM");
    this.child = undefined;
  }
}

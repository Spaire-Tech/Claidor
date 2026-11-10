import { execFile } from "node:child_process";
import { existsSync, lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { X_SOCKET_DIR } from "./box-wallpaper-commands.js";

/**
 * Chrome open on the computer's own screen as soon as it is up (10 November
 * 2026, the founder: "can we by design make the chrome to open by default.
 * as soon as the computer is booted up. cause clicking it sometimes take a
 * while"). Once the screen the person watches (`:1`) is up, the computer's
 * own launcher (`box-chrome`, the one the agent is told to use: its profile,
 * its DevTools port, maximized) opens it; nothing when Chrome already runs
 * there (an engine updated in place finds it open), and once per start of
 * the computer (a mark in /tmp, which a new start empties), so a Chrome the
 * person closed is not opened again by the engine starting anew. A computer
 * without the launcher (the earlier maker's image, the engine away from a
 * computer) is left as it is.
 */
export const BOX_CHROME_COMMAND = "/usr/local/bin/box-chrome";
/** The screen the person watches, and its Chrome's DevTools port (9222 + its number, `box/bin/box-chrome`). */
export const PRIMARY_DISPLAY = ":1";
export const PRIMARY_CHROME_PORT = 9223;
/** Written once Chrome is open on this start of the computer. */
export const CHROME_OPENED_MARK = "/tmp/simeon-chrome-opened";
/** How long the launcher may take: its lock waits 15 s, then up to 10 s for the window. */
export const CHROME_LAUNCH_TIMEOUT_MS = 40_000;
/** How often, and how long, the screen is looked for when the engine starts before it. */
export const DISPLAY_LOOK_MS = 3_000;
export const DISPLAY_WAIT_MS = 180_000;

export type ChromeAtStart = "opened" | "running" | "done-before" | "no-launcher" | "no-screen" | "failed";

export interface ChromeAtStartDeps {
  /** The launcher is on this computer. */
  hasLauncher(): boolean;
  /** The screen the person watches is up (its X socket is there). */
  screenUp(): boolean;
  /** Chrome already answers on that screen's DevTools port. */
  chromeRunning(): Promise<boolean>;
  /** The launcher, on that screen; rejects when it failed. */
  launch(): Promise<void>;
  /** Chrome was opened on this start of the computer (or found open). */
  marked(): boolean;
  mark(): void;
  log(line: string): void;
}

/** One try: Chrome opened on the screen, unless there is no launcher or screen yet, it runs already, or it was opened on this start. */
export async function openChromeOnce(deps: ChromeAtStartDeps): Promise<ChromeAtStart> {
  if (!deps.hasLauncher()) return "no-launcher";
  if (deps.marked()) return "done-before";
  if (!deps.screenUp()) return "no-screen";
  if (await deps.chromeRunning()) {
    deps.mark();
    deps.log("chrome at start: already open");
    return "running";
  }
  try {
    await deps.launch();
  } catch (error) {
    deps.log(`chrome at start: not opened reason=${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    return "failed";
  }
  deps.mark();
  deps.log("chrome at start: opened");
  return "opened";
}

/**
 * Tries until the screen is up (every 3 s, three minutes at most), then
 * once; `later` schedules, and the returned function stops it.
 */
export function openChromeWhenScreenIsUp(
  deps: ChromeAtStartDeps,
  later: (delayMs: number, callback: () => void) => void,
  waitMs: number = DISPLAY_WAIT_MS,
  everyMs: number = DISPLAY_LOOK_MS,
): () => void {
  let stopped = false;
  let waited = 0;
  const attempt = (): void => {
    if (stopped) return;
    void openChromeOnce(deps).then((outcome) => {
      if (stopped || outcome !== "no-screen") return;
      if (waited >= waitMs) {
        deps.log("chrome at start: no screen came up");
        return;
      }
      waited += everyMs;
      later(everyMs, attempt);
    });
  };
  attempt();
  return () => { stopped = true; };
}

/** The computer's own: its launcher, its X socket, its DevTools port, the mark in /tmp. */
export function boxChromeAtStartDeps(log: (line: string) => void, env: NodeJS.ProcessEnv = process.env): ChromeAtStartDeps {
  return {
    hasLauncher: () => existsSync(BOX_CHROME_COMMAND),
    screenUp: () => lstatSync(join(X_SOCKET_DIR, `X${PRIMARY_DISPLAY.slice(1)}`), { throwIfNoEntry: false })?.isSocket() === true,
    chromeRunning: async () => {
      try {
        const answer = await fetch(`http://127.0.0.1:${PRIMARY_CHROME_PORT}/json/version`, { signal: AbortSignal.timeout(1_000) });
        return answer.ok;
      } catch {
        return false;
      }
    },
    launch: () =>
      new Promise((resolve, reject) => {
        execFile(BOX_CHROME_COMMAND, [], { timeout: CHROME_LAUNCH_TIMEOUT_MS, env: { ...env, DISPLAY: PRIMARY_DISPLAY } }, (error) => (error == null ? resolve() : reject(error)));
      }),
    marked: () => existsSync(CHROME_OPENED_MARK),
    mark: () => {
      try { writeFileSync(CHROME_OPENED_MARK, `${new Date().toISOString()}\n`); } catch { /* tried again at the next start */ }
    },
    log,
  };
}

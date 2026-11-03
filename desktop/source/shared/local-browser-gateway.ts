// The browser in the app (docs/app-browser/README.md, step 1, 4 November
// 2026): the engine sends the agent's browser steps to the Mac or Windows
// app over this bridge, shaped like local exec (`local-exec-gateway.ts`).
// The frames are written down in docs/app-browser/protocol.md.

export const GATEWAY_LOCAL_BROWSER_REQUESTS_PATH = "/local-browser/requests";
export const GATEWAY_LOCAL_BROWSER_RESPONSES_PATH = "/local-browser/responses";

/** The protocol both sides speak; an app saying another number is not used. */
export const LOCAL_BROWSER_PROTOCOL = 1;

/** The engine's switch, set by Simeon Labs' server on the computers of the people it lists (`SIMEON_APP_BROWSER_USERS`). */
export const APP_BROWSER_ENV = "SIMEON_APP_BROWSER";

/** An app that pings and then goes quiet this long is taken as gone, as local exec does. */
export const LOCAL_BROWSER_LIVENESS_WINDOW_MS = 30_000;
/** How often the app pings. */
export const LOCAL_BROWSER_HEARTBEAT_MS = 10_000;
/** How long a step waits for its app's browser to come back after a dropped connection before calling it closed. */
export const LOCAL_BROWSER_RECONNECT_GRACE_MS = 10_000;
/** The app's own limit for one step, the box helper's 90 seconds. The engine gives up at its own two minutes. */
export const LOCAL_BROWSER_STEP_DEADLINE_MS = 90_000;
/** How long Auto-review waits for the app's list of pages. */
export const LOCAL_BROWSER_REVIEW_STATE_TIMEOUT_MS = 15_000;
/** A task on the computer's browser idle this long is over: a step that opens an address may then go to the app. */
export const APP_BROWSER_TASK_IDLE_MS = 10 * 60_000;
/** The files one browser_upload_file may send to the app. */
export const LOCAL_BROWSER_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export function isAppBrowserEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[APP_BROWSER_ENV]?.trim().toLowerCase();
  return value === "1" || value === "on" || value === "true" || value === "yes";
}

/** "this Mac", "this PC": where the app's browser is, from its hello. */
export function appBrowserPlace(platform: string | undefined): string {
  return platform === "windows" ? "this PC" : platform === "mac" ? "this Mac" : "the person's computer";
}

/** The step's answer when its task's browser closed (the app quit, the Mac slept). */
export function appBrowserClosedMessage(place: string): string {
  return `The browser on ${place} closed, and its pages with it. The next steps use the browser on your own computer: start again from the address.`;
}

export function appBrowserStoppedMessage(place: string): string {
  return `The browser on ${place} stopped answering; try the step again.`;
}

export function appBrowserTimeoutMessage(place: string, waitedMs: number): string {
  const within = waitedMs >= 60_000 ? `${Math.round(waitedMs / 60_000)} minutes` : `${Math.round(waitedMs / 1_000)} seconds`;
  return `The browser on ${place} didn't answer within ${within}; try the step again.`;
}

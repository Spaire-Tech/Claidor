import { realClock } from "../../../internal/scheduling.js";
import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { APP_BROWSER_ENV, isAppBrowserEnabled } from "../../../shared/local-browser-gateway.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { LocalBrowserBridge, type LocalBrowserReport } from "./local-browser-bridge.js";

/**
 * The browser in the app (docs/app-browser/README.md, step 1, 4 November
 * 2026): the bridge the Mac and Windows apps' browsers connect to, and the
 * route the agent's browser tools ask (`runner/tools/app-browser-route.ts`).
 * Off unless Simeon Labs' server set `SIMEON_APP_BROWSER=1` on this
 * computer (`SIMEON_APP_BROWSER_USERS`, given when the computer is made or replaced):
 * an app may still connect, and is told the switch is off, and every step
 * runs on this computer's Chrome as before.
 *
 * Its log lines read `[simeon] local-browser …`: on or off at start, then
 * each stream, hello, task route, closed browser, timeout.
 */
export function createLocalBrowserBridge(env: NodeJS.ProcessEnv = process.env, log: (line: string) => void = logHostLine): LocalBrowserBridge {
  const enabled = isAppBrowserEnabled(env);
  log(`${HOST_LOG_PREFIX} local-browser ${enabled ? "on" : "off"} (${APP_BROWSER_ENV}=${env[APP_BROWSER_ENV] ?? ""})`);
  const report = (entry: LocalBrowserReport) => { try { log(`${HOST_LOG_PREFIX} local-browser ${JSON.stringify(entry)}`); } catch {} };
  return new LocalBrowserBridge({ clock: realClock, enabled: () => enabled, report });
}

export const localBrowserExtension = defineHostExtension<LocalBrowserBridge>({
  id: HostExtensions.LocalBrowser,
  dependencies: [],
  start: () => createLocalBrowserBridge(),
});

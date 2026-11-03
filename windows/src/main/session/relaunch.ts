// Relaunch's command line (Settings › General's, after a new language). The
// Mac opens a new instance of the app with no link and no argument
// (SettingsGeneral.swift, `relaunch`); Electron's `app.relaunch()` would
// start the new one with this one's whole command line, and with it the
// `simeon://` link Windows started the app with (a pack to add, a
// sign-in's spent code), handed over again as new. So the new one gets
// this command line less its links: `--api=` for a check, and the app's
// folder in a developer's build, stay.

import { appLinkScheme } from '../links'

/** The arguments the relaunched app starts with: this one's (`process.argv` less the program), without a `simeon:` link of any length. */
export function relaunchArguments(argv: readonly string[]): string[] {
  return argv
    .slice(1)
    .filter((arg) => !arg.trim().toLowerCase().startsWith(`${appLinkScheme}:`))
}

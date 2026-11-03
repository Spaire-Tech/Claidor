// `simeon://` links reaching the app: on the command line Windows starts it
// with, or in a second launch's (the app runs once; the second hands its
// line to the first and quits). What a link does is 7d's (the Mac's
// `DeepLink`, `AppReturnSignIn`); here they are only found and passed on.

export const appLinkScheme = 'simeon'
/** The Mac's limit on a link (`DeepLink.maxLength`). */
export const longestLink = 2_048

/** The `simeon://` links on a command line, in order. */
export function linksIn(argv: readonly string[]): string[] {
  return argv.filter(
    (arg) =>
      arg.length <= longestLink &&
      arg.toLowerCase().startsWith(`${appLinkScheme}://`),
  )
}

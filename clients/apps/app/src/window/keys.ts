// The command key, one rule for the whole window (it was in eight places):
// an Apple computer takes ⌘ (Cmd), Windows and every other Control. And
// whether a browser's tabs are around the page: the Windows app has none, so
// it can take the keys a browser keeps for its tabs and windows (Control-Tab,
// Control-N, Control-1 to 9; docs/web-app/PROGRESS.md, "For Windows").

import { desktop } from '../desktop/desktop'

/** An Apple computer: its shortcuts take ⌘. */
export const apple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** The command key is held: ⌘ on an Apple computer, Control elsewhere. */
export function commandHeld(event: {
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  return apple ? event.metaKey : event.ctrlKey
}

/** A browser's tabs are around the page (false in the Windows app). */
export function browserAround(): boolean {
  return desktop() === undefined
}

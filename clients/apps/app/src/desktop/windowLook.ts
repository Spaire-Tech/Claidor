// Windows' caption buttons (the minimise, maximise and close at the top
// right, `titleBarOverlay`) in the page's colours: the chat's ground under
// them and the ink for their symbols (index.css `--ground`, `--ink`), and the
// theme chosen for Windows' own menus. Sent at start, at each theme chosen
// and when the system turns light or dark. The Mac's traffic lights follow
// the window's appearance by themselves.

import { darkNow, onThemeChange, themeNow } from '../window/theme'
import type { WindowLook } from './contract'
import type { Desktop } from './desktop'

/** index.css's `--ground` and `--ink`, light and dark (windowLook.test.ts checks they still match). */
export const captionColours = {
  light: { background: '#fcfcfc', symbols: '#141414' },
  dark: { background: '#070707', symbols: '#fcfcfc' },
} as const

/** The look now: the theme chosen, and the colours of the scheme the window shows. */
export function windowLook(): WindowLook {
  const colours = darkNow() ? captionColours.dark : captionColours.light
  return { theme: themeNow(), ...colours }
}

/** Keeps the caption buttons in the page's colours for the window's life; the call's window has none. */
export function followWindowLook(host: Desktop): () => void {
  let last = ''
  const send = () => {
    const look = windowLook()
    const key = JSON.stringify(look)
    if (key === last) return
    last = key
    void host.call('setWindowLook', look).catch(() => {
      // An app without the call (an older build): its buttons keep the first look.
      last = ''
    })
  }
  send()
  return onThemeChange(send)
}

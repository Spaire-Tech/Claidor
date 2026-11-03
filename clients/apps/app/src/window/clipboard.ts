// This computer's clipboard (the Mac's `NSPasteboard`), in one place for
// the window's seven writers and the computer's screen.
//
// - Copy (an agent's id, a message, a code block, a call's line, the
//   e-mail, the version's facts, the computer's copy): in a browser its own
//   clipboard, which writes only while the page has the focus; in the
//   Windows app through the app, as the Mac writes, whether or not the
//   window is in front.
// - The computer's screen in the Windows app (`AppClipboard`), the Mac's
//   way (ComputerView.swift's `sendClipboard`, `readClipboard`): this PC's
//   words sent on a click in the screen, as the window comes forward and as
//   the screen comes up, only when they changed since they were last read
//   or written here; the computer's copy written here at once. Electron has
//   no clipboard change count: the words themselves stand for it (the same
//   words copied again count as no change, and the computer holds them
//   already). On the web the page can't read the clipboard without asking,
//   so its words go with a paste only (ComputerView.tsx).

import { type Desktop, desktop } from '../desktop/desktop'
import type { ScreenClipboard } from './liveScreen'

/** Words onto this computer's clipboard; rejected when it can't be written. */
export async function copyText(words: string): Promise<void> {
  const host = desktop()
  if (host) {
    await host.call('writeClipboard', words)
    return
  }
  if (!navigator.clipboard) throw new Error('No clipboard.')
  await navigator.clipboard.writeText(words)
}

/** What the screen's clipboard sends words with (`LiveScreen.paste`). */
export interface Pasting {
  paste(words: string): void
}

/** The full view's clipboard in the Windows app (ComputerView.swift's `bridge`, `pasteboardSeen`, `pasteboardSent`). */
export class AppClipboard {
  /** The words last read from or written to this PC's clipboard here: the Mac's change count, as near as words tell it. */
  private seen?: string

  constructor(
    private readonly host: Desktop,
    private readonly screen: ScreenClipboard,
  ) {}

  /** The computer's copy onto this PC's clipboard at once, unless it was just sent either way (`onClipboard`). */
  async fromBox(words: string): Promise<void> {
    const fresh = this.screen.fromBox(words, true)
    if (fresh == null) return
    this.seen = fresh
    try {
      await this.host.call('writeClipboard', fresh)
    } catch {
      // Not written: the next copy tries again.
    }
  }

  /**
   * This PC's words to the computer (`sendClipboard`): on a click in the
   * screen, the window coming forward, the screen coming up; 0.2 s apart at
   * most; only words that changed since they were last read or written here,
   * and that the computer doesn't hold already.
   */
  async send(to: Pasting | undefined): Promise<void> {
    if (!to || !this.screen.mayRead()) return
    let words: string
    try {
      words = await this.host.call('readClipboard')
    } catch {
      return
    }
    if (typeof words !== 'string' || words === this.seen) return
    this.seen = words
    const sending = this.screen.toBox(words)
    if (sending != null) to.paste(sending)
  }

  /** A paste in the screen read the clipboard too: its words count as read here (`readClipboard`). */
  pasted(words: string | undefined): void {
    if (words != null && words !== '') this.seen = words
  }
}

/** The screen's clipboard the Windows app's way; none on the web. */
export function appClipboard(
  screen: ScreenClipboard,
): AppClipboard | undefined {
  const host = desktop()
  return host ? new AppClipboard(host, screen) : undefined
}

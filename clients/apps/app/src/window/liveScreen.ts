// A screen of an agent's computer in the page (ios/Simeon/Computer.swift's
// `LiveScreen`, the page the Mac and the iPhone load in a web view, and
// mac/Simeon/ComputerPreview.swift's `ComputerScreenView`): noVNC connected
// to the screen's WebSocket through Simeon Labs' proxy, with the Mac's
// settings (shared, scaled to fit, the session never resized, black
// behind), its phases ("starting", "connected", "disconnected", "failed",
// "unavailable"), the lines it gives the stream's log, its reconnecting
// (20 tries, 1 s more each time, at most 5), and in the full view the keys
// and the clipboard.
//
// noVNC (@novnc/novnc 1.7.0, MPL 2.0) is loaded only when a screen shows,
// as its own file. Its licence and those of the code inside it (pako, MIT;
// DES, BSD-style) are served beside the app, as the wordmark font's is:
// `novnc/LICENSE.txt`, `novnc/LICENSE.MPL-2.0`, `novnc/pako-LICENSE.txt`
// and `novnc/des-NOTICE.txt` in `public/`. Its source is noVNC's own,
// unchanged: https://github.com/novnc/noVNC/tree/v1.7.0.

import type RFB from '@novnc/novnc'
import { ScreenCrashes, computerScreen, streamLog } from '../core/cloudComputer'

/** An Apple computer: ⌘ is its command key (`buildVncMacKeyMappingScript` is the Mac's alone). */
const apple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

let loading: Promise<typeof RFB> | undefined

/** noVNC, loaded once, when the first screen shows. */
function loadNoVNC(): Promise<typeof RFB> {
  loading ??= import('@novnc/novnc').then((module) => module.default)
  // A failed load is tried again by the next screen.
  loading.catch(() => (loading = undefined))
  return loading
}

/** ⌘ and ⌥ (and the Super keys) let go of, as the computer has them, before a Ctrl shortcut (`HELD`). */
const held: [number, string][] = [
  [0xffe7, 'MetaLeft'],
  [0xffe8, 'MetaRight'],
  [0xffe9, 'AltLeft'],
  [0xffea, 'AltRight'],
  [0xffeb, 'SuperLeft'],
  [0xffec, 'SuperRight'],
]

/** One key sent to the computer: its keysym, its place, and down or up. */
export type KeyStroke = [keysym: number, code: string, down: boolean]

/**
 * ⌘A ⌘C ⌘V ⌘X ⌘Z (with ⇧ or not) as the computer's Ctrl shortcut, by the
 * key's place (the Mac's page's `ctrl`): ⌘, ⌥ and the Super keys let go of,
 * Ctrl (and ⇧) held, the letter pressed, then let go of in turn.
 */
export function ctrlStrokes(code: string, shift: boolean): KeyStroke[] {
  const letter = computerScreen.commandKeys[code]
  if (letter === undefined) return []
  const strokes: KeyStroke[] = held.map(([keysym, place]) => [
    keysym,
    place,
    false,
  ])
  strokes.push([0xffe3, 'ControlLeft', true])
  if (shift) strokes.push([0xffe1, 'ShiftLeft', true])
  strokes.push([letter, code, true], [letter, code, false])
  if (shift) strokes.push([0xffe1, 'ShiftLeft', false])
  strokes.push([0xffe3, 'ControlLeft', false])
  return strokes
}

/**
 * The paste's keys once its words are on the computer's clipboard. On a
 * Mac, ⌘V becomes Ctrl+V as above. Elsewhere Ctrl (and ⇧) are already held
 * on the computer, as noVNC sent them when they went down: only the V.
 */
export function pasteStrokes(onApple: boolean, shift: boolean): KeyStroke[] {
  if (onApple) return ctrlStrokes('KeyV', shift)
  const v = computerScreen.commandKeys.KeyV!
  return [
    [v, 'KeyV', true],
    [v, 'KeyV', false],
  ]
}

/** What a screen tells the view holding it, and what the view asks of it (`ScreenEvents`); each callback is optional. */
export class ScreenEvents {
  /** The screen now connected, for the keys and the clipboard. */
  screen?: LiveScreen
  /** A line for the stream's log (`ComputerStreamLog`). */
  log = (line: string) => streamLog.write(line)
  /** The screen's phase: "starting", "connected", "disconnected", "failed" or "unavailable". */
  onPhase: (phase: string) => void = () => {}
  /** The computer's copied text. */
  onClipboard: (words: string) => void = () => {}
  /** An arrow pressed in the screen holding the keys (`sand:vnc-host-key`). */
  onHostKey: (key: string) => void = () => {}
  /** ⌘V or Ctrl+V (true with ⇧) in the screen holding the keys, with the words the browser's paste brought, when it brought any. */
  onPaste: (words: string | undefined, shift: boolean) => void = () => {}
}

/** The host of a WebSocket address, for the log (never its query, which carries the network's token). */
function hostOf(address: string): string {
  try {
    return new URL(address).host
  } catch {
    return ''
  }
}

/**
 * noVNC in the page, connected to the screen's WebSocket. Watched only
 * (the pane's preview, the helpers' strip) it takes nothing; in the full
 * view it takes the clicks and, once clicked or connected, the keys.
 */
export class LiveScreen {
  private rfb?: RFB
  private closed = false
  private tries = 0
  private everConnected = false
  private retry?: ReturnType<typeof setTimeout>
  private crashes = new ScreenCrashes()
  private readonly interactive: boolean
  private viewOnly: boolean
  /** A paste's keys are on their way: Ctrl+V alone if the browser's paste brings no words. */
  private pasting?: { shift: boolean; timer: ReturnType<typeof setTimeout> }

  constructor(
    private readonly host: HTMLElement,
    private readonly socket: string,
    options: { interactive: boolean },
    private readonly events: ScreenEvents,
  ) {
    this.interactive = options.interactive
    this.viewOnly = !options.interactive
    events.log(
      `attach webview box=${hostOf(socket)} interactive=${options.interactive}`,
    )
    if (this.interactive) {
      host.addEventListener('keydown', this.keyDown, true)
      host.addEventListener('paste', this.pasted, true)
    }
    void this.start()
  }

  private state(state: string, status: string, dialog?: string): void {
    this.events.log(
      `[SimeonScreen] state=${state} status="${status}" dialog=${dialog ?? 'none'}`,
    )
  }

  private async start(): Promise<void> {
    let Client: typeof RFB
    try {
      Client = await loadNoVNC()
    } catch {
      if (this.closed) return
      this.events.onPhase('failed')
      this.events.log(
        '[SimeonScreen] noVNC did not start after 5000ms; root class="" scripts=0',
      )
      return
    }
    if (this.closed) return
    this.events.log('guest loaded url=about:screen')
    this.open(Client)
  }

  private open(Client: typeof RFB): void {
    if (this.closed) return
    this.state('connecting', 'Connecting')
    let rfb: RFB
    try {
      rfb = new Client(this.host, this.socket, { shared: true })
      rfb.scaleViewport = true
      rfb.resizeSession = false
      rfb.viewOnly = this.viewOnly
      rfb.background = '#000'
      rfb.focusOnClick = true
    } catch (error) {
      // noVNC failing in the page is the web's crashed screen page (`render-process-gone`).
      this.events.log(
        `[SimeonScreen] page error: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.crashed(Client)
      return
    }
    this.rfb = rfb
    rfb.addEventListener('connect', () => {
      if (this.rfb !== rfb) return
      this.tries = 0
      this.everConnected = true
      this.events.onPhase('connected')
      this.state('connected', 'Connected')
    })
    rfb.addEventListener('clipboard', (event) => {
      if (this.rfb !== rfb) return
      const detail = event.detail as { text?: string } | undefined
      this.events.onClipboard(detail?.text ?? '')
    })
    rfb.addEventListener('credentialsrequired', () => {
      if (this.rfb === rfb)
        this.state('connecting', '', 'noVNC_credentials_dlg')
    })
    rfb.addEventListener('disconnect', (event) => {
      if (this.rfb !== rfb) return
      const detail = event.detail as { clean?: boolean } | undefined
      this.state(
        'disconnected',
        !this.everConnected
          ? 'Failed to connect to server'
          : detail?.clean
            ? 'Disconnected'
            : 'Something went wrong, connection is closed',
      )
      this.events.onPhase('disconnected')
      this.rfb = undefined
      if (!this.closed && this.tries < 20) {
        this.tries += 1
        this.retry = setTimeout(
          () => this.open(Client),
          Math.min(1000 * this.tries, 5000),
        )
      }
    })
  }

  /** The page failed: loaded again, or "Screen preview unavailable" after too many (`sbn`, `rbn`). */
  private crashed(Client: typeof RFB): void {
    this.events.log('guest renderer gone reason=crashed')
    if (this.crashes.crashed()) {
      this.events.onPhase('starting')
      this.retry = setTimeout(() => this.open(Client), 0)
    } else {
      this.events.onPhase('unavailable')
    }
  }

  /** Watched only, or the person's to use (`simeonViewOnly`). */
  setViewOnly(viewOnly: boolean): void {
    this.viewOnly = viewOnly
    if (this.rfb) this.rfb.viewOnly = viewOnly
  }

  /** The screen takes the keys (the window makes it the first responder once it is up). */
  focus(): void {
    this.rfb?.focus({ preventScroll: true })
  }

  /** Whether the screen has the keys now. */
  get hasKeys(): boolean {
    return this.host.contains(document.activeElement)
  }

  /** Words onto the computer's clipboard, as noVNC pastes them (`simeonClipboardIn`); no key is pressed. */
  paste(words: string): void {
    if (this.rfb && words) this.rfb.clipboardPasteFrom(words)
  }

  /** `words` (when there are any) onto the computer's clipboard, then its paste keys (`simeonPasteKeys`). */
  pasteAndPress(words: string | undefined, shift: boolean): void {
    const rfb = this.rfb
    if (!rfb) return
    if (words) rfb.clipboardPasteFrom(words)
    for (const [keysym, code, down] of pasteStrokes(apple, shift))
      rfb.sendKey(keysym, code, down)
  }

  /**
   * The full view's keys, before noVNC has them: ⌘V or Ctrl+V lets the
   * browser paste (its words come in `pasted`); on a Mac, ⌘A ⌘C ⌘X ⌘Z go as
   * Ctrl (`buildVncMacKeyMappingScript`); the arrows are told to the view
   * too, and still reach the computer (`installVncHostKeyForwarder`).
   */
  private keyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return
    const command = apple ? event.metaKey : event.ctrlKey
    const other = apple ? event.ctrlKey : event.metaKey
    if (command && !other && !event.altKey && event.code === 'KeyV') {
      // Not noVNC's: the browser's paste brings the words this computer has.
      event.stopImmediatePropagation()
      if (this.pasting) clearTimeout(this.pasting.timer)
      const shift = event.shiftKey
      this.pasting = {
        shift,
        // A browser that brings no paste (nothing to read): the keys alone, and the computer pastes what it has.
        timer: setTimeout(() => {
          this.pasting = undefined
          this.events.onPaste(undefined, shift)
        }, 300),
      }
      return
    }
    if (apple && event.metaKey && event.code in computerScreen.commandKeys) {
      const rfb = this.rfb
      if (!rfb) return
      event.preventDefault()
      event.stopImmediatePropagation()
      for (const [keysym, code, down] of ctrlStrokes(
        event.code,
        event.shiftKey,
      ))
        rfb.sendKey(keysym, code, down)
      return
    }
    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight'
    ) {
      // Told once noVNC has sent it (the Mac's page posts it to the window, which hears it after): a switch of screens closes this one.
      const key = event.key
      setTimeout(() => {
        if (!this.closed) this.events.onHostKey(key)
      }, 0)
    }
  }

  /** The browser's paste, in the screen holding the keys: its words go with the keys. */
  private pasted = (event: ClipboardEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const pasting = this.pasting
    if (pasting) clearTimeout(pasting.timer)
    this.pasting = undefined
    const words = event.clipboardData?.getData('text/plain') ?? ''
    this.events.onPaste(
      words === '' ? undefined : words,
      pasting?.shift ?? false,
    )
  }

  /** The view went: the connection with it (`simeonClose`). */
  close(): void {
    this.closed = true
    clearTimeout(this.retry)
    if (this.pasting) clearTimeout(this.pasting.timer)
    this.host.removeEventListener('keydown', this.keyDown, true)
    this.host.removeEventListener('paste', this.pasted, true)
    const rfb = this.rfb
    this.rfb = undefined
    try {
      rfb?.disconnect()
    } catch {
      // Already gone.
    }
  }
}

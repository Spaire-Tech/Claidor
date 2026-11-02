// The part of noVNC 1.7.0's `RFB` the computer's screen uses
// (node_modules/@novnc/novnc/docs/API.md); the package has no types.

declare module '@novnc/novnc' {
  export interface RFBOptions {
    shared?: boolean
    credentials?: { username?: string; password?: string; target?: string }
    repeaterID?: string
    wsProtocols?: string[]
  }

  export default class RFB {
    constructor(
      target: HTMLElement,
      urlOrChannel: string | WebSocket,
      options?: RFBOptions,
    )
    viewOnly: boolean
    scaleViewport: boolean
    resizeSession: boolean
    clipViewport: boolean
    background: string
    focusOnClick: boolean
    addEventListener(type: string, listener: (event: CustomEvent) => void): void
    removeEventListener(
      type: string,
      listener: (event: CustomEvent) => void,
    ): void
    disconnect(): void
    sendKey(keysym: number, code: string | null, down?: boolean): void
    clipboardPasteFrom(text: string): void
    focus(options?: FocusOptions): void
    blur(): void
  }
}

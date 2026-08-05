// @vitest-environment jsdom
//
// ENGINE SPIKE (Path C foundation). Proves we can build the editor OURSELVES —
// our own TipTap editor from @react-email/editor's extensions, with NO
// <EmailEditor> wrapper (so none of their bubble/"/" UI) — and still get
// inbox-correct HTML out via composeReactEmail. If this holds, we can put the
// user's exact custom UI on top of React Email's email-correct engine.
import { composeReactEmail } from '@react-email/editor/core'
import { StarterKit } from '@react-email/editor/extensions'
import { EmailTheming } from '@react-email/editor/plugins'
import { Editor } from '@tiptap/react'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
  }
  if (!document.elementFromPoint) {
    ;(Document.prototype as unknown as { elementFromPoint: unknown }).elementFromPoint =
      () => null
  }
  if (!Range.prototype.getClientRects) {
    ;(Range.prototype as unknown as { getClientRects: unknown }).getClientRects =
      () => [] as unknown as DOMRectList
  }
  if (!Range.prototype.getBoundingClientRect) {
    ;(Range.prototype as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect =
      () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} })
  }
})

describe('Path C engine spike: headless react-email editor', () => {
  it('our own TipTap editor + composeReactEmail → inbox-correct HTML', async () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (StarterKit as any).configure(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (EmailTheming as any).configure({ theme: 'basic' }),
      ],
      content: '<h1>Welcome</h1><p>Hello <strong>world</strong> and <em>friends</em></p>',
    })

    const { html, text } = await composeReactEmail({ editor })
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(50)
    // Content survived.
    expect(html).toContain('Welcome')
    expect(html).toMatch(/Hello/)
    // Email-correct output: inline styles present (email HTML inlines styles).
    expect(html).toMatch(/style=/)
    expect(typeof text).toBe('string')
    expect(text).toMatch(/Hello/)

    editor.destroy()
  })
})

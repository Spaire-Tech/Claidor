// @vitest-environment jsdom
//
// Path A: the real @react-email/editor, mounted exactly as BroadcastComposer
// uses it (no children → no duplicate-plugin crash). Proves:
//   1. it mounts and getEmail() returns email HTML;
//   2. typing "/" opens the built-in slash command menu (the insert UI the
//      user wants working).
import { EmailEditor, type EmailEditorRef } from '@react-email/editor'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'

import '@react-email/editor/styles/slash-command.css'

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
  for (const k of ['ResizeObserver', 'IntersectionObserver'] as const) {
    if (!(k in globalThis)) {
      ;(globalThis as unknown as Record<string, unknown>)[k] = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      }
    }
  }
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    })) as unknown as typeof window.matchMedia
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

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 80))
  })

describe('@react-email/editor (Path A, jsdom)', () => {
  it('mounts (no children) and getEmail() returns HTML', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const holder: { ref: EmailEditorRef | null } = { ref: null }
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <EmailEditor
          placeholder="Write…"
          onUploadImage={async () => ({ url: 'https://x.test/i.png' })}
          onReady={(r) => {
            holder.ref = r
          }}
        />,
      )
    })
    await flush()

    expect(holder.ref).not.toBeNull()
    const out = await holder.ref!.getEmail()
    expect(typeof out.html).toBe('string')
    expect(typeof out.text).toBe('string')

    await act(async () => {
      root.unmount()
    })
  })

  it('typing "/" opens the slash command insert menu', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const holder: { ref: EmailEditorRef | null } = { ref: null }
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <EmailEditor
          placeholder="Write…"
          onUploadImage={async () => ({ url: 'https://x.test/i.png' })}
          onReady={(r) => {
            holder.ref = r
          }}
        />,
      )
    })
    await flush()

    const editor = holder.ref!.editor!
    expect(editor).not.toBeNull()

    // Type "/" at the start of the empty doc — this is what triggers the
    // slash-command suggestion in the editor.
    await act(async () => {
      editor.chain().focus().insertContent('/').run()
    })
    await flush()

    // The slash menu portals to <body> as [data-re-slash-command] with items.
    const menu = document.querySelector('[data-re-slash-command]')
    expect(menu).not.toBeNull()
    expect((menu as HTMLElement).textContent?.length).toBeGreaterThan(0)

    await act(async () => {
      root.unmount()
    })
  })
})

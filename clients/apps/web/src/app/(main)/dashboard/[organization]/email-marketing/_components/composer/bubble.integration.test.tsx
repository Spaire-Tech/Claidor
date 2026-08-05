// @vitest-environment jsdom
//
// End-to-end proof of the bug the user reported: "changing the style of
// selected text changes the whole email." Mounts the real block stack
// (MailDocument → BlockShell → BlockBody → RichText + Bubble), selects ONE
// word, clicks the bubble's Bold button, and asserts only that word is bolded
// in the HTML the block model stores.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { MailDocument } from './blocks'
import type { Block, BlockType } from './types'

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
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

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

function noopProps(over: Partial<Parameters<typeof MailDocument>[0]>) {
  return {
    header: null,
    blocks: [] as Block[],
    selId: null,
    onSelect: vi.fn(),
    update: vi.fn(),
    changeType: vi.fn(),
    addBlock: vi.fn<(type: BlockType, at?: number) => void>(),
    pickImageFor: vi.fn(),
    drag: null,
    dropIdx: null,
    setDropIdx: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDrop: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  }
}

describe('Bubble formats only the selection (full stack)', () => {
  it('bolding one selected word does not touch the rest of the block', async () => {
    const update = vi.fn<(id: string, patch: Partial<Block>) => void>()
    const blocks: Block[] = [
      { id: 'a', type: 'text', html: 'one two three' } as Block,
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<MailDocument {...noopProps({ blocks, update })} />)
    })
    await flush()

    // Focus the block's editor so it registers as active (drives the bubble),
    // then select just the word "two".
    const pm = container.querySelector('.ProseMirror') as HTMLElement
    expect(pm).toBeTruthy()
    const textNode = pm.querySelector('p')!.firstChild as Text
    expect(textNode.textContent).toBe('one two three')

    await act(async () => {
      pm.focus()
      pm.dispatchEvent(new FocusEvent('focus', { bubbles: false }))
      const range = document.createRange()
      range.setStart(textNode, 4) // start of "two"
      range.setEnd(textNode, 7) // end of "two"
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await flush()

    // The selection toolbar appears.
    const bubble = container.querySelector('.bubble')
    expect(bubble).not.toBeNull()

    // Click its Bold button (the one rendering <b>B</b>).
    const boldBtn = Array.from(
      bubble!.querySelectorAll('button.bm'),
    ).find((b) => b.querySelector('b')?.textContent === 'B') as HTMLButtonElement
    expect(boldBtn).toBeTruthy()

    await act(async () => {
      boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      boldBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // The block model received bold around ONLY "two".
    const calls = update.mock.calls.filter(
      (c) => typeof (c[1] as { html?: string }).html === 'string',
    )
    expect(calls.length).toBeGreaterThan(0)
    const lastHtml = (calls[calls.length - 1][1] as { html: string }).html
    expect(lastHtml).toBe('one <strong>two</strong> three')

    await act(async () => {
      root.unmount()
    })
  })
})

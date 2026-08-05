// @vitest-environment jsdom
//
// Proves the "+" insert pipeline of the block composer (the design's editor):
//   1. A collapsed caret inside a block surfaces the floating "+" button.
//   2. Clicking "+" opens the inserter popover with the block library.
//   3. Picking a block inserts it right AFTER the block the caret is in
//      — i.e. positioned relative to the cursor, not blindly appended.
// This is the behavior the slash command never delivered.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { MailDocument } from './blocks'
import type { Block, BlockType } from './types'

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
  // Each text block now mounts a real TipTap editor; these are the jsdom gaps
  // ProseMirror touches when mounting an EditorView.
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
  // jsdom has no layout engine, so Range.getBoundingClientRect is absent.
  // The composer reads it to position the "+" then falls back to the block
  // rect on a zero rect — give it a zero rect so that fallback path runs.
  if (!Range.prototype.getBoundingClientRect) {
    ;(Range.prototype as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect =
      () =>
        ({
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect
  }
})

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

// Minimal no-op prop bag; individual tests override what they assert on.
function props(over: Partial<Parameters<typeof MailDocument>[0]>) {
  const blocks: Block[] = [
    { id: 'a', type: 'text', html: 'First line' } as Block,
    { id: 'b', type: 'text', html: 'Second line' } as Block,
  ]
  return {
    header: null,
    blocks,
    selId: null,
    onSelect: vi.fn(),
    update: vi.fn(),
    changeType: vi.fn(),
    addBlock: vi.fn(),
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

// Place a collapsed caret inside the editable of the block with data-bid=`bid`
// and fire the selectionchange the document listens for.
function putCaretIn(container: HTMLElement, bid: string) {
  const blk = container.querySelector(`[data-bid="${bid}"]`)!
  const editable = blk.querySelector('p') as HTMLElement
  // Editable syncs html via innerHTML in an effect; ensure there's a text node.
  if (!editable.firstChild) editable.appendChild(document.createTextNode('x'))
  const range = document.createRange()
  range.setStart(editable.firstChild!, 0)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

describe('MailDocument "+" inserter (block composer)', () => {
  it('caret → "+" appears → pick Image inserts after the caret block', async () => {
    const addBlock = vi.fn<(type: BlockType, at?: number) => void>()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<MailDocument {...props({ addBlock })} />)
    })
    await flush()

    // No caret yet → no floating +.
    expect(container.querySelector('.blk-add.floating')).toBeNull()

    // Put the caret in the FIRST block (index 0).
    await act(async () => {
      putCaretIn(container, 'a')
    })
    await flush()

    const plus = container.querySelector(
      '.blk-add.floating',
    ) as HTMLButtonElement | null
    expect(plus).not.toBeNull()

    // Click "+" → inserter opens.
    await act(async () => {
      plus!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()
    const inserter = container.querySelector('.inserter')
    expect(inserter).not.toBeNull()
    // The library carries the blocks the bubble menu can't reach.
    expect(inserter!.textContent).toContain('Image')
    expect(inserter!.textContent).toContain('Button')

    // Pick "Image".
    const imageBtn = Array.from(
      inserter!.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Image') as HTMLButtonElement
    expect(imageBtn).toBeTruthy()
    await act(async () => {
      imageBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Inserted as 'image' right AFTER block 'a' (index 0) → at index 1.
    expect(addBlock).toHaveBeenCalledTimes(1)
    expect(addBlock).toHaveBeenCalledWith('image', 1)

    await act(async () => {
      root.unmount()
    })
  })

  it('caret in the SECOND block inserts after it (index 2)', async () => {
    const addBlock = vi.fn<(type: BlockType, at?: number) => void>()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<MailDocument {...props({ addBlock })} />)
    })
    await flush()

    await act(async () => {
      putCaretIn(container, 'b')
    })
    await flush()

    const plus = container.querySelector(
      '.blk-add.floating',
    ) as HTMLButtonElement
    await act(async () => {
      plus.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    const inserter = container.querySelector('.inserter')!
    const dividerBtn = Array.from(inserter.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Divider',
    ) as HTMLButtonElement
    await act(async () => {
      dividerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Caret in 'b' (index 1) → insert at index 2.
    expect(addBlock).toHaveBeenCalledWith('divider', 2)

    await act(async () => {
      root.unmount()
    })
  })
})

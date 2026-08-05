'use client'

// Per-block chrome (brick 3): the selection outline + label + hover tools
// (move up/down, duplicate, delete) for the block that holds the cursor.
// Rendered as an overlay inside the .email surface, positioned from the live
// DOM rect of the selected block — so it never fights React Email's own node
// views.

import type { Editor } from '@tiptap/react'
import {
  useEffect,
  useReducer,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from 'react'

import {
  deleteBlock,
  duplicateBlock,
  moveBlock,
  selectedBlockIndex,
  topBlocks,
} from './engine'

export type BlockSel = { index: number; type: string; label: string } | null

function Ico({ d }: { d: string }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}
const D = {
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  dup: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
}

export function BlockChrome({
  editor,
  emailRef,
  onSelect,
  onGripDragStart,
  onGripDragEnd,
}: {
  editor: Editor | null
  emailRef: RefObject<HTMLDivElement | null>
  onSelect: (sel: BlockSel) => void
  onGripDragStart?: (index: number, e: ReactDragEvent) => void
  onGripDragEnd?: () => void
}) {
  const [, force] = useReducer((n: number) => n + 1, 0)

  // Reposition on every doc/selection change, plus scroll + resize.
  useEffect(() => {
    if (!editor) return
    const f = () => force()
    editor.on('transaction', f)
    editor.on('selectionUpdate', f)
    editor.on('focus', f)
    editor.on('blur', f)
    window.addEventListener('resize', f)
    const scroller = emailRef.current?.closest('.canvas') ?? null
    scroller?.addEventListener('scroll', f, { passive: true })

    // Clicking an atom block (spacer / divider / image) node-selects it —
    // otherwise ProseMirror drops the cursor in an adjacent paragraph and the
    // block can't be edited from the inspector.
    const el = emailRef.current
    const onClick = (ev: MouseEvent) => {
      // Prefer the clicked DOM node's position (posAtCoords snaps a short atom
      // to the neighbouring paragraph); fall back to coords.
      let pos: number | null = null
      try {
        pos = editor.view.posAtDOM(ev.target as Node, 0)
      } catch {
        pos = editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY })?.pos ?? null
      }
      if (pos == null) return
      const b = topBlocks(editor).find(
        (x) => pos! >= x.pos && pos! < x.pos + x.node.nodeSize,
      )
      if (b && b.node.isAtom) editor.commands.setNodeSelection(b.pos)
    }
    el?.addEventListener('click', onClick)

    return () => {
      editor.off('transaction', f)
      editor.off('selectionUpdate', f)
      editor.off('focus', f)
      editor.off('blur', f)
      window.removeEventListener('resize', f)
      scroller?.removeEventListener('scroll', f)
      el?.removeEventListener('click', onClick)
    }
  }, [editor, emailRef])

  const idx = editor ? selectedBlockIndex(editor) : -1
  const block = idx >= 0 ? topBlocks(editor)[idx] : null

  // Report the current selection to the inspector (after render, not during).
  useEffect(() => {
    onSelect(
      block ? { index: idx, type: block.node.type.name, label: block.label } : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, block?.node.type.name])

  if (!editor || !emailRef.current || !block) return null

  const dom = editor.view.nodeDOM(block.pos) as HTMLElement | null
  if (!dom || typeof dom.getBoundingClientRect !== 'function') return null
  const er = emailRef.current.getBoundingClientRect()
  const r = dom.getBoundingClientRect()
  const top = r.top - er.top
  const left = r.left - er.left

  const blocks = topBlocks(editor)
  const tool = (
    title: string,
    d: string,
    onClick: () => void,
    cls = '',
  ) => (
    <button
      className={'bt-btn ' + cls}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      data-tool={title}
    >
      <Ico d={d} />
    </button>
  )

  return (
    <>
      <div
        className="blk sel"
        data-label={block.label}
        style={{
          position: 'absolute',
          top,
          left,
          width: r.width,
          height: r.height,
          pointerEvents: 'none',
          zIndex: 6,
        }}
      />
      <div
        className="blk-tools"
        style={{
          position: 'absolute',
          top: top + 8,
          left: left + r.width - 8,
          transform: 'translateX(-100%)',
          display: 'flex',
          zIndex: 8,
        }}
      >
        <span
          className="bt-btn bt-drag"
          title="Drag to reorder"
          draggable
          data-grip={idx}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(idx))
            onGripDragStart?.(idx, e)
          }}
          onDragEnd={() => onGripDragEnd?.()}
        >
          <Ico d={D.drag} />
        </span>
        {tool('Move up', D.up, () => moveBlock(editor, idx, 'up'))}
        {tool('Move down', D.down, () => moveBlock(editor, idx, 'down'))}
        {tool('Duplicate', D.dup, () => duplicateBlock(editor, idx))}
        {tool(
          'Delete',
          D.trash,
          () => {
            deleteBlock(editor, idx)
            if (blocks.length <= 1) onSelect(null)
          },
          'del',
        )}
      </div>
    </>
  )
}

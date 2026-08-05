'use client'

// Inline formatting bubble (bricks 4–5): over a non-empty text selection in a
// text/heading block — Bold / Italic / Underline / Strike / Link / Colour, all
// driven by our own TipTap editor (React Email marks + the custom colour
// EmailMark). Link & colour open a popover pinned to the captured selection
// range, so clicking the control / typing can't dismiss or misapply it.

import type { Editor } from '@tiptap/react'
import { useEffect, useReducer, useState } from 'react'

import { ColorPicker } from './colorPicker'
import { setTextColor, unsetTextColor } from './engine'

function Ico({ d }: { d: string }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

type Pop = { kind: 'link' | 'color'; from: number; to: number } | null

export function FormatBubble({ editor }: { editor: Editor | null }) {
  const [, force] = useReducer((n: number) => n + 1, 0)
  const [pop, setPop] = useState<Pop>(null)
  const [linkVal, setLinkVal] = useState('')

  useEffect(() => {
    if (!editor) return
    const f = () => force()
    editor.on('selectionUpdate', f)
    editor.on('transaction', f)
    editor.on('blur', f)
    editor.on('focus', f)
    window.addEventListener('resize', f)
    window.addEventListener('scroll', f, true)
    return () => {
      editor.off('selectionUpdate', f)
      editor.off('transaction', f)
      editor.off('blur', f)
      editor.off('focus', f)
      window.removeEventListener('resize', f)
      window.removeEventListener('scroll', f, true)
    }
  }, [editor])

  if (!editor) return null
  const { selection } = editor.state
  const { from, to, empty } = selection
  if (!pop) {
    if (empty || from === to) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(selection as any).$from?.parent?.isTextblock) return null
  }

  const pFrom = pop ? pop.from : from
  const pTo = pop ? pop.to : to
  let start
  try {
    start = editor.view.coordsAtPos(pFrom)
  } catch {
    return null
  }
  const end = (() => {
    try {
      return editor.view.coordsAtPos(pTo)
    } catch {
      return start
    }
  })()
  const top = Math.min(start.top, end.top)
  const left = (start.left + end.left) / 2

  const on = (m: string) => editor.isActive(m)
  const curColor = (editor.getAttributes('textColor').color as string) || null

  const btn = (
    key: string,
    label: string,
    node: React.ReactNode,
    run: () => void,
    active?: boolean,
  ) => (
    <button
      className={'fmt-btn' + (active ?? on(key) ? ' on' : '')}
      title={label}
      data-fmt={key}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {node}
    </button>
  )

  const closePop = () => {
    setPop(null)
    setLinkVal('')
  }
  const applyLink = () => {
    if (!pop) return
    const href = linkVal.trim()
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: pop.from, to: pop.to })
      .extendMarkRange('link')
    if (href) chain.setLink({ href }).run()
    else chain.unsetLink().run()
    closePop()
  }
  const applyColor = (color: string | null) => {
    if (!pop) return
    editor.chain().focus().setTextSelection({ from: pop.from, to: pop.to }).run()
    if (color) setTextColor(editor, color)
    else unsetTextColor(editor)
  }

  // The colour pop is the full HSV picker, rendered standalone (NOT inside the
  // preventDefault bubble) so its hex field can take focus. Anchored under the
  // captured selection; applies live without dismissing.
  if (pop?.kind === 'color') {
    return (
      <ColorPicker
        value={curColor}
        anchor={{ top: top + 6, left: left - 116 }}
        onChange={(c) => applyColor(c)}
        onClear={() => {
          applyColor(null)
          closePop()
        }}
        onClose={closePop}
      />
    )
  }

  return (
    <div
      className="fmt-bubble"
      style={{
        position: 'fixed',
        top: top - 10,
        left,
        transform: 'translate(-50%, -100%)',
        zIndex: 550,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {pop?.kind === 'link' ? (
        <div className="fmt-link">
          <input
            autoFocus
            data-testid="fmt-link-input"
            placeholder="Paste a link…"
            value={linkVal}
            onChange={(e) => setLinkVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink()
              if (e.key === 'Escape') closePop()
            }}
          />
          <button className="fmt-link-go" onClick={applyLink} data-fmt="link-apply">
            Done
          </button>
        </div>
      ) : (
        <>
          {btn('bold', 'Bold', <b>B</b>, () =>
            editor.chain().focus().toggleBold().run(),
          )}
          {btn('italic', 'Italic', <span style={{ fontStyle: 'italic' }}>I</span>, () =>
            editor.chain().focus().toggleItalic().run(),
          )}
          {btn(
            'underline',
            'Underline',
            <span style={{ textDecoration: 'underline' }}>U</span>,
            () => editor.chain().focus().toggleUnderline().run(),
          )}
          {btn(
            'strike',
            'Strikethrough',
            <span style={{ textDecoration: 'line-through' }}>S</span>,
            () => editor.chain().focus().toggleStrike().run(),
          )}
          <span className="fmt-sep" />
          {btn(
            'color',
            'Text colour',
            <span
              className="fmt-color-dot"
              style={{ background: curColor || 'currentColor' }}
            />,
            () => setPop({ kind: 'color', from, to }),
            !!curColor,
          )}
          {btn(
            'link',
            'Link',
            <Ico d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1" />,
            () => {
              setLinkVal((editor.getAttributes('link').href as string) ?? '')
              setPop({ kind: 'link', from, to })
            },
          )}
        </>
      )}
    </div>
  )
}

// A message's actions (mac/Simeon/MessageActions.swift and Tapback.swift):
// the hover bar beside a message (Add reaction, Reply, More), the capsule of
// quick reactions over it, its menus (More: Start a thread and Copy; the
// right click: Add reaction, Reply, Start a thread, Copy), and the message
// being answered over the field.
//
// Still to come (docs/web-app/PROGRESS.md): More emoji, the full picker
// (`EmojiPopover`, 2b).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bubble } from '../core/chat'
import { t } from '../l10n'
import { classes } from './classes'

/** The quick reactions (`MessageMenu.quick`, the window's `sand-reaction-picker`), in its order. */
export const quickReactions = ['👍', '👎', '❤️', '😂', '🎉', '😮']

/** The message the next one answers (`ChatControl.Reply`): its id, its line (72 characters) and the field's words. */
export interface Reply {
  id: string
  line: string
  placeholder: string
}

/** What a message's bar and menus ask of the chat around them. */
export interface MessageActions {
  react: (bubble: Bubble, anchor: HTMLElement) => void
  reply: (bubble: Bubble) => void
  more: (bubble: Bubble, button: HTMLElement) => void
  /** The right click (`RightClickMenu`), at the pointer in the window. */
  context: (bubble: Bubble, x: number, y: number) => void
  /** The message whose menu or capsule is open: its bar stays. */
  heldFor?: string
}

function Glyph({
  name,
}: {
  name: 'smile' | 'reply' | 'forward' | 'more' | 'thread' | 'copy'
}) {
  const paths: Record<typeof name, string> = {
    smile:
      'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13ZM5.5 9.5s.9 1.5 2.5 1.5 2.5-1.5 2.5-1.5M6 6.3v.4M10 6.3v.4',
    reply: 'M6.5 4 3 7.5 6.5 11M3 7.5h6a4 4 0 0 1 4 4v.5',
    forward: 'M9.5 4 13 7.5 9.5 11M13 7.5H7a4 4 0 0 0-4 4v.5',
    more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
    thread: 'M2.5 3.5h8v5.5h-4l-2.5 2v-2h-1.5zM10.5 6h3v5h-1v1.5L10.5 11H7',
    copy: 'M5.5 5.5h7v8h-7zM3.5 10.5v-8h7',
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={name === 'more' ? 2.4 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * A message's actions under the pointer (`HoverBar`): beside the bubble, 6
 * from it and level with its middle, 2 apart; Add reaction, Reply and More
 * (24, 8 round, glyphs at 60%), Add reaction nearest the bubble, so on the
 * person's side the order runs More, Reply, Add reaction.
 */
export function HoverBar({
  bubble,
  actions,
}: {
  bubble: Bubble
  actions: MessageActions
}) {
  const buttons = [
    <button
      key="react"
      type="button"
      className="bar-button"
      title={t('Add reaction')}
      aria-label={t('Add reaction')}
      onClick={(event) => {
        const message = event.currentTarget.closest('[data-bubble-id]')
        if (message instanceof HTMLElement) actions.react(bubble, message)
      }}
    >
      <Glyph name="smile" />
    </button>,
    <button
      key="reply"
      type="button"
      className="bar-button"
      title={
        bubble.fromPerson
          ? t('Reply to your message')
          : t('Reply to Agent message')
      }
      aria-label={
        bubble.fromPerson
          ? t('Reply to your message')
          : t('Reply to Agent message')
      }
      onClick={() => actions.reply(bubble)}
    >
      <Glyph name={bubble.fromPerson ? 'forward' : 'reply'} />
    </button>,
    <button
      key="more"
      type="button"
      className="bar-button"
      title={t('More message actions')}
      aria-label={t('More message actions')}
      onClick={(event) => actions.more(bubble, event.currentTarget)}
    >
      <Glyph name="more" />
    </button>,
  ]
  return (
    <div
      className={classes(
        'hover-bar',
        bubble.fromPerson && 'mine',
        actions.heldFor === bubble.id && 'held',
      )}
      role="group"
      aria-label={
        bubble.fromPerson
          ? t('Message actions for your message')
          : t('Message actions for Agent message')
      }
    >
      {bubble.fromPerson ? [...buttons].reverse() : buttons}
    </div>
  )
}

export interface MenuItem {
  label: string
  glyph?: 'smile' | 'reply' | 'thread' | 'copy'
  action: () => void
  /** A line above this item. */
  separated?: boolean
}

/** Why a menu or the capsule closed: a click elsewhere (which still does what it does), Escape, a scroll, the window behind another, or a pick. */
export type Dismissal = 'click' | 'key' | 'scroll' | 'blur' | 'pick'

/** Closes on a click outside, Escape (which goes no further), the wheel or trackpad scrolling outside it (not the chat's own scrolling as lines come), or the window going to the back. */
function useDismiss(
  box: React.RefObject<HTMLElement | null>,
  close: (why: Dismissal) => void,
) {
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node))
        close('click')
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close('key')
      }
    }
    const scroll = (event: Event) => {
      if (box.current && !box.current.contains(event.target as Node))
        close('scroll')
    }
    const blur = () => close('blur')
    document.addEventListener('mousedown', outside, true)
    document.addEventListener('keydown', key, true)
    document.addEventListener('wheel', scroll, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('mousedown', outside, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('wheel', scroll, true)
      window.removeEventListener('blur', blur)
    }
  }, [box, close])
}

/**
 * A message's menu, as the Mac's menus look: under a button (4 below it, its
 * left edge on the button's, or its right edge for the person's message) or
 * at the pointer; kept inside the chat.
 */
export function PopMenu({
  items,
  at,
  bounds,
  close,
}: {
  items: MenuItem[]
  /** Where it opens, in the chat's own coordinates: a point, and whether the menu's right edge is there. */
  at: { x: number; y: number; endAligned: boolean }
  bounds: { width: number; height: number }
  close: (why: Dismissal) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number }>()
  useDismiss(box, close)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const width = element.offsetWidth
    const height = element.offsetHeight
    let left = at.endAligned ? at.x - width : at.x
    left = Math.min(Math.max(left, 8), bounds.width - width - 8)
    let top = at.y
    if (top + height > bounds.height - 8) top = Math.max(8, at.y - height - 8)
    setPlace({ left, top })
  }, [at, bounds])
  // The menu takes the keys once placed, no item chosen, as a Mac menu opened with the pointer; the arrows choose one.
  const placed = place != null
  useEffect(() => {
    if (placed) box.current?.focus()
  }, [placed])
  return (
    <div
      ref={box}
      className="pop-menu"
      role="menu"
      tabIndex={-1}
      style={
        place
          ? { left: place.left, top: place.top }
          : { visibility: 'hidden', left: 0, top: 0 }
      }
      onKeyDown={(event) => {
        const buttons = [
          ...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? []),
        ]
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        )
        if (event.key === 'ArrowDown')
          buttons[(index + 1) % buttons.length]?.focus()
        else if (event.key === 'ArrowUp')
          buttons[
            index < 0
              ? buttons.length - 1
              : (index - 1 + buttons.length) % buttons.length
          ]?.focus()
        else return
        event.preventDefault()
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.separated && (
            <div className="menu-separator" role="separator" />
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close('pick')
              item.action()
            }}
          >
            {item.glyph && <Glyph name={item.glyph} />}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

/** The capsule's cells (`TapbackBar`): 36 each, 2 apart, 5 in. More emoji, its seventh, comes with the full picker. */
const cell = 36
const gap = 2
const inset = 5
const capsuleWidth =
  quickReactions.length * cell + (quickReactions.length - 1) * gap + 2 * inset
const capsuleHeight = cell + 2 * inset

/**
 * Reactions as Messages offers them (`Tapback`): a capsule in glass just
 * above the message, at its outer corner (its bottom 2 above the message's
 * top, its outer edge 8 past the message's), under it when there is no room
 * above, kept inside the chat; the six quick reactions (22, in 36 circles,
 * grey under the pointer, larger by 15%), the person's own on the blue. It
 * grows out of its corner. A pick shows on the message at once and closes it.
 */
export function TapbackCapsule({
  bubble,
  anchor,
  bounds,
  pick,
  close,
}: {
  bubble: Bubble
  /** The message's place, in the chat's own coordinates. */
  anchor: { left: number; top: number; right: number; bottom: number }
  bounds: { width: number; height: number }
  pick: (emoji: string) => void
  close: (why: Dismissal) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, close)
  let left = bubble.fromPerson
    ? anchor.right + 8 - capsuleWidth
    : anchor.left - 8
  left = Math.min(Math.max(left, 8), bounds.width - capsuleWidth - 8)
  let top = anchor.top - 2 - capsuleHeight
  const below = top < 8
  if (below)
    top = Math.min(anchor.bottom + 2, bounds.height - capsuleHeight - 8)
  return (
    <div
      ref={box}
      className="tapback glass"
      style={{
        left,
        top,
        width: capsuleWidth,
        height: capsuleHeight,
        transformOrigin: `${bubble.fromPerson ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`,
      }}
      role="group"
      aria-label={t('Add reaction')}
    >
      {quickReactions.map((emoji) => {
        const chosen = bubble.myReactions.includes(emoji)
        return (
          <button
            key={emoji}
            type="button"
            className={chosen ? 'tapback-cell chosen' : 'tapback-cell'}
            title={emoji}
            aria-label={
              chosen ? t`Remove your ${emoji} reaction` : t`React with ${emoji}`
            }
            onClick={() => {
              close('pick')
              pick(emoji)
            }}
          >
            <span className="tapback-emoji">{emoji}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The message being answered, over the field (`ReplyPill`): the reply glyph
 * (at 40%), the message's line (14 on 22, at 60%, one line), and Cancel
 * reply; glass, 36 high, 18 round, padded 4 4 4 14.
 */
export function ReplyPill({
  reply,
  cancel,
}: {
  reply: Reply
  cancel: () => void
}) {
  return (
    <div
      className="reply-pill glass"
      role="group"
      aria-label={t`Replying to ${reply.line}`}
    >
      <span className="reply-glyph">
        <Glyph name="reply" />
      </span>
      <span className="reply-line">{reply.line}</span>
      <button
        type="button"
        className="reply-cancel"
        title={t('Cancel reply')}
        aria-label={t('Cancel reply')}
        onClick={cancel}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 2l6 6M8 2 2 8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

export { Glyph }

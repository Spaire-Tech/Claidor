// The full emoji picker (`EmojiPicker` and `EmojiPopover` in
// mac/Simeon/EmojiPicker.swift): More emoji in the reactions' capsule opens
// it where the capsule was.

import { useEffect, useRef, useState } from 'react'
import { type Emoji, type EmojiCatalog, loadEmojiCatalog } from '../core/emoji'
import { t } from '../l10n'
import { type Dismissal, useDismiss } from './MessageActions'

const width = 294
const height = 320

/**
 * The full emoji picker (More emoji, `Choose an emoji`): 294 by 320 on the
 * raised ground, under the message (over it when there is no room below),
 * kept inside the chat. Its head holds the search ("Search emoji"), a
 * hairline under it; then every group from Smileys & emotion to Flags, each
 * titled over its emoji, 8 to a row in 32-point cells (the emoji 20, 6
 * round, grey under the pointer and for the person's own reactions), 2
 * apart, 12 in from each side. Typed words show "Results", or "No emoji
 * found". A pick reacts and closes; Return picks the first result; Escape
 * or a click outside closes it.
 */
export function EmojiPicker({
  mine,
  anchor,
  bounds,
  pick,
  close,
}: {
  /** The person's own reactions on the message. */
  mine: readonly string[]
  /** The message's place, in the chat's own coordinates. */
  anchor: { left: number; top: number; right: number; bottom: number }
  bounds: { width: number; height: number }
  pick: (emoji: string) => void
  close: (why: Dismissal) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [catalog, setCatalog] = useState<EmojiCatalog>()
  const [query, setQuery] = useState('')
  useDismiss(box, close)
  useEffect(() => {
    let live = true
    void loadEmojiCatalog().then((read) => {
      if (live) setCatalog(read)
    })
    field.current?.focus()
    return () => {
      live = false
    }
  }, [])

  const typed = query.trim() !== ''
  const found = typed && catalog ? catalog.search(query) : []
  const choose = (emoji: string) => {
    close('pick')
    pick(emoji)
  }

  let left = (anchor.left + anchor.right) / 2 - width / 2
  left = Math.min(Math.max(left, 8), bounds.width - width - 8)
  let top = anchor.bottom + 8
  if (top + height > bounds.height - 8)
    top = Math.max(8, anchor.top - 8 - height)

  const section = (title: string, emojis: Emoji[]) => (
    <section key={title} className="emoji-section" aria-label={title}>
      <h3 className="emoji-title">{title}</h3>
      <div className="emoji-grid">
        {emojis.map((emoji) => (
          <button
            key={emoji.id}
            type="button"
            className={
              mine.includes(emoji.character) ? 'emoji-cell mine' : 'emoji-cell'
            }
            title={emoji.name}
            aria-label={t`React with ${emoji.name}`}
            onClick={() => choose(emoji.character)}
          >
            {emoji.character}
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <div
      ref={box}
      className="emoji-picker"
      style={{ left, top, width, height }}
      role="dialog"
      aria-label={t('Choose an emoji')}
    >
      <div className="emoji-search">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle
            cx="7"
            cy="7"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 10l3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={field}
          value={query}
          placeholder={t('Search emoji')}
          aria-label={t('Search emoji')}
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && found[0]) {
              event.preventDefault()
              choose(found[0].character)
            }
          }}
        />
      </div>
      <div className="emoji-scroll">
        {typed
          ? found.length === 0
            ? catalog && <p className="emoji-none">{t('No emoji found')}</p>
            : section(t('Results'), found)
          : catalog?.categories.map((category) =>
              section(category.label, category.emojis),
            )}
      </div>
    </div>
  )
}

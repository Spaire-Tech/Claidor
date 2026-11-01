// The message field's lists (mac/Simeon/ComposerPicks.swift, step 2e): ":"
// emoji now; "@" agents, groups, routines and apps, "/" skills and the app's
// actions, and "#" the pull requests the chat named come with their parts
// (docs/web-app/PROGRESS.md). Which is open, the row chosen, an Escape that
// keeps one shut where it was put away, and what was picked lately (the
// window's local storage, `simeon.emojiRecents` as the Mac's defaults).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type Emoji,
  type EmojiCatalog,
  emojiQuery,
  loadEmojiCatalog,
  remembering,
} from '../core/emoji'
import { t } from '../l10n'

/** The list a trigger before the caret opens: what was typed after it, and where it is in the words (what a pick replaces). */
export interface PickRequest {
  kind: 'emoji'
  query: string
  /** The trigger's place in the words. */
  start: number
  /** The caret's. */
  end: number
}

/** A key the field passes to an open list. */
export type ListKey = 'up' | 'down' | 'choose' | 'close'

/** The ":" being typed before the caret (`EmojiCatalog.query`), with nothing chosen. */
export function pickRequest(
  words: string,
  caret: { start: number; end: number } | undefined,
): PickRequest | undefined {
  if (!caret || caret.start !== caret.end) return undefined
  const before = words.slice(0, caret.end)
  const query = emojiQuery(before)
  if (query == null) return undefined
  return {
    kind: 'emoji',
    query,
    start: before.lastIndexOf(':'),
    end: caret.end,
  }
}

const recentsKey = 'simeon.emojiRecents'

function readRecents(): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(recentsKey) ?? '[]')
    return Array.isArray(kept)
      ? kept.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * The field's open list: its request (Escape's dismissal applied), its rows
 * (twelve emoji at most, the ones picked lately first; none until the
 * catalogue is read, which it is when ":" first asks), the row chosen, and
 * Escape and a pick.
 */
export function useComposerPicks(
  words: string,
  caret: { start: number; end: number } | undefined,
) {
  const asked = pickRequest(words, caret)
  // Where Escape put a list away (`dismissedAt`): it stays shut until that trigger is gone or another opens.
  const [dismissedAt, setDismissedAt] = useState<number>()
  if (dismissedAt != null && asked?.start !== dismissedAt)
    setDismissedAt(undefined)
  const request = asked && asked.start !== dismissedAt ? asked : undefined

  const [catalog, setCatalog] = useState<EmojiCatalog>()
  const wanted = request != null
  useEffect(() => {
    if (!wanted || catalog) return
    let live = true
    void loadEmojiCatalog().then((read) => {
      if (live) setCatalog(read)
    })
    return () => {
      live = false
    }
  }, [wanted, catalog])

  const [recents, setRecents] = useState(readRecents)
  const query = request?.query
  const rows = useMemo(
    () => (query != null && catalog ? catalog.suggestions(query, recents) : []),
    [catalog, query, recents],
  )

  // The first row is chosen again whenever the list asks for something new.
  const key = request ? `${request.start}:${request.query}` : ''
  const [chosen, setChosen] = useState({ key: '', index: 0 })
  const selected =
    chosen.key === key
      ? Math.min(chosen.index, Math.max(0, rows.length - 1))
      : 0

  return {
    request,
    rows,
    selected,
    /** The pointer over a row chooses it. */
    choose: (index: number) => setChosen({ key, index }),
    /** ↑ and ↓ choose, round. */
    step: (by: number) =>
      setChosen({
        key,
        index: (((selected + by) % rows.length) + rows.length) % rows.length,
      }),
    dismiss: () => {
      if (request) setDismissedAt(request.start)
    },
    remember: (emoji: Emoji) => {
      const next = remembering(emoji.id, recents)
      setRecents(next)
      try {
        localStorage.setItem(recentsKey, JSON.stringify(next))
      } catch {
        // A browser that keeps nothing: picked lately for this tab only.
      }
    },
  }
}

/**
 * Where a place in the words is drawn in the field (the trigger's line, for
 * the list to hang from), measured on a copy of the field laid out the same.
 */
export function placeInField(
  field: HTMLTextAreaElement,
  index: number,
): { left: number; top: number } {
  const style = getComputedStyle(field)
  const copy = document.createElement('div')
  for (const name of [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'wordSpacing',
    'tabSize',
  ] as const)
    copy.style[name] = style[name]
  copy.style.position = 'absolute'
  copy.style.visibility = 'hidden'
  copy.style.top = '0'
  copy.style.left = '-9999px'
  copy.style.whiteSpace = 'pre-wrap'
  copy.style.overflowWrap = 'break-word'
  copy.textContent = field.value.slice(0, index)
  const mark = document.createElement('span')
  mark.textContent = field.value.slice(index, index + 1) || '.'
  copy.append(mark)
  document.body.append(copy)
  const place = {
    left: mark.offsetLeft - field.scrollLeft,
    top: mark.offsetTop - field.scrollTop,
  }
  copy.remove()
  return place
}

/**
 * Emoji (`sand-emoji-menu`): 320 wide on the chat's ground with a hairline
 * (10%) and a soft shadow, 14 round; its rows 1 apart, padded 4, up to 260
 * high, then it scrolls. A row (28, padded 6 8, 10 round, grey when chosen):
 * the emoji, ":shortcode:" (13) and its name (11, at 40%), 8 apart. The
 * pointer chooses a row; a click picks it, the field keeping the keys.
 */
export function EmojiList({
  rows,
  selected,
  hover,
  pick,
  style,
}: {
  rows: Emoji[]
  selected: number
  hover: (index: number) => void
  pick: (emoji: Emoji) => void
  style: React.CSSProperties
}) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    box.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <div
      ref={box}
      className="pick-list emoji"
      role="listbox"
      aria-label={t('Emoji')}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      {rows.map((emoji, index) => (
        <div
          key={emoji.id}
          data-index={index}
          role="option"
          aria-selected={index === selected}
          aria-label={emoji.name}
          className={index === selected ? 'emoji-row chosen' : 'emoji-row'}
          onMouseEnter={() => hover(index)}
          onClick={() => pick(emoji)}
        >
          <span className="emoji-glyph">{emoji.character}</span>
          <span className="emoji-code">{`:${emoji.shortcodes[0] ?? emoji.id}:`}</span>
          <span className="emoji-name">{emoji.name}</span>
        </div>
      ))}
    </div>
  )
}

// Find in the chat (mac/Simeon/Find.swift): the bar under the chat's head,
// and the marks on the words it finds (`FindMarks`, `FindLine`).

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
} from 'react'
import { FindLine, type FindMarks } from '../core/chatFind'
import { t } from '../l10n'

/** Find's marks for the words being drawn: set on every row while find has words (`findMarks`). */
export const FindContext = createContext<FindMarks | undefined>(undefined)

/** `words`, which start at `offset` in the run that `line` marks, with the times found under the warning yellow (the current one on the yellow itself). */
export function markedWords(
  words: string,
  line: FindLine | undefined,
  offset = 0,
): ReactNode {
  if (!line) return words
  return line.cut(words, offset).map((part, index) =>
    part.mark ? (
      <mark key={index} className={`find-${part.mark}`}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  )
}

/** Plain words (the person's message, a notice) with find's marks (`FindLine.marked`). */
export function Marked({ words }: { words: string }) {
  const marks = useContext(FindContext)
  return <>{markedWords(words, FindLine.of(marks, words))}</>
}

/**
 * Find in the chat (`FindBar`, `sand-chat-find-bar`), 8 under the chat's head
 * and 16 from its right: 34 high, 10 round on the raised ground with a
 * hairline and, on light, a soft shadow; the glass, the field ("Find in
 * chat"), the count once words are typed ("2/5", red when nothing matches),
 * a line, then Previous match, Next match and Close find (off while nothing
 * matches). Return goes to the next match, Shift-Return back, Escape closes;
 * the field takes the keys with its words chosen each time ⌘F is pressed.
 */
export function FindBar({
  query,
  focus,
  ordinal,
  count,
  top,
  onQuery,
  step,
  close,
}: {
  query: string
  /** Bumped by each ⌘F: the field takes the keys, its words chosen. */
  focus: number
  ordinal: number
  count: number
  top: number
  onQuery: (query: string) => void
  step: (delta: number) => void
  close: () => void
}) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [focus])
  const typed = query.trim() !== ''
  const none = count === 0
  return (
    <div
      className="find-bar"
      style={{ top }}
      role="search"
      aria-label={t('Find in chat')}
    >
      <svg
        className="find-glass"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
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
        className="find-field"
        value={query}
        placeholder={t('Find in chat')}
        aria-label={t('Find in chat')}
        spellCheck={false}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            step(event.shiftKey ? -1 : 1)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      />
      {typed && (
        <span
          className={none ? 'find-count none' : 'find-count'}
          // The Mac's key takes the place as text: `Match %@ of %lld`.
          aria-label={
            none ? t('No matches') : t`Match ${String(ordinal)} of ${count}`
          }
        >
          {ordinal}/{count}
        </span>
      )}
      <span className="find-rule" aria-hidden="true" />
      <FindButton
        label={t('Previous match')}
        enabled={!none}
        onClick={() => step(-1)}
        path="M4 10l4-4 4 4"
      />
      <FindButton
        label={t('Next match')}
        enabled={!none}
        onClick={() => step(1)}
        path="M4 6l4 4 4-4"
      />
      <FindButton
        label={t('Close find')}
        enabled
        onClick={close}
        path="M5 5l6 6M11 5l-6 6"
      />
    </div>
  )
}

/** One of find's buttons (`FindButton`): 24 square, 6 round, grey under the pointer; at 30% and off while nothing matches. */
function FindButton({
  label,
  enabled,
  onClick,
  path,
}: {
  label: string
  enabled: boolean
  onClick: () => void
  path: string
}) {
  return (
    <button
      type="button"
      className="find-button"
      title={label}
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

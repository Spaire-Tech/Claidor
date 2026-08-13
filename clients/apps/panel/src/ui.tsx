/**
 * The panel's furniture, and where each piece came from.
 *
 * **The design has no drawing of this screen.** It is 1440 × 900 of
 * workspace; the panel is 320 pixels inside Word. So nothing here is
 * copied — every piece is *composed* from an idiom the design already
 * uses, and each one says which:
 *
 * | Piece | Borrowed from |
 * |---|---|
 * | `Heading` | The Check heading — a title, a quiet line under it |
 * | `Row` | The Check row — title, locator beneath, one word at the right edge |
 * | `Text` | The Chain's « Open the slide · Open the cell » — text, never a button |
 * | `Quiet` | The empty-state paragraph, at 58ch and muted |
 * | `Truncation` | « showing 120 of 1,248 » — the count line under a heading |
 * | `Bar` | The tab strip's own padding and hairline |
 *
 * The two things the workspace does that this must not: no frosted glass,
 * and no floating card. Inside Word the host owns the chrome, and a
 * shadowed rounded panel in a task pane reads as a web page someone
 * embedded rather than as part of the application.
 */

import { useState } from 'react'

import { font, ink, shade, size, space } from './design'

/** The Pierce mark — the workspace chat's, at whatever size asked. */
export function Mark({ side = 16 }: { side?: number }) {
  return (
    <svg
      width={side}
      height={side}
      viewBox="0 0 100 100"
      fill="#0b62c4"
      aria-label="Pierce"
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      <circle cx="26" cy="26" r="13" />
      <ellipse cx="50" cy="26" rx="13" ry="8" transform="rotate(-45 50 26)" />
      <ellipse cx="74" cy="26" rx="13" ry="4" transform="rotate(-45 74 26)" />
      <ellipse cx="26" cy="50" rx="13" ry="8" transform="rotate(-45 26 50)" />
      <ellipse cx="50" cy="50" rx="9.5" ry="4" transform="rotate(-45 50 50)" />
      <ellipse cx="74" cy="50" rx="13" ry="8" transform="rotate(-45 74 50)" />
      <ellipse cx="26" cy="74" rx="13" ry="4" transform="rotate(-45 26 74)" />
      <ellipse cx="50" cy="74" rx="13" ry="8" transform="rotate(-45 50 74)" />
      <circle cx="74" cy="74" r="13" />
    </svg>
  )
}

export function Heading({
  title,
  line,
  action,
  mark,
}: {
  title: string
  line?: string
  action?: React.ReactNode
  /** The small Pierce mark before the title — the workspace header's. */
  mark?: boolean
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: `${space.gutter}px ${space.gutter}px 10px`,
        borderBottom: `1px solid ${shade.rule}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: size.title,
            fontWeight: 600,
            color: ink.base,
            letterSpacing: '-.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {mark && <Mark side={15} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </span>
        </div>
        {line && (
          <div
            style={{
              fontSize: size.small,
              color: ink.secondary,
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {line}
          </div>
        )}
      </div>
      {action}
    </div>
  )
}

/**
 * The blue filled button, at panel scale.
 *
 * Borrowed from the workspace header's « New deal » — the design's rule
 * is one filled control per screen, the thing you came to press. On the
 * sign-in screen that is « Sign in », and nowhere else on the panel does
 * this appear.
 */
export function Primary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 0,
        background: disabled ? ink.faint : ink.accent,
        color: '#fff',
        borderRadius: 11,
        padding: '9px 16px',
        font: 'inherit',
        fontSize: size.meta,
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** The grey secondary button — the workspace card's « Recheck » exactly. */
export function Grey({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 0,
        background: '#f0f0f2',
        borderRadius: 9,
        padding: '6px 13px',
        font: 'inherit',
        fontSize: size.small,
        fontWeight: 500,
        color: disabled ? ink.faint : ink.primary,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** The severity dot the deal page puts before a state word. */
export function Dot({ tone }: { tone: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: 3,
        background: tone,
        flex: '0 0 auto',
      }}
    />
  )
}

/**
 * A text action. Never a button with a fill.
 *
 * The design has exactly one filled control — the chat's send — and it is
 * filled because it is the one thing on that screen you press. A panel
 * with nine findings would have nine filled buttons, and the design's
 * answer for « a small action among small actions » is text in blue, or
 * grey when it is the lesser of two.
 */
export function Text({
  children,
  onClick,
  tone = 'blue',
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: 'blue' | 'quiet'
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        border: 0,
        background: 'transparent',
        padding: 0,
        font: 'inherit',
        fontSize: size.small,
        color: disabled
          ? ink.faint
          : tone === 'blue'
            ? ink.accent
            : ink.secondary,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/**
 * One finding.
 *
 * The Check row exactly: what it is, where it is beneath, and one word at
 * the right edge carrying the severity as colour rather than as a badge.
 * At 320 pixels the title wraps instead of truncating — a finding whose
 * figures are cut off is not a finding, it is a rumour — while the locator
 * under it still truncates, because « slide 14, row « Adjusted EBITDA » »
 * is recognisable from its first few words.
 *
 * **The row itself is the action.** Pressing it moves the document to the
 * figure. That is the whole reason this panel exists rather than a browser
 * tab, so it gets the largest target on the screen instead of a link at
 * the end of a line.
 */
export function Row({
  title,
  where,
  mark,
  markInk,
  dot,
  onClick,
  children,
}: {
  title: React.ReactNode
  where: string
  mark: string
  markInk: string
  /** The severity dot before the word — the deal page's idiom. */
  dot?: boolean
  onClick: () => void
  /** Actions, shown under the row. */
  children?: React.ReactNode
}) {
  // The workspace's rows lift on hover — the wash, not a shadow.
  const [over, setOver] = useState(false)
  return (
    <div style={{ borderTop: `1px solid ${shade.rule}` }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setOver(true)}
        onMouseLeave={() => setOver(false)}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'baseline',
          width: '100%',
          border: 0,
          background: over ? shade.wash : 'transparent',
          padding: `${space.row}px ${space.gutter}px 6px`,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: size.body,
              color: ink.base,
              lineHeight: 1.45,
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: size.tiny,
              color: ink.secondary,
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {where}
          </span>
        </span>
        <span
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: size.tiny,
            color: markInk,
          }}
        >
          {dot && mark && <Dot tone={markInk} />}
          {mark}
        </span>
      </button>
      {children && (
        <div
          style={{
            display: 'flex',
            gap: 14,
            padding: `0 ${space.gutter}px ${space.row}px`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Anything to say that is not a row. Muted, and never alarming. */
export function Quiet({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'critical'
}) {
  return (
    <div
      style={{
        fontSize: size.meta,
        color: tone === 'critical' ? ink.danger : ink.secondary,
        lineHeight: 1.6,
        padding: `10px ${space.gutter}px`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * What is drawn, against what exists.
 *
 * The workspace's rule, and it matters more here: a 320-pixel column can
 * only ever hold a handful of rows, so the temptation to quietly draw the
 * first fifty is strongest exactly where the reader can see least.
 */
export function Truncation({
  shown,
  total,
  onMore,
}: {
  shown: number
  total: number
  onMore: () => void
}) {
  if (shown >= total) return null
  return (
    <div style={{ padding: `12px ${space.gutter}px 16px` }}>
      <span style={{ fontSize: size.tiny, color: ink.faint }}>
        showing {shown.toLocaleString()} of {total.toLocaleString()} —{' '}
      </span>
      <Text onClick={onMore}>show more</Text>
    </div>
  )
}

/** The strip along the bottom, for what acts on the whole document. */
export function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: `9px ${space.gutter}px`,
        borderTop: `1px solid ${shade.rule}`,
        background: shade.wash,
        fontFamily: font.ui,
      }}
    >
      {children}
    </div>
  )
}

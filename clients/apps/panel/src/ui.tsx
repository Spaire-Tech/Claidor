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

import { colour, font, size, space } from './design'

export function Heading({
  title,
  line,
  action,
}: {
  title: string
  line?: string
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: `${space.gutter}px ${space.gutter}px 10px`,
        borderBottom: `1px solid ${colour.rule}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 600,
            color: colour.ink,
            letterSpacing: '-.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {line && (
          <div
            style={{
              fontSize: size.small,
              color: colour.faint,
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
        color: disabled ? colour.fainter : tone === 'blue' ? colour.blue : colour.faint,
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
  onClick,
  children,
}: {
  title: React.ReactNode
  where: string
  mark: string
  markInk: string
  onClick: () => void
  /** Actions, shown under the row. */
  children?: React.ReactNode
}) {
  return (
    <div style={{ borderTop: `1px solid ${colour.bandWarm}` }}>
      <button
        onClick={onClick}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'baseline',
          width: '100%',
          border: 0,
          background: 'transparent',
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
              color: colour.ink,
              lineHeight: 1.45,
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: size.tiny,
              color: colour.faint,
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {where}
          </span>
        </span>
        <span style={{ flex: '0 0 auto', fontSize: size.tiny, color: markInk }}>
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
        color: tone === 'critical' ? colour.critical : colour.muted,
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
      <span style={{ fontSize: size.tiny, color: colour.fainter }}>
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
        borderTop: `1px solid ${colour.rule}`,
        background: colour.wash,
        fontFamily: font.office,
      }}
    >
      {children}
    </div>
  )
}

'use client'

/**
 * Check — the findings across a deal.
 *
 * A row is a title, a locator, and a severity word at the right edge. It
 * opens in place; it does not navigate. The three actions underneath —
 * Trace, Slide, Cell — are text, not buttons, because a list of twenty
 * findings with sixty buttons in it is unreadable.
 *
 * The line under the heading carries the coverage, which is the one place
 * this product says what it did *not* check. « seven findings » on its own
 * implies everything else was looked at and was fine, and the engine
 * cannot make that claim: it reconciles what it can name and leaves the
 * rest, with a reason for each.
 *
 * **Built for hundreds.** The Cascade deck alone yields sixteen findings
 * and it is one deck of three documents; a live deal reaches the hundreds.
 * So the heading pins, the severities filter, the text searches, and the
 * list draws a window rather than everything at once — and says so when it
 * does. See `Dense.tsx` for where each of those came from in the design.
 */

import { useMemo, useState } from 'react'

import type { Finding } from '../api'
import {
  Filter,
  Heading,
  Nothing,
  Search,
  Truncation,
  useWindowed,
} from '../Dense'
import { colour, size } from '../design'

type Severity = 'all' | 'critical' | 'warning' | 'note'

/**
 * The design's three severities, mapped from the server's two.
 *
 * The server distinguishes `error` from `smell` — a mechanical defect
 * against a habit worth a second look — and never adds them together. The
 * design has three levels, and the third earns its place: a difference of
 * exactly one unit at the printed precision is almost always a rounding
 * convention, and putting those in with the real breaks is how a findings
 * list stops being read.
 */
export function severityOf(finding: Finding): {
  key: Severity
  label: string
  ink: string
} {
  if (finding.one_tick) return { key: 'note', label: 'Note', ink: colour.note }
  if (finding.severity === 'smell')
    return { key: 'warning', label: 'Warning', ink: colour.warning }
  return { key: 'critical', label: 'Critical', ink: colour.critical }
}

export function Checks({
  checked,
  findings,
  deal,
  coverage,
  onTrace,
  onSlide,
  onCell,
}: {
  /**
   * Whether the check has ever finished on this deal.
   *
   * The empty state turns on this and nothing else. « Checked, and every
   * figure ties back to the model » on a deal nobody has run is the exact
   * lie this product cannot afford — silence reading as a result — and
   * before Projects existed there was no way to reach such a deal, so
   * nothing ever showed it.
   */
  checked: boolean
  findings: Finding[]
  deal: string
  coverage: string
  onTrace: (finding: Finding) => void
  onSlide: (finding: Finding) => void
  onCell: (finding: Finding) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [severity, setSeverity] = useState<Severity>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const tally = { critical: 0, warning: 0, note: 0 }
    for (const finding of findings)
      tally[severityOf(finding).key as keyof typeof tally]++
    return tally
  }, [findings])

  const matching = useMemo(() => {
    const text = query.trim().toLowerCase()
    return findings.filter((finding) => {
      if (severity !== 'all' && severityOf(finding).key !== severity)
        return false
      if (!text) return true
      // Searched across everything the row shows, so what a reader can see
      // is what they can search — a filename, a slide, a printed figure.
      return [
        finding.title,
        finding.where.filename ?? '',
        finding.where.detail,
        finding.printed,
        finding.expected,
        finding.context,
      ]
        .join(' ')
        .toLowerCase()
        .includes(text)
    })
  }, [findings, query, severity])

  const { shown, sentinel, more } = useWindowed(matching)
  const filtered = severity !== 'all' || query.trim() !== ''

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Heading title="Check" line={`${deal} · ${coverage}`} />

        <div style={{ padding: '0 26px 26px' }}>
          {/* Only worth the room once there is something to sift. */}
          {findings.length > 8 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                paddingBottom: 6,
              }}
            >
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search findings — a figure, a file, a slide"
              />
              <Filter<Severity>
                value={severity}
                onChange={setSeverity}
                options={[
                  { value: 'all', label: 'All', count: findings.length },
                  {
                    value: 'critical',
                    label: 'Critical',
                    count: counts.critical,
                  },
                  { value: 'warning', label: 'Warning', count: counts.warning },
                  { value: 'note', label: 'Note', count: counts.note },
                ]}
              />
            </div>
          )}

          {findings.length === 0 && (
            <Nothing>
              {checked
                ? 'Checked, and every figure ties back to the model.'
                : 'The check has not run on this deal. Put a model and a deck in the data room, and run it.'}
            </Nothing>
          )}

          {findings.length > 0 && matching.length === 0 && (
            <Nothing>
              Nothing matches that. {filtered && 'Clear the filter to see all '}
              {filtered && findings.length}
              {filtered && ' findings.'}
            </Nothing>
          )}

          {shown.map((finding) => {
            const level = severityOf(finding)
            const isOpen = open === finding.id
            return (
              <div
                key={finding.id}
                style={{ borderTop: `1px solid ${colour.bandWarm}` }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : finding.id)}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'baseline',
                    width: '100%',
                    border: 0,
                    background: 'transparent',
                    padding: '15px 0',
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
                      {finding.title}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: size.small,
                        color: colour.faint,
                        marginTop: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {[finding.where.filename, finding.where.detail]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: size.small,
                      color: level.ink,
                    }}
                  >
                    {level.label}
                  </span>
                </button>

                {isOpen && (
                  <div
                    style={{
                      padding: '0 0 18px',
                      animation: 'pcIn .18s ease both',
                    }}
                  >
                    <div
                      style={{
                        fontSize: size.meta,
                        color: colour.muted,
                        lineHeight: 1.7,
                        maxWidth: '62ch',
                      }}
                    >
                      {finding.context}
                    </div>
                    <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
                      <button
                        onClick={() => onTrace(finding)}
                        style={link(colour.blue)}
                      >
                        Trace
                      </button>
                      <button
                        onClick={() => onSlide(finding)}
                        style={link(colour.faint)}
                      >
                        Slide
                      </button>
                      <button
                        onClick={() => onCell(finding)}
                        style={link(colour.faint)}
                      >
                        Cell
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {more && (
            <Truncation
              shown={shown.length}
              total={matching.length}
              sentinel={sentinel}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const link = (ink: string) => ({
  border: 0,
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  fontSize: 13,
  color: ink,
  cursor: 'pointer',
})

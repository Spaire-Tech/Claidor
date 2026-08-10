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
 */

import { useState } from 'react'

import type { Finding } from '../api'
import { colour, size } from '../design'

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
export function severityOf(finding: Finding): { label: string; ink: string } {
  if (finding.one_tick) return { label: 'Note', ink: colour.note }
  if (finding.severity === 'smell') return { label: 'Warning', ink: colour.warning }
  return { label: 'Critical', ink: colour.critical }
}

export function Checks({
  findings,
  deal,
  coverage,
  onTrace,
  onSlide,
  onCell,
}: {
  findings: Finding[]
  deal: string
  coverage: string
  onTrace: (finding: Finding) => void
  onSlide: (finding: Finding) => void
  onCell: (finding: Finding) => void
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: '0 0 auto', padding: '24px 26px 18px' }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 500,
            color: colour.ink,
            letterSpacing: '-.015em',
          }}
        >
          Check
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {deal} · {coverage}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 26px 26px' }}>
        {findings.length === 0 && (
          <div style={{ fontSize: size.meta, color: colour.muted, paddingTop: 8 }}>
            Checked, and every figure ties back to the model.
          </div>
        )}

        {findings.map((finding) => {
          const severity = severityOf(finding)
          const isOpen = open === finding.id
          return (
            <div key={finding.id} style={{ borderTop: `1px solid ${colour.bandWarm}` }}>
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
                    {finding.where.filename} · {finding.where.detail}
                  </span>
                </span>
                <span
                  style={{ flex: '0 0 auto', fontSize: size.small, color: severity.ink }}
                >
                  {severity.label}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 0 18px', animation: 'pcIn .18s ease both' }}>
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
                    <button onClick={() => onTrace(finding)} style={link(colour.blue)}>
                      Trace
                    </button>
                    <button onClick={() => onSlide(finding)} style={link(colour.faint)}>
                      Slide
                    </button>
                    <button onClick={() => onCell(finding)} style={link(colour.faint)}>
                      Cell
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
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

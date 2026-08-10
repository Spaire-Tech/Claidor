/**
 * Figure library — every published figure and the source it came from.
 *
 * The status column is the point. `MATCHING` and `DRIFTED` are what the
 * check produced; `CONFIRMED` is what a person settled, and it outranks
 * both — once a banker has said which cell a figure means, re-checking it
 * is arithmetic rather than a guess. `ANCHOR` is a figure that came from
 * outside the model altogether, and nothing behind it can be recomputed.
 */

import type { Finding } from '../api'
import { colour, font, size } from '../design'

export type Row = {
  id: string
  name: string
  source: string
  value: string
  status: 'MATCHING' | 'DRIFTED' | 'CONFIRMED' | 'ANCHOR' | 'UNCHECKED'
}

const INK: Record<Row['status'], string> = {
  MATCHING: colour.matching,
  DRIFTED: colour.critical,
  CONFIRMED: colour.matchingDeep,
  ANCHOR: colour.fainter,
  UNCHECKED: colour.fainter,
}

export function Library({
  rows,
  onOpen,
}: {
  rows: Row[]
  onOpen: (row: Row) => void
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '22px 26px' }}>
      <h2
        style={{
          margin: '0 0 4px',
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '-.015em',
        }}
      >
        Figure library
      </h2>
      <div style={{ color: colour.muted, marginBottom: 18 }}>
        Every published figure, with the source it was drawn from.
      </div>

      {rows.length === 0 && (
        <div style={{ fontSize: size.meta, color: colour.faint }}>
          Nothing published yet. Upload a model and a deck to fill this.
        </div>
      )}

      {rows.map((row) => (
        <button
          key={row.id}
          onClick={() => onOpen(row)}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
            width: '100%',
            textAlign: 'left',
            border: 0,
            borderTop: `1px solid ${colour.rule}`,
            background: 'transparent',
            padding: '13px 8px',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 500 }}>{row.name}</span>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                color: colour.faint,
                marginTop: 2,
                fontFamily: font.mono,
              }}
            >
              {row.source}
            </span>
          </span>
          <span style={{ fontFamily: font.mono }}>{row.value}</span>
          <span
            style={{
              flex: '0 0 92px',
              textAlign: 'right',
              fontSize: 12,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: INK[row.status],
            }}
          >
            {row.status}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Findings tell the library which figures drifted. */
export function driftedRefs(findings: Finding[]): Set<string> {
  return new Set(
    findings.filter((one) => one.kind === 'drift').map((one) => one.source.ref ?? ''),
  )
}

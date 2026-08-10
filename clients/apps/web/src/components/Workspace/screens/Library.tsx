'use client'

/**
 * Figure library — every published figure and the source it came from.
 *
 * The status column is the point. `MATCHING` and `DRIFTED` are what the
 * check produced; `CONFIRMED` is what a person settled, and it outranks
 * both — once a banker has said which cell a figure means, re-checking it
 * is arithmetic rather than a guess. `ANCHOR` is a figure that came from
 * outside the model altogether, and nothing behind it can be recomputed.
 *
 * **A row names where it was printed as well as what it came from.** The
 * design's row is name, source, value, status, and that was enough for the
 * drawing because every figure in it had a different name. A real deck
 * prints the same figure on four slides and the memo prints it again, and
 * on a real deal those became four rows reading « FY2025A Reported EBITDA ·
 * Model!D16 · 41.2 », indistinguishable and therefore useless — a reader
 * cannot tell which one to open. The locator is the second line the Check
 * row already uses, in the same grey and the same position; nothing new
 * was invented for it.
 */

import { useMemo, useState } from 'react'

import type { Finding } from '../api'
import { Filter, Heading, Nothing, Search, Truncation, useWindowed } from '../Dense'
import { colour, font, size } from '../design'

export type Row = {
  id: string
  name: string
  source: string
  /** Where it was printed — « slide 14 », « paragraph 6 ». */
  where: string
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
  const [status, setStatus] = useState<Row['status'] | 'all'>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const row of rows) tally[row.status] = (tally[row.status] ?? 0) + 1
    return tally
  }, [rows])

  const matching = useMemo(() => {
    const text = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (!text) return true
      // Searched across everything the row shows, so what a reader can see
      // is what they can search.
      return `${row.name} ${row.source} ${row.where} ${row.value}`
        .toLowerCase()
        .includes(text)
    })
  }, [query, rows, status])

  const { shown, sentinel, more } = useWindowed(matching)

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Heading
        title="Figure library"
        line="Every published figure, with the source it was drawn from."
      />

      <div style={{ padding: '0 26px 26px' }}>
      {rows.length > 8 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 6 }}>
          <Search value={query} onChange={setQuery} placeholder="Search figures" />
          <Filter<Row['status'] | 'all'>
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All', count: rows.length },
              { value: 'DRIFTED', label: 'Drifted', count: counts.DRIFTED ?? 0 },
              { value: 'MATCHING', label: 'Matching', count: counts.MATCHING ?? 0 },
              { value: 'CONFIRMED', label: 'Confirmed', count: counts.CONFIRMED ?? 0 },
            ]}
          />
        </div>
      )}

      {rows.length === 0 && (
        <Nothing>
          Nothing published yet. Upload a model and a deck to fill this.
        </Nothing>
      )}

      {rows.length > 0 && matching.length === 0 && (
        <Nothing>Nothing matches that.</Nothing>
      )}

      {shown.map((row) => (
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
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {/* The cell reference keeps the mono face — it is a
                  reference and reads as one. Where it was printed is
                  prose and does not. */}
              <span style={{ fontFamily: font.mono }}>{row.source}</span>
              {row.where && ` · ${row.where}`}
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

      {more && (
        <Truncation shown={shown.length} total={matching.length} sentinel={sentinel} />
      )}
      </div>
    </div>
  )
}

/** Findings tell the library which figures drifted. */
export function driftedRefs(findings: Finding[]): Set<string> {
  return new Set(
    findings.filter((one) => one.kind === 'drift').map((one) => one.source.ref ?? ''),
  )
}

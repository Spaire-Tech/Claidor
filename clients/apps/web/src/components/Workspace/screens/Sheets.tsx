'use client'

/**
 * Model audit — the model as a person reads it, and what it fails.
 *
 * The design's screen: a sheet name, the file and its version beneath, a
 * column header row, the rows themselves, and an « Audit » block under
 * them. Everything here is that, on real cells.
 *
 * **Three things the design's mock did not have to solve.**
 *
 * A real model has five sheets, so there is a row of sheet names above the
 * grid. It is the Chain's text buttons — the same idiom the Check filter
 * uses — because the design has no tabs and this is not the place to
 * invent them.
 *
 * A real model has eight periods, not two. The columns come from the
 * workbook rather than from a constant, and the grid scrolls sideways
 * inside itself when there are more than fit, with the label column
 * pinned: a row of numbers with the name scrolled off is unreadable.
 *
 * A real model's values are `0.1222587719`. See `show()` — the honest
 * answer needs the workbook's number format, which is not read yet.
 */

import { useMemo, useState } from 'react'

import type { Finding, ModelGrid } from '../api'
import { Nothing, Truncation, useWindowed } from '../Dense'
import { colour, font, size } from '../design'

/** The width of a value column. Wide enough for « 1,234.5678 ». */
const VALUE = 92
/** The label column, pinned while the values scroll. */
const LABEL = 260

/**
 * A cell's value, at a precision a person can read.
 *
 * **This is a compromise and should not survive.** The workbook says how
 * every cell is meant to be displayed — `0.0%`, `#,##0.0`, `$#,##0` — and
 * that format is not read at ingest, so `0.1222587719` is all this has to
 * work with. Trimming to four decimals is the least dishonest thing
 * available: it never invents precision, and the exact value stays on the
 * element's title so nothing is hidden.
 *
 * The real fix is to read `number_format` when the workbook is read, which
 * is also what would let this screen show « 12.2% » where the model shows
 * a percentage. It is on the roadmap and it is not here yet.
 */
function show(value: string | null): string {
  if (value === null) return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  const trimmed = Math.round(number * 10000) / 10000
  return trimmed.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function Sheets({
  grid,
  audit,
  onCell,
}: {
  grid: ModelGrid | null
  /** The model audit's findings — the rules, not the tie-out. */
  audit: Finding[]
  onCell: (finding: Finding) => void
}) {
  const [sheet, setSheet] = useState(0)
  const [issue, setIssue] = useState<string | null>(null)

  // A new model — a fresh upload, a different file — starts at its first
  // sheet rather than at whichever index the last one happened to be on.
  // Adjusted during the render that notices rather than in an effect
  // afterwards: an effect would draw one frame of the new model at the old
  // model's sheet index, which is a real flash of the wrong sheet.
  const [shownFor, setShownFor] = useState(grid?.artifact_id)
  if (grid?.artifact_id !== shownFor) {
    setShownFor(grid?.artifact_id)
    setSheet(0)
  }

  const here = grid?.sheets[sheet]
  const rows = useMemo(() => here?.rows ?? [], [here])
  const { shown, sentinel, more } = useWindowed(rows)

  if (!grid) {
    return (
      <div style={{ padding: 26 }}>
        <Nothing>
          Open a model from the data room to audit it here, or drop one on the
          data room to add it.
        </Nothing>
      </div>
    )
  }

  const linked = here
    ? here.rows.reduce(
        (total, row) => total + row.cells.filter((cell) => cell?.linked).length,
        0,
      )
    : 0

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: '0 0 auto', padding: '24px 26px 18px' }}>
        <div
          style={{
            fontSize: size.title,
            fontWeight: 500,
            color: colour.ink,
            letterSpacing: '-.015em',
          }}
        >
          {here?.name ?? grid.filename}
        </div>
        <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
          {grid.filename} · v{grid.version} ·{' '}
          {linked === 1 ? '1 cell published' : `${linked} cells published`}
        </div>
      </div>

      {grid.sheets.length > 1 && (
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            padding: '0 26px 14px',
          }}
        >
          {grid.sheets.map((one, index) => (
            <button
              key={one.name}
              onClick={() => setSheet(index)}
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                font: 'inherit',
                fontSize: 13,
                cursor: 'pointer',
                color: index === sheet ? colour.blue : colour.faint,
              }}
            >
              {one.name}
              <span style={{ color: colour.fainter }}> {one.rows_total}</span>
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 26px 26px',
        }}
      >
        {here && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: LABEL + here.columns.length * VALUE }}>
              {/* Only worth a header row when the columns are named. A
                  sheet laid out as a list has one unnamed column and an
                  empty header band would just be a gap. */}
              {here.columns.some(Boolean) && (
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'baseline',
                    paddingBottom: 8,
                  }}
                >
                  <span style={{ flex: `1 0 ${LABEL}px` }} />
                  {here.columns.map((heading, index) => (
                    <span
                      key={`${heading}-${index}`}
                      style={{
                        flex: `0 0 ${VALUE}px`,
                        textAlign: 'right',
                        fontSize: size.tiny,
                        color: colour.fainter,
                      }}
                    >
                      {heading}
                    </span>
                  ))}
                </div>
              )}

              {shown.map((row, index) => (
                <div
                  key={`${row.label}-${index}`}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'baseline',
                    padding: '10px 0',
                    borderTop: `1px solid ${colour.bandWarm}`,
                  }}
                >
                  <span
                    style={{
                      flex: `1 0 ${LABEL}px`,
                      minWidth: 0,
                      fontSize: size.meta,
                      color: colour.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.label}
                  </span>
                  {row.cells.map((cell, column) => (
                    <span
                      key={column}
                      title={
                        cell ? `${cell.ref} = ${cell.value ?? '—'}` : undefined
                      }
                      style={{
                        flex: `0 0 ${VALUE}px`,
                        textAlign: 'right',
                        fontFamily: font.mono,
                        fontSize: 13,
                        // A published cell is the one thing on this screen
                        // that is not simply the workbook read back, so it
                        // is the one thing carrying ink. Everything a
                        // deliverable does not stand on stays quiet.
                        color: cell?.linked ? colour.ink : colour.faint,
                      }}
                    >
                      {show(cell?.value ?? null)}
                    </span>
                  ))}
                </div>
              ))}

              {more && (
                <Truncation
                  shown={shown.length}
                  total={rows.length}
                  sentinel={sentinel}
                />
              )}

              {/* The endpoint caps what it sends, and the sheet says so. */}
              {here.rows.length < here.rows_total && (
                <div style={{ padding: '14px 0 0' }}>
                  <span style={{ fontSize: size.small, color: colour.fainter }}>
                    {here.rows.length.toLocaleString()} of{' '}
                    {here.rows_total.toLocaleString()} rows on this sheet
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 13, color: colour.faint, paddingBottom: 4 }}>
            Audit
          </div>
          {audit.length === 0 && (
            <Nothing>
              Nothing to raise. The model passes every rule this checks.
            </Nothing>
          )}
          {audit.map((finding) => (
            <button
              key={finding.id}
              onClick={() => {
                setIssue(finding.id)
                onCell(finding)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 0,
                background: 'transparent',
                padding: '11px 0',
                borderTop: `1px solid ${colour.bandWarm}`,
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: size.meta,
                  color: finding.id === issue ? colour.ink : colour.muted,
                  lineHeight: 1.5,
                }}
              >
                {finding.title}
              </span>
              <span
                style={{
                  display: 'block',
                  fontFamily: font.mono,
                  fontSize: size.tiny,
                  color: colour.fainter,
                  marginTop: 3,
                }}
              >
                {[finding.source.ref, finding.standard]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

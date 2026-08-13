'use client'

/**
 * The document panel — one file, everything Pierce knows about it.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `docOpen`
 * section. Facts, version history, what is hidden inside it, and the
 * findings on this document with their evidence.
 *
 * Every number is the server's. The facts come from the artifact's own
 * counts and the figure map; « Hidden inside it » is the metadata
 * checker run on the stored bytes, and a file the checker does not read
 * shows the checker's own refusal sentence in place of the list. The
 * design's fourth fact row — « Checked against an older model » — needs
 * per-figure staleness the server cannot yet say, so it is not drawn:
 * a number that cannot be computed is not shown as zero.
 *
 * Evidence, by the finding's shape: a cell finding shows four rows of
 * the model around its cell, from the real grid; a prose finding shows
 * its sentence with the figure marked; a slide finding shows the
 * design's slide sketch carrying the real figure and label.
 *
 * « Not a problem » dismisses — and a dismissal must say why, so the
 * button opens the design's own writing box (no border, no outline) for
 * one sentence. The server refuses a bare dismissal; the input exists
 * because the contract does.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Artifact,
  Finding,
  HiddenReport,
  ModelGrid,
  TieOutApi,
  Version,
} from './../api'
import { fileIcon, font, hairline, ink, inputGlow, well } from './../design'
import { ago } from './DealPage'

const OPEN_LABEL: Record<string, string> = {
  deck: 'Open in PowerPoint',
  memo: 'Open in Word',
  model: 'Open in Excel',
  message: 'Open in Outlook',
  source: 'Open',
}

const panelHead = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: '#86868b',
  padding: '20px 4px 8px',
} as const

const panelCard = {
  background: '#fff',
  borderRadius: 13,
  boxShadow: '0 1px 2px rgba(0,0,0,.05), 0 0 0 .5px rgba(0,0,0,.06)',
  overflow: 'hidden',
} as const

export interface DocPanelProps {
  api: TieOutApi
  dealId: string
  doc: Artifact
  onClose: () => void
  /** A ruling changed a finding — the page behind should reload. */
  onChanged: () => void
}

export const DocPanel = ({
  api,
  dealId,
  doc,
  onClose,
  onChanged,
}: DocPanelProps) => {
  const [findings, setFindings] = useState<Finding[]>([])
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [hidden, setHidden] = useState<HiddenReport | null>(null)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const [traced, setTraced] = useState<{ yes: number; no: number } | null>(null)
  const [grid, setGrid] = useState<ModelGrid | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setVersions(null)
    setHidden(null)
    setHiddenError(null)
    setTraced(null)
    setOpen(null)
    api
      .findings(dealId, doc.id)
      .then((found) => live && setFindings(found))
      .catch(() => undefined)
    api
      .versions(doc.id)
      .then((found) => live && setVersions(found))
      .catch(() => undefined)
    api
      .metadata(doc.id)
      .then((found) => live && setHidden(found))
      .catch(
        (problem) => live && setHiddenError(String(problem.message ?? problem)),
      )
    api
      .figures(doc.id)
      .then((map) => {
        if (!live) return
        let yes = 0
        let no = 0
        for (const slide of map.slides)
          for (const figure of slide.figures) {
            if (figure.state === 'unlinked') no++
            else yes++
          }
        setTraced({ yes, no })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, dealId, doc.id])

  //: The model grid, once, for cell evidence. Loaded lazily on the first
  //: cell finding opened rather than with the panel.
  const wantGrid = useMemo(() => {
    const finding = findings.find((one) => one.id === open)
    return finding?.source.artifact_id ?? null
  }, [findings, open])
  useEffect(() => {
    if (!wantGrid || grid?.artifact_id === wantGrid) return
    let live = true
    api
      .grid(wantGrid)
      .then((found) => live && setGrid(found))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, wantGrid, grid])

  const mine = findings.filter(
    (one) => one.where.artifact_id === doc.id && one.state === 'open',
  )
  const figures = Number(doc.counts['figures'] ?? 0)
  const slides = Number(doc.counts['slides'] ?? 0)
  const pages = Number(doc.counts['pages'] ?? 0)
  const cells = Number(doc.counts['cells'] ?? 0)

  const facts: { label: string; value: string }[] = []
  if (figures > 0)
    facts.push({
      label: 'Figures read',
      value:
        slides > 0
          ? `${figures} across ${slides} slides`
          : pages > 0
            ? `${figures} across ${pages} pages`
            : String(figures),
    })
  if (cells > 0) facts.push({ label: 'Named cells', value: String(cells) })
  if (traced !== null && figures > 0) {
    facts.push({ label: 'Traced to the model', value: String(traced.yes) })
    facts.push({ label: 'Not traced', value: String(traced.no) })
  }

  return (
    <div
      style={{
        flex: '0 1 560px',
        minWidth: 360,
        order: 2,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255,255,255,.92)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,.9)',
        borderRadius: 20,
        boxShadow:
          '0 14px 40px rgba(16,20,28,.10), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.9)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px 13px 20px',
          borderBottom: '1px solid #f0eeec',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            doc.kind === 'model'
              ? fileIcon.xls
              : doc.kind === 'deck'
                ? fileIcon.ppt
                : fileIcon.doc
          }
          alt=""
          style={{
            flex: '0 0 22px',
            width: 22,
            height: 22,
            objectFit: 'contain',
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15.5,
            fontWeight: 600,
            letterSpacing: '-.015em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {doc.filename}
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            flex: '0 0 auto',
            border: 0,
            background: 'transparent',
            borderRadius: 8,
            padding: 5,
            cursor: 'pointer',
            display: 'flex',
            color: '#8e8e93',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: well,
          padding: 18,
        }}
      >
        {/* Open + Download. Both fetch the stored file — a deep link into
            the host application arrives with the connector metadata. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() =>
              api
                .download(doc.id)
                .then(({ url }) => window.open(url, '_blank'))
                .catch(() => undefined)
            }
            style={{
              flex: 1,
              border: 0,
              background: ink.accent,
              color: '#fff',
              borderRadius: 11,
              padding: 11,
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {OPEN_LABEL[doc.kind] ?? 'Open'}
          </button>
          <button
            onClick={() =>
              api
                .download(doc.id)
                .then(({ url }) => window.open(url, '_blank'))
                .catch(() => undefined)
            }
            style={{
              flex: '0 0 auto',
              border: 0,
              background: '#fff',
              color: ink.primary,
              borderRadius: 11,
              padding: '11px 16px',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow:
                '0 1px 2px rgba(0,0,0,.05), 0 0 0 .5px rgba(0,0,0,.06)',
            }}
          >
            Download
          </button>
        </div>

        {facts.length > 0 && (
          <>
            <div style={panelHead}>What Pierce found in it</div>
            <div style={panelCard}>
              {facts.map((fact, index) => (
                <div
                  key={fact.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderTop: index === 0 ? 0 : hairline,
                    padding: '11px 16px',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>
                    {fact.label}
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: ink.primary,
                    }}
                  >
                    {fact.value}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {versions !== null && versions.length > 0 && (
          <>
            <div style={panelHead}>Version history</div>
            <div style={panelCard}>
              {versions.map((one, index) => (
                <div
                  key={one.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    borderTop: index === 0 ? 0 : hairline,
                    padding: '11px 16px',
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontFamily: font.mono,
                      fontSize: 13,
                      color: ink.primary,
                    }}
                  >
                    v{one.version}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      color: ink.primary,
                    }}
                  >
                    {/* The design's mid column is a change summary, which
                        needs a diff engine per pair. What is true today
                        is who brought the version. */}
                    {one.uploaded_by
                      ? `uploaded by ${one.uploaded_by.name}`
                      : 'received'}
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 12.5,
                      color: ink.faint,
                    }}
                  >
                    {ago(one.uploaded_at)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={panelHead}>Hidden inside it</div>
        <div style={panelCard}>
          {hidden === null && hiddenError === null && (
            <div
              style={{
                padding: '11px 16px',
                fontSize: 13.5,
                color: ink.secondary,
              }}
            >
              Reading the file…
            </div>
          )}
          {hiddenError !== null && (
            <div
              style={{
                padding: '11px 16px',
                fontSize: 13.5,
                color: ink.secondary,
              }}
            >
              {hiddenError}
            </div>
          )}
          {hidden !== null && hidden.refused !== null && (
            <div
              style={{
                padding: '11px 16px',
                fontSize: 13.5,
                color: ink.secondary,
              }}
            >
              {hidden.refused}
            </div>
          )}
          {hidden !== null && hidden.refused === null && (
            <>
              {hidden.findings.filter((one) => one.severity === 'leak')
                .length === 0 && (
                <div
                  style={{
                    padding: '11px 16px',
                    fontSize: 13.5,
                    color: ink.secondary,
                  }}
                >
                  Nothing in this file that is not on its page.
                </div>
              )}
              {hidden.findings
                .filter((one) => one.severity === 'leak')
                .map((one, index) => (
                  <div
                    key={`${one.rule}-${index}`}
                    style={{
                      borderTop: index === 0 ? 0 : hairline,
                      padding: '11px 16px',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>
                        {one.detail}
                      </span>
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 14.5,
                          fontWeight: 500,
                          color: ink.stale,
                        }}
                      >
                        {one.where}
                      </span>
                    </div>
                    {one.evidence && (
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 12,
                          color: ink.secondary,
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {one.evidence}
                      </div>
                    )}
                  </div>
                ))}
            </>
          )}
        </div>

        {mine.length > 0 && (
          <>
            <div style={panelHead}>Findings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mine.map((finding) => (
                <FindingCard
                  key={finding.id}
                  api={api}
                  finding={finding}
                  grid={grid}
                  open={open === finding.id}
                  onToggle={() =>
                    setOpen(open === finding.id ? null : finding.id)
                  }
                  onChanged={onChanged}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const FindingCard = ({
  api,
  finding,
  grid,
  open,
  onToggle,
  onChanged,
}: {
  api: TieOutApi
  finding: Finding
  grid: ModelGrid | null
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) => {
  const [dismissing, setDismissing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const says =
    finding.printed && finding.expected
      ? `The document says ${finding.printed} · the model says ${finding.expected}`
      : finding.context || finding.where.detail
  const where = [finding.where.label, finding.source.ref]
    .filter(Boolean)
    .join(' · ')

  const dismiss = () => {
    if (!note.trim() || busy) return
    setBusy(true)
    api
      .dismiss(finding.id, 'dismissed', note.trim())
      .then(() => onChanged())
      .catch((error) => setProblem(String(error.message ?? error)))
      .finally(() => setBusy(false))
  }

  const rebase = () => {
    if (busy) return
    setBusy(true)
    api
      .propose(finding.id)
      .then((correction) => api.decideCorrection(correction.id, 'applied'))
      .then(() => onChanged())
      .catch((error) => setProblem(String(error.message ?? error)))
      .finally(() => setBusy(false))
  }

  return (
    <div
      style={{
        background: open ? 'rgba(255,255,255,.62)' : '#fff',
        backdropFilter: open ? 'blur(30px) saturate(1.8)' : 'none',
        WebkitBackdropFilter: open ? 'blur(30px) saturate(1.8)' : 'none',
        border: open ? '1px solid rgba(255,255,255,.95)' : 0,
        borderRadius: open ? 17 : 13,
        boxShadow: open
          ? '0 16px 40px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.05), inset 0 1px 0 rgba(255,255,255,.95)'
          : '0 1px 2px rgba(0,0,0,.05), 0 0 0 .5px rgba(0,0,0,.06)',
        overflow: 'hidden',
        transition: 'box-shadow .18s ease',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          width: '100%',
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          font: 'inherit',
          cursor: 'pointer',
          padding: '13px 14px 13px 16px',
        }}
      >
        <span
          style={{
            flex: '0 0 8px',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: finding.kind === 'stale' ? ink.staleDot : ink.accent,
            marginTop: 6,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: '-.01em',
            }}
          >
            {finding.title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 13.5,
              color: '#3a3a3c',
              marginTop: 3,
            }}
          >
            {says}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: font.mono,
              fontSize: 12,
              color: ink.secondary,
              marginTop: 3,
            }}
          >
            {where}
          </span>
        </span>
      </button>

      {open && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.7)',
            padding: '15px 17px 17px',
          }}
        >
          <Evidence finding={finding} grid={grid} />

          <div
            style={{
              fontSize: 13.5,
              color: '#3a3a3c',
              lineHeight: 1.5,
              marginTop: 12,
            }}
          >
            {finding.where.detail || finding.context}
          </div>
          {problem !== null && (
            <div
              style={{
                fontSize: 13.5,
                color: ink.stale,
                lineHeight: 1.5,
                marginTop: 8,
              }}
            >
              {problem}
            </div>
          )}
          {dismissing ? (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 12,
                alignItems: 'center',
              }}
            >
              {/* The design's writing box: no border, no outline, focus
                  is the soft glow. A dismissal must say why — the server
                  refuses one that does not. */}
              <input
                autoFocus
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') dismiss()
                  if (event.key === 'Escape') setDismissing(false)
                }}
                placeholder="Why is it fine?"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  background: '#f0f0f2',
                  borderRadius: 9,
                  padding: '8px 12px',
                  font: 'inherit',
                  fontSize: 13.5,
                  color: ink.primary,
                  outline: 'none',
                  boxShadow: note ? inputGlow : 'none',
                }}
              />
              <button
                onClick={dismiss}
                style={{
                  border: 0,
                  background: note.trim() ? ink.accent : '#c4c4c9',
                  color: '#fff',
                  borderRadius: 9,
                  padding: '8px 14px',
                  font: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: note.trim() ? 'pointer' : 'default',
                }}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {finding.kind === 'drift' && (
                <button
                  onClick={rebase}
                  style={{
                    border: 0,
                    background: ink.accent,
                    color: '#fff',
                    borderRadius: 9,
                    padding: '8px 14px',
                    font: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: busy ? 0.55 : 1,
                  }}
                >
                  Rebase
                </button>
              )}
              <button
                onClick={() => setDismissing(true)}
                style={{
                  border: 0,
                  background: '#f0f0f2',
                  color: ink.primary,
                  borderRadius: 9,
                  padding: '8px 14px',
                  font: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Not a problem
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The finding's evidence, in the design's three shapes. */
const Evidence = ({
  finding,
  grid,
}: {
  finding: Finding
  grid: ModelGrid | null
}) => {
  //: A cell finding: four rows of the model around its cell.
  const ref = finding.source.ref
  if (ref !== null && grid !== null) {
    const [sheetName, coordinate] = ref.includes('!')
      ? [ref.split('!')[0]!, ref.split('!')[1]!]
      : [null, ref]
    const rowNumber = Number(coordinate!.match(/\d+/)?.[0] ?? 0)
    const sheet =
      grid.sheets.find((one) => one.name === sheetName) ?? grid.sheets[0]
    if (sheet !== undefined && rowNumber > 0) {
      const rows = sheet.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) =>
          row.cells.some((cell) => cell !== null && cell.ref.match(/\d+/)),
        )
      const hit = rows.findIndex(({ row }) =>
        row.cells.some((cell) => cell?.ref === ref),
      )
      if (hit !== -1) {
        const around = rows.slice(Math.max(0, hit - 2), hit + 2)
        const columnOf = (cells: (typeof sheet.rows)[0]['cells']) =>
          cells.findIndex((cell) => cell?.ref === ref)
        const column = columnOf(rows[hit]!.row.cells)
        return (
          <div
            style={{
              background: '#fff',
              borderRadius: 9,
              boxShadow: '0 0 0 .5px rgba(0,0,0,.12)',
              overflow: 'hidden',
              fontFamily: font.mono,
              fontSize: 12,
            }}
          >
            {around.map(({ row }, index) => {
              const cell = row.cells[column] ?? row.cells.find(Boolean) ?? null
              const isTarget = cell?.ref === ref
              const number = cell?.ref.match(/\d+/)?.[0] ?? ''
              return (
                <div
                  key={index}
                  style={{ display: 'flex', borderTop: '.5px solid #eef0f2' }}
                >
                  <span
                    style={{
                      flex: '0 0 34px',
                      padding: '7px 6px',
                      textAlign: 'right',
                      color: ink.faint,
                      background: '#f7f7f9',
                    }}
                  >
                    {number}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      padding: '7px 9px',
                      color: ink.primary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      flex: '0 0 96px',
                      padding: '7px 9px',
                      textAlign: 'right',
                      background: isTarget
                        ? 'rgba(255,159,10,.28)'
                        : 'transparent',
                      color: ink.primary,
                    }}
                  >
                    {cell?.display ?? cell?.value ?? ''}
                  </span>
                </div>
              )
            })}
          </div>
        )
      }
    }
  }

  //: A prose finding: the sentence, its figure marked.
  if (
    finding.context &&
    finding.printed &&
    finding.context.includes(finding.printed)
  ) {
    const at = finding.context.indexOf(finding.printed)
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: 9,
          boxShadow: '0 0 0 .5px rgba(0,0,0,.12)',
          padding: '14px 16px',
          fontSize: 14.5,
          lineHeight: 1.6,
        }}
      >
        {finding.context.slice(0, at)}
        <span
          style={{
            background: 'rgba(255,159,10,.28)',
            boxShadow: '0 0 0 2px rgba(255,159,10,.28)',
            borderRadius: 3,
          }}
        >
          {finding.printed}
        </span>
        {finding.context.slice(at + finding.printed.length)}
      </div>
    )
  }

  //: A slide finding: the design's slide sketch, carrying the real
  //: figure and label. The grey bars are the design's own shorthand for
  //: « the rest of the slide » — decoration, not data.
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 9,
        boxShadow: '0 0 0 .5px rgba(0,0,0,.12)',
        padding: '16px 18px',
        aspectRatio: '16/9',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: '-.01em',
          color: ink.primary,
        }}
      >
        {finding.where.label}
      </div>
      <div
        style={{
          height: 5,
          width: '62%',
          background: '#eaeaee',
          borderRadius: 3,
        }}
      />
      <div
        style={{
          height: 5,
          width: '48%',
          background: '#eaeaee',
          borderRadius: 3,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 6,
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 15,
            fontWeight: 500,
            background: 'rgba(255,159,10,.28)',
            boxShadow: '0 0 0 2px rgba(255,159,10,.28)',
            borderRadius: 3,
          }}
        >
          {finding.printed}
        </span>
        <span style={{ fontSize: 11.5, color: ink.secondary }}>
          {finding.title}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <div
          style={{
            flex: 1,
            height: 22,
            background: '#f2f2f5',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            flex: 1,
            height: 32,
            background: '#f2f2f5',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            flex: 1,
            height: 42,
            background: '#f2f2f5',
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  )
}

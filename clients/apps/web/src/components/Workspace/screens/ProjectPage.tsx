'use client'

/**
 * The project page — Overview · Findings · Sources, on real runs.
 *
 * Source of truth: `docs/pierce/design-swens/Swens_Workspace.html`,
 * the `pjChosen` block and the `fullRep` report sheet. Every style
 * value here appears verbatim in that file. Where a real data state
 * has no drawn equivalent, the component states it in the drawn
 * pattern and says which one it borrowed.
 *
 * Real mappings, named:
 *
 * - The severity words are the attention tiers — Material is a
 *   defect (tier 1), Significant an assumption at risk (tier 2),
 *   Observation hygiene (tier 3). A finding stored before the
 *   elevation layer falls back on its severity, the same rule the
 *   deal list and the server use.
 * - The Overview chart is drawn from run history: each finished
 *   audit run's tier tallies (or its error/smell counts, for runs
 *   recorded before tallies existed). The design's ticks are version
 *   tags; a run does not record which version it read, so the ticks
 *   are the run dates until it does — a named deviation, not a
 *   silent one. Fewer than two runs and the card says the trend
 *   appears after the next check, instead of drawing a shape from
 *   nothing.
 * - « Read the full report » opens the drawn three-page sheet filled
 *   with what is genuinely computable — verdict from counts, the
 *   material findings written out, the rest one line each, the
 *   abstentions — and no generated prose. The narrative writer is a
 *   later phase, by the founder's decision.
 * - « Download the marked-up model » is present as drawn and
 *   disabled, saying what it will hand over — the workbook copy with
 *   problem cells coloured and noted. No substitute file.
 * - Version rows in the dropdown are facts (who, when); picking one
 *   does not yet re-scope the page, so the rows do not pretend to be
 *   buttons.
 */

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Artifact,
  auditRecord,
  CheckRun,
  DealListItem,
  DealPage as DealPageData,
  Finding,
  Link,
  TieOutApi,
  Version,
} from '../api'
import { fileIcon, font, ink } from '../design'
import { categoryOfKey } from './DealPage'

/** Material · Significant · Observation, from the attention tier. */
export const sevOf = (f: Finding): 1 | 2 | 3 => {
  const t = f.tier
  if (t === 1 || t === 2 || t === 3) return t
  return f.severity === 'error' ? 1 : 3
}
const SEV_WORD = { 1: 'Material', 2: 'Significant', 3: 'Observation' } as const
const SEV_DOT = { 1: '#e0322d', 2: '#e8a300', 3: '#2b6cf5' } as const

/** « Today 11:40 » — the checked column's phrasing, shared shape with
 *  the project list. */
const when = (at: string | null): string => {
  if (!at) return 'Not checked yet'
  const then = new Date(at)
  const now = new Date()
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === now.toDateString()) return `Today ${time}`
  if (then.toDateString() === yesterday.toDateString())
    return `Yesterday ${time}`
  if ((now.getTime() - then.getTime()) / 86_400_000 < 7)
    return `${then.toLocaleDateString('en-GB', { weekday: 'long' })} ${time}`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

const WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
]
const word = (n: number): string => (n < WORDS.length ? WORDS[n]! : String(n))

/** The design's file icons, by artifact kind. */
const iconFor = (kind: string): string =>
  kind === 'model'
    ? fileIcon.xls
    : kind === 'deck'
      ? fileIcon.ppt
      : kind === 'memo'
        ? fileIcon.doc
        : '/workspace/pdf.webp'

const frameCard = {
  background: '#f6f7f9',
  border: '1px solid rgba(16,22,35,.05)',
  borderRadius: 24,
  boxShadow: '0 1px 2px rgba(16,22,35,.04), 0 12px 32px rgba(16,22,35,.06)',
} as const

const pillHead = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  background: '#fff',
  borderRadius: 999,
  padding: '9px 18px',
  fontSize: 14.5,
  color: '#8f96a0',
} as const

export const ProjectPage = ({
  api,
  deal,
  onBack,
  onOpenDoc,
  onChanged,
}: {
  api: TieOutApi
  deal: DealListItem
  onBack: () => void
  /** « Open the cell » — the document panel, at the finding's cell. */
  onOpenDoc: (doc: Artifact, atFindingId?: string | null) => void
  /** Counts changed (a ruling, a check) — the list refreshes. */
  onChanged: () => void
}) => {
  const [page, setPage] = useState<DealPageData | null>(null)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [runs, setRuns] = useState<CheckRun[] | null>(null)
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [links, setLinks] = useState<Link[] | null>(null)
  const [tab, setTab] = useState<'Overview' | 'Findings' | 'Sources'>(
    'Overview',
  )
  const [srcView, setSrcView] = useState<'map' | 'list'>('map')
  const [sev, setSev] = useState<0 | 1 | 2 | 3>(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [verOpen, setVerOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [repOpen, setRepOpen] = useState(false)
  //: « Not a finding » asks for the reason; the save gates on more
  //: than two characters — the design's own threshold.
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [tip, setTip] = useState<string | null>(null)
  const [at, setAt] = useState(0)

  useEffect(() => {
    let live = true
    api
      .deal(deal.id)
      .then((got) => live && setPage(got))
      .catch(() => live && setPage(null))
    api
      .findings(deal.id)
      .then((got) => live && setFindings(got))
      .catch(() => live && setFindings([]))
    api
      .runs(deal.id)
      .then((got) => live && setRuns(got))
      .catch(() => live && setRuns([]))
    api
      .links(deal.id)
      .then((got) => live && setLinks(got))
      .catch(() => live && setLinks([]))
    return () => {
      live = false
    }
  }, [api, deal.id, at])

  const model = useMemo(
    () => page?.documents.find((one) => one.kind === 'model') ?? null,
    [page],
  )
  useEffect(() => {
    if (!model) return
    let live = true
    api
      .versions(model.id)
      .then((got) => live && setVersions(got))
      .catch(() => live && setVersions([]))
    return () => {
      live = false
    }
  }, [api, model])

  //: Re-check: the real run, polled until it lands. The button reads
  //: « Checking » while it does — the chip carries the state.
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)
  const reCheck = () => {
    if (checking) return
    setChecking(true)
    api
      .check(deal.id)
      .then(() => {
        poll.current = setInterval(async () => {
          try {
            const now = await api.runs(deal.id)
            const busy = now.some(
              (one) => one.status === 'queued' || one.status === 'running',
            )
            if (!busy) {
              if (poll.current) clearInterval(poll.current)
              setChecking(false)
              setAt((was) => was + 1)
              onChanged()
            }
          } catch {
            //: A poll that failed answers nothing — keep asking.
          }
        }, 2500)
      })
      .catch(() => setChecking(false))
  }
  useEffect(
    () => () => {
      if (poll.current) clearInterval(poll.current)
    },
    [],
  )

  const open = useMemo(
    () => (findings ?? []).filter((one) => one.state === 'open'),
    [findings],
  )
  const counts = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0 }
    for (const one of open) c[sevOf(one)] += 1
    return c
  }, [open])

  const lastRun = useMemo(() => {
    const done = (runs ?? []).filter(
      (one) => one.status === 'done' && one.finished_at,
    )
    done.sort((a, b) => (a.finished_at! < b.finished_at! ? -1 : 1))
    return done[done.length - 1] ?? null
  }, [runs])
  const checkedAt = lastRun?.finished_at ?? deal.checked_at

  //: The verdict chip. « Not ready to send » is the drawn state; the
  //: others are real states the demo data never shows, in the page's
  //: own inks — never-checked muted, clean green.
  const verdict = checking
    ? { text: 'Checking', fg: '#6b7280' }
    : !checkedAt
      ? { text: 'Not checked yet', fg: '#9aa1ab' }
      : counts[1] > 0
        ? { text: 'Not ready to send', fg: '#c8790a' }
        : open.length > 0
          ? { text: 'Findings open', fg: '#c8790a' }
          : { text: 'Nothing failing', fg: '#1f8a4c' }

  //: « Five material, five significant, one observation. » — the
  //: sentence under the title, from the real counts.
  const sevSentence = !checkedAt
    ? 'This model has not been checked. Re-check reads every sheet and reports what it finds.'
    : open.length === 0
      ? `Nothing failing as of ${when(checkedAt).toLowerCase()}.`
      : `${[
          counts[1] ? `${word(counts[1]).toLowerCase()} material` : '',
          counts[2] ? `${word(counts[2]).toLowerCase()} significant` : '',
          counts[3]
            ? `${word(counts[3]).toLowerCase()} observation${counts[3] === 1 ? '' : 's'}`
            : '',
        ]
          .filter(Boolean)
          .join(', ')
          .replace(/^./, (c) => c.toUpperCase())}.${
          counts[1] > 0
            ? ' Material findings should clear before the model leaves the deal team.'
            : ''
        }`

  //: The three summary bullets — deterministic, from the findings and
  //: the latest run. No generated prose.
  const bullets = useMemo(() => {
    if (!checkedAt) return []
    const out: string[] = []
    if (counts[1] > 0) {
      const sheets = new Map<string, number>()
      for (const one of open) {
        if (sevOf(one) !== 1) continue
        const sheet = String(one.where.anchor.sheet ?? one.where.label ?? '')
        if (sheet) sheets.set(sheet, (sheets.get(sheet) ?? 0) + 1)
      }
      const top = [...sheets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
      out.push(
        `${word(counts[1])} finding${counts[1] === 1 ? ' is' : 's are'} material${
          top.length
            ? `. ${top.length === 1 ? 'Most sit' : 'Most sit'} in ${top
                .map(([s]) => s)
                .join(' and ')}.`
            : '.'
        }`,
      )
    } else {
      out.push(
        open.length === 0
          ? 'No finding is open against this version.'
          : 'No open finding is material.',
      )
    }
    if (model)
      out.push(
        `The current model is version ${model.version}, uploaded ${when(model.uploaded_at).toLowerCase()}.${
          deal.stale ? ' Files changed after the last check.' : ''
        }`,
      )
    const record = lastRun ? auditRecord(lastRun) : null
    if (record && record.abstentions.length > 0)
      out.push(
        `${word(record.abstentions.length)} check${
          record.abstentions.length === 1 ? '' : 's'
        } could not run: ${record.abstentions
          .slice(0, 2)
          .map((one) => one.why)
          .join('; ')}${record.abstentions.length > 2 ? '; and more' : ''}.`,
      )
    else if (record)
      out.push('Every check that applies to this model ran to the end.')
    return out
  }, [checkedAt, counts, open, model, deal.stale, lastRun])

  //: The chart: tier tallies per finished audit run, oldest first.
  //: Runs recorded before tallies fall back on errors/smells.
  const series = useMemo(() => {
    const done = (runs ?? [])
      .filter(
        (one) =>
          one.kind === 'audit' && one.status === 'done' && one.finished_at,
      )
      .sort((a, b) => (a.finished_at! < b.finished_at! ? -1 : 1))
      .slice(-9)
    const tiers = done.map((one) => {
      const t = one.summary['tiers'] as Record<string, number> | undefined
      if (t) return [t['1'] ?? 0, t['2'] ?? 0, t['3'] ?? 0]
      return [
        Number(one.summary['errors'] ?? 0),
        Number(one.summary['smells'] ?? 0),
        0,
      ]
    })
    const ticks = done.map((one) =>
      new Date(one.finished_at!).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      }),
    )
    return { points: tiers, ticks }
  }, [runs])

  const chart = useMemo(() => {
    const { points } = series
    if (points.length < 2) return null
    const defs = [
      { i: 0, stroke: '#e0322d', fill: 'url(#gErr)', delay: '0s' },
      { i: 1, stroke: '#e8a300', fill: 'url(#gWarn)', delay: '.12s' },
      { i: 2, stroke: '#2b6cf5', fill: 'url(#gSug)', delay: '.24s' },
    ]
    const max = Math.max(1, ...points.flat())
    const x0 = 30
    const x1 = 980
    const base = 220
    const top = 30
    return defs.map((d) => {
      const pts = points.map((row) => row[d.i]!)
      const xy = pts.map(
        (v, i) =>
          [
            x0 + ((x1 - x0) * i) / (pts.length - 1),
            base - (base - top) * (v / max),
          ] as const,
      )
      let line = `M${xy[0]![0].toFixed(1)},${xy[0]![1].toFixed(1)}`
      for (let i = 1; i < xy.length; i++) {
        const [px, py] = xy[i - 1]!
        const [cx, cy] = xy[i]!
        const mx = (px + cx) / 2
        line += ` C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`
      }
      return {
        stroke: d.stroke,
        fill: d.fill,
        delay: d.delay,
        line,
        area: `${line} L${x1},${base} L${x0},${base} Z`,
      }
    })
  }, [series])

  //: Findings, grouped the design's way — by family, filtered by the
  //: severity chips.
  const groups = useMemo(() => {
    const seen = new Map<string, Finding[]>()
    for (const one of open) {
      if (sev !== 0 && sevOf(one) !== sev) continue
      const family = categoryOfKey(one.rule ?? '')
      const list = seen.get(family) ?? []
      list.push(one)
      seen.set(family, list)
    }
    return [...seen.entries()].map(([name, items]) => ({ name, items }))
  }, [open, sev])

  const rule = (finding: Finding) => {
    setNoteFor(finding.id)
    setNoteText('')
  }
  const saveNote = (finding: Finding) => {
    if (noteText.trim().length <= 2) return
    api
      .dismiss(finding.id, 'dismissed', noteText.trim())
      .then(() => {
        setNoteFor(null)
        setAt((was) => was + 1)
        onChanged()
      })
      .catch(() => undefined)
  }
  const applyFix = (finding: Finding) => {
    api
      .propose(finding.id)
      .then(() => setAt((was) => was + 1))
      .catch(() => undefined)
  }
  const decide = (finding: Finding, accept: boolean) => {
    if (!finding.correction) return
    api
      .decideCorrection(finding.correction.id, accept ? 'accept' : 'reject')
      .then(() => {
        setAt((was) => was + 1)
        onChanged()
      })
      .catch(() => undefined)
  }

  //: --- the Sources map geometry, ported from the design's own
  //: measure: curves from each document card to the model card.
  const box = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const modelRef = useRef<HTMLButtonElement | null>(null)
  const [geo, setGeo] = useState<{
    w: number
    h: number
    paths: string[]
  } | null>(null)
  const inDocs = useMemo(
    () => (page?.documents ?? []).filter((one) => one.kind === 'source'),
    [page],
  )
  const outDocs = useMemo(
    () =>
      (page?.documents ?? []).filter(
        (one) => one.kind !== 'model' && one.kind !== 'source',
      ),
    [page],
  )
  const measure = useCallback(() => {
    const host = box.current
    const centre = modelRef.current
    if (!host || !centre) return
    const hostRect = host.getBoundingClientRect()
    const pt = (r: DOMRect, side: 'left' | 'right') => ({
      x: (side === 'left' ? r.left : r.right) - hostRect.left,
      y: r.top + r.height / 2 - hostRect.top,
    })
    const m = centre.getBoundingClientRect()
    const curve = (
      a: { x: number; y: number },
      z: { x: number; y: number },
    ) => {
      const dx = z.x - a.x
      return `M ${a.x} ${a.y} C ${a.x + dx * 0.4} ${a.y}, ${z.x - dx * 0.4} ${z.y}, ${z.x} ${z.y}`
    }
    const paths: string[] = []
    for (const doc of inDocs) {
      const el = nodeRefs.current.get(doc.id)
      if (!el) continue
      paths.push(curve(pt(el.getBoundingClientRect(), 'right'), pt(m, 'left')))
    }
    for (const doc of outDocs) {
      const el = nodeRefs.current.get(doc.id)
      if (!el) continue
      paths.push(curve(pt(m, 'right'), pt(el.getBoundingClientRect(), 'left')))
    }
    setGeo((prev) => {
      const next = { w: hostRect.width, h: hostRect.height, paths }
      if (
        prev &&
        prev.w === next.w &&
        prev.h === next.h &&
        prev.paths.join('|') === next.paths.join('|')
      )
        return prev
      return next
    })
  }, [inDocs, outDocs])
  useEffect(() => {
    if (tab !== 'Sources' || srcView !== 'map') return
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [tab, srcView, measure, page])

  //: Figures tied per document — the map card's sub-line, and the
  //: Documents list's « used for » column, from real links.
  const tiesOf = useMemo(() => {
    const ties = new Map<string, number>()
    for (const one of links ?? []) {
      const id = one.figure?.artifact_id
      if (id) ties.set(id, (ties.get(id) ?? 0) + 1)
    }
    return ties
  }, [links])

  const modelName = (model?.filename ?? deal.model_name ?? deal.name).replace(
    /\.[a-z0-9]+$/i,
    '',
  )

  const dot = (n: number) => (
    <span
      style={{
        flex: '0 0 8px',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: SEV_DOT[n as 1 | 2 | 3],
      }}
    />
  )

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '16px clamp(12px,2vw,26px) 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Back + tabs. */}
        <div
          style={{
            width: '100%',
            maxWidth: 1040,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0 26px',
            marginBottom: 8,
          }}
        >
          <span style={{ flex: '0 0 auto', display: 'flex' }}>
            <button
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                border: 0,
                background: 'transparent',
                padding: '11px 0',
                font: 'inherit',
                fontSize: 14.5,
                fontWeight: 500,
                letterSpacing: '-.01em',
                color: '#1c1f23',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 15px' }}
              >
                <polyline points="14,6 8,12 14,18" />
              </svg>
              <span>{deal.name}</span>
            </button>
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0 }} />
          {(['Overview', 'Findings', 'Sources'] as const).map((label) => {
            const on = tab === label
            return (
              <button
                key={label}
                onClick={() => setTab(label)}
                style={{
                  border: 0,
                  background: on ? 'rgba(21,23,27,.055)' : 'transparent',
                  borderRadius: 22,
                  padding: '11px 26px',
                  font: 'inherit',
                  fontSize: 14.5,
                  fontWeight: on ? 500 : 400,
                  letterSpacing: '-.01em',
                  color: on ? '#0060d0' : '#5b6068',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            )
          })}
          <span style={{ flex: '1 1 auto', minWidth: 0 }} />
        </div>

        {tab === 'Overview' && (
          <div
            style={{
              width: '100%',
              maxWidth: 1040,
              display: 'flex',
              flexDirection: 'column',
              gap: 44,
              paddingBottom: 40,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: 23,
                    fontWeight: 600,
                    letterSpacing: '-.022em',
                    lineHeight: 1.2,
                  }}
                >
                  {modelName}
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    color: verdict.fg,
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {verdict.text}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={reCheck}
                  style={{
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    border: 0,
                    background: '#0060d0',
                    borderRadius: 999,
                    padding: '7px 16px',
                    font: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 500,
                    letterSpacing: '-.01em',
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    cursor: checking ? 'default' : 'pointer',
                    opacity: checking ? 0.7 : 1,
                    marginRight: 10,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 14px' }}
                  >
                    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
                    <polyline points="20,4 20,9 15,9" />
                  </svg>
                  <span>{checking ? 'Checking' : 'Re-check'}</span>
                </button>
                {model && (
                  <span
                    style={{
                      flex: '0 0 auto',
                      position: 'relative',
                      display: 'flex',
                    }}
                  >
                    <button
                      onClick={() => setVerOpen((was) => !was)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        border: '1px solid #e6e6ea',
                        background: '#fff',
                        borderRadius: 999,
                        padding: '6px 12px',
                        font: 'inherit',
                        fontSize: 13,
                        color: '#1d1d1f',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      <span>Version {model.version}</span>
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#86868b"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          transform: verOpen
                            ? 'rotate(180deg)'
                            : 'rotate(0deg)',
                          transition: 'transform .18s ease',
                        }}
                      >
                        <polyline points="5,9 12,16 19,9" />
                      </svg>
                    </button>
                    {verOpen && (
                      <>
                        <span
                          onClick={() => setVerOpen(false)}
                          style={{ position: 'fixed', inset: 0, zIndex: 44 }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 12px)',
                            right: 0,
                            zIndex: 45,
                            width: 430,
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'rgba(246,247,249,.86)',
                            backdropFilter: 'blur(30px) saturate(1.8)',
                            WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
                            border: '1px solid rgba(255,255,255,.6)',
                            borderRadius: 22,
                            boxShadow:
                              '0 1px 2px rgba(16,22,35,.05), 0 22px 54px rgba(16,22,35,.18), inset 0 1px 0 rgba(255,255,255,.7)',
                            padding: 12,
                            animation: 'pcIn .16s ease both',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              padding: '4px 8px 12px',
                            }}
                          >
                            <span style={{ fontSize: 13, color: '#8f96a0' }}>
                              Versions
                            </span>
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 11,
                                color: '#b6bac1',
                              }}
                            >
                              {versions?.length ?? 0} saved
                            </span>
                          </span>
                          <span
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              background: '#fff',
                              borderRadius: 16,
                              boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                              overflow: 'hidden',
                            }}
                          >
                            {(versions ?? [])
                              .slice()
                              .sort((a, b) => b.version - a.version)
                              .slice(0, 6)
                              .map((v, i) => (
                                //: Facts, not controls: picking a version
                                //: does not yet re-scope the page, so the
                                //: rows do not pretend to be buttons.
                                <span
                                  key={v.id}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '44px 1fr auto',
                                    gap: 14,
                                    alignItems: 'center',
                                    width: '100%',
                                    textAlign: 'left',
                                    borderTop:
                                      i === 0
                                        ? 0
                                        : '.5px solid rgba(16,22,35,.06)',
                                    background:
                                      v.version === model.version
                                        ? '#fbfbfc'
                                        : 'transparent',
                                    padding: '0 18px',
                                    minHeight: 58,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: font.mono,
                                      fontSize: 12.5,
                                      color:
                                        v.version === model.version
                                          ? '#0060d0'
                                          : '#9aa1ab',
                                    }}
                                  >
                                    v{v.version}
                                  </span>
                                  <span
                                    style={{
                                      minWidth: 0,
                                      fontSize: 15,
                                      letterSpacing: '-.01em',
                                      color: '#1c1f23',
                                      lineHeight: 1.35,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {v.uploaded_by
                                      ? `Uploaded by ${v.uploaded_by.name}`
                                      : 'Uploaded'}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      color: '#b6bac1',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {when(v.uploaded_at)}
                                  </span>
                                </span>
                              ))}
                          </span>
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: ink.secondary,
                  lineHeight: 1.55,
                  marginTop: 8,
                  maxWidth: '82ch',
                  textWrap: 'pretty',
                }}
              >
                {sevSentence}
              </div>

              {bullets.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 16.5,
                      fontWeight: 600,
                      letterSpacing: '-.014em',
                      padding: '30px 0 11px',
                      background:
                        'linear-gradient(96deg,#0060d0 0%,#3b6ee0 42%,#5b52e0 100%)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: '#0060d0',
                      width: 'fit-content',
                    }}
                  >
                    Summary of the check
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    {bullets.map((text, i) => (
                      <div key={i} style={{ display: 'flex', gap: 11 }}>
                        <span
                          style={{
                            flex: '0 0 auto',
                            width: 5,
                            height: 5,
                            marginTop: 8,
                            borderRadius: '50%',
                            background: '#0060d0',
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#3a3a3c',
                            textWrap: 'pretty',
                          }}
                        >
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {checkedAt && (
                <button
                  onClick={() => setRepOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 15,
                    width: '100%',
                    maxWidth: 620,
                    textAlign: 'left',
                    border: '1px solid rgba(255,255,255,.6)',
                    background: '#fbfbfc',
                    boxShadow:
                      '0 1px 2px rgba(16,22,35,.04), 0 12px 32px rgba(16,22,35,.08), inset 0 1px 0 rgba(255,255,255,.7)',
                    borderRadius: 18,
                    padding: '15px 18px',
                    font: 'inherit',
                    cursor: 'pointer',
                    marginTop: 26,
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 36px',
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      background: '#f4f5f7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src="/workspace/pdf.webp"
                      alt=""
                      style={{ width: 20, height: 20, objectFit: 'contain' }}
                    />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15.5,
                        letterSpacing: '-.014em',
                        background:
                          'linear-gradient(96deg,#d8302b 0%,#e0455e 46%,#b5379a 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        color: '#d8302b',
                        width: 'fit-content',
                      }}
                    >
                      Read the full report
                    </span>
                    <span
                      style={{
                        fontSize: 13.5,
                        color: '#6b7280',
                        lineHeight: 1.5,
                        textWrap: 'pretty',
                      }}
                    >
                      Every finding written out in plain English.
                    </span>
                  </span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c4c8ce"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 15px' }}
                  >
                    <polyline points="9,5 16,12 9,19" />
                  </svg>
                </button>
              )}
            </div>

            {/* The trend card. */}
            <div style={{ ...frameCard, padding: 14 }}>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 18,
                  boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                  padding: '22px 20px 14px',
                }}
              >
                {chart ? (
                  <>
                    <svg
                      viewBox="0 0 1000 280"
                      preserveAspectRatio="none"
                      style={{
                        display: 'block',
                        width: '100%',
                        height: 'clamp(180px,26vh,260px)',
                      }}
                    >
                      <defs>
                        <linearGradient id="gErr" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="#e0322d"
                            stopOpacity=".16"
                          />
                          <stop
                            offset="100%"
                            stopColor="#e0322d"
                            stopOpacity="0"
                          />
                        </linearGradient>
                        <linearGradient id="gWarn" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="#e8a300"
                            stopOpacity=".18"
                          />
                          <stop
                            offset="100%"
                            stopColor="#e8a300"
                            stopOpacity="0"
                          />
                        </linearGradient>
                        <linearGradient id="gSug" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="#2b6cf5"
                            stopOpacity=".16"
                          />
                          <stop
                            offset="100%"
                            stopColor="#2b6cf5"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>
                      {[40, 85, 130, 175, 220].map((y) => (
                        <line
                          key={y}
                          x1="20"
                          y1={y}
                          x2="1000"
                          y2={y}
                          stroke="#f1f2f4"
                          strokeWidth="1"
                        />
                      ))}
                      {chart.map((s, i) => (
                        <path key={`a${i}`} d={s.area} fill={s.fill} />
                      ))}
                      {chart.map((s, i) => (
                        <path
                          key={`l${i}`}
                          d={s.line}
                          fill="none"
                          stroke={s.stroke}
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          pathLength={1}
                          strokeDasharray="1"
                          style={{
                            animation: `aDraw 1.1s cubic-bezier(.4,0,.2,1) ${s.delay} both`,
                          }}
                        />
                      ))}
                    </svg>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 2px 0',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 13.5,
                          color: '#b6bac1',
                        }}
                      >
                        Check
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        {series.ticks.map((label, i) => (
                          <span
                            key={i}
                            style={{ fontSize: 12.5, color: '#9aa1ab' }}
                          >
                            {label}
                          </span>
                        ))}
                      </span>
                    </div>
                  </>
                ) : (
                  //: One check is a point, not a trend. The empty-state
                  //: sentence, in the reference's own pattern.
                  <div
                    style={{
                      minHeight: 120,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 14.5, color: '#4a4f57' }}>
                      The trend appears after the second check.
                    </span>
                    <span style={{ fontSize: 13, color: '#8f96a0' }}>
                      Each check adds a point: material, significant and
                      observation counts over time.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'Findings' && (
          <div
            style={{
              width: '100%',
              maxWidth: 1040,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              paddingBottom: 44,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                {(
                  [
                    { key: 0, label: 'All', n: open.length, badge: '#2f333b' },
                    {
                      key: 1,
                      label: 'Material',
                      n: counts[1],
                      badge: '#e0322d',
                    },
                    {
                      key: 2,
                      label: 'Significant',
                      n: counts[2],
                      badge: '#e8a300',
                    },
                    {
                      key: 3,
                      label: 'Observation',
                      n: counts[3],
                      badge: '#2b6cf5',
                    },
                  ] as const
                ).map((c) => {
                  const on = sev === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setSev(c.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        border: '1px solid transparent',
                        background: on ? 'rgba(21,23,27,.055)' : 'transparent',
                        borderRadius: 999,
                        padding: '8px 12px 8px 16px',
                        font: 'inherit',
                        fontSize: 14.5,
                        color: on ? '#0060d0' : '#6b7280',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{c.label}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: on ? c.badge : '#eceaec',
                          boxShadow: '0 1px 2px rgba(16,22,35,.14)',
                          fontFamily: font.mono,
                          fontSize: 12.5,
                          color: on ? '#fff' : '#9aa1ab',
                        }}
                      >
                        {c.n}
                      </span>
                    </button>
                  )
                })}
              </div>
              {/* Present as drawn, disabled until the write pass ships —
                  the file it promises is the workbook copy with problem
                  cells coloured and noted, nothing altered. */}
              <div
                title="Coming — the workbook copy with every problem cell coloured and noted. Nothing in the model altered."
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 15,
                  flex: '1 1 380px',
                  maxWidth: 620,
                  textAlign: 'left',
                  border: '1px solid rgba(255,255,255,.6)',
                  background: '#fbfbfc',
                  boxShadow:
                    '0 1px 2px rgba(16,22,35,.04), 0 12px 32px rgba(16,22,35,.08), inset 0 1px 0 rgba(255,255,255,.7)',
                  borderRadius: 18,
                  padding: '15px 18px',
                  opacity: 0.6,
                }}
              >
                <span
                  style={{
                    flex: '0 0 36px',
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    background: '#f4f5f7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={fileIcon.xls}
                    alt=""
                    style={{ width: 20, height: 20, objectFit: 'contain' }}
                  />
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15.5,
                      letterSpacing: '-.014em',
                      color: '#1c1f23',
                    }}
                  >
                    Download the marked-up model
                  </span>
                  <span
                    style={{
                      fontSize: 13.5,
                      color: '#6b7280',
                      lineHeight: 1.5,
                      textWrap: 'pretty',
                    }}
                  >
                    Your model back, with every problem marked in place. Coming
                    — nothing to download yet.
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c4c8ce"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: '0 0 16px' }}
                >
                  <path d="M12 4v12" />
                  <polyline points="6.5,11.5 12,17 17.5,11.5" />
                  <path d="M5 20h14" />
                </svg>
              </div>
            </div>

            <div style={{ ...frameCard, padding: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr minmax(190px,0.65fr) 130px 20px',
                  gap: 10,
                  padding: '2px 20px 14px',
                }}
              >
                <span style={pillHead}>Finding</span>
                <span style={pillHead}>Where</span>
                <span style={pillHead}>Severity</span>
                <span />
              </div>
              {findings === null ? (
                <div style={{ minHeight: 80 }} />
              ) : groups.length === 0 ? (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 18,
                    boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                    padding: '36px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 14.5, color: '#4a4f57' }}>
                    {checkedAt
                      ? sev === 0
                        ? 'Nothing failing.'
                        : `No ${SEV_WORD[sev as 1 | 2 | 3].toLowerCase()} findings open.`
                      : 'This model has not been checked yet.'}
                  </span>
                  {!checkedAt && (
                    <span style={{ fontSize: 13, color: '#8f96a0' }}>
                      Re-check on the Overview tab reads every sheet.
                    </span>
                  )}
                </div>
              ) : (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  {groups.map((group) => (
                    <div
                      key={group.name}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 9,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: '#2b6cf5',
                          padding: '2px 20px 0',
                        }}
                      >
                        {group.name}
                      </span>
                      <div
                        style={{
                          background: '#fff',
                          borderRadius: 18,
                          boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                        }}
                      >
                        {group.items.map((f, i) => {
                          const n = sevOf(f)
                          const opened = openId === f.id
                          const grid = f.grid
                          const sheet = String(
                            f.where.anchor.sheet ?? f.where.label ?? '',
                          )
                          const ref = String(f.where.anchor.ref ?? '')
                          const hasPair = !!f.fix && !!f.fix_before
                          const correction = f.correction
                          return (
                            <div key={f.id}>
                              <div
                                onClick={() => setOpenId(opened ? null : f.id)}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    '1fr minmax(190px,0.65fr) 130px 20px',
                                  gap: 10,
                                  alignItems: 'center',
                                  borderTop:
                                    i === 0
                                      ? 0
                                      : '.5px solid rgba(16,22,35,.06)',
                                  background: opened
                                    ? '#fbfbfc'
                                    : 'transparent',
                                  padding: '16px 20px',
                                  minHeight: 64,
                                  cursor: 'pointer',
                                  transition: 'background .14s ease',
                                }}
                              >
                                <span
                                  style={{
                                    minWidth: 0,
                                    fontSize: 16.5,
                                    letterSpacing: '-.012em',
                                    lineHeight: 1.35,
                                    color: '#1c1f23',
                                    paddingRight: 14,
                                    textWrap: 'pretty',
                                  }}
                                >
                                  {f.plain || f.title}
                                </span>
                                <span
                                  style={{
                                    minWidth: 0,
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: '#f4f5f7',
                                      borderRadius: 999,
                                      padding: '5px 11px',
                                      fontSize: 13.5,
                                      color: '#4a4f57',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <span>{sheet || f.where.label}</span>
                                    {ref && (
                                      <span
                                        style={{
                                          fontFamily: font.mono,
                                          fontSize: 11.5,
                                          color: '#9aa1ab',
                                        }}
                                      >
                                        {ref}
                                      </span>
                                    )}
                                  </span>
                                </span>
                                <span
                                  style={{
                                    minWidth: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 9,
                                  }}
                                >
                                  {dot(n)}
                                  <span
                                    style={{
                                      fontSize: 14.5,
                                      color: '#4a4f57',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {SEV_WORD[n]}
                                  </span>
                                </span>
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#c4c8ce"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{
                                    justifySelf: 'end',
                                    transform: opened
                                      ? 'rotate(90deg)'
                                      : 'none',
                                    transition: 'transform .18s ease',
                                  }}
                                >
                                  <polyline points="9,5 16,12 9,19" />
                                </svg>
                              </div>
                              {opened && (
                                <div
                                  style={{
                                    padding: '0 20px 24px',
                                    background: '#fbfbfc',
                                    animation: 'pcIn .22s ease both',
                                  }}
                                >
                                  <div
                                    style={{
                                      background: '#fff',
                                      border: '1px solid rgba(255,255,255,.7)',
                                      borderRadius: 20,
                                      boxShadow:
                                        '0 1px 2px rgba(16,22,35,.04), 0 14px 36px rgba(16,22,35,.08)',
                                      padding: '22px 24px 18px',
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontFamily: font.serif,
                                        fontSize: 17.5,
                                        lineHeight: 1.5,
                                        color: '#2f333b',
                                        maxWidth: '74ch',
                                        textWrap: 'pretty',
                                        paddingBottom: grid ? 20 : 4,
                                      }}
                                    >
                                      {f.context || f.title}
                                    </div>
                                    {grid && (
                                      <div
                                        style={{
                                          border: '1px solid #d0d0d0',
                                          borderRadius: 10,
                                          background: '#fff',
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'stretch',
                                            background: '#f8f9fa',
                                            borderBottom: '1px solid #d0d0d0',
                                            borderRadius: '9px 9px 0 0',
                                          }}
                                        >
                                          <span
                                            style={{
                                              flex: '0 0 92px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              padding: '0 10px',
                                              height: 30,
                                              background: '#fff',
                                              borderRight: '1px solid #d0d0d0',
                                              borderRadius: '9px 0 0 0',
                                              fontFamily: font.mono,
                                              fontSize: 11.5,
                                              color: '#3c4043',
                                            }}
                                          >
                                            {grid.sel}
                                          </span>
                                          <span
                                            style={{
                                              flex: '0 0 auto',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: 28,
                                              height: 30,
                                              fontFamily: font.serif,
                                              fontStyle: 'italic',
                                              fontSize: 13,
                                              color: '#5f6368',
                                              borderRight: '1px solid #d0d0d0',
                                            }}
                                          >
                                            fx
                                          </span>
                                          <span
                                            style={{
                                              flex: 1,
                                              minWidth: 0,
                                              height: 30,
                                              display: 'flex',
                                              alignItems: 'center',
                                              background: '#fff',
                                              borderRadius: '0 9px 0 0',
                                              padding: '0 10px',
                                              fontFamily: font.mono,
                                              fontSize: 12,
                                              color: '#202124',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {grid.formula}
                                          </span>
                                        </div>
                                        <div
                                          style={{
                                            display: 'grid',
                                            gridTemplateColumns: `34px minmax(140px,.8fr) repeat(${grid.cols.length},1fr)`,
                                            background: '#f8f9fa',
                                            borderBottom: '1px solid #d0d0d0',
                                          }}
                                        >
                                          <span
                                            style={{
                                              borderRight: '1px solid #e0e0e0',
                                            }}
                                          />
                                          <span
                                            style={{
                                              borderRight: '1px solid #e0e0e0',
                                            }}
                                          />
                                          {grid.cols.map((c, ci) => (
                                            <span
                                              key={ci}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                height: 26,
                                                borderRight:
                                                  '1px solid #e0e0e0',
                                                fontSize: 11.5,
                                                color: '#5f6368',
                                              }}
                                            >
                                              {c.l}
                                            </span>
                                          ))}
                                        </div>
                                        {grid.rows.map((r) => (
                                          <div
                                            key={r.n}
                                            style={{
                                              display: 'grid',
                                              gridTemplateColumns: `34px minmax(140px,.8fr) repeat(${grid.cols.length},1fr)`,
                                              borderBottom: '1px solid #e8eaed',
                                            }}
                                          >
                                            <span
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: '#f8f9fa',
                                                borderRight:
                                                  '1px solid #e0e0e0',
                                                fontSize: 11.5,
                                                color: '#5f6368',
                                              }}
                                            >
                                              {r.n}
                                            </span>
                                            <span
                                              style={{
                                                minWidth: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                borderRight:
                                                  '1px solid #e8eaed',
                                                padding: '0 12px',
                                                minHeight: 38,
                                                fontSize: 14,
                                                color: '#202124',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              {r.label}
                                            </span>
                                            {r.cells.map((c, ci) => {
                                              const key = `${f.id}:${r.n}:${ci}`
                                              const hot = c.hot
                                              return (
                                                <span
                                                  key={ci}
                                                  onMouseEnter={() =>
                                                    hot && setTip(key)
                                                  }
                                                  onMouseLeave={() =>
                                                    setTip(null)
                                                  }
                                                  style={{
                                                    position: 'relative',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-end',
                                                    padding: '0 10px',
                                                    minHeight: 38,
                                                    borderRight:
                                                      '1px solid #e8eaed',
                                                    background: hot
                                                      ? '#fdeceb'
                                                      : 'transparent',
                                                    boxShadow: hot
                                                      ? 'inset 0 0 0 1.5px #e0322d'
                                                      : 'none',
                                                    fontFamily: font.mono,
                                                    fontSize: 13,
                                                    color: hot
                                                      ? '#c92a25'
                                                      : '#202124',
                                                    fontVariantNumeric:
                                                      'tabular-nums',
                                                  }}
                                                >
                                                  <span>{c.v}</span>
                                                  {hot && tip === key && (
                                                    <span
                                                      style={{
                                                        position: 'absolute',
                                                        top: '50%',
                                                        left: 'calc(100% + 10px)',
                                                        transform:
                                                          'translateY(-50%)',
                                                        zIndex: 40,
                                                        width: 'max-content',
                                                        minWidth: 210,
                                                        maxWidth: 360,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 9,
                                                        background:
                                                          'rgba(255,255,255,.9)',
                                                        backdropFilter:
                                                          'blur(20px)',
                                                        border:
                                                          '1px solid rgba(255,255,255,.7)',
                                                        borderRadius: 14,
                                                        boxShadow:
                                                          '0 1px 2px rgba(16,22,35,.05), 0 14px 34px rgba(16,22,35,.14)',
                                                        padding: '12px 14px',
                                                        animation:
                                                          'pcIn .16s ease both',
                                                      }}
                                                    >
                                                      <span
                                                        style={{
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          gap: 10,
                                                        }}
                                                      >
                                                        <span
                                                          style={{
                                                            flex: '0 0 7px',
                                                            width: 7,
                                                            height: 7,
                                                            borderRadius: '50%',
                                                            background:
                                                              '#e0322d',
                                                          }}
                                                        />
                                                        <span
                                                          style={{
                                                            fontSize: 13.5,
                                                            color: '#1c1f23',
                                                            whiteSpace:
                                                              'nowrap',
                                                          }}
                                                        >
                                                          {f.headline ||
                                                            'Inconsistency detected'}
                                                        </span>
                                                      </span>
                                                      {(f.fix_before ||
                                                        f.fix) && (
                                                        <span
                                                          style={{
                                                            display: 'flex',
                                                            flexDirection:
                                                              'column',
                                                            gap: 7,
                                                            background:
                                                              '#fbfbfc',
                                                            borderRadius: 11,
                                                            padding: 11,
                                                          }}
                                                        >
                                                          {f.fix_before && (
                                                            <span
                                                              style={{
                                                                display: 'flex',
                                                                alignItems:
                                                                  'center',
                                                                gap: 10,
                                                              }}
                                                            >
                                                              <span
                                                                style={{
                                                                  flex: '0 0 66px',
                                                                  fontSize: 12.5,
                                                                  color:
                                                                    '#6b7280',
                                                                }}
                                                              >
                                                                Original
                                                              </span>
                                                              <span
                                                                style={{
                                                                  minWidth: 0,
                                                                  background:
                                                                    '#fdeceb',
                                                                  borderRadius: 7,
                                                                  padding:
                                                                    '2px 8px',
                                                                  fontFamily:
                                                                    font.mono,
                                                                  fontSize: 12.5,
                                                                  color:
                                                                    '#c92a25',
                                                                  overflow:
                                                                    'hidden',
                                                                  textOverflow:
                                                                    'ellipsis',
                                                                  whiteSpace:
                                                                    'nowrap',
                                                                }}
                                                              >
                                                                {f.fix_before}
                                                              </span>
                                                            </span>
                                                          )}
                                                          {f.fix && (
                                                            <span
                                                              style={{
                                                                display: 'flex',
                                                                alignItems:
                                                                  'center',
                                                                gap: 10,
                                                              }}
                                                            >
                                                              <span
                                                                style={{
                                                                  flex: '0 0 66px',
                                                                  fontSize: 12.5,
                                                                  color:
                                                                    '#6b7280',
                                                                }}
                                                              >
                                                                Suggested
                                                              </span>
                                                              <span
                                                                style={{
                                                                  minWidth: 0,
                                                                  background:
                                                                    '#e7f6ec',
                                                                  borderRadius: 7,
                                                                  padding:
                                                                    '2px 8px',
                                                                  fontFamily:
                                                                    font.mono,
                                                                  fontSize: 12.5,
                                                                  color:
                                                                    '#1a8547',
                                                                  overflow:
                                                                    'hidden',
                                                                  textOverflow:
                                                                    'ellipsis',
                                                                  whiteSpace:
                                                                    'nowrap',
                                                                }}
                                                              >
                                                                {f.fix}
                                                              </span>
                                                            </span>
                                                          )}
                                                        </span>
                                                      )}
                                                    </span>
                                                  )}
                                                </span>
                                              )
                                            })}
                                          </div>
                                        ))}
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'stretch',
                                            gap: 2,
                                            background: '#f1f3f4',
                                            borderTop: '1px solid #d0d0d0',
                                            borderRadius: '0 0 9px 9px',
                                            padding: '0 8px',
                                          }}
                                        >
                                          {grid.sheets.map((name) => (
                                            <span
                                              key={name}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                height: 30,
                                                padding: '0 14px',
                                                background:
                                                  name === grid.sheet
                                                    ? '#fff'
                                                    : 'transparent',
                                                borderBottom:
                                                  name === grid.sheet
                                                    ? '2px solid #217346'
                                                    : 'none',
                                                fontSize: 12.5,
                                                color:
                                                  name === grid.sheet
                                                    ? '#217346'
                                                    : '#5f6368',
                                              }}
                                            >
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: 14,
                                        paddingTop: 18,
                                      }}
                                    >
                                      {hasPair && (
                                        <span
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 9,
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontFamily: font.mono,
                                              fontSize: 13,
                                              color: '#c92a25',
                                              background: '#fdeceb',
                                              borderRadius: 8,
                                              padding: '5px 10px',
                                            }}
                                          >
                                            {f.fix_before}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: 14,
                                              color: '#c4c8ce',
                                            }}
                                          >
                                            →
                                          </span>
                                          <span
                                            style={{
                                              fontFamily: font.mono,
                                              fontSize: 13,
                                              color: '#1a8547',
                                              background: '#e7f6ec',
                                              borderRadius: 8,
                                              padding: '5px 10px',
                                            }}
                                          >
                                            {f.fix}
                                          </span>
                                        </span>
                                      )}
                                      <span
                                        style={{
                                          flex: '1 1 auto',
                                          minWidth: 12,
                                        }}
                                      />
                                      {noteFor === f.id ? (
                                        //: The dismissal reason — the save
                                        //: gates on more than two
                                        //: characters, the design's own
                                        //: threshold.
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 9,
                                            flex: '1 1 340px',
                                          }}
                                        >
                                          <input
                                            autoFocus
                                            value={noteText}
                                            onChange={(e) =>
                                              setNoteText(e.target.value)
                                            }
                                            placeholder="Why is this not a finding?"
                                            style={{
                                              flex: 1,
                                              minWidth: 0,
                                              border: 0,
                                              background: '#f0f0f2',
                                              borderRadius: 10,
                                              height: 38,
                                              padding: '0 13px',
                                              font: 'inherit',
                                              fontSize: 14,
                                              color: '#1d1d1f',
                                              outline: 'none',
                                            }}
                                          />
                                          <button
                                            onClick={() => saveNote(f)}
                                            style={{
                                              border: 0,
                                              background:
                                                noteText.trim().length > 2
                                                  ? '#0060d0'
                                                  : '#c9d6e8',
                                              color: '#fff',
                                              borderRadius: 10,
                                              height: 38,
                                              padding: '0 16px',
                                              font: 'inherit',
                                              fontSize: 14,
                                              fontWeight: 500,
                                              cursor:
                                                noteText.trim().length > 2
                                                  ? 'pointer'
                                                  : 'default',
                                            }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setNoteFor(null)}
                                            style={{
                                              border: 0,
                                              background: 'transparent',
                                              color: '#0060d0',
                                              borderRadius: 999,
                                              height: 38,
                                              padding: '0 12px',
                                              font: 'inherit',
                                              fontSize: 14,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : correction &&
                                        correction.state === 'proposed' ? (
                                        <div
                                          style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            gap: 12,
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: 14,
                                              lineHeight: 1.5,
                                              color: '#4a4f57',
                                            }}
                                          >
                                            Fix prepared. Nothing is written to
                                            your file until you accept it.
                                          </span>
                                          <button
                                            onClick={() => decide(f, true)}
                                            style={{
                                              border: 0,
                                              background: '#1f2937',
                                              color: '#fff',
                                              borderRadius: 10,
                                              height: 38,
                                              padding: '0 16px',
                                              font: 'inherit',
                                              fontSize: 14,
                                              fontWeight: 500,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Accept it
                                          </button>
                                          <button
                                            onClick={() => decide(f, false)}
                                            style={{
                                              border: 0,
                                              background: 'transparent',
                                              color: '#0060d0',
                                              borderRadius: 999,
                                              height: 38,
                                              padding: '0 12px',
                                              font: 'inherit',
                                              fontSize: 14,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      ) : correction &&
                                        correction.state === 'applied' ? (
                                        <span
                                          style={{
                                            fontSize: 14,
                                            lineHeight: 1.5,
                                            color: '#137a43',
                                          }}
                                        >
                                          Accepted. It lands in the next
                                          version.
                                        </span>
                                      ) : (
                                        <div
                                          style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            gap: 9,
                                          }}
                                        >
                                          {f.fix !== '' && (
                                            <button
                                              onClick={() => applyFix(f)}
                                              style={{
                                                border: 0,
                                                background: '#1f2937',
                                                color: '#fff',
                                                borderRadius: 10,
                                                height: 38,
                                                padding: '0 16px',
                                                font: 'inherit',
                                                fontSize: 14,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                              }}
                                            >
                                              Apply the fix
                                            </button>
                                          )}
                                          {model && (
                                            <button
                                              onClick={() =>
                                                onOpenDoc(model, f.id)
                                              }
                                              style={{
                                                border:
                                                  '1px solid rgba(16,22,35,.08)',
                                                background: '#fff',
                                                color: '#1c1f23',
                                                borderRadius: 999,
                                                height: 38,
                                                padding: '0 16px',
                                                font: 'inherit',
                                                fontSize: 14,
                                                cursor: 'pointer',
                                              }}
                                            >
                                              Open the cell
                                            </button>
                                          )}
                                          <button
                                            onClick={() => rule(f)}
                                            style={{
                                              border: 0,
                                              background: 'transparent',
                                              color: '#0060d0',
                                              borderRadius: 999,
                                              height: 38,
                                              padding: '0 12px',
                                              font: 'inherit',
                                              fontSize: 14,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Not a finding
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'Sources' && (
          <div
            style={{
              width: '100%',
              maxWidth: 1040,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              paddingBottom: 44,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 0 2px',
              }}
            >
              {(
                [
                  { label: 'Map', key: 'map' },
                  { label: 'Documents', key: 'list' },
                ] as const
              ).map((v) => {
                const on = srcView === v.key
                return (
                  <button
                    key={v.key}
                    onClick={() => setSrcView(v.key)}
                    style={{
                      border: 0,
                      background: on ? 'rgba(21,23,27,.055)' : 'transparent',
                      borderRadius: 22,
                      padding: '11px 22px',
                      font: 'inherit',
                      fontSize: 14.5,
                      fontWeight: on ? 500 : 400,
                      letterSpacing: '-.01em',
                      color: on ? '#0060d0' : '#5b6068',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {v.label}
                  </button>
                )
              })}
            </div>

            {srcView === 'map' && (
              <div style={{ ...frameCard, padding: 12 }}>
                <div
                  ref={box}
                  style={{
                    position: 'relative',
                    background: '#fff',
                    borderRadius: 18,
                    boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                    padding: 'clamp(20px,3vh,34px) clamp(16px,2.5vw,32px)',
                  }}
                >
                  {geo && (
                    <svg
                      viewBox={`0 0 ${geo.w} ${geo.h}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        overflow: 'visible',
                      }}
                    >
                      <g
                        fill="none"
                        stroke="#3b6ee0"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        opacity=".55"
                      >
                        {geo.paths.map((d, i) => (
                          <path
                            key={i}
                            d={d}
                            pathLength={1}
                            strokeDasharray="1"
                            style={{
                              animation: `aDraw .85s cubic-bezier(.4,0,.2,1) ${(i * 0.08).toFixed(2)}s both`,
                            }}
                          />
                        ))}
                      </g>
                    </svg>
                  )}
                  <div
                    style={{
                      position: 'relative',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      justifyItems: 'center',
                      gap: 'clamp(30px,4vw,64px)',
                      minHeight: 340,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'clamp(12px,2.5vh,24px)',
                        alignItems: 'flex-end',
                      }}
                    >
                      {inDocs.map((doc) => (
                        <button
                          key={doc.id}
                          ref={(el) => {
                            nodeRefs.current.set(doc.id, el)
                          }}
                          onClick={() => onOpenDoc(doc)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 11,
                            width: '100%',
                            maxWidth: 230,
                            border: '1px solid rgba(255,255,255,.6)',
                            background: '#fbfbfc',
                            borderRadius: 16,
                            padding: '12px 14px',
                            font: 'inherit',
                            textAlign: 'left',
                            cursor: 'pointer',
                            boxShadow:
                              '0 1px 2px rgba(16,22,35,.04), 0 8px 22px rgba(16,22,35,.07), inset 0 1px 0 rgba(255,255,255,.7)',
                          }}
                        >
                          <img
                            src={iconFor(doc.kind)}
                            alt=""
                            style={{
                              flex: '0 0 24px',
                              width: 24,
                              height: 24,
                              objectFit: 'contain',
                            }}
                          />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 14,
                                letterSpacing: '-.008em',
                                lineHeight: 1.3,
                                color: '#1c1f23',
                                textWrap: 'pretty',
                              }}
                            >
                              {doc.filename.replace(/\.[a-z0-9]+$/i, '')}
                            </span>
                            <span
                              style={{
                                fontSize: 12.5,
                                color: '#9aa1ab',
                                lineHeight: 1.35,
                              }}
                            >
                              {when(doc.uploaded_at)}
                            </span>
                          </span>
                        </button>
                      ))}
                      {inDocs.length === 0 && (
                        <span style={{ fontSize: 13, color: '#9aa1ab' }}>
                          No source documents yet.
                        </span>
                      )}
                    </div>
                    {model ? (
                      <button
                        ref={modelRef}
                        onClick={() => onOpenDoc(model)}
                        style={{
                          justifySelf: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 12,
                          border: '1px solid rgba(255,255,255,.6)',
                          background: '#fbfbfc',
                          borderRadius: 22,
                          padding: '20px 18px 18px',
                          font: 'inherit',
                          cursor: 'pointer',
                          boxShadow:
                            '0 1px 2px rgba(16,22,35,.04), 0 14px 36px rgba(16,22,35,.10), inset 0 1px 0 rgba(255,255,255,.7)',
                        }}
                      >
                        <img
                          src={fileIcon.xls}
                          alt=""
                          style={{
                            width: 'clamp(44px,6vw,60px)',
                            height: 'clamp(44px,6vw,60px)',
                            objectFit: 'contain',
                          }}
                        />
                        <span
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 15,
                              fontWeight: 500,
                              letterSpacing: '-.014em',
                              textAlign: 'center',
                              lineHeight: 1.3,
                              maxWidth: '13ch',
                              color: '#1c1f23',
                            }}
                          >
                            {modelName}
                          </span>
                          <span
                            style={{
                              fontFamily: font.mono,
                              fontSize: 12,
                              color: '#9aa1ab',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            v{model.version}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <span style={{ fontSize: 14, color: '#9aa1ab' }}>
                        No model yet.
                      </span>
                    )}
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'clamp(12px,2.5vh,24px)',
                        alignItems: 'flex-start',
                      }}
                    >
                      {outDocs.map((doc) => {
                        const ties = tiesOf.get(doc.id) ?? 0
                        return (
                          <button
                            key={doc.id}
                            ref={(el) => {
                              nodeRefs.current.set(doc.id, el)
                            }}
                            onClick={() => onOpenDoc(doc)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 11,
                              width: '100%',
                              maxWidth: 230,
                              border: '1px solid rgba(255,255,255,.6)',
                              background: '#fbfbfc',
                              borderRadius: 16,
                              padding: '12px 14px',
                              font: 'inherit',
                              textAlign: 'left',
                              cursor: 'pointer',
                              boxShadow:
                                '0 1px 2px rgba(16,22,35,.04), 0 8px 22px rgba(16,22,35,.07), inset 0 1px 0 rgba(255,255,255,.7)',
                            }}
                          >
                            <img
                              src={iconFor(doc.kind)}
                              alt=""
                              style={{
                                flex: '0 0 24px',
                                width: 24,
                                height: 24,
                                objectFit: 'contain',
                              }}
                            />
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 14,
                                  letterSpacing: '-.008em',
                                  lineHeight: 1.3,
                                  color: '#1c1f23',
                                  textWrap: 'pretty',
                                }}
                              >
                                {doc.filename.replace(/\.[a-z0-9]+$/i, '')}
                              </span>
                              <span
                                style={{
                                  fontSize: 12.5,
                                  color: '#9aa1ab',
                                  lineHeight: 1.35,
                                }}
                              >
                                {ties > 0
                                  ? `${ties} figure${ties === 1 ? '' : 's'} tied to the model`
                                  : when(doc.uploaded_at)}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                      {outDocs.length === 0 && (
                        <span style={{ fontSize: 13, color: '#9aa1ab' }}>
                          No deliverables yet.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {srcView === 'list' && (
              <div style={{ ...frameCard, borderRadius: 24, padding: 12 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(240px,1.4fr) minmax(200px,1fr) 130px',
                    gap: 10,
                    padding: '2px 0 12px',
                  }}
                >
                  {['Document', 'Used for', 'Dated'].map((label) => (
                    <span
                      key={label}
                      style={{ ...pillHead, padding: '9px 18px' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                    overflow: 'hidden',
                  }}
                >
                  {(page?.documents ?? []).map((doc, i) => {
                    const ties = tiesOf.get(doc.id) ?? 0
                    const feeds =
                      doc.kind === 'model'
                        ? ''
                        : ties > 0
                          ? `${ties} figure${ties === 1 ? '' : 's'} tied to the model`
                          : doc.kind === 'source'
                            ? 'Source document'
                            : ''
                    return (
                      <div
                        key={doc.id}
                        onClick={() => onOpenDoc(doc)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'minmax(240px,1.4fr) minmax(200px,1fr) 130px',
                          gap: 10,
                          alignItems: 'center',
                          borderTop:
                            i === 0 ? 0 : '.5px solid rgba(16,22,35,.06)',
                          height: 68,
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            padding: '0 16px 0 18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <img
                            src={iconFor(doc.kind)}
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
                              minWidth: 0,
                              fontSize: 16.5,
                              letterSpacing: '-.012em',
                              color: '#1c1f23',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {doc.filename.replace(/\.[a-z0-9]+$/i, '')}
                          </span>
                        </span>
                        <span
                          style={{
                            minWidth: 0,
                            padding: '0 16px 0 18px',
                            fontSize: 14.5,
                            color: '#6b7280',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {feeds}
                        </span>
                        <span
                          style={{
                            minWidth: 0,
                            padding: '0 18px',
                            fontSize: 14.5,
                            color: '#9aa1ab',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {when(doc.uploaded_at)}
                        </span>
                      </div>
                    )
                  })}
                  {(page?.documents.length ?? 0) === 0 && (
                    <div
                      style={{
                        padding: '32px 24px',
                        fontSize: 14.5,
                        color: '#9aa1ab',
                      }}
                    >
                      Nothing here yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {repOpen && (
        <Report
          modelName={modelName}
          version={model?.version ?? deal.model_version ?? null}
          checkedAt={checkedAt}
          counts={counts}
          open={open}
          lastRun={lastRun}
          versions={versions ?? []}
          onClose={() => setRepOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * The report sheet — the design's `fullRep`, filled with what is
 * genuinely computable. No generated prose: the verdict is the counts
 * spoken, the material findings are their own stored sentences, the
 * abstentions are the engine's own reasons. The narrative writer is a
 * later phase.
 */
const Report = ({
  modelName,
  version,
  checkedAt,
  counts,
  open,
  lastRun,
  versions,
  onClose,
}: {
  modelName: string
  version: number | null
  checkedAt: string | null
  counts: { 1: number; 2: number; 3: number }
  open: Finding[]
  lastRun: CheckRun | null
  versions: Version[]
  onClose: () => void
}) => {
  const total = open.length
  const material = open.filter((one) => sevOf(one) === 1)
  const rest = open.filter((one) => sevOf(one) !== 1)
  const record = lastRun ? auditRecord(lastRun) : null
  const summary = lastRun?.summary ?? {}

  const verdictLead =
    counts[1] > 0
      ? `Not ready to send. ${word(total)} finding${total === 1 ? '' : 's'}, ${word(counts[1]).toLowerCase()} of them material.`
      : total > 0
        ? `${word(total)} finding${total === 1 ? '' : 's'} open, none material.`
        : 'Nothing failing.'
  const verdictBody =
    material.length > 0
      ? `${material
          .slice(0, 2)
          .map((one) => one.plain || one.title)
          .join(
            ' ',
          )} ${material.length === 1 ? 'It' : 'These'} should clear before this model leaves the deal team.`
      : total > 0
        ? 'The open findings are worth reading, but none of them on its own would stop the model going out.'
        : ''

  const facts: [string, string][] = [
    ['Model', modelName + (version ? `, version ${version}` : '')],
    ['Checked', when(checkedAt)],
  ]
  if (typeof summary['cells'] === 'number')
    facts.push(['Formulas read', String(summary['cells'])])
  if (Array.isArray(summary['rules_off']) && summary['rules_off'].length > 0)
    facts.push([
      'Rules switched off',
      (summary['rules_off'] as string[]).join(', '),
    ])

  const notChecked: string[] = []
  if (record) {
    for (const one of record.abstentions) notChecked.push(one.why)
    if (record.values_only)
      notChecked.push(
        'This copy carries values only, so the construction rules could not read its formulas.',
      )
  }
  notChecked.push(
    'Model inputs that are judgement calls are not checked — only their sourcing is.',
  )

  const families = new Map<string, Finding[]>()
  for (const one of rest) {
    const family = categoryOfKey(one.rule ?? '')
    const list = families.get(family) ?? []
    list.push(one)
    families.set(family, list)
  }

  const foot = (page: number, of: number, left: string) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginTop: 'auto',
        paddingTop: 44,
      }}
    >
      <span style={{ fontFamily: font.mono, fontSize: 10.5, color: '#b6bac1' }}>
        {left}
      </span>
      <span style={{ flex: 1, height: 1, background: 'rgba(16,22,35,.08)' }} />
      <span style={{ fontFamily: font.mono, fontSize: 10.5, color: '#b6bac1' }}>
        Page {page} of {of}
      </span>
    </div>
  )
  const heading = (text: string, top = 0) => (
    <div
      style={{
        fontSize: 13,
        color: '#2b6cf5',
        letterSpacing: '-.004em',
        paddingBottom: 12,
        paddingTop: top,
      }}
    >
      {text}
    </div>
  )
  const serif = (text: string, size = 15.5) => (
    <div
      style={{
        fontFamily: font.serif,
        fontSize: size,
        lineHeight: 1.65,
        color: '#2f333b',
        maxWidth: '66ch',
        textWrap: 'pretty',
      }}
    >
      {text}
    </div>
  )
  const sheet = (children: ReactNode) => (
    <div
      data-report="sheet"
      style={{
        width: '100%',
        maxWidth: 780,
        background: '#fff',
        borderRadius: 6,
        boxShadow:
          '0 1px 2px rgba(16,22,35,.06), 0 18px 44px rgba(16,22,35,.10)',
        padding: '62px 68px 34px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )

  const print = () => {
    const sheets = [...document.querySelectorAll('[data-report="sheet"]')]
    if (!sheets.length) return
    const w = window.open('', '_blank', 'width=900,height=1200')
    if (!w) return
    w.document.write(
      '<!doctype html><meta charset="utf-8"><title>' +
        document.title +
        '</title>' +
        '<style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}' +
        '[data-report="sheet"]{box-shadow:none!important;border-radius:0!important;max-width:none!important;break-after:page}' +
        '@page{margin:16mm}</style>' +
        '<body>' +
        sheets.map((s) => s.outerHTML).join('') +
        '</body>',
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  }

  const pages = 3
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(16,20,28,.34)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: 22,
      }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'relative',
          width: 'min(1060px,100%)',
          height: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#e4e8ee',
          borderRadius: 24,
          boxShadow: '0 30px 80px rgba(0,0,0,.30), 0 0 0 .5px rgba(0,0,0,.08)',
          overflow: 'hidden',
          animation: 'pcIn .18s ease both',
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 18px 14px 24px',
            background: 'rgba(255,255,255,.72)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            borderBottom: '1px solid rgba(16,22,35,.06)',
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 15.5,
              fontWeight: 500,
              letterSpacing: '-.014em',
              color: '#1c1f23',
            }}
          >
            Model review report
          </span>
          <button
            onClick={print}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              border: 0,
              background: '#0060d0',
              borderRadius: 999,
              height: 38,
              padding: '0 20px',
              font: 'inherit',
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: '-.01em',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 4v12" />
              <polyline points="6.5,11.5 12,17 17.5,11.5" />
              <path d="M5 20h14" />
            </svg>
            <span>Download PDF</span>
          </button>
          <button
            onClick={onClose}
            style={{
              flex: '0 0 auto',
              width: 38,
              height: 38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 0,
              background: 'transparent',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6b7280"
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
            padding: '34px 24px 44px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 30,
          }}
        >
          {sheet(
            <>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: '.15em',
                  color: '#9aa1ab',
                  textTransform: 'uppercase',
                }}
              >
                Model review report
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 34,
                  lineHeight: 1.15,
                  letterSpacing: '-.01em',
                  color: '#1c1f23',
                  paddingTop: 10,
                }}
              >
                {modelName}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  fontSize: 13.5,
                  color: '#6b7280',
                  paddingTop: 16,
                }}
              >
                {version && <span>Version {version}</span>}
                {version && (
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: '#c4c8ce',
                    }}
                  />
                )}
                <span>Checked {when(checkedAt).toLowerCase()}</span>
              </div>
              <div
                style={{
                  height: 1,
                  background: 'rgba(16,22,35,.08)',
                  margin: '28px 0 30px',
                }}
              />
              {heading('The verdict')}
              {serif(verdictLead, 19)}
              {verdictBody && (
                <div style={{ paddingTop: 14 }}>{serif(verdictBody)}</div>
              )}
              {heading('What was checked', 40)}
              {serif(
                'Read against the FAST and ICAEW conventions and against the model’s own check rows. Every finding carries the cell it came from.',
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  paddingTop: 22,
                  borderTop: '1px solid rgba(16,22,35,.08)',
                  marginTop: 22,
                }}
              >
                {facts.map(([k, v], i) => (
                  <span
                    key={k}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '170px 1fr',
                      gap: 20,
                      alignItems: 'baseline',
                      borderTop: i === 0 ? 0 : '1px solid rgba(16,22,35,.05)',
                      padding: '13px 0',
                    }}
                  >
                    <span style={{ fontSize: 13.5, color: '#9aa1ab' }}>
                      {k}
                    </span>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 13,
                        color: '#3a3a3c',
                      }}
                    >
                      {v}
                    </span>
                  </span>
                ))}
              </div>
              {heading('What could not be checked', 34)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {notChecked.map((text, i) => (
                  <span key={i} style={{ display: 'flex', gap: 11 }}>
                    <span
                      style={{
                        flex: '0 0 auto',
                        width: 5,
                        height: 5,
                        marginTop: 9,
                        borderRadius: '50%',
                        background: '#c4c8ce',
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{serif(text)}</span>
                  </span>
                ))}
              </div>
              {foot(1, pages, 'Swens')}
            </>,
          )}

          {sheet(
            <>
              {heading('The material findings')}
              {serif(
                material.length > 0
                  ? `${word(material.length)} finding${material.length === 1 ? '' : 's'} that change a number someone will act on. The cell reference is given so the model owner can go straight to it.`
                  : 'No open finding is material.',
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 30,
                  paddingTop: 28,
                }}
              >
                {material.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', gap: 16 }}>
                    <span
                      style={{
                        flex: '0 0 auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        paddingTop: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#e0322d',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: '#c4c8ce',
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16.5,
                          letterSpacing: '-.012em',
                          lineHeight: 1.35,
                          color: '#1c1f23',
                          textWrap: 'pretty',
                        }}
                      >
                        {m.plain || m.title}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 7,
                          paddingTop: 9,
                        }}
                      >
                        {m.where.anchor.ref && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: '#f4f5f7',
                              borderRadius: 999,
                              padding: '4px 11px',
                              fontFamily: font.mono,
                              fontSize: 11.5,
                              color: '#4a4f57',
                            }}
                          >
                            {`'${m.where.anchor.sheet ?? ''}'!${m.where.anchor.ref}`}
                          </span>
                        )}
                        {m.figure && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: '#fdeceb',
                              borderRadius: 999,
                              padding: '4px 11px',
                              fontSize: 12.5,
                              color: '#c92a25',
                            }}
                          >
                            {m.figure}
                            {m.figure_unit ? ` ${m.figure_unit}` : ''}
                          </span>
                        )}
                      </span>
                      <div style={{ paddingTop: 12 }}>
                        {serif(m.context || m.title)}
                      </div>
                    </span>
                  </div>
                ))}
              </div>
              {foot(
                2,
                pages,
                modelName + (version ? `, version ${version}` : ''),
              )}
            </>,
          )}

          {sheet(
            <>
              {heading('Everything else')}
              {serif(
                rest.length > 0
                  ? `${word(rest.length)} finding${rest.length === 1 ? '' : 's'} worth clearing but that would not on ${rest.length === 1 ? 'its' : 'their'} own hold the model back. One line each.`
                  : 'Nothing else is open.',
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 24,
                  paddingTop: 24,
                }}
              >
                {[...families.entries()].map(([name, items]) => (
                  <div
                    key={name}
                    style={{ display: 'flex', flexDirection: 'column' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        paddingBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: SEV_DOT[sevOf(items[0]!)],
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#6b7280' }}>
                        {name}
                      </span>
                    </span>
                    {items.map((one, i) => (
                      <span
                        key={one.id}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 12,
                          borderTop:
                            i === 0 ? 0 : '1px solid rgba(16,22,35,.05)',
                          padding: '11px 0',
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14.5,
                            color: '#3a3a3c',
                            textWrap: 'pretty',
                          }}
                        >
                          {one.plain || one.title}
                        </span>
                        {one.where.anchor.ref && (
                          <span
                            style={{
                              flex: '0 0 auto',
                              fontFamily: font.mono,
                              fontSize: 11.5,
                              color: '#9aa1ab',
                            }}
                          >
                            {`'${one.where.anchor.sheet ?? ''}'!${one.where.anchor.ref}`}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {versions.length > 0 && (
                <>
                  {heading('The versions', 40)}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      paddingTop: 2,
                    }}
                  >
                    {versions
                      .slice()
                      .sort((a, b) => b.version - a.version)
                      .slice(0, 4)
                      .map((v, i) => (
                        <span
                          key={v.id}
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 14,
                            borderTop:
                              i === 0 ? 0 : '1px solid rgba(16,22,35,.05)',
                            padding: '11px 0',
                          }}
                        >
                          <span
                            style={{
                              flex: '0 0 46px',
                              fontFamily: font.mono,
                              fontSize: 12.5,
                              color: '#0060d0',
                            }}
                          >
                            v{v.version}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14.5,
                              color: '#3a3a3c',
                            }}
                          >
                            {v.uploaded_by
                              ? `Uploaded by ${v.uploaded_by.name}`
                              : 'Uploaded'}
                          </span>
                          <span
                            style={{
                              flex: '0 0 auto',
                              fontSize: 13,
                              color: '#9aa1ab',
                            }}
                          >
                            {when(v.uploaded_at)}
                          </span>
                        </span>
                      ))}
                  </div>
                </>
              )}
              {heading("What this doesn't tell you", 40)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  'Whether the deal is a good deal. Swens checks that the model holds together, not that the answer is right.',
                  'Whether the assumptions are reasonable — only whether each typed input can be traced to a source.',
                ].map((text, i) => (
                  <span key={i} style={{ display: 'flex', gap: 11 }}>
                    <span
                      style={{
                        flex: '0 0 auto',
                        width: 5,
                        height: 5,
                        marginTop: 9,
                        borderRadius: '50%',
                        background: '#c4c8ce',
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{serif(text)}</span>
                  </span>
                ))}
              </div>
              {foot(3, pages, 'Swens')}
            </>,
          )}
        </div>
      </div>
    </div>
  )
}

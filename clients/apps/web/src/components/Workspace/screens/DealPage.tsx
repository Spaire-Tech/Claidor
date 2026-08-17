'use client'

/**
 * The model page — the verdict, the failing checks, and what stands
 * behind them.
 *
 * Source of truth: `docs/pierce/design-antford/workspace.html`, the
 * `hasDeal` section, as revised 15 August: verdict line on top, the
 * failing checks in two titled families — « How the model is built »
 * and « Whether the accounts add up » — on figure-led cards, and one
 * sectioned card beneath: Checks that pass · Checks that did not run ·
 * Evidence locker · The model · Documents that quote it. Every name,
 * count and sentence is the server's; the design's demo names appear
 * nowhere.
 *
 * A « check » here is what the deals list counts: one rule of the
 * audit, with the tie-out — every rule-less finding — as one check
 * among them. One card per failing check, however many cells it fails
 * at; the card's modal lists the places.
 *
 * Departures from the drawn design, each named (absent, not faked):
 * - The modal's little Excel grid is REAL now — the engine composes
 *   each finding's cell with its neighbours at check time and the
 *   modal draws it (`MiniGrid`). The earlier note here claiming the
 *   server could not ship a cell's neighbours was wrong, and the
 *   founder caught it.
 * - « Open the cell » needs Excel under the button — that is the
 *   panel's move. The web modal keeps only « Accept with a note ».
 * - The tie-out's card sits in an untitled grid above the two
 *   families: documents disagreeing with the model is neither
 *   construction nor statements, and the design draws no third
 *   section for it.
 * - A construction card's headline figure is the count of failing
 *   places — the design's per-cell figures (« 19,100 ») need per-cell
 *   value extraction the mechanical audit does not do yet. Statement
 *   cards carry the engine's own figure.
 * - The design's pass list names checks the engine does not run yet
 *   (retained earnings, interest accrual, depreciation) — they appear
 *   nowhere until built; interest is its own backlogged round.
 * - Version rows say who uploaded, not what changed: the change
 *   summary is the version-diff work, queued.
 * - A deal never checked gets a verdict face the design does not draw
 *   — « Not checked yet. » — because no findings on a deal nobody
 *   checked must never read as a pass.
 */

import { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Artifact,
  auditRecord,
  DealPage as DealPageData,
  Decision,
  Finding,
  FindingGrid,
  HouseRules,
  TieOutApi,
  Version,
} from './../api'
import {
  cardRing,
  cardRingHover,
  cellRefInk,
  excelLogo,
  figureInk,
  font,
  greyButton,
  ink,
  inputGlow,
  well,
} from './../design'
import { checkedLine, staleNote } from './Deals'

/** « 1 hour ago » · « yesterday, 19:40 » · « 4 August » — the design's
 *  relative time, shared shape with the deals list's checked line. */
export const ago = (at: string): string => {
  const then = new Date(at)
  const now = new Date()
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && then.getDate() === now.getDate())
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString())
    return `yesterday, ${time}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return then.toLocaleDateString([], { day: 'numeric', month: 'long' })
}

//: The four avatar gradients the design uses, assigned by a stable
//: hash of the name so one person keeps one colour. (The locker rows
//: themselves draw no avatar — these serve the screens that do.)
const AVATARS = [
  { bg: 'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg: '#2c4a80' },
  { bg: 'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg: '#275c39' },
  { bg: 'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg: '#8a4526' },
  { bg: 'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg: '#553a7a' },
]

export const avatarOf = (name: string) => {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return AVATARS[Math.abs(hash) % AVATARS.length]!
}

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

/** The design's spelled-out verdict — « Eleven checks don't pass. » */
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

/** What each statement check counts, for the pass row's tally —
 *  « 102 of 103 accounts », « 223 of 226 rows clean ». */
const TALLY_NOUNS: Record<string, string> = {
  'balance-sheet': 'periods',
  'cash-continuity': 'accounts',
  'debt-terminal': 'tranches',
  'interest-consistency': 'tranches',
  'model-own-check': 'rows',
  'time-axis': 'sheets',
}

/** The tie-out's rule key is the empty string; its face needs words. */
const TIEOUT_LABEL = 'Documents disagree with the model'

/** The design's three severities, mapped per rule. The engine's own
 *  grading (error / smell) stays the measured truth underneath; this
 *  is the report's vocabulary — what a bid director scans. */
export const TIER_OF: Record<
  string,
  'Material' | 'Significant' | 'Observation'
> = {
  'skipped-cell': 'Material',
  'error-value': 'Material',
  circular: 'Material',
  'balance-sheet': 'Material',
  'cash-continuity': 'Material',
  'debt-terminal': 'Material',
  interest: 'Material',
  'typed-over-formula': 'Significant',
  'inconsistent-row': 'Significant',
  'external-link': 'Significant',
  'model-own-check': 'Significant',
  'hidden-sheet': 'Significant',
  'time-axis': 'Significant',
  'hardcode-in-formula': 'Observation',
  volatile: 'Observation',
  'long-formula': 'Observation',
  'inconsistent-anchoring': 'Observation',
}
export const TIER_FG: Record<string, string> = {
  Material: '#c9302c',
  Significant: '#0060d0',
  Observation: '#5b52e0',
}
export const TIER_BG: Record<string, string> = {
  Material: '#fdecea',
  Significant: '#eaf2fd',
  Observation: '#f0efff',
}
/** The tier by rule key — shared with the Check-a-model bench, so both
 *  report faces speak the same three words for the same rule. */
export const tierOfKey = (
  rule: string,
  severity: string,
): 'Material' | 'Significant' | 'Observation' =>
  TIER_OF[rule] ?? (severity === 'error' ? 'Material' : 'Observation')
const tierOf = (finding: Finding): 'Material' | 'Significant' | 'Observation' =>
  tierOfKey(finding.rule ?? '', finding.severity)

/** The design's finding families — the grey category word on a row. */
const CATEGORY_OF: Record<string, string> = {
  'inconsistent-row': 'Probable formula defects',
  'skipped-cell': 'Probable formula defects',
  'inconsistent-anchoring': 'Probable formula defects',
  'error-value': 'Probable formula defects',
  circular: 'Probable formula defects',
  'time-axis': 'Probable formula defects',
  'balance-sheet': 'Structural exceptions',
  'cash-continuity': 'Structural exceptions',
  'debt-terminal': 'Structural exceptions',
  'model-own-check': 'Structural exceptions',
  interest: 'Structural exceptions',
  'typed-over-formula': 'Embedded hardcodes',
  'hardcode-in-formula': 'Embedded hardcodes',
  'external-link': 'Auditability risks',
  volatile: 'Auditability risks',
  'long-formula': 'Auditability risks',
  'hidden-sheet': 'Auditability risks',
}
/** The family by rule key — shared with the Check-a-model bench. */
export const categoryOfKey = (rule: string): string =>
  rule === ''
    ? 'Documents against the model'
    : (CATEGORY_OF[rule] ?? 'Other findings')
const categoryOf = (finding: Finding): string =>
  categoryOfKey(finding.rule ?? '')

/** A sheet's role, from its own name — the middle column of « Where
 *  the findings sit ». A name that matches nothing stays unlabelled
 *  rather than guessed. Shared with the Check-a-model bench. */
export const roleOf = (sheet: string): string => {
  if (/input|assumption|driver|funding/i.test(sheet)) return 'inputs'
  if (/revenue|opex|cost|tax|ops|operat|production/i.test(sheet))
    return 'operations'
  if (/balance|cash|p&l|profit|income|statement/i.test(sheet))
    return 'statements'
  if (/debt|covenant|facilit|interest|repayment/i.test(sheet))
    return 'financing'
  if (/return|sensitiv|check|output|summary|cover|databook/i.test(sheet))
    return 'outputs and control'
  return ''
}

/** `hardcode-in-formula` → « Hardcode in formula » when the catalogue
 *  has no better sentence for it. */
const humanize = (key: string): string => {
  const words = key.replace(/-/g, ' ')
  return words[0] ? words[0].toUpperCase() + words.slice(1) : key
}

/** One failing check: its findings, gathered under one card. */
interface FailGroup {
  key: string
  label: string
  standard: string | null
  findings: Finding[]
  fresh: number
  /** A statement check — the « Whether the accounts add up » family. */
  analytical: boolean
  /** The card's headline: the engine's figure for the worst finding of
   *  a statement check; the count of places for a construction rule. */
  figure: string
  figureUnit: string
  /** The mono line under the sentence — where in the model. */
  where: string
}

/**
 * One failing check, on the v2 design's card face: the headline figure
 * in the design's purple, the phrase saying what it is, the rule's
 * sentence, and the mono cell reference in green. The ring shadow
 * lifts softly under the pointer — the design's own hover. Shared with
 * the Check-a-model screen, which the design draws with the same card.
 */
export const FailCard = ({
  figure,
  figureUnit,
  label,
  where,
  tag,
  onPick,
}: {
  figure: string
  figureUnit: string
  label: string
  where: string
  tag: string
  onPick: () => void
}) => {
  const [over, setOver] = useState(false)
  return (
    <div
      onClick={onPick}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      style={{
        background: '#fff',
        borderRadius: 14,
        boxShadow: over ? cardRingHover : cardRing,
        padding: '21px 22px 18px',
        cursor: 'pointer',
        transition: 'box-shadow .16s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            flex: '0 0 auto',
            fontSize: 20.5,
            letterSpacing: '-.022em',
            lineHeight: 1.15,
            color: figureInk,
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}
        >
          {figure}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            color: '#9a9aa0',
            lineHeight: 1.4,
            textWrap: 'pretty',
          }}
        >
          {figureUnit}
        </span>
      </div>
      <div
        style={{
          fontSize: 16,
          letterSpacing: '-.014em',
          lineHeight: 1.34,
          marginTop: 17,
          textWrap: 'pretty',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginTop: 18,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: font.mono,
            fontSize: 11.5,
            color: cellRefInk,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {where}
        </span>
        <span style={{ flex: '0 0 auto', fontSize: 11.5, color: '#b6b6bc' }}>
          {tag}
        </span>
      </div>
    </div>
  )
}

/** Excel's own face, for the little grid only. */
const excelFace = "'Aptos Narrow','Calibri','Segoe UI',sans-serif"

/**
 * The design's little Excel grid: the finding's cell in its own
 * neighbourhood — formula bar on top, column letters, the model's row
 * labels, the offending cell in red. Composed by the server when the
 * check ran; this only draws it.
 */
export const MiniGrid = ({ grid }: { grid: FindingGrid }) => (
  <div
    style={{
      marginTop: 16,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 0 0 .5px rgba(0,0,0,.14)',
      background: '#fff',
    }}
  >
    {/* Name box and formula bar, as Excel draws them. */}
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        padding: '7px 10px',
        borderBottom: '.5px solid #e2e2e2',
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          minWidth: 64,
          border: '.5px solid #d9d9d9',
          borderRadius: 4,
          padding: '3px 9px',
          fontFamily: excelFace,
          fontSize: 12.5,
          color: '#1d1d1f',
        }}
      >
        {grid.sel}
      </span>
      <span
        style={{
          flex: '0 0 auto',
          alignSelf: 'center',
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          fontSize: 12,
          color: '#8a8a8a',
        }}
      >
        fx
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          border: '.5px solid #d9d9d9',
          borderRadius: 4,
          padding: '3px 9px',
          fontFamily: font.mono,
          fontSize: 11.5,
          color: '#3a3a3c',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {grid.formula}
      </span>
    </div>
    {/* The grid itself, drawn the way Excel draws it: letters across
        the top, row numbers down the side, the model's own labels in
        the first column, the offending cell in Excel's warning yellow
        with the selection ring in its green. The period band under the
        letters is the sheet's own time axis, said in a muted voice —
        the reader keeps numbers, not header strings, so the axis is
        drawn from the structure layer rather than a stored row. */}
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          minWidth: '100%',
          fontFamily: excelFace,
          fontSize: 12.5,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                width: 34,
                background: '#f5f5f5',
                borderRight: '1px solid #d0d0d0',
                borderBottom: '1px solid #d0d0d0',
              }}
            />
            <th
              style={{
                background: '#f5f5f5',
                borderRight: '1px solid #d0d0d0',
                borderBottom: '1px solid #d0d0d0',
                minWidth: 150,
              }}
            />
            {grid.cols.map((col) => {
              const active = grid.sel.replace(/\d+$/, '') === col.l
              return (
                <th
                  key={col.l}
                  style={{
                    background: active ? '#e2efe7' : '#f5f5f5',
                    color: active ? '#0e6c39' : '#4a4a4a',
                    borderRight: '1px solid #d0d0d0',
                    borderBottom: active
                      ? '1.5px solid #107c41'
                      : '1px solid #d0d0d0',
                    padding: '3px 8px',
                    fontWeight: 400,
                    fontSize: 11,
                    textAlign: 'center',
                    minWidth: 78,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.l}
                </th>
              )
            })}
          </tr>
          {grid.cols.some((col) => col.p) && (
            <tr>
              <th
                style={{
                  background: '#f5f5f5',
                  borderRight: '1px solid #d0d0d0',
                  borderBottom: '1px solid #dedede',
                }}
              />
              <th
                style={{
                  borderBottom: '1px solid #dedede',
                  padding: '3px 8px',
                  fontWeight: 400,
                  fontSize: 11,
                  color: '#8a8a8a',
                  textAlign: 'left',
                }}
              />
              {grid.cols.map((col) => (
                <th
                  key={col.l}
                  style={{
                    borderRight: '1px solid #dedede',
                    borderBottom: '1px solid #dedede',
                    padding: '3px 8px',
                    fontWeight: 500,
                    fontSize: 12,
                    color: '#6b6b6b',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.p}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {grid.rows.map((row) => {
            const activeRow = String(row.n) === grid.sel.replace(/^[A-Z]+/, '')
            return (
              <tr key={row.n}>
                <td
                  style={{
                    background: activeRow ? '#e2efe7' : '#f5f5f5',
                    color: activeRow ? '#0e6c39' : '#8a8a8a',
                    borderRight: activeRow
                      ? '1.5px solid #107c41'
                      : '1px solid #d0d0d0',
                    borderBottom: '1px solid #d0d0d0',
                    padding: '5px 6px',
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                >
                  {row.n}
                </td>
                <td
                  style={{
                    borderRight: '1px solid #dedede',
                    borderBottom: '1px solid #dedede',
                    padding: '5px 8px',
                    fontSize: 13,
                    color: '#1a1a1a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 220,
                  }}
                >
                  {row.label}
                </td>
                {row.cells.map((cell, at) => (
                  <td
                    key={at}
                    style={{
                      borderRight: '1px solid #dedede',
                      borderBottom: '1px solid #dedede',
                      padding: '5px 8px',
                      fontSize: 13,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: cell.hot ? '#9c5700' : '#1a1a1a',
                      background: cell.hot ? '#ffeb9c' : '#ffffff',
                      boxShadow: cell.hot ? 'inset 0 0 0 2px #107c41' : 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cell.v}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    {/* The sheet-tab strip, the active tab in Excel's green. */}
    {grid.sheets.length > 0 && (
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '5px 10px 0',
          borderTop: '.5px solid #e2e2e2',
          background: '#fafafa',
          overflow: 'hidden',
        }}
      >
        {grid.sheets.map((tab) => (
          <span
            key={tab}
            style={{
              flex: '0 0 auto',
              padding: '5px 11px 6px',
              fontFamily: excelFace,
              fontSize: 12,
              color: tab === grid.sheet ? '#107c41' : '#5f5f5f',
              fontWeight: tab === grid.sheet ? 600 : 400,
              borderBottom:
                tab === grid.sheet
                  ? '2px solid #107c41'
                  : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </span>
        ))}
      </div>
    )}
  </div>
)

/** The v2 design's section label over a grid of failing checks. */
export const failHead = (words: string, first: boolean) => (
  <div
    style={{
      fontSize: 12.5,
      color: '#8b8b90',
      letterSpacing: '.045em',
      textTransform: 'uppercase',
      padding: first ? '32px 2px 13px' : '36px 2px 13px',
    }}
  >
    {words}
  </div>
)

/** The grid the failing cards sit in. */
export const failGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(282px, 1fr))',
  gap: 16,
  alignItems: 'start',
}

const sectionChevron = (open: boolean) => (
  <svg
    width="8"
    height="13"
    viewBox="0 0 9 15"
    fill="none"
    stroke="#c7c7cc"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      flex: '0 0 8px',
      transform: open ? 'rotate(90deg)' : 'none',
      transition: 'transform .18s ease',
    }}
  >
    <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
  </svg>
)

type SectionKey = 'pass' | 'cov' | 'log' | 'model' | 'docs'

export interface DealPageProps {
  api: TieOutApi
  dealId: string
  /** Bumped by the shell's « Recheck now »; a change re-runs and reloads. */
  checkNonce: number
  /** Bumped by the shell's « Export report »; a change opens the modal. */
  reportNonce?: number
  onChecking: (running: boolean) => void
  openDocId: string | null
  onOpenDoc: (doc: Artifact, atFindingId?: string | null) => void
  /** The model was removed — the shell goes back to the list. */
  onRemoved?: () => void
}

export const DealPage = ({
  api,
  dealId,
  checkNonce,
  reportNonce = 0,
  onChecking,
  openDocId,
  onOpenDoc,
  onRemoved,
}: DealPageProps) => {
  const [page, setPage] = useState<DealPageData | null>(null)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  //: The audit's own catalogue, for the checks' sentences. Null while
  //: asking; the pass section waits for it rather than guessing.
  const [rules, setRules] = useState<HouseRules | null>(null)
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [reload, setReload] = useState(0)

  //: One section open at a time — the design's own accordion.
  const [sec, setSec] = useState<SectionKey | null>(null)
  //: The picked failing check, by its rule key. `noteText === null`
  //: means the note flow is closed.
  const [picked, setPicked] = useState<string | null>(null)
  const [noteText, setNoteText] = useState<string | null>(null)
  const [noteGlow, setNoteGlow] = useState(false)
  const [saving, setSaving] = useState(false)
  //: The remove control's two steps — a destructive act never fires
  //: on its first click.
  const [removing, setRemoving] = useState(false)
  //: Which of the picked check's places the modal's grid is showing.
  const [place, setPlace] = useState(0)
  useEffect(() => setPlace(0), [picked])

  useEffect(() => {
    let live = true
    Promise.all([api.deal(dealId), api.findings(dealId)])
      .then(([deal, found]) => {
        if (!live) return
        setPage(deal)
        setFindings(found)
        api
          .houseRules(deal.organization_id)
          .then((got) => live && setRules(got))
          .catch(() => undefined)
        const model = deal.documents.find((one) => one.kind === 'model')
        if (model)
          api
            .versions(model.id)
            .then((got) => live && setVersions(got))
            .catch(() => undefined)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, dealId, reload])

  const check = useCallback(() => {
    onChecking(true)
    api
      .check(dealId)
      .catch(() => undefined)
      .then(() => {
        onChecking(false)
        setReload((was) => was + 1)
      })
  }, [api, dealId, onChecking])

  //: The shell's « Recheck now ». Zero is initial state, not a press.
  useEffect(() => {
    if (checkNonce > 0) check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkNonce])

  //: The shell's « Export report ». Same nonce pattern.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportOff, setReportOff] = useState<string[]>([])
  useEffect(() => {
    if (reportNonce > 0) setReportOpen(true)
  }, [reportNonce])

  const model = useMemo(
    () => page?.documents.find((one) => one.kind === 'model') ?? null,
    [page],
  )

  //: The failing checks: open findings gathered by rule, the rule-less
  //: tie-out findings as one check between them — the same arithmetic
  //: as the deals list's « N checks fail ».
  const fails = useMemo<FailGroup[]>(() => {
    const groups = new Map<string, Finding[]>()
    for (const finding of findings ?? []) {
      if (finding.state !== 'open') continue
      const key = finding.rule ?? ''
      const had = groups.get(key)
      if (had) had.push(finding)
      else groups.set(key, [finding])
    }
    const catalogue = new Map(
      (rules?.rules ?? []).map((rule) => [rule.key, rule.label]),
    )
    const analytic = new Set(
      (rules?.rules ?? [])
        .filter((rule) => rule.analytical)
        .map((rule) => rule.key),
    )
    const savedAt = model ? new Date(model.uploaded_at) : null
    const list: FailGroup[] = []
    for (const [key, group] of groups) {
      const analytical = analytic.has(key)
      //: The headline. A statement check's worst finding brings the
      //: engine's own figure; a construction rule's real number is how
      //: many places it fails at. Nothing here is composed from thin
      //: air — the figure came from the walk that found it.
      const magnitude = (one: Finding) => {
        const parsed = Number(one.figure.replace(/,/g, ''))
        return Number.isFinite(parsed) ? Math.abs(parsed) : 0
      }
      const carrying = group.filter((one) => one.figure)
      const worst =
        carrying.length > 0
          ? [...carrying].sort((a, b) => magnitude(b) - magnitude(a))[0]!
          : group[0]!
      const figure = worst.figure || String(group.length)
      const figureUnit = worst.figure
        ? worst.figure_unit
        : key === ''
          ? group.length === 1
            ? 'figure disagreeing with the model'
            : 'figures disagreeing with the model'
          : group.length === 1
            ? 'place in the model'
            : 'places in the model'
      const where =
        group.length === 1
          ? worst.where.detail
          : `${worst.where.detail} · ${group.length} places`
      list.push({
        key,
        //: What is wrong, in the finding's own two or three words —
        //: « Incomplete total » — falling back to the catalogue's rule
        //: name for rows stored before headlines existed.
        label:
          key === ''
            ? TIEOUT_LABEL
            : (group.find((one) => one.headline)?.headline ??
              catalogue.get(key) ??
              humanize(key)),
        standard: group[0]!.standard,
        findings: group,
        analytical,
        figure,
        figureUnit,
        where,
        //: Fresh: appeared with the current version of the model — the
        //: finding was first seen after that file arrived. Dismissals
        //: survive re-runs, so `created_at` is the finding's first
        //: sighting, not the last run's clock.
        fresh: savedAt
          ? group.filter((one) => new Date(one.created_at) > savedAt).length
          : 0,
      })
    }
    //: Tie-out first, then by size — the widest failure leads.
    list.sort((a, b) =>
      a.key === ''
        ? -1
        : b.key === ''
          ? 1
          : b.findings.length - a.findings.length,
    )
    return list
  }, [findings, rules, model])

  const pickedGroup = fails.find((one) => one.key === picked) ?? null
  //: The place whose grid and sentences the modal is showing.
  const shownFinding = pickedGroup
    ? (pickedGroup.findings[Math.min(place, pickedGroup.findings.length - 1)] ??
      pickedGroup.findings[0]!)
    : null

  const closeModal = () => {
    setPicked(null)
    setNoteText(null)
  }

  //: The ruling is about the finding on screen, not the rule. This
  //: used to sweep every finding in the group — accepting one hardcode
  //: silently accepted thirteen, which the founder read as a lie. The
  //: modal opens on one table row; the ruling lands on that row.
  const acceptFinding = (finding: Finding, note: string) => {
    setSaving(true)
    api
      .dismiss(finding.id, 'accepted', note)
      .catch(() => undefined)
      .then(() => {
        setSaving(false)
        closeModal()
        setReload((was) => was + 1)
      })
  }

  //: « Fix the cell » — the server writes the row's own formula into
  //: the deal's copy as a new version, re-reads it, and compares every
  //: cell against the original before keeping it. A refusal comes back
  //: as the correction's own sentence.
  const fixCell = (finding: Finding) => {
    setSaving(true)
    api
      .propose(finding.id)
      .then((correction) => api.decideCorrection(correction.id, 'accept'))
      .catch(() => undefined)
      .then(() => {
        setSaving(false)
        closeModal()
        setReload((was) => was + 1)
      })
  }

  if (page === null) {
    return <div style={{ flex: 1, minHeight: 0, background: well }} />
  }

  const checkedAt = page.last_tieout?.finished_at ?? null
  const auditAt = page.last_audit?.finished_at ?? null
  const anyCheckAt = auditAt ?? checkedAt
  const never = anyCheckAt === null
  const clean = !never && !page.stale && fails.length === 0
  const stale = page.stale

  //: « checked Tuesday 11:52 » — the deals list's phrasing, lowered
  //: into the middle of a sentence.
  const checkedLower = anyCheckAt
    ? checkedLine(anyCheckAt).replace(/^Checked/, 'checked')
    : ''

  const verdictLine =
    fails.length === 0
      ? 'Everything checked passes.'
      : `${WORDS[fails.length] ?? fails.length} ${
          fails.length === 1 ? "check doesn't pass." : "checks don't pass."
        }`

  const accepted = page.findings.accepted
  const acceptedLine =
    accepted === 1
      ? '1 failure accepted with a note'
      : `${accepted} failures accepted with a note`

  //: The stale face's second line: what changed, then what the last
  //: verdict was — composed to the design's own example.
  const lastVerdict =
    fails.length === 0
      ? 'Last verdict: every check passed.'
      : `Last verdict: ${fails.length} ${
          fails.length === 1 ? 'check failed' : 'checks failed'
        }.`

  //: The audit's statement-check record: values-only copies, real
  //: tallies, named abstentions. Absent on runs that predate it.
  const record = auditRecord(page.last_audit)

  //: Checks that pass: the catalogue's rules that are on and not
  //: failing — only claimed once the audit has actually run. The
  //: tie-out's row leads when its figures agree; a statement check's
  //: row carries the engine's own tally. On a values-only copy the
  //: construction rules make no claim either way — the design's rule:
  //: only the statement checks could read it.
  const failingKeys = new Set(fails.map((one) => one.key))
  const passRows: { name: string; count: string }[] = []
  if (checkedAt !== null && !failingKeys.has('') && page.coverage.agreeing > 0)
    passRows.push({
      name: 'Documents quote the model',
      count: `${page.coverage.agreeing} ${
        page.coverage.agreeing === 1 ? 'figure' : 'figures'
      }`,
    })
  if (auditAt !== null)
    for (const rule of rules?.rules ?? []) {
      if (!rule.on || failingKeys.has(rule.key)) continue
      if (record.values_only && !rule.analytical) continue
      const tally = record.tallies[rule.key]
      const noun = TALLY_NOUNS[rule.key] ?? ''
      const count = !tally
        ? ''
        : tally.clean === tally.total
          ? `${tally.total} ${noun}`
          : `${tally.clean} of ${tally.total} ${noun}${
              rule.key === 'model-own-check' ? ' clean' : ''
            }`
      passRows.push({ name: rule.pass_label || rule.label, count })
    }

  //: Checks that did not run — a rule turned off is a decision, an
  //: abstention is a check refusing to guess, and a values-only copy
  //: is a fact about the file. All three stay visible here, each with
  //: its reason in words.
  const notRunRows: { label: string; count: string; why: string }[] = (
    rules?.rules ?? []
  )
    .filter((rule) => !rule.on)
    .map((rule) => ({
      label: rule.label,
      count: '',
      why: 'Switched off in Settings.',
    }))
  {
    const byRule = new Map<string, { whys: string[] }>()
    for (const one of record.abstentions) {
      const had = byRule.get(one.rule)
      if (had) had.whys.push(one.why)
      else byRule.set(one.rule, { whys: [one.why] })
    }
    const catalogue = new Map(
      (rules?.rules ?? []).map((rule) => [rule.key, rule.label]),
    )
    for (const [key, { whys }] of byRule) {
      const noun = TALLY_NOUNS[key] ?? 'places'
      notRunRows.push({
        label: catalogue.get(key) ?? humanize(key),
        count: whys.length === 1 ? '' : `${whys.length} ${noun}`,
        why: whys[0]!,
      })
    }
  }
  if (record.values_only && auditAt !== null) {
    const buildRules = (rules?.rules ?? []).filter(
      (rule) => !rule.analytical && rule.on,
    ).length
    notRunRows.push({
      label: 'How the model is built',
      count: buildRules > 0 ? `${buildRules} checks` : '',
      why:
        'This copy carries values only. With no formulas left in the ' +
        'file, there is nothing to read about how it was made.',
    })
  }

  const deliverables = page.documents.filter(
    (one) => one.kind === 'deck' || one.kind === 'memo',
  )
  const sources = page.documents.filter((one) => one.kind === 'source')

  const openByDoc = new Map<string, number>()
  for (const finding of findings ?? []) {
    if (finding.state !== 'open') continue
    const id = finding.where.artifact_id
    if (id) openByDoc.set(id, (openByDoc.get(id) ?? 0) + 1)
  }

  const docState = (one: Artifact) => {
    if (one.status === 'failed') return { text: 'Not read', fg: ink.stale }
    if (checkedAt === null || new Date(one.uploaded_at) > new Date(checkedAt))
      return { text: 'Not checked', fg: ink.secondary }
    const open = openByDoc.get(one.id) ?? 0
    if (open > 0)
      return {
        text: `${open} ${open === 1 ? 'difference' : 'differences'}`,
        fg: ink.accent,
      }
    return { text: 'Clean', fg: ink.clean }
  }

  //: The section rows, in the design's order. Each: label · count ·
  //: chevron, expansion on `#fafafc`.
  const sectionRow = (
    key: SectionKey,
    label: string,
    count: string,
    first = false,
  ) => (
    <button
      onClick={() => setSec((was) => (was === key ? null : key))}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        border: 0,
        borderTop: first ? 0 : '.5px solid #eceaec',
        background: 'transparent',
        font: 'inherit',
        cursor: 'pointer',
        padding: '13px 18px 13px 20px',
      }}
    >
      <span
        style={{ flex: 1, minWidth: 0, fontSize: 15, letterSpacing: '-.01em' }}
      >
        {label}
      </span>
      <span style={{ flex: '0 0 auto', fontSize: 14, color: ink.faint }}>
        {count}
      </span>
      {sectionChevron(sec === key)}
    </button>
  )

  const noteReady = (noteText ?? '').trim().length > 2

  //: The report's list: every open finding is one table row, in group
  //: order, numbered the way the export numbers them. A row opens the
  //: modal on its own group and place.
  const openFindings = fails.flatMap((group) => group.findings)
  let rowNumber = 0
  const tableRows = fails.flatMap((group) =>
    group.findings.map((one, index) => {
      rowNumber += 1
      return {
        id: `F-${String(rowNumber).padStart(2, '0')}`,
        finding: one,
        title: one.title,
        figUnit: one.figure ? one.figure_unit : '',
        cat: categoryOf(one),
        where: one.where.detail || one.where.label,
        fig: one.figure,
        tier: tierOf(one),
        open: () => {
          setPicked(group.key)
          setPlace(index)
        },
      }
    }),
  )
  const tierCount = (tier: string) =>
    openFindings.filter((one) => tierOf(one) === tier).length
  const materialCount = tierCount('Material')
  const sevSentence = (['Material', 'Significant', 'Observation'] as const)
    .map((tier) => ({ tier, n: tierCount(tier) }))
    .filter(({ n }) => n > 0)
    .map(
      ({ tier, n }) =>
        //: « thirteen observations », not « thirteen observation » —
        //: material and significant read as adjectives, observation is
        //: a noun and takes its plural.
        `${(WORDS[n] ?? String(n)).toLowerCase()} ${tier.toLowerCase()}${
          tier === 'Observation' && n !== 1 ? 's' : ''
        }`,
    )
    .join(', ')
    .replace(/^./, (c) => c.toUpperCase())

  //: The header's plain state tag — the design's own three words.
  const heroTag = clean
    ? 'Ready to send'
    : stale
      ? 'Recheck needed'
      : never
        ? ''
        : 'Not ready to send'
  const heroTagFg = clean ? '#137a43' : stale ? '#0060d0' : '#c9302c'
  const heroTitle = clean
    ? 'Everything checked passes.'
    : stale
      ? 'The model changed after the last check.'
      : never
        ? 'Not checked yet.'
        : verdictLine
  const heroSub = clean
    ? `Every check passed · ${checkedLower}`
    : stale
      ? `${staleNote(page.stale_kind, page.stale_at)} ${lastVerdict}`
      : never
        ? 'Recheck now runs every check and comes back with a verdict.'
        : sevSentence
          ? `${sevSentence}.${
              materialCount > 0
                ? ' Material findings should clear before the model leaves the deal team.'
                : ''
            }`
          : ''

  //: « Summary of the check » — three sentences at most, each composed
  //: from measured facts and dropped when there is nothing to say.
  const materialSheets = [
    ...new Set(
      openFindings
        .filter((one) => tierOf(one) === 'Material')
        .map((one) => one.where.anchor?.sheet ?? '')
        .filter(Boolean),
    ),
  ]
  const freshTotal = fails.reduce((sum, group) => sum + group.fresh, 0)
  const summaryBullets: string[] = []
  if (!clean && !stale && !never && openFindings.length > 0) {
    summaryBullets.push(
      materialCount > 0
        ? `${WORDS[materialCount] ?? materialCount} of the findings ${
            materialCount === 1 ? 'is' : 'are'
          } material${
            materialSheets.length > 0
              ? `, sitting in ${materialSheets.slice(0, 2).join(' and ')}`
              : ''
          }. A wrong number there changes the price.`
        : 'None of the open findings is material — review them before the model is relied on, but nothing here rewrites the price.',
    )
    if (model !== null)
      summaryBullets.push(
        freshTotal > 0
          ? `${WORDS[freshTotal] ?? freshTotal} arrived with version ${
              model.version
            }, uploaded ${ago(model.uploaded_at)}.${
              accepted > 0 ? ` ${acceptedLine.replace(/^1 /, 'One ')}.` : ''
            }`
          : `None of them is new with version ${model.version} — every one was already open before it.`,
      )
    if (notRunRows.length > 0)
      summaryBullets.push(
        `${WORDS[notRunRows.length] ?? notRunRows.length} check${
          notRunRows.length === 1 ? '' : 's'
        } could not run — ${notRunRows
          .slice(0, 2)
          .map((row) => row.label.toLowerCase())
          .join(
            ', ',
          )}${notRunRows.length > 2 ? ', and more' : ''} — each with its reason below.`,
      )
  }

  //: « Where the findings sit » — sheets ranked by open findings, the
  //: role read from the sheet's own name, nothing guessed beyond it.
  const bySheet = new Map<string, number>()
  for (const one of openFindings) {
    const sheet = one.where.anchor?.sheet ?? ''
    if (sheet) bySheet.set(sheet, (bySheet.get(sheet) ?? 0) + 1)
  }
  const sheetRows = [...bySheet.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, hits]) => ({
      name,
      role: roleOf(name),
      n: `${hits} ${hits === 1 ? 'finding' : 'findings'}`,
    }))
  const totalSheets = Number(model?.counts['sheets'] ?? 0)
  const sheetsNote =
    totalSheets > sheetRows.length && sheetRows.length > 0
      ? `The other ${totalSheets - sheetRows.length} sheets carry no open findings.`
      : ''

  //: The right rail's facts, and the open-findings-by-version bars.
  //: The bars count currently-open findings by the version that was
  //: current when each was first seen — real timestamps, no invention.
  const railItems = [
    {
      k: 'Owner',
      v: model?.uploaded_by?.name ?? page.client ?? '—',
    },
    {
      k: 'Date of latest run',
      v: anyCheckAt
        ? checkedLine(anyCheckAt).replace(/^Checked /, '')
        : 'Never',
    },
    {
      k: 'Version',
      v: model ? `${model.version}, uploaded ${ago(model.uploaded_at)}` : '—',
    },
    { k: 'Standards', v: 'FAST · ICAEW · the model’s own checks' },
    {
      k: 'Coverage',
      v: `${passRows.length + fails.length} checks · ${notRunRows.length} did not run`,
    },
  ]
  const versionsAsc = [...(versions ?? [])].sort(
    (a, b) => a.version - b.version,
  )
  const trendVersions = versionsAsc.slice(-4)
  const trendCounts = trendVersions.map((one, index) => {
    const end =
      index + 1 < trendVersions.length
        ? new Date(trendVersions[index + 1]!.uploaded_at)
        : null
    return {
      v: `v${one.version}`,
      n:
        end === null
          ? openFindings.length
          : openFindings.filter((f) => new Date(f.created_at) < end).length,
    }
  })
  const trendMax = Math.max(1, ...trendCounts.map((t) => t.n))
  //: `String(...)` on the fallback is load-bearing: past the word
  //: list's twelve entries the fallback is a *number*, and a number
  //: has no `.toLowerCase` — which unmounted this whole page on any
  //: model with thirteen or more open findings.
  const trendNote =
    model && freshTotal > 0 && openFindings.length > 0
      ? `${WORDS[freshTotal] ?? freshTotal} of the ${(
          WORDS[openFindings.length] ?? String(openFindings.length)
        ).toLowerCase()} arrived with version ${model.version}.`
      : ''

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
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div
          style={{ width: '100%', display: 'flex', alignItems: 'flex-start' }}
        >
          {/* The report's main column — the founder's Workspace 3
              layout: name and state, the summary in sentences, the
              findings as a table, then where they sit. */}
          <div
            style={{
              flex: '1 1 0',
              minWidth: 0,
              overflow: 'hidden',
              padding: '28px 36px 52px',
            }}
          >
            {/* Name · state tag · version pill. */}
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
                {page.name}
              </span>
              {heroTag && (
                <span
                  style={{
                    flex: '0 0 auto',
                    color: heroTagFg,
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {heroTag}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {model !== null && (
                <button
                  onClick={() =>
                    setSec((was) => (was === 'model' ? null : 'model'))
                  }
                  style={{
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid #e6e6ea',
                    background: 'transparent',
                    borderRadius: 999,
                    padding: '6px 12px',
                    font: 'inherit',
                    fontSize: 13,
                    color: ink.primary,
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
                  >
                    <polyline points="5,9 12,16 19,9" />
                  </svg>
                </button>
              )}
            </div>
            {heroSub && (
              <div
                style={{
                  fontSize: 14,
                  color: '#86868b',
                  lineHeight: 1.55,
                  marginTop: 8,
                  maxWidth: '82ch',
                  textWrap: 'pretty',
                }}
              >
                {heroSub}
              </div>
            )}
            {accepted > 0 && !clean && !stale && !never && (
              <div style={{ fontSize: 13.5, color: '#a1a1a6', marginTop: 6 }}>
                {acceptedLine}
              </div>
            )}

            {/* A values-only copy says so before anything else — the
              fact that decides which checks could speak at all. */}
            {!stale && !never && auditAt !== null && record.values_only && (
              <div
                style={{
                  fontSize: 14.5,
                  color: '#75757a',
                  lineHeight: 1.5,
                  maxWidth: '64ch',
                  padding: '9px 0 0',
                  textWrap: 'pretty',
                }}
              >
                This copy carries values only — the construction checks could
                not read it; the statement checks did.
              </div>
            )}

            {/* Summary of the check — sentences, not counts. */}
            {summaryBullets.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 16.5,
                    fontWeight: 600,
                    letterSpacing: '-.014em',
                    padding: '30px 0 11px',
                  }}
                >
                  Summary of the check
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {summaryBullets.map((text) => (
                    <div key={text} style={{ display: 'flex', gap: 11 }}>
                      <span style={{ flex: '0 0 auto', color: '#c2c2c7' }}>
                        ·
                      </span>
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

            {/* The findings, as the report lists them. */}
            {!stale && !never && tableRows.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 16.5,
                    fontWeight: 600,
                    letterSpacing: '-.014em',
                    padding: '34px 0 2px',
                  }}
                >
                  Findings
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    borderBottom: '1px solid #e6e6ea',
                    padding: '12px 4px 11px',
                  }}
                >
                  <span
                    style={{
                      flex: '1 1 260px',
                      minWidth: 150,
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Finding
                  </span>
                  <span
                    style={{
                      flex: '0 1 176px',
                      minWidth: 96,
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Where
                  </span>
                  <span
                    style={{
                      flex: '0 0 80px',
                      textAlign: 'right',
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Figure
                  </span>
                  <span
                    style={{
                      flex: '0 0 96px',
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Severity
                  </span>
                </div>
                {tableRows.map((row) => (
                  <div
                    key={row.finding.id}
                    onClick={row.open}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px 20px',
                      borderBottom: '1px solid #f2f2f4',
                      padding: '14px 4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flex: '1 1 240px', minWidth: 150 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 14,
                          letterSpacing: '-.008em',
                          lineHeight: 1.4,
                          textWrap: 'pretty',
                        }}
                      >
                        {row.title}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          flexWrap: 'wrap',
                          gap: '2px 8px',
                          marginTop: 3,
                        }}
                      >
                        {row.figUnit && (
                          <span
                            style={{
                              fontSize: 12.5,
                              color: '#a0a0a6',
                              lineHeight: 1.45,
                              textWrap: 'pretty',
                            }}
                          >
                            {row.figUnit}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 12.5,
                            color: '#c2c2c7',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.cat}
                        </span>
                      </span>
                    </span>
                    <span
                      style={{
                        flex: '0 1 176px',
                        minWidth: 96,
                        fontFamily: font.mono,
                        fontSize: 11.5,
                        color: cellRefInk,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.where}
                    </span>
                    <span
                      style={{
                        flex: '0 0 80px',
                        textAlign: 'right',
                        fontSize: 14,
                        color: ink.accent,
                        fontVariantNumeric: 'tabular-nums lining-nums',
                      }}
                    >
                      {row.fig}
                    </span>
                    <span style={{ flex: '0 0 96px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: TIER_BG[row.tier],
                          color: TIER_FG[row.tier],
                          borderRadius: 999,
                          padding: '3px 9px',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.tier}
                      </span>
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Where the findings sit. */}
            {!stale && !never && sheetRows.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 16.5,
                    fontWeight: 600,
                    letterSpacing: '-.014em',
                    padding: '36px 0 2px',
                  }}
                >
                  Where the findings sit
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    borderBottom: '1px solid #e6e6ea',
                    padding: '12px 4px 11px',
                  }}
                >
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Sheet
                  </span>
                  <span
                    style={{
                      flex: '0 1 176px',
                      minWidth: 88,
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Role
                  </span>
                  <span
                    style={{
                      flex: '0 0 140px',
                      textAlign: 'right',
                      fontSize: 12.5,
                      color: '#8e8e93',
                    }}
                  >
                    Findings
                  </span>
                </div>
                {sheetRows.map((row) => (
                  <div
                    key={row.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      borderBottom: '1px solid #f2f2f4',
                      padding: '14px 4px',
                    }}
                  >
                    <span
                      style={{
                        flex: '1 1 auto',
                        minWidth: 0,
                        fontSize: 14,
                        letterSpacing: '-.006em',
                      }}
                    >
                      {row.name}
                    </span>
                    <span
                      style={{
                        flex: '0 1 176px',
                        minWidth: 88,
                        fontSize: 13,
                        color: '#86868b',
                      }}
                    >
                      {row.role}
                    </span>
                    <span
                      style={{
                        flex: '0 0 140px',
                        textAlign: 'right',
                        fontSize: 13,
                        color: '#86868b',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.n}
                    </span>
                  </div>
                ))}
                {sheetsNote && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#a8a8ad',
                      lineHeight: 1.5,
                      padding: '13px 4px 0',
                      maxWidth: '86ch',
                      textWrap: 'pretty',
                    }}
                  >
                    {sheetsNote}
                  </div>
                )}
              </>
            )}

            {/* The sectioned card. */}
            {(passRows.length > 0 ||
              notRunRows.length > 0 ||
              page.decisions.length > 0 ||
              model !== null ||
              deliverables.length > 0 ||
              sources.length > 0) && (
              <div
                style={{
                  marginTop: 44,
                  borderTop: '.5px solid #eceaec',
                }}
              >
                {passRows.length > 0 &&
                  sectionRow(
                    'pass',
                    'Checks that pass',
                    String(passRows.length),
                    true,
                  )}
                {sec === 'pass' && (
                  <div
                    style={{
                      background: '#fafafc',
                      borderTop: '.5px solid #f0eff1',
                    }}
                  >
                    {passRows.map((row, index) => (
                      <div
                        key={row.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderTop: index === 0 ? 0 : '.5px solid #eceaec',
                          padding: '10px 20px 10px 32px',
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14.5,
                            color: '#3a3a3c',
                          }}
                        >
                          {row.name}
                        </span>
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 12.5,
                            color: ink.clean,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {row.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {notRunRows.length > 0 &&
                  sectionRow(
                    'cov',
                    'Checks that did not run',
                    String(notRunRows.length),
                    passRows.length === 0,
                  )}
                {sec === 'cov' && (
                  <div
                    style={{
                      background: '#fafafc',
                      borderTop: '.5px solid #f0eff1',
                    }}
                  >
                    {notRunRows.map((row, index) => (
                      <div
                        key={row.label}
                        style={{
                          borderTop: index === 0 ? 0 : '.5px solid #eceaec',
                          padding: '11px 20px 12px 32px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14.5,
                              color: '#3a3a3c',
                            }}
                          >
                            {row.label}
                          </span>
                          <span
                            style={{
                              flex: '0 0 auto',
                              fontSize: 12.5,
                              color: ink.faint,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {row.count}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: '#a1a1a6',
                            marginTop: 2,
                            textWrap: 'pretty',
                          }}
                        >
                          {row.why}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {page.decisions.length > 0 &&
                  sectionRow(
                    'log',
                    'Evidence locker',
                    String(page.decisions.length),
                    passRows.length === 0 && notRunRows.length === 0,
                  )}
                {sec === 'log' && (
                  <div
                    style={{
                      background: '#fafafc',
                      borderTop: '.5px solid #f0eff1',
                    }}
                  >
                    {page.decisions.map((one: Decision, index) => {
                      const name = one.who?.name ?? 'Someone'
                      return (
                        <div
                          key={one.id}
                          style={{
                            borderTop: index === 0 ? 0 : '.5px solid #f0eff1',
                            padding: '12px 20px 13px 32px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14.5,
                              color: '#3a3a3c',
                              lineHeight: 1.45,
                              textWrap: 'pretty',
                            }}
                          >
                            {/* Their words beat ours, when they gave any. */}
                            {one.note || one.text}
                          </div>
                          <div
                            style={{
                              fontSize: 12.5,
                              color: '#a1a1a6',
                              marginTop: 3,
                            }}
                          >
                            {name} · {ago(one.at)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {model !== null &&
                  sectionRow(
                    'model',
                    'The model',
                    `v${model.version}`,
                    passRows.length === 0 &&
                      notRunRows.length === 0 &&
                      page.decisions.length === 0,
                  )}
                {sec === 'model' && model !== null && (
                  <div
                    style={{
                      background: '#fafafc',
                      borderTop: '.5px solid #f0eff1',
                    }}
                  >
                    <div style={{ padding: '11px 20px 12px 32px' }}>
                      <div style={{ fontSize: 14.5, color: '#3a3a3c' }}>
                        {model.filename}
                      </div>
                      <div
                        style={{ fontSize: 13, color: '#a1a1a6', marginTop: 2 }}
                      >
                        {model.uploaded_by
                          ? `${model.uploaded_by.name} · uploaded ${ago(model.uploaded_at)}`
                          : `Received ${ago(model.uploaded_at)}`}
                      </div>
                    </div>
                    {(versions ?? []).map((one) => (
                      <div
                        key={one.id}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 12,
                          borderTop: '.5px solid #f0eff1',
                          padding: '10px 20px 10px 32px',
                        }}
                      >
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontFamily: font.mono,
                            fontSize: 12,
                            color: ink.secondary,
                          }}
                        >
                          v{one.version}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14,
                            color: '#3a3a3c',
                          }}
                        >
                          {one.uploaded_by
                            ? `Uploaded by ${one.uploaded_by.name}`
                            : 'Received'}
                        </span>
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 12.5,
                            color: '#a1a1a6',
                          }}
                        >
                          {ago(one.uploaded_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {(deliverables.length > 0 || sources.length > 0) &&
                  sectionRow(
                    'docs',
                    'Documents that quote it',
                    String(deliverables.length),
                    passRows.length === 0 &&
                      notRunRows.length === 0 &&
                      page.decisions.length === 0 &&
                      model === null,
                  )}
                {sec === 'docs' && (
                  <div
                    style={{
                      background: '#fafafc',
                      borderTop: '.5px solid #f0eff1',
                    }}
                  >
                    {deliverables.map((one) => {
                      const state = docState(one)
                      return (
                        <button
                          key={one.id}
                          onClick={() => onOpenDoc(one)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            borderTop: '.5px solid #f0eff1',
                            background:
                              openDocId === one.id ? '#f2f2f5' : 'transparent',
                            font: 'inherit',
                            cursor: 'pointer',
                            padding: '11px 20px 11px 32px',
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14.5,
                              color: '#3a3a3c',
                            }}
                          >
                            {one.filename}
                          </span>
                          <span
                            style={{
                              flex: '0 0 auto',
                              fontSize: 13,
                              color: state.fg,
                            }}
                          >
                            {state.text}
                          </span>
                        </button>
                      )
                    })}
                    {sources.map((one) => (
                      <div
                        key={one.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderTop: '.5px solid #f0eff1',
                          padding: '11px 20px 11px 32px',
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14.5,
                            color: '#3a3a3c',
                          }}
                        >
                          {one.filename}
                        </span>
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 13,
                            color: ink.secondary,
                          }}
                        >
                          Read as a source
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Remove — quiet until asked, and never done on one click. */}
            {onRemoved !== undefined && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 14,
                  padding: '26px 0 8px',
                }}
              >
                {!removing ? (
                  <button
                    type="button"
                    onClick={() => setRemoving(true)}
                    style={{
                      border: 0,
                      outline: 'none',
                      background: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: ink.faint,
                    }}
                  >
                    Remove this model from Antford
                  </button>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: ink.secondary }}>
                      Its findings and notes are kept. Remove it?
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        api
                          .removeDeal(dealId)
                          .then(() => onRemoved())
                          .catch(() => setRemoving(false))
                      }
                      style={{
                        border: 0,
                        outline: 'none',
                        background: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        color: ink.danger,
                      }}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(false)}
                      style={{
                        border: 0,
                        outline: 'none',
                        background: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: ink.secondary,
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* The right rail: the run's facts, and the open findings
              by version — counted by when each open finding was first
              seen, real timestamps only. */}
          <div
            style={{
              flex: '0 0 288px',
              alignSelf: 'stretch',
              borderLeft: '1px solid #f0f0f2',
              padding: '34px 28px 44px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {railItems.map((item) => (
              <span
                key={item.k}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  paddingBottom: 22,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: '-.004em',
                  }}
                >
                  {item.k}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: '#86868b',
                    lineHeight: 1.5,
                    textWrap: 'pretty',
                  }}
                >
                  {item.v}
                </span>
              </span>
            ))}
            {trendCounts.length > 1 && (
              <>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: '-.004em',
                    padding: '2px 0 13px',
                  }}
                >
                  Open findings by version
                </span>
                <span
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}
                >
                  {trendCounts.map((bar, index) => (
                    <span
                      key={bar.v}
                      style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          color:
                            index === trendCounts.length - 1
                              ? ink.accent
                              : '#b6b6bc',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {bar.n}
                      </span>
                      <span
                        style={{
                          width: '100%',
                          height: Math.max(
                            6,
                            Math.round((bar.n / trendMax) * 78),
                          ),
                          borderRadius: 3,
                          background:
                            index === trendCounts.length - 1
                              ? ink.accent
                              : '#e4ebf5',
                        }}
                      />
                      <span style={{ fontSize: 11.5, color: '#b6b6bc' }}>
                        {bar.v}
                      </span>
                    </span>
                  ))}
                </span>
                {trendNote && (
                  <span
                    style={{
                      fontSize: 12.5,
                      color: '#a8a8ad',
                      lineHeight: 1.5,
                      paddingTop: 13,
                      textWrap: 'pretty',
                    }}
                  >
                    {trendNote}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* The picked check. */}
      {pickedGroup !== null && shownFinding !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(20,22,26,.24)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 36,
          }}
        >
          <div
            onClick={closeModal}
            style={{ position: 'absolute', inset: 0 }}
          />
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 760,
              maxHeight: '84vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 16,
              boxShadow:
                '0 24px 60px rgba(16,20,28,.24), 0 0 0 .5px rgba(0,0,0,.08)',
              padding: '26px 28px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {/* What is wrong — the mentor's order: what, where, why.
                    The dot is the severity, borrowed from the panel's
                    own severity mark. */}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 17,
                    letterSpacing: '-.016em',
                    lineHeight: 1.3,
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 6px',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        shownFinding.severity === 'error'
                          ? '#ff3b30'
                          : '#e8a33d',
                    }}
                  />
                  {shownFinding.headline || pickedGroup.label}
                </span>
                {/* Where: the cell, then the model's own name for the
                    row — « E41 — Total Senior Debt Service ». */}
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    color: '#a1a1a6',
                    marginTop: 5,
                  }}
                >
                  {[
                    [
                      shownFinding.where.detail || shownFinding.where.label,
                      shownFinding.source.name,
                    ]
                      .filter(Boolean)
                      .join(' — '),
                    pickedGroup.findings.length > 1
                      ? `${pickedGroup.findings.length} places`
                      : '',
                    pickedGroup.standard,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button
                onClick={closeModal}
                title="Close"
                style={{
                  flex: '0 0 auto',
                  border: 0,
                  background: 'transparent',
                  borderRadius: 8,
                  padding: 5,
                  cursor: 'pointer',
                  display: 'flex',
                  color: ink.faint,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <div
              style={{
                fontSize: 15,
                color: '#3a3a3c',
                lineHeight: 1.55,
                marginTop: 14,
                maxWidth: '62ch',
                textWrap: 'pretty',
              }}
            >
              {shownFinding.title}
            </div>

            {/* The design's little Excel grid — the picked place's
                cell in its own neighbourhood. */}
            {shownFinding.grid && <MiniGrid grid={shownFinding.grid} />}

            {/* No place-list here: the findings table already itemizes
                every place as its own row, and the modal repeating them
                read as bloat — the founder's word. The header's
                « N places » stays; the table is the navigation. */}

            {shownFinding.context && (
              <div
                style={{
                  fontSize: 14.5,
                  color: '#3a3a3c',
                  lineHeight: 1.55,
                  marginTop: 18,
                  maxWidth: '62ch',
                  textWrap: 'pretty',
                }}
              >
                {shownFinding.context}
              </div>
            )}

            {/* The consequence, in the model's own words — where the
                cell's value goes, from the dependents walk. */}
            {shownFinding.flow && (
              <div
                style={{
                  fontSize: 14.5,
                  color: '#3a3a3c',
                  lineHeight: 1.55,
                  marginTop: 10,
                  maxWidth: '62ch',
                  textWrap: 'pretty',
                }}
              >
                Flows into {shownFinding.flow}.
              </div>
            )}

            {/* « Says who », spelled out — the engine's sentence for a
                statement check; construction rules keep their short
                citation in the header line. */}
            {shownFinding.standard_sentence && (
              <div
                style={{
                  fontSize: 13,
                  color: '#a1a1a6',
                  lineHeight: 1.5,
                  marginTop: 14,
                  maxWidth: '62ch',
                  textWrap: 'pretty',
                }}
              >
                {shownFinding.standard_sentence}
              </div>
            )}

            {noteText === null ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                {/* « Open the cell » — the real document, not another
                    view of the grid. A SharePoint-synced model opens as
                    the actual workbook on the site; an uploaded one
                    downloads the exact stored version, because no live
                    document exists anywhere else. Excel's own green,
                    with the mark beside it. */}
                {model !== null &&
                  shownFinding.where.artifact_id === model.id && (
                    <button
                      onClick={() => {
                        api
                          .openArtifact(
                            model.id,
                            shownFinding.source.ref ??
                              shownFinding.where.detail,
                          )
                          .then((answer) => window.open(answer.url, '_blank'))
                          .catch(() => undefined)
                        closeModal()
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        border: 0,
                        background: '#107c41',
                        color: '#fff',
                        borderRadius: 9,
                        padding: '9px 16px',
                        font: 'inherit',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={excelLogo}
                        alt=""
                        width={16}
                        height={16}
                        style={{ display: 'block' }}
                      />
                      Open the cell
                    </button>
                  )}
                {/* « Fix the cell » — only where the fix is derivable:
                    the row's own formula goes back, as a new version,
                    verified cell by cell before it is kept. */}
                {shownFinding.fix && (
                  <button
                    onClick={() => fixCell(shownFinding)}
                    disabled={saving}
                    style={{
                      ...greyButton,
                      borderRadius: 9,
                      padding: '9px 16px',
                      fontSize: 14,
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Fix the cell
                  </button>
                )}
                <button
                  onClick={() => setNoteText('')}
                  style={{
                    ...greyButton,
                    borderRadius: 9,
                    padding: '9px 16px',
                    fontSize: 14,
                  }}
                >
                  Accept with a note
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13.5, color: ink.secondary }}>
                  Why is this acceptable? The note is kept with the model and
                  shown to whoever opens it next.
                </div>
                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  onFocus={() => setNoteGlow(true)}
                  onBlur={() => setNoteGlow(false)}
                  rows={3}
                  autoFocus
                  style={{
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                    marginTop: 10,
                    resize: 'none',
                    border: 0,
                    background: '#f5f5f7',
                    borderRadius: 10,
                    padding: '12px 13px',
                    font: 'inherit',
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    color: ink.primary,
                    outline: 'none',
                    boxShadow: noteGlow ? inputGlow : 'none',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <button
                    onClick={() =>
                      noteReady && !saving && acceptFinding(shownFinding, noteText)
                    }
                    style={{
                      border: 0,
                      background: noteReady && !saving ? ink.accent : '#c9d6e8',
                      color: '#fff',
                      borderRadius: 9,
                      padding: '9px 16px',
                      font: 'inherit',
                      fontSize: 14,
                      cursor: noteReady && !saving ? 'pointer' : 'default',
                    }}
                  >
                    {saving ? 'Accepting' : 'Accept and close'}
                  </button>
                  <button
                    onClick={() => setNoteText(null)}
                    style={{
                      ...greyButton,
                      borderRadius: 9,
                      padding: '9px 16px',
                      fontSize: 14,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export report — one page a bid director can forward without
          editing it. Export opens the browser's own print-to-PDF over
          a clean print view; a server-rendered PDF is a named next
          step, not something this pretends to be. */}
      {reportOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(16,20,28,.3)',
            padding: 24,
          }}
        >
          <div
            onClick={() => setReportOpen(false)}
            style={{ position: 'absolute', inset: 0 }}
          />
          <div
            style={{
              position: 'relative',
              width: 'min(560px,100%)',
              maxHeight: '86vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              borderRadius: 18,
              boxShadow:
                '0 30px 70px rgba(0,0,0,.28), 0 0 0 .5px rgba(0,0,0,.08)',
              overflow: 'hidden',
            }}
          >
            <div style={{ flex: '0 0 auto', padding: '24px 26px 0' }}>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 500,
                  letterSpacing: '-.02em',
                }}
              >
                Findings report
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: '#86868b',
                  marginTop: 3,
                  textWrap: 'pretty',
                }}
              >
                One page a bid director can forward without editing it.
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                padding: '18px 26px 4px',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  boxShadow: '0 0 0 .5px rgba(0,0,0,.09)',
                  padding: '18px 20px',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Bodoni Moda',Didot,Georgia,serif",
                    fontSize: 17,
                  }}
                >
                  {page.name}
                  {model ? `, version ${model.version}` : ''}
                </div>
                <div style={{ fontSize: 13, color: '#86868b', marginTop: 3 }}>
                  Readiness report · prepared{' '}
                  {new Date().toLocaleString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  · Antford
                </div>
                <div style={{ fontSize: 14.5, marginTop: 14 }}>
                  {passRows.length} checks pass. {fails.length} don&apos;t.{' '}
                  {notRunRows.length} did not run.
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 7,
                    marginTop: 14,
                    borderTop: '.5px solid #eceaec',
                    paddingTop: 14,
                  }}
                >
                  {tableRows.slice(0, 6).map((row) => (
                    <div
                      key={row.finding.id}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13.5,
                          color: '#3a3a3c',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.finding.headline || row.title}
                      </span>
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 11.5,
                          color: '#86868b',
                        }}
                      >
                        {row.finding.standard ?? ''}
                      </span>
                      <span
                        style={{
                          flex: '0 0 92px',
                          textAlign: 'right',
                          fontFamily: font.mono,
                          fontSize: 12,
                          color: '#86868b',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.where}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  color: '#86868b',
                  padding: '20px 4px 8px',
                }}
              >
                Include
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  boxShadow: '0 0 0 .5px rgba(0,0,0,.09)',
                  overflow: 'hidden',
                }}
              >
                {[
                  `The ${tableRows.length} findings, with their cells`,
                  `The ${passRows.length} checks that pass`,
                  'What was not checked, and why',
                  'The evidence locker',
                ].map((label, index) => {
                  const on = reportOff.indexOf(label) === -1
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        setReportOff((was) =>
                          was.indexOf(label) === -1
                            ? was.concat(label)
                            : was.filter((one) => one !== label),
                        )
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        borderTop: index === 0 ? 0 : '.5px solid #f0eff1',
                        background: 'transparent',
                        font: 'inherit',
                        cursor: 'pointer',
                        padding: '12px 15px',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 19px',
                          width: 19,
                          height: 19,
                          borderRadius: '50%',
                          background: on ? ink.accent : 'transparent',
                          boxShadow: `inset 0 0 0 1.5px ${on ? ink.accent : '#d4d4d8'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                        }}
                      >
                        {on && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="5,12.5 10,17.5 19,6.5" />
                          </svg>
                        )}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                gap: 9,
                padding: '18px 26px 22px',
              }}
            >
              <button
                onClick={() => setReportOpen(false)}
                style={{
                  flex: 1,
                  border: 0,
                  background: '#f0f0f2',
                  borderRadius: 11,
                  padding: 12,
                  font: 'inherit',
                  fontSize: 15,
                  fontWeight: 500,
                  color: ink.primary,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const off = new Set(reportOff)
                  const wantFindings = !off.has(
                    `The ${tableRows.length} findings, with their cells`,
                  )
                  const wantPasses = !off.has(
                    `The ${passRows.length} checks that pass`,
                  )
                  const wantNotRun = !off.has('What was not checked, and why')
                  const wantLocker = !off.has('The evidence locker')
                  const esc = (text: string) =>
                    text
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                  const rows = tableRows
                    .map(
                      (row) =>
                        `<tr><td class="id">${row.id}</td><td>${esc(row.title)}${
                          row.figUnit
                            ? `<div class="sub">${esc(row.fig)} — ${esc(row.figUnit)}</div>`
                            : ''
                        }</td><td class="mono">${esc(row.where)}</td><td>${row.tier}</td><td class="sub">${esc(
                          row.finding.standard ?? '',
                        )}</td></tr>`,
                    )
                    .join('')
                  const passes = passRows
                    .map(
                      (row) =>
                        `<tr><td>${esc(row.name)}</td><td class="sub">${esc(row.count)}</td></tr>`,
                    )
                    .join('')
                  const notRun = notRunRows
                    .map(
                      (row) =>
                        `<tr><td>${esc(row.label)}</td><td class="sub">${esc(row.why)}</td></tr>`,
                    )
                    .join('')
                  const locker = page.decisions
                    .map(
                      (one: Decision) =>
                        `<tr><td>${esc(one.note || one.text)}</td><td class="sub">${esc(
                          one.who?.name ?? 'Someone',
                        )} · ${esc(ago(one.at))}</td></tr>`,
                    )
                    .join('')
                  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(page.name)} — findings report</title>
<style>body{font:14px/1.5 -apple-system,'Segoe UI',sans-serif;color:#1d1d1f;margin:40px auto;max-width:720px;padding:0 24px}
h1{font-family:Didot,'Bodoni MT',Georgia,serif;font-weight:500;font-size:24px;margin:0}
.meta{color:#6b6b70;font-size:13px;margin-top:4px}.verdict{margin:18px 0 6px;font-size:15px}
h2{font-size:15px;margin:26px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px}
td{border-top:1px solid #eee;padding:8px 10px 8px 0;vertical-align:top}
.id{color:#9a9aa0;font-family:ui-monospace,monospace;font-size:11px;white-space:nowrap}
.mono{font-family:ui-monospace,monospace;font-size:11.5px;color:#107c41;white-space:nowrap}
.sub{color:#6b6b70;font-size:12px}
@media print{body{margin:0 auto}}</style></head><body>
<h1>${esc(page.name)}${model ? `, version ${model.version}` : ''}</h1>
<div class="meta">Readiness report · prepared ${new Date().toLocaleString('en-GB')} · Antford</div>
<div class="verdict">${passRows.length} checks pass. ${fails.length} don't. ${notRunRows.length} did not run.</div>
${wantFindings && rows ? `<h2>Findings</h2><table>${rows}</table>` : ''}
${wantPasses && passes ? `<h2>Checks that pass</h2><table>${passes}</table>` : ''}
${wantNotRun && notRun ? `<h2>Checks that did not run</h2><table>${notRun}</table>` : ''}
${wantLocker && locker ? `<h2>Evidence locker</h2><table>${locker}</table>` : ''}
</body></html>`
                  const win = window.open('', '_blank')
                  if (win) {
                    win.document.write(doc)
                    win.document.close()
                    win.focus()
                    win.print()
                  }
                  setReportOpen(false)
                }}
                style={{
                  flex: 1,
                  border: 0,
                  background: ink.accent,
                  borderRadius: 11,
                  padding: 12,
                  font: 'inherit',
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Export PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

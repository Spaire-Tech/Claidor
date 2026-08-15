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
 * - The modal's little Excel grid is the design's demo prop — the
 *   server does not ship a cell's neighbours. The modal shows the
 *   finding's own sentences instead, and lists the cells when a check
 *   fails at more than one (rows composed from the section-expansion
 *   idiom).
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
  HouseRules,
  TieOutApi,
  Version,
} from './../api'
import {
  cardRing,
  cardRingHover,
  cellRefInk,
  figureInk,
  font,
  greyButton,
  ink,
  inputGlow,
  listCard,
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
  'model-own-check': 'rows',
  'time-axis': 'sheets',
}

/** The tie-out's rule key is the empty string; its face needs words. */
const TIEOUT_LABEL = 'Documents disagree with the model'

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
  onChecking: (running: boolean) => void
  openDocId: string | null
  onOpenDoc: (doc: Artifact) => void
  /** The model was removed — the shell goes back to the list. */
  onRemoved?: () => void
}

export const DealPage = ({
  api,
  dealId,
  checkNonce,
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
      const worst = analytical
        ? [...group].sort((a, b) => magnitude(b) - magnitude(a))[0]!
        : group[0]!
      const figure =
        analytical && worst.figure ? worst.figure : String(group.length)
      const figureUnit =
        analytical && worst.figure
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
        label:
          key === '' ? TIEOUT_LABEL : (catalogue.get(key) ?? humanize(key)),
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

  const closeModal = () => {
    setPicked(null)
    setNoteText(null)
  }

  const acceptGroup = (group: FailGroup, note: string) => {
    setSaving(true)
    Promise.all(
      group.findings.map((one) => api.dismiss(one.id, 'accepted', note)),
    )
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

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: well,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '28px 40px 40px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1060,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* The verdict. */}
          <div style={{ padding: '4px 6px 2px' }}>
            {clean && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#34c759"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 17px' }}
                  >
                    <polyline points="5,12.5 10,17.5 19,6.5" />
                  </svg>
                  <span
                    style={{
                      fontSize: 21,
                      letterSpacing: '-.02em',
                      lineHeight: 1.2,
                    }}
                  >
                    Everything checked passes.
                  </span>
                </div>
                <div
                  style={{ fontSize: 14.5, color: ink.secondary, marginTop: 7 }}
                >
                  Every check passed · {checkedLower}
                </div>
              </>
            )}
            {!clean && stale && (
              <>
                <div
                  style={{
                    fontSize: 21,
                    letterSpacing: '-.02em',
                    lineHeight: 1.2,
                  }}
                >
                  The model changed after the last check.
                </div>
                <div
                  style={{
                    fontSize: 14.5,
                    color: ink.secondary,
                    marginTop: 7,
                    textWrap: 'pretty',
                  }}
                >
                  {staleNote(page.stale_kind, page.stale_at)} {lastVerdict}
                </div>
              </>
            )}
            {!clean && !stale && never && (
              //: A face the design does not draw: nothing has run, so
              //: neither pass nor fail may be claimed. Quiet words in
              //: the verdict's own type.
              <>
                <div
                  style={{
                    fontSize: 21,
                    letterSpacing: '-.02em',
                    lineHeight: 1.2,
                  }}
                >
                  Not checked yet.
                </div>
                <div
                  style={{ fontSize: 14.5, color: ink.secondary, marginTop: 7 }}
                >
                  Recheck now runs every check and comes back with a verdict.
                </div>
              </>
            )}
            {!clean && !stale && !never && (
              <>
                <div
                  style={{
                    fontSize: 21,
                    letterSpacing: '-.02em',
                    lineHeight: 1.2,
                  }}
                >
                  {verdictLine}
                </div>
                {accepted > 0 && (
                  <div style={{ fontSize: 14, color: '#a1a1a6', marginTop: 7 }}>
                    {acceptedLine}
                  </div>
                )}
              </>
            )}
          </div>

          {/* A values-only copy says so before any card — the fact
              that decides which checks could speak at all. */}
          {!stale && !never && auditAt !== null && record.values_only && (
            <div
              style={{
                fontSize: 14.5,
                color: '#75757a',
                lineHeight: 1.5,
                maxWidth: '64ch',
                padding: '9px 2px 0',
                textWrap: 'pretty',
              }}
            >
              This copy carries values only — the construction checks could not
              read it; the statement checks did.
            </div>
          )}

          {/* The failing checks, in the v2 design's two families. The
              tie-out's card — documents disagreeing with the model — is
              neither construction nor statements, so it keeps the v1
              untitled grid above both (the design draws no section for
              it; nearest pattern, not an invention). */}
          {!clean && !stale && !never && (
            <>
              {fails.some((one) => one.key === '') && (
                <div style={{ ...failGrid, marginTop: 18 }}>
                  {fails
                    .filter((one) => one.key === '')
                    .map((group) => (
                      <FailCard
                        key={group.key}
                        figure={group.figure}
                        figureUnit={group.figureUnit}
                        label={group.label}
                        where={group.where}
                        tag={group.fresh > 0 ? 'New' : ''}
                        onPick={() => setPicked(group.key)}
                      />
                    ))}
                </div>
              )}
              {fails.some((one) => one.key !== '' && !one.analytical) && (
                <>
                  {failHead('How the model is built', true)}
                  <div style={failGrid}>
                    {fails
                      .filter((one) => one.key !== '' && !one.analytical)
                      .map((group) => (
                        <FailCard
                          key={group.key}
                          figure={group.figure}
                          figureUnit={group.figureUnit}
                          label={group.label}
                          where={group.where}
                          tag={group.fresh > 0 ? 'New' : ''}
                          onPick={() => setPicked(group.key)}
                        />
                      ))}
                  </div>
                </>
              )}
              {fails.some((one) => one.analytical) && (
                <>
                  {failHead('Whether the accounts add up', false)}
                  <div style={failGrid}>
                    {fails
                      .filter((one) => one.analytical)
                      .map((group) => (
                        <FailCard
                          key={group.key}
                          figure={group.figure}
                          figureUnit={group.figureUnit}
                          label={group.label}
                          where={group.where}
                          tag={group.fresh > 0 ? 'New' : ''}
                          onPick={() => setPicked(group.key)}
                        />
                      ))}
                  </div>
                </>
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
                ...listCard,
                borderRadius: 14,
                overflow: 'hidden',
                marginTop: 22,
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
      </div>

      {/* The picked check. */}
      {pickedGroup !== null && (
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
                <span
                  style={{
                    display: 'block',
                    fontSize: 17,
                    letterSpacing: '-.016em',
                    lineHeight: 1.3,
                  }}
                >
                  {pickedGroup.label}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    color: '#a1a1a6',
                    marginTop: 5,
                  }}
                >
                  {[
                    pickedGroup.standard,
                    pickedGroup.findings.length === 1
                      ? pickedGroup.findings[0]!.where.detail ||
                        pickedGroup.findings[0]!.where.label
                      : `${pickedGroup.findings.length} places`,
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
              {pickedGroup.findings[0]!.title}
            </div>

            {pickedGroup.findings.length > 1 && (
              //: The design's modal draws one cell; a check that fails
              //: at many gets its places as rows, in the section
              //: expansions' own idiom.
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: '0 0 0 .5px rgba(0,0,0,.08)',
                }}
              >
                {pickedGroup.findings.map((one, index) => (
                  <div
                    key={one.id}
                    style={{
                      background: '#fafafc',
                      borderTop: index === 0 ? 0 : '.5px solid #f0eff1',
                      padding: '10px 14px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        color: '#3a3a3c',
                        textWrap: 'pretty',
                      }}
                    >
                      {one.title}
                    </div>
                    <div
                      style={{ fontSize: 12.5, color: '#a1a1a6', marginTop: 2 }}
                    >
                      {one.where.detail || one.where.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pickedGroup.findings[0]!.context && (
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
                {pickedGroup.findings[0]!.context}
              </div>
            )}

            {/* « Says who », spelled out — the engine's sentence for a
                statement check; construction rules keep their short
                citation in the header line. */}
            {pickedGroup.findings[0]!.standard_sentence && (
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
                {pickedGroup.findings[0]!.standard_sentence}
              </div>
            )}

            {noteText === null ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
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
                      noteReady && !saving && acceptGroup(pickedGroup, noteText)
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
    </div>
  )
}

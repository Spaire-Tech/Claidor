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
 * - « Download the marked-up model » is live: the server builds the
 *   workbook copy on request — problem cells coloured and noted,
 *   nothing altered — and refusals surface as the server's own
 *   sentence in the card.
 * - Version rows in the dropdown are buttons, as drawn: picking an
 *   older upload re-scopes Overview and Findings to *that* version —
 *   the audit re-run on its stored cells, computed on request and
 *   persisted nowhere. Those findings carry no durable identity, so
 *   the row actions (fix, dismiss, open) give way to the sentence
 *   saying rulings live on the current version; the report sheet and
 *   the marked-up download stay the current version's and say so.
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
  Coverage,
  DealListItem,
  DealPage as DealPageData,
  DeckDelta,
  Finding,
  Link,
  RecalcMark,
  TieOutApi,
  Version,
  VersionAudit,
  VersionDelta,
} from '../api'
import { fileIcon, font, ink } from '../design'
import { categoryOfKey } from '../files'

/** Material · Significant · Observation, from the attention tier. */
export const sevOf = (f: Finding): 1 | 2 | 3 => {
  const t = f.tier
  if (t === 1 || t === 2 || t === 3) return t
  return f.severity === 'error' ? 1 : 3
}
const SEV_WORD = { 1: 'Material', 2: 'Significant', 3: 'Observation' } as const
const SEV_DOT = { 1: '#e0322d', 2: '#e8a300', 3: '#2b6cf5' } as const

/** The Watch's eight classes, in the screen's words — the same
 *  attention inks the rest of the workspace uses: red for a defect,
 *  amber for an assumption or method at risk, blue for information,
 *  green for a repair, grey for structure. */
/** A count with its thousands grouped, for anything a person reads on
 *  a printed page. Non-numbers pass through as they came. */
const grouped = (value: unknown): string =>
  typeof value === 'number' ? value.toLocaleString() : String(value ?? '')

//: The deck-delta panel's own quiet line — loading, and the server's
//: refusal sentence when a version's bytes were dropped.
const deckNote: React.CSSProperties = {
  padding: '18px 4px 0',
  fontSize: 13.5,
  color: '#77808c',
  lineHeight: 1.55,
}

const DELTA_KIND = {
  new_defect: { word: 'New defect', dot: '#e0322d' },
  class_change: { word: 'Changed class', dot: '#e0322d' },
  relabelled_line: { word: 'Relabelled line', dot: '#2b6cf5' },
  methodology_change: { word: 'Methodology change', dot: '#e8a300' },
  moved_assumption: { word: 'Assumption moved', dot: '#e8a300' },
  //: The Watch's C3 pair, merged in the seventeenth sweep: a cell that
  //: was empty now holds a value, and a cell that held one is now
  //: empty. Emptying carries the amber of an assumption at risk — a
  //: removed input changes an answer silently; filling is information.
  emptied_cell: { word: 'Cell emptied', dot: '#e8a300' },
  filled_cell: { word: 'Cell filled', dot: '#2b6cf5' },
  material_output: { word: 'Output moved', dot: '#2b6cf5' },
  structure: { word: 'Structure', dot: '#8f96a0' },
  repaired_defect: { word: 'Repaired', dot: '#1f8a4c' },
} as const

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
  const [tab, setTab] = useState<
    'Overview' | 'Findings' | 'Versions' | 'Sources'
  >('Overview')
  const [srcView, setSrcView] = useState<'map' | 'list'>('map')
  const [sev, setSev] = useState<0 | 1 | 2 | 3>(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [verOpen, setVerOpen] = useState(false)
  //: The picked version, when it is not the current one. Null means
  //: the page speaks about the current version, as it always did.
  const [pastVer, setPastVer] = useState<number | null>(null)
  //: The Versions tab: which revision's delta is open (the new side's
  //: artifact id), and every delta computed so far — cached, because
  //: the server computes each one fresh from the stored bytes. A
  //: string value that is not 'loading' is the server's own refusal
  //: sentence, shown as it stands.
  const [deltaFor, setDeltaFor] = useState<string | null>(null)
  const [deltas, setDeltas] = useState<
    Record<
      string,
      VersionDelta | null | 'loading' | 'identical' | { refused: string }
    >
  >({})
  //: The same revision's effect on what was *sent out* — the deck tied
  //: out against both versions. Cached the same way and for the same
  //: reason: three files are read to answer it.
  const [deckDeltas, setDeckDeltas] = useState<
    Record<string, DeckDelta | null | 'loading' | { refused: string }>
  >({})
  //: Version audits by artifact id — computed server-side on request,
  //: cached here so re-picking a version does not re-run it.
  const [pastAudits, setPastAudits] = useState<
    Record<string, VersionAudit | 'loading' | 'failed'>
  >({})
  const [checking, setChecking] = useState(false)
  const [repOpen, setRepOpen] = useState(false)
  const [markingUp, setMarkingUp] = useState(false)
  //: The marked-up download's word to the person — the server's own
  //: refusal sentence, shown as it stands; null when all is well.
  const [markupWord, setMarkupWord] = useState<string | null>(null)
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

  //: The marked-up model: the server builds the copy on request and
  //: this hands it to the browser as a download. A refusal (no model,
  //: nothing open to mark up) is the server's own sentence, shown in
  //: the card's subtitle as it stands.
  const downloadMarkup = () => {
    if (markingUp) return
    setMarkingUp(true)
    setMarkupWord(null)
    api
      .markedUpModel(deal.id)
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch((problem: unknown) => {
        setMarkupWord(
          problem instanceof Error ? problem.message : 'something went wrong',
        )
      })
      .finally(() => setMarkingUp(false))
  }

  //: The Versions tab's selection: fetch a revision's delta once and
  //: keep it. The server computes fresh from the stored bytes; a
  //: refusal (bytes dropped under the retention policy) is its own
  //: sentence, kept and shown as it stands.
  //: Two uploads with the same digest are the same file, so there is
  //: nothing to compare and no reason to ask. Measured, this is what
  //: it saves: the server spends **158 seconds** on a 432,596-cell
  //: model to conclude that a re-upload changed nothing — 58 of them
  //: reading the two files and most of the rest aligning two large
  //: sheets against themselves. Identical bytes are identical
  //: workbooks, so the answer is exact rather than quick.
  //:
  //: A version uploaded before the digest was recorded has none, and
  //: is compared as before: two absences are not a match.
  const sameFileAsBefore = useCallback(
    (artifactId: string): boolean => {
      const ordered = [...(versions ?? [])].sort(
        (a, b) => a.version - b.version,
      )
      const at = ordered.findIndex((one) => one.id === artifactId)
      if (at <= 0) return false
      const mine = ordered[at]?.counts?.['sha256']
      const before = ordered[at - 1]?.counts?.['sha256']
      return typeof mine === 'string' && mine.length > 0 && mine === before
    },
    [versions],
  )

  const selectDelta = useCallback(
    (artifactId: string) => {
      setDeltaFor(artifactId)
      if (sameFileAsBefore(artifactId)) {
        setDeltas((held) =>
          artifactId in held ? held : { ...held, [artifactId]: 'identical' },
        )
        setDeckDeltas((held) =>
          artifactId in held ? held : { ...held, [artifactId]: null },
        )
        return
      }
      setDeltas((held) => {
        if (artifactId in held) return held
        api
          .versionDelta(artifactId)
          .then((got) => setDeltas((now) => ({ ...now, [artifactId]: got })))
          .catch((problem: unknown) =>
            setDeltas((now) => ({
              ...now,
              [artifactId]: {
                refused:
                  problem instanceof Error
                    ? problem.message
                    : 'something went wrong',
              },
            })),
          )
        return { ...held, [artifactId]: 'loading' }
      })
      setDeckDeltas((held) => {
        if (artifactId in held) return held
        api
          .deckDelta(artifactId)
          .then((got) =>
            setDeckDeltas((now) => ({ ...now, [artifactId]: got })),
          )
          .catch((problem: unknown) =>
            setDeckDeltas((now) => ({
              ...now,
              [artifactId]: {
                refused:
                  problem instanceof Error
                    ? problem.message
                    : 'something went wrong',
              },
            })),
          )
        return { ...held, [artifactId]: 'loading' }
      })
    },
    [api, sameFileAsBefore],
  )
  //: Opening the tab lands on the newest revision without a click —
  //: « what did the last upload do » is the question the tab answers.
  //: Deferred a tick so the selection's setState never runs
  //: synchronously inside the effect (the cascading-render lint rule).
  useEffect(() => {
    if (tab !== 'Versions' || deltaFor !== null) return
    const newest = (versions ?? [])
      .slice()
      .sort((a, b) => b.version - a.version)[0]
    if (!newest) return
    const handle = setTimeout(() => selectDelta(newest.id), 0)
    return () => clearTimeout(handle)
  }, [tab, versions, deltaFor, selectDelta])

  //: Picking a version. The current one returns the page to its
  //: ordinary self; an older one fetches that version's audit — the
  //: server computes it from the version's stored cells and persists
  //: nothing — once, and re-scopes Overview and Findings to it.
  const pickVersion = (v: Version) => {
    setVerOpen(false)
    if (!model || v.version === model.version) {
      setPastVer(null)
      return
    }
    setPastVer(v.version)
    const held = pastAudits[v.id]
    if (!held || held === 'failed') {
      setPastAudits((s) => ({ ...s, [v.id]: 'loading' }))
      api
        .versionAudit(v.id)
        .then((got) => setPastAudits((s) => ({ ...s, [v.id]: got })))
        .catch(() => setPastAudits((s) => ({ ...s, [v.id]: 'failed' })))
    }
  }

  //: Re-check: the real run, polled until it lands. The button reads
  //: « Checking » while it does — the chip carries the state. A check
  //: is an act on the current version, so the page returns to it.
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)
  const reCheck = () => {
    if (checking) return
    setPastVer(null)
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

  //: The picked version's artifact and its computed audit. `null`
  //: everywhere while the page speaks about the current version.
  const pastArtifact = useMemo(
    () =>
      pastVer !== null && model && pastVer !== model.version
        ? ((versions ?? []).find((one) => one.version === pastVer) ?? null)
        : null,
    [pastVer, model, versions],
  )
  const past = pastArtifact ? (pastAudits[pastArtifact.id] ?? null) : null
  const viewingPast = pastArtifact !== null
  const pastData = typeof past === 'object' && past !== null ? past : null
  const pastReady = pastData !== null

  const openCurrent = useMemo(
    () => (findings ?? []).filter((one) => one.state === 'open'),
    [findings],
  )
  //: What the page speaks about — the current findings, or the picked
  //: version's freshly computed ones. Every count, chip and family
  //: group downstream reads this and re-scopes with it.
  const open = useMemo(
    () => (viewingPast ? (pastData ? pastData.findings : []) : openCurrent),
    [viewingPast, pastData, openCurrent],
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
  const checkedAt = viewingPast
    ? (pastData?.checked_at ?? null)
    : (lastRun?.finished_at ?? deal.checked_at)

  //: The verdict chip. « Not ready to send » is the drawn state; the
  //: others are real states the demo data never shows, in the page's
  //: own inks — never-checked muted, clean green.
  const verdict =
    viewingPast && past === 'failed'
      ? { text: 'Could not check this version', fg: '#9aa1ab' }
      : checking || (viewingPast && !pastReady)
        ? { text: 'Checking', fg: '#6b7280' }
        : !checkedAt
          ? { text: 'Not checked yet', fg: '#9aa1ab' }
          : counts[1] > 0
            ? { text: 'Not ready to send', fg: '#c8790a' }
            : open.length > 0
              ? { text: 'Findings open', fg: '#c8790a' }
              : { text: 'Nothing failing', fg: '#1f8a4c' }

  //: A values-pasted copy — the published-model case the real corpus
  //: is full of — must say so on the *landing* screen too. It said it
  //: on the report and on the document panel, and here, where a person
  //: arrives, it said « Nothing failing » over « Every check that
  //: applies to this model ran to the end » on a file where 224 of
  //: 432,596 cells held a formula.
  const blindCopy = viewingPast
    ? Boolean(pastData?.summary.values_only)
    : lastRun
      ? auditRecord(lastRun).values_only
      : false
  const blindSaid = (() => {
    const f = model?.counts['formulas']
    const c = model?.counts['cells']
    const numbers =
      typeof f === 'number' && typeof c === 'number'
        ? ` — ${f.toLocaleString()} of ${c.toLocaleString()} cells hold a formula —`
        : ''
    return `This copy carries values only${numbers} so the rules that read how the model is built could not see it. The checks that read values still ran.`
  })()

  //: « Five material, five significant, one observation. » — the
  //: sentence under the title, from the real counts.
  const sevSentence =
    viewingPast && past === 'failed'
      ? 'This version could not be checked — its stored cells did not answer. The current version is unaffected.'
      : viewingPast && !pastReady
        ? `Checking version ${pastVer} on the cells stored at its upload.`
        : !checkedAt
          ? 'This model has not been checked. Re-check reads every sheet and reports what it finds.'
          : open.length === 0
            ? `Nothing failing as of ${when(checkedAt).toLowerCase()}${
                blindCopy ? ' — but little could be checked' : ''
              }.`
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
    if (viewingPast && pastArtifact)
      out.push(
        `This is version ${pastArtifact.version}, uploaded ${when(pastArtifact.uploaded_at).toLowerCase()}${
          pastArtifact.uploaded_by ? ` by ${pastArtifact.uploaded_by.name}` : ''
        }, checked just now on the cells stored at its upload.` +
          (model
            ? ` Rulings and corrections are recorded on the current version (v${model.version}).`
            : ''),
      )
    else if (model)
      out.push(
        `The current model is version ${model.version}, uploaded ${when(model.uploaded_at).toLowerCase()}.${
          deal.stale ? ' Files changed after the last check.' : ''
        }`,
      )
    const abstentions = viewingPast
      ? (pastData?.summary.abstentions ?? null)
      : lastRun
        ? auditRecord(lastRun).abstentions
        : null
    if (abstentions && abstentions.length > 0)
      out.push(
        `${word(abstentions.length)} check${
          abstentions.length === 1 ? '' : 's'
        } could not run: ${abstentions
          .slice(0, 2)
          .map((one) => one.why)
          .join('; ')}${abstentions.length > 2 ? '; and more' : ''}.`,
      )
    else if (abstentions && !blindCopy)
      out.push('Every check that applies to this model ran to the end.')
    if (blindCopy) out.push(blindSaid)
    return out
  }, [
    checkedAt,
    counts,
    open,
    model,
    deal.stale,
    lastRun,
    viewingPast,
    pastArtifact,
    pastData,
    blindCopy,
    blindSaid,
  ])

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
          {(['Overview', 'Findings', 'Versions', 'Sources'] as const).map(
            (label) => {
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
            },
          )}
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
                      <span>Version {pastVer ?? model.version}</span>
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
                                //: Buttons, as drawn: picking a version
                                //: re-scopes Overview and Findings to it —
                                //: the audit re-run on its stored cells,
                                //: persisted nowhere.
                                <button
                                  key={v.id}
                                  onClick={() => pickVersion(v)}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '44px 1fr auto',
                                    gap: 14,
                                    alignItems: 'center',
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 0,
                                    borderTop:
                                      i === 0
                                        ? 0
                                        : '.5px solid rgba(16,22,35,.06)',
                                    background:
                                      v.version === (pastVer ?? model.version)
                                        ? 'rgba(0,96,208,.045)'
                                        : 'transparent',
                                    font: 'inherit',
                                    cursor: 'pointer',
                                    padding: '0 18px',
                                    minHeight: 58,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: font.mono,
                                      fontSize: 12.5,
                                      color:
                                        v.version === (pastVer ?? model.version)
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
                                </button>
                              ))}
                          </span>
                          {/* The design's own verAll intent: the
                              dropdown opens the Versions tab, where the
                              Watch reports what each revision did. */}
                          <button
                            onClick={() => {
                              setVerOpen(false)
                              setTab('Versions')
                            }}
                            style={{
                              border: 0,
                              background: 'transparent',
                              font: 'inherit',
                              fontSize: 14,
                              letterSpacing: '-.01em',
                              color: '#0060d0',
                              cursor: 'pointer',
                              padding: '12px 8px 6px',
                              textAlign: 'left',
                            }}
                          >
                            See all versions
                          </button>
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
                      {viewingPast && model
                        ? `Every finding written out in plain English. On the current version (v${model.version}).`
                        : 'Every finding written out in plain English.'}
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
              {/* The workbook copy with problem cells coloured and
                  noted — generated by the server on request, nothing in
                  the model altered. The server's refusal sentences (no
                  model, nothing open) are shown as they stand. */}
              <button
                type="button"
                onClick={downloadMarkup}
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
                  cursor: markingUp ? 'progress' : 'pointer',
                  font: 'inherit',
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
                      color: markupWord ? ink.danger : '#6b7280',
                      lineHeight: 1.5,
                      textWrap: 'pretty',
                    }}
                  >
                    {markupWord ??
                      (markingUp
                        ? 'Building the copy…'
                        : (viewingPast && model
                            ? `On the current version (v${model.version}). `
                            : '') +
                          'Your model back, with every problem cell ' +
                          'coloured and noted. A copy — the original is ' +
                          'never at risk.')}
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
              </button>
            </div>

            {/* The version-scoped state, said on this tab too: a list
                shorter than the current one must never read as the
                deck agreeing — only the model audit is re-computed for
                a past version. */}
            {viewingPast && model && (
              <div
                style={{
                  fontSize: 13.5,
                  color: '#8f96a0',
                  lineHeight: 1.5,
                  margin: '-8px 4px 16px',
                  textWrap: 'pretty',
                }}
              >
                Version {pastArtifact?.version}&apos;s model audit, checked just
                now on its stored cells. The deck reconciliation and every
                ruling live on the current version (v{model.version}).
              </div>
            )}

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
              {findings === null || (viewingPast && past === 'loading') ? (
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
                    {viewingPast && past === 'failed'
                      ? 'This version could not be checked — its stored cells did not answer.'
                      : checkedAt
                        ? sev === 0
                          ? 'Nothing failing.'
                          : `No ${SEV_WORD[sev as 1 | 2 | 3].toLowerCase()} findings open.`
                        : 'This model has not been checked yet.'}
                  </span>
                  {!checkedAt && !viewingPast && (
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
                          //: A finding about the *workbook* rather than a
                          //: cell — the defined names pointing into other
                          //: files, say — carries no sheet and no ref, and
                          //: the column sat empty beside a real finding on
                          //: a real model. It is not nowhere: the engine
                          //: says what it is about in `where.label`, and an
                          //: empty column reads as a rendering fault
                          //: rather than as « the whole workbook ».
                          const sheet = String(
                            f.where.anchor.sheet || f.where.label || '',
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
                                      {viewingPast ? (
                                        //: A past version's findings have
                                        //: no durable identity — nothing
                                        //: here can be ruled on, and the
                                        //: sentence says so instead of
                                        //: offering dead buttons.
                                        <span
                                          style={{
                                            fontSize: 14,
                                            lineHeight: 1.5,
                                            color: '#8f96a0',
                                          }}
                                        >
                                          Checked just now on version{' '}
                                          {pastArtifact?.version}. Rulings and
                                          fixes are recorded on the current
                                          version.
                                        </span>
                                      ) : noteFor === f.id ? (
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

        {/* The Versions tab — agent-designed (no founder drawing exists;
            the design's own vtCols declare the table's columns, kept
            verbatim: Version · What changed · Saved · By · Findings).
            Rows are the uploads, newest first; selecting one shows the
            Watch's delta report for that revision — computed by the
            server from the two versions' stored bytes, persisted
            nowhere, rendered in the engine's own rank. */}
        {tab === 'Versions' && (
          <div
            style={{
              width: '100%',
              maxWidth: 1040,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              paddingBottom: 44,
            }}
          >
            <div style={{ ...frameCard, padding: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '74px 1fr 150px 170px 110px',
                  gap: 10,
                  padding: '2px 20px 14px',
                }}
              >
                <span style={pillHead}>Version</span>
                <span style={pillHead}>What changed</span>
                <span style={pillHead}>Saved</span>
                <span style={pillHead}>By</span>
                <span style={{ ...pillHead, textAlign: 'right' }}>
                  Findings
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#fff',
                  borderRadius: 18,
                  boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                  overflow: 'hidden',
                }}
              >
                {(versions ?? [])
                  .slice()
                  .sort((a, b) => b.version - a.version)
                  .map((v, index, sorted) => {
                    const on = deltaFor === v.id
                    const held = deltas[v.id]
                    const isFirst = index === sorted.length - 1
                    const changed = isFirst
                      ? 'First upload — nothing earlier to compare'
                      : held === 'identical'
                        ? 'The same file again — byte for byte'
                        : held === 'loading'
                          ? 'Comparing with the version before…'
                          : held &&
                              typeof held === 'object' &&
                              'refused' in held
                            ? //: The column is a summary, so it carries the
                              //: fact, not the paragraph — the server's own
                              //: sentence, and what to do about it, is
                              //: printed under the table in full.
                              'Not comparable — the file was dropped'
                            : held === null
                              ? 'Nothing earlier was readable to compare'
                              : held
                                ? `${word(held.new_defects)} defect${
                                    held.new_defects === 1 ? '' : 's'
                                  } introduced · ${
                                    held.repaired_defects === 0
                                      ? 'none'
                                      : word(
                                          held.repaired_defects,
                                        ).toLowerCase()
                                  } repaired · ${
                                    held.persistent_defects === 0
                                      ? 'none'
                                      : word(
                                          held.persistent_defects,
                                        ).toLowerCase()
                                  } standing`
                                : 'Select to compare'
                    return (
                      <button
                        key={v.id}
                        onClick={() => selectDelta(v.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '74px 1fr 150px 170px 110px',
                          gap: 10,
                          alignItems: 'center',
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          borderTop:
                            index === 0 ? 0 : '.5px solid rgba(16,22,35,.06)',
                          background: on
                            ? 'rgba(0,96,208,.045)'
                            : 'transparent',
                          font: 'inherit',
                          cursor: 'pointer',
                          padding: '0 20px',
                          minHeight: 58,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 12.5,
                            color: on ? '#0060d0' : '#9aa1ab',
                          }}
                        >
                          v{v.version}
                        </span>
                        <span
                          style={{
                            minWidth: 0,
                            fontSize: 14.5,
                            letterSpacing: '-.01em',
                            color:
                              held && held !== 'loading'
                                ? '#1c1f23'
                                : '#8f96a0',
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {changed}
                        </span>
                        <span style={{ fontSize: 13, color: '#8f96a0' }}>
                          {when(v.uploaded_at)}
                        </span>
                        <span
                          style={{
                            fontSize: 13.5,
                            color: '#4a4f57',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {v.uploaded_by?.name ?? 'Uploaded'}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 8,
                            fontFamily: font.mono,
                            fontSize: 12.5,
                          }}
                        >
                          {held &&
                          typeof held === 'object' &&
                          'items' in held ? (
                            <>
                              <span
                                style={{
                                  color:
                                    held.new_defects > 0
                                      ? '#e0322d'
                                      : '#b6bac1',
                                }}
                              >
                                +{held.new_defects}
                              </span>
                              <span
                                style={{
                                  color:
                                    held.repaired_defects > 0
                                      ? '#1f8a4c'
                                      : '#b6bac1',
                                }}
                              >
                                −{held.repaired_defects}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: '#b6bac1' }}>—</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                {(versions ?? []).length === 0 && (
                  <div
                    style={{
                      padding: '36px 24px',
                      textAlign: 'center',
                      fontSize: 14.5,
                      color: '#4a4f57',
                    }}
                  >
                    {model
                      ? 'One moment — the versions are loading.'
                      : 'This deal has no model yet, so there are no versions to show.'}
                  </div>
                )}
              </div>
            </div>

            {deltaFor !== null &&
              (() => {
                const held = deltas[deltaFor]
                if (held === 'identical')
                  //: Nothing was compared, and the reason is stronger
                  //: than a comparison would have been: the two
                  //: uploads are the same bytes, so no comparison
                  //: could find anything. The Watch would have spent
                  //: two and a half minutes on a real model arriving
                  //: at the same answer with less certainty.
                  return (
                    <div
                      style={{
                        fontSize: 14.5,
                        color: '#4a4f57',
                        lineHeight: 1.55,
                        padding: '8px 4px',
                        maxWidth: '78ch',
                      }}
                    >
                      This upload is{' '}
                      <strong>byte for byte the same file</strong> as the
                      version before it, so there is nothing to compare — no
                      cell, formula, label or sheet can differ. Nothing was read
                      to answer this.
                    </div>
                  )
                if (held === undefined || held === 'loading') {
                  //: How long this actually takes, said in the model's
                  //: own numbers. The comparison reads both workbooks
                  //: and aligns them cell by cell: measured, a
                  //: 313-cell fixture is instant, a 4,800-cell model
                  //: about three seconds, and a real 432,596-cell
                  //: project-finance model **two and a half minutes**.
                  //: A screen that says « comparing… » for that long
                  //: and nothing else has stopped being honest and
                  //: started looking broken.
                  const cells =
                    typeof model?.counts?.['cells'] === 'number'
                      ? (model.counts['cells'] as number)
                      : 0
                  return (
                    <div
                      style={{
                        fontSize: 14.5,
                        color: '#8f96a0',
                        padding: '8px 4px',
                        lineHeight: 1.55,
                        maxWidth: '78ch',
                      }}
                    >
                      Reading both versions and comparing…
                      {cells >= 50_000 && (
                        <>
                          {' '}
                          This model has {cells.toLocaleString()} cells, and a
                          comparison that size takes a few minutes. It is
                          computed fresh every time — nothing here is a saved
                          answer.
                        </>
                      )}
                    </div>
                  )
                }
                if (held && typeof held === 'object' && 'refused' in held)
                  //: The server's own sentence — bytes dropped under the
                  //: retention policy, most likely — shown as it stands.
                  return (
                    <div
                      style={{
                        fontSize: 14.5,
                        color: '#4a4f57',
                        lineHeight: 1.55,
                        padding: '8px 4px',
                        maxWidth: '82ch',
                      }}
                    >
                      {held.refused}
                    </div>
                  )
                if (held === null)
                  return (
                    <div
                      style={{
                        fontSize: 14.5,
                        color: '#4a4f57',
                        padding: '8px 4px',
                      }}
                    >
                      This is the first upload — there is no revision to report.
                    </div>
                  )
                const delta = held
                return (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 16.5,
                          fontWeight: 600,
                          letterSpacing: '-.014em',
                          padding: '10px 0 6px',
                          background:
                            'linear-gradient(96deg,#0060d0 0%,#3b6ee0 42%,#5b52e0 100%)',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          color: '#0060d0',
                          width: 'fit-content',
                        }}
                      >
                        What v{delta.new_version} changed
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: ink.secondary,
                          lineHeight: 1.55,
                          maxWidth: '82ch',
                          textWrap: 'pretty',
                        }}
                      >
                        Compared with v{delta.old_version}, uploaded{' '}
                        {when(delta.old_uploaded_at).toLowerCase()}
                        {delta.old_uploaded_by
                          ? ` by ${delta.old_uploaded_by.name}`
                          : ''}
                        . Computed just now from both stored files — nothing
                        here is a saved answer.
                        {delta.unmatched_old + delta.unmatched_new > 0 &&
                          ` ${word(
                            delta.unmatched_old + delta.unmatched_new,
                          )} finding${
                            delta.unmatched_old + delta.unmatched_new === 1
                              ? ' carries'
                              : 's carry'
                          } no name to match by and ${
                            delta.unmatched_old + delta.unmatched_new === 1
                              ? 'is'
                              : 'are'
                          } counted apart, never guessed at.`}
                        {(delta.sheets_added.length > 0 ||
                          delta.sheets_removed.length > 0) &&
                          ` Sheets: ${[
                            ...delta.sheets_added.map((one) => `+${one}`),
                            ...delta.sheets_removed.map((one) => `−${one}`),
                          ].join(', ')}.`}
                      </div>
                    </div>
                    <div style={{ ...frameCard, padding: 14 }}>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          background: '#fff',
                          borderRadius: 18,
                          boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                          overflow: 'hidden',
                        }}
                      >
                        {delta.items.length === 0 && (
                          <div
                            style={{
                              padding: '36px 24px',
                              textAlign: 'center',
                              fontSize: 14.5,
                              color: '#4a4f57',
                            }}
                          >
                            No reviewed changes — the two versions read the same
                            to the Watch.
                          </div>
                        )}
                        {delta.items.map((item, index) => {
                          const kind = DELTA_KIND[item.kind] ?? {
                            word: item.kind,
                            dot: '#8f96a0',
                          }
                          //: The place, as a banker would name it: one
                          //: cell reads « Model!F16 », a block reads
                          //: « Model rows 16–24 », a keyed finding with
                          //: no aligned position reads as its sheet.
                          const where =
                            item.first_row > 0 &&
                            item.first_row === item.last_row &&
                            item.columns.length === 1
                              ? `${item.sheet}!${item.columns[0]}${item.first_row}`
                              : item.first_row > 0
                                ? `${item.sheet} rows ${item.first_row}${
                                    item.first_row === item.last_row
                                      ? ''
                                      : `–${item.last_row}`
                                  }${
                                    item.columns.length > 0 &&
                                    item.columns.length <= 4
                                      ? ` · ${item.columns.join(' ')}`
                                      : ''
                                  }`
                                : item.sheet
                          return (
                            <div
                              key={index}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 14,
                                borderTop:
                                  index === 0
                                    ? 0
                                    : '.5px solid rgba(16,22,35,.06)',
                                padding: '14px 20px',
                              }}
                            >
                              <span
                                style={{
                                  flex: '0 0 168px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginTop: 1,
                                }}
                              >
                                <span
                                  style={{
                                    flex: '0 0 7px',
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: kind.dot,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 13.5,
                                    fontWeight: 500,
                                    letterSpacing: '-.01em',
                                    color: '#1c1f23',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {kind.word}
                                </span>
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
                                    fontSize: 14.5,
                                    letterSpacing: '-.01em',
                                    color: '#1c1f23',
                                    lineHeight: 1.45,
                                    textWrap: 'pretty',
                                  }}
                                >
                                  {item.detail ||
                                    `${kind.word} on ${item.sheet}`}
                                </span>
                                {item.findings.length > 0 && (
                                  <span
                                    style={{
                                      fontFamily: font.mono,
                                      fontSize: 11.5,
                                      color: '#9aa1ab',
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    {item.findings.join(' · ')}
                                  </span>
                                )}
                              </span>
                              <span
                                style={{
                                  flex: '0 0 auto',
                                  fontFamily: font.mono,
                                  fontSize: 11.5,
                                  color: '#9aa1ab',
                                  whiteSpace: 'nowrap',
                                  marginTop: 3,
                                }}
                              >
                                {where}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {(() => {
                        //: And what the revision did to what was *sent
                        //: out*. The model delta above answers « what
                        //: changed »; this answers the question a
                        //: banker actually loses sleep over — which of
                        //: the deck's hundred printed figures the
                        //: revision just made wrong.
                        const sent = deckDeltas[delta.new_artifact_id]
                        if (sent === undefined || sent === null) return null
                        if (sent === 'loading')
                          return (
                            <div style={deckNote}>
                              Re-tying the deck against both versions…
                            </div>
                          )
                        if ('refused' in sent)
                          return <div style={deckNote}>{sent.refused}</div>
                        //: The four lists, in the order a reader needs
                        //: them: what this revision did, then what it
                        //: undid, then what can no longer be judged,
                        //: then what was already wrong. Empty groups do
                        //: not draw.
                        const every = [
                          {
                            key: 'broken',
                            rows: sent.broken,
                            dot: '#d0342c',
                            head: 'This revision broke',
                            says: 'agreed with the model before, disagrees now',
                          },
                          {
                            key: 'repaired',
                            rows: sent.repaired,
                            dot: '#2e7d54',
                            head: 'This revision fixed',
                            says: 'disagreed before, agrees now',
                          },
                          {
                            key: 'coverage_changed',
                            rows: sent.coverage_changed,
                            dot: '#b4802a',
                            head: 'No longer checkable',
                            says:
                              'reconcilable against one version only — lost ' +
                              'sight of, which is not the same as broken',
                          },
                          {
                            key: 'still_drifting',
                            rows: sent.still_drifting,
                            dot: '#8f96a0',
                            head: 'Already disagreeing',
                            says:
                              'disagrees with both versions, so not this ' +
                              "revision's doing",
                          },
                        ]
                        const groups = every.filter(
                          (one) => one.rows.length > 0,
                        )
                        return (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                              paddingTop: 22,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 15.5,
                                fontWeight: 500,
                                letterSpacing: '-.014em',
                                color: '#1c1f23',
                              }}
                            >
                              And what it did to {sent.deck_filename}
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                color: '#77808c',
                                lineHeight: 1.55,
                                textWrap: 'pretty',
                              }}
                            >
                              The same deck reconciled against both versions.{' '}
                              {sent.checked_new === sent.checked_old
                                ? `${sent.checked_old} of its printed figures could be checked against either.`
                                : `${sent.checked_old} of its printed figures could be checked against v${sent.old_version}; ${sent.checked_new} against v${sent.new_version}.`}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                background: '#fff',
                                borderRadius: 18,
                                boxShadow: '0 1px 2px rgba(16,22,35,.04)',
                                overflow: 'hidden',
                              }}
                            >
                              {groups.length === 0 && (
                                <div
                                  style={{
                                    padding: '36px 24px',
                                    textAlign: 'center',
                                    fontSize: 14.5,
                                    color: '#4a4f57',
                                  }}
                                >
                                  Nothing in the deck moved with this revision.
                                </div>
                              )}
                              {groups.map((group) => (
                                <div key={group.key}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'baseline',
                                      gap: 9,
                                      padding: '13px 20px 9px',
                                      background: '#fbfbfc',
                                      borderTop:
                                        '.5px solid rgba(16,22,35,.06)',
                                    }}
                                  >
                                    <span
                                      style={{
                                        flex: '0 0 7px',
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        background: group.dot,
                                        alignSelf: 'center',
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: 13.5,
                                        fontWeight: 500,
                                        letterSpacing: '-.01em',
                                        color: '#1c1f23',
                                      }}
                                    >
                                      {group.head} {group.rows.length}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 12.5,
                                        color: '#8b939e',
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      — {group.says}
                                    </span>
                                  </div>
                                  {group.rows.slice(0, 12).map((one, index) => (
                                    <div
                                      key={index}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 14,
                                        borderTop:
                                          '.5px solid rgba(16,22,35,.045)',
                                        padding: '12px 20px',
                                      }}
                                    >
                                      <span
                                        style={{
                                          flex: '0 0 78px',
                                          fontSize: 12.5,
                                          color: '#77808c',
                                          marginTop: 2,
                                        }}
                                      >
                                        Slide {one.slide}
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
                                            fontSize: 14.5,
                                            letterSpacing: '-.01em',
                                            color: '#1c1f23',
                                            lineHeight: 1.45,
                                          }}
                                        >
                                          {one.name ? `${one.name}: ` : ''}
                                          <span
                                            style={{ fontFamily: font.mono }}
                                          >
                                            {one.printed}
                                          </span>
                                          {one.expected ? (
                                            <>
                                              {' — the model now says '}
                                              <span
                                                style={{
                                                  fontFamily: font.mono,
                                                }}
                                              >
                                                {one.expected}
                                              </span>
                                            </>
                                          ) : (
                                            ''
                                          )}
                                          {one.one_tick
                                            ? ' (one unit at the printed precision — a rounding convention)'
                                            : ''}
                                        </span>
                                        {group.key === 'broken' && (
                                          <span
                                            style={{
                                              fontSize: 12.5,
                                              color: one.cause
                                                ? '#77808c'
                                                : '#9aa1ab',
                                              lineHeight: 1.5,
                                              fontStyle: one.cause
                                                ? 'normal'
                                                : 'italic',
                                            }}
                                          >
                                            {one.cause ||
                                              'No model change could be attributed to this break.'}
                                          </span>
                                        )}
                                      </span>
                                      <span
                                        style={{
                                          flex: '0 0 auto',
                                          fontFamily: font.mono,
                                          fontSize: 11.5,
                                          color: '#9aa1ab',
                                          whiteSpace: 'nowrap',
                                          marginTop: 3,
                                        }}
                                      >
                                        {one.old_ref || one.location}
                                      </span>
                                    </div>
                                  ))}
                                  {group.rows.length > 12 && (
                                    <div
                                      style={{
                                        padding: '10px 20px 12px',
                                        fontSize: 12.5,
                                        color: '#8b939e',
                                        borderTop:
                                          '.5px solid rgba(16,22,35,.045)',
                                      }}
                                    >
                                      and {group.rows.length - 12} more.
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )
              })()}
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
          open={openCurrent}
          lastRun={lastRun}
          versions={versions ?? []}
          recalc={(model?.counts['recalc'] as RecalcMark | undefined) ?? null}
          coverage={page?.coverage ?? null}
          modelCounts={model?.counts ?? null}
          stale={
            page?.stale
              ? { kind: page.stale_kind ?? null, at: page.stale_at ?? null }
              : null
          }
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
  recalc,
  coverage,
  modelCounts,
  stale,
  onClose,
}: {
  modelName: string
  version: number | null
  checkedAt: string | null
  counts: { 1: number; 2: number; 3: number }
  open: Finding[]
  lastRun: CheckRun | null
  versions: Version[]
  /** The current version's stored recalculation mark, when it has one. */
  recalc: RecalcMark | null
  /** What the last tie-out reconciled and what it did not — the line
   *  that keeps the report honest. Null before any deal page loads. */
  coverage: Coverage | null
  /** The model's own ingest counts — cells, formulas, named cells. */
  modelCounts: Record<string, unknown> | null
  /** A current document arrived after the last run finished, so this
   *  report describes a deal that has already moved on. */
  stale: { kind: string | null; at: string | null } | null
  onClose: () => void
}) => {
  const total = open.length
  const material = open.filter((one) => sevOf(one) === 1)
  const rest = open.filter((one) => sevOf(one) !== 1)

  //: **One place to act is one entry.** Kelso's report listed three
  //: material findings — `calcFundingSA!M712`, `!N712`, `!O712` — as
  //: 01, 02, 03, with the same heading and near-identical sentences
  //: three times. That is one check row failing in three periods, and
  //: a partner reads it as three problems and spends a third of the
  //: page on it.
  //:
  //: The count above does not change: three findings *are* three
  //: findings and the tally says so. What changes is that the section
  //: numbers **places**, and every finding keeps its own sentence and
  //: its own cell beneath. Nothing is composed, summarised or dropped
  //: — grouping is the only thing happening here.
  //: The one sentence a place shares, or empty when its findings
  //: really do say different things. Each title is compared with its
  //: *own* reference taken out, because that is the only part a
  //: repeated rule varies — so this collapses « … firing at !M712 »
  //: and « … firing at !N712 » and refuses to collapse two genuinely
  //: different sentences that happen to sit on one row.
  //: A finding carries two things that identify *it* rather than what
  //: is wrong: its reference and its name. Take both out and what is
  //: left is the statement. When every statement in a group is the
  //: same, the group is one statement about the model — whether that
  //: is one row in three columns, or fifty-three sheets each hidden
  //: the same way.
  const record = lastRun ? auditRecord(lastRun) : null
  const summary = lastRun?.summary ?? {}

  //: « Nothing failing » must never stand alone on a copy the rules
  //: could not read. Measured on a real corpus model (Levenmouth
  //: Academy, 27 Aug): 432,596 cells, **224 of them formulas** — a
  //: values-pasted publication — reported nothing, and the reason it
  //: found nothing sat a page away under « what could not be
  //: checked ». A partner reads « nothing failing » as « checked and
  //: clean », which is the one conclusion this file cannot support.
  //: The blindness matters whether or not the checks found something
  //: — arguably more when they did, because a reader now trusts them.
  //: Measured on Kelso (a real corpus model): 814 formulas in 470,594
  //: cells, seven material findings, and nothing on the verdict page
  //: said the construction rules had seen almost none of the file.
  const blind = record?.values_only === true
  const formulaCount =
    typeof modelCounts?.['formulas'] === 'number'
      ? (modelCounts['formulas'] as number)
      : null
  const cellCount =
    typeof modelCounts?.['cells'] === 'number'
      ? (modelCounts['cells'] as number)
      : null

  const verdictLead =
    counts[1] > 0
      ? `Not ready to send. ${word(total)} finding${total === 1 ? '' : 's'}, ${word(counts[1]).toLowerCase()} of them material.`
      : total > 0
        ? `${word(total)} finding${total === 1 ? '' : 's'} open, none material.`
        : blind
          ? 'Nothing failing — but little could be checked.'
          : 'Nothing failing.'

  //: Some engine sentences stop inside the formula that proves them —
  //: stored that way, and not this lane's to rewrite. An ellipsis says
  //: « abbreviated » where a bare cut says « broken »; nothing is
  //: invented and nothing is dropped.
  const saidOf = (text: string): string => {
    const said = text.trim()
    if (!said.includes('=')) return said
    const tail = said.slice(said.lastIndexOf('='))
    const opens = (tail.match(/\(/g) ?? []).length
    const closes = (tail.match(/\)/g) ?? []).length
    const dangling = opens > closes || /[<>=+\-*/,(]$/.test(said)
    return dangling ? `${said}…` : said
  }

  //: What class a finding belongs to, for the verdict's summary, in
  //: both numbers — « figures … that disagree » is not the singular
  //: with an « s » on the end, and a partner reads the difference.
  const classOf = (one: Finding): { one: string; many: string } => {
    //: Some headlines are clauses, not names — « The model's own check
    //: rows are firing ». Appending an « s » to one produced « seven
    //: the model's own check rows are firings ». A clause is grouped
    //: by its family instead, which is always a noun phrase; the
    //: sentence itself is overleaf, per finding.
    const clauseLike = (said: string) =>
      /^(the|a|an) /i.test(said) || / (is|are|was|were|does|do) /i.test(said)
    if (one.headline && !clauseLike(one.headline)) {
      const said = one.headline.toLowerCase()
      return { one: said, many: said.endsWith('s') ? said : `${said}s` }
    }
    if (one.kind === 'drift')
      return {
        one: 'figure in the deliverables that disagrees with the model',
        many: 'figures in the deliverables that disagree with the model',
      }
    //: The families are named in the plural (« Probable formula
    //: defects »), so the singular is the trim, not the append —
    //: « one probable formula defects » was the giveaway.
    const family = (categoryOfKey(one.rule ?? '') || 'finding').toLowerCase()
    return {
      one: family.endsWith('s') ? family.slice(0, -1) : family,
      many: family.endsWith('s') ? family : `${family}s`,
    }
  }

  //: Grouped, not enumerated: fifteen material findings listed one by
  //: one made the verdict a wall of numbers before the reader reached
  //: a verb. Counted by class, largest first.
  const byClass = new Map<string, { n: number; one: string; many: string }>()
  for (const finding of material) {
    const cls = classOf(finding)
    const held = byClass.get(cls.one)
    byClass.set(cls.one, { ...cls, n: (held?.n ?? 0) + 1 })
  }
  const materialClauses = [...byClass.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(
      ({ n, one, many }) => `${word(n).toLowerCase()} ${n === 1 ? one : many}`,
    )
  const blindNumbers =
    formulaCount !== null && cellCount !== null
      ? ` — ${formulaCount.toLocaleString()} of ${cellCount.toLocaleString()} cells hold a formula —`
      : ''

  const blindBody = blind
    ? `This copy carries values only${
        formulaCount !== null && cellCount !== null
          ? `: ${formulaCount.toLocaleString()} of ${cellCount.toLocaleString()} cells hold a formula`
          : ''
      }, so the rules that read how the model is built had almost nothing to read. The checks that read values — the statements, the model's own check rows — found nothing failing. Ask for the working copy if the construction matters.`
    : ''

  const verdictBody =
    material.length > 0
      ? `${blind ? `This copy carries values only${blindNumbers} so the rules that read how the model is built saw almost none of it. What the value-reading checks did find: ` : ''}${
          materialClauses.length > 0
            ? `${materialClauses.slice(0, -1).join(', ')}${
                materialClauses.length > 1 ? ', and ' : ''
              }${materialClauses[materialClauses.length - 1]}${
                byClass.size > materialClauses.length ? ', among others' : ''
              }. `
            : ''
        }${material.length === 1 ? 'It is' : 'Each is'} named with its cell or page overleaf, and ${material.length === 1 ? 'it' : 'they'} should clear before this model leaves the deal team.`
      : total > 0
        ? 'The open findings are worth reading, but none of them on its own would stop the model going out.'
        : blindBody

  //: The body is its own paragraph under the lead, so it starts a
  //: sentence — « two inconsistent formulas … » opened lowercase under
  //: a full stop until this.
  const verdictSaid =
    verdictBody.length > 0
      ? verdictBody.charAt(0).toUpperCase() + verdictBody.slice(1)
      : verdictBody

  //: Every claim on this page carries where it came from: the cell
  //: when the finding sits in the model, the document and page when it
  //: sits in a deck or a memo. A claim with nothing to cite is not
  //: printed as a bare sentence — it says the file it came from.
  const citeOf = (one: Finding): string => {
    //: The engine's anchor already reads « Balance Sheet!D13 » — only a
    //: bare ref needs its sheet put back, or the citation says the
    //: sheet twice.
    if (one.where.anchor.ref)
      return one.where.anchor.ref.includes('!')
        ? one.where.anchor.ref
        : `${one.where.anchor.sheet ?? ''}!${one.where.anchor.ref}`
    if (one.where.filename)
      return one.page > 0
        ? `${one.where.filename} · p. ${one.page}`
        : one.where.filename
    return one.where.label || ''
  }

  const statementOf = (one: Finding): string => {
    let said = saidOf(one.plain || one.title)
    const ref = citeOf(one)
    const name = String(one.where.anchor.sheet ?? one.source?.name ?? '')
    if (ref) said = said.split(ref).join('')
    if (name) said = said.split(name).join('')
    return said
      .replace(/«\s*»/g, '')
      .replace(/\s+at\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  //: The one sentence a group shares, ready to print — or empty when
  //: printing it would break it.
  //:
  //: Stripping a finding's own name is right for *comparing* and wrong
  //: for *displaying* when the name is the sentence's subject: fifty-
  //: three hidden sheets collapsed to « is very hidden — it does not
  //: appear in Excel's unhide menu », a sentence with nothing to be
  //: about. So the shared line is used only when the name sits inside
  //: the sentence rather than at its head; where it is the subject,
  //: the group keeps each finding's own sentence and the reader sees
  //: the count in the heading.
  const sharedSentence = (place: Finding[]): string => {
    if (place.length < 2) return ''
    const first = statementOf(place[0]!)
    if (!first) return ''
    if (!place.every((one) => statementOf(one) === first)) return ''
    //: Whether the name is the sentence's *subject*. « BID PRICE » is
    //: very hidden — take the name out and nothing is left to be about.
    const heads = place.some((one) => {
      const said = saidOf(one.plain || one.title)
      const name = String(one.where.anchor.sheet ?? '')
      const ref = citeOf(one)
      return (
        (!!name && said.startsWith(name)) ||
        (!!ref && said.startsWith(ref)) ||
        said.startsWith('«')
      )
    })
    //: They still collapse — the group is one statement either way.
    //: What changes is what gets printed: the stripped statement when
    //: it survives stripping, and otherwise the first finding's own
    //: sentence with the rest rostered beneath it. That is the shape
    //: the engine already uses for `broken-name`: « 338 defined names
    //: point into other workbooks … and 332 more ».
    return heads ? saidOf(place[0]!.plain || place[0]!.title) : first
  }

  const placeOf = (one: Finding): string => {
    const ref = String(one.where.anchor.ref ?? '')
    const row = ref.match(/(\d+)$/)?.[1] ?? ''
    if (!one.rule || !row) return `solo:${one.id}`
    return `${one.rule}|${one.where.anchor.sheet ?? ''}|${row}`
  }
  const materialPlaces = (() => {
    //: **First, one statement is one entry.** Newbattle hides 53 of
    //: its 54 sheets, and the report printed 53 numbered entries
    //: carrying the same sentence with a different sheet name in it —
    //: section 3 ran to 267 lines. That is one act by one person and
    //: a reader acts on it once.
    //:
    //: A rule collapses only when *every* one of its findings makes
    //: the identical statement once its own reference and name are
    //: removed. Where they genuinely differ, the sheet-and-row
    //: grouping below still applies and nothing is merged. The tally
    //: above is untouched either way: 66 material findings are 66,
    //: and the engine's count is not this screen's to edit.
    const byRule = new Map<string, Finding[]>()
    for (const one of material) {
      const key = one.rule ?? ''
      if (!key) continue
      byRule.set(key, [...(byRule.get(key) ?? []), one])
    }
    const collapsed = new Set<string>()
    const wholeRule: Finding[][] = []
    for (const group of byRule.values()) {
      if (group.length > 1 && sharedSentence(group)) {
        wholeRule.push(group)
        for (const one of group) collapsed.add(one.id)
      }
    }

    const byPlace = new Map<string, Finding[]>()
    for (const one of material) {
      if (collapsed.has(one.id)) continue
      const key = placeOf(one)
      byPlace.set(key, [...(byPlace.get(key) ?? []), one])
    }
    for (const group of wholeRule) byPlace.set(`rule:${group[0]!.rule}`, group)
    //: Within a place, in the order a person reads a model: down the
    //: columns, left to right. They arrived N712, M712, O712.
    const at = (one: Finding) => {
      const coordinate =
        String(one.where.anchor.ref ?? '')
          .split('!')
          .pop() ?? ''
      const column = coordinate.replace(/[^A-Za-z]/g, '')
      const row = Number(coordinate.replace(/[^0-9]/g, '')) || 0
      return { column, row }
    }
    return [...byPlace.values()].map((group) =>
      [...group].sort((a, b) => {
        const one = at(a)
        const two = at(b)
        if (one.column.length !== two.column.length)
          return one.column.length - two.column.length
        if (one.column !== two.column) return one.column < two.column ? -1 : 1
        return one.row - two.row
      }),
    )
  })()
  //: A drift finding is a claim about two places at once — the printed
  //: figure and the cell it should have matched. Both are cited.
  const againstOf = (one: Finding): string =>
    one.source.ref && !one.where.anchor.ref
      ? `against ${one.source.name ? `${one.source.name} · ` : ''}${one.source.ref}`
      : ''

  //: Coverage, in the words the schema itself uses: « 102 of 128
  //: figures reconciled · 26 not checked ». A deal with no deck or memo
  //: checked has no figures at all, and says so rather than printing a
  //: meaningless « 0 of 0 » — the tie-out is what fills this line.
  const figuresSeen = coverage ? coverage.reconciled + coverage.unlinked : 0

  const facts: [string, string][] = [
    ['Model', modelName + (version ? `, version ${version}` : '')],
    ['Checked', when(checkedAt)],
  ]
  if (typeof summary['cells'] === 'number')
    facts.push([
      'Cells read',
      //: `summary.cells` is cells — the row said « formulas read » over
      //: it, which is a false claim on a document a partner keeps. The
      //: model's own counts carry the formula count, so both are said.
      //:
      //: Grouped, because the verdict overleaf already says « 224 of
      //: 432,596 cells » and this row was printing « 432596 » — the
      //: same number twice on one page, one of them unreadable.
      typeof modelCounts?.['formulas'] === 'number'
        ? `${grouped(summary['cells'])} · ${grouped(modelCounts['formulas'])} of them formulas`
        : grouped(summary['cells']),
    ])
  if (Array.isArray(summary['rules_off']) && summary['rules_off'].length > 0)
    facts.push([
      'Rules switched off',
      (summary['rules_off'] as string[]).join(', '),
    ])

  const notChecked: string[] = []
  if (record) {
    //: Two rules can abstain for one reason (« No debt schedule was
    //: located » answers both the debt and the interest checks). The
    //: reason is the same fact; printing it twice reads as carelessness.
    for (const one of [...new Set(record.abstentions.map((a) => a.why))])
      notChecked.push(one)
    if (record.values_only)
      notChecked.push(
        'This copy carries values only, so the construction rules could not read its formulas.',
      )
  }
  notChecked.push(
    'Model inputs that are judgement calls are not checked — only their sourcing is.',
  )

  //: The recalculation mark, spoken in report prose. Four verdicts,
  //: four faces — and no mark is a fact too, listed with everything
  //: else that was not checked rather than passed over in silence.
  const REFUSAL_SHORT: Record<string, string> = {
    rtd: 'a real-time feed',
    udf: 'a macro or add-in function',
    'external-link': 'a reference outside the file',
    lambda: 'a LAMBDA',
    cube: 'a cube connection',
    'engine-gap': 'a function the engine measurably cannot compute',
  }
  let recalcHead: string | null = null
  let recalcBody = ''
  if (recalc === null) {
    notChecked.push(
      'The arithmetic has not been re-run through the recalculation engine — the mark can be earned from the model’s own page.',
    )
  } else if (recalc.verdict === 'pass') {
    recalcHead = 'Validated by recalculation'
    recalcBody =
      `Beyond reading the model, its arithmetic was re-run: ${recalc.engine ?? 'the engine'} ` +
      `recomputed every formula from the file’s own inputs and reproduced all ` +
      `${recalc.matched} compared cells exactly.` +
      (recalc.volatile_cone > 0
        ? ` ${recalc.volatile_cone} live cells (TODAY, NOW, RAND and their dependents) were set aside — their stored values belong to the moment the file was saved.`
        : '')
  } else if (recalc.verdict === 'fail') {
    recalcHead = 'The recalculation disagreed'
    recalcBody =
      (recalc.mismatch_count > 0
        ? `${recalc.mismatch_count} of ${recalc.compared} compared cells came back different when the file’s formulas were re-run. `
        : '') +
      (recalc.engine_error_count > 0
        ? `${recalc.engine_error_count} cells returned engine errors against stored numbers — the engine’s measured inability on those constructs, not the model’s defect. `
        : '') +
      (recalc.not_computed > 0
        ? `${recalc.not_computed} formula cells came back with nothing. `
        : '') +
      //: A printed report cannot send its reader to a screen. The cells
      //: are named here, with both numbers, so the disagreement can be
      //: judged rather than taken on trust.
      (recalc.mismatches.length > 0
        ? `The differing cells: ${recalc.mismatches
            .slice(0, 6)
            .map(
              (d) =>
                `${d.ref} (${d.stored ?? '—'} stored, ${d.computed ?? 'nothing'} recalculated)`,
            )
            .join('; ')}${
            recalc.mismatch_count > recalc.mismatches.slice(0, 6).length
              ? `; and ${recalc.mismatch_count - recalc.mismatches.slice(0, 6).length} more not named here`
              : ''
          }.`
        : '')
  } else if (recalc.verdict === 'refused') {
    const kinds = [
      ...new Set(
        recalc.refusals.map(
          (one) => REFUSAL_SHORT[one.category] ?? one.category,
        ),
      ),
    ]
    recalcHead = 'Not recalculated — refused, in words'
    recalcBody =
      `The file carries ${recalc.refusal_count === 1 ? 'a construct' : `${recalc.refusal_count} constructs`} ` +
      `no engine of ours may honestly compute` +
      (kinds.length > 0 ? ` (${kinds.join(', ')})` : '') +
      `, so its arithmetic was not re-run and no verdict is claimed. ` +
      (recalc.route === 'arbiter'
        ? 'Real Excel could settle this file; until an arbiter run exists, the honest answer is « we did not check this ».'
        : 'Nothing we could run recomputes these, so the honest answer is « we did not check this ».')
  } else if (recalc.verdict === 'nothing-compared') {
    recalcHead = 'Recalculated, with nothing to compare'
    recalcBody =
      'The file’s formula cells carry no stored values — a generator wrote it and Excel never computed it — so a recalculation had nothing to compare against and nothing is certified.'
  }

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
        {/* Section, not page. A sheet is one section of the report and
            fits one printed page only while it is short: fifteen
            material findings run to three pages, and « Page 3 of 4 »
            then sat on physical page five, with pages four and five
            carrying no number at all. The section number is true at
            any length; the printer numbers the paper. */}
        Section {page} of {of}
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

  //: The report is the artifact a partner actually receives, and what
  //: they receive is this PDF — so the print document has to be the
  //: report, not an approximation of it. Measured on the real model:
  //: without the three rules below the PDF came out set in Liberation
  //: Serif and DejaVu (the product's faces are self-hosted and the
  //: print window loaded none of them), the severity dots vanished
  //: entirely because browsers drop background colour when printing,
  //: and a trailing blank page followed the last sheet.
  const print = () => {
    const sheets = [...document.querySelectorAll('[data-report="sheet"]')]
    if (!sheets.length) return
    const w = window.open('', '_blank', 'width=900,height=1200')
    if (!w) return
    const origin = window.location.origin
    const face = (family: string, file: string, weight: string) =>
      `@font-face{font-family:'${family}';src:url('${origin}/workspace/${file}') format('woff2');font-weight:${weight};font-display:block;font-style:normal}`
    w.document.write(
      '<!doctype html><meta charset="utf-8"><title>' +
        document.title +
        '</title>' +
        '<style>' +
        //: The report's own faces, carried over so the delivered
        //: document is set in the typography it was designed in.
        face('Instrument Sans', 'instrument-sans-var.woff2', '400 700') +
        face('Newsreader', 'newsreader-var.woff2', '400 500') +
        face('JetBrains Mono', 'jetbrains-mono-var.woff2', '400 500') +
        "body{margin:0;font-family:'Instrument Sans',ui-sans-serif,system-ui,sans-serif}" +
        //: Severity reads by colour, and a browser drops background
        //: colour on print unless it is told not to.
        '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        //: The screen's sheet carries its own generous padding; on
        //: paper the @page margin already provides it, and keeping
        //: both pushed sheet one over the page — its footer orphaned
        //: onto a page of its own, which also made « Page 1 of 3 »
        //: false on a four-page document. Measured, not guessed.
        '[data-report="sheet"]{box-shadow:none!important;border-radius:0!important;' +
        'max-width:none!important;padding:0!important;break-after:page;break-inside:avoid}' +
        //: …but not after the last one, which is a blank page.
        '[data-report="sheet"]:last-of-type{break-after:auto}' +
        '@page{margin:16mm}</style>' +
        '<body>' +
        sheets.map((s) => s.outerHTML).join('') +
        '</body>',
    )
    w.document.close()
    w.focus()
    //: Print once the faces are actually in, or the document prints in
    //: fallbacks anyway; the timeout is the backstop for a browser
    //: whose `fonts.ready` never settles.
    const go = () => w.print()
    let printed = false
    const once = () => {
      if (printed) return
      printed = true
      go()
    }
    if (w.document.fonts?.ready) {
      w.document.fonts.ready.then(once).catch(once)
      setTimeout(once, 3000)
    } else {
      setTimeout(once, 250)
    }
  }

  //: Four sheets since G4: the verdict page could not hold the
  //: coverage and the refusals as well and still fit one printed
  //: page — measured in the PDF, where its footer orphaned onto a
  //: page of its own and « Page 1 of 3 » became false.
  const pages = 4
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
              {/* A report that describes a superseded version, without
                  saying so, is the one way this document can be quietly
                  wrong — the deal page has a stale banner and the
                  printed artifact had nothing. It sits above the
                  verdict because a reader has to meet it before
                  believing anything below. Agent-designed (G4). */}
              {stale && (
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: '14px 16px',
                    marginBottom: 4,
                    background: '#fdf6e7',
                    border: '1px solid rgba(232,163,0,.28)',
                    borderRadius: 8,
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 auto',
                      width: 7,
                      height: 7,
                      marginTop: 7,
                      borderRadius: '50%',
                      background: '#e8a300',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: '#5a4a1f',
                      textWrap: 'pretty',
                    }}
                  >
                    {`This check ran before the current ${stale.kind ?? 'document'} was uploaded${
                      stale.at ? ` ${when(stale.at).toLowerCase()}` : ''
                    }. What follows describes the deal as it stood at the check, and a re-check may change it.`}
                  </span>
                </div>
              )}
              {heading('The verdict')}
              {serif(verdictLead, 19)}
              {verdictSaid && (
                <div style={{ paddingTop: 14 }}>{serif(verdictSaid)}</div>
              )}
              {/* Severity at a glance — the three tiers as counts, so a
                  partner sees the shape of the answer before reading a
                  word of it. Agent-designed (G4). */}
              <div
                style={{
                  display: 'flex',
                  gap: 34,
                  paddingTop: 26,
                }}
              >
                {([1, 2, 3] as const).map((tier) => (
                  <span
                    key={tier}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background:
                            counts[tier] > 0 ? SEV_DOT[tier] : '#d6d9de',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12.5,
                          color: '#6b7280',
                          letterSpacing: '-.004em',
                        }}
                      >
                        {SEV_WORD[tier]}
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: font.serif,
                        fontSize: 27,
                        lineHeight: 1,
                        color: counts[tier] > 0 ? '#1c1f23' : '#b6bac1',
                      }}
                    >
                      {counts[tier]}
                    </span>
                  </span>
                ))}
              </div>
              {heading('What was checked', 40)}
              {serif(
                'Read against the FAST and ICAEW conventions and against the model’s own check rows. Every finding carries the cell — or the document and page — it came from.',
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
              {recalcHead !== null && (
                <>
                  {heading(recalcHead, 34)}
                  {serif(recalcBody)}
                </>
              )}
              {foot(1, pages, 'Swens')}
            </>,
          )}

          {sheet(
            <>
              {/* Coverage on the report's face — G4's own requirement,
                  and the line the schema calls « what keeps the product
                  honest ». It comes from the tie-out, so a deal with no
                  deck or memo checked says that rather than printing a
                  meaningless « 0 of 0 ». Agent-designed. */}
              {heading('How much was covered')}
              {serif(
                figuresSeen > 0 && coverage
                  ? `${coverage.reconciled} of ${figuresSeen} figures in the deliverables were reconciled against the model · ${coverage.unlinked} not checked.` +
                      (coverage.drifting > 0
                        ? ` ${word(coverage.drifting)} of the reconciled disagree with the model.`
                        : coverage.reconciled > 0
                          ? ' Every reconciled figure agrees with the model.'
                          : '')
                  : 'No deck or memo has been reconciled against this model, so no figures were checked. What follows is the model read against itself.',
              )}
              {figuresSeen > 0 &&
                coverage !== null &&
                coverage.reasons.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      paddingTop: 16,
                    }}
                  >
                    {coverage.reasons.map((one, i) => (
                      <span
                        key={one.reason}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 46px',
                          gap: 16,
                          alignItems: 'baseline',
                          borderTop:
                            i === 0 ? 0 : '1px solid rgba(16,22,35,.05)',
                          padding: '10px 0',
                        }}
                      >
                        <span style={{ fontSize: 14, color: '#4a4f57' }}>
                          {one.reason}
                        </span>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 12.5,
                            color: '#9aa1ab',
                            textAlign: 'right',
                          }}
                        >
                          {one.count}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
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
              {versions.length > 0 && (
                <>
                  {heading('The versions this report covers', 34)}
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
              {foot(
                2,
                pages,
                modelName + (version ? `, version ${version}` : ''),
              )}
            </>,
          )}

          {sheet(
            <>
              {heading('The material findings')}
              {serif(
                material.length > 0
                  ? `${word(material.length)} finding${material.length === 1 ? '' : 's'} that change a number someone will act on. Each is cited — the cell, or the document and page — so the owner can go straight to it.`
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
                {materialPlaces.map((place, i) => (
                  <div key={place[0]!.id} style={{ display: 'flex', gap: 16 }}>
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
                        gap: 14,
                      }}
                    >
                      {/* The heading once for the place, not once per
                          cell — and not at all when the sentence
                          beneath simply repeats it: « THE MODEL'S OWN
                          CHECK ROWS ARE FIRING » over « The model's own
                          check rows are firing at ReportRatiosSA!E356 »
                          is the same words twice. */}
                      {(() => {
                        const lead = place[0]!
                        const said =
                          lead.headline || categoryOfKey(lead.rule ?? '')
                        const repeats = saidOf(lead.plain || lead.title)
                          .toLowerCase()
                          .startsWith(
                            (lead.headline || '').toLowerCase().slice(0, 24),
                          )
                        if (!said || repeats) return null
                        return (
                          //: The scan line first — a partner reads the
                          //: headlines down the page, then stops on one.
                          //: A check with no headline of its own is named
                          //: by its family, which is derived from the rule.
                          <span
                            style={{
                              fontSize: 12.5,
                              letterSpacing: '.02em',
                              textTransform: 'uppercase',
                              color: '#9aa1ab',
                            }}
                          >
                            {said}
                            {/* Not « cells »: a group may be cells, rows
                                or whole sheets, and the heading must
                                not name the wrong thing. */}
                            {place.length > 1
                              ? ` · ${place.length} in all`
                              : ''}
                          </span>
                        )
                      })()}
                      {/* When every sentence in the place is the same
                          once its own cell is taken out of it, say it
                          once. Kelso printed « The model's own check
                          rows are firing at calcFundingSA!N712 » three
                          times over, differing only in the cell already
                          printed beside it. Checked rather than
                          assumed: the titles are compared with each
                          finding's own reference removed, so a place
                          whose sentences really differ keeps all of
                          them. */}
                      {(() => {
                        const shared = sharedSentence(place)
                        if (!shared) return null
                        return (
                          <span
                            style={{
                              fontSize: 16.5,
                              letterSpacing: '-.012em',
                              lineHeight: 1.35,
                              color: '#1c1f23',
                              textWrap: 'pretty',
                            }}
                          >
                            {shared}
                          </span>
                        )
                      })()}
                      {place.map((m) => {
                        const shared = sharedSentence(place)
                        //: The citation pill, unless the sentence has
                        //: already printed the very same reference — the
                        //: report was saying « … firing at
                        //: calcFundingSA!N712 » and then printing
                        //: « calcFundingSA!N712 » underneath it.
                        const cite = citeOf(m)
                        const doubled =
                          !!cite && saidOf(m.plain || m.title).includes(cite)
                        return (
                          <span
                            key={m.id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            {!shared && (
                              <span
                                style={{
                                  fontSize: 16.5,
                                  letterSpacing: '-.012em',
                                  lineHeight: 1.35,
                                  color: '#1c1f23',
                                  textWrap: 'pretty',
                                }}
                              >
                                {saidOf(m.plain || m.title)}
                              </span>
                            )}
                            <span
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 7,
                                paddingTop: shared ? 0 : 9,
                              }}
                            >
                              {cite && (!doubled || !!shared) && (
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
                                  {cite}
                                </span>
                              )}
                              {againstOf(m) && (
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
                                  {againstOf(m)}
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
                            {/* The evidence, only when it says something
                                the sentence above did not — several
                                checks store the same words in both. */}
                            {(m.context || m.title) !==
                              (m.plain || m.title) && (
                              <div style={{ paddingTop: 12 }}>
                                {serif(saidOf(m.context || m.title))}
                              </div>
                            )}
                          </span>
                        )
                      })}
                    </span>
                  </div>
                ))}
              </div>
              {foot(
                3,
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
                          {saidOf(one.plain || one.title)}
                        </span>
                        {citeOf(one) && (
                          <span
                            style={{
                              flex: '0 0 auto',
                              fontFamily: font.mono,
                              fontSize: 11.5,
                              color: '#9aa1ab',
                            }}
                          >
                            {citeOf(one)}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
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
              {foot(4, pages, 'Swens')}
            </>,
          )}
        </div>
      </div>
    </div>
  )
}

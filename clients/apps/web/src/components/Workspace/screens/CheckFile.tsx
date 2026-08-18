'use client'

/**
 * Check a model — the founder's private bench, wearing the model page.
 *
 * Source of truth: `docs/pierce/design-antford/workspace3.html` — the
 * same report face the deal's model page wears, because the founder
 * runs this screen to test the checker and to show it: name and state,
 * the summary in sentences, the findings as a table with the design's
 * three severity words, where they sit, the sectioned card, the right
 * rail. The idle drop zone and the running card are unchanged from the
 * earlier design; a finished check *is* a model page without a deal.
 *
 * Departures, each honest about what a one-off is:
 * - No version pill, no version bullet, no « open findings by version »
 *   bars: a loose file has one version and no history. Absent, not
 *   faked.
 * - « Accept with a note » writes the ruling into the stored check —
 *   its own endpoint — so a recent replays with the ruling standing.
 *   The deal writes to a Finding row instead; a one-off has none.
 * - No « Fix the cell »: the one-off drops the workbook after reading
 *   it, and the fix writes a verified new version of a kept file —
 *   there is nothing here to write into. If the bench should keep
 *   files, that is a named product change, not a button.
 * - No « Open the cell » either: the deal's button opens the real
 *   document (SharePoint, or the stored upload) — a one-off keeps no
 *   file, so there is nothing real to open, and a button whose
 *   destination is another view of the same grid is worse than none.
 * - The state tag speaks the report's words — Ready to send / Not
 *   ready to send — same mapping as the deal page.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  FindingGrid,
  HouseRules,
  OneOffDefect,
  OneOffResult,
  TieOutApi,
} from '../api'
import { ChatContext } from '../Chat'
import {
  cellRefInk,
  excelLogo,
  fileIcon,
  font,
  greyButton,
  ink,
  inputGlow,
  well,
} from '../design'
import {
  categoryOfKey,
  MiniGrid,
  roleOf,
  TIER_BG,
  TIER_FG,
  tierOfKey,
} from './DealPage'
import { checkedLine } from './Deals'

type Phase = 'idle' | 'running' | 'done'

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
 *  same nouns as the model page. */
const TALLY_NOUNS: Record<string, string> = {
  'balance-sheet': 'periods',
  'cash-continuity': 'accounts',
  'debt-terminal': 'tranches',
  'interest-consistency': 'tranches',
  'model-own-check': 'rows',
  'time-axis': 'sheets',
}

/** `hardcode-in-formula` → « Hardcode in formula ». */
const humanize = (key: string): string => {
  const words = key.replace(/-/g, ' ')
  return words[0] ? words[0].toUpperCase() + words.slice(1) : key
}

const comma = (n: number): string => n.toLocaleString('en-GB')

/** One failing check on this file, whatever shape its places came in. */
interface FailGroup {
  key: string
  label: string
  standard: string | null
  /** `error` or `smell` — colours the modal's severity mark. */
  severity: 'error' | 'smell'
  places: {
    text: string
    where: string
    /** The model's own name for the row, for « E41 — Opex total ». */
    name: string
    /** Where the cell's value goes, from the dependents walk. */
    flow: string
    grid: FindingGrid | null
    /** The place's own headline number, for the table's figure column. */
    figure: string
    figureUnit: string
  }[]
  /** A statement check — « Whether the accounts add up ». */
  analytical: boolean
}

//: Excel only — a model is the product's one file.
const ACCEPT = '.xlsx,.xlsm,.xls,.xlt'

/** What each kind of file wears, same mapping as the deal page. */
export const iconOf = (kind: string): string => {
  if (kind === 'model') return fileIcon.xls
  if (kind === 'deck') return fileIcon.ppt
  if (kind === 'message') return fileIcon.mail
  return fileIcon.doc
}

export const kindFor = (filename: string): string => {
  const lower = filename.toLowerCase()
  if (/\.(xlsx|xlsm|xls|xlt)$/.test(lower)) return 'model'
  if (/\.(pptx|pptm)$/.test(lower)) return 'deck'
  if (/\.(docx|doc)$/.test(lower)) return 'memo'
  return 'file'
}

export const CheckFile = ({
  api,
  organizationId,
  onChat,
  onPhase,
  resetNonce,
}: {
  api: TieOutApi
  organizationId: string
  /** What the chat should be about right now — the finished check, the
   *  open finding, or nothing. */
  onChat?: (ctx: ChatContext | null) => void
  /** The shell's header changes with the phase — « Check another »
   *  appears beside a finished check. */
  onPhase?: (phase: Phase) => void
  /** Bumped by the shell's « Check another »; a change returns to idle. */
  resetNonce?: number
}) => {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<OneOffResult | null>(null)
  const [running, setRunning] = useState<{ name: string; kind: string } | null>(
    null,
  )
  const [step, setStep] = useState(0)
  const [refusal, setRefusal] = useState('')
  const [rules, setRules] = useState<HouseRules | null>(null)
  const [sec, setSec] = useState<'pass' | 'cov' | 'model' | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [placeAt, setPlaceAt] = useState(0)
  useEffect(() => setPlaceAt(0), [picked])
  //: « Accept with a note » — the deal modal's own flow. `null` means
  //: the writing box is closed.
  const [noteText, setNoteText] = useState<string | null>(null)
  const [noteGlow, setNoteGlow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  //: Cancel forgets the request rather than aborting it — a response
  //: nobody is waiting for is simply not shown.
  const flight = useRef(0)

  useEffect(() => {
    let live = true
    api
      .houseRules(organizationId)
      .then((got) => live && setRules(got))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, organizationId])

  useEffect(() => {
    onPhase?.(phase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  //: The design's steps for a model — « Opening the workbook », the
  //: formula grid, the checks, the trace — and the file-against-itself
  //: steps for anything else.
  const steps = useMemo(() => {
    const kind = running?.kind ?? result?.kind ?? 'model'
    if (kind === 'model')
      return [
        'Opening the workbook',
        'Mapping the formula grid',
        'Running the checks',
        'Tracing each failure to its cell',
      ]
    return [
      'Reading the file',
      'Finding figures stated more than once',
      'Comparing the file against itself',
    ]
  }, [running, result])

  //: While the request is in flight the spinner walks the steps and
  //: holds on the last one; the real numbers arrive all at once.
  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(
      () => setStep((was) => Math.min(was + 1, steps.length - 1)),
      900,
    )
    return () => clearInterval(timer)
  }, [phase, steps])

  const start = async (file: File) => {
    const mine = ++flight.current
    setRunning({ name: file.name, kind: kindFor(file.name) })
    setResult(null)
    setPicked(null)
    setSec(null)
    setRefusal('')
    setStep(0)
    setPhase('running')
    try {
      const answer = await api.checkFile(file, null)
      if (flight.current !== mine) return
      setStep(steps.length)
      setResult(answer)
      //: A beat with every step green before the answer, as drawn.
      setTimeout(() => flight.current === mine && setPhase('done'), 650)
    } catch (problem) {
      if (flight.current !== mine) return
      setRefusal(
        problem instanceof ApiError
          ? problem.message
          : 'something went wrong reading that file',
      )
      setPhase('idle')
      setRunning(null)
    }
  }

  const reset = () => {
    flight.current++
    setPhase('idle')
    setResult(null)
    setRunning(null)
    setPicked(null)
    setNoteText(null)
    setSec(null)
    setRefusal('')
  }

  //: The shell's « Check another ». Zero is initial state, not a press.
  useEffect(() => {
    if (resetNonce !== undefined && resetNonce > 0) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce])

  //: The report reads the open defects; an accepted one has been ruled
  //: on and shows in the accepted line, not the table.
  const openDefects = useMemo<OneOffDefect[]>(
    () => (result?.defects ?? []).filter((one) => !one.accepted),
    [result],
  )
  const acceptedCount = (result?.defects.length ?? 0) - openDefects.length

  //: The failing checks: defects gathered by rule, the file's internal
  //: disagreements as one check between them — the model page's own
  //: arithmetic, run over a loose file.
  const fails = useMemo<FailGroup[]>(() => {
    if (result === null) return []
    const list: FailGroup[] = []
    if (result.disagreements.length > 0)
      list.push({
        key: 'solo',
        label: 'The file disagrees with itself',
        standard: null,
        analytical: false,
        severity: 'error',
        places: result.disagreements.map((one) => ({
          text: `${one.label}: ${one.first.printed} on ${one.first.location}, ${one.other.printed} on ${one.other.location}.`,
          where: `Stated ${one.statements} times`,
          name: '',
          flow: '',
          grid: null,
          figure: '',
          figureUnit: '',
        })),
      })
    const byRule = new Map<string, OneOffDefect[]>()
    for (const defect of openDefects) {
      const had = byRule.get(defect.rule)
      if (had) had.push(defect)
      else byRule.set(defect.rule, [defect])
    }
    const catalogue = new Map(
      (rules?.rules ?? []).map((rule) => [rule.key, rule.label]),
    )
    for (const [key, group] of byRule) {
      list.push({
        key,
        //: What is wrong, in the finding's own words — « Incomplete
        //: total » — with the catalogue's rule name as the fallback.
        label:
          group.find((one) => one.headline)?.headline ??
          catalogue.get(key) ??
          humanize(key),
        standard: group[0]!.standard || null,
        severity: group[0]!.severity === 'error' ? 'error' : 'smell',
        analytical: group[0]!.analytical,
        places: group.map((one) => ({
          //: The plain sentence leads; the formula is evidence.
          text: one.plain || one.detail,
          where: one.ref,
          name: one.name,
          flow: one.flow,
          grid: one.grid,
          figure: one.figure,
          figureUnit: one.figure_unit,
        })),
      })
    }
    list.sort((a, b) => b.places.length - a.places.length)
    return list
  }, [result, rules, openDefects])

  //: The chat rides beside a finished check when asked, and narrows to
  //: a finding while its modal is open. The shell owns the panel.
  useEffect(() => {
    if (onChat === undefined) return
    if (phase !== 'done' || result === null) {
      onChat(null)
      return
    }
    const group = fails.find((one) => one.key === picked)
    if (group === undefined) {
      onChat({ scope: 'file', checkId: result.id })
      return
    }
    onChat({
      scope: 'file-finding',
      checkId: result.id,
      title: group.label,
      says: group.places[0]?.text ?? '',
      explain: group.places[0]?.where ?? '',
      chain: [],
    })
  }, [onChat, phase, result, fails, picked])

  const pick = () => fileInput.current?.click()

  const pickedGroup = fails.find((one) => one.key === picked) ?? null
  //: Which of the picked check's places the modal's grid shows.
  const shownPlace = pickedGroup
    ? (pickedGroup.places[Math.min(placeAt, pickedGroup.places.length - 1)] ??
      pickedGroup.places[0]!)
    : null

  const closeModal = () => {
    setPicked(null)
    setNoteText(null)
  }

  //: « Accept with a note » — the ruling lands in the stored check, so
  //: a recent replays with it standing. Every place the rule fails is
  //: accepted together: the ruling is about the check, not one cell.
  const acceptGroup = (group: FailGroup, note: string) => {
    if (result === null) return
    setSaving(true)
    api
      .acceptCheckRule(result.id, group.key, note)
      .then((updated) => {
        setResult(updated)
        closeModal()
      })
      .catch(() => undefined)
      .then(() => setSaving(false))
  }

  //: Checks that pass / did not run — the same catalogue arithmetic as
  //: the model page, only claimed for a model whose audit actually ran.
  //: On a values-only copy the construction rules claim nothing either
  //: way; a statement check's pass row carries the engine's own tally.
  const failingKeys = new Set(fails.map((one) => one.key))
  const isModel = result?.kind === 'model'
  const valuesOnly = result?.values_only === true
  const passRows: { key: string; label: string; count: string }[] =
    isModel && rules !== null
      ? rules.rules
          .filter(
            (rule) =>
              rule.on &&
              !failingKeys.has(rule.key) &&
              (!valuesOnly || rule.analytical),
          )
          .map((rule) => {
            const tally = result?.tallies[rule.key]
            const noun = TALLY_NOUNS[rule.key] ?? ''
            return {
              key: rule.key,
              label: rule.pass_label || rule.label,
              count: !tally
                ? ''
                : tally.clean === tally.total
                  ? `${tally.total} ${noun}`
                  : `${tally.clean} of ${tally.total} ${noun}${
                      rule.key === 'model-own-check' ? ' clean' : ''
                    }`,
            }
          })
      : []
  const notRunRows: { label: string; count: string; why: string }[] =
    isModel && rules !== null
      ? rules.rules
          .filter((rule) => !rule.on)
          .map((rule) => ({
            label: rule.label,
            count: '',
            why: 'Switched off in Settings.',
          }))
      : []
  if (isModel && rules !== null) {
    const catalogue = new Map(rules.rules.map((rule) => [rule.key, rule.label]))
    const byRule = new Map<string, string[]>()
    for (const one of result?.abstentions ?? []) {
      const had = byRule.get(one.rule)
      if (had) had.push(one.why)
      else byRule.set(one.rule, [one.why])
    }
    for (const [key, whys] of byRule)
      notRunRows.push({
        label: catalogue.get(key) ?? humanize(key),
        count:
          whys.length === 1
            ? ''
            : `${whys.length} ${TALLY_NOUNS[key] ?? 'places'}`,
        why: whys[0]!,
      })
    if (valuesOnly) {
      const buildRules = rules.rules.filter(
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
  }

  const sheets = Number(result?.counts['sheets'] ?? 0)
  const formulas = Number(result?.counts['formulas'] ?? 0)
  const cellCount = Number(result?.counts['cells'] ?? 0)

  const verdictLine =
    fails.length === 0
      ? 'Everything checked passes.'
      : `${WORDS[fails.length] ?? fails.length} ${
          fails.length === 1 ? "check doesn't pass." : "checks don't pass."
        }`

  //: The report's list: every open place is one table row, in group
  //: order, numbered the way the export numbers them. A row opens the
  //: modal on its own group and place.
  let rowNumber = 0
  const tableRows = fails.flatMap((group) =>
    group.places.map((one, index) => {
      rowNumber += 1
      return {
        id: `F-${String(rowNumber).padStart(2, '0')}`,
        rowKey: `${group.key}-${index}`,
        title: one.text,
        figUnit: one.figure ? one.figureUnit : '',
        cat:
          group.key === 'solo'
            ? 'The file against itself'
            : categoryOfKey(group.key),
        where: one.where,
        fig: one.figure,
        tier:
          group.key === 'solo'
            ? ('Material' as const)
            : tierOfKey(group.key, group.severity),
        open: () => {
          setPicked(group.key)
          setPlaceAt(index)
        },
      }
    }),
  )
  const tierCount = (tier: string) =>
    tableRows.filter((one) => one.tier === tier).length
  const materialCount = tierCount('Material')
  const sevSentence = (['Material', 'Significant', 'Observation'] as const)
    .map((tier) => ({ tier, n: tierCount(tier) }))
    .filter(({ n }) => n > 0)
    .map(
      ({ tier, n }) =>
        //: « thirteen observations » — same plural rule as the deal page.
        `${(WORDS[n] ?? String(n)).toLowerCase()} ${tier.toLowerCase()}${
          tier === 'Observation' && n !== 1 ? 's' : ''
        }`,
    )
    .join(', ')
    .replace(/^./, (c) => c.toUpperCase())

  //: The header's plain state tag — the design's own words. A one-off
  //: is checked the moment it exists, so there is no stale face here.
  const clean = fails.length === 0
  const heroTag = clean ? 'Ready to send' : 'Not ready to send'
  const heroTagFg = clean ? '#137a43' : '#c9302c'
  //: « checked Tuesday 11:52 », lowered into the middle of a sentence.
  const checkedLower = result
    ? checkedLine(result.checked_at).replace(/^Checked/, 'checked')
    : ''
  const heroSub = clean
    ? `Every check passed · ${checkedLower} · on its own`
    : sevSentence
      ? `${sevSentence}.${
          materialCount > 0
            ? ' Material findings should clear before the model leaves the deal team.'
            : ''
        }`
      : ''
  const acceptedLine =
    acceptedCount === 1
      ? '1 failure accepted with a note'
      : `${acceptedCount} failures accepted with a note`

  //: « Summary of the check » — sentences composed from measured facts,
  //: dropped when there is nothing to say. No version sentence: a
  //: one-off has no history to speak about.
  const materialSheets = [
    ...new Set(
      openDefects
        .filter((one) => tierOfKey(one.rule, one.severity) === 'Material')
        .map((one) => one.sheet)
        .filter(Boolean),
    ),
  ]
  const summaryBullets: string[] = []
  if (!clean && tableRows.length > 0) {
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
  for (const one of openDefects) {
    if (one.sheet) bySheet.set(one.sheet, (bySheet.get(one.sheet) ?? 0) + 1)
  }
  const sheetRows = [...bySheet.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, hits]) => ({
      name,
      role: roleOf(name),
      n: `${hits} ${hits === 1 ? 'finding' : 'findings'}`,
    }))
  const sheetsNote =
    sheets > sheetRows.length && sheetRows.length > 0
      ? `The other ${sheets - sheetRows.length} sheets carry no open findings.`
      : ''

  //: The right rail — the run's facts. No version bars: one version.
  const railItems = result
    ? [
        { k: 'File', v: result.filename },
        {
          k: 'Checked',
          v: `${checkedLine(result.checked_at).replace(/^Checked /, '')}, on its own`,
        },
        {
          k: 'Read',
          v: [
            sheets > 0 ? `${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}` : '',
            cellCount > 0 ? `${comma(cellCount)} cells` : '',
            formulas > 0 ? `${comma(formulas)} formulas` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        },
        { k: 'Standards', v: 'FAST · ICAEW · the model’s own checks' },
        {
          k: 'Coverage',
          v: `${passRows.length + fails.length} checks · ${notRunRows.length} did not run`,
        },
      ].filter((item) => item.v)
    : []

  //: The section rows, in the design's order. Each: label · count ·
  //: chevron, expansion on `#fafafc`.
  const sectionRow = (
    key: 'pass' | 'cov' | 'model',
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
          transform: sec === key ? 'rotate(90deg)' : 'none',
          transition: 'transform .18s ease',
        }}
      >
        <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
      </svg>
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
        background: phase === 'done' ? '#fff' : well,
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void start(file)
        }}
      />

      {phase === 'idle' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 0',
          }}
        >
          <span
            style={{
              fontSize: 21,
              letterSpacing: '-.02em',
              textAlign: 'center',
              textWrap: 'balance',
            }}
          >
            Would this model survive its audit today?
          </span>
          <span
            style={{
              fontSize: 14.5,
              color: ink.secondary,
              lineHeight: 1.5,
              marginTop: 7,
              maxWidth: '40ch',
              textAlign: 'center',
              textWrap: 'pretty',
            }}
          >
            Drop a model in and Ances runs the checks a model auditor runs.
            Nothing to set up.
          </span>
          <button
            onClick={pick}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(false)
              const file = event.dataTransfer.files?.[0]
              if (file) void start(file)
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              maxWidth: 460,
              marginTop: 26,
              background: '#fff',
              border: `1px dashed ${dragOver ? ink.accent : '#d3d3d9'}`,
              borderRadius: 20,
              padding: '44px 36px 40px',
              font: 'inherit',
              color: ink.primary,
              cursor: 'pointer',
              boxShadow: dragOver
                ? '0 6px 20px rgba(16,20,28,.09)'
                : '0 1px 2px rgba(0,0,0,.04)',
              transition: 'border-color .16s ease, box-shadow .16s ease',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={excelLogo}
              alt=""
              style={{ width: 34, height: 34, objectFit: 'contain' }}
            />
            <span
              style={{ fontSize: 16, letterSpacing: '-.014em', marginTop: 16 }}
            >
              Drag a model here
            </span>
            <span style={{ fontSize: 14, color: ink.accent, marginTop: 6 }}>
              or choose a file
            </span>
            <span
              style={{ fontSize: 12.5, color: ink.secondary, marginTop: 14 }}
            >
              .xlsx · .xlsm · up to 250 MB
            </span>
          </button>
          {refusal !== '' && (
            //: The server's own sentence, shown as an answer — the
            //: design draws no refusal state.
            <span
              style={{
                fontSize: 13,
                color: ink.danger,
                marginTop: 18,
                maxWidth: '48ch',
                textAlign: 'center',
                textWrap: 'pretty',
              }}
            >
              {refusal}
            </span>
          )}
          <span
            style={{
              fontSize: 13,
              color: '#a1a1a6',
              marginTop: 18,
              maxWidth: '44ch',
              textAlign: 'center',
              textWrap: 'pretty',
            }}
          >
            Against the FAST and ICAEW standards. Ances reports what it found,
            not an audit opinion.
          </span>
        </div>
      )}

      {phase === 'running' && running !== null && (
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
              maxWidth: 620,
              background: 'rgba(255,255,255,.62)',
              backdropFilter: 'blur(30px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
              border: '1px solid rgba(255,255,255,.95)',
              borderRadius: 18,
              boxShadow:
                '0 16px 40px rgba(16,20,28,.16), inset 0 1px 0 rgba(255,255,255,.95)',
              padding: '26px 28px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={excelLogo}
                alt=""
                style={{
                  flex: '0 0 30px',
                  width: 30,
                  height: 30,
                  objectFit: 'contain',
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: '-.02em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {running.name}
                </span>
              </span>
              <button
                onClick={reset}
                style={{
                  flex: '0 0 auto',
                  ...greyButton,
                  borderRadius: 9,
                  padding: '8px 15px',
                }}
              >
                Cancel
              </button>
            </div>

            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: 'rgba(21,23,27,.09)',
                marginTop: 20,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((step / steps.length) * 100)}%`,
                  background: ink.accent,
                  borderRadius: 3,
                  transition: 'width .45s ease',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
                marginTop: 20,
              }}
            >
              {steps.map((label, index) => (
                <div
                  key={label}
                  style={{ display: 'flex', alignItems: 'center', gap: 11 }}
                >
                  <span
                    style={{
                      flex: '0 0 18px',
                      width: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {index < step ? (
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#34c759"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="5,12.5 10,17.5 19,6.5" />
                      </svg>
                    ) : index === step ? (
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          border: '2px solid rgba(0,96,208,.25)',
                          borderTopColor: ink.accent,
                          animation: 'pcSpin .7s linear infinite',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: '#d2d2d7',
                        }}
                      />
                    )}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 15,
                      color: index <= step ? ink.primary : ink.faint,
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && result !== null && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: '1 1 0', minWidth: 0, overflow: 'auto' }}>
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
              }}
            >
              {/* The report's main column — the model page's own
                  Workspace 3 layout, over a loose file. */}
              <div
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  overflow: 'hidden',
                  padding: '28px 36px 52px',
                }}
              >
                {/* Name · state tag. No version pill: one version. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span
                    style={{
                      flex: '0 1 auto',
                      minWidth: 0,
                      fontSize: 23,
                      fontWeight: 600,
                      letterSpacing: '-.022em',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {result.filename}
                  </span>
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
                </div>
                {clean ? (
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
                    Everything checked passes. {heroSub}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 15,
                        lineHeight: 1.45,
                        marginTop: 8,
                      }}
                    >
                      {verdictLine}
                    </div>
                    {heroSub && (
                      <div
                        style={{
                          fontSize: 14,
                          color: '#86868b',
                          lineHeight: 1.55,
                          marginTop: 5,
                          maxWidth: '82ch',
                          textWrap: 'pretty',
                        }}
                      >
                        {heroSub}
                      </div>
                    )}
                  </>
                )}
                {acceptedCount > 0 && (
                  <div
                    style={{ fontSize: 13.5, color: '#a1a1a6', marginTop: 6 }}
                  >
                    {acceptedLine}
                  </div>
                )}

                {/* A values-only copy says so before anything else. */}
                {valuesOnly && (
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
                    This copy carries values only — the construction checks
                    could not read it; the statement checks did.
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
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
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
                {tableRows.length > 0 && (
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
                        key={row.rowKey}
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
                {sheetRows.length > 0 && (
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

                {/* The sectioned rows, as the report draws them. */}
                {(passRows.length > 0 || notRunRows.length > 0 || isModel) && (
                  <div
                    style={{ marginTop: 44, borderTop: '.5px solid #eceaec' }}
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
                        {passRows.map((rule, index) => (
                          <div
                            key={rule.key}
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
                              {rule.label}
                            </span>
                            <span
                              style={{
                                flex: '0 0 auto',
                                fontSize: 12.5,
                                color: ink.clean,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {rule.count}
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

                    {isModel &&
                      sectionRow(
                        'model',
                        'The model',
                        '',
                        passRows.length === 0 && notRunRows.length === 0,
                      )}
                    {sec === 'model' && (
                      <div
                        style={{
                          background: '#fafafc',
                          borderTop: '.5px solid #f0eff1',
                        }}
                      >
                        <div style={{ padding: '11px 20px 12px 32px' }}>
                          <div style={{ fontSize: 14.5, color: '#3a3a3c' }}>
                            {result.filename}
                          </div>
                          {(sheets > 0 || formulas > 0) && (
                            <div
                              style={{
                                fontSize: 13,
                                color: '#a1a1a6',
                                marginTop: 2,
                              }}
                            >
                              {[
                                sheets > 0
                                  ? `${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}`
                                  : null,
                                formulas > 0
                                  ? `${comma(formulas)} formulas`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* The right rail — the run's facts. No version bars:
                  a one-off has one version. */}
              {railItems.length > 0 && (
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
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {item.v}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* The picked check — the model page's modal: what is wrong,
          where, why; the cell in its neighbourhood; the places; and
          the verbs. « Fix the cell » is deliberately not here: the
          one-off drops the workbook after reading it, and a fix writes
          a verified new version of a kept file. */}
      {pickedGroup !== null && shownPlace !== null && result !== null && (
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
                {/* What is wrong — then where, then why. The dot is the
                    severity, borrowed from the panel's mark. */}
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
                        pickedGroup.severity === 'error'
                          ? '#ff3b30'
                          : '#e8a33d',
                    }}
                  />
                  {pickedGroup.label}
                </span>
                {/* « E41 — Total Senior Debt Service » — the cell, then
                    the model's own name for its row. */}
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    color: '#a1a1a6',
                    marginTop: 5,
                  }}
                >
                  {[
                    [shownPlace.where, shownPlace.name]
                      .filter(Boolean)
                      .join(' — '),
                    pickedGroup.places.length > 1
                      ? `${pickedGroup.places.length} places`
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
              {shownPlace.text}
            </div>

            {/* The design's little Excel grid — the picked place's
                cell in its own neighbourhood. */}
            {shownPlace.grid && <MiniGrid grid={shownPlace.grid} />}

            {/* No place-list: the findings table already itemizes
                every place as its own row — repeating them here read
                as bloat, the founder's word. */}

            {/* The consequence, in the model's own words — where the
                cell's value goes, from the dependents walk. */}
            {shownPlace.flow && (
              <div
                style={{
                  fontSize: 14.5,
                  color: '#3a3a3c',
                  lineHeight: 1.55,
                  marginTop: 14,
                  maxWidth: '62ch',
                  textWrap: 'pretty',
                }}
              >
                Flows into {shownPlace.flow}.
              </div>
            )}

            {noteText === null ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                {pickedGroup.key !== 'solo' && (
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
                )}
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13.5, color: ink.secondary }}>
                  Why is this acceptable? The note is kept with the check and
                  shown when it is opened again.
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
                      noteReady &&
                      !saving &&
                      acceptGroup(pickedGroup, (noteText ?? '').trim())
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

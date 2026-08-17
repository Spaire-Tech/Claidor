'use client'

/**
 * Check a model — the Antford front door, wired to the one-off check.
 *
 * Source of truth: `docs/pierce/design-antford/workspace.html`, the
 * `vCheck` block. Four states, as drawn: `cFirst` (nothing connected,
 * nothing checked), `cIdle` (« Would this model survive its audit
 * today? » over the dashed drop zone), `cRunning` (the glassy progress
 * card with its staged steps), `cDone` (the verdict, the failing checks
 * as cards, and the sectioned card beneath — the model page's own
 * shapes, because a finished one-off *is* a model page without a deal).
 *
 * What the redesign cut, cut here too: the against-picker and the
 * recent-checks list are not drawn in the Antford design and are not
 * rendered — the API still takes `against` for the panel's sake, this
 * screen simply checks the file on its own. Flagged to the founder.
 *
 * Departures, each at its code site:
 * - The one-off keeps no state, so the fail modal has no « Accept with
 *   a note » — a dismissal here would not survive a replay. Close is
 *   the only verb.
 * - The fail cards' tag slot says how many places the check fails at;
 *   the deal page's « new since version N » needs a history a one-off
 *   does not have.
 * - The running card's step notes fill when the answer lands — the real
 *   check is one request whose numbers all arrive together.
 * - The design draws no refusal state; the server's sentence is shown
 *   in the idle face's small print, as an answer rather than an error.
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
import { excelLogo, fileIcon, greyButton, ink, listCard, well } from '../design'
import { FailCard, failGrid, failHead, MiniGrid } from './DealPage'

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
  }[]
  /** A statement check — « Whether the accounts add up ». */
  analytical: boolean
  /** The card's headline: the engine's figure for a statement check,
   *  the count of places for anything else. */
  figure: string
  figureUnit: string
  /** The mono line under the sentence. */
  whereLine: string
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
    setSec(null)
    setRefusal('')
  }

  //: The shell's « Check another ». Zero is initial state, not a press.
  useEffect(() => {
    if (resetNonce !== undefined && resetNonce > 0) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce])

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
        figure: String(result.disagreements.length),
        figureUnit:
          result.disagreements.length === 1
            ? 'figure told two ways inside the file'
            : 'figures told two ways inside the file',
        whereLine: result.disagreements[0]!.first.location,
        severity: 'error',
        places: result.disagreements.map((one) => ({
          text: `${one.label}: ${one.first.printed} on ${one.first.location}, ${one.other.printed} on ${one.other.location}.`,
          where: `Stated ${one.statements} times`,
          name: '',
          flow: '',
          grid: null,
        })),
      })
    const byRule = new Map<string, OneOffDefect[]>()
    for (const defect of result.defects) {
      const had = byRule.get(defect.rule)
      if (had) had.push(defect)
      else byRule.set(defect.rule, [defect])
    }
    const catalogue = new Map(
      (rules?.rules ?? []).map((rule) => [rule.key, rule.label]),
    )
    for (const [key, group] of byRule) {
      const analytical = group[0]!.analytical
      //: The headline — the engine's figure for a statement check
      //: (worst first, by magnitude), the count of places otherwise.
      const magnitude = (one: OneOffDefect) => {
        const parsed = Number(one.figure.replace(/,/g, ''))
        return Number.isFinite(parsed) ? Math.abs(parsed) : 0
      }
      const carrying = group.filter((one) => one.figure)
      const worst =
        carrying.length > 0
          ? [...carrying].sort((a, b) => magnitude(b) - magnitude(a))[0]!
          : group[0]!
      //: The ref already carries its sheet — « Depreciation
      //: Schedule!Z105 » — prefixing the sheet again printed it twice,
      //: which the founder read live. The ref stands as it is.
      const first = worst.ref
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
        analytical,
        figure: worst.figure || String(group.length),
        figureUnit: worst.figure
          ? worst.figure_unit
          : group.length === 1
            ? 'place in the model'
            : 'places in the model',
        whereLine:
          group.length === 1 ? first : `${first} · ${group.length} places`,
        places: group.map((one) => ({
          //: The plain sentence leads; the formula is evidence.
          text: one.plain || one.detail,
          where: one.ref,
          name: one.name,
          flow: one.flow,
          grid: one.grid,
        })),
      })
    }
    list.sort((a, b) => b.places.length - a.places.length)
    return list
  }, [result, rules])

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

  const verdictLine =
    fails.length === 0
      ? 'Everything checked passes.'
      : `${WORDS[fails.length] ?? fails.length} ${
          fails.length === 1 ? "check doesn't pass." : "checks don't pass."
        }`

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
            Drop a model in and Antford runs the checks a model auditor runs.
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
            Against the FAST and ICAEW standards. Antford reports what it found,
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
            <div style={{ padding: '4px 6px 2px' }}>
              {fails.length === 0 ? (
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
              ) : (
                <div
                  style={{
                    fontSize: 21,
                    letterSpacing: '-.02em',
                    lineHeight: 1.2,
                  }}
                >
                  {verdictLine}
                </div>
              )}
              <div
                style={{ fontSize: 14.5, color: ink.secondary, marginTop: 7 }}
              >
                {result.filename} · checked on its own
              </div>
            </div>

            {/* A values-only copy says so before any card. */}
            {valuesOnly && (
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
                This copy carries values only — the construction checks could
                not read it; the statement checks did.
              </div>
            )}

            {/* The failing checks, in the v2 design's two families —
                the same sections and card face as the model page. The
                solo card (the file disagreeing with itself) keeps the
                untitled grid above both, like the tie-out's card. */}
            {fails.some((one) => one.key === 'solo') && (
              <div style={{ ...failGrid, marginTop: 18 }}>
                {fails
                  .filter((one) => one.key === 'solo')
                  .map((group) => (
                    <FailCard
                      key={group.key}
                      figure={group.figure}
                      figureUnit={group.figureUnit}
                      label={group.label}
                      where={group.whereLine}
                      tag=""
                      onPick={() => setPicked(group.key)}
                    />
                  ))}
              </div>
            )}
            {fails.some((one) => one.key !== 'solo' && !one.analytical) && (
              <>
                {failHead('How the model is built', true)}
                <div style={failGrid}>
                  {fails
                    .filter((one) => one.key !== 'solo' && !one.analytical)
                    .map((group) => (
                      <FailCard
                        key={group.key}
                        figure={group.figure}
                        figureUnit={group.figureUnit}
                        label={group.label}
                        where={group.whereLine}
                        tag=""
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
                        where={group.whereLine}
                        tag=""
                        onPick={() => setPicked(group.key)}
                      />
                    ))}
                </div>
              </>
            )}

            {(passRows.length > 0 || notRunRows.length > 0 || isModel) && (
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
                            formulas > 0 ? `${comma(formulas)} formulas` : null,
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
        </div>
      )}

      {/* The picked check — the model page's modal, without the accept:
          a one-off keeps no state for a note to live in. */}
      {pickedGroup !== null && shownPlace !== null && (
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
            onClick={() => setPicked(null)}
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
                onClick={() => setPicked(null)}
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

            {pickedGroup.places.length > 1 && (
              //: Picking a place swaps the grid above to that cell.
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: '0 0 0 .5px rgba(0,0,0,.08)',
                }}
              >
                {pickedGroup.places.map((one, index) => (
                  <button
                    key={`${one.where}-${index}`}
                    onClick={() => setPlaceAt(index)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      font: 'inherit',
                      cursor: 'pointer',
                      background: index === placeAt ? '#f2f6fd' : '#fafafc',
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
                      {one.text}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: index === placeAt ? ink.accent : '#a1a1a6',
                        marginTop: 2,
                      }}
                    >
                      {one.where}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

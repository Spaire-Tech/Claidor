'use client'

/**
 * Check a file — the founder's design, wired to the one-off check.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `vCheck` block.
 * Four states, exactly as drawn: `cIdle` (the drop card, the against
 * picker, the recents), `cRunning` (the glassy progress card),
 * `cDone` (the tally and the findings), `cFirst` (nothing checked and
 * nothing connected yet).
 *
 * Where this build deliberately departs from the drawing, each departure
 * is at its code site and in the worklog:
 *
 * - The design's solo run shows a « Checking that totals add up » step
 *   and a « totals checked » tally. The engine deliberately does not
 *   check totals yet (see `polar/tieout/solo.py` — a totals check that
 *   guesses its columns reports correct tables as broken), so that step
 *   and that tally are omitted rather than shown as theatre.
 * - The finding cards' « Rebase / Reconcile » and « Not a problem »
 *   buttons are omitted. A one-off check keeps no file, so there is
 *   nothing to write a correction into, and a dismissal here would not
 *   survive a replay. Buttons that do nothing are lies; flagged to the
 *   founder rather than wired to a no-op.
 * - The design animates step notes as each step completes. The real
 *   check is one request whose numbers all arrive together, so the
 *   notes fill when the answer lands and the steps tick through while
 *   it is in flight.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  DealListItem,
  ModelGrid,
  OneOffDefect,
  OneOffDrift,
  OneOffResult,
  RecentCheck,
  SoloFinding,
  SoloStatement,
  TieOutApi,
} from '../api'
import { ChatContext } from '../Chat'
import {
  fileIcon,
  font,
  greyButton,
  ink,
  listCard,
  sectionHead,
  well,
} from '../design'
import { ago } from './DealPage'

/** What each kind of file wears, same mapping as the deal page. */
export const iconOf = (kind: string): string => {
  if (kind === 'model') return fileIcon.xls
  if (kind === 'deck') return fileIcon.ppt
  if (kind === 'message') return fileIcon.mail
  return fileIcon.doc
}

/** « slide 12 » → « Slide 12 ». */
const cap = (text: string): string =>
  text ? text[0]!.toUpperCase() + text.slice(1) : text

/** Small counts read as words, same voice as the deal page. */
const asWords = (n: number): string => {
  const words = [
    'no',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ]
  return n < words.length ? words[n]! : String(n)
}

/** The recents column's right-hand word — « Yesterday », « Tuesday »,
 *  « 2 August » — the design's own three registers. */
const dayWord = (at: string): string => {
  const then = new Date(at)
  const now = new Date()
  if (then.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday'
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000)
  if (days < 7) return then.toLocaleDateString([], { weekday: 'long' })
  return then.toLocaleDateString([], { day: 'numeric', month: 'long' })
}

/** « deck » / « memo » / « file » — the word the sentences use. */
const kindWord = (kind: string): string =>
  kind === 'deck' ? 'deck' : kind === 'memo' ? 'memo' : 'file'

type Phase = 'idle' | 'running' | 'done' | 'refused'

/** One card's worth of finding, whatever shape it came in. */
type Card =
  | { key: string; shape: 'solo'; solo: SoloFinding }
  | { key: string; shape: 'drift'; drift: OneOffDrift }
  | { key: string; shape: 'defect'; defect: OneOffDefect }

const ACCEPT = '.pptx,.pptm,.docx,.doc,.xlsx,.xlsm,.xls,.xlt'

export const CheckFile = ({
  api,
  deals,
  onChat,
}: {
  api: TieOutApi
  /** The deals this person is on — the against picker's list. Null while
   *  the shell is still asking. */
  deals: DealListItem[] | null
  /** What the chat should be about right now — the finished check, the
   *  open finding, or nothing. */
  onChat?: (ctx: ChatContext | null) => void
}) => {
  const [phase, setPhase] = useState<Phase>('idle')
  const [against, setAgainst] = useState<DealListItem | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [recents, setRecents] = useState<RecentCheck[] | null>(null)
  const [result, setResult] = useState<OneOffResult | null>(null)
  //: The filename shown on the running card before the answer exists.
  const [running, setRunning] = useState<{ name: string; kind: string } | null>(
    null,
  )
  const [step, setStep] = useState(0)
  const [refusal, setRefusal] = useState('')
  const [openCard, setOpenCard] = useState<string | null>(null)
  //: The model grids the drift cards' evidence reads, one per artifact,
  //: loaded the first time a card that needs one opens.
  const [grids, setGrids] = useState<Record<string, ModelGrid | null>>({})
  const fileInput = useRef<HTMLInputElement | null>(null)
  //: Cancel forgets the request rather than aborting it — the design's
  //: Cancel returns to idle, and a response nobody is waiting for is
  //: simply not shown.
  const flight = useRef(0)

  useEffect(() => {
    let live = true
    api
      .recentChecks()
      .then((found) => live && setRecents(found))
      .catch(() => live && setRecents([]))
    return () => {
      live = false
    }
  }, [api, result])

  //: Steps as the design names them; the totals step is omitted, see the
  //: file comment. Which list runs depends on what is being checked.
  const steps = useMemo(() => {
    const kind = running?.kind ?? result?.kind ?? 'deck'
    if (kind === 'model')
      return ['Reading the file', 'Checking it against itself']
    if (against !== null && phase !== 'done')
      return [
        'Reading the file',
        'Reading the model as it stands now',
        'Matching labels across both',
        'Comparing the figures that matched',
      ]
    if (result !== null && result.against !== '')
      return [
        'Reading the file',
        'Reading the model as it stands now',
        'Matching labels across both',
        'Comparing the figures that matched',
      ]
    return [
      'Reading the file',
      'Finding figures stated more than once',
      'Comparing the file against itself',
    ]
  }, [running, result, against, phase])

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
    setOpenCard(null)
    setRefusal('')
    setStep(0)
    setPhase('running')
    try {
      const answer = await api.checkFile(file, against?.id ?? null)
      if (flight.current !== mine) return
      setStep(steps.length)
      setResult(answer)
      //: A beat with every step green before the answer, as drawn.
      setTimeout(() => flight.current === mine && setPhase('done'), 650)
    } catch (problem) {
      if (flight.current !== mine) return
      //: The server's own sentence, shown in place. The design draws no
      //: refusal state; the metadata panel's « shown as an answer, not
      //: an error » pattern is the one borrowed.
      setRefusal(
        problem instanceof ApiError
          ? problem.message
          : 'something went wrong reading that file',
      )
      setPhase('refused')
    }
  }

  const reopen = async (recent: RecentCheck) => {
    try {
      const stored = await api.oneOffCheck(recent.id)
      setRunning(null)
      setOpenCard(null)
      setResult(stored)
      setPhase('done')
    } catch {
      //: A recent that cannot be fetched stays a row; nothing to show.
    }
  }

  const reset = () => {
    flight.current++
    setPhase('idle')
    setResult(null)
    setRunning(null)
    setOpenCard(null)
  }

  const needGrid = (artifactId: string) => {
    if (artifactId in grids) return
    setGrids((was) => ({ ...was, [artifactId]: null }))
    api
      .grid(artifactId)
      .then((grid) => setGrids((was) => ({ ...was, [artifactId]: grid })))
      .catch(() => undefined)
  }

  //: One list of cards, drifts first: what the file says against the
  //: model is the sharper fact when a deal was picked, and the solo
  //: disagreements ride along after it either way.
  const cards: Card[] = useMemo(() => {
    if (result === null) return []
    return [
      ...result.drifts.map(
        (drift, index): Card => ({ key: `d${index}`, shape: 'drift', drift }),
      ),
      ...result.disagreements.map(
        (solo, index): Card => ({ key: `s${index}`, shape: 'solo', solo }),
      ),
      ...result.defects.map(
        (defect, index): Card => ({
          key: `a${index}`,
          shape: 'defect',
          defect,
        }),
      ),
    ]
  }, [result])

  //: The design opens the chat beside a finished check, and on a finding
  //: as its card opens. The shell owns the panel; this reports what the
  //: conversation is about.
  useEffect(() => {
    if (onChat === undefined) return
    if (phase !== 'done' || result === null) {
      onChat(null)
      return
    }
    const card = cards.find((one) => one.key === openCard)
    if (card === undefined) {
      onChat({ scope: 'file', checkId: result.id })
      return
    }
    const head = headOf(card, result.kind)
    onChat({
      scope: 'file-finding',
      checkId: result.id,
      title: head.title,
      says: head.says,
      explain: explainOf(card, result.kind),
      chain: chainOf(card),
    })
  }, [onChat, phase, result, cards, openCard])

  //: The design's `cFirst`: nothing checked and nothing to check against
  //: yet. The design keys this on the workspace's notConnected prop; the
  //: nearest real fact is « no deals and no recents », which is what a
  //: person sees before anything is connected.
  const first =
    phase === 'idle' &&
    deals !== null &&
    deals.length === 0 &&
    recents !== null &&
    recents.length === 0

  const pick = () => fileInput.current?.click()

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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '28px 34px 34px',
          display: 'flex',
          justifyContent: 'center',
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files?.[0]
          if (file && phase === 'idle') void start(file)
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 760,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {phase === 'running' && running !== null && (
            <RunningCard
              name={running.name}
              kind={running.kind}
              against={against?.name ?? ''}
              steps={steps}
              step={step}
              notes={stepNotes(steps.length, step, result)}
              onCancel={reset}
            />
          )}

          {phase === 'refused' && running !== null && (
            //: Borrowed face: the white result card carrying the
            //: server's sentence where the tally would sit.
            <div style={{ ...listCard, padding: '22px 24px' }}>
              <FileLine name={running.name} kind={running.kind} sub={refusal} />
              <button
                onClick={reset}
                style={{
                  ...greyButton,
                  alignSelf: 'flex-start',
                  marginTop: 14,
                }}
              >
                Check another
              </button>
            </div>
          )}

          {phase === 'done' && result !== null && (
            <>
              <div
                style={{
                  ...listCard,
                  padding: '22px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <FileLine
                  name={result.filename}
                  kind={result.kind}
                  sub={`Checked ${
                    result.against ? `against ${result.against}` : 'on its own'
                  } · ${ago(result.checked_at)}`}
                />
                <button
                  onClick={reset}
                  style={{
                    ...greyButton,
                    alignSelf: 'flex-start',
                    marginTop: 14,
                  }}
                >
                  Check another
                </button>

                {result.against !== '' && result.models.length > 0 && (
                  <ComparedWith result={result} />
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: 26,
                    marginTop: 20,
                    flexWrap: 'wrap',
                  }}
                >
                  {tally(result).map((entry) => (
                    <span key={entry.label} style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 25,
                          fontWeight: 600,
                          letterSpacing: '-.025em',
                          color: entry.fg,
                        }}
                      >
                        {entry.value}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: ink.secondary,
                          marginTop: 1,
                        }}
                      >
                        {entry.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {cards.length > 0 && (
                <>
                  <div style={{ ...sectionHead, padding: '26px 4px 9px' }}>
                    Findings
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {cards.map((card) => (
                      <FindingCard
                        key={card.key}
                        card={card}
                        kind={result.kind}
                        open={openCard === card.key}
                        onToggle={() => {
                          const closing = openCard === card.key
                          setOpenCard(closing ? null : card.key)
                          if (
                            !closing &&
                            card.shape === 'drift' &&
                            card.drift.model_artifact_id
                          )
                            needGrid(card.drift.model_artifact_id)
                        }}
                        grids={grids}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {first && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
              }}
            >
              <div
                style={{
                  maxWidth: 380,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <UploadGlyph size={52} strokeWidth={1.2} />
                <span
                  style={{
                    fontSize: 23,
                    fontWeight: 500,
                    letterSpacing: '-.022em',
                    lineHeight: 1.25,
                    marginTop: 22,
                  }}
                >
                  Nothing checked yet
                </span>
                <span
                  style={{
                    fontSize: 14.5,
                    color: ink.secondary,
                    lineHeight: 1.55,
                    marginTop: 8,
                    textWrap: 'pretty',
                  }}
                >
                  A deck, a model or a memo. Pierce reads it and tells you where
                  it disagrees with itself.
                </span>
                <button
                  onClick={pick}
                  style={{
                    width: 270,
                    marginTop: 30,
                    border: 0,
                    background: ink.accent,
                    color: '#fff',
                    borderRadius: 11,
                    padding: '12px 22px',
                    font: 'inherit',
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: '-.01em',
                    cursor: 'pointer',
                  }}
                >
                  Choose a file
                </button>
                <span
                  style={{
                    fontSize: 13,
                    color: '#a1a1a6',
                    lineHeight: 1.55,
                    marginTop: 16,
                    textWrap: 'pretty',
                  }}
                >
                  No deal needed.
                </span>
              </div>
            </div>
          )}

          {phase === 'idle' && !first && (
            <div>
              <div
                style={{
                  ...listCard,
                  padding: 34,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <UploadGlyph size={34} strokeWidth={1.4} />
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    letterSpacing: '-.015em',
                    marginTop: 14,
                  }}
                >
                  Drop a file to check it
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: ink.secondary,
                    marginTop: 4,
                    maxWidth: '44ch',
                  }}
                >
                  A deck, a model, a memo. Pierce reads it and tells you where
                  it disagrees with itself.
                </div>
                <button
                  onClick={pick}
                  style={{
                    marginTop: 18,
                    border: 0,
                    background: ink.accent,
                    color: '#fff',
                    borderRadius: 11,
                    padding: '10px 20px',
                    font: 'inherit',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Choose a file
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '26px 4px 9px',
                }}
              >
                <span style={sectionHead}>Check it against</span>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setMenuOpen((was) => !was)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    ...listCard,
                    font: 'inherit',
                    cursor: 'pointer',
                    padding: '15px 16px 15px 20px',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 16,
                      fontWeight: 500,
                      letterSpacing: '-.015em',
                      color: against ? ink.primary : '#8e8e93',
                    }}
                  >
                    {against?.name ?? 'Nothing selected'}
                  </span>
                  <svg
                    width="13"
                    height="18"
                    viewBox="0 0 13 18"
                    fill="none"
                    stroke="#8e8e93"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 13px' }}
                  >
                    <polyline points="3.5,7.5 6.5,4 9.5,7.5" />
                    <polyline points="3.5,10.5 6.5,14 9.5,10.5" />
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div
                      onClick={() => setMenuOpen(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 19 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        background: 'rgba(255,255,255,.86)',
                        backdropFilter: 'blur(28px) saturate(1.8)',
                        WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
                        borderRadius: 13,
                        boxShadow:
                          '0 12px 34px rgba(0,0,0,.18), 0 0 0 .5px rgba(0,0,0,.08)',
                        padding: 6,
                        maxHeight: 280,
                        overflow: 'auto',
                        animation: 'pcIn .14s ease both',
                      }}
                    >
                      {(deals ?? []).map((one) => (
                        <button
                          key={one.id}
                          onClick={() => {
                            setAgainst(against?.id === one.id ? null : one)
                            setMenuOpen(false)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            background: 'transparent',
                            borderRadius: 8,
                            font: 'inherit',
                            fontSize: 15,
                            cursor: 'pointer',
                            padding: '9px 12px',
                          }}
                        >
                          <span
                            style={{
                              flex: '0 0 16px',
                              width: 16,
                              display: 'flex',
                              color: ink.accent,
                            }}
                          >
                            {against?.id === one.id && (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="5,12.5 10,17.5 19,6.5" />
                              </svg>
                            )}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            {one.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {(recents?.length ?? 0) > 0 && (
                <>
                  <div style={{ ...sectionHead, padding: '26px 4px 9px' }}>
                    Recent one-off checks
                  </div>
                  <div style={{ ...listCard, overflow: 'hidden' }}>
                    {recents!.map((recent, index) => (
                      <button
                        key={recent.id}
                        onClick={() => void reopen(recent)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          borderTop: index === 0 ? '0' : '.5px solid #eceaec',
                          background: 'transparent',
                          font: 'inherit',
                          cursor: 'pointer',
                          padding: '14px 16px 14px 20px',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={iconOf(recent.kind)}
                          alt=""
                          style={{
                            flex: '0 0 20px',
                            width: 20,
                            height: 20,
                            objectFit: 'contain',
                          }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 16,
                              fontWeight: 500,
                              letterSpacing: '-.015em',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {recent.filename}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 13.5,
                              color: ink.secondary,
                              marginTop: 2,
                            }}
                          >
                            {recent.against
                              ? `Checked against ${recent.against}`
                              : 'Checked on its own'}
                          </span>
                        </span>
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 12.5,
                            color: ink.faint,
                          }}
                        >
                          {dayWord(recent.checked_at)}
                        </span>
                        <svg
                          width="9"
                          height="15"
                          viewBox="0 0 9 15"
                          fill="none"
                          stroke="#c7c7cc"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flex: '0 0 9px' }}
                        >
                          <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The upload arrow the design draws twice, at two weights. */
const UploadGlyph = ({
  size,
  strokeWidth,
}: {
  size: number
  strokeWidth: number
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={ink.accent}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 15.5V4" />
    <polyline points="7.5,8.5 12,4 16.5,8.5" />
    <path d="M4.5 14.5v4A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-4" />
  </svg>
)

/** Icon, filename, sub-line — the header both result cards share. */
const FileLine = ({
  name,
  kind,
  sub,
}: {
  name: string
  kind: string
  sub: string
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={iconOf(kind)}
      alt=""
      style={{ flex: '0 0 30px', width: 30, height: 30, objectFit: 'contain' }}
    />
    <span style={{ flex: 1, minWidth: 0 }}>
      <span
        style={{
          display: 'block',
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '-.02em',
        }}
      >
        {name}
      </span>
      <span
        style={{
          display: 'block',
          fontSize: 13.5,
          color: ink.secondary,
          marginTop: 2,
        }}
      >
        {sub}
      </span>
    </span>
  </div>
)

/** What the file's name says it is, for the running card before the
 *  server has answered. */
export const kindFor = (filename: string): string => {
  const suffix = filename.toLowerCase().split('.').pop() ?? ''
  if (['xlsx', 'xlsm', 'xls', 'xlt'].includes(suffix)) return 'model'
  if (['pptx', 'pptm'].includes(suffix)) return 'deck'
  if (['docx', 'doc'].includes(suffix)) return 'memo'
  return 'file'
}

/** The notes on completed steps — real numbers, only once they exist. */
const stepNotes = (
  count: number,
  step: number,
  result: OneOffResult | null,
): string[] => {
  if (result === null) return Array.from({ length: count }, () => '')
  const counts = result.counts
  const read =
    result.kind === 'model'
      ? `${counts.cells ?? 0} cells`
      : counts.slides
        ? `${counts.slides} slides`
        : `${counts.figures ?? 0} figures`
  if (result.kind === 'model')
    return [read, `${counts.errors ?? 0} errors · ${counts.smells ?? 0} smells`]
  if (result.against !== '') {
    const model = result.models[0]
    return [
      read,
      model ? `v${model.version} · ${ago(model.read_at)}` : '',
      `${counts.reconciled ?? 0} of ${counts.figures ?? 0}`,
      `${counts.differences ?? 0} differences`,
    ]
  }
  return [
    read,
    `${counts.repeated ?? 0} repeated`,
    `${counts.differences ?? 0} differences`,
  ]
}

const RunningCard = ({
  name,
  kind,
  against,
  steps,
  step,
  notes,
  onCancel,
}: {
  name: string
  kind: string
  against: string
  steps: string[]
  step: number
  notes: string[]
  onCancel: () => void
}) => (
  <div
    style={{
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
        src={iconOf(kind)}
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
            fontWeight: 600,
            letterSpacing: '-.02em',
          }}
        >
          {name}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 13.5,
            color: ink.secondary,
            marginTop: 2,
          }}
        >
          {`Checking ${against ? `against ${against}` : 'on its own'}`}
        </span>
      </span>
      <button onClick={onCancel} style={{ ...greyButton, flex: '0 0 auto' }}>
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
            {index < step && (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke={ink.clean}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="5,12.5 10,17.5 19,6.5" />
              </svg>
            )}
            {index === step && (
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
            )}
            {index > step && (
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
          <span
            style={{
              flex: '0 0 auto',
              fontFamily: font.mono,
              fontSize: 13,
              color: ink.secondary,
            }}
          >
            {index < step ? notes[index] : ''}
          </span>
        </div>
      ))}
    </div>
  </div>
)

/** The « file → compared with » pair on a sourced check's result card. */
const ComparedWith = ({ result }: { result: OneOffResult }) => {
  const model = result.models[0]!
  const readLine =
    result.kind === 'deck'
      ? `${result.counts.slides ?? 0} slides · ${
          result.counts.figures ?? 0
        } figures read`
      : `${result.counts.figures ?? 0} figures read`
  //: The design's sub adds « · and the accounts to Jun-26 » — the deal's
  //: sources. A one-off check reads only the models, so only the models
  //: are claimed. More than one model: the others are named in a second
  //: line rather than invented into one filename.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 12,
        marginTop: 18,
      }}
    >
      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          background: '#f7f7f9',
          borderRadius: 11,
          padding: '13px 15px',
        }}
      >
        <div style={{ ...sectionHead, fontSize: 11.5 }}>The file</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginTop: 7,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconOf(result.kind)}
            alt=""
            style={{
              flex: '0 0 18px',
              width: 18,
              height: 18,
              objectFit: 'contain',
            }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: '-.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {result.filename}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: ink.secondary, marginTop: 5 }}>
          {readLine}
        </div>
      </div>
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          color: ink.faint,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="8,4 15,12 8,20" />
        </svg>
      </div>
      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          background: '#f7f7f9',
          borderRadius: 11,
          padding: '13px 15px',
        }}
      >
        <div style={{ ...sectionHead, fontSize: 11.5 }}>Compared with</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginTop: 7,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileIcon.xls}
            alt=""
            style={{
              flex: '0 0 18px',
              width: 18,
              height: 18,
              objectFit: 'contain',
            }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: '-.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {model.filename}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: ink.secondary, marginTop: 5 }}>
          {`Read ${ago(model.read_at)}`}
          {result.models.length > 1 &&
            ` · and ${asWords(result.models.length - 1)} more ${
              result.models.length === 2 ? 'model' : 'models'
            }`}
        </div>
      </div>
    </div>
  )
}

/** The tally row — real numbers only, no theatre. */
const tally = (
  result: OneOffResult,
): { value: string; label: string; fg: string }[] => {
  const counts = result.counts
  if (result.kind === 'model')
    //: No drawn tally for a model's one-off — the design's four-slot
    //: tally row is the pattern, the audit's own numbers fill it.
    //: Errors and smells stay two slots; they are never added.
    return [
      {
        value: String(counts.cells ?? 0),
        label: 'cells read',
        fg: ink.primary,
      },
      {
        value: String(counts.formulas ?? 0),
        label: 'formulas',
        fg: ink.primary,
      },
      {
        value: String(counts.errors ?? 0),
        label: counts.errors === 1 ? 'error' : 'errors',
        fg: counts.errors ? ink.accent : ink.primary,
      },
      {
        value: String(counts.smells ?? 0),
        label: counts.smells === 1 ? 'smell' : 'smells',
        fg: ink.primary,
      },
    ]
  if (result.against !== '')
    return [
      {
        value: String(counts.figures ?? 0),
        label: 'figures read',
        fg: ink.primary,
      },
      {
        value: String(counts.reconciled ?? 0),
        label: 'traced to the model',
        fg: ink.primary,
      },
      {
        value: String(counts.unlinked ?? 0),
        label: 'not traced',
        fg: ink.primary,
      },
      {
        value: String(counts.differences ?? 0),
        label: 'differences',
        fg: counts.differences ? ink.accent : ink.primary,
      },
    ]
  //: The design's solo tally has a « totals checked » slot; omitted, not
  //: faked — see the file comment.
  return [
    {
      value: String(counts.figures ?? 0),
      label: 'figures read',
      fg: ink.primary,
    },
    {
      value: String(counts.repeated ?? 0),
      label: 'stated more than once',
      fg: ink.primary,
    },
    {
      value: String(counts.differences ?? 0),
      label: 'differences',
      fg: counts.differences ? ink.accent : ink.primary,
    },
  ]
}

/** One finding, closed and open, in the check screen's own card. */
const FindingCard = ({
  card,
  kind,
  open,
  onToggle,
  grids,
}: {
  card: Card
  kind: string
  open: boolean
  onToggle: () => void
  grids: Record<string, ModelGrid | null>
}) => {
  const head = headOf(card, kind)
  return (
    <div
      style={{
        background: open ? 'rgba(255,255,255,.62)' : '#fff',
        backdropFilter: open ? 'blur(30px) saturate(1.8)' : 'none',
        WebkitBackdropFilter: open ? 'blur(30px) saturate(1.8)' : 'none',
        border: open ? '1px solid rgba(255,255,255,.95)' : '0',
        borderRadius: open ? 17 : 13,
        boxShadow: open
          ? '0 16px 40px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.05), inset 0 1px 0 rgba(255,255,255,.95)'
          : '0 1px 2px rgba(0,0,0,.05), 0 0 0 .5px rgba(0,0,0,.06)',
        overflow: 'hidden',
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
          padding: '14px 16px 14px 18px',
        }}
      >
        <span
          style={{
            flex: '0 0 8px',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: head.dot,
            marginTop: 7,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 15.5,
              fontWeight: 500,
              letterSpacing: '-.01em',
            }}
          >
            {head.title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 14,
              color: '#3a3a3c',
              marginTop: 3,
            }}
          >
            {head.says}
          </span>
          <span
            //: One line, as drawn; the full coordinates are still the
            //: content, the design's own ellipsis pattern trims them.
            style={{
              display: 'block',
              fontFamily: font.mono,
              fontSize: 12,
              color: ink.secondary,
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {head.where}
          </span>
        </span>
      </button>
      {open && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.7)',
            padding: '16px 18px 18px',
          }}
        >
          {card.shape !== 'defect' && (
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
              <Side
                {...(card.shape === 'solo'
                  ? soloSideA(card.solo, kind)
                  : driftSideA(card.drift, kind))}
              />
              <div
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  color: ink.faint,
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="8,4 15,12 8,20" />
                </svg>
              </div>
              <Side
                {...(card.shape === 'solo'
                  ? soloSideB(card.solo, kind)
                  : driftSideB(card.drift, grids))}
              />
            </div>
          )}
          <div
            style={{
              fontSize: 14,
              color: '#3a3a3c',
              lineHeight: 1.5,
              marginTop: card.shape === 'defect' ? 0 : 14,
            }}
          >
            {explainOf(card, kind)}
          </div>
          {card.shape === 'defect' && card.defect.standard !== '' && (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: ink.secondary,
                marginTop: 8,
              }}
            >
              {card.defect.standard}
            </div>
          )}
          {/* The design's Rebase / Not a problem buttons are omitted
              here — a one-off check keeps no file to correct and no
              finding row to dismiss. Flagged in the worklog. */}
        </div>
      )}
    </div>
  )
}

/**
 * A statement's place, at the design's length — « Slide 12 », or, when
 * both statements share a page, « The chart on slide 3 » against « the
 * table on slide 3 ». Read off the real location string: the reader
 * writes « chart series … » and « row …, column … » into it, and those
 * words are what tell two places on one page apart. The full location
 * stays on the card's mono line.
 */
const placeOf = (statement: SoloStatement): string => {
  const page = statement.location.match(/^(slide|page|paragraph) \d+/)?.[0]
  if (page === undefined) return cap(statement.location)
  if (statement.location.includes('chart series')) return `The chart on ${page}`
  if (statement.location.includes('row «')) return `The table on ${page}`
  return cap(page)
}

const headOf = (
  card: Card,
  kind: string,
): { title: string; says: string; where: string; dot: string } => {
  if (card.shape === 'solo') {
    const { solo } = card
    const first = placeOf(solo.first)
    const other = placeOf(solo.other)
    return {
      title: solo.label,
      says: `${first} says ${solo.first.printed} · ${
        other[0]!.toLowerCase() + other.slice(1)
      } says ${solo.other.printed}`,
      where: `${cap(solo.first.location)} · ${cap(solo.other.location)}`,
      dot: ink.accent,
    }
  }
  if (card.shape === 'drift') {
    const { drift } = card
    return {
      title: drift.label,
      says: `The ${kindWord(kind)} says ${drift.printed} · the model says ${
        drift.expected
      }`,
      where: `${cap(drift.location)} · ${drift.ref}`,
      dot: ink.accent,
    }
  }
  const { defect } = card
  return {
    title: `${defect.rule.replace(/-/g, ' ')} at ${defect.ref}`,
    says: defect.detail,
    where: `${defect.sheet} · ${defect.ref} · ${defect.severity}`,
    dot: ink.accent,
  }
}

/** The two places a finding stands, as the chat's chain card rows. */
const chainOf = (card: Card): { what: string; value: string }[] => {
  if (card.shape === 'solo')
    return [
      { what: cap(card.solo.first.location), value: card.solo.first.printed },
      { what: cap(card.solo.other.location), value: card.solo.other.printed },
    ]
  if (card.shape === 'drift')
    return [
      { what: cap(card.drift.location), value: card.drift.printed },
      {
        what: card.drift.name
          ? `${card.drift.ref} — ${card.drift.name}`
          : card.drift.ref,
        value: card.drift.expected,
      },
    ]
  return [{ what: `${card.defect.sheet} · ${card.defect.ref}`, value: '' }]
}

const explainOf = (card: Card, kind: string): string => {
  if (card.shape === 'solo')
    return card.solo.statements > 2
      ? `The ${kindWord(kind)} states this name ${asWords(
          card.solo.statements,
        )} times, two ways. Nothing outside the file was used.`
      : `The same label carries two figures in the same ${kindWord(
          kind,
        )}. Nothing outside the file was used.`
  if (card.shape === 'drift')
    return card.drift.one_tick
      ? 'Same label on both sides. They differ by one unit at the printed precision — usually a rounding convention, and still a difference.'
      : 'Same label on both sides.'
  return card.defect.detail
}

/** What one side of an open card shows. */
interface SideProps {
  label: string
  value: string
  valueInk?: string
  where: string
  /** `sketch` draws the design's slide shorthand; `text` quotes the
   *  sentence with the figure marked; `grid` shows model rows. */
  evidence?:
    | { kind: 'sketch' }
    | { kind: 'text'; context: string; mark: string }
    | {
        kind: 'grid'
        rows: { n: string; label: string; value: string; hl: boolean }[]
      }
}

const soloSideA = (solo: SoloFinding, kind: string): SideProps => ({
  label: placeOf(solo.first),
  value: solo.first.printed,
  where: solo.first.section || cap(solo.first.location),
  evidence: evidenceFor(solo.first.context, solo.first.printed, kind),
})

const soloSideB = (solo: SoloFinding, kind: string): SideProps => ({
  label: placeOf(solo.other),
  value: solo.other.printed,
  valueInk: ink.accent,
  where: solo.other.section || cap(solo.other.location),
  evidence: evidenceFor(solo.other.context, solo.other.printed, kind),
})

const driftSideA = (drift: OneOffDrift, kind: string): SideProps => ({
  label: `In the ${kindWord(kind)}`,
  value: drift.printed,
  where: cap(drift.location),
  evidence: evidenceFor(drift.context, drift.printed, kind),
})

const driftSideB = (
  drift: OneOffDrift,
  grids: Record<string, ModelGrid | null>,
): SideProps => ({
  label: 'In the model',
  value: drift.expected,
  valueInk: ink.accent,
  where: drift.ref,
  evidence: gridEvidence(drift, grids),
})

/** A sentence quotes itself; a deck page without one gets the sketch. */
const evidenceFor = (
  context: string,
  printed: string,
  kind: string,
): SideProps['evidence'] => {
  if (context && context.includes(printed) && context.trim() !== printed)
    return { kind: 'text', context, mark: printed }
  if (kind === 'deck') return { kind: 'sketch' }
  return undefined
}

/** Four rows of the real model around the drift's cell, amber on the
 *  target — the same slice the document panel shows. */
const gridEvidence = (
  drift: OneOffDrift,
  grids: Record<string, ModelGrid | null>,
): SideProps['evidence'] => {
  const grid = drift.model_artifact_id
    ? (grids[drift.model_artifact_id] ?? null)
    : null
  const ref = drift.ref
  if (grid === null || !ref) return undefined
  const [sheetName, coordinate] = ref.includes('!')
    ? [ref.split('!')[0]!, ref.split('!')[1]!]
    : [null, ref]
  const sheet =
    grid.sheets.find((one) => one.name === sheetName) ?? grid.sheets[0]
  if (sheet === undefined || !coordinate) return undefined
  const hit = sheet.rows.findIndex((row) =>
    row.cells.some((cell) => cell?.ref === ref),
  )
  if (hit === -1) return undefined
  const column = sheet.rows[hit]!.cells.findIndex((cell) => cell?.ref === ref)
  const around = sheet.rows.slice(Math.max(0, hit - 2), hit + 2)
  return {
    kind: 'grid',
    rows: around.map((row) => {
      const cell = row.cells[column] ?? row.cells.find(Boolean) ?? null
      return {
        n: cell?.ref.match(/\d+/)?.[0] ?? '',
        label: row.label,
        value: cell?.display ?? cell?.value ?? '',
        hl: cell?.ref === ref,
      }
    }),
  }
}

const Side = ({ label, value, valueInk, where, evidence }: SideProps) => (
  <div
    style={{
      flex: '1 1 0',
      minWidth: 0,
      background: '#fff',
      borderRadius: 11,
      boxShadow: '0 0 0 .5px rgba(0,0,0,.1)',
      padding: '14px 15px',
    }}
  >
    <div style={{ ...sectionHead, fontSize: 11.5 }}>{label}</div>
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: '-.01em',
        marginTop: 8,
        color: valueInk ?? ink.primary,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 12,
        color: ink.secondary,
        marginTop: 5,
      }}
    >
      {where}
    </div>
    {evidence?.kind === 'sketch' && (
      <div
        style={{
          background: '#fbfbfd',
          borderRadius: 8,
          boxShadow: '0 0 0 .5px rgba(0,0,0,.09)',
          padding: '11px 12px',
          marginTop: 11,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        <div
          style={{
            height: 5,
            width: '52%',
            background: '#e2e2e7',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            height: 4,
            width: '70%',
            background: '#eaeaee',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            height: 9,
            width: '34%',
            background: 'rgba(255,159,10,.32)',
            boxShadow: '0 0 0 2px rgba(255,159,10,.32)',
            borderRadius: 3,
            margin: '3px 0',
          }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <div
            style={{
              flex: 1,
              height: 16,
              background: '#f2f2f5',
              borderRadius: 3,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 23,
              background: '#f2f2f5',
              borderRadius: 3,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 30,
              background: '#f2f2f5',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    )}
    {evidence?.kind === 'text' && (
      <div
        style={{
          background: '#fbfbfd',
          borderRadius: 8,
          boxShadow: '0 0 0 .5px rgba(0,0,0,.09)',
          padding: '11px 12px',
          marginTop: 11,
          fontSize: 13.5,
          lineHeight: 1.55,
        }}
      >
        {evidence.context.slice(0, evidence.context.indexOf(evidence.mark))}
        <span
          style={{
            background: 'rgba(255,159,10,.28)',
            boxShadow: '0 0 0 2px rgba(255,159,10,.28)',
            borderRadius: 3,
          }}
        >
          {evidence.mark}
        </span>
        {evidence.context.slice(
          evidence.context.indexOf(evidence.mark) + evidence.mark.length,
        )}
      </div>
    )}
    {evidence?.kind === 'grid' && (
      <div
        style={{
          background: '#fbfbfd',
          borderRadius: 8,
          boxShadow: '0 0 0 .5px rgba(0,0,0,.09)',
          overflow: 'hidden',
          marginTop: 11,
          fontFamily: font.mono,
          fontSize: 11.5,
        }}
      >
        {evidence.rows.map((row, index) => (
          <div
            key={index}
            style={{ display: 'flex', borderTop: '.5px solid #eef0f2' }}
          >
            <span
              style={{
                flex: '0 0 28px',
                padding: '6px 5px',
                textAlign: 'right',
                color: ink.faint,
                background: '#f4f4f7',
              }}
            >
              {row.n}
            </span>
            <span
              style={{
                flex: 1,
                padding: '6px 8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                flex: '0 0 78px',
                padding: '6px 8px',
                textAlign: 'right',
                background: row.hl ? 'rgba(255,159,10,.28)' : 'transparent',
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
)

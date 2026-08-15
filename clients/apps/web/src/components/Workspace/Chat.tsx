'use client'

/**
 * The chat — the founder's design, wired to the agent.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `chatOpen`
 * block. One panel, three scopes, and the scope decides what the agent
 * can reach:
 *
 * - **A deal.** Questions go to the deal agent — six read-only tools
 *   over the loaded deal, every figure in the answer from a tool call,
 *   never from the model's own arithmetic.
 * - **One finding.** Opening a finding opens the chat on it: the real
 *   chain is fetched and drawn, and follow-ups carry the finding and
 *   the conversation to the same deal agent.
 * - **One checked file.** After a one-off check, questions go to a
 *   deliberately smaller agent that holds that check's stored answer
 *   and two tools — and answers deal questions with the boundary
 *   sentence, because it truly does not have the deal.
 *
 * Waiting states are real waits on real requests — nothing here runs on
 * a timer pretending to think. A failed or unconfigured agent shows the
 * server's own sentence in place of an answer. The suggestion rows are
 * questions the tools can genuinely answer, not the design's demo
 * lines. The + and microphone buttons are drawn without behaviour in
 * the design and stay exactly that — flagged in the worklog.
 */

import { useEffect, useRef, useState } from 'react'
import { ApiError, AskTurn, ChainStep, TieOutApi } from './api'
import { font, ink } from './design'

/** What the conversation is about — set by the shell, never guessed. */
export type ChatContext =
  | { scope: 'deal'; dealId: string; dealName: string }
  | {
      scope: 'finding'
      dealId: string
      findingId: string
      title: string
      says: string
    }
  | { scope: 'file'; checkId: string }
  | {
      scope: 'file-finding'
      checkId: string
      title: string
      says: string
      explain: string
      chain: ChainRow[]
    }

export interface ChatRow {
  role: 'user' | 'agent' | 'tools' | 'working' | 'chain'
  text?: string
  chain?: ChainRow[]
  /** Grey footnote under a chain card — the steps it could not follow. */
  unresolved?: string[]
}

export interface ChainRow {
  what: string
  value: string
}

/** A chain step, in the words the design's rows use. */
const rowOf = (step: ChainStep): ChainRow => {
  let what =
    step.ref && step.name
      ? `${step.ref} — ${step.name}`
      : (step.label ?? step.name ?? step.ref ?? step.kind)
  if (step.kind === 'input') what += ', typed'
  else if (step.formula) what += ' — formula'
  return { what: what ?? '', value: step.printed ?? step.value ?? '' }
}

/** Questions each scope's tools can genuinely answer — not the design's
 *  demo lines, which name people and cells this deal may not have. */
const SUGGESTIONS: Record<ChatContext['scope'], string[]> = {
  deal: [
    'What is open on this deal?',
    'What was not checked, and why?',
    'Which files could not be read?',
  ],
  finding: [
    'Where does the model figure come from?',
    'What else reads this cell?',
    'What feeds the cell behind it?',
  ],
  file: [
    'What disagrees inside this file?',
    'What was read, and what was not?',
    'What was it checked against?',
  ],
  'file-finding': [
    'Where exactly do these appear?',
    'How was the match made?',
    'What else did the check find?',
  ],
}

/** One string per conversation. The shell keys the panel on this, so a
 *  new context is a fresh mount and a fresh thread — never a reset
 *  performed inside an effect. */
export const chatKeyOf = (context: ChatContext): string => {
  if (context.scope === 'deal') return `deal:${context.dealId}`
  if (context.scope === 'finding') return `finding:${context.findingId}`
  if (context.scope === 'file') return `file:${context.checkId}`
  return `file-finding:${context.checkId}:${context.title}`
}

export const Chat = ({
  api,
  context,
  onClose,
}: {
  api: TieOutApi
  context: ChatContext
  /** The pane's X — the design's `askClosable`. Absent, no X is drawn. */
  onClose?: () => void
}) => {
  //: The opening rows come from the context itself; a deal-finding chat
  //: starts on the working line its chain fetch replaces.
  const [rows, setRows] = useState<ChatRow[]>(() => {
    if (context.scope === 'finding')
      return [{ role: 'working', text: 'Reading the chain' }]
    if (context.scope === 'file-finding')
      return [
        { role: 'tools', text: 'Compared two statements' },
        { role: 'agent', text: `${context.says}. ${context.explain}` },
        { role: 'chain', chain: context.chain },
      ]
    return []
  })
  const [prompt, setPrompt] = useState('')
  const [asked, setAsked] = useState(0)
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement | null>(null)
  const flight = useRef(0)
  //: The conversation this panel mounted on. The shell keys the panel on
  //: `chatKeyOf`, so a new context is a fresh mount — the prop object's
  //: identity may churn per render, this does not.
  const opened = useRef(context)

  useEffect(() => {
    const at = opened.current
    if (at.scope !== 'finding') return
    const mine = ++flight.current
    api
      .chain(at.findingId)
      .then((chain) => {
        if (flight.current !== mine) return
        const unresolved = chain.steps.flatMap((step) => step.unresolved)
        //: The sentence beside the chain is the server's own summary of
        //: it, never composed here.
        setRows([
          { role: 'tools', text: `Followed ${chain.steps.length} steps` },
          {
            role: 'agent',
            text: chain.summary
              ? `${at.says}. ${chain.summary}`
              : `${at.says}.`,
          },
          {
            role: 'chain',
            chain: chain.steps.map(rowOf),
            unresolved,
          },
        ])
      })
      .catch(() => {
        if (flight.current !== mine) return
        //: No chain is an answer too — the finding stands, the path
        //: behind it could not be drawn.
        setRows([{ role: 'agent', text: `${at.says}.` }])
      })
  }, [api])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [rows])

  const send = (text: string) => {
    const asked_ = text.trim()
    if (!asked_ || busy) return
    const mine = flight.current
    //: The transcript the agent gets — the person's words and our
    //: earlier answers, nothing else.
    const history: AskTurn[] = rows
      .filter((row) => row.role === 'user' || row.role === 'agent')
      .map((row) => ({
        who: row.role === 'user' ? ('you' as const) : ('pierce' as const),
        text: row.text ?? '',
      }))
    setRows((was) => [
      ...was,
      { role: 'user', text: asked_ },
      { role: 'working', text: 'Checking' },
    ])
    setPrompt('')
    setAsked((was) => was + 1)
    setBusy(true)
    const request =
      context.scope === 'file' || context.scope === 'file-finding'
        ? api.askFile(context.checkId, asked_, { history })
        : api.ask(context.dealId, asked_, {
            history,
            findingId: context.scope === 'finding' ? context.findingId : null,
          })
    request
      .then((answer) => {
        if (flight.current !== mine) return
        const landed: ChatRow[] = []
        if (answer.steps.length > 0)
          landed.push({
            role: 'tools',
            text: `Used ${answer.steps.length} ${
              answer.steps.length === 1 ? 'tool' : 'tools'
            }`,
          })
        //: A run that failed or ran out of steps says so — nothing is
        //: invented to fill the gap.
        const text =
          answer.answer ||
          answer.error ||
          'The agent stopped before it could answer.'
        landed.push({ role: 'agent', text })
        setRows((was) => [...was.slice(0, -1), ...landed])
      })
      .catch((problem) => {
        if (flight.current !== mine) return
        //: The server's own sentence — « No ANTHROPIC_API_KEY
        //: configured. » included — shown in place of an answer.
        setRows((was) => [
          ...was.slice(0, -1),
          {
            role: 'agent',
            text:
              problem instanceof ApiError
                ? problem.message
                : 'Something went wrong asking that.',
          },
        ])
      })
      .finally(() => flight.current === mine && setBusy(false))
  }

  const fresh = asked === 0 && (rows.length === 0 || rows.length > 1)
  const empty = rows.length === 0
  const greeting =
    context.scope === 'file' || context.scope === 'file-finding'
      ? 'Ask me about this file.'
      : context.scope === 'deal'
        ? `Ask me about ${context.dealName}.`
        : `Ask me about this finding.`

  return (
    <div
      style={{
        //: The Antford pane: 38% of the row, flat white beside the
        //: seam — the glass card is retired with its design.
        flex: '0 0 38%',
        minWidth: 320,
        order: 3,
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          padding: '12px 14px 10px',
        }}
      >
        {onClose !== undefined && (
          <button
            onClick={onClose}
            title="Close"
            style={{
              border: 0,
              background: 'transparent',
              borderRadius: 9,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              color: '#8e8e93',
            }}
          >
            <svg
              width="18"
              height="18"
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
        )}
        <button
          onClick={() => {
            flight.current++
            setRows([])
            setAsked(0)
            setPrompt('')
            setBusy(false)
          }}
          title="New chat"
          style={{
            border: 0,
            background: 'transparent',
            borderRadius: 9,
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            color: '#8e8e93',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div
        ref={scroller}
        style={{
          flex: '1 1 0',
          minHeight: 0,
          overflow: 'auto',
          padding: '14px 18px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {rows.map((row, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              flexDirection: 'column',
              animation: 'pcIn .22s ease both',
            }}
          >
            {row.role === 'user' && (
              <div
                style={{
                  alignSelf: 'flex-end',
                  background: 'rgba(255,255,255,.78)',
                  border: '1px solid rgba(255,255,255,.7)',
                  borderRadius: 15,
                  padding: '11px 15px',
                  maxWidth: '90%',
                  lineHeight: 1.6,
                }}
              >
                {row.text}
              </div>
            )}
            {row.role === 'agent' && (
              <div style={{ lineHeight: 1.7, color: '#22252b' }}>
                {row.text}
              </div>
            )}
            {row.role === 'tools' && (
              <div style={{ color: '#8b909a', fontSize: 13.5 }}>{row.text}</div>
            )}
            {row.role === 'working' && (
              <div
                style={{ color: '#7c828c', animation: 'pcDim 1.4s infinite' }}
              >
                {row.text}
              </div>
            )}
            {row.role === 'chain' && (
              <div
                style={{
                  background: 'rgba(255,255,255,.8)',
                  borderRadius: 12,
                  boxShadow: '0 0 0 .5px rgba(0,0,0,.08)',
                  overflow: 'hidden',
                  marginTop: 4,
                }}
              >
                {(row.chain ?? []).map((step, at) => (
                  <div
                    key={at}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      borderTop: at === 0 ? '0' : '.5px solid #eff0f2',
                      padding: '9px 13px',
                    }}
                  >
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontFamily: font.mono,
                        fontSize: 11.5,
                        color: ink.faint,
                      }}
                    >
                      {at + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                      {step.what}
                    </span>
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: ink.secondary,
                      }}
                    >
                      {step.value}
                    </span>
                  </div>
                ))}
                {(row.unresolved?.length ?? 0) > 0 && (
                  //: What the chain could not follow, on the card rather
                  //: than dropped — a chain drawn without this could be
                  //: quietly incomplete.
                  <div
                    style={{
                      borderTop: '.5px solid #eff0f2',
                      padding: '8px 13px',
                      fontSize: 12.5,
                      color: ink.secondary,
                    }}
                  >
                    {`Not followed: ${row.unresolved!.join(' · ')}`}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {empty && (
        <div
          style={{
            flex: '0 0 auto',
            padding: '0 14px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <PierceMark />
          <span
            style={{
              fontSize: 22,
              color: '#15171b',
              letterSpacing: '-.015em',
              textAlign: 'center',
              textWrap: 'pretty',
            }}
          >
            {greeting}
          </span>
        </div>
      )}

      <div
        style={{
          flex: '0 0 auto',
          padding: '10px 14px 16px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid #d7d7d3',
            background: '#ffffff',
            borderRadius: 999,
            padding: '9px 9px 9px 16px',
            boxShadow: '0 6px 22px rgba(16,20,28,.13)',
          }}
        >
          {/* Drawn without behaviour in the design; kept exactly so. */}
          <button
            style={{
              border: 0,
              background: 'transparent',
              color: ink.dock,
              cursor: 'pointer',
              padding: 4,
              borderRadius: 999,
              display: 'flex',
              flex: '0 0 auto',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(prompt)
              }
            }}
            placeholder="Ask anything"
            rows={1}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              resize: 'none',
              font: 'inherit',
              fontSize: 15,
              lineHeight: 1.5,
              color: '#15171b',
              background: 'transparent',
              padding: '6px 0',
            }}
          />
          {/* Drawn without behaviour in the design; kept exactly so. */}
          <button
            style={{
              border: 0,
              background: 'transparent',
              color: ink.dock,
              cursor: 'pointer',
              padding: 4,
              borderRadius: 999,
              display: 'flex',
              flex: '0 0 auto',
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
              <line x1="12" y1="18" x2="12" y2="21" />
            </svg>
          </button>
          <button
            onClick={() => send(prompt)}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 0,
              background:
                'linear-gradient(180deg,#1d7de6 0%,#0b62c4 55%,#0a51a5 100%)',
              boxShadow:
                '0 1px 2px rgba(0,60,140,.28), 0 0 0 .5px rgba(0,80,180,.35) inset, 0 1px 0 rgba(255,255,255,.45) inset',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5,12 12,5 19,12" />
            </svg>
          </button>
        </div>
      </div>

      {fresh && (
        <div
          style={{
            flex: '0 0 auto',
            padding: '2px 26px 18px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {SUGGESTIONS[context.scope].map((question) => (
            <button
              key={question}
              onClick={() => send(question)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                textAlign: 'left',
                border: 0,
                background: 'transparent',
                font: 'inherit',
                fontSize: 14.5,
                color: '#6b7078',
                cursor: 'pointer',
                padding: '11px 2px',
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a4a8b0"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 15px' }}
              >
                <polyline points="3,17 9.5,10.5 13.5,14.5 21,7" />
                <polyline points="15,7 21,7 21,13" />
              </svg>
              <span style={{ flex: 1, minWidth: 0 }}>{question}</span>
            </button>
          ))}
        </div>
      )}
      {empty && <div style={{ flex: '1 1 0' }} />}
    </div>
  )
}

/** The Pierce mark, from the design's own paths. */
const PierceMark = () => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 100 100"
    fill="#0b62c4"
    aria-label="Pierce"
  >
    <circle cx="26" cy="26" r="13" />
    <ellipse cx="50" cy="26" rx="13" ry="8" transform="rotate(-45 50 26)" />
    <ellipse cx="74" cy="26" rx="13" ry="4" transform="rotate(-45 74 26)" />
    <ellipse cx="26" cy="50" rx="13" ry="8" transform="rotate(-45 26 50)" />
    <ellipse cx="50" cy="50" rx="9.5" ry="4" transform="rotate(-45 50 50)" />
    <ellipse cx="74" cy="50" rx="13" ry="8" transform="rotate(-45 74 50)" />
    <ellipse cx="26" cy="74" rx="13" ry="4" transform="rotate(-45 26 74)" />
    <ellipse cx="50" cy="74" rx="13" ry="8" transform="rotate(-45 50 74)" />
    <circle cx="74" cy="74" r="13" />
  </svg>
)

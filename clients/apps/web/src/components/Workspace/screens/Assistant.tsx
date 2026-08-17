'use client'

/**
 * The Assistant — the workspace's first tab, from the founder's
 * Workspace 3 design (`docs/pierce/design-antford/workspace3.html`,
 * the `vAssist` section).
 *
 * A different job from the review chat. The review chat answers « why
 * did you flag this »; this one answers « what is this model » — for
 * someone who did not build it. The three design decisions, treated as
 * law: the model is picked at the top and stays picked, with the scope
 * visible; every answer shows its cells — the tools' own rows, drawn
 * from the server verbatim, never re-typed by the language model; and
 * the answer's last line names where the chain ends and what the file
 * cannot show.
 *
 * Never shown empty: the suggested questions are composed from the
 * model's own content — its real sheet names, its real version count —
 * so clicking one always produces a real answer about this file.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Asked, AskedRow, AskTurn, DealListItem, TieOutApi } from './../api'
import { cellRefInk, excelLogo, font, ink } from './../design'

interface Message {
  role: 'you' | 'working' | 'answer'
  text: string
  rows?: AskedRow[]
  /** The boundary paragraph — the answer's last, drawn in grey. */
  ends?: string
  /** « Used 3 tools » — the trace's one-line summary. */
  trace?: string
}

export interface AssistantProps {
  api: TieOutApi
  /** Null while loading. The picker lists every model this person is on. */
  deals: DealListItem[] | null
  /** Clicking a row's cell lands in the model reader. */
  onOpenModel?: (deal: DealListItem) => void
}

/** The answer split for the design: prose, then the grey ends-line. */
const split = (answer: string): { text: string; ends: string } => {
  const paragraphs = answer
    .split(/\n{2,}/)
    .map((one) => one.trim())
    .filter(Boolean)
  if (paragraphs.length < 2) return { text: answer.trim(), ends: '' }
  return {
    text: paragraphs.slice(0, -1).join('\n\n'),
    ends: paragraphs[paragraphs.length - 1]!,
  }
}

export const Assistant = ({ api, deals, onOpenModel }: AssistantProps) => {
  const models = deals ?? []
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = models.find((one) => one.id === pickedId) ?? models[0] ?? null

  const [pickOpen, setPickOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState('')
  const scroll = useRef<HTMLDivElement | null>(null)

  //: The visible scope line: the model's own counts, asked once per
  //: pick. Absent while unknown — never invented.
  useEffect(() => {
    if (picked === null) return
    let live = true
    setMeta('')
    api
      .deal(picked.id)
      .then((page) => {
        if (!live) return
        const model = page.documents.find((one) => one.kind === 'model')
        if (!model) {
          setMeta('No model in this folder yet.')
          return
        }
        const sheets = Number(model.counts['sheets'] ?? 0)
        const cells = Number(model.counts['cells'] ?? 0)
        const formulas = Number(model.counts['formulas'] ?? 0)
        setMeta(
          [
            sheets ? `${sheets} sheets` : '',
            cells ? `${cells.toLocaleString()} cells` : '',
            formulas ? `${formulas.toLocaleString()} formulas` : '',
            `version ${model.version}`,
          ]
            .filter(Boolean)
            .join(' · '),
        )
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, picked])

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [messages])

  const history: AskTurn[] = messages
    .filter((one) => one.role !== 'working')
    .slice(-6)
    .map((one) => ({
      who: one.role === 'you' ? ('you' as const) : ('pierce' as const),
      text: one.text,
    }))

  const ask = (text: string) => {
    const q = text.trim()
    if (!q || busy || picked === null) return
    setPrompt('')
    setBusy(true)
    setMessages((was) => [
      ...was,
      { role: 'you', text: q },
      { role: 'working', text: 'Reading the graph' },
    ])
    api
      .assist(picked.id, q, { history })
      .then((answer: Asked) => {
        const { text: main, ends } = split(answer.answer)
        const used = answer.steps.filter((one) => one.ok).length
        setMessages((was) => [
          ...was.slice(0, -1),
          {
            role: 'answer',
            text: main,
            ends,
            rows: answer.rows ?? [],
            trace:
              used > 0 ? `Used ${used} ${used === 1 ? 'tool' : 'tools'}` : '',
          },
        ])
      })
      .catch((problem: Error) => {
        setMessages((was) => [
          ...was.slice(0, -1),
          {
            role: 'answer',
            text: String(problem.message ?? 'The assistant could not answer.'),
            rows: [],
            ends: '',
          },
        ])
      })
      .finally(() => setBusy(false))
  }

  //: Suggested questions, composed from this model's real content —
  //: one per family the assistant actually answers.
  const suggestions = useMemo(() => {
    const rows: { cat: string; text: string }[] = [
      { cat: 'Structure', text: 'How is this model laid out?' },
      {
        cat: 'Inventory',
        text: 'Show me every typed input in the model.',
      },
      { cat: 'Inventory', text: 'Any external links or hardcodes?' },
    ]
    return rows
  }, [])

  const empty = messages.length === 0

  if (models.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          padding: 40,
        }}
      >
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'Bodoni Moda',Didot,Georgia,serif",
              fontSize: 38,
              lineHeight: 1,
            }}
          >
            A
          </div>
          <div
            style={{
              fontSize: 23,
              letterSpacing: '-.02em',
              marginTop: 18,
              textWrap: 'balance',
            }}
          >
            Add a model and ask it anything.
          </div>
          <div
            style={{
              fontSize: 14.5,
              color: '#86868b',
              lineHeight: 1.55,
              marginTop: 8,
              textWrap: 'pretty',
            }}
          >
            The assistant answers where a number comes from, what moves if it
            changes, and how the model is laid out — from the model's own
            dependency graph.
          </div>
        </div>
      </div>
    )
  }

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
      {/* The scope bar: the model, picked and staying picked. */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '13px 22px 12px',
          borderBottom: '.5px solid #f0eff1',
        }}
      >
        <div
          style={{ position: 'relative', display: 'flex', flex: '0 0 auto' }}
        >
          <button
            onClick={() => setPickOpen((was) => !was)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              border: 0,
              background: '#f5f5f7',
              borderRadius: 11,
              padding: '8px 12px 8px 11px',
              font: 'inherit',
              fontSize: 14,
              color: ink.primary,
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
            <span style={{ fontWeight: 500, letterSpacing: '-.01em' }}>
              {picked?.name ?? 'Pick a model'}
            </span>
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
          {pickOpen && (
            <>
              <div
                onClick={() => setPickOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 39 }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  zIndex: 40,
                  width: 340,
                  background: '#fff',
                  borderRadius: 14,
                  boxShadow:
                    '0 18px 44px rgba(0,0,0,.2), 0 0 0 .5px rgba(0,0,0,.08)',
                  overflow: 'hidden',
                  padding: 6,
                }}
              >
                {models.map((one) => (
                  <button
                    key={one.id}
                    onClick={() => {
                      setPickedId(one.id)
                      setPickOpen(false)
                      setMessages([])
                      setPrompt('')
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      background:
                        picked?.id === one.id
                          ? 'rgba(0,96,208,.06)'
                          : 'transparent',
                      borderRadius: 9,
                      padding: '9px 11px',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 14.5,
                          letterSpacing: '-.01em',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {one.name}
                      </span>
                    </span>
                    {picked?.id === one.id && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={ink.accent}
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flex: '0 0 14px' }}
                      >
                        <polyline points="5,12.5 10,17.5 19,6.5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: '#a1a1a6',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meta}
        </span>
        <button
          onClick={() => setMessages([])}
          title="New chat"
          style={{
            flex: '0 0 auto',
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

      {/* The conversation. */}
      <div
        ref={scroll}
        style={{
          flex: '1 1 0',
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '26px 22px 8px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 720,
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
          }}
        >
          {messages.map((message, index) => (
            <div
              key={index}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              {message.role === 'you' && (
                <div
                  style={{
                    alignSelf: 'flex-end',
                    background: '#f5f5f7',
                    borderRadius: 15,
                    padding: '11px 15px',
                    maxWidth: '86%',
                    lineHeight: 1.6,
                  }}
                >
                  {message.text}
                </div>
              )}
              {message.role === 'working' && (
                <div
                  style={{ color: '#7c828c', animation: 'pcDim 1.4s infinite' }}
                >
                  {message.text}
                </div>
              )}
              {message.role === 'answer' && (
                <>
                  {message.trace && (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#a1a1a6',
                        marginBottom: 8,
                      }}
                    >
                      {message.trace}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.6,
                      letterSpacing: '-.008em',
                      maxWidth: '64ch',
                      textWrap: 'pretty',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {message.text}
                  </div>
                  {(message.rows?.length ?? 0) > 0 && (
                    <div
                      style={{
                        marginTop: 16,
                        background: '#fff',
                        borderRadius: 13,
                        boxShadow: '0 0 0 .5px rgba(30,32,38,.1)',
                        overflow: 'hidden',
                      }}
                    >
                      {message.rows!.map((row, at) => (
                        <button
                          key={`${row.ref}-${at}`}
                          title="Open the model"
                          onClick={() =>
                            picked && onOpenModel && onOpenModel(picked)
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 16,
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            borderTop: at === 0 ? 0 : '.5px solid #f0eff1',
                            background: 'transparent',
                            font: 'inherit',
                            cursor: onOpenModel ? 'pointer' : 'default',
                            padding: '12px 16px',
                          }}
                        >
                          <span
                            style={{
                              flex: '0 0 138px',
                              fontFamily: font.mono,
                              fontSize: 11.5,
                              color: cellRefInk,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {row.ref}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14.5,
                              lineHeight: 1.45,
                              textWrap: 'pretty',
                            }}
                          >
                            {row.what}
                          </span>
                          <span
                            style={{
                              flex: '0 0 auto',
                              fontSize: 14,
                              color: ink.accent,
                              fontVariantNumeric: 'tabular-nums lining-nums',
                            }}
                          >
                            {row.value}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {message.ends && (
                    <div
                      style={{
                        marginTop: 15,
                        fontSize: 14,
                        color: '#86868b',
                        lineHeight: 1.6,
                        maxWidth: '70ch',
                        textWrap: 'pretty',
                      }}
                    >
                      {message.ends}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The empty face: the mark, the question, then the composer. */}
      {empty && (
        <div
          style={{
            flex: '0 0 auto',
            padding: '0 22px 22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: "'Bodoni Moda',Didot,Georgia,serif",
              fontSize: 38,
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            A
          </span>
          <span
            style={{
              fontSize: 23,
              letterSpacing: '-.02em',
              textAlign: 'center',
              textWrap: 'pretty',
            }}
          >
            What would you like to know about this model?
          </span>
        </div>
      )}

      {/* The composer. */}
      <div
        style={{
          flex: '0 0 auto',
          padding: '10px 22px 8px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 720,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid #d7d7d3',
            background: '#fff',
            borderRadius: 999,
            padding: '9px 9px 9px 16px',
            boxShadow: '0 6px 22px rgba(16,20,28,.13)',
          }}
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                ask(prompt)
              }
            }}
            placeholder="Ask about this model"
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
          <button
            onClick={() => ask(prompt)}
            title="Send"
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
              opacity: busy ? 0.55 : 1,
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

      {/* Suggested questions — people click, they don't compose. */}
      {empty && (
        <div
          style={{
            flex: '0 0 auto',
            padding: '6px 22px 20px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {suggestions.map((one, index) => (
              <button
                key={one.text}
                onClick={() => ask(one.text)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 16,
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  borderTop: index === 0 ? 0 : '.5px solid #f0eff1',
                  background: 'transparent',
                  font: 'inherit',
                  cursor: 'pointer',
                  padding: '12px 4px',
                }}
              >
                <span
                  style={{
                    flex: '0 0 92px',
                    fontSize: 12.5,
                    color: '#a1a1a6',
                  }}
                >
                  {one.cat}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    letterSpacing: '-.01em',
                  }}
                >
                  {one.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {empty && <div style={{ flex: '1 1 0' }} />}
    </div>
  )
}

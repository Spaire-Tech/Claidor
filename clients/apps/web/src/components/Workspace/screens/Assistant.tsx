'use client'

/**
 * Ask — the Swens chat screen.
 *
 * Source of truth: `docs/pierce/design-swens/Swens_Workspace.html`,
 * the `vAssist` block: the collapsible history rail (search, ⌘K, New
 * chat, the project/all scope switch, dated groups), the Newsreader
 * greeting, the composer card with the dark send circle, the project
 * chip beneath it, and answers under the serif « S » mark.
 *
 * What is real, named:
 * - Answers come from the assist endpoint: grounded in the model,
 *   with the tool's own rows drawn verbatim and the boundary line in
 *   grey. Nothing here invents a number.
 * - The history rail's rows are this machine's own past
 *   conversations (localStorage, most recent forty) — real titles,
 *   real order, reopenable. Server-side history is later work.
 * - The scope switch filters those chats by the picked project; the
 *   search filters by title and project name and says which shelf it
 *   looked on when nothing matches.
 * - The project chip under the composer is the real picker.
 *
 * Deferred with the chat-mechanism discussion, by the founder's
 * decision — not built rather than built dead: the composer's « + »
 * menu (attach, mention, Excel selection), the skill chip, and the
 * designed workflow answers (the double-question flow). The answer
 * *style* — S mark, one column, evidence rows — is this file's.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Asked, AskedRow, AskTurn, DealListItem, TieOutApi } from './../api'
import { font, ink } from './../design'

interface Message {
  role: 'you' | 'working' | 'answer'
  text: string
  rows?: AskedRow[]
  /** The boundary paragraph — the answer's last, drawn in grey. */
  ends?: string
  /** « Used 3 tools » — the trace's one-line summary. */
  trace?: string
}

/** A finished conversation, kept on this machine — the rail's rows
 *  are the person's own past chats, never invented. */
interface PastChat {
  id: string
  at: number
  dealId: string
  dealName: string
  title: string
  messages: Message[]
}

const HISTORY_KEY = 'swens-assistant-history'
//: The key the Ances build wrote under — read once so nobody's
//: history vanishes with the rename.
const OLD_HISTORY_KEY = 'ances-assistant-history'

const loadHistory = (): PastChat[] => {
  try {
    const raw =
      window.localStorage.getItem(HISTORY_KEY) ??
      window.localStorage.getItem(OLD_HISTORY_KEY)
    const list = raw ? (JSON.parse(raw) as PastChat[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const saveHistory = (list: PastChat[]) => {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)))
  } catch {
    // Storage full or blocked — history is a convenience, never a failure.
  }
}

const freshId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** The serif S — the design's mark on everything Swens says. */
const Mark = ({ top = 0 }: { top?: number }) => (
  <span
    style={{
      flex: '0 0 18px',
      width: 18,
      fontFamily: font.brand,
      fontSize: 16,
      lineHeight: 1,
      color: '#15171b',
      marginTop: top,
    }}
  >
    S
  </span>
)

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

export interface AssistantProps {
  api: TieOutApi
  /** Null while loading. The chip lists every project this person is on. */
  deals: DealListItem[] | null
  /** Clicking a row's cell lands in the model reader. */
  onOpenModel?: (deal: DealListItem) => void
}

export const Assistant = ({ api, deals, onOpenModel }: AssistantProps) => {
  const models = deals ?? []
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = models.find((one) => one.id === pickedId) ?? models[0] ?? null

  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [pjMenu, setPjMenu] = useState(false)
  const scroll = useRef<HTMLDivElement | null>(null)

  //: The rail: open by default as drawn, collapsible from the header.
  const [histOpen, setHistOpen] = useState(true)
  const [histFind, setHistFind] = useState(false)
  const [histQ, setHistQ] = useState('')
  const [histScope, setHistScope] = useState<'project' | 'all'>('project')
  const findRef = useRef<HTMLInputElement | null>(null)
  const [past, setPast] = useState<PastChat[]>([])
  const chatId = useRef<string>(freshId())
  useEffect(() => {
    setPast(loadHistory())
  }, [])

  //: ⌘K — the chip on the search row is a promise. Opens the rail
  //: first if it is shut; does nothing while another screen shows.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      setHistOpen(true)
      setHistFind(true)
      setTimeout(() => findRef.current?.focus(), 60)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  //: A finished exchange is saved as this chat's record.
  useEffect(() => {
    if (picked === null) return
    const asked = messages.filter((one) => one.role === 'you')
    const last = messages[messages.length - 1]
    if (asked.length === 0 || !last || last.role !== 'answer') return
    const title = asked[0]!.text.slice(0, 80)
    setPast((was) => {
      const record: PastChat = {
        id: chatId.current,
        at: Date.now(),
        dealId: picked.id,
        dealName: picked.name,
        title,
        messages,
      }
      const next = [record, ...was.filter((one) => one.id !== record.id)]
      saveHistory(next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

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
      { role: 'working', text: 'Reading the model' },
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
            text: String(problem.message ?? 'Swens could not answer.'),
            rows: [],
            ends: '',
          },
        ])
      })
      .finally(() => setBusy(false))
  }

  const newChat = () => {
    chatId.current = freshId()
    setMessages([])
    setPrompt('')
  }
  const openPast = (record: PastChat) => {
    chatId.current = record.id
    setMessages(record.messages)
    const deal = models.find((one) => one.id === record.dealId)
    if (deal) setPickedId(deal.id)
    setHistFind(false)
    setHistQ('')
  }

  //: The rail's data: search over title and project, scope over the
  //: picked project. Dated groups, empty groups hidden — the
  //: design's own filter.
  const q = histQ.trim().toLowerCase()
  const hit = (one: PastChat) =>
    (!q || `${one.title} ${one.dealName}`.toLowerCase().includes(q)) &&
    (histScope === 'all' || (picked !== null && one.dealId === picked.id))
  const shown = past.filter(hit)
  const groups = useMemo(() => {
    const now = Date.now()
    const today: PastChat[] = []
    const week: PastChat[] = []
    const older: PastChat[] = []
    for (const one of shown) {
      const age = now - one.at
      if (new Date(one.at).toDateString() === new Date().toDateString())
        today.push(one)
      else if (age < 7 * 86_400_000) week.push(one)
      else older.push(one)
    }
    return [
      { label: 'Today', items: today },
      { label: 'Previous 7 days', items: week },
      { label: 'Older', items: older },
    ].filter((g) => g.items.length > 0)
  }, [shown])

  const [shareSaid, setShareSaid] = useState(false)
  const share = () => {
    const url = `${window.location.href.split('#')[0]}#chat=${chatId.current}`
    const done = () => {
      setShareSaid(true)
      setTimeout(() => setShareSaid(false), 1800)
    }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done)
    else done()
  }

  const empty = messages.length === 0

  //: No projects yet: Ask has nothing to be about. The design's
  //: empty-state pattern, pointing at the place that fixes it.
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
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: font.brand, fontSize: 38, lineHeight: 1 }}>
            S
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              letterSpacing: '-.012em',
              marginTop: 18,
              color: '#1c1f23',
            }}
          >
            Ask me about your models.
          </div>
          <div
            style={{
              fontSize: 14,
              color: ink.secondary,
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            {deals === null
              ? ''
              : 'Connect a project first — Ask answers from your own files, and there are none yet.'}
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
        background: '#fff',
      }}
    >
      {/* The history rail — a clipping shell the design animates. */}
      <div
        style={{
          flex: `0 0 ${histOpen ? '298px' : '0px'}`,
          width: histOpen ? 298 : 0,
          alignSelf: 'stretch',
          overflow: 'hidden',
          background: '#fdfdfd',
          borderRight: '.5px solid #f0eff1',
          transition: 'flex-basis .2s ease, width .2s ease',
        }}
      >
        <div
          style={{
            width: 298,
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 14px 18px',
          }}
        >
          {histFind ? (
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                background: 'rgba(16,20,28,.05)',
                borderRadius: 10,
                padding: '11px 10px',
                marginBottom: 8,
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9aa1ab"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 17px' }}
              >
                <circle cx="11" cy="11" r="6.6" />
                <line x1="16" y1="16" x2="20.5" y2="20.5" />
              </svg>
              <input
                ref={findRef}
                autoFocus
                value={histQ}
                onChange={(e) => setHistQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setHistFind(false)
                    setHistQ('')
                  }
                }}
                placeholder="Search chats"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  font: 'inherit',
                  fontSize: 15,
                  letterSpacing: '-.008em',
                  color: '#1c1f23',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  setHistFind(false)
                  setHistQ('')
                }}
                title="Clear"
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  border: 0,
                  background: 'transparent',
                  borderRadius: 5,
                  padding: 2,
                  color: '#a2a29c',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
                  <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setHistFind(true)
                setTimeout(() => findRef.current?.focus(), 60)
              }}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                textAlign: 'left',
                border: 0,
                background: 'transparent',
                borderRadius: 10,
                font: 'inherit',
                fontSize: 15,
                letterSpacing: '-.008em',
                color: '#9aa1ab',
                cursor: 'pointer',
                padding: '11px 10px',
                marginBottom: 8,
              }}
            >
              <span style={{ display: 'flex', color: '#9aa1ab' }}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: '0 0 17px' }}
                >
                  <circle cx="11" cy="11" r="6.6" />
                  <line x1="16" y1="16" x2="20.5" y2="20.5" />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Search chats</span>
              <span
                style={{
                  flex: '0 0 auto',
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: 0,
                  color: '#a2a29c',
                  background: '#f2f2f0',
                  borderRadius: 5,
                  padding: '2px 5px',
                }}
              >
                ⌘K
              </span>
            </button>
          )}
          <button
            onClick={newChat}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              width: '100%',
              textAlign: 'left',
              border: 0,
              background: 'transparent',
              borderRadius: 10,
              font: 'inherit',
              fontSize: 15,
              letterSpacing: '-.008em',
              color: '#1c1f23',
              cursor: 'pointer',
              padding: '11px 10px',
              marginBottom: 2,
            }}
          >
            <span style={{ display: 'flex', color: '#6b7280' }}>
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: '0 0 17px' }}
              >
                <path d="M20 12.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.2-.6L4.5 21l1.3-4A7.4 7.4 0 0 1 4.9 12.5 7.5 7.5 0 0 1 12.4 5 7.5 7.5 0 0 1 20 12.5z" />
              </svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>New chat</span>
          </button>
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflow: 'auto',
              scrollbarWidth: 'none',
              display: 'flex',
              flexDirection: 'column',
              paddingTop: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                margin: '20px 10px 0',
              }}
            >
              {(
                [
                  { key: 'project', label: 'This project' },
                  { key: 'all', label: 'All chats' },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setHistScope(s.key)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    font: 'inherit',
                    fontSize: 13,
                    fontWeight: histScope === s.key ? 500 : 400,
                    color: histScope === s.key ? '#1c1f23' : '#a2a29c',
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {groups.map((g) => (
              <span
                key={g.label}
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: '#a2a29c',
                    padding: '22px 10px 6px',
                  }}
                >
                  {g.label}
                </span>
                {g.items.map((one) => (
                  <button
                    key={one.id}
                    onClick={() => openPast(one)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      background:
                        one.id === chatId.current
                          ? 'rgba(16,20,28,.06)'
                          : 'transparent',
                      borderRadius: 10,
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: '9px 10px',
                    }}
                  >
                    <span
                      style={{
                        maxWidth: '100%',
                        fontSize: 15,
                        letterSpacing: '-.008em',
                        color:
                          one.id === chatId.current ? '#15171b' : '#4a4f57',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {one.title}
                    </span>
                  </button>
                ))}
              </span>
            ))}
            {q !== '' && shown.length === 0 && (
              <>
                <span
                  style={{
                    display: 'block',
                    fontSize: 14.5,
                    letterSpacing: '-.008em',
                    color: '#4a4f57',
                    padding: '26px 10px 0',
                  }}
                >
                  No chats match “{histQ}”
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: '#8f96a0',
                    padding: '6px 10px 0',
                    textWrap: 'pretty',
                  }}
                >
                  {histScope === 'project'
                    ? 'Only this project’s chats are being searched. Switch to All to look across every project.'
                    : 'Nothing in any project matches.'}
                </span>
              </>
            )}
            {q === '' && shown.length === 0 && (
              <span
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: '#8f96a0',
                  padding: '26px 10px 0',
                  textWrap: 'pretty',
                }}
              >
                {histScope === 'project'
                  ? 'No chats in this project yet.'
                  : 'No chats yet. They appear here as you ask.'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The main column. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 22px 12px',
            pointerEvents: 'none',
          }}
        >
          <button
            onClick={() => setHistOpen((was) => !was)}
            title="Chat history"
            style={{
              flex: '0 0 auto',
              pointerEvents: 'auto',
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
              strokeLinejoin="round"
            >
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <line x1="9.5" y1="4.5" x2="9.5" y2="19.5" />
            </svg>
          </button>
          <span style={{ flex: 1, minWidth: 0 }} />
          {shareSaid && (
            <span
              style={{
                flex: '0 0 auto',
                pointerEvents: 'auto',
                fontSize: 12.5,
                letterSpacing: '-.01em',
                color: '#6b7280',
                background: '#fff',
                borderRadius: 999,
                boxShadow:
                  '0 0 0 .5px rgba(30,32,38,.07), 0 6px 18px rgba(16,22,35,.05)',
                padding: '5px 11px',
                animation: 'pcIn .24s ease both',
              }}
            >
              Link copied
            </span>
          )}
          <button
            onClick={share}
            title="Share"
            style={{
              flex: '0 0 auto',
              pointerEvents: 'auto',
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
              strokeLinejoin="round"
            >
              <path d="M12 15V4" />
              <polyline points="8,7.5 12,3.5 16,7.5" />
              <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
            </svg>
          </button>
        </div>

        {/* Messages. */}
        <div
          ref={scroll}
          style={{
            flex: empty ? '0 1 auto' : 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 clamp(18px,5vw,40px) 14px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 760,
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(34px,6vh,54px)',
              padding: `${empty ? 0 : 64}px 0 8px`,
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'pcIn .24s ease both',
                }}
              >
                {m.role === 'you' && (
                  <div
                    style={{
                      alignSelf: 'flex-end',
                      background: '#f4f4f2',
                      borderRadius: '16px 16px 5px 16px',
                      padding: '11px 15px',
                      maxWidth: 'min(86%,52ch)',
                      fontSize: 15.5,
                      lineHeight: 1.55,
                      letterSpacing: '-.006em',
                      textWrap: 'pretty',
                    }}
                  >
                    {m.text}
                  </div>
                )}
                {m.role === 'working' && (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 18 }}
                  >
                    <Mark />
                    <span
                      style={{
                        fontSize: 15,
                        letterSpacing: '-.006em',
                        background:
                          'linear-gradient(100deg,#c9ccd2 20%,#6b7280 42%,#c9ccd2 64%)',
                        backgroundSize: '220% 100%',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                        animation: 'aShimmer 1.8s linear infinite',
                      }}
                    >
                      {m.text}
                    </span>
                  </div>
                )}
                {m.role === 'answer' && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Mark top={6} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 18,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16,
                          lineHeight: 1.7,
                          color: '#1d1d1f',
                          whiteSpace: 'pre-wrap',
                          textWrap: 'pretty',
                        }}
                      >
                        {m.text}
                      </span>
                      {m.rows !== undefined && m.rows.length > 0 && (
                        //: The tool's own rows, verbatim — the cells
                        //: behind the answer, never re-typed by the
                        //: language model.
                        <div
                          style={{
                            background: '#fbfbfc',
                            border: '.5px solid #f0eff1',
                            borderRadius: 14,
                            overflow: 'hidden',
                          }}
                        >
                          {m.rows.slice(0, 12).map((row, ri) => (
                            <div
                              key={ri}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '110px 1fr auto',
                                gap: 12,
                                alignItems: 'center',
                                borderTop: ri === 0 ? 0 : '.5px solid #f0eff1',
                                padding: '10px 14px',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: font.mono,
                                  fontSize: 12,
                                  color: '#0060d0',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {row.ref}
                              </span>
                              <span
                                style={{
                                  minWidth: 0,
                                  fontSize: 13.5,
                                  color: '#4a4f57',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {row.what}
                              </span>
                              <span
                                style={{
                                  fontFamily: font.mono,
                                  fontSize: 12.5,
                                  color: '#1c1f23',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {row.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {!!m.ends && (
                        <span
                          style={{
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#8f96a0',
                            textWrap: 'pretty',
                          }}
                        >
                          {m.ends}
                        </span>
                      )}
                      {!!m.trace && (
                        <span style={{ fontSize: 12.5, color: '#b6bac1' }}>
                          {m.trace}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Greeting + composer. */}
        <div
          style={{
            flex: empty ? 1 : '0 0 auto',
            minHeight: 0,
            padding: '14px clamp(18px,5vw,40px) 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: empty ? 'center' : 'flex-end',
            gap: 10,
          }}
        >
          {empty && (
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingBottom: 'clamp(10px,2.4vh,26px)',
              }}
            >
              <span
                style={{
                  fontFamily: font.serif,
                  fontSize: 'clamp(28px,4.4vw,42px)',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  letterSpacing: '-.012em',
                  color: '#1c1f23',
                  textAlign: 'center',
                  textWrap: 'pretty',
                }}
              >
                What can I help you with today?
              </span>
            </div>
          )}
          <div
            style={{
              width: '100%',
              maxWidth: 800,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: 8,
              rowGap: 12,
              border: '1px solid rgba(16,22,35,.07)',
              background: '#fff',
              borderRadius: 24,
              padding: '16px 14px 13px 20px',
              boxShadow:
                '0 1px 2px rgba(16,22,35,.05), 0 12px 32px rgba(16,22,35,.09), inset 0 1px 0 rgba(255,255,255,.7)',
            }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask(prompt)
                }
              }}
              placeholder="Ask anything"
              rows={1}
              style={{
                order: 1,
                flex: '1 1 100%',
                minWidth: 0,
                alignSelf: 'center',
                border: 0,
                outline: 'none',
                resize: 'none',
                font: 'inherit',
                fontSize: 15,
                lineHeight: '22px',
                color: '#15171b',
                background: 'transparent',
                padding: 0,
                margin: 0,
                height: 22,
                overflow: 'hidden',
              }}
            />
            <button
              onClick={() => ask(prompt)}
              title="Send"
              style={{
                order: 5,
                marginLeft: 'auto',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 0,
                background: '#16181c',
                boxShadow: '0 1px 2px rgba(16,22,35,.22)',
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
          {empty && picked !== null && (
            <div
              style={{
                width: '100%',
                maxWidth: 800,
                display: 'flex',
                justifyContent: 'center',
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <button
                  onClick={() => setPjMenu((was) => !was)}
                  title="Choose the project this chat works in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    border: '1px solid #e2e1de',
                    background: '#fbfbfa',
                    borderRadius: 999,
                    height: 34,
                    padding: '0 12px 0 11px',
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0060d0"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 15px' }}
                  >
                    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
                  </svg>
                  <span
                    style={{
                      fontSize: 13.5,
                      letterSpacing: '-.006em',
                      color: '#0060d0',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {picked.name}
                  </span>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a2a29c"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: '0 0 11px' }}
                  >
                    <polyline points="5,9 12,16 19,9" />
                  </svg>
                </button>
                {pjMenu && (
                  <>
                    <span
                      onClick={() => setPjMenu(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 10px)',
                        zIndex: 50,
                        width: 300,
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(255,255,255,.96)',
                        backdropFilter: 'blur(30px) saturate(1.8)',
                        WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
                        borderRadius: 13,
                        boxShadow:
                          '0 18px 44px rgba(0,0,0,.19), 0 0 0 .5px rgba(0,0,0,.08)',
                        padding: 6,
                        animation: 'pcIn .14s ease both',
                      }}
                    >
                      {models.map((one) => (
                        <button
                          key={one.id}
                          onClick={() => {
                            setPickedId(one.id)
                            setPjMenu(false)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            background:
                              one.id === picked.id
                                ? 'rgba(16,20,28,.05)'
                                : 'transparent',
                            borderRadius: 8,
                            font: 'inherit',
                            fontSize: 14.5,
                            color: '#15171b',
                            cursor: 'pointer',
                            padding: '9px 11px',
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {one.name}
                          </span>
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

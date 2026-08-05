'use client'

/* ============================================================
   Course Assistant — student "Course TA" chat (v2)
   Floating launcher → office-hours sheet. A neutral teaching
   assistant (gradient sparkle mark, NOT the instructor's face or
   voice): course-first answers that cite the lessons, with general
   subject knowledge clearly labeled. Ported from the "Ask Carla —
   Student" design and wired to the live SSE endpoint.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Markdown from 'markdown-to-jsx'

import {
  type AskCitation,
  streamAsk,
  useCourseAssistantStatus,
} from '@/hooks/queries/courseAssistant'

import './askAssistant.css'

interface AskAssistantProps {
  courseId: string
  token: string
}

const SF = {
  close: 'M6 6l12 12M18 6 6 18',
  send: 'M21 3 3 11l7 2.6L13 21l8-18Z',
  play2: 'M8 6.5v11a1 1 0 0 0 1.5.87l9-5.5a1 1 0 0 0 0-1.74l-9-5.5A1 1 0 0 0 8 6.5Z',
  chevron: 'm9 6 6 6-6 6',
  check: 'm5 12.5 4.5 4.5L19 6.5',
  book: 'M5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v12.5 M5 4.5A1.5 1.5 0 0 0 3.5 6v12a1.5 1.5 0 0 0 1.5 1.5h11.5 M8 9h5.5 M8 12.5h5.5',
  user: 'M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M5 20a7 7 0 0 1 14 0',
  bolt: 'M13 3 4 14h6l-1 7 9-11h-6l1-7Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M3.5 12h17 M12 3c2.6 2.7 2.6 15.3 0 18 M12 3c-2.6 2.7-2.6 15.3 0 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5 M12 7.6h.01',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
}

function Glyph({
  d,
  size = 24,
  stroke = 2,
  fill = 'none',
}: {
  d: string
  size?: number
  stroke?: number
  fill?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={(i ? 'M' : '') + seg} />
      ))}
    </svg>
  )
}

// TA mark — a clearly-AI assistant badge (gradient sparkle), never the
// instructor's face. `cls` provides the tile size slot; `g` is the glyph size.
function Mark({ cls = '', g = 22 }: { cls?: string; g?: number }) {
  return (
    <span className={`ta-mark ${cls}`}>
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient
            id="taSparkGrad"
            x1="4.5"
            y1="18.5"
            x2="19.5"
            y2="5.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#8E54D6" />
            <stop offset="0.45" stopColor="#5C6FE0" />
            <stop offset="1" stopColor="#2E9BE8" />
          </linearGradient>
        </defs>
        <path
          d="M12 1.6 C12.95 8.3 15.7 11.05 22.4 12 C15.7 12.95 12.95 15.7 12 22.4 C11.05 15.7 8.3 12.95 1.6 12 C8.3 11.05 11.05 8.3 12 1.6 Z"
          fill="url(#taSparkGrad)"
        />
      </svg>
    </span>
  )
}

interface ChatMessage {
  role: 'user' | 'ta'
  text: string
  citations?: AskCitation[]
  general?: boolean
  follow?: string[]
  _new?: boolean
}

// Render the answer as Markdown (headings, bold, lists, code…) the way Claude
// does — and progressively, so it reads as if it's being written. Raw HTML is
// disabled for safety; links open in a new tab.
const MD_OPTIONS = {
  forceBlock: true,
  disableParsingRawHTML: true,
  overrides: {
    a: (props: React.ComponentProps<'a'>) => (
      <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
    ),
  },
}

// "2:40" from a citation's start second.
function fmtCiteTime(secs?: number | null): string | null {
  if (secs == null || secs <= 0) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function Citations({
  cites,
  onJump,
}: {
  cites?: AskCitation[]
  onJump: (c: AskCitation) => void
}) {
  // ONE clean card per lesson, never a transcript dump: the model returns a
  // citation per retrieved passage, so a single answer can carry several
  // near-identical entries for the same lesson. Keep only citations that
  // actually open a lesson, collapse duplicates (preferring one with a
  // timestamp), and cap the list — the cards are pointers to the source,
  // not the source itself.
  const byLesson = new Map<string, AskCitation>()
  for (const c of cites ?? []) {
    if (!c.lesson_id) continue
    const cur = byLesson.get(c.lesson_id)
    if (!cur || (cur.seconds == null && c.seconds != null)) {
      byLesson.set(c.lesson_id, c)
    }
  }
  const usable = [...byLesson.values()].slice(0, 3)
  if (!usable.length) return null
  return (
    <div className="m-cites">
      <div className="m-cites-h">
        <Glyph d={SF.book} size={14} stroke={1.9} /> From the course
      </div>
      {usable.map((c) => {
        const title = c.lesson_title || c.document_title || 'Lesson'
        const heading =
          c.lesson_number != null
            ? `Lesson ${c.lesson_number} · ${title}`
            : title
        // "The toss · 2:40" — the moment's name and where it starts. No
        // quoted transcript text here; the lesson itself is one tap away.
        const sub =
          [c.label, fmtCiteTime(c.seconds)].filter(Boolean).join(' · ') || null
        return (
          <button className="cite" key={c.lesson_id} onClick={() => onJump(c)}>
            <span
              className={`cite-thumb${c.thumbnail_url ? '' : ' cite-thumb--empty'}`}
            >
              {c.thumbnail_url ? <img src={c.thumbnail_url} alt="" /> : null}
              <span className="pl">
                <Glyph d={SF.play2} size={15} fill="currentColor" stroke={0} />
              </span>
            </span>
            <span className="cite-main">
              <span className="cl">{heading}</span>
              {sub ? <span className="cm">{sub}</span> : null}
            </span>
            <span className="cite-go">
              <Glyph d={SF.chevron} size={17} stroke={2.2} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function GeneralNote() {
  return (
    <div className="m-general">
      <div className="m-general-h">
        <Glyph d={SF.globe} size={14} stroke={1.9} /> General knowledge
      </div>
      <div className="m-general-tx">
        Not from the course lessons — the course is the source of truth wherever
        they differ.
      </div>
    </div>
  )
}

function TAMessage({
  m,
  name,
  onJump,
  onChip,
  streaming,
}: {
  m: ChatMessage
  name: string
  onJump: (c: AskCitation) => void
  onChip: (q: string) => void
  streaming: boolean
}) {
  return (
    <div className={`msg-ta ${m._new ? 'msg-in' : ''}`}>
      <Mark cls="m-ava" g={18} />
      <div className="m-body">
        <div className="m-name">
          <span className="nm">{name}</span>
        </div>
        {streaming && m.text.length === 0 ? (
          <div className="typing">
            <i></i>
            <i></i>
            <i></i>
          </div>
        ) : (
          <div className="m-md">
            <Markdown options={MD_OPTIONS}>{m.text}</Markdown>
          </div>
        )}
        {!streaming &&
          (m.general ? (
            <GeneralNote />
          ) : (
            <Citations cites={m.citations} onJump={onJump} />
          ))}
        {!streaming && m.follow && m.follow.length > 0 && (
          <div className="m-follow">
            {m.follow.map((f, i) => (
              <button className="fchip" key={i} onClick={() => onChip(f)}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TrustCard({
  name,
  onClose,
  onAsk,
}: {
  name: string
  onClose: () => void
  onAsk: () => void
}) {
  return (
    <div
      className="mind-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mind-card">
        <button className="mind-x" onClick={onClose} aria-label="Close">
          <Glyph d={SF.close} size={14} stroke={2.3} />
        </button>
        <div className="trust-head">
          <Mark cls="trust-ava" g={26} />
          <div className="trust-id">
            <div className="trust-name">{name}</div>
            <div className="trust-role">Teaching assistant for this course</div>
          </div>
        </div>

        <div className="trust-list">
          <div className="trust-row">
            <span className="trust-ico">
              <Glyph d={SF.user} size={18} stroke={1.9} />
            </span>
            <span className="trust-tx">
              <strong>A course assistant, not your instructor.</strong> It’s the
              AI teaching assistant for this course — clearly labeled, and it
              never speaks as your instructor.
            </span>
          </div>
          <div className="trust-row">
            <span className="trust-ico">
              <Glyph d={SF.book} size={17} stroke={1.9} />
            </span>
            <span className="trust-tx">
              <strong>Course first.</strong> Answers come from the lessons and
              link to the source. General knowledge fills the gaps — labeled when
              it does, never overriding the course.
            </span>
          </div>
          <div className="trust-row">
            <span className="trust-ico">
              <Glyph d={SF.bolt} size={18} stroke={1.9} />
            </span>
            <span className="trust-tx">
              <strong>On from day one.</strong> It works the moment the course is
              live and quietly gets sharper as each lesson is processed.
            </span>
          </div>
        </div>

        <div className="mind-verified">
          <span className="vchk">
            <Glyph d={SF.check} size={11} stroke={2.8} />
          </span>
          Course-first answers · general knowledge always labeled
        </div>

        <div className="mind-ctas">
          <button className="mind-cta primary" onClick={onAsk}>
            Ask a question
          </button>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_STARTERS = [
  'What’s the best place to start?',
  'Summarize the key ideas of this course',
]

export function AskAssistant({ courseId, token }: AskAssistantProps) {
  const { data: status } = useCourseAssistantStatus(courseId, token)
  const router = useRouter()
  const searchParams = useSearchParams()

  // The customer portal is always dark — the sheet follows, no toggle.
  const dark = true
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [trustOpen, setTrustOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const convoRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Smooth-streaming buffer: network deltas arrive in uneven bursts, so we
  // accumulate them in fullTextRef and reveal them at a steady, eased pace
  // (like Claude / the AI-SDK smoothStream), instead of dumping each burst.
  const fullTextRef = useRef('')
  const shownRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const streamDoneRef = useRef(false)

  const disclaimer =
    status?.disclaimer || 'AI assistant · double-check anything important.'
  const starters =
    status?.starters && status.starters.length
      ? status.starters
      : DEFAULT_STARTERS
  const suggestions = status?.suggestions ?? []
  // The TA's name everywhere in the UI: "{First}'s TA" (e.g. "Didi's TA") when
  // we know the instructor, else the neutral "Course TA". The launcher prefixes
  // it with "Ask ".
  const instructorFirst = (status?.instructor_name ?? '').trim().split(/\s+/)[0]
  const taName = instructorFirst ? `${instructorFirst}’s TA` : 'Course TA'
  const launcherLabel = instructorFirst ? `Ask ${taName}` : 'Course TA'

  useEffect(() => {
    const el = convoRef.current
    // 'auto' (not 'smooth'): the answer updates many times a second while
    // streaming, and re-triggering smooth-scroll each frame fights itself.
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
  }, [msgs, streaming])

  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 2200)
  }, [])

  const updateLastTA = useCallback(
    (fn: (m: ChatMessage) => ChatMessage) =>
      setMsgs((cur) => {
        const next = [...cur]
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'ta') {
            next[i] = fn(next[i])
            break
          }
        }
        return next
      }),
    [],
  )

  // Reveal the buffered answer a little each frame so it reads as if it's being
  // typed, smoothing out bursty network chunks. Speed eases with the backlog:
  // it catches up when far behind and slows as it drains.
  const pumpReveal = useCallback(() => {
    if (rafRef.current != null) return
    const tick = () => {
      const full = fullTextRef.current
      const remaining = full.length - shownRef.current
      if (remaining > 0) {
        const step = Math.max(3, Math.ceil(remaining / 10))
        shownRef.current = Math.min(full.length, shownRef.current + step)
        const shown = full.slice(0, shownRef.current)
        updateLastTA((m) => ({ ...m, text: shown }))
      }
      if (
        shownRef.current < fullTextRef.current.length ||
        !streamDoneRef.current
      ) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
        setStreaming(false)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [updateLastTA])

  const ask = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || streaming) return
      setMsgs((m) => [
        ...m,
        { role: 'user', text, _new: true },
        { role: 'ta', text: '', _new: true },
      ])
      setDraft('')
      setStreaming(true)
      fullTextRef.current = ''
      shownRef.current = 0
      streamDoneRef.current = false
      abortRef.current = streamAsk(courseId, token, text, {
        onText: (chunk) => {
          fullTextRef.current += chunk
          pumpReveal()
        },
        onCitations: (citations) => updateLastTA((m) => ({ ...m, citations })),
        onGeneral: () => updateLastTA((m) => ({ ...m, general: true })),
        onFollow: (follow) => updateLastTA((m) => ({ ...m, follow })),
        onRefusal: (message) => {
          if (!fullTextRef.current) fullTextRef.current = message
          pumpReveal()
        },
        onError: (message) => {
          if (!fullTextRef.current) fullTextRef.current = message
          pumpReveal()
        },
        onDone: () => {
          streamDoneRef.current = true
          pumpReveal()
        },
      })
    },
    [courseId, token, streaming, pumpReveal, updateLastTA],
  )

  const onJump = useCallback(
    (c: AskCitation) => {
      if (!c.lesson_id) return
      const label =
        c.lesson_number != null
          ? `Opening Lesson ${c.lesson_number}`
          : 'Opening lesson'
      flashToast(c.label ? `${label} · ${c.label}` : label)
      const params = new URLSearchParams(searchParams.toString())
      params.set('lesson', c.lesson_id)
      if (c.seconds != null && c.seconds > 0) {
        params.set('t', String(Math.floor(c.seconds)))
      } else {
        params.delete('t')
      }
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams, flashToast],
  )

  const doClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 280)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (trustOpen) setTrustOpen(false)
        else if (open) doClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, trustOpen, doClose])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  if (!status?.available) return null

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(130, el.scrollHeight) + 'px'
  }

  return (
    <div className={`ta-widget ${dark ? 'dark' : ''}`}>
      {open && (
        <section className={`ta-sheet ${closing ? 'closing' : ''}`}>
          <header className="ta-head">
            <div className="ta-ava-wrap">
              <Mark cls="ta-ava" g={24} />
              <span className="ta-ava-dot" title="Always on"></span>
            </div>
            <div className="ta-id">
              <div className="ta-id-top">
                <span className="ta-name">{taName}</span>
                <button
                  className="ta-seal"
                  onClick={() => setTrustOpen(true)}
                  aria-label="About this assistant"
                >
                  <Glyph d={SF.info} size={16} stroke={1.9} />
                </button>
              </div>
              <div className="ta-sub">AI assistant</div>
            </div>
            <div className="ta-head-btns">
              <button
                className="ta-iconbtn"
                onClick={doClose}
                aria-label="Close"
              >
                <Glyph d={SF.close} size={15} stroke={2.3} />
              </button>
            </div>
          </header>

          <div className="ta-convo" ref={convoRef}>
            {msgs.length === 0 && !streaming ? (
              <div className="ta-empty">
                <div className="ta-empty-ava-wrap">
                  <Mark cls="ta-empty-ava" g={30} />
                  <span className="ta-empty-dot"></span>
                </div>
                <div className="ta-empty-t">{taName}</div>
                <div className="ta-empty-s">
                  Answers from your course, any time.
                </div>
                {starters.length > 0 && (
                  <>
                    <div className="ta-empty-k">Try asking</div>
                    <div className="ta-starters">
                      {starters.map((s, i) => (
                        <button
                          className="starter"
                          key={i}
                          onClick={() => ask(s)}
                        >
                          <span className="starter-tx">{s}</span>
                          <span className="starter-go">
                            <Glyph d={SF.chevron} size={16} stroke={2.2} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              msgs.map((m, i) =>
                m.role === 'user' ? (
                  <div className={`msg-user ${m._new ? 'msg-in' : ''}`} key={i}>
                    <div className="bubble">{m.text}</div>
                  </div>
                ) : (
                  <TAMessage
                    key={i}
                    m={m}
                    name={taName}
                    onJump={onJump}
                    onChip={ask}
                    streaming={streaming && i === msgs.length - 1}
                  />
                ),
              )
            )}
          </div>

          <div className="ta-compose">
            {msgs.length > 0 && suggestions.length > 0 && (
              <div className="ta-suggest">
                {suggestions.map((s, i) => (
                  <button className="schip" key={i} onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="ta-inputrow">
              <textarea
                ref={inputRef}
                className="ta-input"
                rows={1}
                value={draft}
                placeholder="Ask anything about the course…"
                onChange={(e) => {
                  setDraft(e.target.value)
                  autosize(e.target)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(draft)
                    if (inputRef.current) inputRef.current.style.height = 'auto'
                  }
                }}
              />
              <button
                className="ta-send"
                disabled={!draft.trim() || streaming}
                onClick={() => {
                  ask(draft)
                  if (inputRef.current) inputRef.current.style.height = 'auto'
                }}
                aria-label="Send"
              >
                <Glyph d={SF.send} size={19} fill="currentColor" />
              </button>
            </div>
            <div className="ta-fine">{disclaimer}</div>
          </div>
        </section>
      )}

      {!open && (
        <button className="ta-launcher" onClick={() => setOpen(true)}>
          <span className="lc-ava-wrap">
            <Mark cls="lc-ava" g={20} />
            <span className="lc-dot"></span>
          </span>
          <span className="lc-txt">
            <span className="lc-t">{launcherLabel}</span>
          </span>
        </button>
      )}

      {toast && (
        <div className="ta-toast">
          <span className="tk">
            <Glyph d={SF.play2} size={14} fill="currentColor" stroke={0} />
          </span>
          {toast}
        </div>
      )}

      {trustOpen && (
        <TrustCard
          name={taName}
          onClose={() => setTrustOpen(false)}
          onAsk={() => {
            setTrustOpen(false)
            setOpen(true)
            setTimeout(() => inputRef.current?.focus(), 60)
          }}
        />
      )}
    </div>
  )
}

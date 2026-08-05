'use client'

/* ============================================================
   SPAIRE ORIGINALS — Course builder · ASSISTANT (top-level tab)
   A standalone editor tab (peer of Outline / Landing / Community).
   One surface, three moments, driven by the assistant's status:
     building          → calm, nothing to do; it trains itself
     ready_for_review  → the one required step: review + make it live
     live | disabled   → status + (placeholder) what students ask + improve
   Self-styling: wraps its body in the `.spaire-hub` design system so it
   renders identically whether the editor is in light or dark mode.
   ============================================================ */

import { useState } from 'react'

import {
  type CourseAssistantManage,
  type CourseAssistantSample,
  useApproveAssistant,
  useCourseAssistant,
  useCourseAssistantQuestions,
  useRegenerateAssistant,
  useSetAssistantLive,
  useUpdateAssistantSample,
  useUpdateAssistantSettings,
} from '@/hooks/queries/courseAssistant'

import '../../Community/hub/hub.css'
import '../../Community/hub/hub-extra.css'
import './assistant.css'

interface AssistantPanelProps {
  courseId: string
  selfName: string
  selfAvatar: string | null
  showToast: (msg: string) => void
  dark?: boolean
}

/* ---------- glyphs ---------- */
const G = {
  chevR: 'M9 6l6 6-6 6',
  check: 'm5 12.5 4.5 4.5L19 6.5',
  doc: 'M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M13.5 3v5h4.5',
  pencil: 'M14.5 5.5l4 4 M4 20l1-4L16 5a2 2 0 0 1 3 3L8 19l-4 1Z',
  plus: 'M12 5v14 M5 12h14',
  sliders: 'M5 8h9 M18 8h1 M5 16h1 M10 16h9 M14 5v6 M8 13v6',
  play: 'M8 6.5v11a1 1 0 0 0 1.5.87l9-5.5a1 1 0 0 0 0-1.74l-9-5.5A1 1 0 0 0 8 6.5Z',
} as const

function Gl({
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
      {d.split(' M').map((s, i) => (
        <path key={i} d={(i ? 'M' : '') + s} />
      ))}
    </svg>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`tog${on ? ' on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
    />
  )
}

const AVATAR_FALLBACK =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80&auto=format&fit=crop'

/* ============================================================ BUILDING / FAILED */
function Building({
  lessonCount,
  error,
  onRegenerate,
  regenerating,
}: {
  lessonCount: number | null
  error: string | null
  onRegenerate: () => void
  regenerating: boolean
}) {
  const failed = !!error
  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">Assistant</div>
          <div className="s">
            A version of you that answers students inside the course, in your
            voice, from your lessons.
          </div>
        </div>
      </div>

      <div className="card asst-build">
        <div className="asst-build-orb">
          <Gl d={G.play} size={22} fill="currentColor" stroke={0} />
        </div>
        <h2>{failed ? 'We hit a snag' : 'Building your assistant'}</h2>
        <p>
          {failed
            ? error
            : 'It’s learning from your lessons. We’ll let you know when it’s ready to review.'}
        </p>
        {!failed && lessonCount != null && (
          <div className="asst-build-meta">{lessonCount} lessons</div>
        )}
        {failed && (
          <button
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={onRegenerate}
            disabled={regenerating}
          >
            {regenerating ? 'Rebuilding…' : 'Try again'}
          </button>
        )}
      </div>
    </>
  )
}

/* ============================================================ REVIEW */
function ReviewCard({
  s,
  onApprove,
  onSaveEdit,
  busy,
}: {
  s: CourseAssistantSample
  onApprove: () => void
  onSaveEdit: (text: string) => void
  busy: boolean
}) {
  const shown = s.edited_answer || s.answer
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(shown)
  return (
    <div className={`card rev-card ${s.approved ? 'approved' : ''}`}>
      <div className="rev-q">
        <span className="ql">Asks</span>
        <span className="qt">{s.question}</span>
        {s.scope && <span className="rev-scope">{s.scope}</span>}
      </div>
      <div className="rev-a">
        <div className="rev-a-main">
          <div className="rev-a-name">Assistant</div>
          {editing ? (
            <div className="rev-edit">
              <textarea
                className="textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="rev-edit-foot">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => {
                    onSaveEdit(text)
                    setEditing(false)
                  }}
                >
                  Save
                </button>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    setText(shown)
                    setEditing(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rev-a-text">{shown}</div>
              {s.citation && (
                <span className="rev-cite">
                  <Gl d={G.doc} size={14} stroke={1.9} /> {s.citation}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {!editing && (
        <div className="rev-foot">
          <span className={`rev-status ${s.approved ? 'ok' : ''}`}>
            {s.approved && (
              <>
                <Gl d={G.check} size={14} stroke={2.6} /> Approved
              </>
            )}
          </span>
          <button className="rev-btn" onClick={() => setEditing(true)}>
            <span className="ic">
              <Gl d={G.pencil} size={15} stroke={1.9} />
            </span>{' '}
            Edit
          </button>
          <button
            className={`rev-btn approve ${s.approved ? 'on' : ''}`}
            disabled={busy}
            onClick={onApprove}
          >
            <span className="ic">
              <Gl d={G.check} size={15} stroke={2.4} />
            </span>{' '}
            {s.approved ? 'Approved' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}

function Review({
  data,
  courseId,
  onMakeLive,
  makingLive,
}: {
  data: CourseAssistantManage
  courseId: string | undefined
  onMakeLive: () => void
  makingLive: boolean
}) {
  const samples = data.sample_questions ?? []
  const reviewed = samples.filter((s) => s.approved).length
  const updateSample = useUpdateAssistantSample(courseId)
  const allReviewed = samples.length > 0 && reviewed === samples.length
  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">Review your assistant</div>
          <div className="s">
            See how it answers a few real questions, including ones it
            shouldn’t. Approve or edit, then make it live.
          </div>
        </div>
      </div>

      <div className="card rev-intro">
        <span className="ri-n">
          <b>{reviewed}</b> of {samples.length} reviewed. What you approve is
          what students get.
        </span>
      </div>

      <div className="rev-list">
        {samples.map((s) => (
          <ReviewCard
            key={s.id}
            s={s}
            busy={updateSample.isPending}
            onApprove={() =>
              updateSample.mutate({ sampleId: s.id, approved: !s.approved })
            }
            onSaveEdit={(text) =>
              updateSample.mutate({
                sampleId: s.id,
                answer: text,
                approved: true,
              })
            }
          />
        ))}
      </div>

      <div className="rev-bar">
        <div className="rev-bar-n">
          <div className="bn">
            {allReviewed
              ? 'Ready to go live'
              : `${reviewed} of ${samples.length} reviewed`}
          </div>
          <div className="bs">You can refine it later.</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={onMakeLive}
          disabled={makingLive}
        >
          {makingLive ? 'Going live…' : 'Make it live'}
        </button>
      </div>
    </>
  )
}

/* ============================================================ WHAT STUDENTS ASK */
function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(iso).toLocaleDateString()
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * "What students are asking" — real, server-aggregated demand (Phase 5).
 * Questions are grouped by normalized text; refusals surface content gaps.
 */
function AskingPanel({ courseId }: { courseId: string | undefined }) {
  const { data, isLoading } = useCourseAssistantQuestions(courseId)

  let body: React.ReactNode
  if (isLoading || !data) {
    body = (
      <div className="ask-row" style={{ cursor: 'default' }}>
        <div className="ask-main">
          <div className="ask-q" style={{ opacity: 0.6 }}>
            Loading…
          </div>
        </div>
      </div>
    )
  } else if (data.items.length === 0) {
    body = (
      <div className="ask-row" style={{ cursor: 'default' }}>
        <div className="ask-main">
          <div className="ask-q" style={{ opacity: 0.6 }}>
            Once students start asking, the most common questions show up here.
          </div>
        </div>
      </div>
    )
  } else {
    body = data.items.map((q) => (
      <div className="ask-row" key={q.question} style={{ cursor: 'default' }}>
        <div className="ask-main">
          <div className="ask-q">{q.question}</div>
          <div className="ask-meta">
            <span>{plural(q.asker_count, 'student')}</span>
            <span className="sep">·</span>
            <span>{relTime(q.last_asked_at)}</span>
            {q.refused_count > 0 && (
              <>
                <span className="sep">·</span>
                <span className="ask-gap">
                  Couldn’t answer {q.refused_count}×
                </span>
              </>
            )}
          </div>
        </div>
        <div className="ask-count">{q.count}×</div>
      </div>
    ))
  }

  const hasData = !!data && data.total_questions > 0
  return (
    <>
      <div className="cr-head" style={{ marginBottom: 16 }}>
        <div>
          <div className="h" style={{ fontSize: 19 }}>
            What students are asking
          </div>
          {hasData && (
            <div className="s">
              {plural(data.total_questions, 'question')} from{' '}
              {plural(data.asker_count, 'student')}
              {data.refused_count > 0
                ? ` · ${data.refused_count} couldn’t be answered`
                : ''}
            </div>
          )}
        </div>
      </div>
      <div className="card ask-list" style={{ marginBottom: 28 }}>
        {body}
      </div>
    </>
  )
}

/* ============================================================ LIVE */
function Live({
  data,
  courseId,
  selfName,
  selfAvatar,
  showToast,
}: {
  data: CourseAssistantManage
  courseId: string | undefined
  selfName: string
  selfAvatar: string | null
  showToast: (m: string) => void
}) {
  const setLive = useSetAssistantLive(courseId)
  const updateSettings = useUpdateAssistantSettings(courseId)
  const liveOn = data.live
  const name = data.display_name || selfName
  const disclaimer =
    data.disclaimer || 'AI assistant. Answers come from the course lessons.'
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftDisc, setDraftDisc] = useState(disclaimer)

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">Assistant</div>
          <div className="s">
            It’s answering students inside the course. Keep an eye on what they
            ask.
          </div>
        </div>
      </div>

      {data.has_pending_review && (
        <div className="card rev-intro" style={{ marginBottom: 16 }}>
          <span className="ri-n">
            You changed the course since this was approved. The live answers are
            still the approved version — re-review when you’re ready.
          </span>
        </div>
      )}

      {/* status — primary */}
      <div className="card asst-status">
        <div className="asst-status-ava">
          <img src={selfAvatar || AVATAR_FALLBACK} alt={name} />
          <span className="dot" />
        </div>
        <div className="asst-status-main">
          <h2>Ask {name}</h2>
          <div className="ss">{liveOn ? 'Live to students' : 'Paused'}</div>
        </div>
        <div className="asst-status-state">
          <span className={`asst-status-lbl ${liveOn ? '' : 'off'}`}>
            {liveOn ? 'On' : 'Off'}
          </span>
          <Toggle on={liveOn} onClick={() => setLive.mutate(!liveOn)} />
        </div>
      </div>

      {/* what students see — name + disclaimer */}
      <div className="glist-label">Shown to students</div>
      <div className="card glist" style={{ marginBottom: 28 }}>
        {editing ? (
          <div className="rev-edit" style={{ padding: 4 }}>
            <input
              className="textarea"
              style={{ minHeight: 0, marginBottom: 8 }}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name students see"
            />
            <textarea
              className="textarea"
              value={draftDisc}
              onChange={(e) => setDraftDisc(e.target.value)}
              placeholder="Disclaimer"
            />
            <div className="rev-edit-foot">
              <button
                className="btn btn-primary btn-sm"
                disabled={updateSettings.isPending}
                onClick={() => {
                  updateSettings.mutate({
                    display_name: draftName,
                    disclaimer: draftDisc,
                  })
                  setEditing(false)
                }}
              >
                Save
              </button>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setDraftName(name)
                  setDraftDisc(disclaimer)
                  setEditing(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grow">
              <div className="grow-main">
                <div className="gl">Name</div>
              </div>
              <div className="grow-ctl">
                <span className="made-tag">Ask {name}</span>
              </div>
            </div>
            <div className="asst-disc">
              <span className="dl">“{disclaimer}”</span>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            </div>
          </>
        )}
      </div>

      {/* what students are asking — real, server-aggregated demand (Phase 5) */}
      <AskingPanel courseId={courseId} />

      {/* improve — quieter, optional (Phase 5 actions are placeholders) */}
      <div className="improve-label">
        Improve <span className="opt">· optional</span>
      </div>
      <div className="card improve">
        <div className="improve-head">Sound more like you</div>
        <div className="improve-sub">
          Add more only if you want. None of it is required.
        </div>
        <div className="improve-acts">
          <button
            className="improve-chip"
            onClick={() => showToast('Coming soon')}
          >
            <Gl d={G.plus} size={16} stroke={2} /> Add a document
          </button>
          <button
            className="improve-chip"
            onClick={() => showToast('Coming soon')}
          >
            <Gl d={G.sliders} size={16} stroke={1.9} /> Adjust the tone
          </button>
          <button
            className="improve-chip"
            onClick={() => showToast('Coming soon')}
          >
            <Gl d={G.doc} size={16} stroke={1.9} /> Answer a few questions
          </button>
        </div>
        <div className="improve-cov">
          <div className="improve-cov-top">
            <span className="ct">How much you’ve added</span>
            <span className="cv">
              Course
              {data.approved_lesson_count
                ? ` · ${data.approved_lesson_count} lessons`
                : ''}
            </span>
          </div>
          <div className="improve-cov-bar">
            <i style={{ width: '36%' }} />
          </div>
          <div className="improve-cov-note">
            A measure of what you’ve given it, not a grade.
          </div>
        </div>
      </div>
    </>
  )
}

/* ============================================================ TAB */
export function AssistantPanel({
  courseId,
  selfName,
  selfAvatar,
  showToast,
  dark,
}: AssistantPanelProps) {
  const { data, isLoading } = useCourseAssistant(courseId)
  const approve = useApproveAssistant(courseId)
  const regenerate = useRegenerateAssistant(courseId)

  let body: React.ReactNode

  if (isLoading || !data) {
    body = (
      <div className="card asst-build">
        <h2>Loading…</h2>
      </div>
    )
  } else if (!data.configured) {
    body = (
      <div className="cr-head">
        <div>
          <div className="h">Assistant</div>
          <div className="s">
            The course assistant isn’t enabled on this workspace yet.
          </div>
        </div>
      </div>
    )
  } else if (data.status === 'building') {
    body = (
      <Building
        lessonCount={data.draft_lesson_count}
        error={null}
        onRegenerate={() => regenerate.mutate()}
        regenerating={regenerate.isPending}
      />
    )
  } else if (data.status === 'failed') {
    body = (
      <Building
        lessonCount={data.draft_lesson_count}
        error={data.error ?? 'Something went wrong while building.'}
        onRegenerate={() => regenerate.mutate()}
        regenerating={regenerate.isPending}
      />
    )
  } else if (data.status === 'ready_for_review' && !data.live) {
    body = (
      <Review
        data={data}
        courseId={courseId}
        makingLive={approve.isPending}
        onMakeLive={() =>
          approve.mutate(
            {},
            { onSuccess: () => showToast('Your assistant is live') },
          )
        }
      />
    )
  } else {
    body = (
      <Live
        data={data}
        courseId={courseId}
        selfName={selfName}
        selfAvatar={selfAvatar}
        showToast={showToast}
      />
    )
  }

  return (
    <div className={`spaire-hub${dark ? ' dark' : ''}`}>
      <div className="wrap content">
        <div className="asst-tab">{body}</div>
      </div>
    </div>
  )
}

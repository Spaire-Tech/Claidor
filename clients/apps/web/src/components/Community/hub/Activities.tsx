'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Community Hub — Activities tab (creator).
 *
 * The thing you ask members to make. Empty state → "+" → form (cover, the ask,
 * submission format, link-to-episode) → published card → full submissions page
 * where each submission renders like a post with its own comment thread. Wired
 * to the existing community_activity / submission endpoints. The activity's
 * channel (module|lesson) is derived from the course; "Photo + note" maps onto
 * the stored 'photo' type (the design treats format as a label).
 */
import { HlsVideo } from '@/components/Courses/HlsVideo'
import {
  type ActivityChannelKind,
  type ActivitySubmissionType,
  type CommunityActivityCreateBody,
  type CommunityActivityRead,
  type CommunityActivitySubmissionRead,
  type CommunityActivityUpdateBody,
  useCommunityActivities,
  useCommunityActivitySubmissions,
  useCreateCommunityActivity,
  useDeleteCommunityActivity,
  usePostSubmissionComment,
  useSubmissionComments,
  useSubmitToCommunityActivity,
  useUpdateCommunityActivity,
  useUploadPostImage,
  useUploadPostVideo,
} from '@/hooks/queries/community'
import * as React from 'react'
import { CoverDrop, Field, Seg } from './atoms'
import { useHub } from './context'
import { timeAgo } from './format'
import { HeadInfo } from './HeadInfo'
import { HubAvatar } from './HubAvatar'
import { Glyph } from './icons'
import { type ChannelOption, EpisodeSelect } from './pickers'

const { useMemo, useRef, useState } = React

/* format label ↔ stored submission_type */
const FORMATS: { label: string; type: ActivitySubmissionType; sub: string }[] =
  [
    {
      label: 'Video',
      type: 'video',
      sub: 'Members upload a clip they filmed.',
    },
    { label: 'Photo', type: 'photo', sub: 'Members add a single image.' },
    {
      label: 'Photo + note',
      type: 'photo',
      sub: 'Members add an image with a short caption.',
    },
    { label: 'Text', type: 'text', sub: 'Members write a passage.' },
    { label: 'Link', type: 'link', sub: 'Members paste a link to their work.' },
  ]
const formatByLabel = (l: string) =>
  FORMATS.find((f) => f.label === l) || FORMATS[0]
const labelForType = (t: ActivitySubmissionType) =>
  ({ video: 'Video', photo: 'Photo', text: 'Text', link: 'Link' })[t]

/* ---------- sorting ----------
   Only date/count sorts are offered — activities and submissions don't carry a
   like/reaction count yet, so "most liked" isn't available to sort on. */
type ActivitySort = 'recent' | 'oldest' | 'active'
type SubmissionSort = 'recent' | 'oldest'

const ACTIVITY_SORTS: { value: ActivitySort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'active', label: 'Most submissions' },
]
const SUBMISSION_SORTS: { value: SubmissionSort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest' },
]

const byCreatedDesc = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0

const sortActivities = (
  items: CommunityActivityRead[],
  sort: ActivitySort,
): CommunityActivityRead[] => {
  const copy = [...items]
  if (sort === 'active')
    return copy.sort(
      (a, b) => b.submission_count - a.submission_count || byCreatedDesc(a, b),
    )
  copy.sort(byCreatedDesc)
  return sort === 'oldest' ? copy.reverse() : copy
}

const sortSubmissions = (
  items: CommunityActivitySubmissionRead[],
  sort: SubmissionSort,
): CommunityActivitySubmissionRead[] => {
  const copy = [...items].sort(byCreatedDesc)
  return sort === 'oldest' ? copy.reverse() : copy
}

function SortSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <label className="act-sort">
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Glyph d="chevD" size={14} stroke={2} />
    </label>
  )
}

export type CourseChannel = {
  kind: ActivityChannelKind
  noun: string
  options: ChannelOption[]
}

/* ---------- form ---------- */
function ActivityForm({
  courseId,
  channel,
  editing = null,
  onCancel,
  onCreated,
  showToast,
}: {
  courseId: string
  channel: CourseChannel
  /** When set, the form edits an existing activity instead of creating one. */
  editing?: CommunityActivityRead | null
  onCancel: (() => void) | null
  onCreated: () => void
  showToast: (m: string) => void
}) {
  const [prompt, setPrompt] = useState(
    () => editing?.description || editing?.title || '',
  )
  const [formatLabel, setFormatLabel] = useState(() =>
    editing ? labelForType(editing.submission_type) : 'Video',
  )
  const [channelId, setChannelId] = useState<string | null>(
    () => editing?.lesson_id || editing?.module_id || null,
  )
  const [cover, setCover] = useState(() => editing?.cover_url || '')
  const [coverPos, setCoverPos] = useState(
    () => editing?.cover_object_position || '50% 50%',
  )
  const [busy, setBusy] = useState(false)

  const uploadImg = useUploadPostImage(null, courseId, 'creator')
  const create = useCreateCommunityActivity(null, courseId, 'creator')
  const update = useUpdateCommunityActivity(null, courseId, 'creator')
  const fmt = formatByLabel(formatLabel)
  const can = prompt.trim() && channel.options.length > 0 && !busy

  const onCover = async (file: File, dataUrl: string) => {
    setCover(dataUrl)
    try {
      const res = await uploadImg.mutateAsync(file)
      setCover(res.public_url)
    } catch {
      setCover('')
      showToast('Could not upload that image')
    }
  }

  const submit = async () => {
    if (!can) return
    // Backend requires a channel (module XOR lesson). Honour the chosen
    // episode, else fall back to the first available channel target.
    const targetId = channelId ?? channel.options[0]?.id
    if (!targetId) {
      showToast('Add a module or lesson to the course first')
      return
    }
    const title = prompt.trim().slice(0, 200)
    const description = prompt.trim().length > 200 ? prompt.trim() : null
    setBusy(true)
    try {
      if (editing) {
        const body: CommunityActivityUpdateBody = {
          title,
          description,
          cover_url: cover || null,
          cover_object_position: cover ? coverPos : null,
          submission_type: fmt.type,
        }
        await update.mutateAsync({ activityId: editing.id, body })
        showToast('Activity updated')
      } else {
        const body: CommunityActivityCreateBody = {
          channel_kind: channel.kind,
          module_id: channel.kind === 'module' ? targetId : null,
          lesson_id: channel.kind === 'lesson' ? targetId : null,
          title,
          description,
          cover_url: cover || null,
          cover_object_position: cover ? coverPos : null,
          submission_type: fmt.type,
          pin_to_feed: false,
          notify_on_publish: true,
        }
        await create.mutateAsync(body)
        showToast('Activity published')
      }
      onCreated()
    } catch {
      showToast(
        editing ? 'Could not save changes' : 'Could not publish that activity',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card form-card">
      <div className="form-title">
        {editing ? 'Edit activity' : 'Create an activity'}
      </div>
      <Field label="Cover image">
        <CoverDrop
          src={cover}
          onFile={onCover}
          pos={coverPos}
          onPos={setCoverPos}
        />
      </Field>
      <Field label="What you’re asking members to do">
        <textarea
          className="textarea"
          style={{ minHeight: 90, fontSize: 16 }}
          value={prompt}
          placeholder="e.g. Post a clip of one rep you want eyes on — a serve, a rally, a drill."
          onChange={(e) => setPrompt(e.target.value)}
        />
      </Field>
      <Field label="Submission format" hint={fmt.sub}>
        <Seg
          wide
          value={formatLabel}
          options={FORMATS.map((f) => f.label)}
          onChange={setFormatLabel}
        />
      </Field>
      {!editing && (
        <Field label={`Link to a ${channel.noun}`}>
          <EpisodeSelect
            value={channelId}
            options={channel.options}
            noun={channel.noun}
            onChange={setChannelId}
          />
        </Field>
      )}
      <div className="form-foot">
        <span className="sp" />
        {onCancel && (
          <button className="btn btn-quiet btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!can}
          style={!can ? { opacity: 0.4 } : undefined}
          onClick={submit}
        >
          {busy
            ? editing
              ? 'Saving…'
              : 'Publishing…'
            : editing
              ? 'Save changes'
              : 'Publish activity'}
        </button>
      </div>
    </div>
  )
}

/* ---------- card ---------- */
function ActivityCard({
  act,
  onOpen,
}: {
  act: CommunityActivityRead
  onOpen: (a: CommunityActivityRead) => void
}) {
  return (
    <button className="ev-card" onClick={() => onOpen(act)}>
      <div
        className="ev-card-cover"
        style={{
          backgroundImage: act.cover_url ? `url(${act.cover_url})` : undefined,
          backgroundPosition: act.cover_object_position || 'center',
        }}
      >
        <span className="ev-card-type">
          {labelForType(act.submission_type)}
        </span>
        {act.channel_label && (
          <span className="act-ep-tag">{act.channel_label}</span>
        )}
      </div>
      <div className="ev-card-body">
        <div className="ev-card-title act-card-title">{act.title}</div>
        <div className="act-card-foot">
          <span className="act-subs">
            <b>{act.submission_count}</b>{' '}
            {act.submission_count === 1 ? 'submission' : 'submissions'}
          </span>
        </div>
      </div>
    </button>
  )
}

/* ---------- submission media ---------- */
function SubmissionMedia({ s }: { s: CommunityActivitySubmissionRead }) {
  if (s.submission_type === 'photo' && s.file_url) {
    return (
      <div className="crf-imgs n1">
        <img
          src={s.file_url}
          alt=""
          style={{ objectPosition: s.image_object_position || 'center' }}
        />
      </div>
    )
  }
  if (s.submission_type === 'video') {
    if (s.mux_status === 'ready' && s.mux_playback_id) {
      return (
        <div className="crf-media crf-video">
          <HlsVideo playbackId={s.mux_playback_id} />
        </div>
      )
    }
    return (
      <div className="crf-media crf-video crf-video-pending">
        <div className="crf-video-encoding">
          <Glyph d="video" size={22} stroke={1.7} /> Processing video…
        </div>
      </div>
    )
  }
  if (s.submission_type === 'link' && s.link_url) {
    return (
      <a
        className="sub-link"
        href={s.link_url}
        target="_blank"
        rel="noreferrer"
      >
        <Glyph d="link" size={16} stroke={1.9} /> {s.link_url}
      </a>
    )
  }
  return null
}

/* ---------- submission card (post-like + comments) ---------- */
function SubmissionCard({
  s,
  courseId,
  activityId,
  selfName,
  selfAvatar,
}: {
  s: CommunityActivitySubmissionRead
  courseId: string
  activityId: string
  selfName: string
  selfAvatar?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { mode, token } = useHub()
  const commentsQ = useSubmissionComments(
    token,
    courseId,
    activityId,
    open ? s.id : undefined,
    mode,
  )
  const post = usePostSubmissionComment(token, courseId, activityId, s.id, mode)
  const comments = commentsQ.data ?? []
  const submit = () => {
    const t = text.trim()
    if (!t) return
    post.mutate({ body: t })
    setText('')
  }
  return (
    <article className="crf-post">
      <header className="crf-head">
        <HubAvatar
          name={s.author_name}
          url={s.author_avatar_url}
          className="crf-av"
        />
        <div className="crf-id">
          <div className="crf-name">{s.author_name}</div>
          <div className="crf-meta">{timeAgo(s.created_at)}</div>
        </div>
      </header>
      {s.body && <div className="crf-text">{s.body}</div>}
      <SubmissionMedia s={s} />
      <div className="crf-bar">
        <button className="crf-act" onClick={() => setOpen((o) => !o)}>
          <Glyph d="comment" size={20} stroke={1.8} />
          <span>Comment</span>
        </button>
      </div>
      {open && (
        <div className="comments">
          {comments.map((c) => (
            <div className="cmt" key={c.id}>
              <HubAvatar
                name={c.author.name}
                url={c.author.avatar_url}
                className="cmt-av"
              />
              <div className="cmt-main">
                <div className="cmt-bubble">
                  <div className="cmt-name">
                    {c.author.name ||
                      (c.author.kind === 'instructor' ? 'Host' : 'Member')}
                    {c.author.kind === 'instructor' && (
                      <span className="role">Host</span>
                    )}
                  </div>
                  <div className="cmt-text">{c.body}</div>
                </div>
                <div className="cmt-actions">
                  <span className="t">{timeAgo(c.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
          <div className="cmt-compose">
            {selfAvatar ? (
              <img src={selfAvatar} alt="" />
            ) : (
              <span className="hub-av-fallback" />
            )}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder={`Reply as ${selfName.split(' ')[0]}…`}
            />
            <button
              className="cmt-send"
              disabled={!text.trim()}
              onClick={submit}
            >
              Post
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

/* ---------- member submission composer (student view) ----------
   Renders the input that matches the activity's declared submission_type and
   posts a real submission to the customer-portal endpoint. */
function SubmissionComposer({
  act,
  courseId,
  selfName,
  selfAvatar,
}: {
  act: CommunityActivityRead
  courseId: string
  selfName: string
  selfAvatar?: string | null
}) {
  const { token } = useHub()
  const submit = useSubmitToCommunityActivity(token, courseId)
  const uploadImg = useUploadPostImage(token, courseId, 'customer')
  const uploadVid = useUploadPostVideo(token, courseId, 'customer')

  const [text, setText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [image, setImage] = useState<{ file_id: string; url: string } | null>(
    null,
  )
  const [video, setVideo] = useState<{ upload_id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(act.has_own_submission)
  const imgInput = useRef<HTMLInputElement>(null)
  const vidInput = useRef<HTMLInputElement>(null)

  const type = act.submission_type
  const ready =
    !busy &&
    (type === 'text'
      ? text.trim().length > 0
      : type === 'link'
        ? linkUrl.trim().length > 0
        : type === 'photo'
          ? !!image
          : !!video)

  const pickImage = async (file: File) => {
    setBusy(true)
    try {
      const res = await uploadImg.mutateAsync(file)
      setImage({ file_id: res.file_id, url: res.public_url })
    } finally {
      setBusy(false)
    }
  }
  const pickVideo = async (file: File) => {
    setBusy(true)
    try {
      const res = await uploadVid.mutateAsync({ file })
      setVideo({ upload_id: res.upload_id })
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!ready) return
    setBusy(true)
    try {
      await submit.mutateAsync({
        activityId: act.id,
        body: {
          submission_type: type,
          body: text.trim() || null,
          file_id: type === 'photo' ? (image?.file_id ?? null) : null,
          mux_upload_id: type === 'video' ? (video?.upload_id ?? null) : null,
          link_url: type === 'link' ? linkUrl.trim() : null,
        },
      })
      setText('')
      setLinkUrl('')
      setImage(null)
      setVideo(null)
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="card sub-done">
        <Glyph d="seal" size={18} stroke={1.8} /> Your submission is in. Scroll
        down to see the room’s responses.
      </div>
    )
  }

  return (
    <div className="card sub-compose">
      <div className="sub-compose-head">
        {selfAvatar ? (
          <img src={selfAvatar} alt="" />
        ) : (
          <span className="hub-av-fallback" />
        )}
        <div className="sub-compose-who">{selfName}</div>
      </div>

      {(type === 'text' || type === 'photo' || type === 'video') && (
        <textarea
          className="sub-compose-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            type === 'text'
              ? 'Write your response…'
              : 'Add a caption (optional)…'
          }
          rows={type === 'text' ? 4 : 2}
        />
      )}

      {type === 'link' && (
        <input
          className="sub-compose-link"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Paste a link to your work…"
        />
      )}

      {type === 'photo' && (
        <>
          <input
            ref={imgInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickImage(f)
            }}
          />
          {image ? (
            <div className="sub-compose-prev">
              <img src={image.url} alt="" />
              <button onClick={() => setImage(null)} aria-label="Remove">
                <Glyph d="close" size={16} stroke={2.2} />
              </button>
            </div>
          ) : (
            <button
              className="btn btn-quiet sub-compose-attach"
              onClick={() => imgInput.current?.click()}
              disabled={busy}
            >
              <Glyph d="image" size={16} stroke={1.8} /> Add a photo
            </button>
          )}
        </>
      )}

      {type === 'video' && (
        <>
          <input
            ref={vidInput}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickVideo(f)
            }}
          />
          {video ? (
            <div className="sub-compose-vid">
              <Glyph d="video" size={16} stroke={1.8} /> Video ready to submit
              <button onClick={() => setVideo(null)} aria-label="Remove">
                <Glyph d="close" size={16} stroke={2.2} />
              </button>
            </div>
          ) : (
            <button
              className="btn btn-quiet sub-compose-attach"
              onClick={() => vidInput.current?.click()}
              disabled={busy}
            >
              <Glyph d="video" size={16} stroke={1.8} />{' '}
              {busy ? 'Uploading…' : 'Upload a clip'}
            </button>
          )}
        </>
      )}

      <div className="sub-compose-foot">
        <button
          className="btn btn-primary btn-sm"
          disabled={!ready}
          onClick={send}
        >
          {busy ? 'Working…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

/* ---------- activity page (submissions) ---------- */
function ActivityPage({
  act,
  courseId,
  selfName,
  selfAvatar,
  onBack,
  onEdit,
  onDeleted,
  showToast,
}: {
  act: CommunityActivityRead
  courseId: string
  selfName: string
  selfAvatar?: string | null
  onBack: () => void
  /** Host-only: open the edit form for this activity. */
  onEdit?: (a: CommunityActivityRead) => void
  /** Host-only: called after the activity is deleted. */
  onDeleted?: () => void
  showToast?: (m: string) => void
}) {
  const { viewer, mode, token } = useHub()
  const isHost = viewer === 'host'
  const subsQ = useCommunityActivitySubmissions(token, courseId, act.id, mode)
  const del = useDeleteCommunityActivity(token, courseId, mode)
  const [sort, setSort] = useState<SubmissionSort>('recent')
  const submissions = useMemo(
    () => sortSubmissions(subsQ.data ?? [], sort),
    [subsQ.data, sort],
  )

  const onDelete = async () => {
    if (
      !window.confirm(
        `Delete "${act.title || 'this activity'}"? Members' submissions will be removed too. This cannot be undone.`,
      )
    )
      return
    try {
      await del.mutateAsync(act.id)
      showToast?.('Activity deleted')
      onDeleted?.()
      onBack()
    } catch {
      showToast?.('Could not delete that activity')
    }
  }

  return (
    <div className="act-page">
      <button className="act-back" onClick={onBack}>
        <Glyph d="back" size={17} stroke={2.2} /> Activities
      </button>

      <div className="act-hero">
        <div
          className="act-hero-cover"
          style={{
            backgroundImage: act.cover_url
              ? `url(${act.cover_url})`
              : undefined,
            backgroundPosition: act.cover_object_position || 'center',
          }}
        />
        <div className="act-hero-body">
          <div className="act-hero-tags">
            <span className="act-fmt-tag">
              {labelForType(act.submission_type)}
            </span>
            {act.channel_label && (
              <span className="act-ep-chip">
                <Glyph d="doc" size={13} stroke={1.8} /> {act.channel_label}
              </span>
            )}
          </div>
          <h1 className="act-hero-title">{act.title}</h1>
          <div className="act-hero-meta">
            {submissions.length}{' '}
            {submissions.length === 1 ? 'submission' : 'submissions'}
          </div>
          {isHost && (onEdit || onDeleted) && (
            <div className="act-hero-host">
              {onEdit && (
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => onEdit(act)}
                >
                  Edit activity
                </button>
              )}
              <button
                className="ev-sheet-del"
                onClick={onDelete}
                disabled={del.isPending}
              >
                <Glyph d="trash" size={15} stroke={2} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="act-feed">
        {viewer === 'member' && (
          <SubmissionComposer
            act={act}
            courseId={courseId}
            selfName={selfName}
            selfAvatar={selfAvatar}
          />
        )}
        {submissions.length === 0 ? (
          <div className="card act-feed-empty">
            <span className="ev-empty-ic">
              <Glyph d="grid" size={24} stroke={1.7} />
            </span>
            <h3>
              {viewer === 'member'
                ? 'Be the first to respond'
                : 'No submissions yet'}
            </h3>
            <p>
              {viewer === 'member'
                ? 'Add your submission above — it appears here for the room to see and respond to.'
                : 'When members respond to this activity, their submissions collect here — reply on each one to give feedback.'}
            </p>
          </div>
        ) : (
          <>
            {submissions.length > 1 && (
              <div className="act-subs-toolbar">
                <SortSelect
                  value={sort}
                  options={SUBMISSION_SORTS}
                  onChange={setSort}
                />
              </div>
            )}
            <div className="crf-stack">
              {submissions.map((s) => (
                <SubmissionCard
                  key={s.id}
                  s={s}
                  courseId={courseId}
                  activityId={act.id}
                  selfName={selfName}
                  selfAvatar={selfAvatar}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- tab ---------- */
export function ActivitiesTab({
  courseId,
  channel,
  selfName,
  selfAvatar,
  showToast,
}: {
  courseId: string
  /** Host-only: where new activities attach. Omitted for the member view. */
  channel?: CourseChannel
  selfName: string
  selfAvatar?: string | null
  showToast: (m: string) => void
}) {
  const { viewer, mode, token } = useHub()
  const isHost = viewer === 'host'
  const actsQ = useCommunityActivities(token, courseId, mode)
  const activities = useMemo(() => actsQ.data ?? [], [actsQ.data])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CommunityActivityRead | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [sort, setSort] = useState<ActivitySort>('recent')

  const sorted = useMemo(
    () => sortActivities(activities, sort),
    [activities, sort],
  )

  const openAct = useMemo(
    () => activities.find((a) => a.id === openId) || null,
    [activities, openId],
  )

  const newActivity = () => {
    setEditing(null)
    setShowForm(true)
  }
  const startEdit = (act: CommunityActivityRead) => {
    setOpenId(null)
    setEditing(act)
    setShowForm(true)
  }
  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  if (openAct) {
    return (
      <ActivityPage
        act={openAct}
        courseId={courseId}
        selfName={selfName}
        selfAvatar={selfAvatar}
        onBack={() => setOpenId(null)}
        onEdit={isHost ? startEdit : undefined}
        onDeleted={isHost ? () => setOpenId(null) : undefined}
        showToast={showToast}
      />
    )
  }

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">
            Activities
            <HeadInfo>
              {isHost
                ? 'The thing you ask members to make and bring. Write one clear prompt — optionally tied to a lesson — then publish it. Members respond, and their submissions collect on the card.'
                : 'What the room is working on. Open one to see everyone’s submissions and add your own — a clip, a photo, or a note.'}
            </HeadInfo>
          </div>
        </div>
        {isHost && !showForm && activities.length > 0 && (
          <button
            className="ev-add-btn"
            onClick={newActivity}
            aria-label="New activity"
          >
            <Glyph d="plus" size={20} stroke={2.2} />
          </button>
        )}
      </div>

      {!showForm && activities.length > 1 && (
        <div className="act-toolbar">
          <SortSelect
            value={sort}
            options={ACTIVITY_SORTS}
            onChange={setSort}
          />
        </div>
      )}

      {isHost && showForm && channel ? (
        <ActivityForm
          courseId={courseId}
          channel={channel}
          editing={editing}
          onCancel={activities.length > 0 ? closeForm : null}
          onCreated={closeForm}
          showToast={showToast}
        />
      ) : actsQ.isError ? (
        <div className="card ev-empty">
          <span className="ev-empty-ic">
            <Glyph d="grid" size={26} stroke={1.7} />
          </span>
          <h3>Couldn&apos;t load activities</h3>
          <p>Something went wrong. Please refresh to try again.</p>
        </div>
      ) : activities.length === 0 ? (
        <div className="card ev-empty">
          <span className="ev-empty-ic">
            <Glyph d="grid" size={26} stroke={1.7} />
          </span>
          <h3>{isHost ? 'No activities yet' : 'Nothing to work on yet'}</h3>
          <p>
            {isHost
              ? 'Ask members to do something — post a rep, a win, a question. Link it to a lesson if you like. Publish, and submissions collect right here.'
              : 'When your host posts an activity, it shows up here for you to respond to.'}
          </p>
          {isHost && (
            <button className="btn btn-primary" onClick={newActivity}>
              Create an activity
            </button>
          )}
        </div>
      ) : (
        <div className="ev-grid">
          {sorted.map((a) => (
            <ActivityCard key={a.id} act={a} onOpen={(x) => setOpenId(x.id)} />
          ))}
        </div>
      )}
    </>
  )
}

'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Community Hub — Feed tab (creator).
 *
 * The running conversation. LinkedIn IA, Apple restraint: rich author block,
 * verified host seal, a single quiet Like + Comment, pin-to-top, and a per-post
 * ••• menu. Consumes the real CommunityPostRead / CommunityCommentRead shapes
 * and wires to the creator community endpoints.
 */
import { HlsVideo } from '@/components/Courses/HlsVideo'
import {
  type CommunityAuthor,
  type CommunityCommentRead,
  type CommunityEventRead,
  type CommunityPollRead,
  type CommunityPostCreateBody,
  type CommunityPostEventRef,
  type CommunityPostMediaRead,
  type CommunityPostRead,
  useCommunityEvents,
  useCommunityFeed,
  useCommunityPostComments,
  useCreateCommunityComment,
  useCreateCommunityPost,
  useCreatorCommunityFeed,
  useCreatorDeleteComment,
  useCreatorDeletePost,
  useDeleteCommunityComment,
  useDeleteCommunityPost,
  usePinPost,
  useToggleCommentReaction,
  useTogglePostReaction,
  useUnpinPost,
  useVotePostPoll,
} from '@/hooks/queries/community'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Composer } from './composer'
import { useHub } from './context'
import { EventSheet } from './Events'
import { timeAgo } from './format'
import { HeadInfo } from './HeadInfo'
import { HubAvatar } from './HubAvatar'
import { Glyph } from './icons'
import {
  fmtDateLabel,
  providerFromUrl,
  ProviderLogo,
  providerOf,
} from './pickers'

const TYPE_LABEL: Record<string, string> = {
  workshop: 'Workshop',
  office: 'Q&A',
  cohort: 'Watch Party',
  guest: 'Guest',
}

/* ---------- poll ---------- */
function PostPoll({
  courseId,
  post,
}: {
  courseId: string
  post: CommunityPostRead
}) {
  const poll = post.poll as CommunityPollRead
  const { mode, token } = useHub()
  const vote = useVotePostPoll(token, courseId, mode)
  const voted = poll.my_vote != null
  return (
    <div className="poll">
      {poll.options.map((o) => {
        const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0
        const mine = poll.my_vote === o.id
        return (
          <button
            key={o.id}
            className={`poll-opt ${voted ? 'voted' : ''} ${mine ? 'mine' : ''}`}
            disabled={voted || vote.isPending}
            onClick={() => vote.mutate({ postId: post.id, optionId: o.id })}
          >
            <span
              className="poll-fill"
              style={{ width: voted ? `${pct}%` : '0%' }}
            />
            <span className="poll-label">
              {o.text}
              {mine && (
                <span className="poll-check">
                  <Glyph d="check" size={13} stroke={2.6} />
                </span>
              )}
            </span>
            {voted && <span className="poll-pct">{pct}%</span>}
          </button>
        )
      })}
      <div className="poll-meta">
        {poll.total} {poll.total === 1 ? 'vote' : 'votes'}
        {!voted && ' · tap to vote'}
      </div>
    </div>
  )
}

/* ---------- embedded event card (opens the event detail sheet) ---------- */
function eventRefToRead(e: CommunityPostEventRef): CommunityEventRead {
  // The post's embedded event ref carries scheduling info but not live RSVP
  // state (rsvp_count / going / host). live/past are derived from the event's
  // own timing here (accurate); the full record — with real RSVP state — is
  // fetched when the sheet opens (see PostEvent). This fallback is only shown
  // briefly while that fetch is in flight.
  const start = new Date(e.start_at).getTime()
  const end = start + (e.duration_minutes ?? 0) * 60_000
  const now = Date.now()
  return {
    id: e.id,
    course_id: '',
    title: e.title,
    type: e.type,
    description: null,
    start_at: e.start_at,
    timezone: e.timezone,
    duration_minutes: e.duration_minutes,
    meeting_url: e.meeting_url,
    location: null,
    cover_url: e.cover_url,
    cover_object_position: e.cover_object_position,
    notify_on_publish: false,
    rsvp_count: 0,
    host: { user_id: '', name: '', avatar_url: null },
    going: false,
    live: Number.isFinite(start) && now >= start && now < end,
    past: Number.isFinite(end) && now >= end,
    created_at: e.start_at,
    modified_at: null,
  }
}

function PostEvent({
  event,
  courseId,
  showToast,
}: {
  event: CommunityPostEventRef
  courseId: string
  showToast: (m: string) => void
}) {
  const [sheet, setSheet] = useState(false)
  const { mode, token } = useHub()
  const provider = providerFromUrl(event.meeting_url)
  const when = new Date(event.start_at)
  // The post embed (`CommunityPostEventRef`) is a thin reference — it has no
  // RSVP count, host, or live/past state. Resolve the full event from the
  // events list (only while the sheet is open) so the detail sheet shows real
  // data and a working RSVP instead of the fabricated zeros in eventRefToRead.
  const eventsQ = useCommunityEvents(token, sheet ? courseId : undefined, mode)
  const full = eventsQ.data?.find((e) => e.id === event.id) ?? null
  return (
    <>
      <div
        className="ev-attach tap"
        onClick={() => setSheet(true)}
        role="button"
      >
        <div
          className="ev-attach-cover"
          style={{
            backgroundImage: event.cover_url
              ? `url(${event.cover_url})`
              : undefined,
            backgroundPosition: event.cover_object_position || 'center',
          }}
        >
          <span className="ev-attach-prov">
            <ProviderLogo k={provider} size={22} />
          </span>
        </div>
        <div className="ev-attach-body">
          <div className="ev-attach-type">
            {TYPE_LABEL[event.type] ?? event.type}
          </div>
          <div className="ev-attach-title">{event.title}</div>
          <div className="ev-attach-when">
            <Glyph d="calendar" size={13} stroke={1.9} />{' '}
            {fmtDateLabel(event.start_at.slice(0, 10))} ·{' '}
            {when.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: event.timezone || undefined,
            })}
            {event.meeting_url
              ? ` · Join with ${providerOf(provider).name}`
              : ''}
          </div>
        </div>
      </div>
      {sheet && (
        <EventSheet
          ev={full ?? eventRefToRead(event)}
          courseId={courseId}
          onClose={() => setSheet(false)}
          showToast={showToast}
        />
      )}
    </>
  )
}

const { useCallback, useEffect, useMemo, useState } = React

const TRUNC = 280

function authorName(a: CommunityAuthor): string {
  return a.name || (a.kind === 'instructor' ? 'Host' : 'Member')
}
function headlineFor(a: CommunityAuthor): string {
  return a.kind === 'instructor' ? 'Host' : 'Member'
}
function reactionCount(reactions: { count: number }[]): number {
  return reactions.reduce((n, r) => n + r.count, 0)
}
function iLiked(reactions: { mine: boolean }[]): boolean {
  return reactions.some((r) => r.mine)
}

type CommentNode = CommunityCommentRead & { replies: CommunityCommentRead[] }
function buildTree(comments: CommunityCommentRead[]): CommentNode[] {
  const tops = comments.filter((c) => !c.parent_id)
  const byParent = new Map<string, CommunityCommentRead[]>()
  for (const c of comments) {
    if (c.parent_id) {
      const arr = byParent.get(c.parent_id) ?? []
      arr.push(c)
      byParent.set(c.parent_id, arr)
    }
  }
  return tops.map((t) => ({ ...t, replies: byParent.get(t.id) ?? [] }))
}

/* ---------- media ----------
   Images render as the design's LinkedIn-style gallery (1–4 cells, +N overflow);
   each cell opens the split-pane lightbox via onOpenImage(index). */
function PostMedia({
  media,
  onOpenImage,
}: {
  media: CommunityPostMediaRead[]
  onOpenImage: (index: number) => void
}) {
  if (media.length === 0) return null
  const videos = media.filter((m) => m.media_type === 'video')
  const images = media.filter((m) => m.media_type === 'image')
  const gifs = media.filter((m) => m.media_type === 'gif')
  const n = images.length
  const layout = n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : 'four'
  return (
    <>
      {gifs.map((g) =>
        g.external_url ? (
          <div key={g.id} className="crf-media crf-gif">
            <img src={g.external_url} alt="GIF" />
            <span className="gif-badge">GIF</span>
          </div>
        ) : null,
      )}
      {videos.map((v) =>
        v.mux_status === 'ready' && (v.playback_url || v.mux_playback_id) ? (
          <div key={v.id} className="crf-media crf-video">
            <HlsVideo
              playbackId={v.mux_playback_id}
              playbackUrl={v.playback_url}
              poster={v.thumbnail_url}
            />
          </div>
        ) : (
          <div key={v.id} className="crf-media crf-video crf-video-pending">
            <div className="crf-video-encoding">
              <Glyph d="video" size={22} stroke={1.7} /> Processing video…
            </div>
          </div>
        ),
      )}
      {n > 0 && (
        <div className={`crf-gallery g-${layout}`}>
          {images.slice(0, 4).map((m, k) => (
            <button
              key={m.id}
              className="crf-gcell"
              onClick={() => onOpenImage(k)}
              style={{ backgroundImage: `url(${m.public_url ?? ''})` }}
              aria-label={`Photo ${k + 1}`}
            >
              {k === 3 && n > 4 && <span className="crf-gmore">+{n - 4}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- split-pane photo viewer (the redesigned picture view) ----------
   Image left (with prev/next + count), the post + its comments on the right.
   Rendered in a portal so the feed card's backdrop-filter can't bury it. */
function PostLightbox({
  post,
  images,
  start,
  onClose,
  courseId,
  selfName,
  selfAvatar,
}: {
  post: CommunityPostRead
  images: string[]
  start: number
  onClose: () => void
  courseId: string
  selfName: string
  selfAvatar?: string | null
}) {
  const [i, setI] = useState(start)
  const { mode, token } = useHub()
  const reactPost = useTogglePostReaction(token, courseId, mode)
  const n = images.length
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const a = post.author
  const isHost = a.kind === 'instructor'
  const liked = iLiked(post.reactions)
  const likes = post.reaction_count
  const comments = post.comment_count
  const dark =
    typeof document !== 'undefined' &&
    !!document.querySelector('.spaire-hub')?.classList.contains('dark')

  return createPortal(
    <div className={`spaire-hub ${dark ? 'dark' : ''}`}>
      <div className="crf-lb" onClick={onClose}>
        <button className="crf-lb-x" onClick={onClose} aria-label="Close">
          <Glyph d="close" size={22} stroke={2.2} />
        </button>
        <div className="crf-lb-shell" onClick={(e) => e.stopPropagation()}>
          <div className="crf-lb-img">
            <img src={images[i]} alt="" />
            {n > 1 && (
              <button
                className="crf-lb-nav prev"
                onClick={() => go(-1)}
                aria-label="Previous"
              >
                <Glyph d="back" size={26} stroke={2.4} />
              </button>
            )}
            {n > 1 && (
              <button
                className="crf-lb-nav next"
                onClick={() => go(1)}
                aria-label="Next"
              >
                <Glyph d="chevR" size={26} stroke={2.4} />
              </button>
            )}
            {n > 1 && (
              <div className="crf-lb-count">
                {i + 1} / {n}
              </div>
            )}
          </div>
          <div className="crf-lb-side">
            <header className="crf-head">
              {a.avatar_url ? (
                <img
                  className={`crf-av ${isHost ? 'host' : ''}`}
                  src={a.avatar_url}
                  alt={authorName(a)}
                />
              ) : (
                <HubAvatar
                  name={authorName(a)}
                  className={`crf-av ${isHost ? 'host' : ''}`}
                />
              )}
              <div className="crf-id">
                <div className="crf-name">
                  {authorName(a)}
                  {isHost && (
                    <span className="crf-seal" title="Verified host">
                      <Glyph d="seal" size={14} stroke={1.7} />
                    </span>
                  )}
                </div>
                <div className="crf-headline">{headlineFor(a)}</div>
                <div className="crf-meta">
                  {timeAgo(post.created_at)}
                  <span className="dot">·</span>
                  <Glyph d="globe" size={12} stroke={1.7} />
                </div>
              </div>
            </header>

            {post.body.trim() && (
              <div className="crf-text crf-lb-text">{post.body}</div>
            )}

            {(likes > 0 || comments > 0) && (
              <div className="crf-proof">
                <span className="crf-proof-l">
                  {likes > 0 && (
                    <>
                      <span className="crf-rxdot">
                        <Glyph d="heartFeed" size={11} fill="currentColor" />
                      </span>
                      <span className="crf-proof-t">
                        {likes.toLocaleString()}
                      </span>
                    </>
                  )}
                </span>
                {comments > 0 && (
                  <span className="crf-proof-r">
                    {comments} {comments === 1 ? 'comment' : 'comments'}
                  </span>
                )}
              </div>
            )}

            <div className="crf-bar">
              <button
                className={`crf-act ${liked ? 'on' : ''}`}
                onClick={() =>
                  reactPost.mutate({ postId: post.id, emoji: 'heart' })
                }
              >
                <Glyph
                  d="heartFeed"
                  size={20}
                  stroke={liked ? 1.9 : 1.8}
                  fill={liked ? 'currentColor' : 'none'}
                />
                <span>{liked ? 'Liked' : 'Like'}</span>
              </button>
            </div>

            <Comments
              courseId={courseId}
              postId={post.id}
              selfName={selfName}
              selfAvatar={selfAvatar}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------- comment ---------- */
function HubComment({
  c,
  depth,
  courseId,
  postId,
  selfAvatar,
  onReply,
}: {
  c: CommentNode | CommunityCommentRead
  depth: number
  courseId: string
  postId: string
  selfAvatar?: string | null
  onReply: (parentId: string, text: string) => void
}) {
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const { mode, token } = useHub()
  const react = useToggleCommentReaction(token, courseId, postId, mode)
  const delCreator = useCreatorDeleteComment(courseId)
  const delCustomer = useDeleteCommunityComment(token, courseId, postId, mode)
  const del = mode === 'creator' ? delCreator : delCustomer
  const a = c.author
  const replies = 'replies' in c ? c.replies : []
  const likes = reactionCount(c.reactions)
  const liked = iLiked(c.reactions)
  const submit = () => {
    const t = text.trim()
    if (!t) return
    onReply(c.id, t)
    setText('')
    setReplying(false)
  }
  if (c.deleted) {
    return (
      <div className="cmt">
        <span className="cmt-av tomb" />
        <div className="cmt-main">
          <div className="cmt-bubble tomb">
            <div className="cmt-text dim">This comment was removed.</div>
          </div>
          {replies.length > 0 && (
            <div className="cmt-thread">
              {replies.map((r) => (
                <HubComment
                  key={r.id}
                  c={r}
                  depth={depth + 1}
                  courseId={courseId}
                  postId={postId}
                  selfAvatar={selfAvatar}
                  onReply={onReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="cmt">
      {a.avatar_url ? (
        <img
          className={`cmt-av ${depth ? 'sm' : ''}`}
          src={a.avatar_url}
          alt={authorName(a)}
        />
      ) : (
        <HubAvatar
          name={authorName(a)}
          className={`cmt-av ${depth ? 'sm' : ''}`}
        />
      )}
      <div className="cmt-main">
        <div className="cmt-bubble">
          <div className="cmt-name">
            {authorName(a)}
            {a.kind === 'instructor' && <span className="role">Host</span>}
          </div>
          <div className="cmt-text">{c.content}</div>
        </div>
        <div className="cmt-actions">
          <span className="t">{timeAgo(c.created_at)}</span>
          <button
            className={liked ? 'on' : ''}
            onClick={() => react.mutate({ commentId: c.id, emoji: 'heart' })}
          >
            {liked ? 'Liked' : 'Like'}
            {likes > 0 ? ` · ${likes}` : ''}
          </button>
          {depth === 0 && (
            <button onClick={() => setReplying((r) => !r)}>Reply</button>
          )}
          {c.is_own && <button onClick={() => del.mutate(c.id)}>Delete</button>}
        </div>
        {replying && (
          <div className="cmt-compose" style={{ marginTop: 10 }}>
            {selfAvatar ? (
              <img src={selfAvatar} alt="" />
            ) : (
              <span className="hub-av-fallback" />
            )}
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder={`Reply to ${authorName(a).split(' ')[0]}…`}
            />
            <button
              className="cmt-send"
              disabled={!text.trim()}
              onClick={submit}
            >
              Reply
            </button>
          </div>
        )}
        {replies.length > 0 && (
          <div className="cmt-thread">
            {replies.map((r) => (
              <HubComment
                key={r.id}
                c={r}
                depth={depth + 1}
                courseId={courseId}
                postId={postId}
                selfAvatar={selfAvatar}
                onReply={onReply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- comments section (lazy: only mounts when opened) ---------- */
function Comments({
  courseId,
  postId,
  selfName,
  selfAvatar,
}: {
  courseId: string
  postId: string
  selfName: string
  selfAvatar?: string | null
}) {
  const { mode, token } = useHub()
  const commentsQ = useCommunityPostComments(token, courseId, postId, mode)
  const create = useCreateCommunityComment(token, courseId, postId, mode)
  const [text, setText] = useState('')
  const tree = useMemo(() => buildTree(commentsQ.data ?? []), [commentsQ.data])

  const reply = (parentId: string, content: string) =>
    create.mutate({ content, parent_id: parentId })
  const submit = () => {
    const t = text.trim()
    if (!t) return
    create.mutate({ content: t })
    setText('')
  }

  return (
    <div className="comments">
      {tree.map((c) => (
        <HubComment
          key={c.id}
          c={c}
          depth={0}
          courseId={courseId}
          postId={postId}
          selfAvatar={selfAvatar}
          onReply={reply}
        />
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
        <button className="cmt-send" disabled={!text.trim()} onClick={submit}>
          Post
        </button>
      </div>
    </div>
  )
}

/* ---------- post ---------- */
export function HubPost({
  post,
  courseId,
  selfName,
  selfAvatar,
  showToast,
}: {
  post: CommunityPostRead
  courseId: string
  selfName: string
  selfAvatar?: string | null
  showToast?: (m: string) => void
}) {
  const [open, setOpen] = useState(!!post.pinned_at)
  const [expanded, setExpanded] = useState(false)
  const [menu, setMenu] = useState(false)
  const [lightbox, setLightbox] = useState(-1)

  const imageUrls = useMemo(
    () =>
      post.media
        .filter((m) => m.media_type === 'image' && m.public_url)
        .map((m) => m.public_url as string),
    [post.media],
  )

  const { mode, token, viewer, selfEnrollmentId } = useHub()
  const reactPost = useTogglePostReaction(token, courseId, mode)
  const pin = usePinPost(courseId)
  const unpin = useUnpinPost(courseId)
  const delCreator = useCreatorDeletePost(courseId)
  const delCustomer = useDeleteCommunityPost(token, courseId, mode)
  const del = mode === 'creator' ? delCreator : delCustomer

  const a = post.author
  const isHost = a.kind === 'instructor'
  // Host moderates everything; a member may remove only their OWN post.
  const ownPost =
    a.kind === 'student' &&
    !!selfEnrollmentId &&
    a.enrollment_id === selfEnrollmentId
  const canPin = viewer === 'host'
  const canRemove = viewer === 'host' || ownPost
  const pinned = !!post.pinned_at
  const liked = iLiked(post.reactions)
  const likes = post.reaction_count
  const comments = post.comment_count

  const long = post.body.length > TRUNC
  // Cut on the last word boundary before TRUNC; fall back to a hard cut when
  // there's no space (a long URL / CJK text) so we don't collapse the whole
  // post to a single "…".
  const cut = post.body.lastIndexOf(' ', TRUNC)
  const shown =
    long && !expanded
      ? post.body.slice(0, cut > 0 ? cut : TRUNC) + '…'
      : post.body

  const togglePin = () =>
    pinned
      ? unpin.mutate(post.id)
      : pin.mutate({ postId: post.id, pinType: 'announcement' })

  const copyLink = () => {
    const base =
      typeof window !== 'undefined' ? window.location.href.split('#')[0] : ''
    navigator.clipboard?.writeText(`${base}#post-${post.id}`)
  }

  return (
    <article className="crf-post" id={`post-${post.id}`}>
      {pinned && (
        <div className="crf-pin">
          <Glyph d="pin" size={13} stroke={1.9} /> Pinned to the top of the feed
        </div>
      )}

      <header className="crf-head">
        {a.avatar_url ? (
          <img
            className={`crf-av ${isHost ? 'host' : ''}`}
            src={a.avatar_url}
            alt={authorName(a)}
          />
        ) : (
          <HubAvatar
            name={authorName(a)}
            className={`crf-av ${isHost ? 'host' : ''}`}
          />
        )}
        <div className="crf-id">
          <div className="crf-name">
            {authorName(a)}
            {isHost && (
              <span className="crf-seal" title="Verified host">
                <Glyph d="seal" size={14} stroke={1.7} />
              </span>
            )}
          </div>
          <div className="crf-headline">{headlineFor(a)}</div>
          <div className="crf-meta">
            {timeAgo(post.created_at)}
            <span className="dot">·</span>
            <Glyph d="globe" size={12} stroke={1.7} />
          </div>
        </div>
        {canPin && (
          <button
            className={`crf-pinbtn ${pinned ? 'on' : ''}`}
            onClick={togglePin}
            aria-label={pinned ? 'Unpin from feed' : 'Pin to top'}
            title={pinned ? 'Unpin from feed' : 'Pin to top'}
          >
            <Glyph
              d="pin"
              size={18}
              stroke={1.9}
              fill={pinned ? 'currentColor' : 'none'}
            />
          </button>
        )}
        <div className="crf-menu-wrap">
          <button
            className="crf-more"
            aria-label="Post options"
            onClick={() => setMenu((m) => !m)}
          >
            <Glyph d="more" size={18} stroke={2.4} />
          </button>
          {menu && (
            <>
              <div className="crf-menu-scrim" onClick={() => setMenu(false)} />
              <div className="crf-menu">
                {canPin && (
                  <button
                    onClick={() => {
                      togglePin()
                      setMenu(false)
                    }}
                  >
                    <Glyph d="pin" size={16} stroke={1.8} />{' '}
                    {pinned ? 'Unpin from feed' : 'Pin to top'}
                  </button>
                )}
                <button
                  onClick={() => {
                    copyLink()
                    setMenu(false)
                  }}
                >
                  <Glyph d="share" size={16} stroke={1.8} /> Copy link
                </button>
                {canRemove && (
                  <button
                    className="danger"
                    onClick={() => {
                      del.mutate(post.id)
                      setMenu(false)
                    }}
                  >
                    <Glyph d="trash" size={16} stroke={1.8} /> Remove post
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {post.body.trim() && (
        <div className="crf-text">
          {shown}
          {long && !expanded && (
            <button className="crf-morelink" onClick={() => setExpanded(true)}>
              more
            </button>
          )}
        </div>
      )}

      <PostMedia media={post.media} onOpenImage={setLightbox} />
      {post.poll && <PostPoll courseId={courseId} post={post} />}
      {post.event && (
        <PostEvent
          event={post.event}
          courseId={courseId}
          showToast={showToast ?? (() => {})}
        />
      )}

      {lightbox >= 0 && imageUrls.length > 0 && (
        <PostLightbox
          post={post}
          images={imageUrls}
          start={lightbox}
          onClose={() => setLightbox(-1)}
          courseId={courseId}
          selfName={selfName}
          selfAvatar={selfAvatar}
        />
      )}

      {(likes > 0 || comments > 0) && (
        <div className="crf-proof">
          <span className="crf-proof-l">
            {likes > 0 && (
              <>
                <span className="crf-rxdot">
                  <Glyph d="heartFeed" size={11} fill="currentColor" />
                </span>
                <span className="crf-proof-t">{likes.toLocaleString()}</span>
              </>
            )}
          </span>
          {comments > 0 && (
            <button className="crf-proof-r" onClick={() => setOpen((o) => !o)}>
              {comments} {comments === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      )}

      <div className="crf-bar">
        <button
          className={`crf-act ${liked ? 'on' : ''}`}
          onClick={() => reactPost.mutate({ postId: post.id, emoji: 'heart' })}
        >
          <Glyph
            d="heartFeed"
            size={20}
            stroke={liked ? 1.9 : 1.8}
            fill={liked ? 'currentColor' : 'none'}
          />
          <span>{liked ? 'Liked' : 'Like'}</span>
        </button>
        <button className="crf-act" onClick={() => setOpen((o) => !o)}>
          <Glyph d="comment" size={20} stroke={1.8} />
          <span>Comment</span>
        </button>
      </div>

      {open && (
        <Comments
          courseId={courseId}
          postId={post.id}
          selfName={selfName}
          selfAvatar={selfAvatar}
        />
      )}
    </article>
  )
}

/* ---------- tab ---------- */

// Flatten + de-dupe the paginated feed (creator and customer pages share the
// same `{ items }` page shape).
function flattenFeed(
  pages: { items: CommunityPostRead[] }[] | undefined,
): CommunityPostRead[] {
  const seen = new Set<string>()
  const out: CommunityPostRead[] = []
  for (const page of pages ?? []) {
    for (const p of page.items) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
  }
  return out
}

// Shared feed body: composer + post list + states. The viewer context
// (creator/host vs customer/member) is supplied by <HubProvider>, so the same
// body serves both consoles — the only difference is which feed query feeds it.
function FeedBody({
  courseId,
  posts,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onCreate,
  selfName,
  selfAvatar,
  placeholder,
  empty,
  showToast,
}: {
  courseId: string
  posts: CommunityPostRead[]
  isLoading: boolean
  isError?: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  onCreate: (body: CommunityPostCreateBody) => Promise<unknown>
  selfName: string
  selfAvatar?: string | null
  placeholder: string
  empty: { title: string; body: string }
  showToast: (m: string) => void
}) {
  const { mode, token } = useHub()
  return (
    <>
      <Composer
        courseId={courseId}
        mode={mode}
        token={token}
        avatar={selfAvatar}
        authorName={selfName}
        placeholder={placeholder}
        onCreate={onCreate}
        showToast={showToast}
      />

      {isLoading ? (
        <div className="crf-stack">
          {[0, 1].map((i) => (
            <div key={i} className="card" style={{ height: 200 }} />
          ))}
        </div>
      ) : isError ? (
        <div className="card crf-empty">
          <span className="crf-empty-ic">
            <Glyph d="bubble" size={26} stroke={1.7} />
          </span>
          <h3>Couldn&apos;t load the feed</h3>
          <p>
            Something went wrong loading this conversation. Please refresh to
            try again.
          </p>
        </div>
      ) : posts.length === 0 ? (
        <div className="card crf-empty">
          <span className="crf-empty-ic">
            <Glyph d="bubble" size={26} stroke={1.7} />
          </span>
          <h3>{empty.title}</h3>
          <p>{empty.body}</p>
        </div>
      ) : (
        <>
          <div className="crf-stack">
            {posts.map((p) => (
              <HubPost
                key={p.id}
                post={p}
                courseId={courseId}
                selfName={selfName}
                selfAvatar={selfAvatar}
                showToast={showToast}
              />
            ))}
          </div>
          {hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                className="btn btn-quiet"
                disabled={isFetchingNextPage}
                onClick={fetchNextPage}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

export function FeedTab({
  courseId,
  selfName,
  selfAvatar,
  showToast,
}: {
  courseId: string
  selfName: string
  selfAvatar?: string | null
  showToast: (m: string) => void
}) {
  const feedQ = useCreatorCommunityFeed(courseId, {
    sort: 'recent',
    module_id: null,
    lesson_id: null,
    tag_id: null,
  })
  const create = useCreateCommunityPost(null, courseId, 'creator')
  const posts = useMemo(() => flattenFeed(feedQ.data?.pages), [feedQ.data])

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">
            Feed
            <HeadInfo>
              The running conversation at the heart of your community. Post
              announcements and prompts as the host, pin what matters, and reply
              right in the thread — exactly as your members will see it.
            </HeadInfo>
          </div>
        </div>
      </div>

      <FeedBody
        courseId={courseId}
        posts={posts}
        isLoading={feedQ.isLoading}
        isError={feedQ.isError}
        hasNextPage={!!feedQ.hasNextPage}
        isFetchingNextPage={feedQ.isFetchingNextPage}
        fetchNextPage={() => feedQ.fetchNextPage()}
        onCreate={(body) => create.mutateAsync(body)}
        selfName={selfName}
        selfAvatar={selfAvatar}
        placeholder="Share an update with your community…"
        empty={{
          title: 'Your feed is quiet — for now',
          body: 'Post a welcome so members arrive to a room that already feels alive. Introduce yourself, set the tone, and tell them what to do first.',
        }}
        showToast={showToast}
      />
    </>
  )
}

// Student (member) feed — same body, customer feed query + create.
export function StudentFeedTab({
  courseId,
  token,
  selfName,
  selfAvatar,
  showToast,
}: {
  courseId: string
  token: string
  selfName: string
  selfAvatar?: string | null
  showToast: (m: string) => void
}) {
  const feedQ = useCommunityFeed(token, courseId, {
    sort: 'recent',
    module_id: null,
    lesson_id: null,
    tag_id: null,
  })
  const create = useCreateCommunityPost(token, courseId, 'customer')
  const posts = useMemo(() => flattenFeed(feedQ.data?.pages), [feedQ.data])

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">
            Feed
            <HeadInfo>
              The running conversation of the room. Share your reps and wins,
              ask the question you think is too basic, and reply right in the
              thread.
            </HeadInfo>
          </div>
        </div>
      </div>

      <FeedBody
        courseId={courseId}
        posts={posts}
        isLoading={feedQ.isLoading}
        isError={feedQ.isError}
        hasNextPage={!!feedQ.hasNextPage}
        isFetchingNextPage={feedQ.isFetchingNextPage}
        fetchNextPage={() => feedQ.fetchNextPage()}
        onCreate={(body) => create.mutateAsync(body)}
        selfName={selfName}
        selfAvatar={selfAvatar}
        placeholder="Share a win, a question, or what you're working on…"
        empty={{
          title: 'No posts yet',
          body: 'Be the first to say hello. Share a win, ask a question, or tell the room what you’re working on.',
        }}
        showToast={showToast}
      />
    </>
  )
}

'use client'

// OverviewSheet + CommentsPanel — ported 1:1 from the Spaire Originals v2
// design (originals2-parts.jsx). Data-tolerant: sections render only when
// the lesson actually carries them (overview note, takeaways, resources),
// so the sheet works today with just a description and lights up as the
// lesson editor starts producing the richer fields.

import { useEffect, useRef, useState } from 'react'
import { Glyph, SF } from './WatchGlyphs'
import { WatchStyles } from './WatchStyles'

function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onClose])
}

export type WatchResource = {
  name: string
  /** "pdf" | "audio" | "video" | "link" — anything else falls back to pdf. */
  type?: string
  meta?: string
  url?: string
}

export type WatchOverview = {
  /** "Your note to students" paragraphs. */
  body: string[]
  /** "In this lesson" takeaways. */
  learn: string[]
  resources: WatchResource[]
}

const RES_ICON: Record<string, keyof typeof SF> = {
  pdf: 'pdf',
  audio: 'audio',
  video: 'videoclip',
  link: 'link',
}

export function OverviewSheet({
  brand = '',
  lessonN,
  numLabel,
  title,
  durLabel,
  instructorName,
  imageUrl,
  locked,
  unlockLabel,
  overview,
  dark,
  onClose,
  onPlay,
}: {
  brand?: string
  lessonN: number
  /** Replaces "Lesson N" (e.g. "Bonus" for bonus-section lessons). */
  numLabel?: string
  title: string
  durLabel?: string | null
  instructorName?: string | null
  imageUrl?: string | null
  locked?: boolean
  unlockLabel?: string
  overview: WatchOverview
  dark?: boolean
  onClose: () => void
  onPlay: () => void
}) {
  useEsc(onClose)
  const sub = [durLabel, instructorName].filter(Boolean).join(' · ')
  return (
    <div
      className={`sov2 sheet-overlay ${dark ? 'dark' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Lesson overview"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="x-sheet wide">
        <div className="xs-cover">
          <div
            className="xs-img"
            style={
              imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined
            }
          />
          <div className="xs-shade" />
          <div className="xs-eyebrow">
            <span className="dot" />
            <span>
              {brand ? `${brand} · ` : ''}
              {numLabel ?? `Lesson ${lessonN}`}
              {locked ? ' · Locked' : ''}
            </span>
          </div>
          <div className="xs-title">
            {title}
            {sub && <div className="xs-titlesub">{sub}</div>}
          </div>
          <button className="xs-close" onClick={onClose} aria-label="Close">
            <Glyph d={SF.close} size={13} stroke={2.4} />
          </button>
        </div>
        <div className="xs-body">
          <div className="ov-chips">
            <button className="cta-main" onClick={onPlay}>
              {locked ? (
                <>
                  <Glyph d={SF.lock} size={17} stroke={2.1} />{' '}
                  {unlockLabel ?? 'Unlock'}
                </>
              ) : (
                <>
                  <Glyph d={SF.play} size={17} fill="currentColor" /> Play
                  lesson
                </>
              )}
            </button>
          </div>

          {overview.body.length > 0 && (
            <>
              <div className="ov-h">Lesson overview</div>
              {overview.body.map((p, i) => (
                <p className="ov-p" key={i}>
                  {p}
                </p>
              ))}
            </>
          )}

          {overview.learn.length > 0 && (
            <>
              <div className="ov-h">In this lesson</div>
              <ul className="ov-learn">
                {overview.learn.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </>
          )}

          {overview.resources.length > 0 && (
            <>
              <div className="ov-h">Resources</div>
              <div className="ov-res">
                {overview.resources.map((r, i) => {
                  const icon = SF[RES_ICON[r.type ?? 'pdf'] ?? 'pdf']
                  const inner = (
                    <>
                      <span className="ov-res-ico">
                        <Glyph d={icon} size={21} stroke={1.9} />
                      </span>
                      <span className="ov-res-main">
                        <span className="rn">{r.name}</span>
                        {r.meta && <span className="rm">{r.meta}</span>}
                      </span>
                      <span className="ov-res-dl">
                        <Glyph
                          d={r.type === 'link' ? SF.link : SF.download}
                          size={19}
                          stroke={2}
                        />
                      </span>
                    </>
                  )
                  return r.url ? (
                    <a
                      className="ov-res-row"
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      download={r.type !== 'link' ? '' : undefined}
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="ov-res-row" key={i}>
                      {inner}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <WatchStyles />
    </div>
  )
}

/* ───────────────────────── discussion panel ───────────────────────── */

export type WatchComment = {
  id: string
  name: string
  avatarUrl?: string | null
  time: string
  text: string
  likes?: number
  liked?: boolean
  // Viewer-relative + moderation state (YouTube-style discussion).
  isOwn?: boolean
  isInstructor?: boolean
  pinned?: boolean
  instructorHearted?: boolean
  replies?: WatchComment[]
}

function CommentRow({
  c,
  isReply,
  canModerate,
  instructorName,
  onLike,
  onReply,
  onDelete,
  onPin,
  onHeart,
}: {
  c: WatchComment
  isReply?: boolean
  canModerate?: boolean
  instructorName?: string | null
  onLike?: (id: string) => void
  onReply?: (c: WatchComment) => void
  onDelete?: (id: string) => void
  onPin?: (id: string) => void
  onHeart?: (id: string) => void
}) {
  return (
    <div className={`cmt ${isReply ? 'is-reply' : ''}`}>
      {c.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cmt-av" src={c.avatarUrl} alt={c.name} />
      ) : (
        <div className="cmt-av" />
      )}
      <div className="cmt-main">
        {c.pinned && (
          <div className="cmt-pinned">
            <Glyph d={SF.pin} size={11} stroke={2} />
            Pinned{instructorName ? ` by ${instructorName}` : ''}
          </div>
        )}
        <div className="cmt-top">
          <span className={`cmt-name ${c.isInstructor ? 'is-instructor' : ''}`}>
            {c.name}
          </span>
          {c.isInstructor && <span className="cmt-badge">Instructor</span>}
          <span className="cmt-dot" />
          <span className="cmt-time">{c.time}</span>
        </div>
        <div className="cmt-text">{c.text}</div>
        <div className="cmt-actions">
          {/* The instructor's one like-action is the creator heart below —
              showing them the student like button too reads as two
              competing like buttons. They still see the like count. */}
          {onLike && !canModerate && (
            <button
              className={`cmt-like ${c.liked ? 'on' : ''}`}
              onClick={() => onLike(c.id)}
            >
              <Glyph
                d={SF.heart}
                size={15}
                fill={c.liked ? 'currentColor' : 'none'}
                stroke={c.liked ? 0 : 1.9}
              />
              {(c.likes ?? 0) > 0 && <span>{c.likes}</span>}
            </button>
          )}
          {canModerate && (c.likes ?? 0) > 0 && (
            <span className="cmt-like" title="Student likes">
              <Glyph d={SF.heart} size={15} fill="none" stroke={1.9} />
              <span>{c.likes}</span>
            </span>
          )}
          {/* The single creator heart, YouTube-style: shown to everyone
              once given; the instructor can toggle it. */}
          {(c.instructorHearted || (canModerate && onHeart)) && (
            <button
              className={`cmt-cheart ${c.instructorHearted ? 'on' : ''}`}
              onClick={canModerate && onHeart ? () => onHeart(c.id) : undefined}
              disabled={!canModerate || !onHeart}
              title={
                c.instructorHearted
                  ? `Loved by ${instructorName ?? 'the instructor'}`
                  : 'Heart as instructor'
              }
            >
              <span className="cmt-cheart-ico">
                <Glyph
                  d={SF.heart}
                  size={11}
                  fill={c.instructorHearted ? '#e0482e' : 'none'}
                  stroke={c.instructorHearted ? 0 : 2}
                />
              </span>
              {c.instructorHearted && (
                <span className="cmt-cheart-by">
                  by {instructorName ?? 'instructor'}
                </span>
              )}
            </button>
          )}
          {onReply && !isReply && (
            <button className="cmt-reply" onClick={() => onReply(c)}>
              Reply
            </button>
          )}
          {canModerate && onPin && !isReply && (
            <button
              className={`cmt-mod ${c.pinned ? 'on' : ''}`}
              onClick={() => onPin(c.id)}
              title={c.pinned ? 'Unpin' : 'Pin to top'}
            >
              <Glyph d={SF.pin} size={13} stroke={2} />
              {c.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {(c.isOwn || canModerate) && onDelete && (
            <button
              className="cmt-mod danger"
              onClick={() => onDelete(c.id)}
              title="Delete comment"
            >
              <Glyph d={SF.trash} size={13} stroke={2} />
              Delete
            </button>
          )}
        </div>
        {(c.replies?.length ?? 0) > 0 && (
          <div className="cmt-replies">
            {c.replies!.map((r) => (
              <CommentRow
                key={r.id}
                c={r}
                isReply
                canModerate={canModerate}
                instructorName={instructorName}
                onLike={onLike}
                onDelete={onDelete}
                onHeart={onHeart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CommentsPanel({
  lessonLabel,
  comments,
  viewerAvatarUrl,
  dark,
  canModerate,
  instructorName,
  onClose,
  onLike,
  onPost,
  onDelete,
  onPin,
  onHeart,
}: {
  lessonLabel: string
  comments: WatchComment[]
  viewerAvatarUrl?: string | null
  dark?: boolean
  /** True when the viewer is the course's instructor — unlocks pin,
   *  creator-heart, and delete-any (YouTube-style moderation). */
  canModerate?: boolean
  instructorName?: string | null
  onClose: () => void
  onLike?: (id: string) => void
  onPost?: (text: string, parentId?: string | null) => void
  onDelete?: (id: string) => void
  onPin?: (id: string) => void
  onHeart?: (id: string) => void
}) {
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<WatchComment | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEsc(onClose)
  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)
  useEffect(() => {
    if (listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight
  }, [total])
  const post = () => {
    if (!text.trim() || !onPost) return
    onPost(text.trim(), replyTo?.id ?? null)
    setText('')
    setReplyTo(null)
  }
  const startReply = (c: WatchComment) => {
    setReplyTo(c)
    inputRef.current?.focus()
  }
  return (
    <div
      className={`sov2 cmt-overlay ${dark ? 'dark' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Discussion"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside className="cmt-panel">
        <div className="cmt-head">
          <div>
            <div className="cmt-h-title">Discussion</div>
            <div className="cmt-h-sub">{lessonLabel}</div>
          </div>
          <button className="cmt-x" onClick={onClose} aria-label="Close">
            <Glyph d={SF.close} size={15} stroke={2.4} />
          </button>
        </div>
        <div className="cmt-count">
          {total} {total === 1 ? 'comment' : 'comments'}
        </div>
        <div className="cmt-list" ref={listRef}>
          {comments.length === 0 ? (
            <div className="cmt-empty">
              <div className="ce-ico">
                <Glyph d={SF.bubble} size={28} stroke={1.6} />
              </div>
              Be the first to comment on this lesson.
            </div>
          ) : (
            comments.map((c) => (
              <CommentRow
                key={c.id}
                c={c}
                canModerate={canModerate}
                instructorName={instructorName}
                onLike={onLike}
                onReply={onPost ? startReply : undefined}
                onDelete={onDelete}
                onPin={onPin}
                onHeart={onHeart}
              />
            ))
          )}
        </div>
        {onPost && (
          <div className="cmt-compose-wrap">
            {replyTo && (
              <div className="cmt-replying">
                <Glyph d={SF.reply} size={12} stroke={2} />
                Replying to <strong>{replyTo.name}</strong>
                <button
                  className="cmt-replying-x"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                >
                  <Glyph d={SF.close} size={10} stroke={2.6} />
                </button>
              </div>
            )}
            <div className="cmt-compose">
              {viewerAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cmt-av sm" src={viewerAvatarUrl} alt="You" />
              ) : (
                <div className="cmt-av sm" />
              )}
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') post()
                }}
                placeholder={
                  replyTo
                    ? `Reply to ${replyTo.name}…`
                    : 'Add to the discussion…'
                }
              />
              <button
                className="cmt-send"
                disabled={!text.trim()}
                onClick={post}
                aria-label="Post"
              >
                <Glyph d={SF.send} size={19} fill="currentColor" />
              </button>
            </div>
          </div>
        )}
      </aside>
      <WatchStyles />
    </div>
  )
}

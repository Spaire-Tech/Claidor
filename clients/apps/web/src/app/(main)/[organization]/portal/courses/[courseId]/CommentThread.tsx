'use client'

import {
  useCreateLessonComment,
  useDeleteLessonComment,
  useLessonComments,
  type LessonCommentRead,
} from '@/hooks/queries/courses'
import { buildCommentTree, type CommentNode as CommentNodeBase } from '@/lib/comments/build-tree'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import { useMemo, useState } from 'react'

type CommentNode = CommentNodeBase<LessonCommentRead>

const fontStack = "'Poppins', var(--font-poppins), system-ui, sans-serif"

const COLORS = {
  fg0: 'oklch(0.18 0.008 280)',
  fg1: 'oklch(0.32 0.008 280)',
  fg2: 'oklch(0.52 0.008 280)',
  fg3: 'oklch(0.66 0.006 280)',
  line: 'oklch(0.92 0.003 280)',
  lineSoft: 'oklch(0.945 0.003 280)',
  bg2: 'oklch(0.975 0.002 280)',
  accent: '#0066cc',
  accentSoft: 'rgba(0, 102, 204, 0.1)',
}

const buildTree = (comments: LessonCommentRead[]): CommentNode[] =>
  buildCommentTree<LessonCommentRead>(comments)

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function avatarBgFor(name: string): string {
  // Stable hue from the name so each commenter gets a distinct avatar tint.
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(135deg, oklch(0.66 0.14 ${hue}), oklch(0.72 0.12 ${(hue + 35) % 360}))`
}

export function CommentThread({
  token,
  courseId,
  lessonId,
  customerName,
  commentsMode = 'visible',
}: {
  token: string
  courseId: string
  lessonId: string
  customerName?: string | null
  commentsMode?: 'visible' | 'hidden' | 'locked'
}) {
  const selfName = customerName?.trim() || 'You'
  const composerDisabled = commentsMode !== 'visible'
  const { data: comments = [], isLoading } = useLessonComments(
    token,
    courseId,
    lessonId,
  )
  const tree = useMemo(() => buildTree(comments), [comments])
  const create = useCreateLessonComment(token, courseId, lessonId)
  const del = useDeleteLessonComment(token, courseId, lessonId)

  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  const submitTopLevel = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    await create.mutateAsync({ content: trimmed })
    setDraft('')
    setFocused(false)
  }

  const submitReply = async (parentId: string) => {
    const trimmed = replyDraft.trim()
    if (!trimmed) return
    await create.mutateAsync({ content: trimmed, parent_id: parentId })
    setReplyDraft('')
    setReplyTo(null)
  }

  if (commentsMode === 'hidden') {
    return null
  }

  return (
    <section
      style={{
        marginTop: 32,
        fontFamily: fontStack,
        color: COLORS.fg0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          marginBottom: 20,
        }}
      >
        <h3
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: COLORS.fg0,
            margin: 0,
          }}
        >
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </h3>
        {commentsMode === 'locked' && (
          <span
            style={{
              fontSize: 12,
              color: COLORS.fg3,
              padding: '4px 10px',
              borderRadius: 999,
              background: COLORS.bg2,
            }}
          >
            Comments are locked
          </span>
        )}
      </div>

      {/* Composer */}
      {!composerDisabled && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          <Avatar name={selfName} size={40} />
          <div style={{ flex: 1 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Add a comment…"
              disabled={create.isPending}
              rows={focused || draft ? 3 : 1}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${
                  focused ? COLORS.accent : COLORS.line
                }`,
                padding: '10px 0',
                color: COLORS.fg0,
                fontSize: 14,
                outline: 'none',
                resize: 'none',
                transition: 'border-color 150ms ease',
                fontFamily: fontStack,
                opacity: create.isPending ? 0.6 : 1,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  submitTopLevel()
                }
                if (e.key === 'Escape') {
                  setDraft('')
                  setFocused(false)
                }
              }}
            />
            {(focused || draft) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 12,
                }}
              >
                <span style={{ fontSize: 11.5, color: COLORS.fg3 }}>
                  Be kind. Cmd/Ctrl+Enter to submit.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <BtnGhost
                    onClick={() => {
                      setDraft('')
                      setFocused(false)
                    }}
                  >
                    Cancel
                  </BtnGhost>
                  <BtnPrimary
                    onClick={submitTopLevel}
                    disabled={!draft.trim() || create.isPending}
                  >
                    {create.isPending ? 'Posting…' : 'Comment'}
                  </BtnPrimary>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ fontSize: 13, color: COLORS.fg3 }}>Loading comments…</div>
      ) : tree.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.fg3 }}>
          No comments yet. Be the first to start the discussion.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {tree.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              depth={0}
              onReply={(id) => {
                setReplyTo(id === replyTo ? null : id)
                setReplyDraft('')
              }}
              activeReplyId={replyTo}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
              onSubmitReply={submitReply}
              onDelete={(id) => del.mutate(id)}
              isPosting={create.isPending}
              selfName={selfName}
              repliesDisabled={composerDisabled}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CommentItem({
  comment,
  depth,
  onReply,
  activeReplyId,
  replyDraft,
  setReplyDraft,
  onSubmitReply,
  onDelete,
  isPosting,
  selfName,
  repliesDisabled,
}: {
  comment: CommentNode
  depth: number
  onReply: (id: string) => void
  activeReplyId: string | null
  replyDraft: string
  setReplyDraft: (s: string) => void
  onSubmitReply: (parentId: string) => void
  onDelete: (id: string) => void
  isPosting: boolean
  selfName: string
  repliesDisabled: boolean
}) {
  const showReplyBox = activeReplyId === comment.id
  const [showReplies, setShowReplies] = useState(true)
  const isDeleted = !!comment.deleted
  const authorName = isDeleted
    ? 'Deleted'
    : (comment.author.name?.trim() || 'Anonymous')

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Avatar name={authorName} size={depth > 0 ? 32 : 40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: COLORS.fg0,
            }}
          >
            {authorName}
          </span>
          <span style={{ color: COLORS.fg3 }}>·</span>
          <span style={{ fontSize: 12, color: COLORS.fg3 }}>
            {formatRelative(comment.created_at)}
          </span>
        </div>
        <p
          style={{
            fontSize: 14,
            color: isDeleted ? COLORS.fg3 : COLORS.fg1,
            fontStyle: isDeleted ? 'italic' : 'normal',
            lineHeight: 1.55,
            margin: '4px 0 8px',
            whiteSpace: 'pre-wrap',
            textWrap: 'pretty' as any,
          }}
        >
          {isDeleted ? 'Comment deleted' : comment.content}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!isDeleted && depth < 2 && !repliesDisabled && (
            <button
              type="button"
              onClick={() => onReply(comment.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: COLORS.fg1,
                fontSize: 12.5,
                fontWeight: 600,
                marginLeft: 4,
                fontFamily: fontStack,
              }}
            >
              Reply
            </button>
          )}
          {comment.is_own && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 999,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: COLORS.fg2,
                fontSize: 12.5,
                fontFamily: fontStack,
              }}
            >
              <DeleteOutlined sx={{ fontSize: 14 }} />
              Delete
            </button>
          )}
        </div>

        {showReplyBox && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <Avatar name={selfName} size={32} />
            <div style={{ flex: 1 }}>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder={`Reply to ${authorName}…`}
                autoFocus
                rows={2}
                disabled={isPosting}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${COLORS.accent}`,
                  padding: '10px 0',
                  color: COLORS.fg0,
                  fontSize: 14,
                  outline: 'none',
                  resize: 'none',
                  fontFamily: fontStack,
                  opacity: isPosting ? 0.6 : 1,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    onSubmitReply(comment.id)
                  }
                  if (e.key === 'Escape') {
                    setReplyDraft('')
                    onReply(comment.id)
                  }
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  marginTop: 12,
                  gap: 8,
                }}
              >
                <BtnGhost
                  onClick={() => {
                    setReplyDraft('')
                    onReply(comment.id)
                  }}
                >
                  Cancel
                </BtnGhost>
                <BtnPrimary
                  onClick={() => onSubmitReply(comment.id)}
                  disabled={!replyDraft.trim() || isPosting}
                >
                  {isPosting ? 'Posting…' : 'Reply'}
                </BtnPrimary>
              </div>
            </div>
          </div>
        )}

        {comment.replies.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 999,
                background: COLORS.accentSoft,
                border: 'none',
                cursor: 'pointer',
                color: COLORS.accent,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: fontStack,
              }}
            >
              <KeyboardArrowDown
                sx={{
                  fontSize: 16,
                  transform: showReplies ? 'rotate(180deg)' : 'none',
                  transition: 'transform 150ms ease',
                }}
              />
              {comment.replies.length}{' '}
              {comment.replies.length === 1 ? 'reply' : 'replies'}
            </button>
            {showReplies && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  marginTop: 12,
                }}
              >
                {comment.replies.map((r) => (
                  <CommentItem
                    key={r.id}
                    comment={r}
                    depth={depth + 1}
                    onReply={onReply}
                    activeReplyId={activeReplyId}
                    replyDraft={replyDraft}
                    setReplyDraft={setReplyDraft}
                    onSubmitReply={onSubmitReply}
                    onDelete={onDelete}
                    isPosting={isPosting}
                    selfName={selfName}
                    repliesDisabled={repliesDisabled}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: size >= 40 ? 13 : 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        flexShrink: 0,
        background: avatarBgFor(name),
        boxShadow:
          'inset 0 0 0 1px oklch(1 0 0 / 0.12), 0 1px 2px oklch(0 0 0 / 0.06)',
        fontFamily: fontStack,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function BtnGhost({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 999,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: COLORS.fg1,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: fontStack,
      }}
    >
      {children}
    </button>
  )
}

function BtnPrimary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 18px',
        borderRadius: 999,
        background: COLORS.accent,
        color: 'white',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        transition: 'opacity 120ms ease',
        fontFamily: fontStack,
      }}
    >
      {children}
    </button>
  )
}

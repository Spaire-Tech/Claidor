'use client'

import { HlsVideo } from '@/components/Courses/HlsVideo'
import { QuizPlayer } from '@/components/Courses/QuizPlayer'
import { MemoizedMarkdown } from '@/components/Markdown/MemoizedMarkdown'
import {
  useLessonNote,
  useMintLessonPlaybackUrl,
  useUpsertLessonNote,
} from '@/hooks/queries/courses'
import { useIsMobile } from '@/utils/mobile'
import Bookmark from '@mui/icons-material/Bookmark'
import BookmarkBorderOutlined from '@mui/icons-material/BookmarkBorderOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import IosShareOutlined from '@mui/icons-material/IosShareOutlined'
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft'
import PlayArrow from '@mui/icons-material/PlayArrow'
import { useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CommentThread } from './CommentThread'

export interface MasterClassLessonViewerProps {
  lesson: {
    id: string
    title: string
    content_type: string
    duration_seconds?: number | null
    thumbnail_url?: string | null
    thumbnail_object_position?: string | null
    mux_playback_id?: string | null
    mux_playback_url?: string | null
    mux_status?: string | null
    completed: boolean
    content?: Record<string, unknown> | null
    comments_mode?: 'visible' | 'hidden' | 'locked'
    description?: string | null
  }
  lessonIndex: number
  totalLessons: number
  lessons: Array<{
    id: string
    title: string
    position: number
    completed: boolean
    duration_seconds?: number | null
    thumbnail_url?: string | null
    thumbnail_object_position?: string | null
    mux_playback_id?: string | null
    locked?: boolean
    locked_until?: string | null
    is_free_preview?: boolean
  }>
  courseTitle: string | null
  courseDescription: string | null
  instructorName: string | null
  instructorAvatarUrl: string | null
  totalDurationSeconds: number
  isPending: boolean
  onBack: () => void
  onSelectLesson: (lessonId: string) => void
  onMarkComplete: () => void
  token: string
  courseId: string
  organizationSlug: string
  customerName?: string | null
  // 'portal' = signed-in customer, full toolbar (Share + Class Guide + Bookmark)
  // 'landing' = public preview, only Share is shown
  mode?: 'portal' | 'landing'
  // When opened from a Course Assistant citation: auto-start the video at this
  // second. 0/undefined = normal open.
  startSeconds?: number
}

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const formatTotalDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} hr ${m} min`
  return `${m} min`
}

const fontStack = "'Poppins', var(--font-poppins), system-ui, sans-serif"

export const MasterClassLessonViewer = ({
  lesson,
  lessonIndex,
  totalLessons,
  lessons,
  courseTitle,
  courseDescription,
  instructorName,
  instructorAvatarUrl,
  totalDurationSeconds,
  isPending: _isPending,
  onBack,
  onSelectLesson,
  onMarkComplete,
  token,
  courseId,
  organizationSlug,
  customerName,
  mode = 'portal',
  startSeconds = 0,
}: MasterClassLessonViewerProps) => {
  const { isMobile } = useIsMobile()
  const [playing, setPlaying] = useState(false)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'lessons' | 'notes'>('lessons')
  const [noteText, setNoteText] = useState('')
  const [bookmarked, setBookmarked] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const mintPlaybackUrl = useMintLessonPlaybackUrl(token, courseId)
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track whether the user has typed since the lesson switched. Prevents
  // the savedNote effect below from clobbering in-flight typing if the
  // server response arrives mid-keystroke.
  const noteDirtyRef = useRef(false)
  // Latest pending draft + lesson id — captured in refs so the unload
  // handlers below can read them without being torn down on every
  // keystroke.
  const pendingNoteRef = useRef<string | null>(null)
  const pendingLessonIdRef = useRef<string | null>(null)

  const { data: savedNote } = useLessonNote(token, courseId, lesson.id)
  const upsertNote = useUpsertLessonNote(token, courseId, lesson.id)

  const bookmarkKey = `polar:bookmark:${courseId}:${lesson.id}`

  useEffect(() => {
    setPlaying(false)
    setPlaybackUrl(null)
    setPlaybackError(null)
    // Flush any pending note for the lesson we're leaving before we
    // reset state. Previously the debounce was cancelled outright, so
    // typing made within 800ms of switching lessons was discarded.
    if (noteDebounceRef.current) {
      clearTimeout(noteDebounceRef.current)
      noteDebounceRef.current = null
    }
    const pendingDraft = pendingNoteRef.current
    const pendingLessonId = pendingLessonIdRef.current
    if (
      pendingDraft !== null &&
      pendingLessonId &&
      pendingLessonId !== lesson.id &&
      token &&
      courseId
    ) {
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/courses/${courseId}/lessons/${pendingLessonId}/notes`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: pendingDraft }),
          keepalive: true,
        },
      ).catch(() => {})
      pendingNoteRef.current = null
      pendingLessonIdRef.current = null
    }
    noteDirtyRef.current = false
    setNoteText('')
    if (typeof window !== 'undefined') {
      setBookmarked(window.localStorage.getItem(bookmarkKey) !== null)
      // Reset scroll on lesson change. The router uses `scroll: false` to
      // preserve position between in-viewer navigations, but that also
      // preserves the (often bottom-of-page) scroll from the course
      // overview when a lesson is first opened — landing the user on
      // comments instead of the video.
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [lesson.id, bookmarkKey, token, courseId])

  // Mint a fresh signed playback URL each time the user presses play.
  // The course-read response no longer inlines mux_playback_url; the
  // POST /playback-url call also enforces video_views_monthly and
  // counts the view, so we can't skip it. Errors surface as a friendly
  // message in the play area instead of a black box.
  const handlePlayClicked = async () => {
    if (mintPlaybackUrl.isPending) return
    setPlaybackError(null)
    setPlaying(true)
    try {
      const result = await mintPlaybackUrl.mutateAsync(lesson.id)
      if (!result.mux_playback_url) {
        throw new Error("This lesson's video isn't available right now.")
      }
      setPlaybackUrl(result.mux_playback_url)
    } catch (err) {
      setPlaying(false)
      setPlaybackError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't load this video. Please try again.",
      )
    }
  }

  useEffect(() => {
    if (savedNote === undefined) return
    // Don't overwrite typing-in-progress with the server value — this
    // covers the race where the user starts a new note before the GET
    // for the saved note resolves.
    if (noteDirtyRef.current) return
    setNoteText(savedNote?.content ?? '')
  }, [savedNote, lesson.id])

  // Opened from a Course Assistant citation at a timestamp: auto-start the
  // video (the player then seeks to startSec via HlsVideo). Fires once per
  // (lesson, second); if the video is already up, HlsVideo handles the seek.
  const autoPlayedRef = useRef<string>('')
  useEffect(() => {
    if (!startSeconds || startSeconds <= 0) return
    if (lesson.content_type !== 'video' || lesson.mux_status !== 'ready') return
    const key = `${lesson.id}:${startSeconds}`
    if (autoPlayedRef.current === key) return
    autoPlayedRef.current = key
    if (playing && playbackUrl) return
    void handlePlayClicked()
    // handlePlayClicked is a stable closure; re-running only on the inputs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSeconds, lesson.id, lesson.content_type, lesson.mux_status])

  const handleNoteChange = (text: string) => {
    noteDirtyRef.current = true
    setNoteText(text)
    pendingNoteRef.current = text
    pendingLessonIdRef.current = lesson.id
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current)
    noteDebounceRef.current = setTimeout(() => {
      upsertNote.mutate(text)
      pendingNoteRef.current = null
    }, 400)
  }

  const handleClearNote = () => {
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current)
    noteDirtyRef.current = true
    setNoteText('')
    pendingNoteRef.current = null
    upsertNote.mutate('')
  }

  // Fire any pending debounced save immediately. Used on blur, lesson
  // switch, and tab visibility hide so we don't lose unsaved typing.
  const flushPendingNote = () => {
    if (noteDebounceRef.current) {
      clearTimeout(noteDebounceRef.current)
      noteDebounceRef.current = null
    }
    if (pendingNoteRef.current !== null) {
      upsertNote.mutate(pendingNoteRef.current)
      pendingNoteRef.current = null
    }
  }

  // Save synchronously on tab close / refresh. The debounced mutation
  // never gets a chance to fire if the user closes the tab inside the
  // debounce window — keepalive lets the request survive page unload.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const flushKeepalive = () => {
      const draft = pendingNoteRef.current
      const lessonIdAtTime = pendingLessonIdRef.current
      if (draft === null || !lessonIdAtTime || !token || !courseId) return
      try {
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/courses/${courseId}/lessons/${lessonIdAtTime}/notes`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content: draft }),
            keepalive: true,
          },
        )
        pendingNoteRef.current = null
      } catch {
        // best-effort — nothing we can do mid-unload
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushKeepalive()
    }
    window.addEventListener('beforeunload', flushKeepalive)
    window.addEventListener('pagehide', flushKeepalive)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flushKeepalive)
      window.removeEventListener('pagehide', flushKeepalive)
      document.removeEventListener('visibilitychange', onVisibility)
      flushKeepalive()
    }
  }, [token, courseId])

  const handleShare = async () => {
    if (typeof window === 'undefined') return
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  const handleBookmark = () => {
    setBookmarked((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        if (next) {
          const thumbnail =
            lesson.thumbnail_url ||
            (lesson.mux_playback_id
              ? `https://image.mux.com/${lesson.mux_playback_id}/thumbnail.jpg?time=1`
              : null)
          const payload = {
            lessonId: lesson.id,
            courseId,
            organizationSlug,
            lessonTitle: lesson.title,
            courseTitle,
            thumbnailUrl: thumbnail,
            durationSeconds: lesson.duration_seconds ?? null,
            savedAt: new Date().toISOString(),
          }
          window.localStorage.setItem(bookmarkKey, JSON.stringify(payload))
        } else {
          window.localStorage.removeItem(bookmarkKey)
        }
      }
      return next
    })
  }

  const thumbnailSrc =
    lesson.thumbnail_url ||
    (lesson.mux_playback_id
      ? `https://image.mux.com/${lesson.mux_playback_id}/thumbnail.jpg?time=1`
      : null)

  const isQuiz = lesson.content_type === 'quiz'
  const textContent = isQuiz ? '' : ((lesson.content as any)?.text ?? '')
  const attachments: any[] = (lesson.content as any)?.attachments ?? []
  const firstAttachment = attachments[0] ?? null

  const renderVideoArea = () => {
    if (lesson.mux_playback_id && lesson.mux_status === 'ready') {
      if (playing && playbackUrl) {
        return (
          <div className="w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <HlsVideo
              playbackId={lesson.mux_playback_id}
              playbackUrl={playbackUrl}
              poster={thumbnailSrc ?? undefined}
              autoPlay
              startSec={startSeconds}
              onEnded={() => {
                if (!lesson.completed) onMarkComplete()
              }}
            />
          </div>
        )
      }
      return (
        <button
          onClick={handlePlayClicked}
          disabled={mintPlaybackUrl.isPending}
          className="group relative block w-full bg-black disabled:cursor-wait"
          style={{ aspectRatio: '16/9' }}
        >
          {thumbnailSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc}
              alt={lesson.title}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: lesson.thumbnail_object_position ?? '50% 50%',
              }}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="flex items-center justify-center rounded-full transition-transform group-hover:scale-105"
              style={{
                width: 72,
                height: 72,
                background: 'rgba(255,255,255,0.95)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                paddingLeft: 4,
              }}
            >
              <PlayArrow sx={{ fontSize: 30, color: '#000' }} />
            </div>
          </div>
          {playbackError && (
            <div className="absolute inset-x-0 bottom-0 bg-red-900/80 px-4 py-2 text-center text-xs text-white">
              {playbackError}
            </div>
          )}
        </button>
      )
    }

    if (thumbnailSrc) {
      return (
        <div
          className="relative w-full bg-black"
          style={{ aspectRatio: '16/9' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailSrc}
            alt={lesson.title}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: lesson.thumbnail_object_position ?? '50% 50%',
            }}
          />
        </div>
      )
    }

    return <div className="w-full bg-black" style={{ aspectRatio: '16/9' }} />
  }

  if (isMobile) {
    return renderMobileLessonViewer({
      lesson,
      lessonIndex,
      totalLessons,
      lessons,
      instructorName,
      activeTab,
      setActiveTab,
      noteText,
      handleNoteChange,
      handleClearNote,
      flushPendingNote,
      bookmarked,
      handleBookmark,
      handleShare,
      shareCopied,
      isQuiz,
      textContent,
      attachments,
      firstAttachment,
      renderVideoArea,
      onBack,
      onSelectLesson,
      onMarkComplete,
      token,
      courseId,
      customerName,
    })
  }

  return (
    <div
      className="mc-viewer min-h-screen w-full"
      style={{
        background: '#ffffff',
        color: 'oklch(0.18 0.008 280)',
        fontFamily: fontStack,
        letterSpacing: '-0.005em',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {/* The two-column grid + sticky sidebar are inline styles, so a
          narrow-but-desktop window (or a phone that dodges the useIsMobile
          UA check) used to keep the 380px sidebar squeezing the content.
          Collapse to one flowing column below 820px regardless. */}
      <style jsx global>{`
        @media (max-width: 820px) {
          .mc-viewer .lesson-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .mc-viewer .lesson-grid > aside {
            position: static !important;
            max-height: none !important;
          }
        }
      `}</style>
      {/* Slim top bar — back button + lesson counter only (no Spaire branding) */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid oklch(0.945 0.003 280)',
        }}
      >
        <div
          className="mx-auto flex items-center justify-between"
          style={{ maxWidth: 1440, padding: '14px 28px' }}
        >
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 transition-colors"
            style={{
              padding: '8px 14px 8px 10px',
              borderRadius: 999,
              fontSize: 13.5,
              fontWeight: 500,
              color: 'oklch(0.32 0.008 280)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'oklch(0.95 0.003 280)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <KeyboardArrowLeft sx={{ fontSize: 20 }} />
            Back to Course
          </button>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'oklch(0.52 0.008 280)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lessonIndex + 1} of {totalLessons}
          </span>
        </div>
      </header>

      <main
        className="mx-auto"
        style={{
          maxWidth: 1440,
          padding: '24px 28px 64px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 380px',
            gap: 28,
            alignItems: 'start',
          }}
          className="lesson-grid"
        >
          {/* LEFT: video + meta + content + comments */}
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {/* Video frame */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                background: '#000',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow:
                  '0 1px 2px oklch(0 0 0 / 0.05), 0 12px 32px oklch(0 0 0 / 0.08)',
              }}
            >
              {renderVideoArea()}
            </div>

            {/* Meta row: title + actions */}
            <div
              style={{
                display: 'flex',
                gap: 24,
                alignItems: 'flex-start',
                paddingTop: 4,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: '#0066cc',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  Lesson {lessonIndex + 1} of {totalLessons}
                </div>
                <h1
                  style={{
                    fontFamily: fontStack,
                    fontSize: 28,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    margin: '0 0 10px',
                    color: 'oklch(0.18 0.008 280)',
                    lineHeight: 1.2,
                    textWrap: 'pretty' as any,
                  }}
                >
                  {lesson.title}
                </h1>
                {lesson.description && (
                  <p
                    style={{
                      fontSize: 14,
                      color: 'oklch(0.52 0.008 280)',
                      lineHeight: 1.6,
                      margin: 0,
                      maxWidth: 620,
                      textWrap: 'pretty' as any,
                      fontWeight: 400,
                    }}
                  >
                    {lesson.description}
                  </p>
                )}
              </div>

              {/* Actions: Share | Class Guide | Bookmark (last two only in portal mode) */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <ActionBtn
                  icon={<IosShareOutlined sx={{ fontSize: 16 }} />}
                  label={shareCopied ? 'Link copied' : 'Share'}
                  onClick={handleShare}
                />
                {mode === 'portal' && lesson.content_type !== 'quiz' && (
                  <ActionBtn
                    icon={
                      lesson.completed ? (
                        <CheckCircle sx={{ fontSize: 16 }} />
                      ) : (
                        <CheckCircleOutline sx={{ fontSize: 16 }} />
                      )
                    }
                    label={lesson.completed ? 'Completed' : 'Mark complete'}
                    active={lesson.completed}
                    disabled={lesson.completed}
                    onClick={() => {
                      if (!lesson.completed) onMarkComplete()
                    }}
                  />
                )}
                {mode === 'portal' && (
                  <>
                    {firstAttachment ? (
                      <a
                        href={firstAttachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none' }}
                      >
                        <ActionBtn
                          icon={<DownloadOutlined sx={{ fontSize: 16 }} />}
                          label="Class Guide"
                        />
                      </a>
                    ) : (
                      <ActionBtn
                        icon={<DownloadOutlined sx={{ fontSize: 16 }} />}
                        label="Class Guide"
                        disabled
                      />
                    )}
                    <ActionBtn
                      icon={
                        bookmarked ? (
                          <Bookmark sx={{ fontSize: 16 }} />
                        ) : (
                          <BookmarkBorderOutlined sx={{ fontSize: 16 }} />
                        )
                      }
                      label={bookmarked ? 'Saved' : 'Bookmark'}
                      active={bookmarked}
                      onClick={handleBookmark}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Lesson body content (markdown / quiz) */}
            {(textContent || isQuiz) && (
              <div style={{ marginTop: 12 }}>
                {textContent && !isQuiz && (
                  <div
                    className="prose max-w-none"
                    style={{
                      fontFamily: fontStack,
                      color: 'oklch(0.32 0.008 280)',
                    }}
                  >
                    <MemoizedMarkdown content={textContent} />
                  </div>
                )}
                {isQuiz && (
                  <QuizPlayer
                    key={lesson.id}
                    lesson={lesson as any}
                    token={token}
                    courseId={courseId}
                    onPassed={onMarkComplete}
                  />
                )}
              </div>
            )}

            {/* Resources — every attachment, not just the "Class Guide"
                (the toolbar button above still deep-links the first one). */}
            {attachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: 'oklch(0.52 0.008 280)',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Resources
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {attachments.map((att, i) => (
                    <a
                      key={att.id ?? i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 14px',
                        borderRadius: 12,
                        border: '1px solid oklch(0.92 0.003 280)',
                        background: 'oklch(0.975 0.002 280)',
                        color: 'inherit',
                        textDecoration: 'none',
                        maxWidth: 460,
                      }}
                    >
                      <DownloadOutlined
                        sx={{ fontSize: 18, color: 'oklch(0.32 0.008 280)' }}
                      />
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {att.name ?? att.filename ?? 'Lesson resource'}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: 'oklch(0.92 0.003 280)',
                margin: '12px 0 0',
              }}
            />

            {/* Comments */}
            <CommentThread
              token={token}
              courseId={courseId}
              lessonId={lesson.id}
              customerName={customerName ?? null}
              commentsMode={lesson.comments_mode ?? 'visible'}
            />
          </div>

          {/* RIGHT: sidebar */}
          <aside
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              position: 'sticky',
              top: 80,
              height: 'fit-content',
              maxHeight: 'calc(100vh - 96px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                flex: 1,
              }}
            >
              {/* Header card with instructor + tabs */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid oklch(0.92 0.003 280)',
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottom: 'none',
                  padding: '18px 18px 0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0a84ff, #0056b3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: 13,
                      boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.12)',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {instructorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={instructorAvatarUrl}
                        alt={instructorName ?? ''}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      (instructorName ?? '?').slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'oklch(0.18 0.008 280)',
                      }}
                    >
                      {instructorName}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'oklch(0.52 0.008 280)',
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {courseTitle}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    borderBottom: '1px solid oklch(0.92 0.003 280)',
                    margin: '0 -18px',
                    padding: '0 18px',
                  }}
                >
                  {(['lessons', 'notes'] as const).map((tab) => {
                    const isActive = activeTab === tab
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                          position: 'relative',
                          padding: '10px 0',
                          marginRight: 18,
                          color: isActive
                            ? 'oklch(0.18 0.008 280)'
                            : 'oklch(0.52 0.008 280)',
                          fontSize: 13,
                          fontWeight: 500,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: fontStack,
                        }}
                      >
                        {tab === 'lessons' ? 'All Lessons' : 'My Notes'}
                        {isActive && (
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: -1,
                              height: 2,
                              background: '#0066cc',
                              borderRadius: 2,
                            }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Body */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid oklch(0.92 0.003 280)',
                  borderTop: 'none',
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 14,
                  overflow: 'hidden',
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow:
                    '0 1px 2px oklch(0 0 0 / 0.04), 0 4px 16px oklch(0 0 0 / 0.06)',
                  maxHeight: 'calc(100vh - 220px)',
                }}
              >
                {activeTab === 'lessons' ? (
                  <div
                    style={{
                      overflowY: 'auto',
                      padding: '16px 18px 18px',
                      flex: 1,
                    }}
                  >
                    {courseDescription && (
                      <div
                        style={{
                          fontSize: 13,
                          color: 'oklch(0.32 0.008 280)',
                          lineHeight: 1.5,
                          marginBottom: 4,
                          textWrap: 'pretty' as any,
                        }}
                      >
                        {courseDescription}
                      </div>
                    )}
                    <div
                      style={{ fontSize: 12, color: 'oklch(0.66 0.006 280)' }}
                    >
                      {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
                      {totalDurationSeconds > 0 &&
                        ` · ${formatTotalDuration(totalDurationSeconds)}`}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        marginTop: 14,
                      }}
                    >
                      {(() => {
                        // The "Up next" pill should only mark the genuine next
                        // accessible unwatched lesson — previously every
                        // unwatched item in the sidebar said "Up next", which
                        // is meaningless when there are 12 of them.
                        const activeIdx = lessons.findIndex(
                          (l) => l.id === lesson.id,
                        )
                        const nextUpId =
                          lessons.find(
                            (l, i) =>
                              i > activeIdx && !l.completed && !l.locked,
                          )?.id ??
                          lessons.find((l) => !l.completed && !l.locked)?.id ??
                          null
                        return lessons.map((l, idx) => {
                          const isActive = lesson.id === l.id
                          const isLocked = !!l.locked
                          const isNext = !isActive && l.id === nextUpId
                          const unlockDate = l.locked_until
                            ? new Date(l.locked_until)
                            : null
                          const unlockLabel =
                            unlockDate && !Number.isNaN(unlockDate.getTime())
                              ? unlockDate.toLocaleDateString()
                              : null
                          const status = isActive
                            ? 'Now playing'
                            : l.completed
                              ? 'Watched'
                              : isLocked
                                ? unlockLabel
                                  ? `Unlocks ${unlockLabel}`
                                  : 'Locked'
                                : isNext
                                  ? 'Up next'
                                  : l.duration_seconds
                                    ? formatDuration(l.duration_seconds)
                                    : `Lesson ${idx + 1}`
                          const thumb =
                            l.thumbnail_url ||
                            (l.mux_playback_id
                              ? `https://image.mux.com/${l.mux_playback_id}/thumbnail.jpg?time=1`
                              : null)
                          return (
                            <button
                              key={l.id}
                              onClick={() => {
                                if (!isLocked) onSelectLesson(l.id)
                              }}
                              disabled={isLocked}
                              className="group"
                              title={
                                isLocked
                                  ? unlockLabel
                                    ? `Unlocks ${unlockLabel}`
                                    : 'Locked'
                                  : undefined
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 12,
                                padding: 8,
                                borderRadius: 10,
                                textAlign: 'left',
                                transition: 'background 120ms ease',
                                width: '100%',
                                background: isActive
                                  ? 'oklch(0.975 0.002 280)'
                                  : 'transparent',
                                border: 'none',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                opacity: isLocked ? 0.55 : 1,
                                fontFamily: fontStack,
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive && !isLocked)
                                  e.currentTarget.style.background =
                                    'oklch(0.975 0.002 280)'
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive && !isLocked)
                                  e.currentTarget.style.background =
                                    'transparent'
                              }}
                            >
                              <div
                                style={{
                                  position: 'relative',
                                  width: 104,
                                  height: 62,
                                  flexShrink: 0,
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  background: '#1c1c1c',
                                  boxShadow: '0 1px 2px oklch(0 0 0 / 0.08)',
                                }}
                              >
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt={l.title}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    style={{
                                      objectPosition:
                                        l.thumbnail_object_position ??
                                        '50% 50%',
                                    }}
                                  />
                                ) : null}
                                {isActive && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      background: 'rgba(0,0,0,0.4)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: 'white',
                                    }}
                                  >
                                    <PlayArrow sx={{ fontSize: 18 }} />
                                  </div>
                                )}
                                {isLocked && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      background: 'rgba(0,0,0,0.55)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: 'white',
                                    }}
                                  >
                                    <svg
                                      width="18"
                                      height="18"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect
                                        x="3"
                                        y="11"
                                        width="18"
                                        height="11"
                                        rx="2"
                                      />
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                  </div>
                                )}
                                {l.duration_seconds ? (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      right: 4,
                                      bottom: 4,
                                      fontSize: 10.5,
                                      fontWeight: 600,
                                      color: 'white',
                                      background: 'rgba(0,0,0,0.75)',
                                      padding: '2px 5px',
                                      borderRadius: 3,
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {formatDuration(l.duration_seconds)}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 3,
                                  paddingTop: 2,
                                  minWidth: 0,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 13.5,
                                    fontWeight: 500,
                                    lineHeight: 1.35,
                                    textWrap: 'pretty' as any,
                                    color: isActive
                                      ? '#0066cc'
                                      : 'oklch(0.18 0.008 280)',
                                  }}
                                >
                                  {idx + 1}. {l.title}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11.5,
                                    color: 'oklch(0.66 0.006 280)',
                                  }}
                                >
                                  {status}
                                </div>
                              </div>
                            </button>
                          )
                        })
                      })()}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      overflowY: 'auto',
                      padding: '16px 18px 18px',
                      flex: 1,
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#0066cc',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          marginBottom: 4,
                        }}
                      >
                        Lesson {lessonIndex + 1}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'oklch(0.18 0.008 280)',
                          lineHeight: 1.3,
                        }}
                      >
                        {lesson.title}
                      </div>
                    </div>

                    <textarea
                      value={noteText}
                      onChange={(e) => handleNoteChange(e.target.value)}
                      onBlur={flushPendingNote}
                      placeholder="Type your notes here…"
                      rows={12}
                      style={{
                        width: '100%',
                        background: 'oklch(0.975 0.002 280)',
                        border: '1px solid oklch(0.92 0.003 280)',
                        borderRadius: 10,
                        padding: 12,
                        outline: 'none',
                        resize: 'vertical',
                        fontSize: 13,
                        color: 'oklch(0.18 0.008 280)',
                        lineHeight: 1.6,
                        fontFamily: fontStack,
                      }}
                    />

                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: 'oklch(0.66 0.006 280)',
                      }}
                    >
                      <span>
                        {upsertNote.isPending
                          ? 'Saving…'
                          : noteText.length === 0
                            ? 'Type to start a note'
                            : 'Auto-saved'}
                      </span>
                      {noteText.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearNote}
                          disabled={upsertNote.isPending}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: 'oklch(0.55 0.20 25)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            fontFamily: fontStack,
                          }}
                        >
                          Clear note
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

function ActionBtn({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const baseBg = active ? 'rgba(0, 102, 204, 0.1)' : '#ffffff'
  const baseColor = active
    ? '#0066cc'
    : disabled
      ? 'oklch(0.66 0.006 280)'
      : 'oklch(0.18 0.008 280)'
  const baseBorder = active ? 'transparent' : 'oklch(0.92 0.003 280)'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={twMerge(
        'inline-flex items-center gap-2 transition-all',
        disabled && 'cursor-not-allowed',
      )}
      style={{
        padding: '10px 16px',
        borderRadius: 999,
        background: baseBg,
        color: baseColor,
        border: `1px solid ${baseBorder}`,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: fontStack,
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = 'oklch(0.975 0.002 280)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = '#ffffff'
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile lesson player
// ────────────────────────────────────────────────────────────────────────────
//
// Phone-shaped layout for the same lesson player surface — keeps every
// piece of working logic (notes auto-save, bookmark localStorage, share
// clipboard copy, mark-complete, lesson navigation, quiz / text fallback)
// and just rearranges the markup so it reads on a phone:
//
//   • Sticky compact top bar (back · counter · bookmark · share)
//   • Full-bleed 16:9 video frame
//   • Meta block: "LESSON N · duration · instructor", big title, description
//   • Mark-complete pill
//   • Sticky tab strip — All Lessons / My Notes
//   • Lessons tab → vertical list of compact rows (matches the rest of
//     the customer-portal mobile look)
//   • Notes tab → full-width textarea
//   • Text content / first attachment / comments below the tabs

const mFont = "'Poppins', var(--font-poppins), system-ui, sans-serif"

type MobileVA = {
  lesson: MasterClassLessonViewerProps['lesson']
  lessonIndex: number
  totalLessons: number
  lessons: MasterClassLessonViewerProps['lessons']
  instructorName: string | null | undefined
  activeTab: 'lessons' | 'notes'
  setActiveTab: (t: 'lessons' | 'notes') => void
  noteText: string
  handleNoteChange: (t: string) => void
  handleClearNote: () => void
  flushPendingNote: () => void
  bookmarked: boolean
  handleBookmark: () => void
  handleShare: () => void
  shareCopied: boolean
  isQuiz: boolean
  textContent: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attachments: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  firstAttachment: any
  renderVideoArea: () => React.ReactNode
  onBack: () => void
  onSelectLesson: (lessonId: string) => void
  onMarkComplete: () => void
  token: string
  courseId: string
  customerName: string | null | undefined
}

function renderMobileLessonViewer(a: MobileVA): React.ReactElement {
  const {
    lesson,
    lessonIndex,
    totalLessons,
    lessons,
    instructorName,
    activeTab,
    setActiveTab,
    noteText,
    handleNoteChange,
    handleClearNote,
    bookmarked,
    handleBookmark,
    handleShare,
    shareCopied,
    isQuiz,
    textContent,
    attachments,
    renderVideoArea,
    onBack,
    onSelectLesson,
    onMarkComplete,
    token,
    courseId,
    customerName,
  } = a

  const activeIdx = lessons.findIndex((l) => l.id === lesson.id)
  const nextUpId =
    lessons.find((l, i) => i > activeIdx && !l.completed && !l.locked)?.id ??
    lessons.find((l) => !l.completed && !l.locked)?.id ??
    null

  // Sequential neighbors for the sticky prev/next footer — locked lessons
  // are skipped in both directions.
  const prevLesson =
    [...lessons.slice(0, Math.max(0, activeIdx))]
      .reverse()
      .find((l) => !l.locked) ?? null
  const nextLesson = lessons.slice(activeIdx + 1).find((l) => !l.locked) ?? null

  const durationLabel = lesson.duration_seconds
    ? formatDuration(lesson.duration_seconds)
    : null

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: '#ffffff',
        color: 'oklch(0.18 0.008 280)',
        fontFamily: mFont,
        letterSpacing: '-0.005em',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid oklch(0.945 0.003 280)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to course"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px 6px 6px',
              borderRadius: 999,
              border: 0,
              background: 'transparent',
              color: 'oklch(0.32 0.008 280)',
              fontFamily: mFont,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <KeyboardArrowLeft sx={{ fontSize: 22 }} />
            Course
          </button>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'oklch(0.52 0.008 280)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lessonIndex + 1} of {totalLessons}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              onClick={handleBookmark}
              aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
              style={mobileIconBtnStyle(bookmarked)}
            >
              {bookmarked ? (
                <Bookmark sx={{ fontSize: 18 }} />
              ) : (
                <BookmarkBorderOutlined sx={{ fontSize: 18 }} />
              )}
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share lesson"
              style={mobileIconBtnStyle(false)}
            >
              <IosShareOutlined sx={{ fontSize: 18 }} />
            </button>
          </div>
        </div>
        {shareCopied && (
          <div
            style={{
              padding: '4px 16px 8px',
              fontSize: 11.5,
              color: 'oklch(0.32 0.008 280)',
              textAlign: 'right',
            }}
            role="status"
          >
            Link copied
          </div>
        )}
      </header>

      <main
        style={{
          paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Full-bleed video (no rounded card edges — the device frame
            already provides the screen radius). */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            background: '#000',
          }}
        >
          {renderVideoArea()}
        </div>

        <section style={{ padding: '16px 18px 4px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.16em',
              color: 'oklch(0.52 0.008 280)',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            <span>LESSON {lessonIndex + 1}</span>
            {durationLabel && (
              <>
                <span
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: 'oklch(0.66 0.006 280)',
                  }}
                />
                <span>{durationLabel}</span>
              </>
            )}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.022em',
              lineHeight: 1.22,
              color: 'oklch(0.18 0.008 280)',
            }}
          >
            {lesson.title}
          </h1>
          {instructorName && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12.5,
                color: 'oklch(0.52 0.008 280)',
              }}
            >
              with {instructorName}
            </div>
          )}
          {lesson.description && (
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: 'oklch(0.32 0.008 280)',
                textWrap: 'pretty' as React.CSSProperties['textWrap'],
              }}
            >
              {lesson.description}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!lesson.completed) onMarkComplete()
              }}
              disabled={lesson.completed}
              style={{
                appearance: 'none',
                border: 0,
                cursor: lesson.completed ? 'default' : 'pointer',
                fontFamily: mFont,
                fontSize: 12.5,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 999,
                background: lesson.completed
                  ? 'oklch(0.95 0.04 145)'
                  : '#0a0a0a',
                color: lesson.completed ? 'oklch(0.32 0.10 145)' : 'white',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: lesson.completed ? 1 : 1,
              }}
            >
              {lesson.completed ? (
                <CheckCircle sx={{ fontSize: 14 }} />
              ) : (
                <CheckCircleOutline sx={{ fontSize: 14 }} />
              )}
              {lesson.completed ? 'Completed' : 'Mark complete'}
            </button>
          </div>
        </section>

        {/* Tabs — sticky just below the top bar so the lesson list / notes
            switcher stays reachable while reading. */}
        <div
          style={{
            position: 'sticky',
            top: 52,
            zIndex: 30,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            borderBottom: '1px solid oklch(0.945 0.003 280)',
            marginTop: 16,
          }}
        >
          <div
            role="tablist"
            aria-label="Lesson sidebar"
            style={{ display: 'flex', gap: 4, padding: '0 18px' }}
          >
            {(['lessons', 'notes'] as const).map((tab) => {
              const active = activeTab === tab
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    appearance: 'none',
                    border: 0,
                    background: 'transparent',
                    padding: '11px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: active
                      ? 'oklch(0.18 0.008 280)'
                      : 'oklch(0.52 0.008 280)',
                    fontFamily: mFont,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {tab === 'lessons' ? 'All Lessons' : 'My Notes'}
                  {active && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 12,
                        right: 12,
                        bottom: 0,
                        height: 2,
                        background: 'oklch(0.18 0.008 280)',
                        borderRadius: 2,
                      }}
                      aria-hidden
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {activeTab === 'lessons' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 12px 24px',
            }}
          >
            {lessons.map((l, idx) => {
              const active = l.id === lesson.id
              const locked = !!l.locked
              const isNext = !active && l.id === nextUpId
              const unlockDate = l.locked_until
                ? new Date(l.locked_until)
                : null
              const unlockLabel =
                unlockDate && !Number.isNaN(unlockDate.getTime())
                  ? unlockDate.toLocaleDateString()
                  : null
              const status = active
                ? 'Now playing'
                : l.completed
                  ? 'Watched'
                  : locked
                    ? unlockLabel
                      ? `Unlocks ${unlockLabel}`
                      : 'Locked'
                    : isNext
                      ? 'Up next'
                      : l.duration_seconds
                        ? formatDuration(l.duration_seconds)
                        : `Lesson ${idx + 1}`
              const thumb =
                l.thumbnail_url ||
                (l.mux_playback_id
                  ? `https://image.mux.com/${l.mux_playback_id}/thumbnail.jpg?time=1`
                  : null)
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    if (!locked) onSelectLesson(l.id)
                  }}
                  disabled={locked}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 12,
                    padding: 8,
                    borderRadius: 12,
                    width: '100%',
                    textAlign: 'left',
                    background: active
                      ? 'oklch(0.97 0.002 280)'
                      : 'transparent',
                    border: 0,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.6 : 1,
                    fontFamily: mFont,
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 116,
                      height: 70,
                      flexShrink: 0,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#1c1c1c',
                    }}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition:
                            l.thumbnail_object_position ?? '50% 50%',
                        }}
                      />
                    ) : null}
                    {active && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                        }}
                      >
                        <PlayArrow sx={{ fontSize: 18 }} />
                      </div>
                    )}
                    {locked && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.55)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    )}
                    {l.duration_seconds ? (
                      <span
                        style={{
                          position: 'absolute',
                          right: 4,
                          bottom: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'white',
                          background: 'rgba(0,0,0,0.75)',
                          padding: '2px 5px',
                          borderRadius: 3,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatDuration(l.duration_seconds)}
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 3,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        lineHeight: 1.32,
                        color: 'oklch(0.18 0.008 280)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {l.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: l.completed
                          ? 'oklch(0.40 0.10 145)'
                          : active
                            ? 'oklch(0.40 0.12 285)'
                            : 'oklch(0.52 0.008 280)',
                        fontWeight: active || l.completed ? 600 : 500,
                      }}
                    >
                      {status}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={{ padding: '14px 18px 24px' }}>
            <textarea
              value={noteText}
              onChange={(e) => handleNoteChange(e.target.value)}
              onBlur={a.flushPendingNote}
              placeholder="Capture a thought, a question, a quote — saves automatically."
              rows={8}
              style={{
                width: '100%',
                appearance: 'none',
                border: '1px solid oklch(0.92 0.003 280)',
                borderRadius: 12,
                background: '#fff',
                padding: '12px 14px',
                fontFamily: mFont,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: 'oklch(0.18 0.008 280)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11.5,
                color: 'oklch(0.52 0.008 280)',
              }}
            >
              <span>Notes save automatically.</span>
              {noteText.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearNote}
                  style={{
                    appearance: 'none',
                    background: 'transparent',
                    border: 0,
                    color: 'oklch(0.32 0.008 280)',
                    fontFamily: mFont,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Clear note
                </button>
              )}
            </div>
          </div>
        )}

        {/* Below-the-fold content — text lesson body, attachments,
            comments. Keeps the existing data wired in without trying to
            recreate the desktop's two-column flow on a phone. */}
        {!isQuiz && textContent && (
          <section style={{ padding: '8px 18px 24px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.16em',
                color: 'oklch(0.52 0.008 280)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              About this lesson
            </div>
            <div
              className="prose prose-sm max-w-none"
              style={{ fontSize: 14, lineHeight: 1.65 }}
            >
              <MemoizedMarkdown content={textContent} />
            </div>
          </section>
        )}

        {attachments.length > 0 && (
          <section style={{ padding: '0 18px 24px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.16em',
                color: 'oklch(0.52 0.008 280)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Resources
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((att, i) => (
                <a
                  key={att.id ?? i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid oklch(0.92 0.003 280)',
                    background: 'oklch(0.975 0.002 280)',
                    color: 'inherit',
                    textDecoration: 'none',
                    fontFamily: mFont,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: '#0a0a0a',
                      color: 'white',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <DownloadOutlined sx={{ fontSize: 18 }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'oklch(0.18 0.008 280)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {att.name ?? att.filename ?? 'Lesson resource'}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'oklch(0.52 0.008 280)',
                      }}
                    >
                      Download attachment
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section style={{ padding: '0 18px 24px' }}>
          <CommentThread
            token={token}
            courseId={courseId}
            lessonId={lesson.id}
            customerName={customerName ?? null}
            commentsMode={lesson.comments_mode ?? 'visible'}
          />
        </section>
      </main>

      {/* Sticky prev/next footer — the reading view previously had no
          sequential navigation at all; the only path to another lesson was
          the All Lessons list. */}
      <nav
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          display: 'flex',
          gap: 10,
          padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(255,255,255,0.94)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderTop: '1px solid oklch(0.945 0.003 280)',
          fontFamily: mFont,
        }}
        aria-label="Lesson navigation"
      >
        <button
          onClick={() => prevLesson && onSelectLesson(prevLesson.id)}
          disabled={!prevLesson}
          style={{
            appearance: 'none',
            border: '1px solid oklch(0.92 0.003 280)',
            background: '#fff',
            color: 'oklch(0.32 0.008 280)',
            opacity: prevLesson ? 1 : 0.45,
            flex: 1,
            minHeight: 46,
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: prevLesson ? 'pointer' : 'default',
          }}
        >
          ← Previous
        </button>
        <button
          onClick={() =>
            nextLesson ? onSelectLesson(nextLesson.id) : onBack()
          }
          style={{
            appearance: 'none',
            border: 0,
            background: '#0a0a0a',
            color: '#fff',
            flex: 1.4,
            minHeight: 46,
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            padding: '0 14px',
          }}
        >
          {nextLesson ? 'Next lesson →' : 'Back to course'}
        </button>
      </nav>
    </div>
  )
}

function mobileIconBtnStyle(active: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    border: 0,
    background: active ? 'oklch(0.95 0.003 280)' : 'transparent',
    color: active ? 'oklch(0.18 0.008 280)' : 'oklch(0.32 0.008 280)',
    width: 36,
    height: 36,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

'use client'

// WatchHome — the customer portal's course page, built on the Spaire
// Originals v2 design (now-playing marquee hero + catalog lesson rail).
// All logic is real:
//
//   completion   → server (data.progress.completed + mark-complete)
//   position     → per-device (localStorage spaire_watch:{courseId}) —
//                  drives the Netflix-style bar under started lessons,
//                  Resume labels, and the player's start position
//   playback     → mints a signed playback URL per play (quota-enforced),
//                  then opens the v2 WatchPlayer
//   comments     → real lesson comments API (enrolled customers)
//   bookmarks    → localStorage in the BookmarksPage's SavedBookmark shape
//   overview     → lesson.content overview/takeaways/attachments
//   theme        → the course's landing theme (dark landing → dark page)

import {
  postWatchProgress,
  useCreateLessonComment,
  useDeleteLessonComment,
  useInstructorHeartComment,
  useLessonComments,
  useLikeLessonComment,
  useMintLessonPlaybackUrl,
  usePinLessonComment,
  useResetCourseProgress,
  type CustomerCourseDetail,
} from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { titleFontFamily } from '../titleFonts'
import { Glyph, SF, fmtTime } from './WatchGlyphs'
import { WatchPageStyles } from './WatchPageStyles'
import { WatchStyles } from './WatchStyles'
import { WatchPlayer } from './WatchPlayer'
import {
  CommentsPanel,
  OverviewSheet,
  type WatchComment,
  type WatchOverview,
} from './WatchSheets'

export type WatchLessonData = {
  id: string
  title: string
  description?: string | null
  position: number
  duration_seconds?: number | null
  thumbnail_url?: string | null
  thumbnail_object_position?: string | null
  mux_playback_id?: string | null
  mux_status?: string | null
  completed: boolean
  locked?: boolean
  locked_until?: string | null
  content_type: string
  content: Record<string, unknown> | null
  comments_mode?: 'visible' | 'hidden' | 'locked'
}

/* ── per-device partial-position store (shared key with the landing) ── */
type WatchState = { p: Record<string, number>; done: string[] }
function readWatchState(courseId: string): WatchState {
  try {
    const raw = window.localStorage.getItem(`spaire_watch:${courseId}`)
    if (raw) return JSON.parse(raw) as WatchState
  } catch {
    /* ignore */
  }
  return { p: {}, done: [] }
}
function writeWatchState(courseId: string, s: WatchState) {
  try {
    window.localStorage.setItem(`spaire_watch:${courseId}`, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/* ── bookmarks — EXACTLY the shape BookmarksPage reads ── */
type SavedBookmark = {
  lessonId: string
  courseId: string
  organizationSlug: string
  lessonTitle: string
  courseTitle: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  savedAt: string
  storageKey: string
}
const bookmarkKey = (lessonId: string) => `polar:bookmark:${lessonId}`
function readBookmarks(courseId: string): Set<string> {
  const ids = new Set<string>()
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith('polar:bookmark:')) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const b = JSON.parse(raw) as SavedBookmark
      if (b.courseId === courseId) ids.add(b.lessonId)
    }
  } catch {
    /* ignore */
  }
  return ids
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function fmtRuntime(secs: number): string {
  if (secs <= 0) return '0 min'
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

// Absolute unlock date for a dripped / scheduled lesson, e.g. "Mar 14". Shown
// to students so a locked lesson says WHEN it opens instead of a vague "later".
function unlockDateLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Per-card variation for the liquid-glass placeholder — the landing's
// formula (GeneratedPortalPage), so unfilled tiles keep the same visual
// rhythm here as on the public page. n is the 1-based card number.
function ambientTint(n: number): React.CSSProperties {
  return {
    filter: `blur(40px) hue-rotate(${((n * 53) % 44) - 22}deg) brightness(${(
      0.94 +
      (n % 3) * 0.06
    ).toFixed(2)})`,
  }
}

// The landing catalog card's duration chip uses a clock, not a play glyph.
const ClockGlyph = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

function lessonOverview(l: WatchLessonData): WatchOverview {
  const c = (l.content ?? {}) as {
    overview?: string
    takeaways?: string[]
    attachments?: {
      id: string
      filename: string
      url: string
      size: number
      content_type: string
    }[]
  }
  const body = c.overview
    ? c.overview.split(/\n{2,}/).filter(Boolean)
    : l.description
      ? [l.description]
      : []
  return {
    body,
    learn: (c.takeaways ?? []).filter(Boolean),
    resources: (c.attachments ?? []).map((a) => ({
      name: a.filename,
      type: a.content_type?.includes('pdf')
        ? 'pdf'
        : a.content_type?.startsWith('audio')
          ? 'audio'
          : a.content_type?.startsWith('video')
            ? 'video'
            : 'pdf',
      meta: `${(a.content_type?.split('/').pop() ?? 'file').toUpperCase()} · ${
        a.size > 1048576
          ? `${(a.size / 1048576).toFixed(1)} MB`
          : `${Math.max(1, Math.round(a.size / 1024))} KB`
      }`,
      url: a.url,
    })),
  }
}

export function WatchHome({
  organization,
  data,
  lessons,
  token,
  onOpenTextLesson,
  onMarkComplete,
  autoplayLessonId,
  autoplayStartSec,
  onPlayerClose,
}: {
  organization: schemas['CustomerOrganization']
  data: CustomerCourseDetail
  lessons: WatchLessonData[]
  token: string
  onOpenTextLesson: (lessonId: string) => void
  onMarkComplete: (lessonId: string) => void
  /** Deep-linked video lesson (?lesson= in the URL — assistant citations,
   *  bookmarks, back/forward) to open directly in the player overlay. */
  autoplayLessonId?: string | null
  /** Start second for the autoplayed lesson (?t= citation timestamp). */
  autoplayStartSec?: number
  /** Fired when the player overlay closes — lets the route strip the
   *  ?lesson=/?t= params so a refresh doesn't reopen the player. */
  onPlayerClose?: () => void
}) {
  const course = data.course
  const courseId = course.id
  const dark = course.landing_overrides?.theme_mode === 'dark'
  // The customer portal always says "Lesson" — the series-format 'Episode'
  // wording is a landing-page framing, not how students navigate content.
  const unitCap = 'Lesson'
  // Honor the hero the creator chose at onboarding — the public landing
  // already does this, the portal used to hard-render the marquee. 'cover'
  // is the full-bleed lower-left layout; 'marquee' is the frosted band.
  const heroVariant: 'marquee' | 'cover' =
    course.hero_variant === 'marquee' ? 'marquee' : 'cover'
  // Render whichever lesson-card the creator chose at onboarding, same as
  // the landing — Spotlight (text over the image) or Catalog (text under).
  const cardVariant: 'spotlight' | 'catalog' =
    course.lesson_card_variant === 'spotlight' ? 'spotlight' : 'catalog'
  // The creator's Spaire Title Style — the course title in the hero wears
  // the same "movie title" face as the landing headline.
  const courseTitleFont = titleFontFamily(
    course.landing_overrides?.hero_title_font,
  )
  const courseTitleStyle: React.CSSProperties | undefined = courseTitleFont
    ? { fontFamily: courseTitleFont }
    : undefined

  const completedIds = useMemo(
    () => new Set(Object.keys(data.progress?.completed ?? {})),
    [data.progress],
  )

  // Lesson id → module title, used by the mobile vertical list to insert
  // group headers. Single-module courses skip the headers entirely.
  const moduleTitleById = useMemo(() => {
    const map = new Map<string, string>()
    const modules = course.modules ?? []
    if (modules.length > 1) {
      for (const m of [...modules].sort((a, b) => a.position - b.position)) {
        for (const l of m.lessons) map.set(l.id, m.title)
      }
    }
    return map
  }, [course.modules])

  /* ── watch positions (server + per-device) + bookmarks ── */
  // Positions are persisted server-side (per enrollment) AND mirrored in
  // localStorage. Merge the two ONCE per course, taking the furthest
  // position, so progress made on another device — or before this
  // device's cache was cleared — isn't lost. After that first merge the
  // local state is authoritative: it's always at least as fresh as the
  // server (every local update is also synced), and re-merging on every
  // refetch would snap a deliberate rewind back forward.
  const serverPositions = data.progress?.positions
  const [watchState, setWatchState] = useState<WatchState>({ p: {}, done: [] })
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const mergedCourseRef = useRef<string | null>(null)
  useEffect(() => {
    if (mergedCourseRef.current === courseId) return
    mergedCourseRef.current = courseId
    const local = readWatchState(courseId)
    const p = { ...local.p }
    for (const [lessonId, frac] of Object.entries(serverPositions ?? {})) {
      if ((p[lessonId] ?? 0) < frac) p[lessonId] = frac
    }
    setWatchState({ ...local, p })
    setBookmarks(readBookmarks(courseId))
  }, [courseId, serverPositions])

  const fractionOf = useCallback(
    (l: WatchLessonData): number | null => {
      if (completedIds.has(l.id) || l.completed) return null
      const f = watchState.p[l.id]
      return f != null && f > 0.01 && f < 0.99 ? f : null
    },
    [completedIds, watchState],
  )

  const statusOf = useCallback(
    (l: WatchLessonData): 'watched' | 'progress' | 'unwatched' => {
      if (completedIds.has(l.id) || l.completed) return 'watched'
      return fractionOf(l) != null ? 'progress' : 'unwatched'
    },
    [completedIds, fractionOf],
  )

  /* ── focus: the lesson the hero shows — first unfinished by default ── */
  const defaultFocus = useMemo(() => {
    const inProgress = lessons.findIndex(
      (l) => statusOf(l) === 'progress' && !l.locked,
    )
    if (inProgress >= 0) return inProgress
    const firstUnwatched = lessons.findIndex(
      (l) => statusOf(l) === 'unwatched' && !l.locked,
    )
    return firstUnwatched >= 0 ? firstUnwatched : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons.length])
  const [focus, setFocus] = useState(defaultFocus)
  useEffect(() => setFocus(defaultFocus), [defaultFocus])

  const ep = lessons[Math.min(focus, Math.max(0, lessons.length - 1))]
  const status = ep ? statusOf(ep) : 'unwatched'
  const epFraction = ep ? fractionOf(ep) : null

  /* ── toast ── */
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((m: string) => {
    setToastMsg(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400)
  }, [])

  /* ── bookmarks ── */
  const toggleBookmark = useCallback(
    (l: WatchLessonData) => {
      setBookmarks((prev) => {
        const next = new Set(prev)
        try {
          if (next.has(l.id)) {
            next.delete(l.id)
            window.localStorage.removeItem(bookmarkKey(l.id))
            showToast('Bookmark removed')
          } else {
            next.add(l.id)
            const b: SavedBookmark = {
              lessonId: l.id,
              courseId,
              organizationSlug: organization.slug,
              lessonTitle: l.title,
              courseTitle: course.title,
              thumbnailUrl: l.thumbnail_url ?? null,
              durationSeconds: l.duration_seconds ?? null,
              savedAt: new Date().toISOString(),
              storageKey: bookmarkKey(l.id),
            }
            window.localStorage.setItem(bookmarkKey(l.id), JSON.stringify(b))
            showToast('Lesson bookmarked')
          }
        } catch {
          /* ignore quota */
        }
        return next
      })
    },
    [courseId, organization.slug, course.title, showToast],
  )

  /* ── comments (focused lesson) ── */
  const { data: rawComments } = useLessonComments(token, courseId, ep?.id ?? '')
  const createComment = useCreateLessonComment(token, courseId, ep?.id ?? '')
  const likeComment = useLikeLessonComment(token, courseId, ep?.id ?? '')
  const deleteComment = useDeleteLessonComment(token, courseId, ep?.id ?? '')
  const pinComment = usePinLessonComment(token, courseId, ep?.id ?? '')
  const heartComment = useInstructorHeartComment(token, courseId, ep?.id ?? '')
  // Build the threaded list: root comments with their replies nested, the
  // pinned comment hoisted to the top (YouTube semantics). Replies to
  // soft-deleted parents fall back to root level so they stay reachable.
  const comments: WatchComment[] = useMemo(() => {
    const mapOne = (
      c: NonNullable<typeof rawComments>[number],
    ): WatchComment => ({
      id: c.id,
      name: c.author?.name?.trim() || 'Student',
      avatarUrl: c.author?.avatar_url ?? null,
      time: relTime(c.created_at),
      text: c.content,
      likes: c.likes ?? 0,
      liked: c.liked ?? false,
      isOwn: c.is_own,
      isInstructor: c.author?.is_instructor ?? false,
      pinned: c.pinned ?? false,
      instructorHearted: c.instructor_hearted ?? false,
      replies: [],
    })
    const live = (rawComments ?? []).filter((c) => !c.deleted)
    const roots = new Map<string, WatchComment>()
    for (const c of live) {
      if (!c.parent_id) roots.set(c.id, mapOne(c))
    }
    const orphans: WatchComment[] = []
    for (const c of live) {
      if (!c.parent_id) continue
      const parent = roots.get(c.parent_id)
      if (parent) parent.replies!.push(mapOne(c))
      else orphans.push(mapOne(c))
    }
    const list = [...roots.values(), ...orphans]
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    return list
  }, [rawComments])
  const viewerIsInstructor = useMemo(
    () => (rawComments ?? []).some((c) => c.viewer_is_instructor),
    [rawComments],
  )
  const commentsVisible = (ep?.comments_mode ?? 'visible') === 'visible'
  const [showComments, setShowComments] = useState(false)
  const postComment = useCallback(
    (text: string, parentId?: string | null) => {
      createComment.mutate(
        { content: text, parent_id: parentId ?? null },
        { onError: () => showToast('Could not post comment') },
      )
    },
    [createComment, showToast],
  )
  // One like per customer (the mutation is idempotent server-side); guard
  // against a second in-flight toggle while the first resolves.
  const onLikeComment = useCallback(
    (id: string) => {
      if (likeComment.isPending) return
      likeComment.mutate(id)
    },
    [likeComment],
  )
  // Moderation + own-comment delete. Pin and the creator heart are
  // instructor-only (the buttons only render when viewerIsInstructor, and
  // the server enforces it regardless).
  const onDeleteComment = useCallback(
    (id: string) => {
      deleteComment.mutate(id, {
        onError: () => showToast('Could not delete comment'),
      })
    },
    [deleteComment, showToast],
  )
  const onPinComment = useCallback(
    (id: string) => {
      if (pinComment.isPending) return
      pinComment.mutate(id, {
        onError: () => showToast('Could not pin comment'),
      })
    },
    [pinComment, showToast],
  )
  const onHeartComment = useCallback(
    (id: string) => {
      if (heartComment.isPending) return
      heartComment.mutate(id, {
        onError: () => showToast('Could not heart comment'),
      })
    },
    [heartComment, showToast],
  )

  /* ── overview sheet ── */
  const [overviewFor, setOverviewFor] = useState<WatchLessonData | null>(null)

  /* ── reset progress — wipe server completions/positions AND the
     per-device localStorage mirror, then start from zero ── */
  const resetProgress = useResetCourseProgress(token, courseId)
  const handleResetProgress = useCallback(() => {
    if (resetProgress.isPending) return
    if (
      !window.confirm(
        'Reset your progress in this masterclass? Watched lessons and resume positions all start from zero.',
      )
    ) {
      return
    }
    resetProgress.mutate(undefined, {
      onSuccess: () => {
        const empty: WatchState = { p: {}, done: [] }
        setWatchState(empty)
        writeWatchState(courseId, empty)
        showToast('Progress reset')
      },
      onError: () => showToast('Could not reset progress'),
    })
  }, [resetProgress, courseId, showToast])

  /* ── playback — mint a signed URL per play, then open the player ── */
  const mintUrl = useMintLessonPlaybackUrl(token, courseId)
  const [playing, setPlaying] = useState<{
    lesson: WatchLessonData
    playbackUrl: string | null
    playbackId: string | null
    storyboardUrl: string | null
    startSec: number
  } | null>(null)

  const playLesson = useCallback(
    async (l: WatchLessonData, startOverride?: number) => {
      if (l.locked) {
        const when = unlockDateLabel(l.locked_until)
        showToast(when ? `Unlocks ${when}` : 'This lesson unlocks later')
        return
      }
      if (l.content_type !== 'video') {
        // Text / quiz lessons use the reading view.
        onOpenTextLesson(l.id)
        return
      }
      if (!l.mux_playback_id) {
        // A published video lesson whose video isn't playable yet. The old
        // behavior routed to the legacy lesson player, which dead-ended —
        // say what's actually happening instead.
        showToast(
          l.mux_status
            ? 'The video is still processing — check back in a few minutes'
            : 'No video has been uploaded for this lesson yet',
        )
        return
      }
      const frac = fractionOf(l) ?? 0
      const startSec = startOverride ?? frac * (l.duration_seconds ?? 0)
      try {
        const minted = await mintUrl.mutateAsync(l.id)
        setPlaying({
          lesson: l,
          playbackUrl: minted.mux_playback_url ?? null,
          playbackId: minted.mux_playback_id ?? l.mux_playback_id,
          storyboardUrl: minted.mux_storyboard_url ?? null,
          startSec,
        })
      } catch {
        showToast('Could not start playback')
      }
    },
    [fractionOf, mintUrl, onOpenTextLesson, showToast],
  )

  /* ── in-player lesson navigation (prev/next, up-next, lessons sheet) ── */
  const playerPlaylist = useMemo(
    () =>
      lessons.map((l, i) => ({
        id: l.id,
        n: i + 1,
        title: l.title,
        description: l.description,
        durationSeconds: l.duration_seconds,
        thumbnailUrl: l.thumbnail_url ?? course.thumbnail_url,
        locked: l.locked,
        watched: statusOf(l) === 'watched',
      })),
    [lessons, course.thumbnail_url, statusOf],
  )
  const selectFromPlayer = useCallback(
    (lessonId: string) => {
      const l = lessons.find((x) => x.id === lessonId)
      if (!l) return
      // Text/quiz lessons leave the player for the reading view — close the
      // overlay first so it isn't left open underneath.
      if (l.content_type !== 'video') {
        setPlaying(null)
        onPlayerClose?.()
      }
      void playLesson(l)
    },
    [lessons, playLesson, onPlayerClose],
  )

  /* ── deep-linked video (?lesson= / ?t=) opens straight in the player.
     This used to route to the legacy MasterClass reading view — a second,
     divergent player. Consumed once per (lesson, timestamp) so closing the
     player doesn't re-trigger it, while a fresh citation — same lesson,
     new second — still re-opens; the ref resets when the params clear. ── */
  const autoplayConsumedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoplayLessonId) {
      autoplayConsumedRef.current = null
      return
    }
    const key = `${autoplayLessonId}:${autoplayStartSec ?? ''}`
    if (autoplayConsumedRef.current === key) return
    const l = lessons.find((x) => x.id === autoplayLessonId)
    if (!l) return
    autoplayConsumedRef.current = key
    void playLesson(l, autoplayStartSec)
  }, [autoplayLessonId, autoplayStartSec, lessons, playLesson])

  /* ── server-side position sync ── */
  // The player reports progress every ~5s; sending each tick would hammer
  // the API, so sends are throttled (every 10s or a ≥10% jump). The latest
  // unsent position is kept in pendingSyncRef and flushed when the player
  // closes or the page hides, so "watched 95% then closed the tab" is
  // recorded — previously it only ever lived in localStorage. One send
  // path (postWatchProgress, keepalive) serves both the throttled ticks
  // and the pagehide/unmount flush.
  const pendingSyncRef = useRef<{ lessonId: string; fraction: number } | null>(
    null,
  )
  const lastSyncRef = useRef<{
    lessonId: string
    fraction: number
    at: number
  } | null>(null)

  const flushPendingSync = useCallback(() => {
    const pending = pendingSyncRef.current
    if (!pending) return
    pendingSyncRef.current = null
    lastSyncRef.current = { ...pending, at: Date.now() }
    postWatchProgress(token, courseId, pending.lessonId, pending.fraction)
  }, [courseId, token])

  useEffect(() => {
    window.addEventListener('pagehide', flushPendingSync)
    return () => {
      window.removeEventListener('pagehide', flushPendingSync)
      flushPendingSync()
    }
  }, [flushPendingSync])

  const onPlayerProgress = useCallback(
    (lessonId: string, frac: number) => {
      setWatchState((s) => {
        const next = { ...s, p: { ...s.p, [lessonId]: frac } }
        writeWatchState(courseId, next)
        return next
      })
      // Rewatching an already-completed lesson shouldn't re-mark it as
      // "in progress" server-side.
      const lesson = lessons.find((l) => l.id === lessonId)
      if (lesson?.completed || completedIds.has(lessonId)) return
      pendingSyncRef.current = { lessonId, fraction: frac }
      const last = lastSyncRef.current
      const due =
        !last ||
        last.lessonId !== lessonId ||
        Date.now() - last.at >= 10_000 ||
        Math.abs(frac - last.fraction) >= 0.1
      if (due) flushPendingSync()
    },
    [completedIds, courseId, flushPendingSync, lessons],
  )
  const onPlayerComplete = useCallback(
    (lessonId: string) => {
      setWatchState((s) => {
        const p = { ...s.p }
        delete p[lessonId]
        const next = { ...s, p }
        writeWatchState(courseId, next)
        return next
      })
      // Completion supersedes any pending partial position.
      if (pendingSyncRef.current?.lessonId === lessonId) {
        pendingSyncRef.current = null
      }
      onMarkComplete(lessonId)
    },
    [courseId, onMarkComplete],
  )

  /* ── season rails ── */
  // Flat index per lesson id — the hero focus and overview numbering use the
  // course-wide position even when the rails are split per season.
  const flatIndexById = useMemo(
    () => new Map(lessons.map((l, i) => [l.id, i])),
    [lessons],
  )
  // Bonus sections: their lessons live in the "Bonus Content" rail at the
  // bottom (own section, like Trailers), wear "Bonus" instead of a lesson
  // number, and sit outside the "Lesson N of M" spine.
  const bonusIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of course.modules ?? []) {
      if (m.is_bonus) for (const ml of m.lessons) ids.add(ml.id)
    }
    return ids
  }, [course.modules])
  const numberedById = useMemo(() => {
    const map = new Map<string, number>()
    let n = 0
    for (const l of lessons) if (!bonusIds.has(l.id)) map.set(l.id, ++n)
    return map
  }, [lessons, bonusIds])
  const numberedCount = numberedById.size
  // One rail per season when the course has more than one (Apple-TV-style
  // "Season 1 / Season 2 / …" rows). A single-module course — including a
  // limited series — keeps the one flat rail it always had.
  const seasonRails = useMemo(() => {
    // Bonus sections never render as numbered season rows — they collect
    // into the Bonus Content rail below.
    const modules = [...(course.modules ?? [])]
      .filter((m) => !m.is_bonus)
      .sort((a, b) => a.position - b.position)
    if (modules.length <= 1) return null
    const byId = new Map(lessons.map((l) => [l.id, l]))
    const rails = modules.map((m, index) => ({
      module: m,
      index,
      items: m.lessons
        .map((ml) => byId.get(ml.id))
        .filter((x): x is WatchLessonData => Boolean(x)),
    }))
    return rails.filter((r) => r.items.length > 0)
  }, [course.modules, lessons])
  // The Bonus Content rail — every bonus section's lessons, in outline order.
  const bonusItems = useMemo(() => {
    const byId = new Map(lessons.map((l) => [l.id, l]))
    const items: WatchLessonData[] = []
    for (const m of [...(course.modules ?? [])].sort(
      (a, b) => a.position - b.position,
    )) {
      if (!m.is_bonus) continue
      for (const ml of m.lessons) {
        const x = byId.get(ml.id)
        if (x) items.push(x)
      }
    }
    return items
  }, [course.modules, lessons])
  // The single flat rail (one-season courses) lists only numbered lessons —
  // bonus ones live in their own rail.
  const railLessons = useMemo(
    () => lessons.filter((l) => !bonusIds.has(l.id)),
    [lessons, bonusIds],
  )

  /* ── trailer (portal-only rail at the very bottom) ── */
  const [trailerPlaying, setTrailerPlaying] = useState(false)

  if (!ep) {
    return (
      <div className={`sow ${dark ? 'dark' : ''}`}>
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: '60vh',
            color: 'var(--text-2)',
            fontSize: 14,
          }}
        >
          No lessons yet.
        </div>
        <WatchPageStyles />
      </div>
    )
  }

  // Progress is measured against lessons the student can actually open today.
  // Counting not-yet-dripped (locked) lessons in the denominator made the bar
  // understate how far they are through the available material.
  const accessibleLessons = lessons.filter((l) => !l.locked)
  const lessonsDone = accessibleLessons.filter(
    (l) => statusOf(l) === 'watched',
  ).length
  const progressTotal = accessibleLessons.length
  const totalRuntime = lessons.reduce(
    (s, l) => s + (l.duration_seconds ?? 0),
    0,
  )
  const playLabel =
    status === 'watched' ? 'Replay' : status === 'progress' ? 'Resume' : 'Play'
  const isBookmarked = bookmarks.has(ep.id)
  const epN = focus + 1
  // Bonus lessons wear "Bonus" wherever a numbered label would show.
  const epIsBonus = bonusIds.has(ep.id)
  const epLabel = epIsBonus
    ? 'Bonus'
    : `${unitCap} ${numberedById.get(ep.id) ?? epN}`

  // Shown under every "Your progress" bar once there is anything to wipe.
  const hasAnyProgress = lessonsDone > 0 || Object.keys(watchState.p).length > 0
  const resetLink = hasAnyProgress ? (
    <button
      className="prog-reset"
      type="button"
      onClick={handleResetProgress}
      disabled={resetProgress.isPending}
    >
      {resetProgress.isPending ? 'Resetting…' : 'Reset progress'}
    </button>
  ) : null

  const kicker =
    status === 'watched' ? (
      <span>
        Watched · {epLabel}
        {epIsBonus ? '' : ` of ${numberedCount}`}
      </span>
    ) : status === 'progress' ? (
      <>
        <span className="nowbars">
          <i />
          <i />
          <i />
        </span>
        <span>
          Continue · {epLabel}
          {epIsBonus ? '' : ` of ${numberedCount}`}
        </span>
      </>
    ) : (
      <span>
        {epLabel}
        {epIsBonus ? '' : ` of ${numberedCount}`}
      </span>
    )

  // The Trailers card — the same card variant the lesson cards use, shared
  // by the desktop rail and the mobile stack.
  const trailerCard = course.trailer_url
    ? (() => {
        const imgStyle = course.thumbnail_url
          ? { backgroundImage: `url("${course.thumbnail_url}")` }
          : undefined
        const playOverlay = (
          <div className="lc-play">
            <div className="lc-play-btn">
              <Glyph d={SF.play} size={18} fill="currentColor" />
            </div>
          </div>
        )
        const trailerMeta = (
          <div className="lc-meta">
            <Glyph d={SF.play2} size={12} fill="currentColor" stroke={0} />
            <span>Official trailer</span>
          </div>
        )
        if (cardVariant === 'spotlight') {
          return (
            <div className="lc-spot" onClick={() => setTrailerPlaying(true)}>
              <div className={`spot-card ${imgStyle ? '' : 'ph'}`}>
                <div className="ph-ambient" aria-hidden />
                <div className="glass-tint" aria-hidden />
                <div className="img" style={imgStyle} />
                <div className="spot-shade" />
                {playOverlay}
                <div className="spot-info">
                  <div className="lc-num">Trailer</div>
                  {/* Card titles keep the card typography — the Spaire
                      Title Style is a HERO treatment only. */}
                  <div className="spot-title">{course.title}</div>
                  {trailerMeta}
                </div>
              </div>
            </div>
          )
        }
        return (
          <div className="lc-catalog" onClick={() => setTrailerPlaying(true)}>
            <div className="lc-card">
              <div className={`lc-thumb ${imgStyle ? '' : 'ph'}`}>
                {imgStyle ? (
                  <div className="img" style={imgStyle} />
                ) : (
                  <>
                    <div
                      className="ph-ambient"
                      style={ambientTint(1)}
                      aria-hidden
                    />
                    <div className="glass-tint" aria-hidden />
                  </>
                )}
                {playOverlay}
              </div>
              <div className="lc-info">
                <div className="lc-num">Trailer</div>
                <div className="lc-title">{course.title}</div>
                {trailerMeta}
              </div>
            </div>
          </div>
        )
      })()
    : null

  return (
    <div className={`sow ${dark ? 'dark' : ''}`}>
      {/* ════════ now-playing hero ════════ */}
      <header className={`panel ${heroVariant === 'cover' ? 'cover' : ''}`}>
        {lessons.map((l, i) => {
          // The hero shows the lesson's own cover when it has one, else the
          // course cover. Honor whichever image's saved focal point
          // (thumbnail_object_position) so the framing matches what the
          // creator set in "Reposition in portal" — falling back to the
          // template default (center 24%) only when nothing was saved.
          const usingLessonImage = !!l.thumbnail_url
          const heroImage = l.thumbnail_url ?? course.thumbnail_url
          const heroPos = usingLessonImage
            ? l.thumbnail_object_position
            : course.thumbnail_object_position
          return (
            <div
              key={l.id}
              className={`hero-layer ${i === focus ? 'show' : ''} ${
                heroImage ? '' : 'ph'
              }`}
              style={
                heroImage
                  ? {
                      backgroundImage: `url("${heroImage}")`,
                      ...(heroPos ? { backgroundPosition: heroPos } : null),
                    }
                  : undefined
              }
            />
          )
        })}
        <div className="panel-scrim" />
        <div className="panel-grain" />

        <div className="top-controls">
          <span className="member-chip">
            <Glyph d={SF.check} size={13} stroke={2.6} />
            Enrolled
          </span>
        </div>

        {heroVariant === 'cover' ? (
          /* ════ cover hero — ported 1:1 from the public landing's cover hero
             (.hero in "Course Page Empty State.html"): lower-left meta/title/
             desc stack over the full-bleed still, with the portal's playback
             buttons + progress (same set as the marquee band). ════ */
          <div className="hero-content">
            <div className="hero-meta">
              <span className={`badge ${status === 'watched' ? 'done' : ''}`}>
                {status === 'watched'
                  ? 'Watched'
                  : status === 'progress'
                    ? 'Continue'
                    : epLabel}
              </span>
              <span className="meta-line">
                <span style={courseTitleStyle}>{course.title}</span>
                <span className="sep">·</span>
                <span>
                  {numberedCount} {unitCap.toLowerCase()}
                  {numberedCount === 1 ? '' : 's'}
                </span>
                <span className="sep">·</span>
                <span>{fmtRuntime(totalRuntime)}</span>
                {ep.duration_seconds ? (
                  <>
                    <span className="sep">·</span>
                    <span>{fmtTime(ep.duration_seconds)}</span>
                  </>
                ) : null}
              </span>
            </div>
            <h1 className="hero-title">{ep.title}</h1>
            {ep.description ? (
              <p className="hero-desc">{ep.description}</p>
            ) : null}
            <div className="hero-actions">
              <button
                className="abtn play"
                type="button"
                onClick={() => void playLesson(ep)}
              >
                <span className="play">
                  <Glyph d={SF.play} size={15} fill="currentColor" />
                </span>{' '}
                {playLabel} {unitCap} {epN}
              </button>
              <button
                className="abtn glass"
                type="button"
                onClick={() => setOverviewFor(ep)}
              >
                <Glyph d={SF.doc} size={18} stroke={1.9} /> Overview
              </button>
              <div className="icon-row">
                <button
                  className={`icon-glass ${isBookmarked ? 'on' : ''}`}
                  type="button"
                  aria-label="Bookmark lesson"
                  onClick={() => toggleBookmark(ep)}
                >
                  <Glyph
                    d={SF.bookmark}
                    size={19}
                    fill={isBookmarked ? 'currentColor' : 'none'}
                    stroke={isBookmarked ? 0 : 2}
                  />
                </button>
                {commentsVisible && (
                  <button
                    className="icon-glass"
                    type="button"
                    aria-label="Discussion"
                    onClick={() => setShowComments(true)}
                  >
                    <Glyph d={SF.bubble} size={19} stroke={2} />
                    {comments.length > 0 && (
                      <span className="icon-badge">{comments.length}</span>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="cv-progress">
              <div className="cv-pt">
                <span>Your progress</span>
                <span>
                  {lessonsDone} of {progressTotal}
                </span>
              </div>
              <div className="cv-pbar">
                <i
                  style={{
                    width: `${
                      progressTotal
                        ? Math.round((lessonsDone / progressTotal) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              {resetLink}
            </div>
          </div>
        ) : (
          <>
            <div className="panel-title">
              <div
                className={`pt-kicker ${status === 'watched' ? 'done' : ''}`}
              >
                {kicker}
              </div>
              <h1 className="pt-h">{ep.title}</h1>
            </div>

            <div className="band">
              <div className="band-actions">
                <button
                  className="abtn play"
                  type="button"
                  onClick={() => void playLesson(ep)}
                >
                  <Glyph d={SF.play} size={17} fill="currentColor" />{' '}
                  {playLabel} {epLabel}
                </button>
                <button
                  className="abtn glass"
                  type="button"
                  onClick={() => setOverviewFor(ep)}
                >
                  <Glyph d={SF.doc} size={18} stroke={1.9} /> Overview
                </button>
                <div className="icon-row">
                  <button
                    className={`icon-glass ${isBookmarked ? 'on' : ''}`}
                    type="button"
                    aria-label="Bookmark lesson"
                    onClick={() => toggleBookmark(ep)}
                  >
                    <Glyph
                      d={SF.bookmark}
                      size={19}
                      fill={isBookmarked ? 'currentColor' : 'none'}
                      stroke={isBookmarked ? 0 : 2}
                    />
                  </button>
                  {commentsVisible && (
                    <button
                      className="icon-glass"
                      type="button"
                      aria-label="Discussion"
                      onClick={() => setShowComments(true)}
                    >
                      <Glyph d={SF.bubble} size={19} stroke={2} />
                      {comments.length > 0 && (
                        <span className="icon-badge">{comments.length}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="band-desc">
                <p className="bd-text">{ep.description ?? ''}</p>
                <div className="bd-meta">
                  <span style={courseTitleStyle}>{course.title}</span>
                  &nbsp;&nbsp;·&nbsp;&nbsp;{lessons.length}{' '}
                  {unitCap.toLowerCase()}
                  {lessons.length === 1 ? '' : 's'}&nbsp;&nbsp;·&nbsp;&nbsp;
                  {fmtRuntime(totalRuntime)}
                  {ep.duration_seconds
                    ? `  ·  ${fmtTime(ep.duration_seconds)}`
                    : ''}
                </div>
              </div>

              <div className="band-cast">
                <div className="bc-row">
                  {(() => {
                    // Prefer the course-scoped instructor avatar (cropped in the
                    // landing editor); fall back to the org avatar.
                    const av =
                      course.landing_overrides?.instructor_avatar_url ??
                      organization.avatar_url
                    return av ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="bc-av"
                        src={av}
                        alt={course.instructor_name ?? organization.name}
                      />
                    ) : (
                      <div className="bc-av" />
                    )
                  })()}
                  <div>
                    <div className="bc-k">Instructor</div>
                    <div className="bc-v">
                      {course.instructor_name ?? organization.name}
                    </div>
                  </div>
                </div>
                {/* Use the SAME AI-written instructor byline the landing/portal
                    marquee shows (landing_overrides.ai_hero.byline). Editing it
                    on the landing updates it here too; fall back to the raw
                    onboarding bio only when no AI byline exists. */}
                {(course.landing_overrides?.ai_hero?.byline ||
                  course.instructor_bio) && (
                  <div className="bc-sub">
                    {course.landing_overrides?.ai_hero?.byline ||
                      course.instructor_bio}
                  </div>
                )}
                <div className="bc-progress">
                  <div className="bc-pt">
                    <span>Your progress</span>
                    <span>
                      {lessonsDone} of {progressTotal}
                    </span>
                  </div>
                  <div className="bc-pbar">
                    <i
                      style={{
                        width: `${
                          progressTotal
                            ? Math.round((lessonsDone / progressTotal) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  {resetLink}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════ mobile hero — the landing's cinematic treatment, shared by
           both hero variants (streaming-app detail page): full-bleed course
           cover, a centered stack at the bottom — course title in the
           creator's Title Style, meta line, a white "Play Lesson N" pill
           with a round overview button beside it — then progress.
           WatchPageStyles shows this ≤720px and hides the desktop blocks. ════ */}
        {course.thumbnail_url && (
          <div
            className="m-hero-art"
            aria-hidden
            style={{
              backgroundImage: `url("${course.thumbnail_url}")`,
              ...(course.thumbnail_object_position
                ? { backgroundPosition: course.thumbnail_object_position }
                : null),
            }}
          />
        )}
        <div className="m-hero">
          <div className={`pt-kicker ${status === 'watched' ? 'done' : ''}`}>
            {kicker}
          </div>
          <h1 className="m-hero-title" style={courseTitleStyle}>
            {course.title}
          </h1>
          <div className="m-hero-meta">
            {course.landing_overrides?.ai_hero?.eyebrow || (
              <>
                {numberedCount} {unitCap.toLowerCase()}
                {numberedCount === 1 ? '' : 's'} · {fmtRuntime(totalRuntime)}
              </>
            )}
          </div>
          <div className="m-hero-actions">
            <div className="m-hero-cta">
              <button
                className="abtn play"
                type="button"
                onClick={() => void playLesson(ep)}
              >
                <Glyph d={SF.play} size={15} fill="currentColor" /> {playLabel}{' '}
                {epLabel}
              </button>
              <button
                className="m-hero-ov"
                type="button"
                aria-label="Lesson overview"
                onClick={() => setOverviewFor(ep)}
              >
                <Glyph d={SF.doc} size={19} stroke={1.9} />
              </button>
            </div>
            <div className="m-hero-next">{ep.title}</div>
            <div className="m-hero-row">
              <button
                className={`icon-glass ${isBookmarked ? 'on' : ''}`}
                type="button"
                aria-label="Bookmark lesson"
                onClick={() => toggleBookmark(ep)}
              >
                <Glyph
                  d={SF.bookmark}
                  size={19}
                  fill={isBookmarked ? 'currentColor' : 'none'}
                  stroke={isBookmarked ? 0 : 2}
                />
              </button>
              {commentsVisible && (
                <button
                  className="icon-glass"
                  type="button"
                  aria-label="Discussion"
                  onClick={() => setShowComments(true)}
                >
                  <Glyph d={SF.bubble} size={19} stroke={2} />
                  {comments.length > 0 && (
                    <span className="icon-badge">{comments.length}</span>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="cv-progress">
            <div className="cv-pt">
              <span>Your progress</span>
              <span>
                {lessonsDone} of {progressTotal}
              </span>
            </div>
            <div className="cv-pbar">
              <i
                style={{
                  width: `${
                    progressTotal
                      ? Math.round((lessonsDone / progressTotal) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            {resetLink}
          </div>
        </div>
      </header>

      {/* ════════ lesson rails — one per season (single flat rail for
          one-season courses and limited series) ════════ */}
      <section className="lessons">
        {(() => {
          const renderRailCard = (
            l: WatchLessonData,
            railN: number,
            numLabel?: string,
          ) => {
            const flatIdx = flatIndexById.get(l.id) ?? 0
            const st = statusOf(l)
            const frac = fractionOf(l)
            const imgStyle =
              l.thumbnail_url || course.thumbnail_url
                ? {
                    backgroundImage: `url("${
                      l.thumbnail_url ?? course.thumbnail_url
                    }")`,
                  }
                : undefined
            // Watched lessons show a FULL progress bar (no check chip /
            // "Watched" label) — the bar sitting at the end tells the story.
            const barFrac = st === 'watched' ? 1 : frac
            const overlays = (
              <>
                {l.locked ? (
                  <div className="lc-state lc-lock">
                    <Glyph d={SF.locksm} size={11} stroke={2.1} />
                  </div>
                ) : null}
                {l.duration_seconds ? (
                  <div className="lc-dur">
                    <ClockGlyph />
                    <span>{fmtTime(l.duration_seconds)}</span>
                  </div>
                ) : null}
                {barFrac != null && (
                  <div className="lc-progbar">
                    <i style={{ width: `${barFrac * 100}%` }} />
                  </div>
                )}
                {!l.locked && (
                  <div className="lc-play">
                    <div className="lc-play-btn">
                      <Glyph d={SF.play} size={18} fill="currentColor" />
                    </div>
                  </div>
                )}
                <button
                  className="lc-ovbtn"
                  type="button"
                  aria-label="Lesson overview"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFocus(flatIdx)
                    setOverviewFor(l)
                  }}
                >
                  <Glyph d={SF.info} size={17} stroke={1.9} />
                </button>
              </>
            )
            const lockedWhen = l.locked
              ? unlockDateLabel(l.locked_until)
              : null
            const meta = l.locked ? (
              <span>{lockedWhen ? `Unlocks ${lockedWhen}` : 'Locked'}</span>
            ) : st === 'watched' ? (
              // No "Watched ✓" affordance — the full progress bar says it.
              <>
                <Glyph d={SF.play2} size={12} fill="currentColor" stroke={0} />
                <span>
                  {l.duration_seconds ? fmtTime(l.duration_seconds) : '—'}
                </span>
              </>
            ) : st === 'progress' ? (
              <span>Continue · {Math.round((frac ?? 0) * 100)}%</span>
            ) : (
              <>
                <Glyph d={SF.play2} size={12} fill="currentColor" stroke={0} />
                <span>
                  {l.duration_seconds ? fmtTime(l.duration_seconds) : '—'}
                </span>
              </>
            )

            if (cardVariant === 'spotlight') {
              return (
                <div
                  className="lc-spot"
                  key={l.id}
                  onMouseEnter={() => setFocus(flatIdx)}
                  onClick={() => void playLesson(l)}
                >
                  <div className={`spot-card ${imgStyle ? '' : 'ph'}`}>
                    {/* Liquid-glass placeholder (landing's .ph-ambient +
                        .glass-tint) — hidden once a still exists. */}
                    <div
                      className="ph-ambient"
                      style={ambientTint(flatIdx + 1)}
                      aria-hidden
                    />
                    <div className="glass-tint" aria-hidden />
                    <div className="img" style={imgStyle} />
                    <div className="spot-shade" />
                    {overlays}
                    <div className="spot-info">
                      <div className="lc-num">
                        {numLabel ?? `${unitCap} ${railN}`}
                        {bookmarks.has(l.id) ? ' · Saved' : ''}
                      </div>
                      <div className="spot-title">{l.title}</div>
                      {l.description && (
                        <div className="spot-desc">{l.description}</div>
                      )}
                      <div className="lc-meta">{meta}</div>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                className="lc-catalog"
                key={l.id}
                onMouseEnter={() => setFocus(flatIdx)}
                onClick={() => void playLesson(l)}
              >
                <div className="lc-card">
                  <div className={`lc-thumb ${imgStyle ? '' : 'ph'}`}>
                    {imgStyle ? (
                      <div className="img" style={imgStyle} />
                    ) : (
                      // The landing's liquid-glass placeholder — never a
                      // portal-only stand-in.
                      <>
                        <div
                          className="ph-ambient"
                          style={ambientTint(flatIdx + 1)}
                          aria-hidden
                        />
                        <div className="glass-tint" aria-hidden />
                      </>
                    )}
                    {overlays}
                  </div>
                  <div className="lc-info">
                    <div className="lc-num">
                      {numLabel ?? `${unitCap} ${railN}`}
                      {bookmarks.has(l.id) ? ' · Saved' : ''}
                    </div>
                    <div className="lc-title">{l.title}</div>
                    <div className="lc-desc">{l.description ?? ''}</div>
                    <div className="lc-meta">{meta}</div>
                  </div>
                </div>
              </div>
            )
          }

          const spot = cardVariant === 'spotlight'

          const rails = seasonRails ? (
            seasonRails.map((r, ri) => {
              const watched = r.items.filter(
                (l) => statusOf(l) === 'watched',
              ).length
              return (
                <div
                  key={r.module.id}
                  style={ri > 0 ? { marginTop: 42 } : undefined}
                >
                  <div className="row-head">
                    <span className="rh">
                      {r.module.title || `Season ${r.index + 1}`}
                    </span>
                    <span className="rh-meta">
                      {r.items.length} lesson
                      {r.items.length === 1 ? '' : 's'}
                      {watched > 0 ? ` · ${watched} watched` : ''}
                    </span>
                  </div>
                  <RailStrip spot={spot}>
                    {r.items.map((l, idx) => renderRailCard(l, idx + 1))}
                  </RailStrip>
                </div>
              )
            })
          ) : (
            <>
              <div className="row-head">
                <span className="rh">{course.title}</span>
                <span className="rh-meta">
                  {railLessons.length} lesson
                  {railLessons.length === 1 ? '' : 's'}
                  {lessonsDone > 0 ? ` · ${lessonsDone} watched` : ''}
                </span>
              </div>
              <RailStrip spot={spot}>
                {railLessons.map((l, i) => renderRailCard(l, i + 1))}
              </RailStrip>
            </>
          )

          // Bonus Content — its own section at the bottom, like Trailers.
          // Cards wear the chosen variant; "Bonus" replaces the number.
          const bonusRail =
            bonusItems.length > 0 ? (
              <div style={{ marginTop: 42 }}>
                <div className="row-head">
                  <span className="rh">Bonus Content</span>
                  <span className="rh-meta">
                    {bonusItems.length} extra
                    {bonusItems.length === 1 ? '' : 's'}
                  </span>
                </div>
                <RailStrip spot={spot}>
                  {bonusItems.map((l, i) => renderRailCard(l, i + 1, 'Bonus'))}
                </RailStrip>
              </div>
            ) : null

          // Mobile shows these SAME rails — swipeable strips, exactly like
          // the landing (scroll-snap does the work; only the hover arrows
          // hide). No separate mobile list.
          return (
            <>
              {rails}
              {bonusRail}
            </>
          )
        })()}

        {/* ════ Trailers — portal-only rail at the very bottom. The card
            wears the SAME variant the creator chose at onboarding (spotlight
            or catalog), exactly like the lesson cards. ════ */}
        {trailerCard && (
          <div style={{ marginTop: 42 }}>
            <div className="row-head">
              <span className="rh">Trailers</span>
            </div>
            <RailStrip spot={cardVariant === 'spotlight'}>
              {trailerCard}
            </RailStrip>
          </div>
        )}

      </section>

      {toastMsg && (
        <div className="toast">
          <span className="tk">
            <Glyph d={SF.check} size={15} stroke={2.6} />
          </span>
          {toastMsg}
        </div>
      )}

      {/* ════════ overlays ════════ */}
      {overviewFor && (
        <OverviewSheet
          lessonN={
            numberedById.get(overviewFor.id) ??
            lessons.findIndex((l) => l.id === overviewFor.id) + 1
          }
          numLabel={bonusIds.has(overviewFor.id) ? 'Bonus' : undefined}
          title={overviewFor.title}
          durLabel={
            overviewFor.duration_seconds
              ? fmtTime(overviewFor.duration_seconds)
              : null
          }
          instructorName={course.instructor_name ?? organization.name}
          imageUrl={overviewFor.thumbnail_url ?? course.thumbnail_url}
          locked={overviewFor.locked}
          unlockLabel={
            unlockDateLabel(overviewFor.locked_until)
              ? `Unlocks ${unlockDateLabel(overviewFor.locked_until)}`
              : undefined
          }
          dark={dark}
          overview={lessonOverview(overviewFor)}
          onClose={() => setOverviewFor(null)}
          onPlay={() => {
            const l = overviewFor
            setOverviewFor(null)
            void playLesson(l)
          }}
        />
      )}

      {showComments && !playing && (
        <CommentsPanel
          lessonLabel={`${epLabel} · ${ep.title}`}
          comments={comments}
          viewerAvatarUrl={data.customer_avatar_url}
          dark={dark}
          canModerate={viewerIsInstructor}
          instructorName={course.instructor_name ?? organization.name}
          onClose={() => setShowComments(false)}
          onLike={onLikeComment}
          onPost={commentsVisible ? postComment : undefined}
          onDelete={onDeleteComment}
          onPin={viewerIsInstructor ? onPinComment : undefined}
          onHeart={viewerIsInstructor ? onHeartComment : undefined}
        />
      )}

      {/* Trailer overlay — plays the course trailer in the same full
          player, standalone (no playlist, no progress). */}
      {trailerPlaying && !playing && course.trailer_url && (
        <WatchPlayer
          key="trailer"
          lesson={{
            n: 0,
            title: 'Trailer',
            kicker: 'Trailer',
            muxPlaybackId: null,
            playbackUrl: course.trailer_url,
            thumbnailUrl: course.thumbnail_url,
          }}
          courseTitle={course.title ?? ''}
          instructorName={course.instructor_name ?? organization.name}
          onClose={() => setTrailerPlaying(false)}
        />
      )}

      {playing && (
        <WatchPlayer
          // Remount per lesson so playback state (time, completion latch,
          // start-position seek) never leaks across in-player navigation.
          key={playing.lesson.id}
          playlist={playerPlaylist}
          currentId={playing.lesson.id}
          onSelectLesson={selectFromPlayer}
          unitLabel={unitCap}
          ctaVariant={heroVariant}
          lesson={{
            n: lessons.findIndex((l) => l.id === playing.lesson.id) + 1,
            title: playing.lesson.title,
            description: playing.lesson.description,
            thumbnailUrl: playing.lesson.thumbnail_url,
            muxPlaybackId: playing.playbackId,
            playbackUrl: playing.playbackUrl,
            storyboardUrl: playing.storyboardUrl,
          }}
          courseTitle={course.title ?? ''}
          instructorName={course.instructor_name ?? organization.name}
          startSec={playing.startSec}
          comments={commentsVisible ? comments : undefined}
          canModerateComments={viewerIsInstructor}
          onPostComment={commentsVisible ? postComment : undefined}
          onLikeComment={onLikeComment}
          onDeleteComment={onDeleteComment}
          onPinComment={viewerIsInstructor ? onPinComment : undefined}
          onHeartComment={viewerIsInstructor ? onHeartComment : undefined}
          onClose={() => {
            // The player fires a final onProgress right before closing —
            // push that position to the server immediately.
            flushPendingSync()
            setPlaying(null)
            onPlayerClose?.()
          }}
          onProgress={(f) => onPlayerProgress(playing.lesson.id, f)}
          onComplete={() => onPlayerComplete(playing.lesson.id)}
        />
      )}

      <WatchPageStyles />
      {/* The overview sheet + comments panel are styled by WatchStyles
          (.sov2), which normally mounts with the player. When either opens
          straight from the course page — no player — the styles must come
          along, or the sheet renders unstyled at the bottom of the document
          (invisible on phones without scrolling). */}
      {(overviewFor || (showComments && !playing)) && <WatchStyles />}
    </div>
  )
}

// One horizontal card strip with its own scroll state and hover arrows —
// each season rail (and the Trailers rail) gets an independent instance.
function RailStrip({
  spot,
  children,
}: {
  spot: boolean
  children: React.ReactNode
}) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const updateArrows = useCallback(() => {
    const s = stripRef.current
    if (!s) return
    setCanPrev(s.scrollLeft > 2)
    setCanNext(s.scrollLeft < s.scrollWidth - s.clientWidth - 2)
  }, [])
  useEffect(() => {
    updateArrows()
    window.addEventListener('resize', updateArrows)
    return () => window.removeEventListener('resize', updateArrows)
  }, [updateArrows])
  const scrollBy = (dir: number) =>
    stripRef.current?.scrollBy({
      left: dir * stripRef.current.clientWidth,
      behavior: 'smooth',
    })
  return (
    <div className="strip-wrap" onMouseEnter={updateArrows}>
      <button
        className={`arrow prev ${canPrev ? 'show' : ''}`}
        type="button"
        aria-label="Previous"
        onClick={() => scrollBy(-1)}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 5l-6.5 7 6.5 7" />
        </svg>
      </button>
      <button
        className={`arrow next ${canNext ? 'show' : ''}`}
        type="button"
        aria-label="Next"
        onClick={() => scrollBy(1)}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.5 5l6.5 7-6.5 7" />
        </svg>
      </button>
      <div
        className={`grid ${spot ? 'spot-rail' : ''}`}
        ref={stripRef}
        onScroll={updateArrows}
      >
        {children}
      </div>
    </div>
  )
}

export default WatchHome

'use client'

// PublicPortalView — the public course page IS the portal now. Renders
// GeneratedPortalPage (the surface composed 1:1 from the course-page
// designs) with real behavior wired in:
//
//   • hero_variant / lesson_card_variant / trial_mode / format → layout
//   • landing_overrides.ai_hero → the AI-written hero copy
//   • landing_overrides.theme_mode → the creator's light/dark choice
//   • per-lesson thumbnails when they exist; the designs' liquid-glass
//     placeholder otherwise — NEVER the cover photo smeared on tiles
//   • sample payload (when configured + ready) → playable Free Sample screen
//   • free-preview lessons play inline (Mux); locked tiles → checkout
//   • enrolled visitors are pointed at their portal

import type {
  CourseLandingLesson,
  CourseLandingPageData,
} from '@/hooks/queries/courses'
import { api } from '@/utils/client'
import { CONFIG } from '@/utils/config'
import { schemas } from '@spaire/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '../Toast/use-toast'
import { formatProductPrice } from './courseLandingPrice'
import {
  GeneratedPortalPage,
  type GeneratedGroup,
} from './editor/GeneratedPortalPage'
import { WatchPlayer } from './watch/WatchPlayer'

type PlayingClip = {
  title: string
  trailer?: boolean
}

// Anonymous viewing progress for the landing's free preview — localStorage,
// per course. The portal uses server-side enrollment progress; visitors who
// haven't bought yet still get Resume + per-lesson progress here.
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

function fmtRuntime(secs?: number | null): string {
  const s = secs ?? 0
  if (s <= 0) return '0 min'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export function PublicPortalView({
  organization,
  product,
  landing,
}: {
  organization: schemas['Organization']
  product: schemas['ProductStorefront']
  landing: CourseLandingPageData
}) {
  const isEpisodic = landing.format === 'series'
  const unit = isEpisodic ? 'episode' : 'lesson'
  const unitCap = isEpisodic ? 'Episode' : 'Lesson'
  const metaDuration = fmtRuntime(landing.total_duration_seconds)
  const heroVariant = landing.hero_variant ?? 'cover'
  const cardVariant = landing.lesson_card_variant ?? 'catalog'
  const trialMode = landing.trial_mode ?? 'free_preview'
  const hasAccess = landing.has_access
  const paywallEnabled = (landing.paywall_enabled ?? false) && !hasAccess

  const priceLabel =
    formatProductPrice(product as unknown as schemas['Product']) || 'Free'
  // Free is a property of the PRODUCT, never of the paywall toggle. A paid
  // course with the paywall off means every lesson is watchable before
  // purchase — checkout still charges the real price, so the page must
  // never promise "Enroll Free".
  const isFreeProduct = priceLabel === 'Free'
  // Paywall off → nothing is locked; any lesson with playback is previewable.
  const allLessonsOpen = !(landing.paywall_enabled ?? false)
  const recurring = (
    product as unknown as { prices?: { type?: string }[] }
  ).prices?.some((p) => p.type === 'recurring')

  // ── Checkout (mirrors the enroll flow the old landing used) ──────────────
  const [enrolling, setEnrolling] = useState(false)
  const enroll = useCallback(async () => {
    if (enrolling) return
    setEnrolling(true)
    try {
      const { data: checkout, error } = await api.POST(
        '/v1/checkouts/client/',
        { body: { product_id: product.id } },
      )
      if (error || !checkout?.client_secret) {
        toast({
          title: 'Could not start checkout',
          description: 'Please try again in a moment.',
        })
        return
      }
      window.location.href = `${CONFIG.FRONTEND_BASE_URL}/checkout/${checkout.client_secret}?theme=light`
    } finally {
      setEnrolling(false)
    }
  }, [enrolling, product.id])

  const goToPortal = useCallback(() => {
    window.location.href = `/${organization.slug}/portal/courses/${landing.id}`
  }, [organization.slug, landing.id])

  // ── Playback — both lessons AND the trailer open the v2 WatchPlayer, so
  //    the trailer gets the same full controls students get in the portal
  //    (just no discussion / lessons list). `playing` tracks the trailer. ──
  const [playing, setPlaying] = useState<PlayingClip | null>(null)
  const [watching, setWatching] = useState<CourseLandingLesson | null>(null)
  // Server-minted (signed) HLS URL for the lesson currently in the player.
  // Once assets use the signed playback policy, a URL built from the bare
  // playback id 403s — so every free-preview play asks the API for a real
  // URL first (which also counts the view against the org's quota).
  const [watchingUrl, setWatchingUrl] = useState<string | null>(null)
  const [watchingStoryboard, setWatchingStoryboard] = useState<string | null>(
    null,
  )
  const openWatch = useCallback(
    async (lesson: CourseLandingLesson) => {
      let url: string | null = null
      let storyboard: string | null = null
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/courses/${landing.id}/lessons/${lesson.id}/preview-playback-url`,
          { method: 'POST', credentials: 'include' },
        )
        if (res.ok) {
          const data = (await res.json()) as {
            mux_playback_url?: string | null
            mux_storyboard_url?: string | null
          }
          url = data.mux_playback_url ?? null
          storyboard = data.mux_storyboard_url ?? null
        }
      } catch {
        // Fall back to the public playback-id URL below (works for public
        // assets; signed ones surface the player's error state).
      }
      setWatchingUrl(url)
      setWatchingStoryboard(storyboard)
      setWatching(lesson)
    },
    [landing.id],
  )
  // In-player lesson list for the landing. Lessons the visitor can't
  // preview (paywalled, no processed video, or not a video at all) are
  // marked locked: the player's prev/next and Up Next skip them, and the
  // lessons sheet shows them locked — which is the enroll pitch.
  const previewPlaylist = useMemo(
    () =>
      landing.lessons.map((l, i) => ({
        id: l.id,
        n: i + 1,
        title: l.title,
        durationSeconds: l.duration_seconds,
        thumbnailUrl: l.thumbnail_url,
        locked:
          !l.mux_playback_id ||
          l.content_type !== 'video' ||
          !(l.is_free_preview || allLessonsOpen),
        watched: false,
      })),
    [landing.lessons, allLessonsOpen],
  )
  const selectFromPlayer = useCallback(
    (lessonId: string) => {
      const l = landing.lessons.find((x) => x.id === lessonId)
      if (l) void openWatch(l)
    },
    [landing.lessons, openWatch],
  )

  const [watchState, setWatchState] = useState<WatchState>({
    p: {},
    done: [],
  })
  useEffect(() => {
    setWatchState(readWatchState(landing.id))
  }, [landing.id])

  const lessonNumber = useCallback(
    (lesson: CourseLandingLesson) =>
      landing.lessons.findIndex((l) => l.id === lesson.id) + 1,
    [landing.lessons],
  )

  const isLocked = useCallback(
    (l: CourseLandingLesson) =>
      !hasAccess && (landing.paywall_enabled ?? false) && !l.is_free_preview,
    [hasAccess, landing.paywall_enabled],
  )

  const onLessonSelect = useCallback(
    (lesson: CourseLandingLesson) => {
      if (hasAccess) {
        goToPortal()
        return
      }
      if (!isLocked(lesson) && lesson.mux_playback_id) {
        void openWatch(lesson)
        return
      }
      void enroll()
    },
    [hasAccess, goToPortal, isLocked, enroll, openWatch],
  )

  const onWatchProgress = useCallback(
    (lessonId: string, frac: number) => {
      setWatchState((s) => {
        if (s.done.includes(lessonId)) return s
        const next = { ...s, p: { ...s.p, [lessonId]: frac } }
        writeWatchState(landing.id, next)
        return next
      })
    },
    [landing.id],
  )
  const onWatchComplete = useCallback(
    (lessonId: string) => {
      setWatchState((s) => {
        const p = { ...s.p }
        delete p[lessonId]
        const next = {
          p,
          done: s.done.includes(lessonId) ? s.done : [...s.done, lessonId],
        }
        writeWatchState(landing.id, next)
        return next
      })
    },
    [landing.id],
  )

  // ── Labels — same vocabulary the wizard preview used ─────────────────────
  const freeCount = useMemo(
    () => landing.lessons.filter((l) => l.is_free_preview).length,
    [landing.lessons],
  )
  const cadence = recurring ? 'cancel anytime' : 'one-time purchase'
  const enrollPriceSub = isFreeProduct
    ? `${landing.lesson_count} ${unit}${landing.lesson_count === 1 ? '' : 's'} · Free`
    : recurring
      ? `Subscription · ${landing.lesson_count} ${unit}${landing.lesson_count === 1 ? '' : 's'} · cancel anytime`
      : `One-time purchase · ${landing.lesson_count} ${unit}${landing.lesson_count === 1 ? '' : 's'} · Lifetime access`
  const sample = landing.sample
  const samplePlayable = Boolean(sample?.mux_playback_id)

  // The landing payload no longer embeds the sample clip's playback URL (so it
  // isn't handed to every visitor/crawler unmetered). Mint it on demand the
  // first time the clip plays; the server counts the view against the org's
  // quota, like any lesson playback.
  const onRequestSampleUrl = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/courses/${landing.id}/sample/playback-url`,
        { method: 'POST', credentials: 'include' },
      )
      if (!res.ok) return null
      const data = (await res.json()) as { mux_playback_url?: string | null }
      return data.mux_playback_url ?? null
    } catch {
      return null
    }
  }, [landing.id])

  // Resume target — the free-preview lesson the visitor is mid-way through
  // (anonymous progress); drives both the hero label and where Play starts.
  const resumeLesson = useMemo(() => {
    return (
      landing.lessons.find(
        (l) =>
          (l.is_free_preview || allLessonsOpen) &&
          l.mux_playback_id &&
          !watchState.done.includes(l.id) &&
          (watchState.p[l.id] ?? 0) > 0.01,
      ) ?? null
    )
  }, [landing.lessons, watchState, allLessonsOpen])

  const playLabel = hasAccess
    ? 'Continue Watching'
    : resumeLesson
      ? `Resume ${unitCap} ${lessonNumber(resumeLesson)}`
      : isFreeProduct || allLessonsOpen
        ? 'Start Watching'
        : trialMode === 'lesson_sample'
          ? 'Play Sample'
          : freeCount > 0
            ? `Play ${unitCap} 1 Free`
            : 'Watch Preview'
  const buyLabel = hasAccess
    ? 'Open Portal'
    : isFreeProduct
      ? 'Enroll Free'
      : recurring
        ? `Subscribe — ${priceLabel}`
        : `Buy — ${priceLabel}`
  const freeLineDefault = hasAccess
    ? 'You own this Original'
    : isFreeProduct
      ? 'Free for everyone'
      : allLessonsOpen
        ? `All ${unit}s free to watch · ${cadence}`
        : trialMode === 'lesson_sample'
          ? `Sample clip free · ${cadence}`
          : freeCount > 0
            ? `${freeCount} ${unit}${freeCount === 1 ? '' : 's'} free · ${cadence}`
            : cadence

  // Sample playback is INLINE on the sample screen (clip-windowed,
  // scroll-aware) — handled inside GeneratedPortalPage via the
  // samplePlayback* props + playStartsSample. No lightbox for it.
  const onPlay = useCallback(() => {
    if (hasAccess) {
      goToPortal()
      return
    }
    const target =
      resumeLesson ??
      landing.lessons.find(
        (l) =>
          (l.is_free_preview || allLessonsOpen) &&
          l.mux_playback_id &&
          !watchState.done.includes(l.id),
      ) ??
      landing.lessons.find(
        (l) => (l.is_free_preview || allLessonsOpen) && l.mux_playback_id,
      )
    if (target) void openWatch(target)
    else void enroll()
  }, [
    hasAccess,
    goToPortal,
    resumeLesson,
    landing.lessons,
    watchState.done,
    allLessonsOpen,
    enroll,
    openWatch,
  ])

  const onBuy = useCallback(() => {
    if (hasAccess) goToPortal()
    else void enroll()
  }, [hasAccess, goToPortal, enroll])

  const onTrailer = useCallback(() => {
    if (landing.trailer_url) {
      setPlaying({ title: landing.title ?? 'Trailer', trailer: true })
    } else {
      onPlay()
    }
  }, [landing.trailer_url, landing.title, onPlay])

  // ── AI hero copy — prefer ai_hero over the creator's raw description ─────
  const aiHero = landing.landing_overrides?.ai_hero ?? null
  // Creator-edited price note wins over the computed default (owners keep
  // the ownership line — the note is about buying).
  const freeLine = hasAccess
    ? freeLineDefault
    : (aiHero as { free_line?: string | null } | null)?.free_line ||
      freeLineDefault
  const heroDesc = aiHero?.description || landing.description || ''
  const heroByline = aiHero?.byline || landing.instructor_bio || ''
  const heroEyebrow = aiHero?.eyebrow || ''
  const heroBadge = aiHero?.badge || (isEpisodic ? 'New Series' : 'New Course')
  const heroTitleLines =
    aiHero?.titleLines && aiHero.titleLines.length > 0
      ? aiHero.titleLines
      : null

  // The creator's persisted theme choice drives the public page.
  const dark = landing.landing_overrides?.theme_mode === 'dark'
  const aiInstructor = landing.landing_overrides?.ai_instructor ?? null
  const aiFaq = landing.landing_overrides?.ai_faq ?? []
  const portraitUrl = landing.landing_overrides?.portrait_url ?? null
  const badges = landing.landing_overrides?.badges ?? undefined

  // Match the document background to the page theme and kill overscroll
  // bounce — otherwise rubber-banding past the top/bottom flashes the
  // browser's white canvas behind the dark page (desktop and mobile).
  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const bg = dark ? '#141416' : '#ffffff'
    const prev = {
      rootBg: root.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      rootOver: root.style.overscrollBehaviorY,
      bodyOver: body.style.overscrollBehaviorY,
    }
    root.style.backgroundColor = bg
    body.style.backgroundColor = bg
    root.style.overscrollBehaviorY = 'none'
    body.style.overscrollBehaviorY = 'none'
    return () => {
      root.style.backgroundColor = prev.rootBg
      body.style.backgroundColor = prev.bodyBg
      root.style.overscrollBehaviorY = prev.rootOver
      body.style.overscrollBehaviorY = prev.bodyOver
    }
  }, [dark])

  // ── Groups — per-lesson media only; placeholder otherwise ────────────────
  const flatLessons = landing.lessons
  const groups: GeneratedGroup[] = useMemo(() => {
    const toGenerated = (l: CourseLandingLesson, flatIdx: number) => ({
      id: l.id,
      title: l.title,
      description: l.description ?? '',
      flatIdx,
      imageUrl: l.thumbnail_url ?? null,
      // Apply the creator's saved thumbnail crop. The editor preview
      // (CourseDesignEditor) always passed this through, but the real
      // visitor-facing mapper dropped it — so a repositioned thumbnail
      // looked right in the studio and rendered at the default crop for
      // every visitor.
      imagePosition: l.thumbnail_object_position ?? null,
      // Phone-only crop from the phone canvas; the mobile stylesheet
      // applies it at ≤640px, falling back to the desktop crop.
      imagePositionMobile:
        landing.landing_overrides?.lesson_pos_m?.[l.id] ?? null,
      durationLabel: l.duration_seconds
        ? `${Math.max(1, Math.round(l.duration_seconds / 60))}m`
        : null,
      free: !isLocked(l),
      locked: isLocked(l),
    })
    if (isEpisodic || !landing.modules?.length) {
      return [{ title: null, lessons: flatLessons.map(toGenerated) }]
    }
    const byModule = new Map<string, CourseLandingLesson[]>()
    for (const l of flatLessons) {
      const key = l.module_id ?? 'unknown'
      if (!byModule.has(key)) byModule.set(key, [])
      byModule.get(key)!.push(l)
    }
    const out: GeneratedGroup[] = []
    let flatIdx = 0
    for (const m of [...landing.modules].sort(
      (a, b) => a.position - b.position,
    )) {
      const lessons = byModule.get(m.id)
      if (lessons?.length) {
        out.push({
          title: m.title,
          lessons: lessons.map((l) => toGenerated(l, flatIdx++)),
        })
      }
      byModule.delete(m.id)
    }
    for (const lessons of byModule.values()) {
      if (lessons.length) {
        out.push({
          title: null,
          lessons: lessons.map((l) => toGenerated(l, flatIdx++)),
        })
      }
    }
    return out
  }, [
    isEpisodic,
    landing.modules,
    flatLessons,
    isLocked,
    landing.landing_overrides?.lesson_pos_m,
  ])

  const flatForClick = useMemo(() => groups.flatMap((g) => g.lessons), [groups])
  const onLessonClick = useCallback(
    (flatIdx: number) => {
      const gen = flatForClick.find((l) => l.flatIdx === flatIdx)
      if (!gen) return
      // Resolve by id, not title — two lessons can share a title, which used
      // to open the wrong one. Fall back to title only if id is missing.
      const lesson =
        flatLessons.find((l) => l.id === gen.id) ??
        flatLessons.find((l) => l.title === gen.title)
      if (lesson) onLessonSelect(lesson)
    },
    [flatForClick, flatLessons, onLessonSelect],
  )

  return (
    <div className="gpp-fullbleed" data-gpp-fullbleed>
      <GeneratedPortalPage
        brand=""
        title={landing.title ?? product.name}
        titleLines={heroTitleLines}
        eyebrow={heroEyebrow}
        badge={heroBadge}
        desc={heroDesc}
        byline={heroByline}
        instructorName={landing.instructor_name ?? organization.name ?? ''}
        heroVariant={heroVariant}
        cardVariant={cardVariant}
        structure={isEpisodic ? 'episodic' : 'modules'}
        trialMode={trialMode}
        paywallEnabled={paywallEnabled}
        freeLessons={freeCount}
        playLabel={playLabel}
        buyLabel={buyLabel}
        freeLine={freeLine}
        coverUrl={landing.thumbnail_url}
        coverPosition={landing.thumbnail_object_position}
        coverPositionMobile={landing.landing_overrides?.hero_cover_pos_m ?? null}
        heroTitleWidth={landing.landing_overrides?.hero_title_width ?? null}
        heroDescWidth={landing.landing_overrides?.hero_desc_width ?? null}
        heroTitleWidthMobile={
          landing.landing_overrides?.hero_title_width_m ?? null
        }
        heroDescWidthMobile={
          landing.landing_overrides?.hero_desc_width_m ?? null
        }
        heroTitleFont={landing.landing_overrides?.hero_title_font ?? null}
        trailerUrl={landing.trailer_url ?? null}
        sampleImageUrl={sample?.thumbnail_url ?? null}
        samplePlayable={samplePlayable}
        onRequestSampleUrl={onRequestSampleUrl}
        sectionVisible={landing.landing_overrides?.visible}
        samplePlaybackId={sample?.mux_playback_id ?? null}
        samplePlaybackUrl={sample?.mux_playback_url ?? null}
        sampleStart={sample?.start_seconds ?? 0}
        sampleDuration={sample?.duration_seconds ?? 0}
        playStartsSample={
          !hasAccess && trialMode === 'lesson_sample' && samplePlayable
        }
        avatarUrl={
          landing.landing_overrides?.instructor_avatar_url ??
          organization.avatar_url ??
          null
        }
        instructorSub={aiInstructor?.sub ?? ''}
        instructorBio={aiInstructor?.bio ?? []}
        portraitUrl={portraitUrl}
        portraitPosition={
          landing.landing_overrides?.portrait_object_position ?? null
        }
        portraitPositionMobile={
          landing.landing_overrides?.portrait_pos_m ?? null
        }
        portraitCaption={aiInstructor?.caption ?? ''}
        faq={aiFaq}
        badges={badges}
        groups={groups}
        lessonCount={landing.lesson_count}
        metaDuration={metaDuration}
        enrollPriceSub={enrollPriceSub}
        unit={unit}
        dark={dark}
        showTrailerButton={
          !!landing.trailer_url ||
          (trialMode === 'lesson_sample' && samplePlayable)
        }
        onPlay={onPlay}
        onBuy={enrolling ? undefined : onBuy}
        onTrailer={onTrailer}
        onLessonClick={onLessonClick}
      />

      {/* Trailer — plays in the SAME full-featured player students get in the
          portal (scrub preview, speed, volume, fullscreen, PiP, captions),
          just without discussion/lessons since a trailer is standalone. The
          old bare <video autoPlay> lightbox couldn't reliably play on mobile;
          WatchPlayer's tap-to-play + real controls fix that. */}
      {playing?.trailer && landing.trailer_url && (
        <WatchPlayer
          key="trailer"
          lesson={{
            n: 0,
            title: 'Trailer',
            kicker: 'Trailer',
            muxPlaybackId: null,
            playbackUrl: landing.trailer_url,
            thumbnailUrl: landing.thumbnail_url,
          }}
          courseTitle={landing.title ?? product.name}
          instructorName={landing.instructor_name}
          onClose={() => setPlaying(null)}
        />
      )}

      {/* v2 WatchPlayer — free-preview lessons, with anonymous progress
          (Resume + completion) persisted per course in localStorage. */}
      {watching && (
        <WatchPlayer
          // Keyed by lesson so Up Next's swap is a clean remount.
          key={watching.id}
          lesson={{
            n: lessonNumber(watching),
            title: watching.title,
            description: watching.description,
            thumbnailUrl: watching.thumbnail_url,
            muxPlaybackId: watching.mux_playback_id,
            playbackUrl: watchingUrl,
            storyboardUrl: watchingStoryboard,
          }}
          courseTitle={landing.title ?? product.name}
          instructorName={landing.instructor_name}
          startSec={
            (watchState.p[watching.id] ?? 0) * (watching.duration_seconds ?? 0)
          }
          onClose={() => setWatching(null)}
          onProgress={(frac) => onWatchProgress(watching.id, frac)}
          onComplete={() => onWatchComplete(watching.id)}
          playlist={previewPlaylist}
          currentId={watching.id}
          onSelectLesson={selectFromPlayer}
          unitLabel={unitCap}
          ctaVariant={heroVariant === 'marquee' ? 'marquee' : 'cover'}
        />
      )}

      {/* Full-bleed escape — the storefront layout frames content in a
          padded max-width column; the course page owns the whole viewport.
          The horizontal breakout is self-contained (no ancestor knowledge);
          `:has()` zeroes the wrapper's vertical padding so the hero also
          reaches the top. `overflow-x: clip` on body absorbs the 100vw vs
          scrollbar-width difference without breaking sticky positioning. */}
      <style jsx global>{`
        body:has([data-gpp-fullbleed]) {
          overflow-x: clip;
        }
        .gpp-fullbleed {
          width: 100vw;
          position: relative;
          left: 50%;
          right: 50%;
          margin-left: -50vw;
          margin-right: -50vw;
        }
        /* Collapse the storefront column's own vertical spacing around the
           page so the hero starts at the very top AND the dark page reaches
           the very bottom — otherwise the column's light background shows
           through its leftover bottom padding (the "white strip" under the
           FAQ in dark mode). */
        :has(> [data-gpp-fullbleed]),
        :has(> div > [data-gpp-fullbleed]),
        :has(> main > div > [data-gpp-fullbleed]),
        :has(> div > main > div > [data-gpp-fullbleed]) {
          padding-top: 0 !important;
          margin-top: 0 !important;
          padding-bottom: 0 !important;
          margin-bottom: 0 !important;
        }
      `}</style>
    </div>
  )
}

export default PublicPortalView

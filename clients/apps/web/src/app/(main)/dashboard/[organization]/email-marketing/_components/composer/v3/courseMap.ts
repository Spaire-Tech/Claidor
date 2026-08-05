// Brick 15 — map a real Polar course (CourseRead) onto the editor's CourseData.
// Pure (type-only import of CourseRead) so it's unit-testable in isolation.

import type { CourseRead } from '@/hooks/queries/courses'

import {
  formatDuration,
  totalDurationOf,
  type CourseData,
} from './courseData'

// A poster frame for a Mux video. The course's video (trailer / lessons) lives
// in Mux, not S3, so its still image is rendered by Mux's image service from a
// playback id — there is no S3 object to point at.
export function muxPoster(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?width=1280&fit_mode=preserve`
}

// The trailer's still: prefer a real Mux poster. `trailer_url` may already be a
// full image URL (use it), or a bare Mux playback id (build the poster). Failing
// that, the first video lesson's Mux playback id gives us a representative frame.
// Only as a last resort do we reuse the S3 cover thumbnail.
export function deriveTrailerPoster(c: CourseRead): string | null {
  const t = c.trailer_url
  if (t) {
    if (/^https?:\/\//i.test(t)) return t
    return muxPoster(t)
  }
  const lessons = c.modules.flatMap((m) => m.lessons)
  const firstVideo = lessons.find((l) => l.mux_playback_id)
  if (firstVideo?.mux_playback_id) return muxPoster(firstVideo.mux_playback_id)
  return c.thumbnail_url ?? null
}

// The Mux playback id behind the trailer, for inline playback in the editor.
// A bare `trailer_url` is itself a playback id; otherwise fall back to the
// first video lesson's. A full http trailer_url isn't a Mux id, so skip it.
export function deriveTrailerPlaybackId(c: CourseRead): string | null {
  const t = c.trailer_url
  if (t && !/^https?:\/\//i.test(t)) return t
  const lessons = c.modules.flatMap((m) => m.lessons)
  return lessons.find((l) => l.mux_playback_id)?.mux_playback_id ?? null
}

export function mapCourse(c: CourseRead): CourseData {
  const lessons = c.modules.flatMap((m) => m.lessons)
  const seconds = lessons.map((l) => l.duration_seconds ?? 0)
  return {
    title: c.title ?? 'Untitled course',
    eyebrow: c.format === 'series' ? 'A Spaire Series' : 'A Spaire Course',
    tagline: c.description ?? '',
    heroImage: c.thumbnail_url,
    trailerImage: deriveTrailerPoster(c),
    trailerPlaybackId: deriveTrailerPlaybackId(c),
    instructor: {
      name: c.instructor_name ?? '',
      role: 'Instructor',
      // The instructor block's description mirrors the landing hero: the
      // AI-generated course description (landing_overrides.ai_hero.description),
      // falling back to the raw course description exactly as the hero does.
      // Because CourseData is re-derived from the live course, editing the hero
      // copy flows through to this block on the next template load.
      bio:
        c.landing_overrides?.ai_hero?.description || c.description || '',
      // The instructor portrait is the square photo the creator uploaded for
      // the landing page's Instructor section (landing_overrides.portrait_url).
      // Without it the email's instructor block falls back to the course cover,
      // showing the wrong image. Prefer the real portrait.
      avatar: c.landing_overrides?.portrait_url ?? null,
    },
    lessons: lessons.map((l) => ({
      title: l.title,
      duration: l.duration_seconds ? formatDuration(l.duration_seconds) : '',
    })),
    level: 'All levels',
    totalDuration: totalDurationOf(seconds),
    // Progress is per-subscriber; at edit time we preview the full course.
    progress: { completed: 0, total: lessons.length },
    welcome: c.description ? [c.description] : [],
    ctaText: 'Start the course',
    ctaHref: '#',
  }
}

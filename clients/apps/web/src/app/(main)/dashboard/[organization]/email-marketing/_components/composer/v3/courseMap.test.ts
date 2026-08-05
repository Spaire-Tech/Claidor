import { describe, expect, it } from 'vitest'

import {
  deriveTrailerPlaybackId,
  deriveTrailerPoster,
  mapCourse,
  muxPoster,
} from './courseMap'

// Minimal CourseRead-shaped fixture (only the fields mapCourse reads).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const course: any = {
  title: 'Knife Skills',
  slug: 'knife-skills',
  description: 'Sharp fundamentals.',
  thumbnail_url: 'https://cdn/hero.jpg',
  trailer_url: 'https://cdn/trailer.mp4',
  instructor_name: 'Marco Pierre',
  instructor_bio: 'Twenty years at the pass.',
  landing_overrides: { portrait_url: 'https://cdn/portrait.jpg' },
  format: 'course',
  modules: [
    {
      lessons: [
        { title: 'Holding the Blade', duration_seconds: 7 * 60 },
        { title: 'The Rock Chop', duration_seconds: 11 * 60 },
      ],
    },
    { lessons: [{ title: 'Julienne', duration_seconds: 90 * 60 }] },
  ],
}

describe('mapCourse', () => {
  it('flattens modules→lessons and formats durations', () => {
    const c = mapCourse(course)
    expect(c.title).toBe('Knife Skills')
    expect(c.heroImage).toBe('https://cdn/hero.jpg')
    expect(c.trailerImage).toBe('https://cdn/trailer.mp4')
    expect(c.instructor.name).toBe('Marco Pierre')
    // The instructor photo comes from the landing Instructor section portrait,
    // not the course cover.
    expect(c.instructor.avatar).toBe('https://cdn/portrait.jpg')
    expect(c.lessons).toHaveLength(3)
    expect(c.lessons[0]).toEqual({ title: 'Holding the Blade', duration: '7 min' })
    expect(c.lessons[2].duration).toBe('1h 30m')
    // total 7+11+90 = 108 min = 1h 48m
    expect(c.totalDuration).toBe('1h 48m')
    expect(c.progress).toEqual({ completed: 0, total: 3 })
    expect(c.welcome).toEqual(['Sharp fundamentals.'])
  })

  it('sources the instructor bio from the AI hero description (matching the landing hero)', () => {
    const withHero = {
      ...course,
      landing_overrides: {
        ...course.landing_overrides,
        ai_hero: { description: 'The AI-written hero blurb.' },
      },
    }
    // Prefer the AI hero copy — the same text shown on the landing hero.
    expect(mapCourse(withHero).instructor.bio).toBe('The AI-written hero blurb.')
    // No ai_hero → fall back to the raw course description, exactly as the
    // hero itself falls back (NOT the separate instructor_bio field).
    expect(mapCourse(course).instructor.bio).toBe('Sharp fundamentals.')
  })

  it('tolerates null fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bare: any = {
      title: null,
      description: null,
      thumbnail_url: null,
      trailer_url: null,
      instructor_name: null,
      instructor_bio: null,
      format: 'series',
      modules: [],
    }
    const c = mapCourse(bare)
    expect(c.title).toBe('Untitled course')
    expect(c.eyebrow).toBe('A Spaire Series')
    expect(c.lessons).toEqual([])
    expect(c.welcome).toEqual([])
    expect(c.totalDuration).toBe('0m')
    // No portrait uploaded → avatar stays null (block falls back to the cover).
    expect(c.instructor.avatar).toBeNull()
  })
})

describe('deriveTrailerPoster (Mux, not S3)', () => {
  it('builds a Mux poster from the first video lesson when no trailer_url', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      trailer_url: null,
      thumbnail_url: 'https://s3/cover.jpg',
      modules: [
        { lessons: [{ title: 'Intro', mux_playback_id: null }] },
        { lessons: [{ title: 'Lesson', mux_playback_id: 'pLAYbAck123' }] },
      ],
    }
    expect(deriveTrailerPoster(c)).toBe(muxPoster('pLAYbAck123'))
    expect(muxPoster('pLAYbAck123')).toContain('image.mux.com/pLAYbAck123/thumbnail.jpg')
  })
  it('treats a bare trailer_url as a Mux playback id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = { trailer_url: 'abc123PLAY', thumbnail_url: null, modules: [] }
    expect(deriveTrailerPoster(c)).toBe(muxPoster('abc123PLAY'))
  })
  it('passes a full http trailer_url through unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = { trailer_url: 'https://cdn/poster.png', thumbnail_url: null, modules: [] }
    expect(deriveTrailerPoster(c)).toBe('https://cdn/poster.png')
  })
  it('falls back to the S3 cover only when there is no Mux source', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = { trailer_url: null, thumbnail_url: 'https://s3/cover.jpg', modules: [] }
    expect(deriveTrailerPoster(c)).toBe('https://s3/cover.jpg')
  })
})

describe('deriveTrailerPlaybackId', () => {
  it('uses a bare trailer_url as the playback id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(deriveTrailerPlaybackId({ trailer_url: 'play123', modules: [] } as any)).toBe('play123')
  })
  it('ignores a full-url trailer and uses the first video lesson', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      trailer_url: 'https://cdn/x.mp4',
      modules: [{ lessons: [{ mux_playback_id: null }, { mux_playback_id: 'lessonPB' }] }],
    }
    expect(deriveTrailerPlaybackId(c)).toBe('lessonPB')
  })
  it('is null when there is no Mux source', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(deriveTrailerPlaybackId({ trailer_url: null, modules: [] } as any)).toBeNull()
  })
})

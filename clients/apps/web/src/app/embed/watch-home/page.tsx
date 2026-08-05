'use client'

// Render-only harness for WatchHome (the portal course page) with a mock
// enrolled course. ?dark=1 dark theme; ?frac=1 seeds a partial position on
// lesson 2 so the Netflix-style progress bar + Resume states render.
// Comments hooks fire against the API and fail silently here (no token) —
// the panel still opens with its empty state.

import { WatchHome, type WatchLessonData } from '@/components/Courses/watch/WatchHome'
import type { CustomerCourseDetail } from '@/hooks/queries/courses'
import type { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'

const L = (
  n: number,
  title: string,
  desc: string,
  dur: number,
  completed = false,
): WatchLessonData => ({
  id: `l${n}`,
  title,
  description: desc,
  position: n - 1,
  duration_seconds: dur,
  thumbnail_url: null,
  mux_playback_id: 'fake',
  mux_status: 'ready',
  completed,
  content_type: 'video',
  content: {
    overview:
      'Most players think matches are won with the forehand. They are not — they are won in the six seconds between points.',
    takeaways: ['A 4-step reset routine', 'Turn nerves into readiness'],
    attachments: [
      {
        id: 'a1',
        filename: 'Workbook',
        url: '#',
        size: 2400000,
        content_type: 'application/pdf',
      },
    ],
  },
  comments_mode: 'visible',
})

const LESSONS: WatchLessonData[] = [
  L(1, 'Introduction', 'Meet Carla and the philosophy behind championship tennis.', 180, true),
  L(2, 'The Athlete’s Mindset', 'Before technique, the mind. How champions think between points.', 840),
  L(3, 'Grip & Ready Position', 'The foundation everything is built on.', 1080),
  L(4, 'The Forehand', 'The modern forehand from unit turn to follow-through.', 1560),
  // Lesson 5: published video that is still processing on Mux — clicking it
  // must toast (not route to the legacy lesson player).
  {
    ...L(5, 'The Backhand', 'Building a backhand you can trust under pressure.', 1440),
    mux_playback_id: null,
    mux_status: 'preparing',
  },
]

export default function WatchHomeEmbed() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('frac') === '1') {
      window.localStorage.setItem(
        'spaire_watch:c1',
        JSON.stringify({ p: { l2: 0.58 }, done: [] }),
      )
    }
    setParams(p)
  }, [])
  if (!params) return null
  const dark = params.get('dark') === '1'
  // ?heropos=1 — give the focused lesson a real cover + an extreme saved
  // focal point so the hero's honoring of thumbnail_object_position is
  // visible/assertable (the default harness lessons have no thumbnail).
  const heroPosTest = params.get('heropos') === '1'
  const lessonsForRender = heroPosTest
    ? LESSONS.map((l) =>
        l.id === 'l2'
          ? {
              ...l,
              thumbnail_url:
                'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&q=60',
              thumbnail_object_position: '15% 85%',
            }
          : l,
      )
    : LESSONS

  const data = {
    enrollment_id: 'e1',
    enrolled_at: '2026-06-01T00:00:00Z',
    customer_name: 'You',
    customer_avatar_url: null,
    progress: {
      total_lessons: 5,
      completed_lessons: 1,
      completion_percent: 20,
      completed: { l1: '2026-06-02T00:00:00Z' },
    },
    course: {
      id: 'c1',
      title: 'Championship Tennis',
      description: 'A season inside the scoring game.',
      thumbnail_url: null,
      instructor_name: 'Carla Marín',
      instructor_bio: 'Former world No. 2 and two-time Grand Slam champion.',
      course_type: 'evergreen',
      format: 'course',
      paywall_enabled: false,
      paywall_position: null,
      // ?hero=marquee|cover — the portal now honors the creator's choice
      // (default cover, matching the public landing + backend default).
      hero_variant: params.get('hero') === 'marquee' ? 'marquee' : 'cover',
      lesson_card_variant:
        params.get('card') === 'spotlight' ? 'spotlight' : 'catalog',
      // ?font=<key> — a Spaire Title Style, to verify it styles the HERO
      // title only (never card titles). ?trailer=1 adds a trailer so the
      // Trailers rail renders.
      landing_overrides: {
        theme_mode: dark ? 'dark' : 'light',
        hero_title_font: params.get('font') ?? null,
      },
      trailer_url: params.get('trailer') === '1' ? 'fake-trailer.mp4' : null,
      // ?bonus=1 — split the lessons into a season + a Bonus section, to
      // verify the "Bonus Content" rail, the unnumbered cards, and the
      // numbering spine skipping the extras.
      modules:
        params.get('bonus') === '1'
          ? [
              {
                id: 'm1',
                title: 'Season 1',
                description: null,
                position: 0,
                locked: false,
                locked_until: null,
                lessons: lessonsForRender.slice(0, 3),
              },
              {
                id: 'm2',
                title: 'Extras',
                description: null,
                position: 1,
                locked: false,
                locked_until: null,
                is_bonus: true,
                lessons: lessonsForRender.slice(3),
              },
            ]
          : [],
      lessons: [],
    },
  } as unknown as CustomerCourseDetail

  const organization = {
    id: 'o1',
    slug: 'spairehq',
    name: 'Spaire',
    avatar_url: null,
  } as unknown as schemas['CustomerOrganization']

  return (
    <WatchHome
      organization={organization}
      data={data}
      lessons={lessonsForRender}
      token=""
      onOpenTextLesson={() => undefined}
      onMarkComplete={() => undefined}
    />
  )
}

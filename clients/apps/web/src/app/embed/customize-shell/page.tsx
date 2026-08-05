'use client'

import { CustomizeTab } from '@/components/Courses/editor/CustomizeTab'
import type { CourseRead } from '@/hooks/queries/courses'
import type { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'

// Render-only harness for the customize shell + canvas with a fully
// populated mock course (AI hero/instructor/faq + lessons), so the
// autosave bar and editor surface can be verified in a browser.
const NOW = '2026-06-12T00:00:00Z'
const lesson = (
  id: string,
  module_id: string,
  position: number,
  title: string,
  description: string,
) => ({
  id,
  module_id,
  title,
  content_type: 'video',
  content: null,
  video_asset_id: null,
  duration_seconds: null,
  position,
  is_free_preview: position < 3,
  published: false,
  mux_upload_id: null,
  mux_asset_id: null,
  mux_playback_id: null,
  mux_status: null,
  thumbnail_url: null,
  thumbnail_object_position: null,
  description,
  created_at: NOW,
  modified_at: null,
})

const course = {
  id: 'c-mock',
  product_id: 'p-mock',
  organization_id: 'o-mock',
  title: 'The Science of Baking',
  slug: 'science-of-baking',
  course_type: 'evergreen',
  format: 'course',
  paywall_enabled: true,
  paywall_lesson_id: null,
  paywall_position: 3,
  ai_generated: true,
  hero_variant: 'cover',
  lesson_card_variant: 'spotlight',
  trial_mode: 'free_preview',
  description: 'long raw creator description that must NOT show in the hero',
  thumbnail_url: null,
  thumbnail_object_position: null,
  instructor_name: 'Claire Saffitz',
  instructor_bio: 'pastry chef, ex Bon Appétit',
  trailer_url: null,
  instructor_name_italic: false,
  instructor_name_bold: true,
  instructor_name_uppercase: true,
  landing_overrides: {
    theme_mode: 'light',
    ai_hero: {
      eyebrow: 'Course · Baking',
      badge: 'Masterclass',
      description:
        'Pastry chef Claire Saffitz — former Bon Appétit senior food editor — on the chemistry beneath every great bake.',
      byline: 'Pastry chef, host of Gourmet Makes, author of Dessert Person.',
      titleLines: ['The Science', 'of Baking'],
    },
    ai_instructor: {
      sub: 'Pastry chef and bestselling author of Dessert Person. Former senior food editor at Bon Appétit.',
      bio: [
        'Claire Saffitz spent five years as a senior food editor at Bon Appétit, where she hosted Gourmet Makes.',
        'In this course, Claire teaches the why behind every recipe — so you can fix a bake when it goes wrong.',
      ],
      caption: 'Claire Saffitz · The Science of Baking',
    },
    ai_faq: [
      {
        q: "What's included when I enroll?",
        a: 'Four chapters, eighteen lessons, lifetime access. One-time purchase, no subscription.',
      },
      {
        q: 'Do I need experience?',
        a: 'No — it starts from the foundations and builds to advanced technique.',
      },
    ],
  },
  sample: null,
  modules: [
    {
      id: 'm1',
      course_id: 'c-mock',
      title: 'The Ingredients',
      description: null,
      position: 0,
      status: 'published',
      release_at: null,
      drip_days: null,
      lessons: [
        lesson('l1', 'm1', 0, 'Flour & Gluten', 'Why your bread is dense. Protein, hydration, and crumb.'),
        lesson('l2', 'm1', 1, 'Fats At Work', 'Butter versus oil — how fat rewrites texture.'),
        lesson('l3', 'm1', 2, 'Sugar Is Structure', 'Past sweetness: moisture, browning, spread.'),
        lesson('l4', 'm1', 3, 'What Eggs Do', 'Binding, lifting, emulsifying — and swaps.'),
      ],
      created_at: NOW,
      modified_at: null,
    },
    {
      id: 'm2',
      course_id: 'c-mock',
      title: 'Doughs & Batters',
      description: null,
      position: 1,
      status: 'published',
      release_at: null,
      drip_days: null,
      lessons: [
        lesson('l5', 'm2', 0, 'Pie Dough', 'Flake on demand. Cutting fat, resting, rolling.'),
        lesson('l6', 'm2', 1, 'Choux Paste', 'The dough that puffs from steam.'),
        lesson('l7', 'm2', 2, 'Quick Lamination', 'Rough puff that still shatters under a fork.'),
      ],
      created_at: NOW,
      modified_at: null,
    },
  ],
  created_at: NOW,
  modified_at: null,
} as unknown as CourseRead

const organization = {
  id: 'o-mock',
  slug: 'spairehq',
  name: 'Spaire',
  avatar_url: null,
} as unknown as schemas['Organization']

export default function CustomizeShellPreviewPage() {
  // `?trial=sample` — exercise the lesson-sample path: the sample screen on
  // the canvas plus the SampleSettingsPopover (with its inline scrub
  // preview), backed by one fake mux-ready lesson.
  // Read after mount — reading window.location during render makes the
  // server and client render different trees (hydration mismatch).
  const [sampleMode, setSampleMode] = useState(false)
  useEffect(() => {
    setSampleMode(
      new URLSearchParams(window.location.search).get('trial') === 'sample',
    )
  }, [])
  const effectiveCourse = sampleMode
    ? ({
        ...course,
        trial_mode: 'lesson_sample',
        modules: course.modules.map((m, mi) =>
          mi === 0
            ? {
                ...m,
                lessons: m.lessons.map((l, li) =>
                  li === 0
                    ? {
                        ...l,
                        mux_status: 'ready',
                        mux_playback_id: 'fake-playback-id',
                        duration_seconds: 300,
                      }
                    : l,
                ),
              }
            : m,
        ),
      } as unknown as CourseRead)
    : course
  return (
    <div style={{ height: '100vh' }}>
      <CustomizeTab course={effectiveCourse} organization={organization} />
    </div>
  )
}

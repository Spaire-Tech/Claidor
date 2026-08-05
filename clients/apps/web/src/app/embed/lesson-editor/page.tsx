'use client'

// Render-only harness for LessonEditorV2 with a fully-populated mock lesson,
// so the redesign can be verified in a browser. ?video=1 shows the filled
// (uploaded) media state; ?dark=1 the dark theme.

import { LessonEditorV2 } from '@/components/Courses/editor/LessonEditorV2'
import type {
  CourseLessonRead,
  CourseModuleRead,
  CourseRead,
} from '@/hooks/queries/courses'
import type { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'

const NOW = '2026-06-12T00:00:00Z'

function buildLesson(video: boolean): CourseLessonRead {
  return {
    id: 'l1',
    module_id: 'm1',
    title: 'Why Baking Works',
    description:
      'The science under every recipe. Gluten, starch, fat, and water — the four levers that decide whether a bake succeeds or fails.',
    content_type: 'video',
    content: {
      overview:
        'Baking feels like magic until you understand the four levers. Once you do, every recipe becomes adjustable.',
      takeaways: [
        'How gluten gives structure — and when to develop it',
        'Why fat makes things tender',
      ],
      captions: true,
      attachments: [
        {
          id: 'a1',
          filename: 'Why Baking Works — Workbook',
          url: '#',
          size: 2_400_000,
          content_type: 'application/pdf',
        },
      ],
    },
    position: 0,
    is_free_preview: false,
    published: false,
    duration_seconds: video ? 760 : null,
    thumbnail_url:
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=70&auto=format&fit=crop',
    thumbnail_object_position: '50% 50%',
    mux_playback_id: video ? 'fake-id' : null,
    mux_status: video ? 'ready' : null,
    comments_mode: 'visible',
  } as unknown as CourseLessonRead
}

const moduleMock = {
  id: 'm1',
  course_id: 'c1',
  title: 'The Ingredients',
  description: null,
  position: 0,
  lessons: [buildLesson(true)],
  created_at: NOW,
  modified_at: null,
} as unknown as CourseModuleRead

const courseMock = {
  id: 'c1',
  title: 'The Science of Baking',
  format: 'course',
  lesson_card_variant: 'spotlight',
  instructor_name: 'Claire Saffitz',
  modules: [moduleMock],
} as unknown as CourseRead

const organization = {
  id: 'o1',
  slug: 'spairehq',
  name: 'Spaire',
  avatar_url: null,
} as unknown as schemas['Organization']

export default function LessonEditorEmbed() {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setParams(p)
    if (p.get('dark') === '1') document.body.classList.add('dark')
  }, [])
  if (!params) return null
  const video = params.get('video') === '1'
  return (
    <LessonEditorV2
      lesson={buildLesson(video)}
      module={moduleMock}
      course={courseMock}
      organization={organization}
      organizationSlug="spairehq"
    />
  )
}

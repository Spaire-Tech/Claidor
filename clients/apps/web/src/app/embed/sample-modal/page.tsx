'use client'

import { SampleSettingsModal } from '@/components/Courses/editor/CourseDesignEditor'
import type { CourseRead } from '@/hooks/queries/courses'

// Standalone render of the sample-settings modal with mock data, so its
// layout can be verified in a browser without a live course.
const NOW = '2026-06-11T00:00:00Z'
const lessons = [
  {
    id: 'l1',
    module_id: 'm1',
    title: 'The Wager',
    content_type: 'video',
    content: null,
    video_asset_id: null,
    duration_seconds: 1324,
    position: 0,
    is_free_preview: true,
    published: true,
    mux_upload_id: null,
    mux_asset_id: null,
    mux_playback_id: 'pb1',
    mux_status: 'ready',
    thumbnail_url: null,
    thumbnail_object_position: null,
    description: '',
    created_at: NOW,
    modified_at: null,
  },
  {
    id: 'l2',
    module_id: 'm1',
    title: 'The Grip Is a Lie',
    content_type: 'video',
    content: null,
    video_asset_id: null,
    duration_seconds: 1176,
    position: 1,
    is_free_preview: false,
    published: true,
    mux_upload_id: null,
    mux_asset_id: null,
    mux_playback_id: null,
    mux_status: 'preparing',
    thumbnail_url: null,
    thumbnail_object_position: null,
    description: '',
    created_at: NOW,
    modified_at: null,
  },
]

const course = {
  id: 'c1',
  modules: [{ lessons }],
  sample: null,
} as unknown as CourseRead

export default function SampleModalPreviewPage() {
  return (
    <SampleSettingsModal
      course={course}
      lessons={lessons as unknown as CourseRead['modules'][number]['lessons']}
      onClose={() => {}}
      onSave={() => {}}
    />
  )
}

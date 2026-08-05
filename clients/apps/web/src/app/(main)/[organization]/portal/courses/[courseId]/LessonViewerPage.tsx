'use client'

import { AskAssistant } from '@/components/Courses/assistant/AskAssistant'
import { COURSE_ASSISTANT_UI_ENABLED } from '@/components/Courses/assistant/flag'
import { WatchHome } from '@/components/Courses/watch/WatchHome'
import {
  useCustomerCourse,
  useMarkLessonComplete,
} from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PortalLoading } from '../../_components/PortalLoading'
import { MasterClassLessonViewer } from './MasterClassLessonViewer'

interface FlatLesson {
  id: string
  title: string
  description?: string | null
  position: number
  duration_seconds?: number | null
  thumbnail_url?: string | null
  thumbnail_object_position?: string | null
  mux_playback_id?: string | null
  mux_playback_url?: string | null
  mux_status?: string | null
  completed: boolean
  is_free_preview: boolean
  locked?: boolean
  locked_until?: string | null
  content_type: string
  content: Record<string, unknown> | null
  comments_mode?: 'visible' | 'hidden' | 'locked'
}

interface LessonViewerPageProps {
  organization: schemas['CustomerOrganization']
  courseId: string
  customerSessionToken: string
  initialLessonId?: string
}

const LessonViewerPage = ({
  organization,
  courseId,
  customerSessionToken,
  initialLessonId,
}: LessonViewerPageProps) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data, isLoading, error } = useCustomerCourse(
    customerSessionToken,
    courseId,
  )
  const markComplete = useMarkLessonComplete(customerSessionToken, courseId)

  // Source of truth: ?lesson= in the URL. Keeps browser back/forward in sync
  // with the rendered lesson — previously a router.replace built the URL but
  // the React state ignored later searchParams changes, so back-navigation
  // appeared to do nothing while the URL kept drifting.
  const lessonParam = searchParams.get('lesson')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    lessonParam ?? initialLessonId ?? null,
  )

  useEffect(() => {
    const next = searchParams.get('lesson')
    setSelectedLessonId(next)
  }, [searchParams])

  // Flatten lessons from modules into a single array (or use flat lessons if available)
  const flatLessons: FlatLesson[] = data
    ? ((data.course.lessons as FlatLesson[] | undefined) ??
      data.course.modules.flatMap((m) =>
        m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description ?? null,
          position: l.position,
          duration_seconds: l.duration_seconds,
          thumbnail_url: l.thumbnail_url,
          thumbnail_object_position: l.thumbnail_object_position ?? null,
          mux_playback_id: l.mux_playback_id,
          mux_status: l.mux_status,
          completed: l.completed,
          is_free_preview: l.is_free_preview,
          locked: m.locked,
          locked_until: m.locked_until,
          content_type: l.content_type ?? 'text',
          content: l.content ?? null,
        })),
      ))
    : []

  const currentLesson =
    flatLessons.find((l) => l.id === selectedLessonId) ?? null

  // Optional ?t=<seconds> deep-link (set by a Course Assistant citation) — the
  // second to start the selected lesson's video at.
  const tParam = searchParams.get('t')
  const startSeconds = tParam ? Math.max(0, parseInt(tParam, 10) || 0) : 0

  const handleSelectLesson = (lesson: FlatLesson) => {
    setSelectedLessonId(lesson.id)
    const params = new URLSearchParams(searchParams.toString())
    params.set('lesson', lesson.id)
    // Manual navigation clears any citation timestamp so it doesn't carry over
    // to a different lesson.
    params.delete('t')
    // push (not replace) so the browser back button returns to the
    // previous lesson / the course overview instead of blowing past it.
    router.push(`?${params.toString()}`, { scroll: false })
  }

  const handleBack = () => {
    setSelectedLessonId(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('lesson')
    params.delete('t')
    router.push(`?${params.toString()}`, { scroll: false })
  }

  // When the player overlay closes, strip ?lesson=/?t= (replace, not push —
  // no history entry) so a refresh shows the course home, not the player.
  const handlePlayerClose = () => {
    if (!searchParams.get('lesson') && !searchParams.get('t')) return
    setSelectedLessonId(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('lesson')
    params.delete('t')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleMarkComplete = () => {
    if (!currentLesson || currentLesson.completed) return
    markComplete.mutate(currentLesson.id)
  }

  // Text / quiz lessons open the reading view (MasterClassLessonViewer);
  // video lessons play inside WatchHome's player overlay.
  const handleOpenTextLesson = (lessonId: string) => {
    const flat = flatLessons.find((l) => l.id === lessonId)
    if (flat) handleSelectLesson(flat)
  }

  if (isLoading) {
    return <PortalLoading />
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6">
        <div className="max-w-md rounded-xl bg-red-900/30 p-6 text-red-400">
          Could not load masterclass. You may not have access.
        </div>
      </div>
    )
  }

  // Deep-linked VIDEO lessons (?lesson= from assistant citations, bookmarks,
  // back/forward) play in WatchHome's player overlay — the one real player.
  // The MasterClass reading view below is reserved for text and quiz
  // lessons, which have no video surface.
  const isVideoLesson = currentLesson?.content_type === 'video'

  // Show the reading view if a text/quiz lesson is selected
  if (currentLesson && !isVideoLesson) {
    return (
      <>
        <MasterClassLessonViewer
          lesson={{
            id: currentLesson.id,
            title: currentLesson.title,
            description: currentLesson.description,
            content_type: currentLesson.content_type,
            duration_seconds: currentLesson.duration_seconds,
            thumbnail_url: currentLesson.thumbnail_url,
            thumbnail_object_position: currentLesson.thumbnail_object_position,
            mux_playback_id: currentLesson.mux_playback_id,
            mux_status: currentLesson.mux_status,
            mux_playback_url: currentLesson.mux_playback_url,
            completed: currentLesson.completed,
            content: currentLesson.content,
            comments_mode: currentLesson.comments_mode,
          }}
          lessonIndex={flatLessons.findIndex((l) => l.id === currentLesson.id)}
          totalLessons={flatLessons.length}
          lessons={flatLessons.map((l) => ({
            id: l.id,
            title: l.title,
            position: l.position,
            completed: l.completed,
            duration_seconds: l.duration_seconds,
            thumbnail_url: l.thumbnail_url,
            thumbnail_object_position: l.thumbnail_object_position,
            mux_playback_id: l.mux_playback_id,
            locked: l.locked,
            locked_until: l.locked_until,
            is_free_preview: l.is_free_preview,
          }))}
          courseTitle={data.course.title}
          courseDescription={data.course.description}
          instructorName={data.course.instructor_name ?? organization.name}
          instructorAvatarUrl={organization.avatar_url ?? null}
          totalDurationSeconds={flatLessons.reduce(
            (s, l) => s + (l.duration_seconds ?? 0),
            0,
          )}
          isPending={markComplete.isPending}
          onBack={handleBack}
          onSelectLesson={(lessonId) => {
            const lesson = flatLessons.find((l) => l.id === lessonId)
            if (lesson) handleSelectLesson(lesson)
          }}
          onMarkComplete={handleMarkComplete}
          token={customerSessionToken}
          courseId={courseId}
          organizationSlug={organization.slug}
          customerName={data.customer_name ?? null}
          startSeconds={startSeconds}
        />
        {COURSE_ASSISTANT_UI_ENABLED && (
          <AskAssistant courseId={courseId} token={customerSessionToken} />
        )}
      </>
    )
  }

  // Course home (hero + rail). A deep-linked video lesson auto-opens in the
  // player overlay on top of it.
  return (
    <>
      <WatchHome
        organization={organization}
        data={data}
        lessons={flatLessons}
        token={customerSessionToken}
        onOpenTextLesson={handleOpenTextLesson}
        onMarkComplete={(lessonId) => {
          const lesson = flatLessons.find((l) => l.id === lessonId)
          if (lesson && !lesson.completed) markComplete.mutate(lessonId)
        }}
        autoplayLessonId={isVideoLesson ? currentLesson.id : null}
        autoplayStartSec={isVideoLesson ? startSeconds : undefined}
        onPlayerClose={handlePlayerClose}
      />
      {COURSE_ASSISTANT_UI_ENABLED && (
        <AskAssistant courseId={courseId} token={customerSessionToken} />
      )}
    </>
  )
}

export default LessonViewerPage

'use client'

// Standalone, course-linked automation builder. Mounted OUTSIDE the
// email-marketing tabbed area (under /courses/[courseId]/automations) so it
// reads as its own editor — like the lesson editor — with no Subscribers /
// Broadcasts / Sequences / Analytics chrome. "Back" returns to the course
// editor at the lesson the creator came from.

import type { schemas } from '@spaire/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { useEmailSequence } from '@/hooks/queries/emailMarketing'
import { useCourseById } from '@/hooks/queries/courses'
import {
  AutomationSequenceBuilder,
} from '@/components/Courses/automation/AutomationSequenceBuilder'
import { deserializeSteps } from '@/components/Courses/automation/flowDoc'

type FlowDoc = {
  course_trigger?: Record<string, unknown>
  send_settings?: Record<string, unknown>
  // Stored as canonical flow nodes ({ id, type, value }) — or the legacy flat
  // shape for sequences saved before the serializer landed. deserializeSteps
  // handles both.
  steps?: unknown
}

export function AutomationBuilderRoute({
  organization,
  courseId,
  sequenceId,
}: {
  organization: schemas['Organization']
  courseId?: string
  sequenceId: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()
  const lessonId = params.get('lesson_id') ?? undefined

  const { data: sequence, isLoading } = useEmailSequence(sequenceId ?? '')

  // The course's real lessons feed the "Lesson completed" trigger picker.
  const { data: course } = useCourseById(courseId)
  const lessons = useMemo(() => {
    if (!course?.modules) return undefined
    const flat = [...course.modules]
      .sort((a, b) => a.position - b.position)
      .flatMap((m) =>
        [...m.lessons]
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ id: l.id, title: l.title ?? 'Untitled lesson' })),
      )
    return flat.length > 0 ? flat : undefined
  }, [course])

  // Return to the course editor — at the originating lesson when we have
  // one, otherwise the course's Automations tab.
  const back = () => {
    if (!courseId) {
      router.push(`/dashboard/${organization.slug}`)
      return
    }
    const base = `/dashboard/${organization.slug}/courses/${courseId}`
    router.push(
      lessonId ? `${base}?lesson=${lessonId}` : `${base}?tab=automations`,
    )
  }

  if (sequenceId && isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">
        Loading automation…
      </div>
    )
  }

  const tc =
    ((sequence as { trigger_config?: Record<string, unknown> } | undefined)
      ?.trigger_config as Record<string, unknown> | undefined) ?? {}
  const flow = (tc['flow_doc'] as FlowDoc | undefined) ?? {
    course_trigger: tc['course_trigger'] as Record<string, unknown> | undefined,
    send_settings: tc['send_settings'] as Record<string, unknown> | undefined,
    steps: undefined,
  }
  const seq = sequence as
    | { name?: string; description?: string; status?: string }
    | undefined

  return (
    <AutomationSequenceBuilder
      organization={organization as unknown as schemas['Organization']}
      organizationId={organization.id}
      courseId={courseId}
      lessonId={lessonId}
      lessons={lessons}
      sequenceId={sequenceId ?? undefined}
      initial={
        sequenceId
          ? {
              name: seq?.name,
              desc: seq?.description ?? '',
              trigger: flow.course_trigger as never,
              send: flow.send_settings as never,
              steps: deserializeSteps(flow.steps),
              live: seq?.status === 'active',
            }
          : { trigger: { type: 'enrol' } as never }
      }
      onBack={back}
    />
  )
}

export default AutomationBuilderRoute

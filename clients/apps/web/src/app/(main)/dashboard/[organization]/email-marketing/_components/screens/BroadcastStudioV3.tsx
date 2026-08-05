'use client'

// Brick 15 — route wiring + persistence.
//
// Wraps the v3 editor with the REAL app plumbing: S3 image upload
// (useUploadEmailImage), a real course mapped to CourseData (useCourseById),
// and save/load against the EmailBroadcast model (content_json = TipTap JSON,
// content_html = inbox-correct HTML). Mounted on a dedicated /studio route so
// the existing composer is untouched.

import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  useCreateEmailBroadcast,
  useEmailBroadcast,
  useGenerateEmailCopy,
  useUpdateEmailBroadcast,
  useUploadEmailImage,
} from '@/hooks/queries/emailMarketing'
import { useCourseById } from '@/hooks/queries/courses'

import {
  BroadcastEditorV3,
  type SavePayload,
} from '../composer/v3/BroadcastEditorV3'
import { SAMPLE_COURSE } from '../composer/v3/courseData'
import { mapCourse } from '../composer/v3/courseMap'

export function BroadcastStudioV3({
  organization,
  broadcastId,
  courseId,
}: {
  organization: schemas['Organization']
  broadcastId?: string
  courseId?: string
}) {
  const router = useRouter()
  const upload = useUploadEmailImage(organization.id)
  const generateCopy = useGenerateEmailCopy()
  const create = useCreateEmailBroadcast(organization.id)
  const update = useUpdateEmailBroadcast()
  const { data: courseRead } = useCourseById(courseId)
  const { data: existing, isLoading: loadingBroadcast } = useEmailBroadcast(
    broadcastId ?? '',
  )

  const [id, setId] = useState<string | undefined>(broadcastId)
  const course = useMemo(
    () => (courseRead ? mapCourse(courseRead) : SAMPLE_COURSE),
    [courseRead],
  )

  const onSave = async ({ json, html, subject, preview, from }: SavePayload) => {
    const body = {
      subject: subject || 'Untitled',
      sender_name: from || organization.name,
      preview_text: preview,
      content_json: json,
      content_html: html,
    }
    if (id) {
      await update.mutateAsync({ broadcastId: id, body })
    } else {
      const row = await create.mutateAsync(body)
      setId(row.id)
      // Move to the editable URL without a full navigation.
      router.replace(
        `/dashboard/${organization.slug}/email-marketing/studio/${row.id}`,
      )
    }
  }

  // In edit mode wait for the saved doc so the editor restores from it (TipTap
  // only reads `content` once, at mount).
  if (broadcastId && loadingBroadcast) {
    return <div className="h-screen w-full animate-pulse bg-gray-50" />
  }

  return (
    <BroadcastEditorV3
      courseName={courseRead?.title ?? course.title}
      course={course}
      initialDocument={
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existing?.content_json as Record<string, any> | undefined) ?? undefined
      }
      onSave={onSave}
      onUploadImage={(file) => upload.mutateAsync(file)}
      onGenerateCopy={
        courseId
          ? (moment) => generateCopy.mutateAsync({ courseId, moment })
          : undefined
      }
    />
  )
}

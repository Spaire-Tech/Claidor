'use client'

// SequenceEmailModal — hosts the creator's faithfully-rebuilt broadcast editor
// (BroadcastEditorDesign) as an automation step's email editor, full-screen.
// The sequence defines the audience and trigger, so the editor opens on the
// matching lifecycle template (enrolment, first lesson, halfway, …), bound to
// the automation's course. "Back" returns to the builder; saving hands the
// authored subject + inbox-correct HTML + editor JSON back to the sequence.

import type { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { BroadcastEditorDesign } from '@/app/(main)/dashboard/[organization]/email-marketing/_components/composer/design/BroadcastEditorDesign'
import type { EditorState } from '@/app/(main)/dashboard/[organization]/email-marketing/_components/composer/design/emailEngine'
import { mapCourse } from '@/app/(main)/dashboard/[organization]/email-marketing/_components/composer/v3/courseMap'
import { useCourseById, useCourseEnrollments } from '@/hooks/queries/courses'
import { organizationPageLink, storefrontLink } from '@/utils/nav'
import {
  useSendTestEmail,
  useUploadEmailImage,
} from '@/hooks/queries/emailMarketing'

// The sequence's trigger type → the editor's lifecycle template key.
const MOMENT_TO_TRIGGER: Record<string, string> = {
  enrol: 'enrolment',
  enrolment: 'enrolment',
  lesson: 'specificLesson',
  specificLesson: 'specificLesson',
  first: 'firstLesson',
  firstLesson: 'firstLesson',
  half: 'halfway',
  halfway: 'halfway',
  complete: 'courseComplete',
  courseComplete: 'courseComplete',
  inactive: 'inactive',
}

export function SequenceEmailModal({
  organization,
  courseId,
  moment,
  triggerLesson,
  initialSubject,
  initialContentJson,
  saveFailed,
  onSave,
  onAutosave,
  onClose,
}: {
  organization: schemas['Organization']
  courseId?: string
  moment?: string
  /** For a lesson-completed trigger: the exact lesson chosen, so the email
   *  names THAT lesson instead of guessing a representative one. */
  triggerLesson?: string
  sequenceName?: string
  initialSubject?: string
  initialContentJson?: Record<string, unknown> | null
  /** The host's last background write failed — shown in the editor's status. */
  saveFailed?: boolean
  /** Return `false` when the step could not actually be persisted yet (new,
   *  never-saved automation) so the editor's "Saved" status stays honest. */
  onSave: (v: {
    subject: string
    content_html: string
    content_json: Record<string, unknown>
  }) => void | boolean
  /** Silently persist edits into the step as the creator types (no close). */
  onAutosave?: (v: {
    subject: string
    content_html: string
    content_json: Record<string, unknown>
  }) => void | boolean
  onClose: () => void
}) {
  // Lock page scroll while the full-screen editor is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // An email authored in an older editor can't be restored here — opening it
  // rebuilds from a fresh template, and the first keystroke would overwrite the
  // old design. Gate that behind an explicit confirmation instead of silently
  // discarding the creator's previous work.
  const [ackLegacy, setAckLegacy] = useState(false)

  // The editor is a full-viewport overlay. It MUST render as a direct child of
  // <body>, not inline in the dashboard tree: the dashboard content lives inside
  // framer-motion / overflow wrappers (DashboardLayout) that become the
  // containing block for `position: fixed`, which would trap this overlay inside
  // the narrow content column — squeezing the 640px email stage and breaking the
  // design's proportions. Portaling to <body> gives it the true full viewport the
  // standalone design assumes, so the embedded editor mirrors it exactly.

  const upload = useUploadEmailImage(organization.id)
  const sendTest = useSendTestEmail(organization.id)
  const { data: courseRead, isError: courseError } = useCourseById(courseId)
  const course = courseRead ? mapCourse(courseRead) : undefined
  // Follow the course's own light/dark setting (the toggle in the course
  // editor, persisted to landing_overrides.theme_mode). Putting `dark` on the
  // overlay makes it the `.dark` ancestor design.css's chrome rules expect, so
  // the editor flips with the course — no separate toggle of its own.
  const dark = courseRead?.landing_overrides?.theme_mode === 'dark'
  // Real enrolled count — one row is enough; we only read pagination.total_count.
  const { data: enrollments } = useCourseEnrollments(courseId, { page: 1, limit: 1 })
  const enrolledCount = enrollments?.pagination.total_count

  const initialTrigger = moment ? MOMENT_TO_TRIGGER[moment] ?? 'enrolment' : 'enrolment'

  // Real destinations for the templates' CTA buttons: the student's course
  // page (custom domain when live, else the platform host + slug — mirrors the
  // server's storefront_url), and the public catalog for "what's next" CTAs.
  const customDomain =
    'custom_domain' in organization
      ? ((organization as { custom_domain?: string | null }).custom_domain ?? null)
      : null
  const courseUrl = courseId
    ? customDomain
      ? `https://${customDomain}/portal/courses/${courseId}`
      : organizationPageLink(organization, `portal/courses/${courseId}`)
    : undefined
  const catalogUrl = storefrontLink(organization)
  const portalUrl = customDomain
    ? `https://${customDomain}/portal`
    : organizationPageLink(organization, 'portal')

  // Only restore state the design editor itself wrote (version 3). Emails
  // authored in earlier composers use a different shape and start fresh from
  // the lifecycle template instead.
  const initialState =
    initialContentJson && (initialContentJson as { version?: number }).version === 3
      ? (initialContentJson as unknown as EditorState)
      : null

  // Prior content exists but in a shape this editor can't restore → opening
  // will replace it. (No content, or content this editor wrote, needs no
  // warning.)
  const hasLegacyContent =
    !!initialContentJson &&
    (initialContentJson as { version?: number }).version !== 3

  // 'use client' + mounted only on user interaction ⇒ always client-side here.
  if (typeof document === 'undefined') return null

  if (hasLegacyContent && !ackLegacy) {
    return createPortal(
      <div
        className={`fixed inset-0 z-50 grid place-items-center bg-black/90 p-6${dark ? ' dark' : ''}`}
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
          <h2 className="text-base font-semibold text-gray-900">
            This email was built in an older editor
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Opening it here starts from a fresh template for this moment. The
            previous design can’t be carried over, and saving will replace it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Keep the old email
            </button>
            <button
              type="button"
              onClick={() => setAckLegacy(true)}
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Start fresh
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // Don't mount the editor with the design's placeholder course (Southern
  // Cooking / Adaeze Bello) before the real course resolves — a slow query
  // could otherwise let placeholder content get authored and shipped. Hold on
  // a loading overlay until the course is in hand.
  if (courseId && !courseRead) {
    // A failed course load used to leave the modal stuck on "Loading course…"
    // forever with no way out. Show the error state and always offer a close.
    return createPortal(
      <div
        className={`fixed inset-0 z-50 grid place-items-center bg-black text-sm text-white/60${dark ? ' dark' : ''}`}
      >
        <div className="flex flex-col items-center gap-4">
          <span>{courseError ? 'Couldn’t load this course.' : 'Loading course…'}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/25 px-4 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            {courseError ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className={`fixed inset-0 z-50 bg-black${dark ? ' dark' : ''}`}>
      <BroadcastEditorDesign
        courseName={courseRead?.title ?? course?.title ?? 'Course'}
        course={course}
        initialTrigger={initialTrigger}
        lockTrigger
        enrolledCount={enrolledCount}
        creatorName={
          courseRead?.instructor_name || organization.name || organization.slug
        }
        initialSubject={initialSubject}
        initialState={initialState}
        links={{ courseUrl, catalogUrl, portalUrl }}
        triggerLesson={triggerLesson}
        saveFailed={saveFailed}
        onUploadImage={async (file) => (await upload.mutateAsync(file)).url}
        onSendTest={async (v) => {
          await sendTest.mutateAsync({
            subject: v.subject,
            content_html: v.html,
            preview_text: v.preview,
          })
        }}
        onAutosave={(p) =>
          onAutosave?.({
            subject: p.subject,
            content_html: p.html,
            content_json: p.json as unknown as Record<string, unknown>,
          })
        }
        onSave={(p) => {
          const persisted = onSave({
            subject: p.subject,
            content_html: p.html,
            content_json: p.json as unknown as Record<string, unknown>,
          })
          onClose()
          return persisted
        }}
        onClose={onClose}
      />
    </div>,
    document.body,
  )
}

export default SequenceEmailModal

'use client'

/**
 * Course editor — Settings tab.
 *
 * Uses the community-hub grouped-list design (Apple-style .glist / .grow rows,
 * .card form-cards, the hub Toggle) so Settings matches the Community tab 1:1.
 * Text fields persist on blur; the assistant toggle / scope persist
 * immediately — there is no separate save bar, exactly like community settings.
 *
 * The custom-domain block keeps its own layout and renders outside the
 * `.spaire-hub` wrapper (its Tailwind utilities are themed by `.editor-dark`).
 */
import {
  AssistantStrictness,
  CourseRead,
  useUpdateCourse,
  useUploadCourseThumbnail,
} from '@/hooks/queries/courses'
import { getQueryClient } from '@/utils/api/query'
import { schemas } from '@spaire/client'
import { useEffect, useRef, useState } from 'react'
import { toast } from '../../Toast/use-toast'
import { CoverDrop, Field, Toggle } from '../../Community/hub/atoms'
import '../../Community/hub/hub.css'
import '../../Community/hub/hub-extra.css'
import { CustomDomainSection } from './CustomDomainSection'

export type CourseSettingsEdits = {
  title?: string | null
  description?: string | null
  instructor_name?: string | null
  instructor_bio?: string | null
  paywall_enabled?: boolean
  paywall_position?: number | null
  thumbnail_object_position?: string | null
}

/** A grouped-list text field: full-width input inside a form-card Field,
 *  committed on blur (and on Enter). */
function TextField({
  label,
  hint,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  hint?: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => {
    if (v !== value) onCommit(v)
  }
  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </Field>
  )
}

function TextAreaField({
  label,
  hint,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  hint?: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => {
    if (v !== value) onCommit(v)
  }
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="textarea"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
      />
    </Field>
  )
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string
  hint: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="grow">
      <div className="grow-main">
        <div className="gl">{label}</div>
        <div className="gs">{hint}</div>
      </div>
      <div className="grow-ctl">
        <Toggle on={on} onClick={onToggle} />
      </div>
    </div>
  )
}

export function SettingsTab({
  course,
  organization,
}: {
  course: CourseRead
  organization: schemas['Organization']
  // Settings persists inline; these props are unused (kept for the caller).
  onSave?: (edits: CourseSettingsEdits) => void
  isSaving?: boolean
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    course.thumbnail_url ?? null,
  )
  const [thumbnailPosition, setThumbnailPosition] = useState<string | null>(
    course.thumbnail_object_position ?? null,
  )
  const [assistantEnabled, setAssistantEnabled] = useState(
    course.assistant_enabled,
  )
  const [strictness, setStrictness] = useState<AssistantStrictness>(
    course.assistant_strictness,
  )
  const uploadThumbnail = useUploadCourseThumbnail()
  const updateCourse = useUpdateCourse()
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setThumbnailUrl(course.thumbnail_url ?? null)
    setThumbnailPosition(course.thumbnail_object_position ?? null)
    setAssistantEnabled(course.assistant_enabled)
    setStrictness(course.assistant_strictness)
  }, [
    course.id,
    course.thumbnail_url,
    course.thumbnail_object_position,
    course.assistant_enabled,
    course.assistant_strictness,
  ])

  // Silent inline persist (matches community settings: no toast, no save bar).
  const patch = async (
    body: Parameters<typeof updateCourse.mutateAsync>[0]['body'],
  ) => {
    try {
      await updateCourse.mutateAsync({ courseId: course.id, body })
      getQueryClient().invalidateQueries({
        queryKey: ['courses', { courseId: course.id }],
      })
    } catch {
      toast({ title: 'Could not save that change' })
    }
  }

  const persistAssistant = async (body: {
    assistant_enabled?: boolean
    assistant_strictness?: AssistantStrictness
  }) => {
    try {
      await updateCourse.mutateAsync({ courseId: course.id, body })
      getQueryClient().invalidateQueries({
        queryKey: ['courses', { courseId: course.id }],
      })
    } catch {
      setAssistantEnabled(course.assistant_enabled)
      setStrictness(course.assistant_strictness)
      toast({ title: 'Could not update the assistant' })
    }
  }

  const onCoverFile = async (file: File, dataUrl: string) => {
    setThumbnailUrl(dataUrl) // optimistic
    try {
      const updated = await uploadThumbnail.mutateAsync({
        courseId: course.id,
        file,
      })
      setThumbnailUrl(updated.thumbnail_url ?? null)
      toast({ title: 'Thumbnail updated' })
    } catch {
      setThumbnailUrl(course.thumbnail_url ?? null)
      toast({ title: 'Could not upload that image' })
    }
  }

  const onCoverPos = (pos: string) => {
    setThumbnailPosition(pos) // instant preview
    if (posTimer.current) clearTimeout(posTimer.current)
    posTimer.current = setTimeout(
      () => patch({ thumbnail_object_position: pos }),
      450,
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      <div className="spaire-hub dark hub-embed">
        <div className="cr-head">
          <div>
            <div className="h">Settings</div>
            <div className="s">How this course looks and runs.</div>
          </div>
        </div>

        {/* Cover */}
        <div className="glist-label">Cover</div>
        <div className="card form-card" style={{ marginBottom: 26 }}>
          <Field label="Thumbnail" hint="Shown on the card and portal.">
            <CoverDrop
              src={thumbnailUrl}
              onFile={onCoverFile}
              pos={thumbnailPosition}
              onPos={onCoverPos}
            />
          </Field>
        </div>

        {/* Details */}
        <div className="glist-label">Details</div>
        <div className="card form-card" style={{ marginBottom: 26 }}>
          <TextField
            label="Title"
            value={course.title ?? ''}
            placeholder="Course title"
            onCommit={(v) => patch({ title: v.trim() })}
          />
          <TextAreaField
            label="Description"
            hint="Shown on the landing page and previews."
            value={course.description ?? ''}
            placeholder="What learners walk away with."
            onCommit={(v) => patch({ description: v.trim() || null })}
          />
        </div>

        {/* Instructor */}
        <div className="glist-label">Instructor</div>
        <div className="card form-card" style={{ marginBottom: 26 }}>
          <TextField
            label="Name"
            value={course.instructor_name ?? ''}
            placeholder="Instructor name"
            onCommit={(v) => patch({ instructor_name: v.trim() || null })}
          />
          <TextAreaField
            label="Bio"
            value={course.instructor_bio ?? ''}
            placeholder="Short third-person bio."
            onCommit={(v) => patch({ instructor_bio: v.trim() || null })}
          />
        </div>

        {/* Assistant */}
        <div className="glist-label">Assistant</div>
        <div className="card glist" style={{ marginBottom: 26 }}>
          <ToggleRow
            label="Course assistant"
            hint="An AI tutor that answers from your material."
            on={assistantEnabled}
            onToggle={() => {
              const next = !assistantEnabled
              setAssistantEnabled(next)
              persistAssistant({ assistant_enabled: next })
            }}
          />
          {assistantEnabled && (
            <div className="grow">
              <div className="grow-main">
                <div className="gl">Scope</div>
                <div className="gs">How far it can go beyond your course.</div>
              </div>
              <div className="grow-ctl">
                <select
                  className="input"
                  value={strictness}
                  onChange={(e) => {
                    const next = e.target.value as AssistantStrictness
                    setStrictness(next)
                    persistAssistant({ assistant_strictness: next })
                  }}
                >
                  <option value="course_plus_general">Course + general</option>
                  <option value="course_only">Course only</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom domain — keeps its own layout, themed by .editor-dark. */}
      <CustomDomainSection organization={organization} />
    </div>
  )
}

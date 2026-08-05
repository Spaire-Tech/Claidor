'use client'

// Automations panel — used by the course editor's Automations tab and the
// per-lesson Automations card. Shows a "New automation" action and the
// sequences linked to this course/lesson, grouped in a single bordered card
// that matches the rest of the course editor (see CustomersTab) rather than a
// stack of standalone cards. Opening one launches the standalone automation
// builder under the course and returns here when done.

import {
  useDeleteEmailSequence,
  useEmailSequences,
} from '@/hooks/queries/emailMarketing'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { toast } from '../../Toast/use-toast'

type SequenceRow = {
  id: string
  name: string
  description?: string | null
  trigger_type: string
  status: string
}

export function AutomationsPanel({
  organization,
  courseId,
  lessonId,
  scopeLabel,
}: {
  organization: schemas['Organization']
  courseId?: string
  lessonId?: string
  /** What to call the scope in placeholder copy, e.g. "course" or "lesson". */
  scopeLabel: string
}) {
  const router = useRouter()

  const sequencesQuery = useEmailSequences(organization.id, {
    courseId,
    lessonId,
    limit: 50,
  })

  const sequences: SequenceRow[] = (sequencesQuery.data?.items ?? []) as SequenceRow[]

  // Open the standalone automation builder (the new design). It lives under
  // the course, NOT the email-marketing tabbed area, and returns here when
  // done. The lesson scope rides along as ?lesson_id=.
  const base = courseId
    ? `/dashboard/${organization.slug}/courses/${courseId}/automations`
    : `/dashboard/${organization.slug}/email-marketing/sequences`
  const lessonQs = lessonId ? `?lesson_id=${lessonId}` : ''
  const openNew = () => router.push(`${base}/new${lessonQs}`)
  const openEdit = (sequenceId: string) =>
    router.push(`${base}/${sequenceId}${lessonQs}`)

  const deleteSequence = useDeleteEmailSequence()
  const onDelete = async (row: SequenceRow) => {
    const ok = window.confirm(
      `Delete "${row.name}"? Subscribers currently in this sequence stop receiving its emails. This cannot be undone.`,
    )
    if (!ok) return
    try {
      await deleteSequence.mutateAsync(row.id)
      toast({ title: 'Automation deleted' })
      void sequencesQuery.refetch()
    } catch {
      toast({ title: 'Could not delete automation' })
    }
  }

  const count = sequences.length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-900">
          {count > 0
            ? `${count} automation${count === 1 ? '' : 's'}`
            : `For this ${scopeLabel}`}
        </span>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-gray-800"
        >
          <AddOutlined sx={{ fontSize: 16 }} />
          New automation
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {sequencesQuery.isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Loading automations…
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-900">
              No automations yet
            </p>
            <p className="max-w-sm text-sm text-gray-500">
              Email students automatically on enrolment, lesson completion, and
              other {scopeLabel} events.
            </p>
          </div>
        ) : (
          sequences.map((s) => (
            <SequenceRowItem
              key={s.id}
              row={s}
              onOpen={() => openEdit(s.id)}
              onDelete={() => void onDelete(s)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-ce-accent-tint text-ce-accent'
      : status === 'paused'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-500'
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide capitalize ${cls}`}
    >
      {status}
    </span>
  )
}

function SequenceRowItem({
  row,
  onOpen,
  onDelete,
}: {
  row: SequenceRow
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      className="group flex cursor-pointer items-center justify-between gap-4 border-t border-gray-100 px-6 py-4 transition-colors first:border-t-0 hover:bg-gray-50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          {/* Lightning bolt = the automation's trigger (matches the builder). */}
          <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
            <path d="M13.2 2.8 5.5 13h5l-1.7 8.2L16.5 11h-5l1.7-8.2z" />
          </svg>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-gray-900">
            {row.name}
          </span>
          {row.description ? (
            <span className="truncate text-xs text-gray-500">
              {row.description}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusPill status={row.status} />
        <button
          type="button"
          aria-label="Edit automation"
          title="Edit"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <EditOutlined sx={{ fontSize: 16 }} />
        </button>
        <button
          type="button"
          aria-label="Delete automation"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
        </button>
      </div>
    </div>
  )
}

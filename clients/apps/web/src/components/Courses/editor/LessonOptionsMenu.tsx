'use client'

import { CourseLessonRead } from '@/hooks/queries/courses'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { cn } from '@spaire/ui/lib/utils'
import { ReactNode, useEffect, useRef, useState } from 'react'
// The community's branded date picker + label format ("Thu, Jul 12") — the
// same design the Events tab uses, for brand consistency across schedules.
import '../../Community/hub/hub.css'
import { DatePicker, fmtDateLabel } from '../../Community/hub/pickers'

export type LessonOptionsPatch = {
  published?: boolean
  is_free_preview?: boolean
  release_at?: string | null
  drip_days?: number | null
}

type View = 'main' | 'schedule'
type ScheduleMode = 'always' | 'drip' | 'release'

export function describeLessonSchedule(lesson: CourseLessonRead): string {
  if (lesson.release_at) {
    // Same date design as community event cards ("Thu, Jul 12").
    return `Releases ${fmtDateLabel(toLocalDateInput(lesson.release_at))}`
  }
  if (lesson.drip_days != null) {
    return `Drips ${lesson.drip_days}d after enrollment`
  }
  return 'Schedule…'
}

export function LessonOptionsMenu({
  lesson,
  onUpdate,
  onDelete,
  onClose,
  canSchedule = true,
  allowSchedule = true,
  upgradeTier,
}: {
  lesson: CourseLessonRead
  onUpdate: (patch: LessonOptionsPatch) => void
  onDelete: () => void
  onClose: () => void
  // Drip scheduling is a paid feature; gate the schedule view behind it.
  canSchedule?: boolean
  // Limited series are complete at launch — scheduling doesn't exist for
  // them at all, so the entry is removed entirely (not upsold).
  allowSchedule?: boolean
  upgradeTier?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>('main')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (view === 'schedule') {
    return (
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-full right-0 z-40 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white p-3 text-[12.5px] shadow-xl"
      >
        <SchedulePanel
          releaseAt={lesson.release_at ?? null}
          dripDays={lesson.drip_days ?? null}
          canSchedule={canSchedule}
          upgradeTier={upgradeTier}
          onBack={() => setView('main')}
          onSave={(patch) => {
            onUpdate(patch)
            onClose()
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-full right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-[12.5px] shadow-xl"
    >
      <MenuItem
        icon={<CheckCircleOutlined sx={{ fontSize: 14 }} />}
        label={lesson.published ? 'Unpublish' : 'Publish'}
        onClick={() => {
          onUpdate({ published: !lesson.published })
          onClose()
        }}
      />
      {allowSchedule && (
        <MenuItem
          icon={
            canSchedule ? (
              <ScheduleOutlined sx={{ fontSize: 14 }} />
            ) : (
              <LockOutlined sx={{ fontSize: 14 }} />
            )
          }
          label={
            canSchedule
              ? describeLessonSchedule(lesson)
              : `Drip & scheduling · ${upgradeTier ?? 'paid plan'}`
          }
          onClick={() => setView('schedule')}
        />
      )}
      <MenuItem
        icon={<VisibilityOutlined sx={{ fontSize: 14 }} />}
        label={
          lesson.is_free_preview ? 'Remove free preview' : 'Make free preview'
        }
        onClick={() => {
          onUpdate({ is_free_preview: !lesson.is_free_preview })
          onClose()
        }}
      />
      <div className="my-1 border-t border-gray-100" />
      <MenuItem
        icon={<DeleteOutlineOutlined sx={{ fontSize: 14 }} />}
        label="Delete"
        danger
        onClick={() => {
          onDelete()
          onClose()
        }}
      />
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-50',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center',
          danger ? 'text-red-400' : 'text-gray-400',
        )}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}

function SchedulePanel({
  releaseAt,
  dripDays,
  canSchedule = true,
  upgradeTier,
  onBack,
  onSave,
}: {
  releaseAt: string | null
  dripDays: number | null
  canSchedule?: boolean
  upgradeTier?: string
  onBack: () => void
  onSave: (patch: {
    release_at: string | null
    drip_days: number | null
  }) => void
}) {
  const initialMode: ScheduleMode = releaseAt
    ? 'release'
    : dripDays != null
      ? 'drip'
      : 'always'

  const [mode, setMode] = useState<ScheduleMode>(initialMode)
  // Store as string so the user can backspace through to empty without the
  // input snapping back to "0" mid-edit.
  const [daysInput, setDaysInput] = useState<string>(
    dripDays != null ? String(dripDays) : '7',
  )
  const [date, setDate] = useState<string>(
    releaseAt ? toLocalDateInput(releaseAt) : '',
  )

  const save = () => {
    if (mode === 'always') {
      onSave({ release_at: null, drip_days: null })
    } else if (mode === 'drip') {
      const parsed = parseInt(daysInput, 10)
      const safe = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      onSave({ release_at: null, drip_days: safe })
    } else {
      // Anchor the picked YYYY-MM-DD to local midnight so that round-tripping
      // through `toLocaleDateString` keeps the same calendar day for users
      // west of UTC.
      const iso = date ? new Date(`${date}T00:00:00`).toISOString() : null
      onSave({ release_at: iso, drip_days: null })
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900"
        >
          <ArrowBackOutlined sx={{ fontSize: 12 }} />
          Back
        </button>
        <span className="text-[11px] font-semibold tracking-[0.06em] text-gray-500 uppercase">
          Lesson schedule
        </span>
      </div>

      {!canSchedule ? (
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
            Drip and scheduled release are on the {upgradeTier ?? 'paid'} plan
            and up. Upgrade to unlock this lesson on a delay after enrollment or
            on a fixed date.
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-gray-300 px-3 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <ModeRow
              selected={mode === 'always'}
              onSelect={() => setMode('always')}
              label="Available immediately"
              description="Visible as soon as the student enrolls."
            />
            <ModeRow
              selected={mode === 'drip'}
              onSelect={() => setMode('drip')}
              label="Drip after enrollment"
              description="Unlock N days after the student enrolls."
            />
            {mode === 'drip' && (
              <div className="mt-1 ml-7 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={daysInput}
                  onChange={(e) => setDaysInput(e.target.value)}
                  className="focus:border-ce-accent focus:ring-ce-accent-ring w-16 rounded-lg border border-gray-300 px-2 py-1 text-[12.5px] focus:ring-2 focus:outline-none"
                />
                <span className="text-[12px] text-gray-600">
                  day{daysInput === '1' ? '' : 's'} after enrollment
                </span>
              </div>
            )}
            <ModeRow
              selected={mode === 'release'}
              onSelect={() => setMode('release')}
              label="Release on a date"
              description="Unlock for everyone on a fixed date."
            />
            {mode === 'release' && (
              <div className="spaire-hub mt-1 ml-7">
                <DatePicker value={date} onChange={setDate} />
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-2.5">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-gray-300 px-3 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-full bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-gray-800"
            >
              Save
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Pull the local YYYY-MM-DD out of an ISO timestamp so the <input type=date>
// shows the same calendar day the user originally picked.
function toLocalDateInput(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function ModeRow({
  selected,
  onSelect,
  label,
  description,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-start gap-2.5 rounded-lg p-1.5 text-left hover:bg-gray-50"
    >
      <span
        className={cn(
          'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-ce-accent' : 'border-gray-300',
        )}
      >
        {selected && <span className="bg-ce-accent h-1.5 w-1.5 rounded-full" />}
      </span>
      <div className="flex-1">
        <div className="text-[12.5px] font-medium text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{description}</div>
      </div>
    </button>
  )
}

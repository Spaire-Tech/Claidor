'use client'

import {
  fetchAllCourseEnrollments,
  useCourseEnrollments,
  useRevokeCourseEnrollment,
  type CourseEnrollmentProgress,
  type CourseEnrollmentRead,
} from '@/hooks/queries/courses'
import useDebounce from '@/utils/useDebounce'
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined'
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import { useEffect, useState } from 'react'
import { timeAgo } from '../../Community/hub/format'
import { toast } from '../../Toast/use-toast'

const PAGE_SIZE = 50

type CustomerRow = {
  id: string
  enrollmentId: string
  name: string
  email: string
  avatar_url: string | null
  joined: string | null
  progress: CourseEnrollmentProgress | null
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function enrollmentToRow(e: CourseEnrollmentRead): CustomerRow {
  return {
    id: e.id,
    enrollmentId: e.id,
    name: e.customer?.name || e.customer?.email.split('@')[0] || 'Student',
    email: e.customer?.email ?? '—',
    avatar_url: e.customer?.avatar_url ?? null,
    joined: e.enrolled_at,
    progress: e.progress ?? null,
  }
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadCsv(rows: CustomerRow[], suffix?: string): void {
  const header = [
    'Name',
    'Email',
    'Joined',
    'Completed Lessons',
    'Total Lessons',
    'Completion %',
    'Last Active',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.email,
        r.joined ?? '',
        r.progress ? String(r.progress.completed_lessons) : '',
        r.progress ? String(r.progress.total_lessons) : '',
        r.progress ? String(r.progress.completion_percent) : '',
        r.progress?.last_active_at ?? '',
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `customers-${suffix ? `${suffix}-` : ''}${new Date()
    .toISOString()
    .slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ProgressCell({
  progress,
}: {
  progress: CourseEnrollmentProgress | null
}) {
  if (!progress || progress.total_lessons === 0) {
    return <span className="text-gray-400">—</span>
  }
  const percent = Math.min(100, Math.max(0, progress.completion_percent))
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">
          {Math.round(percent)}%
        </span>
        <span className="text-xs text-gray-500">
          {progress.completed_lessons}/{progress.total_lessons} lessons
          {progress.started_lessons > 0 && (
            <> · {progress.started_lessons} in progress</>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export function CustomersTab({ courseId }: { courseId: string }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  // Search runs server-side (the list is paginated — filtering only the
  // loaded page would miss students on other pages), so debounce
  // keystrokes and start over from page 1 on a new query.
  const debouncedQuery = useDebounce(query.trim(), 300)
  useEffect(() => setPage(1), [debouncedQuery])

  const {
    data: enrollmentsPage,
    isLoading,
    isError,
    refetch,
  } = useCourseEnrollments(courseId, {
    page,
    limit: PAGE_SIZE,
    query: debouncedQuery,
  })
  const enrollments = enrollmentsPage?.items
  const totalStudents = enrollmentsPage?.pagination.total_count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE))
  const revoke = useRevokeCourseEnrollment(courseId)

  // Removing the last student on the final page (or a shrinking result
  // set) can leave `page` pointing past the end — snap back so the tab
  // doesn't show a bogus empty state with no pager to escape it.
  useEffect(() => {
    if (enrollmentsPage && page > totalPages) setPage(totalPages)
  }, [enrollmentsPage, page, totalPages])

  const visibleRows: CustomerRow[] = (enrollments ?? []).map(enrollmentToRow)

  const handleRemove = async (row: CustomerRow) => {
    if (
      !confirm(
        `Remove ${row.name} from this course?\n\n` +
          'This also revokes the course access granted by their purchase, ' +
          'so a subscription renewal won’t silently re-enroll them. They ' +
          'regain access if they buy the course again or their ' +
          'subscription re-activates — with their progress intact.',
      )
    ) {
      return
    }
    try {
      await revoke.mutateAsync(row.enrollmentId)
      toast({ title: `Removed ${row.name}` })
    } catch {
      toast({ title: 'Failed to remove student' })
    }
  }

  const handleDownloadCsv = async () => {
    if (exporting) return
    setExporting(true)
    try {
      // Export every student, not just the loaded page. An active search
      // narrows the export to the matching students — the filename and
      // toast say so, so a filtered file isn't mistaken for the roster.
      const all = await fetchAllCourseEnrollments(courseId, debouncedQuery)
      const rows = all.map(enrollmentToRow)
      if (rows.length === 0) {
        toast({ title: 'No customers to export yet' })
        return
      }
      downloadCsv(rows, debouncedQuery ? 'filtered' : undefined)
      toast({
        title: debouncedQuery
          ? `Exported ${rows.length} customers matching “${debouncedQuery}”`
          : `Exported ${rows.length} customers`,
      })
    } catch {
      toast({ title: 'Export failed — please try again' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium text-gray-900">
            Customers{!isLoading && !isError ? ` (${totalStudents})` : ''}
          </h1>
          <p className="mt-1 text-gray-500">
            Students enrolled in this course. Instructors preview with their
            own account and are not listed here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Download CSV'}
            <FileDownloadOutlined sx={{ fontSize: 16 }} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="relative border-b border-gray-100 px-4 py-3">
          <SearchOutlined
            className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-gray-400"
            fontSize="small"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers"
            className="focus:border-ce-accent focus:ring-ce-accent-ring w-full rounded-lg border border-transparent bg-transparent py-1.5 pr-3 pl-8 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr_0.6fr] gap-4 px-6 py-3 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
          <span>Name</span>
          <span>Progress</span>
          <span>Last Active</span>
          <span>Joined</span>
          <span className="text-right">Actions</span>
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-red-600">
              Couldn&apos;t load customers. Check your connection and try
              again.
            </p>
            <button
              onClick={() => refetch()}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Loading customers…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            {debouncedQuery
              ? 'No customers match your search.'
              : 'No students enrolled yet.'}
          </div>
        ) : (
          visibleRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[2fr_1.4fr_1fr_1fr_0.6fr] items-center gap-4 border-t border-gray-100 px-6 py-4 text-sm text-gray-900"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  name={row.name}
                  avatar_url={row.avatar_url}
                  className="h-10 w-10 text-sm"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-gray-900">
                    {row.name}
                  </span>
                  <span className="truncate text-xs text-gray-500">
                    {row.email}
                  </span>
                </div>
              </div>
              <ProgressCell progress={row.progress} />
              <span className="text-gray-700">
                {timeAgo(row.progress?.last_active_at) || '—'}
              </span>
              <span className="text-gray-700">{formatDate(row.joined)}</span>
              <span className="flex justify-end">
                <button
                  onClick={() => handleRemove(row)}
                  disabled={revoke.isPending}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Remove student"
                >
                  <DeleteOutlineOutlined sx={{ fontSize: 14 }} />
                  Remove
                </button>
              </span>
            </div>
          ))
        )}

        {!isError && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
            <span className="text-xs text-gray-500">
              Page {Math.min(page, totalPages)} of {totalPages} ·{' '}
              {totalStudents} student{totalStudents === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeftOutlined sx={{ fontSize: 14 }} />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                Next
                <ChevronRightOutlined sx={{ fontSize: 14 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

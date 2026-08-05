'use client'

import {
  useCustomerCourses,
  type CustomerCourseEnrollment,
} from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'
import { CheckIcon } from '../_components/icons'
import { PortalLoading } from '../_components/PortalLoading'

type Filter = 'all' | 'in_progress' | 'completed'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

const formatCompletedDate = (iso: string | null): string | null => {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

const isCompleted = (e: CustomerCourseEnrollment) =>
  e.progress.total_lessons > 0 &&
  e.progress.completed_lessons >= e.progress.total_lessons

const CourseCard = ({
  enrollment,
  organizationSlug,
  searchString,
  index,
}: {
  enrollment: CustomerCourseEnrollment
  organizationSlug: string
  searchString: string
  index: number
}) => {
  const completed = isCompleted(enrollment)
  const completedLabel = completed
    ? formatCompletedDate(enrollment.completed_at)
    : null
  const progressPct = Math.round(enrollment.progress.completion_percent)

  const href =
    `/${organizationSlug}/portal/courses/${enrollment.course.id}` +
    (searchString ? `?${searchString}` : '')

  const thumb = enrollment.course.thumbnail_url
  const objectPosition = enrollment.course.thumbnail_object_position || 'center'

  return (
    <Link
      href={href}
      className="sp-card sp-fade-in"
      style={{
        animationDelay: `${Math.min(index, 8) * 35}ms`,
      }}
    >
      <div className="sp-card-media">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" style={{ objectPosition }} />
        ) : (
          <div className="sp-card-media-fallback">Masterclass</div>
        )}
      </div>
      <div className="sp-card-body">
        <h3 className="sp-card-title">
          {enrollment.course.title || 'Untitled course'}
        </h3>
        <div className="sp-card-meta">
          {completed ? (
            <>
              <span className="sp-check" aria-hidden>
                <CheckIcon />
              </span>
              <span>
                {completedLabel ? `Completed ${completedLabel}` : 'Completed'}
              </span>
            </>
          ) : enrollment.progress.total_lessons === 0 ? (
            <span>{enrollment.course.lesson_count} lessons</span>
          ) : (
            <>
              <div
                className="sp-progress"
                aria-label={`${progressPct}% complete`}
              >
                <i style={{ width: `${progressPct}%` }} />
              </div>
              <span className="sp-progress-pct">{progressPct}%</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

const CoursesPage = ({
  organization,
  customerSessionToken,
}: {
  organization: schemas['CustomerOrganization']
  customerSessionToken: string
}) => {
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const { data: enrollments, isLoading } =
    useCustomerCourses(customerSessionToken)

  const [filter, setFilter] = React.useState<Filter>('all')

  const completedCount = (enrollments ?? []).filter(isCompleted).length
  const total = (enrollments ?? []).length

  const filtered = React.useMemo(() => {
    const list = enrollments ?? []
    if (filter === 'completed') return list.filter(isCompleted)
    if (filter === 'in_progress') return list.filter((e) => !isCompleted(e))
    return list
  }, [enrollments, filter])

  return (
    <div className="sp-route">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Masterclasses</h1>
          {!isLoading && (
            <p className="sp-page-sub">
              {total === 0
                ? 'Your masterclasses will appear here once you enroll.'
                : `${total} masterclass${total === 1 ? '' : 'es'} in your library — ${completedCount} completed`}
            </p>
          )}
        </div>
      </div>

      <div className="sp-chips" role="tablist" aria-label="Masterclass filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            type="button"
            aria-selected={filter === f.id}
            className={'sp-chip' + (filter === f.id ? ' is-active' : '')}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PortalLoading variant="inline" />
      ) : filtered.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-title">
            {total === 0
              ? 'No masterclasses yet'
              : filter === 'completed'
                ? 'No completed masterclasses yet'
                : 'Nothing in progress'}
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            {total === 0
              ? 'Masterclasses you have access to will appear here.'
              : 'Keep going — your progress will show up here.'}
          </div>
          {filter !== 'all' && total > 0 && (
            <button
              type="button"
              className="sp-btn is-ghost"
              onClick={() => setFilter('all')}
            >
              View all masterclasses
            </button>
          )}
        </div>
      ) : (
        <div className="sp-grid">
          {filtered.map((enrollment, i) => (
            <CourseCard
              key={enrollment.enrollment_id}
              enrollment={enrollment}
              organizationSlug={organization.slug}
              searchString={searchString}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default CoursesPage

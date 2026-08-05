'use client'

import { PortalLoading } from '@/app/(main)/[organization]/portal/_components/PortalLoading'
import {
  type CommunityCourseSummary,
  useCommunityEnrolledCourses,
} from '@/hooks/queries/community'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import styles from './community.module.css'
import { IconChat } from './icons'

type Props = {
  organizationSlug: string
  customerSessionToken: string
}

export function CommunityPicker({
  organizationSlug,
  customerSessionToken,
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: courses, isLoading } =
    useCommunityEnrolledCourses(customerSessionToken)

  const enabledCourses = useMemo<CommunityCourseSummary[]>(
    () => (courses ?? []).filter((c) => c.community_enabled),
    [courses],
  )

  const qs = useMemo(() => searchParams.toString(), [searchParams])
  const courseHref = (courseId: string) => {
    const path = `/${organizationSlug}/portal/courses/${courseId}/community`
    return qs ? `${path}?${qs}` : path
  }

  // Auto-redirect when there's exactly one enabled community — the
  // picker is useless for a one-item list.
  useEffect(() => {
    if (!courses) return
    if (enabledCourses.length === 1) {
      router.replace(courseHref(enabledCourses[0].course_id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, enabledCourses, router])

  if (isLoading) {
    return <PortalLoading />
  }

  // Distinguish "no enrollments" from "enrolled but no community is on"
  // so the empty-state copy is honest in either case.
  const hasEnrollments = (courses?.length ?? 0) > 0

  if (!hasEnrollments) {
    return (
      <div className={styles.root}>
        <main className={styles.main}>
          <header className={styles.feedHeader}>
            <div className={styles.feedEyebrow}>Community</div>
            <h1 className={styles.feedTitle}>No communities yet</h1>
          </header>
          <p
            className={styles.empty}
            style={{ marginTop: 20, padding: '40px 0' }}
          >
            Enroll in a course to join its community.
          </p>
        </main>
      </div>
    )
  }

  if (enabledCourses.length === 0) {
    return (
      <div className={styles.root}>
        <main className={styles.main}>
          <header className={styles.feedHeader}>
            <div className={styles.feedEyebrow}>Community</div>
            <h1 className={styles.feedTitle}>Nothing open yet</h1>
          </header>
          <p
            className={styles.empty}
            style={{ marginTop: 20, padding: '40px 0' }}
          >
            None of your instructors have opened the community on their courses
            yet. Check back soon.
          </p>
        </main>
      </div>
    )
  }

  if (enabledCourses.length === 1) {
    // Redirecting to the community hub — keep the boot loader up so the
    // hop reads as one continuous load instead of a flash of empty page.
    return <PortalLoading />
  }

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        <header className={styles.feedHeader}>
          <div className={styles.feedEyebrow}>Community</div>
          <h1 className={styles.feedTitle}>Pick a community</h1>
        </header>
        <p
          style={{
            marginTop: 12,
            color: 'var(--c-muted)',
            fontSize: 14,
          }}
        >
          {enabledCourses.length} of your courses have community open.
        </p>

        <div
          style={{
            marginTop: 36,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {enabledCourses.map((c) => (
            <Link
              key={c.course_id}
              href={courseHref(c.course_id)}
              style={{
                display: 'block',
                borderRadius: 18,
                background: 'var(--c-bg)',
                border: '1px solid var(--c-hair)',
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'border-color 0.12s ease, transform 0.12s ease',
              }}
            >
              <div
                style={{
                  aspectRatio: '16 / 9',
                  background: c.course_thumbnail_url
                    ? `url(${c.course_thumbnail_url}) center / cover`
                    : 'linear-gradient(135deg, #0A84FF, #0056B3)',
                  backgroundPosition:
                    c.course_thumbnail_object_position ?? 'center',
                }}
              />
              <div style={{ padding: '16px 18px' }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '-0.012em',
                    color: 'var(--c-ink)',
                  }}
                >
                  {c.course_title ?? 'Untitled course'}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12.5,
                    color: 'var(--c-muted)',
                  }}
                >
                  <IconChat size={13} /> Open community
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}

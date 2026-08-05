'use client'

import { CommunityHub } from '@/components/Community/hub/CommunityHub'
import { type CourseRead } from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'

type Props = {
  course: CourseRead
  organization: schemas['Organization']
  dark?: boolean
}

// The community surface now lives inside the course editor as a tab (like
// Outline / Landing), with the hub's embedded breadcrumb status bar. The
// editor header owns the universal dark toggle, so the hub renders in
// `embedded` mode (no full-page nav, no theme toggle, no draft pill) and the
// editor controls its theme.
export function CommunityTab({ course, organization, dark }: Props) {
  return (
    <CommunityHub
      course={course}
      organization={organization}
      embedded
      dark={dark}
    />
  )
}

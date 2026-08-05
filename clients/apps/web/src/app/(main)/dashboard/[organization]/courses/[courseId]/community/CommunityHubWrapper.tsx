'use client'

import { CommunityHub } from '@/components/Community/hub/CommunityHub'
import { useCourseById } from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'

export default function CommunityHubWrapper({
  organization,
  courseId,
}: {
  organization: schemas['Organization']
  courseId: string
}) {
  const { data: course, isLoading, error } = useCourseById(courseId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">Course not found.</p>
      </div>
    )
  }

  return <CommunityHub organization={organization} course={course} />
}

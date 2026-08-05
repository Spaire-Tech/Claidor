import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'
import CourseEditorWrapper from './CourseEditorWrapper'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Course Editor' }
}

export default async function Page(props: {
  params: Promise<{ organization: string; courseId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(api, params.organization)

  return (
    <CourseEditorWrapper
      organization={organization}
      courseId={params.courseId}
    />
  )
}

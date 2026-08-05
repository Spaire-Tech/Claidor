import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { AutomationBuilderRoute } from '@/components/Courses/automation/AutomationBuilderRoute'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Edit automation' }
}

export default async function Page(props: {
  params: Promise<{ organization: string; courseId: string; sequenceId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )
  return (
    <AutomationBuilderRoute
      organization={organization}
      courseId={params.courseId}
      sequenceId={params.sequenceId}
    />
  )
}

import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationOrNotFound } from '@/utils/customerPortal'
import { redirect } from 'next/navigation'
import LessonViewerPage from './LessonViewerPage'

export default async function Page(props: {
  params: Promise<{ organization: string; courseId: string }>
  searchParams: Promise<{
    customer_session_token?: string
    member_session_token?: string
    lesson?: string
  }>
}) {
  const { customer_session_token, member_session_token, lesson } =
    await props.searchParams
  const params = await props.params
  const token = customer_session_token ?? member_session_token

  const api = await getServerSideAPI(token)
  const { organization } = await getOrganizationOrNotFound(
    api,
    params.organization,
  )

  if (!token) {
    redirect(`/${organization.slug}/portal/request`)
  }

  return (
    <LessonViewerPage
      organization={organization}
      courseId={params.courseId}
      customerSessionToken={token}
      initialLessonId={lesson}
    />
  )
}

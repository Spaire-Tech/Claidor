import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import OrganizationAccessTokensSettings from '@/components/Settings/OrganizationAccessTokensSettings'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'API' }
}

export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )

  return (
    <DashboardBody title="API" wrapperClassName="max-w-(--breakpoint-sm)!">
      <OrganizationAccessTokensSettings organization={organization} />
    </DashboardBody>
  )
}

import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'
import { NewSequenceRoute } from '../../../_components/screens/NewSequenceScreen'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Edit sequence · Email Marketing' }
}

export default async function Page(props: {
  params: Promise<{ organization: string; sequenceId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )
  return (
    <NewSequenceRoute
      organization={organization}
      sequenceId={params.sequenceId}
    />
  )
}

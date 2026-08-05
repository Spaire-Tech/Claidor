import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'
import { BroadcastComposer } from '../../../_components/composer/BroadcastComposer'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Edit broadcast · Email Marketing' }
}

export default async function Page(props: {
  params: Promise<{ organization: string; broadcastId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )
  return (
    <BroadcastComposer
      organization={organization}
      broadcastId={params.broadcastId}
    />
  )
}

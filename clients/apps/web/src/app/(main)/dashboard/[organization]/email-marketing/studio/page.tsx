import { Metadata } from 'next'

import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'

import { BroadcastStudioV3 } from '../_components/screens/BroadcastStudioV3'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Email studio · Email Marketing' }
}

export default async function Page(props: {
  params: Promise<{ organization: string }>
  searchParams: Promise<{ course?: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )
  return (
    <BroadcastStudioV3
      organization={organization}
      courseId={searchParams.course}
    />
  )
}

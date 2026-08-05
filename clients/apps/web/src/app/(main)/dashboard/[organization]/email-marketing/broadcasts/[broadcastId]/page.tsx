import { Metadata } from 'next'
import { BroadcastDetailRoute } from '../../_components/screens/BroadcastDetailScreen'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Broadcast · Email Marketing' }
}

export default async function Page(props: {
  params: Promise<{ organization: string; broadcastId: string }>
}) {
  const params = await props.params
  return (
    <BroadcastDetailRoute
      organizationSlug={params.organization}
      broadcastId={params.broadcastId}
    />
  )
}

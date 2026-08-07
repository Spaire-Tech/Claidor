import DecisionPage from '@/components/Bibliotheque/DecisionPage'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Bibliothèque — Décision',
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string; decisionId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  await getOrganizationBySlugOrNotFound(api, params.organization)
  return (
    <DecisionPage
      organization={params.organization}
      decisionId={params.decisionId}
    />
  )
}

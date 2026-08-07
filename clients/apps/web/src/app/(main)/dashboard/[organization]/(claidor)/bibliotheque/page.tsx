import BibliothequePage from '@/components/Bibliotheque/BibliothequePage'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Bibliothèque',
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  await getOrganizationBySlugOrNotFound(api, params.organization)
  return <BibliothequePage organization={params.organization} />
}

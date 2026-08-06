import ArticlePage from '@/components/Bibliotheque/ArticlePage'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Bibliothèque — Article',
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string; articleId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  await getOrganizationBySlugOrNotFound(api, params.organization)
  return (
    <ArticlePage
      organization={params.organization}
      articleId={params.articleId}
    />
  )
}

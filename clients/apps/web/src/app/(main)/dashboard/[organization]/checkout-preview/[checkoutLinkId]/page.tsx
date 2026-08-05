import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { notFound } from 'next/navigation'
import { CheckoutLinkPreviewPage } from './CheckoutLinkPreviewPage'

export default async function Page(props: {
  params: Promise<{ organization: string; checkoutLinkId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()

  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )

  const { data: checkoutLink } = await api.GET('/v1/checkout-links/{id}', {
    params: { path: { id: params.checkoutLinkId } },
  })

  if (!checkoutLink || checkoutLink.organization_id !== organization.id) {
    notFound()
  }

  return (
    <CheckoutLinkPreviewPage
      organization={organization}
      checkoutLink={checkoutLink}
    />
  )
}

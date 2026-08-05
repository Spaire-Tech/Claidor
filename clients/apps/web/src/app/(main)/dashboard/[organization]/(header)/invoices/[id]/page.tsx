import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { Metadata } from 'next'
import InvoicePage from '../../sales/invoices/[id]/InvoicePage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Invoice',
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string; id: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )

  return <InvoicePage organization={organization} invoiceId={params.id} />
}

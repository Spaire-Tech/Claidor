import { redirect } from 'next/navigation'

export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  redirect(`/dashboard/${params.organization}/sales/invoices/new`)
}

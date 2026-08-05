import { redirect } from 'next/navigation'

export default function Page({
  params,
}: {
  params: { organization: string }
}) {
  redirect(`/dashboard/${params.organization}/integrations/setup-checkout`)
}

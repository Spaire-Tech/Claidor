import { redirect } from 'next/navigation'

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization } = await params
  redirect(`/dashboard/${organization}/founder-tools/perks`)
}

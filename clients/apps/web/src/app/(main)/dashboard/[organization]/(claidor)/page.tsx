import { redirect } from 'next/navigation'

/** The workspace root is the Assistant — the front door of the v1 design. */
export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  redirect(`/dashboard/${params.organization}/assistant`)
}

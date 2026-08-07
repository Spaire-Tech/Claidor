import { redirect } from 'next/navigation'

/**
 * The organization root lands on the Assistant — the front door of the v1
 * design. The inherited payments overview this page used to render is not
 * Claidor's home; the old screens stay reachable at their own routes while
 * they migrate to the new shell.
 */
export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  redirect(`/dashboard/${params.organization}/assistant`)
}

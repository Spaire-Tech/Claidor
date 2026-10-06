import { getServerSideAPI } from '@/utils/client/serverside'
import { getUserOrganizations } from '@/utils/user'
import { redirect } from 'next/navigation'

/**
 * `GET /v1/plans/subscription`, read on the server: the synced copy of
 * the person's Stripe subscription (docs/services-billing.md). The
 * generated client does not know the path yet (see
 * `hooks/queries/plans.ts`), so the call is untyped here too. Any
 * failure reads as "has a plan": the window's own 402 says the rest, and
 * a billing outage must not lock people out of their agents.
 */
const needsAPlan = async (): Promise<boolean> => {
  try {
    const api = await getServerSideAPI()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (api as unknown as any).GET(
      '/v1/plans/subscription',
    )
    if (error || !data) return false
    return data.tier === 'inactive'
  } catch {
    return false
  }
}

/**
 * The root of an organization. Simeon on the web (4 October 2026) is the
 * window at /app, so a signed-in person goes straight there; until then
 * this page said Simeon ran in the Mac app and there was nothing to
 * manage here. The query string survives the hop, as it does on
 * /dashboard: a connector's callback lands its verdict there.
 *
 * With billing on and no plan (5 October 2026), the person goes to the
 * billing page first, as the Mac sign-in does: the window cannot do
 * anything for them until a card is on file.
 */
export default async function Page(props: {
  params: Promise<{ organization: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { organization: slug } = await props.params
  const searchParams = await props.searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }

  const api = await getServerSideAPI()
  const organizations = await getUserOrganizations(api)
  const organization = organizations.find((item) => item.slug === slug)
  if (organization && (await needsAPlan())) {
    redirect('/billing?plan=standard')
  }

  redirect(query.size > 0 ? `/app?${query.toString()}` : '/app')
}

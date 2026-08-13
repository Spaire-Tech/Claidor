import { getServerSideAPI } from '@/utils/client/serverside'
import { getLastVisitedOrg } from '@/utils/cookies'
import {
  creatorOnboardingEnabled,
  provisionWorkspace,
} from '@/utils/creatorOnboarding'
import { getAuthenticatedUser, getUserOrganizations } from '@/utils/user'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The query string survives the hop to the organization page. The
  // Microsoft connector's callback lands the popup on plain /dashboard
  // with its verdict in the query — ?connector=failed&reason=… — and
  // this redirect used to drop it, which is how the first real
  // connection attempt failed with the explanation thrown away in
  // transit.
  const searchParams = await props.searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }
  const carried = query.size > 0 ? `?${query.toString()}` : ''

  const api = await getServerSideAPI()
  const userOrganizations = await getUserOrganizations(api, true)

  if (userOrganizations.length === 0) {
    // With onboarding off, a first-time user gets a workspace instead of a
    // form. If provisioning fails for a reason we can't paper over, fall
    // through to the manual page rather than leaving them on a dead end.
    if (!creatorOnboardingEnabled()) {
      const user = await getAuthenticatedUser()
      const organization = user ? await provisionWorkspace(api, user) : null
      if (organization) {
        redirect(`/dashboard/${organization.slug}${carried}`)
      }
    }
    redirect('/dashboard/create')
  }

  const lastVisitedOrg = getLastVisitedOrg(await cookies(), userOrganizations)
  const organization = lastVisitedOrg ? lastVisitedOrg : userOrganizations[0]
  redirect(`/dashboard/${organization.slug}${carried}`)
}

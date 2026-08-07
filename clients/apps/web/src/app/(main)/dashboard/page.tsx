import { getServerSideAPI } from '@/utils/client/serverside'
import { getLastVisitedOrg } from '@/utils/cookies'
import {
  creatorOnboardingEnabled,
  provisionWorkspace,
} from '@/utils/creatorOnboarding'
import { getAuthenticatedUser, getUserOrganizations } from '@/utils/user'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Page() {
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
        redirect(`/dashboard/${organization.slug}`)
      }
    }
    redirect('/dashboard/create')
  }

  const lastVisitedOrg = getLastVisitedOrg(await cookies(), userOrganizations)
  const organization = lastVisitedOrg ? lastVisitedOrg : userOrganizations[0]
  redirect(`/dashboard/${organization.slug}`)
}

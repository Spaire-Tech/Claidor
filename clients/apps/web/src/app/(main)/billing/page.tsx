import BillingPage from '@/components/Settings/SimeonTier/BillingPage'
import { PaidTierKey } from '@/hooks/queries/simeonTier'
import { getServerSideAPI } from '@/utils/client/serverside'
import { CONFIG } from '@/utils/config'
import { provisionWorkspace } from '@/utils/creatorOnboarding'
import { getAuthenticatedUser, getUserOrganizations } from '@/utils/user'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Your Simeon plan, card and invoices',
}

const PLANS: readonly PaidTierKey[] = ['standard', 'pro', 'max']

const planOf = (value: string | string[] | undefined): PaidTierKey | null => {
  const key = Array.isArray(value) ? value[0] : value
  return PLANS.find((plan) => plan === key) ?? null
}

/**
 * Only a path on this site or the API's own sign-in confirm page may be
 * the way back. Anything else is dropped, so a link cannot send a person
 * who just saved a card to somebody else's page.
 */
const returnToOf = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    const api = new URL(CONFIG.BASE_URL)
    if (url.origin === api.origin && url.pathname === '/loginDeepControl') {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

/**
 * The person's plan. Everyone signed in has one organisation of their
 * own (the billing engine bills it); a person who signed in from the Mac
 * before this page existed may not, so it is made here as on /dashboard.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const api = await getServerSideAPI()
  let organizations = await getUserOrganizations(api, true)

  if (organizations.length === 0) {
    const user = await getAuthenticatedUser()
    const organization = user ? await provisionWorkspace(api, user) : null
    if (!organization) {
      redirect('/dashboard/create')
    }
    organizations = [organization]
  }

  return (
    <BillingPage
      organization={organizations[0]}
      plan={planOf(searchParams.plan)}
      returnTo={returnToOf(searchParams.return_to)}
      upgraded={searchParams.upgraded === '1'}
    />
  )
}

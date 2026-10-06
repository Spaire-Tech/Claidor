import BillingPage from '@/components/Settings/SimeonTier/BillingPage'
import { PaidTierKey } from '@/hooks/queries/plans'
import { CONFIG } from '@/utils/config'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Your Simeon plan, card and invoices',
}

const PLANS: readonly PaidTierKey[] = ['standard', 'pro', 'max']

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

const planOf = (value: string | string[] | undefined): PaidTierKey | null =>
  PLANS.find((plan) => plan === first(value)) ?? null

/**
 * Only a path on this site or the API's own sign-in confirm page may be
 * the way back. Anything else is dropped, so a link cannot send a person
 * who just saved a card to somebody else's page.
 */
const returnToOf = (value: string | string[] | undefined): string | null => {
  const raw = first(value)
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

/** Stripe's checkout session ids: `cs_` and the id's own characters. */
const checkoutSessionOf = (
  value: string | string[] | undefined,
): string | null => {
  const raw = first(value)
  return raw && /^cs_[A-Za-z0-9_]{1,200}$/.test(raw) ? raw : null
}

/**
 * The person's plan, on Stripe Billing. Nothing is made on the way in:
 * the Stripe customer is made by the first checkout.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  return (
    <BillingPage
      plan={planOf(searchParams.plan)}
      returnTo={returnToOf(searchParams.return_to)}
      upgraded={searchParams.upgraded === '1'}
      checkoutSessionId={checkoutSessionOf(searchParams.checkout_session_id)}
    />
  )
}

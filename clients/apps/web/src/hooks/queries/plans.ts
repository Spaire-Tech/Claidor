import { api } from '@/utils/client'
import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query'
import { defaultRetry } from './retry'

/**
 * Simeon's plans on Stripe Billing (`server/simeon/plans`,
 * docs/services-billing.md). Stripe owns the products, the prices, the
 * trial and the subscription; the server keeps a copy of the
 * subscription, written by webhook, and these hooks read it. Starting a
 * plan is a Stripe Checkout page; changing or ending one, or a card or
 * an invoice, is Stripe's Customer Portal.
 *
 * The generated client does not know these paths until `pnpm generate`
 * runs against a deployed API, so the calls are untyped here, as the
 * platform hooks were.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plansApi = api as unknown as any

export type PaidTierKey = 'standard' | 'pro' | 'max'
export type TierKey = PaidTierKey | 'inactive' | 'unmanaged'
export type BillingInterval = 'month' | 'year'

/** The plans in the order the cards show them. */
export const PAID_TIERS: readonly PaidTierKey[] = ['standard', 'pro', 'max']

export interface Plan {
  tier: PaidTierKey
  name: string
  description: string
  monthly_price_cents: number
  annual_price_cents: number
  weekly_credits: number
  trial_credits: number
  trial_days: number
  monthly_lookup_key: string
  annual_lookup_key: string
}

export interface CurrentSubscription {
  tier: TierKey
  /** Stripe's status, or `none` without a subscription. */
  status: string
  billing_interval: BillingInterval | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  entitlements: {
    tier: TierKey
    weekly_credits: number
    trial_credits: number
  }
}

export const SUBSCRIPTION_KEY = ['plans', 'subscription'] as const

export const usePlans = (): UseQueryResult<{ items: Plan[] }> =>
  useQuery({
    queryKey: ['plans', 'list'],
    queryFn: async () => {
      const { data, error } = await plansApi.GET('/v1/plans/')
      if (error) throw error
      return data as { items: Plan[] }
    },
    retry: defaultRetry,
    staleTime: 5 * 60 * 1000,
  })

export const useMySubscription = (): UseQueryResult<CurrentSubscription> =>
  useQuery({
    queryKey: SUBSCRIPTION_KEY,
    queryFn: async () => {
      const { data, error } = await plansApi.GET('/v1/plans/subscription')
      if (error) throw error
      return data as CurrentSubscription
    },
    retry: defaultRetry,
  })

/** Whether the subscription gives an allowance: trialing, paid, or paid and being retried. */
export const hasPlan = (sub: CurrentSubscription | undefined): boolean =>
  sub !== undefined &&
  sub.tier !== 'inactive' &&
  sub.tier !== 'unmanaged' &&
  ['trialing', 'active', 'past_due'].includes(sub.status)

export const useStartCheckout = () =>
  useMutation({
    mutationFn: async (input: {
      tier: PaidTierKey
      billing_interval: BillingInterval
      success_url?: string
    }): Promise<{ checkout_url: string }> => {
      const { data, error } = await plansApi.POST('/v1/plans/checkout', {
        body: input,
      })
      if (error) throw error
      return data as { checkout_url: string }
    },
  })

export const useOpenPortal = () =>
  useMutation({
    mutationFn: async (
      input: {
        flow?: 'cancel' | 'update' | 'update_confirm' | 'payment_method'
        /** With `update_confirm`: the plan to move to, confirmed on Stripe. */
        tier?: PaidTierKey
        return_url?: string
      } = {},
    ): Promise<{ portal_url: string }> => {
      const { data, error } = await plansApi.POST('/v1/plans/portal', {
        body: input,
      })
      if (error) throw error
      return data as { portal_url: string }
    },
  })

/**
 * The checkout came back before Stripe's webhook did: ask the server to
 * copy the subscription in now, so the page shows the plan at once.
 */
export const useSyncCheckout = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      checkoutSessionId: string,
    ): Promise<CurrentSubscription> => {
      const { data, error } = await plansApi.POST('/v1/plans/sync', {
        body: { checkout_session_id: checkoutSessionId },
      })
      if (error) throw error
      return data as CurrentSubscription
    },
    onSuccess: (sub) => {
      queryClient.setQueryData(SUBSCRIPTION_KEY, sub)
    },
  })
}

// -----------------------------------------------------------------------------
// Words and numbers
// -----------------------------------------------------------------------------

const TIER_DISPLAY_NAME: Record<TierKey, string> = {
  standard: 'Standard',
  pro: 'Pro',
  max: 'Max',
  inactive: 'No plan',
  unmanaged: 'Free',
}

export const tierDisplayName = (tier: TierKey): string =>
  TIER_DISPLAY_NAME[tier] ?? 'No plan'

/** "750,000": credits are big round numbers, shown with separators. */
export const formatCredits = (credits: number): string =>
  new Intl.NumberFormat('en-US').format(credits)

/** 3900 → "39", 3917 → "39.17": never a rounded-away cent. */
export const formatDollarAmount = (cents: number): string =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)

/**
 * One task, the kind that reads a few pages and writes something back,
 * is about 100,000 credits (docs/services-billing.md).
 */
export const CREDITS_PER_TASK = 100_000

export const tasksPerWeek = (weeklyCredits: number): number =>
  Math.round(weeklyCredits / CREDITS_PER_TASK)

/** The card's headline: the monthly figure, or the yearly price over twelve. */
export const headlinePrice = (plan: Plan, interval: BillingInterval): string =>
  interval === 'year'
    ? formatDollarAmount(Math.round(plan.annual_price_cents / 12))
    : formatDollarAmount(plan.monthly_price_cents)

export const annualSavingsPercent = (plan: Plan): number => {
  const yearAtMonthly = plan.monthly_price_cents * 12
  if (yearAtMonthly <= 0) return 0
  return Math.round(
    ((yearAtMonthly - plan.annual_price_cents) / yearAtMonthly) * 100,
  )
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * The one line under the heading: when the trial ends or the plan
 * renews. Null without a plan.
 */
export const renewalSentence = (sub: CurrentSubscription): string | null => {
  if (sub.status === 'trialing') {
    const endIso = sub.trial_end ?? sub.current_period_end
    if (!endIso) return null
    const formatted = formatDate(endIso)
    if (new Date(endIso).getTime() < Date.now()) {
      return `Your trial ended on ${formatted}.`
    }
    if (sub.cancel_at_period_end) {
      return `Your trial is cancelled and continues until ${formatted}. You will not be charged and your plan will not start.`
    }
    return `Your trial ends on ${formatted}. Your card is charged then unless you cancel.`
  }
  if (sub.status === 'past_due') {
    return 'Your last payment failed. Update your card to keep your plan.'
  }
  if (!hasPlan(sub) || !sub.current_period_end) return null
  const formatted = formatDate(sub.current_period_end)
  if (sub.cancel_at_period_end) {
    return `Your plan ends on ${formatted}.`
  }
  return `Your plan is charged ${
    sub.billing_interval === 'year' ? 'yearly' : 'monthly'
  } and renews on ${formatted}.`
}

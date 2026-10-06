import { api } from '@/utils/client'
import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query'
import { defaultRetry } from './retry'

/**
 * The Simeon-tier endpoints are generated into @simeon/client after
 * `pnpm generate` runs against a deployed API. Until that's been
 * regenerated, the typed client doesn't know about these paths and
 * TypeScript would refuse to call api.GET('/v1/platform/plans'). We
 * cast the api to a permissive shape so these hooks compile today;
 * once the generated types catch up, drop the cast and the literal
 * paths in the existing client gain full type-safety automatically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platformApi = api as unknown as any

// -----------------------------------------------------------------------------
// Types — mirror simeon/platform/schemas.py
// -----------------------------------------------------------------------------

export type SimeonTierKey =
  | 'standard'
  | 'pro'
  | 'max'
  // No-plan fallbacks: `inactive` = a person with no active plan;
  // `unmanaged` = dev / self-host (platform billing not configured).
  | 'inactive'
  | 'unmanaged'

export type PaidTierKey = 'standard' | 'pro' | 'max'

/** The plans in the order the cards show them. */
export const PAID_TIERS: readonly PaidTierKey[] = ['standard', 'pro', 'max']

export type BillingInterval = 'month' | 'year'

export interface TransactionFee {
  percent_basis_points: number
  fixed_cents: number
}

export interface TierLimits {
  published_courses: number | null
  lessons_per_course: number | null
  active_email_sequences: number | null
  video_hours_hosted: number | null
  video_views_monthly: number | null
  storage_gb: number | null
  email_subscribers: number | null
  email_sends_monthly: number | null
  dashboard_team_seats: number | null
}

export interface TierFeatures {
  drip_scheduling: boolean
  email_sequences_and_segments: boolean
  email_ab_testing: boolean
  stackable_discounts: boolean
  custom_email_sender_domain: boolean
  seat_based_product_pricing: boolean
  cohort_analytics: boolean
  custom_pricing_negotiation: boolean
  customer_wallet: boolean
  white_label_course_player: boolean
  sandbox_mode: boolean
  custom_storefront_domain: boolean
  custom_checkout_domain: boolean
  sso: boolean
  audit_logs: boolean
}

export interface Entitlements {
  tier: SimeonTierKey
  transaction_fee: TransactionFee
  limits: TierLimits
  features: TierFeatures
  rate_limit_group: string
  monthly_price_cents: number
  /** Credits included each week, Monday to Monday UTC. */
  weekly_credits: number
  /** Credits the 7-day trial includes, once. */
  trial_credits: number
}

export interface TierPlan {
  tier: SimeonTierKey
  name: string
  description: string | null
  product_id: string | null
  annual_product_id: string | null
  monthly_price_cents: number
  annual_price_cents: number | null
  annual_savings_percent: number
  currency: string
  trial_days: number | null
  /** Credits included each week, Monday to Monday UTC. */
  weekly_credits: number
  /** Credits the trial includes, once. */
  trial_credits: number
  transaction_fee: TransactionFee
  features: TierFeatures
  limits: TierLimits
}

export interface CurrentSimeonSubscription {
  tier: SimeonTierKey
  billing_interval: BillingInterval | null
  status: string
  monthly_price_cents: number
  currency: string
  current_period_end: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
  // Set only while status === 'past_due' (a Simeon charge failed). past_due_at
  // is when it first failed; suspension_at is the deadline to pay before the
  // subscription is canceled and the org drops to no-plan.
  past_due_at: string | null
  suspension_at: string | null
  // True only while the active sub is the auto-created Starter trial
  // (managed_by=trial). Flips False once the creator goes through
  // upgrade-checkout. Onboarding review uses this to verify a Stripe
  // checkout actually finished when it sees ?upgraded=1.
  is_default_trial: boolean
  entitlements: Entitlements
}

export interface QuotaUsage {
  quota: string
  limit: number | null
  used: number
  /** Exact usage in display units (e.g. 0.87 GB); `used` floors to 0
   * below one whole unit. Optional for backward compatibility with
   * older API responses. */
  used_exact?: number
  remaining: number | null
  is_unlimited: boolean
  is_exceeded: boolean
}

export interface OrganizationUsage {
  items: QuotaUsage[]
}

export interface UpgradeCheckout {
  checkout_id: string
  checkout_url: string
  client_secret: string
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export const useSimeonPlans: () => UseQueryResult<{ items: TierPlan[] }> = () =>
  useQuery({
    queryKey: ['simeon', 'plans'],
    queryFn: async () => {
      const { data, error } = await platformApi.GET('/v1/platform/plans')
      if (error) throw error
      return data as { items: TierPlan[] }
    },
    retry: defaultRetry,
    staleTime: 5 * 60 * 1000, // 5 minutes — plans rarely change
  })

export const useSimeonSubscription = (
  organizationId: string | undefined,
): UseQueryResult<CurrentSimeonSubscription> =>
  useQuery({
    queryKey: ['simeon', 'subscription', organizationId],
    queryFn: async () => {
      const { data, error } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/subscription',
        { params: { path: { organization_id: organizationId as string } } },
      )
      if (error) throw error
      return data as CurrentSimeonSubscription
    },
    retry: defaultRetry,
    enabled: !!organizationId,
  })

export const useSimeonUsage = (
  organizationId: string | undefined,
): UseQueryResult<OrganizationUsage> =>
  useQuery({
    queryKey: ['simeon', 'usage', organizationId],
    queryFn: async () => {
      const { data, error } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/usage',
        { params: { path: { organization_id: organizationId as string } } },
      )
      if (error) throw error
      return data as OrganizationUsage
    },
    retry: defaultRetry,
    enabled: !!organizationId,
    staleTime: 60 * 1000, // 1 minute — usage updates as events flow
  })

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export const useCreateUpgradeCheckout = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tier: PaidTierKey
      billing_interval?: BillingInterval
      success_url?: string
      billing_email?: string
    }): Promise<UpgradeCheckout> => {
      const { data, error } = await platformApi.POST(
        '/v1/platform/organizations/{organization_id}/upgrade-checkout',
        {
          params: { path: { organization_id: organizationId } },
          body: input,
        },
      )
      if (error) throw error
      return data as UpgradeCheckout
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'subscription', organizationId],
      })
    },
  })
}

export const useSwitchSimeonPlan = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tier: PaidTierKey
      billing_interval?: BillingInterval
    }) => {
      const { data, error } = await platformApi.POST(
        '/v1/platform/organizations/{organization_id}/switch-plan',
        {
          params: { path: { organization_id: organizationId } },
          body: input,
        },
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'subscription', organizationId],
      })
    },
  })
}

export const useCancelSimeonSubscription = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await platformApi.POST(
        '/v1/platform/organizations/{organization_id}/cancel',
        {
          params: { path: { organization_id: organizationId } },
          body: {},
        },
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'subscription', organizationId],
      })
    },
  })
}

export const useCreateCustomerPortalSession = (organizationId: string) =>
  useMutation({
    mutationFn: async (
      input: { return_url?: string } = {},
    ): Promise<{ customer_portal_url: string; token: string }> => {
      const { data, error } = await platformApi.POST(
        '/v1/platform/organizations/{organization_id}/customer-portal-session',
        {
          params: { path: { organization_id: organizationId } },
          body: input,
        },
      )
      if (error) throw error
      return data as { customer_portal_url: string; token: string }
    },
  })

// -----------------------------------------------------------------------------
// Billing management — cards, invoices, billing address (dashboard-native)
//
// These power the in-dashboard Billing sections so a creator never has to
// leave for the customer portal. They hit the platform endpoints added in
// simeon/platform/endpoints.py (list/delete/set-default cards, list orders,
// download invoice, get/update billing address).
// -----------------------------------------------------------------------------

export interface SimeonPaymentMethod {
  id: string
  type: string
  method_metadata: {
    brand?: string
    last4?: string
    exp_month?: number
    exp_year?: number
    [key: string]: unknown
  }
}

export interface SimeonBillingAddress {
  line1: string | null
  line2: string | null
  postal_code: string | null
  city: string | null
  state: string | null
  country: string | null
}

export interface SimeonBillingDetails {
  billing_name: string | null
  billing_address: SimeonBillingAddress | null
  tax_id: [string, string] | null
  default_payment_method_id: string | null
}

export interface SimeonOrder {
  id: string
  created_at: string
  invoice_number: string | null
  description: string
  total_amount: number
  currency: string
  status: string
  refunded_amount: number
  is_invoice_generated: boolean
}

export const useSimeonPaymentMethods = (
  organizationId: string | undefined,
): UseQueryResult<{ items: SimeonPaymentMethod[] }> =>
  useQuery({
    queryKey: ['simeon', 'payment-methods', organizationId],
    queryFn: async () => {
      const { data, error } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/payment-methods',
        { params: { path: { organization_id: organizationId as string } } },
      )
      if (error) throw error
      return data as { items: SimeonPaymentMethod[] }
    },
    retry: defaultRetry,
    enabled: !!organizationId,
  })

export const useSimeonOrders = (
  organizationId: string | undefined,
): UseQueryResult<{ items: SimeonOrder[] }> =>
  useQuery({
    queryKey: ['simeon', 'orders', organizationId],
    queryFn: async () => {
      const { data, error } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/orders',
        {
          params: {
            path: { organization_id: organizationId as string },
            query: { page: 1, limit: 50 },
          },
        },
      )
      if (error) throw error
      return data as { items: SimeonOrder[] }
    },
    retry: defaultRetry,
    enabled: !!organizationId,
  })

export const useSimeonBillingDetails = (
  organizationId: string | undefined,
): UseQueryResult<SimeonBillingDetails> =>
  useQuery({
    queryKey: ['simeon', 'billing-details', organizationId],
    queryFn: async () => {
      const { data, error } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/billing-details',
        { params: { path: { organization_id: organizationId as string } } },
      )
      if (error) throw error
      return data as SimeonBillingDetails
    },
    retry: defaultRetry,
    enabled: !!organizationId,
  })

export const useDeleteSimeonPaymentMethod = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const { error } = await platformApi.DELETE(
        '/v1/platform/organizations/{organization_id}/payment-methods/{payment_method_id}',
        {
          params: {
            path: {
              organization_id: organizationId,
              payment_method_id: paymentMethodId,
            },
          },
        },
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'payment-methods', organizationId],
      })
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'billing-details', organizationId],
      })
    },
  })
}

export const useSetDefaultSimeonPaymentMethod = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const { error } = await platformApi.POST(
        '/v1/platform/organizations/{organization_id}/payment-methods/{payment_method_id}/default',
        {
          params: {
            path: {
              organization_id: organizationId,
              payment_method_id: paymentMethodId,
            },
          },
        },
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'payment-methods', organizationId],
      })
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'billing-details', organizationId],
      })
    },
  })
}

export const useUpdateSimeonBillingDetails = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      billing_name?: string | null
      billing_address?: Partial<SimeonBillingAddress> | null
      tax_id?: string | null
    }): Promise<SimeonBillingDetails> => {
      const { data, error } = await platformApi.PATCH(
        '/v1/platform/organizations/{organization_id}/billing-details',
        {
          params: { path: { organization_id: organizationId } },
          body: input,
        },
      )
      if (error) throw error
      return data as SimeonBillingDetails
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simeon', 'billing-details', organizationId],
      })
    },
  })
}

export const useGetSimeonOrderInvoice = (organizationId: string) =>
  useMutation({
    mutationFn: async (orderId: string): Promise<{ url: string }> => {
      const { data, error } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/orders/{order_id}/invoice',
        {
          params: {
            path: { organization_id: organizationId, order_id: orderId },
          },
        },
      )
      if (error) throw error
      return data as { url: string }
    },
  })

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

export const formatMonthlyPrice = (cents: number, currency = 'usd'): string => {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  })
  return `${formatter.format(dollars)}/mo`
}

/**
 * Format a cents amount as a dollar figure for display, keeping cents
 * only when they're non-zero (e.g. 3900 → "39", 3917 → "39.17") so we
 * never round away real cents or imply exactness we don't have.
 */
export const formatDollarAmount = (cents: number): string =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)

/**
 * Headline price for a plan card, given the user-selected billing
 * interval. Annual subs are displayed as their monthly equivalent
 * (e.g. $39/mo with the "billed annually" subtitle) to match the
 * Webflow / Framer pricing-card pattern. `display` carries cents when
 * the monthly equivalent isn't a whole dollar (e.g. "39.17").
 */
export const headlinePriceForPlan = (
  plan: TierPlan,
  interval: BillingInterval,
): { dollars: number; cents: number; display: string } => {
  if (interval === 'year' && plan.annual_price_cents != null) {
    const monthlyEquivalentCents = Math.round(plan.annual_price_cents / 12)
    return {
      cents: monthlyEquivalentCents,
      dollars: Math.round(monthlyEquivalentCents / 100),
      display: formatDollarAmount(monthlyEquivalentCents),
    }
  }
  return {
    cents: plan.monthly_price_cents,
    dollars: Math.round(plan.monthly_price_cents / 100),
    display: formatDollarAmount(plan.monthly_price_cents),
  }
}

export const formatTransactionFee = (fee: TransactionFee): string => {
  const pct = (fee.percent_basis_points / 100).toFixed(
    fee.percent_basis_points % 100 === 0 ? 0 : 1,
  )
  const dollars = fee.fixed_cents / 100
  return `${pct}% + $${dollars.toFixed(2)}`
}

/**
 * Monthly sales (GMV) at which `higher` becomes cheaper overall than
 * `lower`. Moving up a tier trades a bigger monthly fee for a lower
 * transaction rate, so it pays off once volume is high enough:
 *
 *   breakeven = (monthlyHigher − monthlyLower) / (rateLower − rateHigher)
 *
 * The fixed per-transaction cents are identical across tiers, so they
 * cancel and don't enter the formula. Returns the dollar figure rounded
 * to the nearest $100 for display, or null when `higher` isn't actually
 * a step up (price not higher, or rate not lower) — in which case there's
 * no honest breakeven to show.
 */
export const breakevenGmvDollars = (
  lower: TierPlan,
  higher: TierPlan,
): number | null => {
  const monthlyDiffCents =
    higher.monthly_price_cents - lower.monthly_price_cents
  const rateDiffBps =
    lower.transaction_fee.percent_basis_points -
    higher.transaction_fee.percent_basis_points
  if (monthlyDiffCents <= 0 || rateDiffBps <= 0) return null
  // cents / (bps/10000) = cents * 10000 / bps -> /100 for dollars.
  const dollars = (monthlyDiffCents * 100) / rateDiffBps
  return Math.round(dollars / 100) * 100
}

/**
 * The one line under the heading: when the trial ends or the plan renews.
 * Returns null if there's no active subscription yet (no plan / pre-trial).
 */
export const renewalSentence = (
  sub: CurrentSimeonSubscription,
): string | null => {
  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  if (sub.status === 'trialing') {
    // Prefer the actual trial end; fall back to the period end.
    const endIso = sub.trial_end ?? sub.current_period_end
    if (!endIso) return null
    const formatted = formatDate(endIso)
    // Never promise a future event in the past — the backend converts
    // expired trials, but the UI may see a stale 'trialing' status.
    if (new Date(endIso).getTime() < Date.now()) {
      return `Your trial ended on ${formatted}.`
    }
    if (sub.cancel_at_period_end) {
      return `Your trial is canceled and continues until ${formatted}. You won't be charged and your plan won't start.`
    }
    return `Your trial ends on ${formatted} — your card will be charged then unless you cancel.`
  }

  if (!sub.current_period_end) return null
  const cadence = sub.billing_interval === 'year' ? 'annual' : 'monthly'
  const formatted = formatDate(sub.current_period_end)
  if (sub.cancel_at_period_end) {
    return `Your plan ends on ${formatted}.`
  }
  return `Your plan is charged ${cadence === 'annual' ? 'yearly' : 'monthly'} and renews on ${formatted}.`
}

const TIER_DISPLAY_NAME: Record<SimeonTierKey, string> = {
  standard: 'Standard',
  pro: 'Pro',
  max: 'Max',
  inactive: 'No plan',
  unmanaged: 'Free',
}

export const tierDisplayName = (tier: SimeonTierKey): string =>
  TIER_DISPLAY_NAME[tier] ?? 'No plan'

/** "750,000" — credits are big round numbers, shown with separators. */
export const formatCredits = (credits: number): string =>
  new Intl.NumberFormat('en-US').format(credits)

/**
 * One task, the kind that reads a few pages and writes something back,
 * is about 100,000 credits (docs/services-billing.md). The card says
 * "about 7 tasks a week" next to the exact number.
 */
export const CREDITS_PER_TASK = 100_000

export const tasksPerWeek = (weeklyCredits: number): number =>
  Math.round(weeklyCredits / CREDITS_PER_TASK)

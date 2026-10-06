'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  annualSavingsPercent,
  BillingInterval,
  CurrentSubscription,
  formatCredits,
  hasPlan,
  headlinePrice,
  PAID_TIERS,
  PaidTierKey,
  Plan,
  renewalSentence,
  tasksPerWeek,
  tierDisplayName,
  useMySubscription,
  useOpenPortal,
  usePlans,
  useStartCheckout,
} from '@/hooks/queries/plans'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import Button from '@simeon/ui/components/atoms/Button'
import { useCallback, useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'

interface PlanCardsProps {
  /**
   * Where Stripe Checkout sends the person once the card is saved. The
   * Mac sign-in passes its own confirm page here, so a new person goes
   * card, then app, with nothing in between. Defaults to this page.
   */
  successUrl?: string
  /** The card to open on, from the site's "Try it free" buttons. */
  highlightTier?: PaidTierKey | null
}

/**
 * The three cards (Standard, Pro, Max) with one Monthly/Annual toggle.
 * Starting a plan opens Stripe Checkout; switching or cancelling one
 * opens Stripe's Customer Portal on that step. The card the person is on
 * carries the CURRENT badge.
 */
const PlanCards = ({ successUrl, highlightTier = null }: PlanCardsProps) => {
  const plans = usePlans()
  const subscription = useMySubscription()
  const startCheckout = useStartCheckout()
  const openPortal = useOpenPortal()
  const [intervalOverride, setIntervalOverride] =
    useState<BillingInterval | null>(null)
  const [pending, setPending] = useState<PaidTierKey | 'portal' | null>(null)

  const sub = subscription.data
  const interval: BillingInterval =
    intervalOverride ?? sub?.billing_interval ?? 'month'
  const subscribed = hasPlan(sub)

  const ordered = useMemo<Plan[]>(() => {
    if (!plans.data?.items) return []
    const byTier = new Map(plans.data.items.map((p) => [p.tier, p]))
    return PAID_TIERS.map((t) => byTier.get(t)).filter((p): p is Plan =>
      Boolean(p),
    )
  }, [plans.data])

  const savings = useMemo(() => {
    const values = ordered.map(annualSavingsPercent).filter((v) => v > 0)
    return values.length > 0 ? Math.max(...values) : 0
  }, [ordered])

  const start = useCallback(
    async (tier: PaidTierKey) => {
      setPending(tier)
      try {
        const { checkout_url } = await startCheckout.mutateAsync({
          tier,
          billing_interval: interval,
          success_url: successUrl,
        })
        window.location.assign(checkout_url)
      } catch {
        toast({
          title: 'Could not open the checkout',
          description: 'Please try again in a moment.',
        })
        setPending(null)
      }
    },
    [interval, startCheckout, successUrl],
  )

  const portal = useCallback(
    async (flow: 'cancel' | 'update') => {
      setPending('portal')
      try {
        const { portal_url } = await openPortal.mutateAsync({ flow })
        window.location.assign(portal_url)
      } catch {
        toast({
          title: 'Could not open your billing page',
          description: 'Please try again in a moment.',
        })
        setPending(null)
      }
    },
    [openPortal],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium text-gray-900">Plans</h1>
          {subscription.isLoading ? (
            <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
          ) : (
            <p className="text-sm text-gray-500">
              {(sub && renewalSentence(sub)) ??
                'Pick a plan to start your 7 days free. Your card is charged when the trial ends unless you cancel.'}
            </p>
          )}
        </div>
        <IntervalToggle
          interval={interval}
          onChange={setIntervalOverride}
          savings={savings}
        />
      </div>

      {plans.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[440px] animate-pulse rounded-2xl bg-gray-100"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ordered.map((plan, index) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              previous={index === 0 ? null : ordered[index - 1]}
              interval={interval}
              sub={sub}
              subscribed={subscribed}
              highlighted={highlightTier === plan.tier}
              pending={pending}
              onStart={start}
              onSwitch={() => portal('update')}
              onCancel={() => portal('cancel')}
            />
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-sm text-gray-500">
        A credit is one token of input on the middle model. A typical task is
        about 100,000 credits. Weekly credits reset every Monday and do not
        carry over.
      </p>
    </div>
  )
}

const IntervalToggle = ({
  interval,
  onChange,
  savings,
}: {
  interval: BillingInterval
  onChange: (interval: BillingInterval) => void
  savings: number
}) => (
  <div className="inline-flex items-center gap-x-2">
    <div className="relative inline-flex rounded-full border border-gray-200 bg-white p-1">
      {(['month', 'year'] as const).map((option) => {
        const active = interval === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={twMerge(
              'relative z-10 rounded-full px-4 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-gray-900',
            )}
          >
            {option === 'month' ? 'Monthly' : 'Annual'}
          </button>
        )
      })}
    </div>
    {savings > 0 && (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-500">
        Save {savings}%
      </span>
    )}
  </div>
)

interface PlanCardProps {
  plan: Plan
  previous: Plan | null
  interval: BillingInterval
  sub: CurrentSubscription | undefined
  subscribed: boolean
  highlighted: boolean
  pending: PaidTierKey | 'portal' | null
  onStart: (tier: PaidTierKey) => void
  onSwitch: () => void
  onCancel: () => void
}

const PlanCard = ({
  plan,
  previous,
  interval,
  sub,
  subscribed,
  highlighted,
  pending,
  onStart,
  onSwitch,
  onCancel,
}: PlanCardProps) => {
  const current = subscribed && sub?.tier === plan.tier
  const trialing = current && sub?.status === 'trialing'
  const cancelling = current && Boolean(sub?.cancel_at_period_end)
  const busy = pending !== null
  const lines = featureLines(plan, previous)

  return (
    <div
      className={twMerge(
        'flex flex-col rounded-2xl border bg-white p-6',
        current || highlighted ? 'border-blue-500' : 'border-gray-200',
      )}
    >
      <div className="flex flex-row items-center gap-x-2">
        <h3 className="text-base font-medium text-gray-900">
          {tierDisplayName(plan.tier)}
        </h3>
        {current && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-500">
            {trialing ? 'TRIAL' : 'CURRENT'}
          </span>
        )}
      </div>

      <div className="mt-6 flex flex-col">
        <span className="text-4xl font-medium tracking-tight text-gray-900">
          ${headlinePrice(plan, interval)}
        </span>
        <span className="mt-1 text-sm text-gray-500">
          {interval === 'year'
            ? 'Per month, billed annually'
            : 'Per month, billed monthly'}
        </span>
        {interval === 'year' && (
          <span className="mt-1 text-xs text-blue-500">
            ${formatCredits(plan.annual_price_cents / 100)} billed yearly
          </span>
        )}
        {!subscribed && (
          <span className="mt-1 text-xs text-gray-500">
            {plan.trial_days} days free, then ${headlinePrice(plan, 'month')}
            /month
          </span>
        )}
      </div>

      <div className="mt-6">
        {current ? (
          cancelling ? (
            <Button variant="outline" className="w-full" disabled>
              {trialing ? 'Trial cancelled' : 'Ends at period end'}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full border-blue-500 text-blue-500 hover:bg-blue-50"
              disabled={busy}
              loading={pending === 'portal'}
              onClick={onCancel}
            >
              {trialing ? 'Cancel trial' : 'Cancel'}
            </Button>
          )
        ) : subscribed ? (
          <Button
            className="w-full"
            disabled={busy}
            loading={pending === 'portal'}
            onClick={onSwitch}
          >
            Switch to {tierDisplayName(plan.tier)}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={busy}
            loading={pending === plan.tier}
            onClick={() => onStart(plan.tier)}
          >
            Start free trial
          </Button>
        )}
      </div>

      <ul className="mt-6 flex flex-col gap-y-2">
        {lines.map((line) => (
          <li
            key={line}
            className="flex flex-row items-start gap-x-2 text-sm text-gray-700"
          >
            <CheckOutlined className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const featureLines = (plan: Plan, previous: Plan | null): string[] => {
  const lines = [
    `${formatCredits(plan.weekly_credits)} credits a week, about ${tasksPerWeek(
      plan.weekly_credits,
    )} tasks`,
  ]
  if (previous) {
    lines.push(
      `Everything in ${tierDisplayName(previous.tier)}, ${Math.round(
        plan.weekly_credits / previous.weekly_credits,
      )}× the credits`,
    )
  } else {
    lines.push(
      'Every agent and every feature',
      'A cloud computer for each agent',
      'Routines that run while your Mac is closed',
    )
  }
  lines.push(
    `${formatCredits(plan.trial_credits)} credits during the ${plan.trial_days}-day trial`,
  )
  return lines
}

export default PlanCards

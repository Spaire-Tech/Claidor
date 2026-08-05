'use client'

import { OnboardingProgressBar } from '@/components/Onboarding/OnboardingProgressBar'
import LogoIcon from '@/components/Brand/LogoIcon'
import { toast } from '@/components/Toast/use-toast'
import { BillingInterval, PaidTierKey } from '@/hooks/queries/spaireTier'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import { api } from '@/utils/client'
import { ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'

/**
 * Plan + checkout step of the new-signup flow.
 *
 * Final visible step of onboarding: it sits after OrganizationStep
 * ("Profile basics", at /dashboard/create) and reuses its exact design
 * language — white page, gray-100 bordered cards with shadow-sm, gray-500
 * supporting text and the same blue-600 rounded-full CTA.
 * The creator picks a tier + billing interval, and clicking a card's CTA
 * hands off to upgrade-checkout which converts the trialing subscription in
 * place and redirects to the Polar-hosted checkout. Success returns to
 * /onboarding/review, which invisibly verifies the checkout, marks
 * onboarding complete, and forwards the creator into the course wizard.
 */

// ── Tier copy ───────────────────────────────────────────────────────────────

interface DesignFeature {
  label: ReactNode
  shield?: boolean
}

interface DesignTier {
  tier: PaidTierKey
  name: string
  monthly: number
  annual: number
  recommended: boolean
  includes: ReactNode
  features: DesignFeature[]
}

const TIERS: DesignTier[] = [
  {
    tier: 'starter',
    name: 'Starter',
    monthly: 49,
    annual: 39,
    recommended: false,
    includes: 'Includes',
    features: [
      { label: <>Merchant of Record — Spaire handles tax &amp; VAT</>, shield: true },
      { label: <>7% + $0.30 per transaction</> },
      { label: <>5 published courses</> },
      { label: <>10K email subscribers</> },
      { label: <>25 hours of hosted video</> },
      { label: <>Email sequences, segments &amp; drip</> },
      { label: <>Revenue, MRR &amp; churn analytics</> },
    ],
  },
  {
    tier: 'studio',
    name: 'Studio',
    monthly: 129,
    annual: 103,
    recommended: true,
    includes: (
      <>
        Everything in Starter, <span className="text-gray-400">plus</span>
      </>
    ),
    features: [
      {
        label: (
          <>
            5% + $0.30 per transaction{' '}
            <span className="text-gray-400">(saves 2%)</span>
          </>
        ),
      },
      { label: <>25 published courses</> },
      { label: <>50K email subscribers</> },
      { label: <>Custom email sender domain</> },
      { label: <>Email A/B testing</> },
      { label: <>White-label player &amp; customer wallet</> },
      { label: <>5 team seats</> },
    ],
  },
  {
    tier: 'scale',
    name: 'Scale',
    monthly: 299,
    annual: 239,
    recommended: false,
    includes: (
      <>
        Everything in Studio, <span className="text-gray-400">plus</span>
      </>
    ),
    features: [
      {
        label: (
          <>
            3% + $0.30 per transaction{' '}
            <span className="text-gray-400">(saves 4%)</span>
          </>
        ),
      },
      { label: <>100 published courses</> },
      { label: <>150K email subscribers</> },
      { label: <>200 video hours · 250 GB storage</> },
      { label: <>20 team seats · audit logs</> },
      { label: <>Slack + dedicated AM · 4-hr SLA</> },
      { label: <>Custom pricing above $50k/mo GMV</> },
    ],
  },
]

const BILLING_STORAGE_KEY = 'spaire_billing_cycle'

export default function PlanPage() {
  const { organization } = useContext(OrganizationContext)
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [pending, setPending] = useState<PaidTierKey | null>(null)

  // Restore the creator's last-picked billing cycle. Read after mount to
  // avoid hydration mismatch.
  useEffect(() => {
    const saved = window.localStorage.getItem(BILLING_STORAGE_KEY)
    if (saved === 'annual') setInterval('year')
    else if (saved === 'monthly') setInterval('month')
  }, [])

  const selectInterval = useCallback((next: BillingInterval) => {
    setInterval(next)
    window.localStorage.setItem(
      BILLING_STORAGE_KEY,
      next === 'year' ? 'annual' : 'monthly',
    )
  }, [])

  const startCheckout = useCallback(
    async (tier: PaidTierKey) => {
      if (pending) return
      setPending(tier)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const platformApi = api as unknown as any
        const { data, error } = await platformApi.POST(
          '/v1/platform/organizations/{organization_id}/upgrade-checkout',
          {
            params: { path: { organization_id: organization.id } },
            body: {
              tier,
              billing_interval: interval,
              success_url: `${window.location.origin}/dashboard/${organization.slug}/onboarding/review?upgraded=1`,
            },
          },
        )
        if (error || !data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = error as any
          let message = "Couldn't start checkout for this plan."
          if (Array.isArray(e?.detail) && e.detail.length > 0) {
            const first = e.detail[0]
            message = `${first?.msg ?? 'Validation failed'} (loc=${(first?.loc ?? []).join('.')})`
          } else if (typeof e?.detail === 'string') {
            message = e.detail
          }
          console.error('upgrade-checkout failed', e)
          throw new Error(message)
        }
        const checkout = data as { checkout_url?: string }
        if (!checkout.checkout_url) {
          throw new Error('Checkout URL missing from server response.')
        }
        window.location.href = checkout.checkout_url
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong.'
        toast({ title: 'Checkout failed', description: message })
        setPending(null)
      }
    },
    [interval, organization.id, organization.slug, pending],
  )

  const isAnnual = interval === 'year'

  return (
    <div className="flex h-full w-full flex-1 flex-col items-center overflow-y-auto bg-white px-4 py-12">
      {/* Progress bar */}
      <div className="mb-12 w-full max-w-lg">
        <OnboardingProgressBar currentStep={2} totalSteps={2} />
      </div>

      <div className="flex w-full max-w-5xl flex-col gap-8">
        {/* Logo — mobile only */}
        <div className="flex justify-center md:hidden">
          <LogoIcon size={32} />
        </div>

        {/* Heading */}
        <div className="flex flex-col gap-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Choose your plan
          </h1>
          <p className="mx-auto max-w-lg text-sm text-gray-500">
            Every plan starts with a 14-day free trial. You won&rsquo;t be
            charged during the trial — switch or cancel anytime from Settings.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex flex-col items-center gap-2.5">
          <div
            className="inline-flex rounded-full bg-gray-100 p-1"
            role="tablist"
            aria-label="Billing period"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isAnnual}
              className={twMerge(
                'rounded-full px-5 py-1.5 text-sm transition-colors',
                isAnnual
                  ? 'text-gray-500 hover:text-gray-900'
                  : 'bg-white text-gray-900 shadow-sm',
              )}
              onClick={() => selectInterval('month')}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isAnnual}
              className={twMerge(
                'rounded-full px-5 py-1.5 text-sm transition-colors',
                isAnnual
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900',
              )}
              onClick={() => selectInterval('year')}
            >
              Annual
            </button>
          </div>
          <span
            className="text-xs text-gray-500 transition-opacity"
            style={{ opacity: isAnnual ? 0 : 1 }}
          >
            Save 20% with annual billing
          </span>
        </div>

        {/* Cards */}
        <div className="grid w-full grid-cols-1 items-stretch gap-4 md:grid-cols-3">
          {TIERS.map((t) => {
            const amount = isAnnual ? t.annual : t.monthly
            const isPending = pending === t.tier
            const disabled = pending !== null && pending !== t.tier
            return (
              <div
                key={t.tier}
                className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                data-tier={t.name}
              >
                {t.recommended ? (
                  <div className="mb-2 text-xs text-blue-600">Recommended</div>
                ) : (
                  <div className="mb-2 h-4" />
                )}
                <div className="text-lg font-medium text-gray-900">
                  {t.name}
                </div>

                <div className="mt-3 flex items-baseline gap-0.5 text-gray-900">
                  <span className="text-lg">$</span>
                  <span className="text-3xl tracking-tight tabular-nums">
                    {amount}
                  </span>
                  <span className="ml-1 text-sm text-gray-400">/mo</span>
                </div>
                <div className="mt-1.5 min-h-4 text-xs text-gray-400">
                  {isAnnual ? (
                    <>
                      <span className="mr-1 line-through">${t.monthly}</span>
                      Billed annually
                    </>
                  ) : (
                    'Billed monthly'
                  )}
                </div>

                <button
                  type="button"
                  disabled={disabled || isPending}
                  onClick={() => startCheckout(t.tier)}
                  className="mt-5 w-full rounded-full bg-blue-600 py-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {isPending ? 'Starting…' : 'Start free trial'}
                </button>
                <div className="mt-2.5 text-center text-xs text-gray-400">
                  Card required. Won&rsquo;t be charged during the 14-day
                  trial.
                </div>

                <div className="my-5 border-t border-gray-100" />
                <div className="mb-4 text-sm text-gray-900">{t.includes}</div>
                <div className="flex flex-col gap-3">
                  {t.features.map((feature, i) => (
                    <div
                      className="flex items-start gap-2.5 text-sm text-gray-600"
                      key={i}
                    >
                      {feature.shield ? <ShieldIcon /> : <CheckIcon />}
                      <span>{feature.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0 text-gray-400"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0 text-gray-400"
    >
      <path d="M12 2 4 5v6c0 5 3.4 8 8 11 4.6-3 8-6 8-11V5l-8-3Z" />
    </svg>
  )
}

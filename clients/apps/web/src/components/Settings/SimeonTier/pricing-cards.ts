import {
  formatCredits,
  formatDollarAmount,
  type PaidTierKey,
  type Plan,
} from '@/hooks/queries/plans'

/**
 * The live pricing section on simeonlabs.com: four cards, monthly prices,
 * no yearly toggle. The words are the site's. The numbers come from
 * `GET /v1/plans/`.
 */
export const PRICING_FOOTNOTE =
  'A credit is one token of input on the middle model. A typical task, one that reads a few pages and writes something back, is about 100,000 credits. Allowances reset every Monday. Unused credits do not carry over.'

export interface PricingCardCopy {
  readonly id: 'trial' | PaidTierKey
  readonly tier: PaidTierKey
  readonly name: string
  readonly tag: string
  readonly includes: string
  readonly bullets: readonly string[]
  readonly button: string
}

export const PRICING_COPY: readonly PricingCardCopy[] = [
  {
    id: 'trial',
    tier: 'standard',
    name: 'Trial',
    tag: 'For the first week',
    includes: 'Includes:',
    bullets: [
      'Every agent and every feature',
      'A cloud computer for each agent',
      'Card on file, one trial per card',
      'Becomes Standard on day 8 unless you cancel',
    ],
    button: 'Try it free',
  },
  {
    id: 'standard',
    tier: 'standard',
    name: 'Standard',
    tag: 'For a light week of work',
    includes: 'Everything in the trial, plus:',
    bullets: [
      'Routines that run while your Mac is closed',
      'Discord and Slack channels, voice calls',
      'Memory shared across your agents',
      'Keep going past the week’s allowance on demand',
    ],
    button: 'Get Standard',
  },
  {
    id: 'pro',
    tier: 'pro',
    name: 'Pro',
    tag: 'For agents working every day',
    includes: 'Everything in Standard, plus:',
    bullets: [
      'Three times the weekly work of Standard',
      'Room for routines that run every day',
    ],
    button: 'Get Pro',
  },
  {
    id: 'max',
    tier: 'max',
    name: 'Max',
    tag: 'For a team of agents that never stops',
    includes: 'Everything in Pro, plus:',
    bullets: [
      'Eleven times the weekly work of Standard',
      'Agents on routines all week long',
      'Our highest allowance',
    ],
    button: 'Get Max',
  },
]

export interface PricingCardView extends PricingCardCopy {
  readonly price: string
  readonly period: string
  readonly allowance: string
  readonly ready: boolean
}

const planByTier = (plans: readonly Plan[]): Map<PaidTierKey, Plan> =>
  new Map(plans.map((plan) => [plan.tier, plan]))

export const pricingCards = (
  plans: readonly Plan[],
  highlight: PaidTierKey | null,
): { cards: PricingCardView[]; highlight: PaidTierKey | null } => {
  const byTier = planByTier(plans)
  const standard = byTier.get('standard')
  const cards = PRICING_COPY.map((copy): PricingCardView => {
    const plan = byTier.get(copy.tier)
    if (copy.id === 'trial') {
      const days = standard?.trial_days
      const credits = standard?.trial_credits
      return {
        ...copy,
        price: 'Free',
        period: days == null ? '' : `/ ${days} days`,
        allowance:
          credits == null ? '' : `${formatCredits(credits)} credits once.`,
        ready: standard != null,
      }
    }
    return {
      ...copy,
      price:
        plan == null ? '' : `$${formatDollarAmount(plan.monthly_price_cents)}`,
      period: '/ month',
      allowance:
        plan == null
          ? ''
          : `${formatCredits(plan.weekly_credits)} credits a week.`,
      ready: plan != null,
    }
  })
  return { cards, highlight }
}

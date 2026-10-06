import type { Plan } from '@/hooks/queries/plans'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SitePricing from './SitePricing'
import { PRICING_FOOTNOTE, pricingCards } from './pricing-cards'

const plans: Plan[] = [
  {
    tier: 'standard',
    name: 'Simeon Standard',
    description: '',
    monthly_price_cents: 2000,
    annual_price_cents: 19200,
    weekly_credits: 750_000,
    trial_credits: 1_000_000,
    trial_days: 7,
    monthly_lookup_key: 'simeon_standard_month',
    annual_lookup_key: 'simeon_standard_year',
  },
  {
    tier: 'pro',
    name: 'Simeon Pro',
    description: '',
    monthly_price_cents: 6000,
    annual_price_cents: 57600,
    weekly_credits: 2_500_000,
    trial_credits: 1_000_000,
    trial_days: 7,
    monthly_lookup_key: 'simeon_pro_month',
    annual_lookup_key: 'simeon_pro_year',
  },
  {
    tier: 'max',
    name: 'Simeon Max',
    description: '',
    monthly_price_cents: 20000,
    annual_price_cents: 192000,
    weekly_credits: 8_000_000,
    trial_credits: 1_000_000,
    trial_days: 7,
    monthly_lookup_key: 'simeon_max_month',
    annual_lookup_key: 'simeon_max_year',
  },
]

describe('pricingCards', () => {
  it('takes the monthly prices and the trial from the plans endpoint', () => {
    const view = pricingCards(plans, 'pro')
    expect(view.highlight).toBe('pro')
    expect(
      view.cards.map((card) => [
        card.id,
        card.price,
        card.period,
        card.allowance,
        card.button,
      ]),
    ).toEqual([
      ['trial', 'Free', '/ 7 days', '1,000,000 credits once.', 'Try it free'],
      ['standard', '$20', '/ month', '750,000 credits a week.', 'Get Standard'],
      ['pro', '$60', '/ month', '2,500,000 credits a week.', 'Get Pro'],
      ['max', '$200', '/ month', '8,000,000 credits a week.', 'Get Max'],
    ])
  })

  it('leaves a card unready when its plan is missing', () => {
    const view = pricingCards(
      plans.filter((plan) => plan.tier !== 'max'),
      null,
    )
    expect(view.cards.find((card) => card.id === 'max')?.ready).toBe(false)
    expect(view.cards.find((card) => card.id === 'trial')?.ready).toBe(true)
  })
})

describe('SitePricing', () => {
  it('keeps the footnote outside the card grid and highlights the asked plan', () => {
    const view = pricingCards(plans, 'standard')
    const html = renderToStaticMarkup(
      <SitePricing
        cards={view.cards}
        highlight={view.highlight}
        onChoose={() => undefined}
        pendingId={null}
      />,
    )
    expect(html).toContain('class="plans3"')
    expect(html).toContain('</div><p class="pnote">')
    expect(html).toContain(PRICING_FOOTNOTE)
    expect(html).toContain('class="plan3 picked"')
    expect(html).toContain('id="standard"')
    expect(html).not.toContain('id="trial"')
    expect(html.match(/class="plan3 picked"/g)).toHaveLength(1)
  })
})

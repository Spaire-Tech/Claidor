// The credits' line (SimeonCore's `UpgradeTests`): the banner only when
// the credits are spent, its button's words by where the plan was bought,
// extra credits, a failed payment, the server's sentence for spent credits,
// and the line near the limit with what closing it keeps. The iPhone's
// routes to the App Store's plans (`route`, `withoutUpgrade`) and the Mac's
// cover (`MacUpgrade`, 5c's access.ts) are not this part's.

import { beforeAll, describe, expect, it } from 'vitest'
import type { SandAccess } from './access'
import type { JSONValue } from './json'
import { trayFrom } from './trays'
import {
  approaching,
  approachingClosedAdding,
  approachingClosedHas,
  creditsBanner,
  day,
  isOutOfCredits,
  phoneCover,
} from './upgrade'
import { percentNumber, usageMeters, usageSummary } from './usage'
import { loadWords } from './words'

beforeAll(() => loadWords('en'))

const now = 1_792_000_000_000
const paymentRequired: SandAccess = { state: 'paymentRequired', reason: 'none' }
const granted: SandAccess = { state: 'granted', reason: 'unspecified' }
const usage = (json: JSONValue) => usageSummary(json, now)

describe('the credits’ line (UpgradeTests)', () => {
  it('says the free trial is over, or that a plan is needed', () => {
    const over = usage({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
      trialEndsAt: '2026-10-01T00:00:00+00:00',
    })
    expect(phoneCover(paymentRequired, over).title).toBe(
      'Your free trial has ended',
    )
    expect(phoneCover(paymentRequired, over).action).toBe('See plans')
    const never = usage({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
    })
    expect(phoneCover(paymentRequired, never).title).toBe(
      'Choose a plan to start',
    )
    expect(phoneCover(paymentRequired, undefined).title).toBe(
      'Choose a plan to start',
    )
  })

  it('shows the banner only when the credits are spent', () => {
    const trialLeft = usage({
      subscriptionStatus: 'trialing',
      creditsLimit: 5_000_000,
      creditsUsed: 1_000,
      creditsRemaining: 4_999_000,
    })
    expect(creditsBanner(granted, trialLeft)).toBeUndefined()
    const trialSpent = usage({
      subscriptionStatus: 'trialing',
      creditsLimit: 5_000_000,
      creditsUsed: 5_000_000,
      creditsRemaining: 0,
    })
    expect(creditsBanner(granted, trialSpent)?.title).toBe(
      'You’ve used your free credits',
    )
    expect(creditsBanner(granted, trialSpent)?.action).toBe('Upgrade')
    const weekSpent = usage({
      subscriptionStatus: 'active',
      tier: 'standard',
      creditsLimit: 5_000_000,
      creditsUsed: 5_000_000,
      creditsRemaining: 0,
    })
    expect(creditsBanner(granted, weekSpent)?.title).toBe(
      'This week’s credits are used',
    )
    // The server's 402 on a notice, before there is a summary.
    expect(
      creditsBanner(granted, undefined, { outOfCredits: true })?.title,
    ).toBe('You’re out of credits')
    // A summary with credits left wins over a notice from before a purchase.
    expect(
      creditsBanner(granted, trialLeft, { outOfCredits: true }),
    ).toBeUndefined()
    // A plan with no included credits, its spend used up: only the 402 says so.
    const noIncluded = usage({
      subscriptionStatus: 'active',
      tier: 'standard',
      creditsLimit: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
    })
    expect(creditsBanner(granted, noIncluded)).toBeUndefined()
    expect(
      creditsBanner(granted, noIncluded, { outOfCredits: true })?.title,
    ).toBe('You’re out of credits')
    // No plan: the cover's words.
    expect(creditsBanner(paymentRequired, undefined)?.action).toBe('See plans')
  })

  it('words the button by where the plan was bought', () => {
    // The top plan has none above: extra credits.
    const top = usage({
      subscriptionStatus: 'active',
      tier: 'max',
      billedBy: 'stripe',
      creditsLimit: 1,
      creditsUsed: 1,
      creditsRemaining: 0,
    })
    expect(creditsBanner(granted, top)?.action).toBe('Add Credits')
    // A card trial on the web starts its plan now.
    const trial = usage({
      subscriptionStatus: 'trialing',
      tier: 'pro',
      billedBy: 'stripe',
      creditsLimit: 1,
      creditsUsed: 1,
      creditsRemaining: 0,
    })
    expect(creditsBanner(granted, trial)?.action).toBe('Start Plan Now')
    // The person's own day, not Monday.
    const reset = now + 3 * 86_400_000
    const dated = usage({
      subscriptionStatus: 'active',
      tier: 'pro',
      billedBy: 'stripe',
      creditsLimit: 1,
      creditsUsed: 1,
      creditsRemaining: 0,
      periodEnd: new Date(reset).toISOString(),
    })
    const banner = creditsBanner(granted, dated, { now, timeZone: 'UTC' })!
    expect(banner.body).toBe(
      `They reset ${day(reset, now, 'UTC')}. Upgrade to keep going now.`,
    )
    expect(banner.body).toContain('They reset on ')
  })

  it('keeps a paid week going with extra credits', () => {
    const extra = usage({
      subscriptionStatus: 'active',
      tier: 'standard',
      creditsLimit: 10,
      creditsUsed: 10,
      creditsRemaining: 0,
      hasPaidCredits: true,
      extraCredits: 2_950_000,
    })
    expect(extra.hasAvailableUsage).toBe(true)
    expect(creditsBanner(granted, extra)).toBeUndefined()
    expect(usageMeters(extra, now).extraCredits).toBe('2,950,000')
    const trial = usage({
      subscriptionStatus: 'trialing',
      tier: 'standard',
      creditsLimit: 10,
      creditsUsed: 10,
      creditsRemaining: 0,
      hasPaidCredits: false,
      extraCredits: 100,
    })
    expect(trial.hasAvailableUsage).toBe(false)
  })

  it('asks for the card, not a plan, after a failed payment', () => {
    const stripe = usage({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
      paymentFailed: true,
      billedBy: 'stripe',
      upgradeUrl: 'https://app.simeonlabs.com/billing?from=app',
    })
    expect(stripe.paymentFailed).toBe(true)
    expect(stripe.upgrade?.label).toBe('Update card')
    const words = phoneCover(paymentRequired, stripe)
    expect(words).toEqual({
      title: 'Your payment didn’t go through',
      body: 'You can’t send messages until your card is updated.',
      action: 'Update card',
    })
    expect(creditsBanner(paymentRequired, stripe)).toEqual(words)
    const apple = usage({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      paymentFailed: true,
      billedBy: 'apple',
      upgradeUrl: 'https://app.simeonlabs.com/billing?from=app',
    })
    expect(phoneCover(paymentRequired, apple).action).toBe('See plans')
    expect(phoneCover(paymentRequired, apple).body).toBe(
      'You can’t send messages until your Apple payment method is updated.',
    )
    const none = usage({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      upgradeUrl: 'https://app.simeonlabs.com/billing?from=app',
    })
    expect(none.paymentFailed).toBe(false)
    expect(none.upgrade?.label).toBe('Choose a plan')
    expect(phoneCover(paymentRequired, none).action).toBe('See plans')
  })

  it('knows the server’s sentence for spent credits', () => {
    const card = trayFrom({
      id: 't1',
      kind: 'error',
      agentId: 'a',
      title: 'Agent failed to respond',
      detail:
        'Your trial credits are used up (code 40200). Choose a plan at https://app.simeonlabs.com/billing?from=app to keep going.',
    })!
    expect(isOutOfCredits(card)).toBe(true)
    const other = trayFrom({
      id: 't2',
      kind: 'error',
      agentId: 'a',
      title: 'Agent failed to respond',
      detail: 'Hourly spending budget reached (code 40201).',
    })!
    expect(isOutOfCredits(other)).toBe(false)
  })

  it('says the line near the limit at 80% and 95%, closed per step and period', () => {
    const reset = now + 3 * 86_400_000
    const week = (used: number) =>
      usage({
        subscriptionStatus: 'active',
        tier: 'standard',
        creditsLimit: 1_000,
        creditsUsed: used,
        creditsRemaining: 1_000 - used,
        periodEnd: new Date(reset).toISOString(),
      })
    const at = { now, timeZone: 'UTC' }
    expect(approaching(granted, week(500), at)).toBeUndefined()
    const at80 = approaching(granted, week(812), at)!
    expect(at80.words.title).toBe('You’re approaching your usage limit')
    expect(at80.words.body).toBe(
      `You’ve used 81% of this week’s credits. They reset ${day(reset, now, 'UTC')}.`,
    )
    expect(at80.words.body).toContain('They reset on ')
    expect(at80.words.action).toBe('Upgrade')
    expect(at80.step).toBe(80)
    const at95 = approaching(granted, week(960), at)!
    expect(at95.step).toBe(95)
    expect(at80.key).not.toBe(at95.key)
    // Spent: the banner says so, not this line.
    expect(approaching(granted, week(1_000), at)).toBeUndefined()
    expect(approaching(paymentRequired, week(900), at)).toBeUndefined()
    // The free month: its own words, no reset.
    const trial = usage({
      subscriptionStatus: 'trialing',
      creditsLimit: 1_000,
      creditsUsed: 900,
      creditsRemaining: 100,
    })
    expect(approaching(granted, trial, at)?.words.body).toBe(
      'You’ve used 90% of your free credits.',
    )
    // Closed at 80%, it comes back at 95%.
    const kept = approachingClosedAdding(at80.key, '')
    expect(approachingClosedHas(at80.key, kept)).toBe(true)
    expect(approachingClosedHas(at95.key, kept)).toBe(false)
    expect(['today', 'tomorrow']).toContain(day(now + 3_600_000, now, 'UTC'))
  })

  it('says the meter’s number (testTheLineSaysTheMetersNumber)', () => {
    const at = { now, timeZone: 'UTC' }
    const week = usage({
      subscriptionStatus: 'active',
      tier: 'standard',
      creditsLimit: 1_000,
      creditsUsed: 926,
      creditsRemaining: 74,
    })
    expect(usageMeters(week, now).weekly?.valueLabel).toBe('93%')
    expect(approaching(granted, week, at)?.words.body).toBe(
      'You’ve used 93% of this week’s credits.',
    )
    const trial = usage({
      subscriptionStatus: 'trialing',
      creditsLimit: 1_000,
      creditsUsed: 816,
      creditsRemaining: 184,
    })
    expect(approaching(granted, trial, at)?.words.body).toBe(
      'You’ve used 82% of your free credits.',
    )
    expect(percentNumber(0.4)).toBe(1)
    expect(percentNumber(Number.NaN)).toBe(0)
    expect(percentNumber(140)).toBe(100)
  })

  it('keeps the last twelve lines closed, each once', () => {
    let kept = ''
    for (let step = 0; step < 14; step += 1)
      kept = approachingClosedAdding(`${step}|80`, kept)
    kept = approachingClosedAdding('5|80', kept)
    const keys = kept.split(',')
    expect(keys.length).toBe(12)
    expect(keys.at(-1)).toBe('5|80')
    expect(keys.filter((one) => one === '5|80').length).toBe(1)
    expect(approachingClosedHas('0|80', kept)).toBe(false)
  })
})

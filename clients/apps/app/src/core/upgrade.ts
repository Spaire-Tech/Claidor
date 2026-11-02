// The credits' line over the message field (the core's Upgrade.swift:
// `PhoneUpgrade.banner`, `approaching`, `action`, `day`, `isOutOfCredits`;
// `ApproachingClosed`), as the Mac draws it (mac/Simeon/Composer.swift's
// `creditsLine`): spent, the week's or the trial's credits used (or the
// server's 402 for spent credits on one of the open agent's notices); else
// near the limit, a quiet line at 80% and again at 95%, which the person can
// close until the next step. Its button opens Usage & Billing. The Mac's
// cover and its notice for an account without a plan are 5c's
// (`MacUpgrade`, access.ts); `cover` here is the iPhone's, which `banner`
// says for an account that has none.

import {
  type AccessWords,
  type SandAccess,
  accessCover,
  accessNotice,
} from './access'
import { t, tk } from './l10n'
import { displayLocale } from './listTime'
import type { Tray } from './trays'
import type { UsageSummary } from './usage'

export const seePlans = () => t('See plans')
export const upgradeWord = () => t('Upgrade')
/** A card trial on the web: end it now and start the plan, with a fresh week. */
export const startPlanNow = () => t('Start Plan Now')
/** Max on the web, the week spent: extra credits, used until the week resets. */
export const addCredits = () => t('Add Credits')
export const paymentFailedTitle = () => t('Your payment didn’t go through')
export const approachingTitle = () => t('You’re approaching your usage limit')
/** The banner's title once a paid week's credits are spent. */
const weekUsedTitle = () => t('This week’s credits are used')
export const approachingSteps = [80, 95] as const

export const paymentMethodFlow = 'payment_method'
export const upgradeFlow = 'update_confirm'
export const startNowFlow = 'start_now'
export const creditsFlow = 'credits'

/** The iPhone's words for an account the computer refuses (`PhoneUpgrade.cover`). */
export function phoneCover(
  access: SandAccess,
  usage: UsageSummary | undefined,
): AccessWords {
  if (access.state !== 'paymentRequired') return accessCover(access)
  if (usage?.paymentFailed)
    return usage.billedByApple
      ? {
          title: paymentFailedTitle(),
          body: t(
            'You can’t send messages until your Apple payment method is updated.',
          ),
          action: seePlans(),
        }
      : {
          title: paymentFailedTitle(),
          body: t('You can’t send messages until your card is updated.'),
          action: t('Update card'),
        }
  if (usage?.hasEndedTrial)
    return {
      title: t('Your free trial has ended'),
      body: t('Choose a plan to send messages again.'),
      action: seePlans(),
    }
  return {
    title: t('Choose a plan to start'),
    body: t('You can send messages once this account has a plan.'),
    action: seePlans(),
  }
}

/**
 * The line over the message field when the credits are spent (`banner`);
 * none while this account can send. Spent credits are read from the usage
 * once there is one; before that, from the server's 402 on one of the open
 * agent's notices (`outOfCredits`).
 */
export function creditsBanner(
  access: SandAccess,
  usage: UsageSummary | undefined,
  options: { outOfCredits?: boolean; now?: number; timeZone?: string } = {},
): AccessWords | undefined {
  const outOfCredits = options.outOfCredits ?? false
  switch (access.state) {
    case 'paymentRequired':
      return phoneCover(access, usage)
    case 'unavailable':
      return accessNotice(access)
    default:
      break
  }
  const spent = usage
    ? !usage.hasAvailableUsage &&
      (usage.hasNonZeroIncludedLimit || outOfCredits)
    : outOfCredits
  if (!spent) return undefined
  if (usage?.isTrial)
    return {
      title: t('You’ve used your free credits'),
      body: t('Choose a plan to keep your agents working.'),
      action: creditsAction(usage),
    }
  if (usage?.hasNonZeroIncludedLimit && !usage.isTrial) {
    // Each person's week resets on its own day, not every account's Monday.
    const reset = resetDay(usage, options.now ?? Date.now(), options.timeZone)
    if (reset === undefined)
      return {
        title: weekUsedTitle(),
        body: t('Your agents wait until your plan has credits again.'),
        action: creditsAction(usage),
      }
    const body =
      creditsAction(usage) === addCredits()
        ? t`They reset ${reset}. Add credits to keep going now.`
        : t`They reset ${reset}. Upgrade to keep going now.`
    return { title: weekUsedTitle(), body, action: creditsAction(usage) }
  }
  return {
    title: t('You’re out of credits'),
    body: t('Choose a plan to keep your agents working.'),
    action: upgradeWord(),
  }
}

/** The line near the limit (`Approaching`): its words, the step crossed (80, then 95), and what closing it remembers (the period's end and the step). */
export interface Approaching {
  words: AccessWords
  step: number
  key: string
}

/**
 * Near the limit (`approaching`): a quiet line once 80% of the credits
 * are used and again at 95%, while there are credits left and nothing else
 * is said there. Closed, it stays closed for that step of that period.
 */
export function approaching(
  access: SandAccess,
  usage: UsageSummary | undefined,
  options: { now?: number; timeZone?: string } = {},
): Approaching | undefined {
  if (creditsBanner(access, usage) !== undefined || !usage) return undefined
  if (!usage.hasNonZeroIncludedLimit || !usage.hasAvailableUsage)
    return undefined
  const percent = usage.usagePercent
  if (percent === undefined || percent >= 100) return undefined
  const step = [...approachingSteps].reverse().find((one) => percent >= one)
  if (step === undefined) return undefined
  const now = options.now ?? Date.now()
  const used = Math.floor(percent)
  let body: string
  if (usage.isTrial) body = t`You’ve used ${used}% of your free credits.`
  else if (usage.resetMs !== undefined && usage.resetMs > now)
    body = t`You’ve used ${used}% of this week’s credits. They reset ${day(usage.resetMs, now, options.timeZone)}.`
  else body = t`You’ve used ${used}% of this week’s credits.`
  return {
    words: { title: approachingTitle(), body, action: creditsAction(usage) },
    step,
    key: `${Math.trunc(usage.resetMs ?? 0)}|${step}`,
  }
}

/**
 * The button's words, as the plan's own way goes (`action(for:)`): a card
 * trial on the web starts its plan now, Max on the web adds credits,
 * anything else upgrades.
 */
export function creditsAction(usage: UsageSummary | undefined): string {
  const plan = usage?.managePlan
  if (!usage || usage.billedByApple || usage.paymentFailed || !plan)
    return upgradeWord()
  if (plan.status === 'trialing') return startPlanNow()
  return plan.nextTier === undefined ? addCredits() : upgradeWord()
}

/** When this week's credits come back, "tomorrow", "on Thursday" (`resetDay`); none without a reset. */
export function resetDay(
  usage: UsageSummary,
  now: number,
  timeZone?: string,
): string | undefined {
  const ms = usage.resetMs
  if (ms === undefined) return undefined
  return ms > now ? day(ms, now, timeZone) : undefined
}

/** The calendar day of `ms` in `timeZone`, as a count of days. */
function dayNumber(ms: number, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(ms))
  const part = (type: string) =>
    Number(parts.find((one) => one.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000
}

/** "today", "tomorrow", else "on Monday", in the person's time zone (French "aujourd’hui", "demain", "lundi") (`day`). */
export function day(ms: number, now: number, timeZone?: string): string {
  const days = dayNumber(ms, timeZone) - dayNumber(now, timeZone)
  if (days <= 0) return tk('reset.today')
  if (days === 1) return tk('reset.tomorrow')
  const weekday = new Intl.DateTimeFormat(displayLocale(), {
    weekday: 'long',
    timeZone,
  }).format(new Date(ms))
  return tk('reset.weekday', weekday)
}

/** The server's sentence for spent credits (402, code 40200), as an agent's notice carries it (`isOutOfCredits`). */
export function isOutOfCredits(tray: Tray): boolean {
  return (
    tray.detail.includes('(code 40200)') || tray.title.includes('(code 40200)')
  )
}

/**
 * The lines near the limit the person closed (`ApproachingClosed`): one key
 * per period and step, kept as one line of text in the browser under the
 * Mac's name; the last twelve are enough.
 */
export const approachingClosedKey = 'simeon.usage.approachingClosed'

export function approachingClosedHas(near: string, kept: string): boolean {
  return kept.split(',').some((one) => one !== '' && one === near)
}

export function approachingClosedAdding(near: string, kept: string): string {
  const keys = [
    ...kept.split(',').filter((one) => one !== '' && one !== near),
    near,
  ]
  return keys.slice(-12).join(',')
}

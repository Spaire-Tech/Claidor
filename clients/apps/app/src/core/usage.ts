// The account's usage as Usage & Billing, the account menu and the credits'
// line read it (the core's AccountSettings.swift `UsageSummary`,
// `UsageMeters`, `UsageLoad`; AccountMenu.swift's `AccountMenu.reading`
// and `AboutSimeon`): the server's quota (`GET user/quota`) as the Electron
// app summarised it (`usageSummaryFromSimeonQuota`), the meters as the
// window drew them, the money and the share as it wrote them. Checked
// against the core's own fixture (Fixtures/settings.json), read in place.

import { copyrightLine } from './generalSettings'
import { type JSONValue, bool, field, num, str, text } from './json'
import { t } from './l10n'
import { displayLocale } from './listTime'

/** The on-demand spend: what is spent this cycle, its limit, when it resets. */
export interface OnDemand {
  usedCents: number
  limitCents?: number
  resetMs?: number
}

/** The upgrade button: its words and the page it opens (http or https only). */
export interface UpgradeButton {
  label: string
  url: string
}

export interface NextTier {
  tier: string
  label: string
}

/** The plan on Stripe, for the Plan group (`managePlanOfQuota`). */
export interface ManagePlan {
  planName: string
  tier: string
  status: string
  periodEndMs?: number
  /** The plan above, when there is one (none above Max). */
  nextTier?: NextTier
}

/** What the quota says (`UsageSummary`). */
export interface UsageSummary {
  isEnterprise: boolean
  usagePercent?: number
  resetMs?: number
  hasAvailableUsage: boolean
  isTrial: boolean
  hasEndedTrial: boolean
  hasNonZeroIncludedLimit: boolean
  canCancelTrial: boolean
  onDemand?: OnDemand
  upgrade?: UpgradeButton
  managePlan?: ManagePlan
  /** The plan was bought in the iPhone app: Apple changes and cancels it (`billedBy`). */
  billedByApple: boolean
  /** No plan because the first charge after the trial failed (`paymentFailed`). */
  paymentFailed: boolean
  /** Extra credits bought on the web, used once the week's are spent on a paid plan. */
  extraCredits: number
}

const nextTiers: Record<string, NextTier | null> = {
  standard: { tier: 'pro', label: 'Pro' },
  pro: { tier: 'max', label: 'Max' },
  max: null,
}

/** A number that is finite (`finite`). */
function finite(value: JSONValue | undefined): number | undefined {
  const number = num(value)
  return number !== undefined && Number.isFinite(number) ? number : undefined
}

/** An ISO time as Foundation's ISO 8601 reader takes it, with or without its fraction and with its zone. */
const isoTime =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/

/** An ISO time in milliseconds; none for nothing, "" or a time before 1970 (`milliseconds`). */
export function milliseconds(value: JSONValue | undefined): number | undefined {
  const words = text(value)
  if (!words || !isoTime.test(words)) return undefined
  const at = Date.parse(words)
  if (!Number.isFinite(at)) return undefined
  const ms = Math.round(at)
  return ms > 0 ? ms : undefined
}

/** An address the button may open: http or https, with a host (Swift's `URL(string:)` and its checks). */
function webAddress(link: string): boolean {
  if (/\s/.test(link)) return false
  try {
    const url = new URL(link)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== ''
    )
  } catch {
    return false
  }
}

function upgradeOf(quota: JSONValue): UpgradeButton | undefined {
  const link = text(field(quota, 'upgradeUrl'))
  if (!link || !webAddress(link)) return undefined
  if (bool(field(quota, 'paymentFailed')) === true)
    return { label: t('Update card'), url: link }
  const status = str(field(quota, 'subscriptionStatus'))
  return {
    label:
      status === 'none' || status === 'trialing'
        ? t('Choose a plan')
        : t('Get more usage'),
    url: link,
  }
}

function planOf(quota: JSONValue): ManagePlan | undefined {
  const tier = str(field(quota, 'tier')) ?? ''
  const status = str(field(quota, 'subscriptionStatus')) ?? ''
  if (!Object.hasOwn(nextTiers, tier)) return undefined
  if (!['trialing', 'active', 'past_due'].includes(status)) return undefined
  return {
    planName: text(field(quota, 'planName')) ?? tier,
    tier,
    status,
    periodEndMs: milliseconds(field(quota, 'periodEnd')),
    nextTier: nextTiers[tier] ?? undefined,
  }
}

/** The quota summarised (`UsageSummary(quota:now:)`). */
export function usageSummary(
  quota: JSONValue,
  now: number = Date.now(),
): UsageSummary {
  const limit = finite(field(quota, 'creditsLimit'))
  const used = finite(field(quota, 'creditsUsed'))
  const periodEnd = milliseconds(field(quota, 'periodEnd'))
  let percent: number | undefined
  let included = false
  if (limit !== undefined && used !== undefined) {
    included = limit > 0
    percent = included ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0
  }
  let spend: { used: number; limit: number } | undefined
  const raw = field(quota, 'onDemand')
  const spentCents = finite(field(raw, 'usedCents'))
  const limitCents = finite(field(raw, 'limitCents'))
  if (spentCents !== undefined && limitCents !== undefined && limitCents > 0)
    spend = { used: spentCents, limit: limitCents }
  const remaining = finite(field(quota, 'creditsRemaining'))
  const trialing = str(field(quota, 'subscriptionStatus')) === 'trialing'
  const trialEnd = milliseconds(field(quota, 'trialEndsAt'))
  const extra = finite(field(quota, 'extraCredits')) ?? 0
  const weekLeft =
    remaining !== undefined
      ? remaining > 0
      : percent !== undefined
        ? percent < 100
        : false
  return {
    isEnterprise: false,
    usagePercent: percent,
    resetMs: percent === undefined ? undefined : periodEnd,
    hasAvailableUsage:
      weekLeft || (bool(field(quota, 'hasPaidCredits')) === true && extra > 0),
    extraCredits: extra,
    isTrial: trialing,
    hasEndedTrial: !trialing && trialEnd !== undefined && trialEnd <= now,
    hasNonZeroIncludedLimit: included,
    canCancelTrial: trialing && bool(field(quota, 'trialCancelable')) === true,
    onDemand: spend && {
      usedCents: spend.used,
      limitCents: spend.limit,
      resetMs: percent === undefined ? undefined : periodEnd,
    },
    upgrade: upgradeOf(quota),
    managePlan: planOf(quota),
    billedByApple: str(field(quota, 'billedBy')) === 'apple',
    paymentFailed: bool(field(quota, 'paymentFailed')) === true,
  }
}

/**
 * The Plan group's line (`ManagePlan.line`): when the trial ends or the
 * usage resets ("Oct 12", the month and day in the app's language), and
 * "Upgrade for more usage." when there is a plan above.
 */
export function planLine(
  plan: ManagePlan,
  options: { locale?: string; timeZone?: string } = {},
): string {
  let when: string | undefined
  if (plan.periodEndMs !== undefined)
    when = new Intl.DateTimeFormat(options.locale ?? displayLocale(), {
      month: 'short',
      day: 'numeric',
      timeZone: options.timeZone,
    }).format(new Date(plan.periodEndMs))
  const head =
    plan.status === 'trialing'
      ? when !== undefined
        ? t`Your trial ends on ${when}.`
        : t('Your trial is running.')
      : when !== undefined
        ? t`Usage resets on ${when}.`
        : ''
  return (
    head + (plan.nextTier ? ` ${t('Upgrade for more usage.')}` : '')
  ).trim()
}

// MARK: The meters (`UsageMeters`)

export interface Meter {
  valueLabel: string
  barPercent?: number
  resetLabel?: string
}

export interface UsageMeters {
  weekly?: Meter
  includedUsageTitle: string
  onDemand?: Meter
  upgrade?: UpgradeButton
  upgradeSupportingText?: string
  canCancelTrial: boolean
  /** "2,950,000": the extra credits left, when there are any. */
  extraCredits?: string
}

export const onDemandTitle = () => t('On-demand usage')
export const noIncludedUsage = () =>
  t('No included usage available on your plan right now.')
export const extraCreditsTitle = () => t('Extra credits')

const clamp = (value: number) => Math.max(0, Math.min(100, value))

/** Usage & Billing's meters at `now` (`UsageMeters(summary, now:)`). */
export function usageMeters(
  summary: UsageSummary,
  now: number = Date.now(),
): UsageMeters {
  let weekly: Meter | undefined
  if (summary.usagePercent !== undefined) {
    const reset = summary.isTrial
      ? countdown(summary.resetMs, now, 'Ends')
      : (countdown(summary.resetMs, now, 'Resets') ??
        (summary.hasNonZeroIncludedLimit ? t('Resets in 7 days') : undefined))
    weekly = {
      valueLabel: percentLabel(summary.usagePercent),
      barPercent: clamp(summary.usagePercent),
      resetLabel: reset,
    }
  }
  let onDemand: Meter | undefined
  const spend = summary.onDemand
  if (spend) {
    const reset = countdown(spend.resetMs, now, 'Resets')
    onDemand =
      spend.limitCents !== undefined
        ? {
            valueLabel: `${money(spend.usedCents)} / ${money(spend.limitCents)}`,
            barPercent: clamp((spend.usedCents / spend.limitCents) * 100),
            resetLabel: reset,
          }
        : { valueLabel: money(spend.usedCents), resetLabel: reset }
  }
  return {
    weekly,
    includedUsageTitle: summary.isTrial ? t('Trial usage') : t('Weekly usage'),
    onDemand,
    upgrade: summary.upgrade,
    upgradeSupportingText: supportingText(summary),
    canCancelTrial: summary.isTrial && summary.canCancelTrial,
    extraCredits:
      summary.extraCredits > 0 ? creditCount(summary.extraCredits) : undefined,
  }
}

/** "2,950,000", in the app's language (`count`). */
export function creditCount(value: number): string {
  return new Intl.NumberFormat(displayLocale(), {
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

function supportingText(summary: UsageSummary): string | undefined {
  if (!summary.upgrade) return undefined
  if (
    !summary.hasNonZeroIncludedLimit &&
    summary.hasAvailableUsage &&
    summary.usagePercent !== undefined &&
    summary.usagePercent < 100
  )
    return t('Get more Simeon usage')
  if (summary.isTrial) return t('You’ve used all of your trial usage')
  if (summary.hasEndedTrial)
    return t('Your trial has ended. Upgrade to continue using Simeon.')
  return undefined
}

/** "Resets today", "Resets in 1 day", "Ends in 3 days" (`countdown`, `jct`): whole days, rounded up. */
export function countdown(
  resetMs: number | undefined,
  now: number,
  verb: 'Resets' | 'Ends',
): string | undefined {
  if (resetMs === undefined || !Number.isFinite(resetMs)) return undefined
  const left = resetMs - now
  const ends = verb === 'Ends'
  if (left <= 0) return ends ? t('Ends today') : t('Resets today')
  const days = Math.ceil(left / 86_400_000)
  if (days === 1) return ends ? t('Ends in 1 day') : t('Resets in 1 day')
  return ends ? t`Ends in ${days} days` : t`Resets in ${days} days`
}

/** "42%" ("42 %" in French), "1%" for anything above nothing and under one (`percent`, `qct`). */
export function percentLabel(value: number): string {
  return t`${percentNumber(value)}%`
}

/**
 * The number `percentLabel` shows (`percentNumber`): 0 to 100, to the
 * nearest (a half up), 1 for anything above nothing and under one. The
 * credits' line over the composer says it too (upgrade.ts's `approaching`),
 * so the two never read 92% and 93% (3 November 2026; the line rounded down).
 */
export function percentNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  const clamped = clamp(value)
  if (clamped > 0 && clamped < 1) return 1
  // Swift's `.toNearestOrAwayFromZero`: never below zero here, so a half goes up.
  return Math.floor(clamped + 0.5)
}

/** The account menu's spend (`compactMoney`, `wze`): "$12.5", "$100", "$1.2k" from a thousand dollars up; a half goes up, as JavaScript's `toFixed`. */
export function compactMoney(cents: number): string {
  if (!Number.isFinite(cents)) return '$0'
  const dollars = Math.max(cents, 0) / 100
  const trimmed = (words: string) =>
    words.includes('.') ? words.replace(/\.?0+$/, '') : words
  return dollars >= 1_000
    ? `$${trimmed((dollars / 1_000).toFixed(1))}k`
    : `$${trimmed(dollars.toFixed(2))}`
}

/** Cents as dollars, "$12" or "$12.34", in the app's language (`money`, `Xve`). */
export function money(cents: number): string {
  const dollars = cents / 100
  const whole = Math.trunc(dollars) === dollars
  return new Intl.NumberFormat(displayLocale(), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

// MARK: What Usage & Billing has to show (`UsageLoad`)

export type UsageLoad =
  | { kind: 'empty' }
  | { kind: 'loading'; previous?: UsageSummary }
  | { kind: 'ready'; summary: UsageSummary }
  | { kind: 'failed'; previous?: UsageSummary }

export const emptyUsage: UsageLoad = { kind: 'empty' }

/** How long a summary is fresh enough not to be read again (`usageFreshSeconds`, `yVn`): 30 s. */
export const usageFreshMs = 30_000

/** The summary to draw: the one read, or the last one while reading again or after a failure. */
export function shownSummary(load: UsageLoad): UsageSummary | undefined {
  switch (load.kind) {
    case 'empty':
      return undefined
    case 'ready':
      return load.summary
    default:
      return load.previous
  }
}

/** Whether Settings lists Usage & Billing (`showsSection`, `kDn`): once a summary is in, and not for an enterprise team. */
export function showsSection(load: UsageLoad): boolean {
  const summary = shownSummary(load)
  return summary !== undefined && !summary.isEnterprise
}

// MARK: The account menu's Weekly usage (`AccountMenu.reading`)

export interface UsageReading {
  /** "38%". */
  percent: string
  /** "Resets in 4 days"; none with no reset and no included limit (the row is then 30 high). */
  reset?: string
  /** "$12.4/$50"; none without metered on-demand spend. */
  spend?: string
}

/**
 * The menu's reading, or none for no Weekly usage row: nothing read yet,
 * no share in the quota, or a failed read (the window drops the last
 * reading then). While it is read again the last one stays. It always says
 * "Weekly usage" and "Resets", trial or not, and counts from when it was
 * read, not from now.
 */
export function usageReading(
  load: UsageLoad,
  readAt: number | undefined,
  now: number = Date.now(),
): UsageReading | undefined {
  const summary =
    load.kind === 'ready'
      ? load.summary
      : load.kind === 'loading'
        ? load.previous
        : undefined
  if (!summary || summary.usagePercent === undefined) return undefined
  const read = readAt ?? now
  const reset =
    countdown(summary.resetMs, read, 'Resets') ??
    (summary.hasNonZeroIncludedLimit ? t('Resets in 7 days') : undefined)
  const spend = summary.onDemand
  return {
    percent: percentLabel(summary.usagePercent),
    reset,
    spend:
      spend?.limitCents !== undefined && spend.limitCents > 0
        ? `${compactMoney(spend.usedCents)}/${compactMoney(spend.limitCents)}`
        : undefined,
  }
}

// MARK: About (`AboutSimeon`)

export const aboutName = 'Simeon'
/** About's copyright line: Legal's, kept in one place (`AboutSimeon.copyright`). */
export const aboutCopyright = copyrightLine
/** How long "Copied" stays (`copiedSeconds`). */
export const copiedSeconds = 1.2

export function versionLine(version: string): string {
  return t`Version ${version}`
}

/**
 * When Settings › Updates last looked, in its "Last checked …" line
 * (`checkedJustNow`): "just now" under a minute ago (or a moment ahead, the
 * clock's), as the window's relative time says it; undefined from a minute
 * on, for `relativeWords`. Until 3 November 2026 a check a moment ago read
 * "0 seconds ago", and stayed so.
 */
export function checkedJustNow(date: number, now: number): string | undefined {
  return now - date < 60_000 ? t('just now') : undefined
}

/** What Copy version info writes: the window's three lines, word for word (`versionInfo`). */
export function versionInfo(
  version: string,
  track = 'stable',
  os = 'darwin',
): string {
  return [`Version: ${version}`, `Release Track: ${track}`, `OS: ${os}`].join(
    '\n',
  )
}

// The usage against what the shipped code itself answered (SimeonCore's
// `SettingsTests`, its usage parts, on Fixtures/settings.json, read where it
// is: the Electron app's `usageSummaryFromSimeonQuota` on random quotas and
// the main bundle's `NKn`, `yDn`, `kDn`, `Xve`, `qct` and `jct` on its
// answers, and the patch's Manage Plan line, at 15:30 UTC on 9 October 2026,
// in en-US), and the account menu's reading and About's version info
// (`AccountMenuTests`).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JSONValue } from './json'
import {
  type UsageLoad,
  compactMoney,
  countdown,
  money,
  percentLabel,
  planLine,
  showsSection,
  usageMeters,
  usageReading,
  usageSummary,
  versionInfo,
  versionLine,
} from './usage'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixture: any = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/settings.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
const now: number = fixture.now

/** Swift's `nil` is the fixture's null; the port's is undefined. */
const some = <T>(value: T | null | undefined): T | undefined =>
  value === null ? undefined : value

describe('the usage (SettingsTests)', () => {
  it('summarises and draws every quota as the Electron app and the window did', () => {
    const cases: any[] = fixture.usage
    expect(cases.length).toBe(500)
    cases.forEach((row, index) => {
      const quota = row.quota as JSONValue
      const summary = usageSummary(quota, now)
      const shipped = row.summary
      const label = `case ${index}: ${JSON.stringify(quota)}`
      expect(summary.usagePercent, label).toBe(some(shipped.sandUsagePercent))
      expect(summary.resetMs, label).toBe(
        some(shipped.sandUsageResetTimestampMs),
      )
      expect(summary.hasAvailableUsage, label).toBe(shipped.hasAvailableUsage)
      expect(summary.isTrial, label).toBe(shipped.isSandTrial)
      expect(summary.hasEndedTrial, label).toBe(shipped.hasEndedSandTrial)
      expect(summary.hasNonZeroIncludedLimit, label).toBe(
        shipped.hasNonZeroIncludedLimit,
      )
      expect(summary.canCancelTrial, label).toBe(shipped.canCancelSandTrial)
      expect(summary.onDemand?.usedCents, label).toBe(
        some(shipped.onDemand?.usedCents),
      )
      expect(summary.onDemand?.limitCents, label).toBe(
        some(shipped.onDemand?.limitCents),
      )
      expect(summary.upgrade?.label, label).toBe(
        some(shipped.upgradeCta?.label),
      )
      expect(summary.upgrade?.url, label).toBe(
        some(shipped.upgradeCta?.action?.url),
      )
      expect(summary.managePlan?.planName, label).toBe(
        some(shipped.managePlan?.planName),
      )
      expect(summary.managePlan?.nextTier?.label, label).toBe(
        some(shipped.managePlan?.nextTier?.label),
      )
      expect(summary.managePlan?.periodEndMs, label).toBe(
        some(shipped.managePlan?.periodEndMs),
      )
      if (typeof row.planLine === 'string') {
        expect(summary.managePlan, label).toBeDefined()
        // The patch's line with its month in full ("Oct 16" is "October 16"; below).
        expect(
          planLine(summary.managePlan!, { locale: 'en-US', timeZone: 'UTC' }),
          label,
        ).toBe(row.planLine.replaceAll(' on Oct ', ' on October '))
      } else {
        expect(summary.managePlan, label).toBeUndefined()
      }

      const meters = usageMeters(summary, now)
      const view = row.view
      expect(meters.includedUsageTitle, label).toBe(view.includedUsageTitle)
      expect(meters.weekly?.valueLabel, label).toBe(
        some(view.weekly?.valueLabel),
      )
      expect(meters.weekly?.barPercent, label).toBe(
        some(view.weekly?.barPercent),
      )
      expect(meters.weekly?.resetLabel, label).toBe(
        some(view.weekly?.resetLabel),
      )
      expect(meters.onDemand?.valueLabel, label).toBe(
        some(view.onDemand?.valueLabel),
      )
      expect(meters.onDemand?.barPercent, label).toBe(
        some(view.onDemand?.barPercent),
      )
      expect(meters.onDemand?.resetLabel, label).toBe(
        some(view.onDemand?.resetLabel),
      )
      expect(meters.canCancelTrial, label).toBe(view.canCancelTrial)
      expect(meters.upgradeSupportingText, label).toBe(some(row.supporting))
      expect(showsSection({ kind: 'ready', summary }), label).toBe(row.visible)
    })
  })

  it('writes the plan’s date with its month in full, one full stop in every language', () => {
    // "Ton essai se termine le 7 nov..": a short month ends in a full stop in French, German, Portuguese and Swedish.
    const end = Date.UTC(2026, 9, 7)
    const trial = {
      planName: 'Pro',
      tier: 'pro',
      status: 'trialing',
      periodEndMs: end,
    }
    const active = { ...trial, status: 'active' }
    expect(planLine(trial, { locale: 'en-US', timeZone: 'UTC' })).toBe(
      'Your trial ends on October 7.',
    )
    expect(planLine(active, { locale: 'en-US', timeZone: 'UTC' })).toBe(
      'Usage resets on October 7.',
    )
    const dates: Record<string, string> = {
      fr: '7 octobre',
      de: '7. Oktober',
      'pt-BR': '7 de outubro',
      sv: '7 oktober',
      es: '7 de octubre',
      nl: '7 oktober',
      it: '7 ottobre',
      pl: '7 października',
      tr: '7 Ekim',
    }
    for (const [locale, date] of Object.entries(dates)) {
      for (const plan of [trial, active]) {
        const line = planLine(plan, { locale, timeZone: 'UTC' })
        expect(line, locale).toContain(date)
        expect(line, locale).not.toContain('..')
      }
    }
  })

  it('writes money, shares and resets as the window did', () => {
    for (const row of fixture.money) expect(money(row.cents)).toBe(row.text)
    for (const row of fixture.percent)
      expect(percentLabel(row.value)).toBe(row.text)
    for (const row of fixture.resets) {
      expect(countdown(some(row.nextResetMs), now, 'Resets')).toBe(
        some(row.resets),
      )
      expect(countdown(some(row.nextResetMs), now, 'Ends')).toBe(some(row.ends))
    }
  })

  it('writes the account menu’s spend as the window (`wze`)', () => {
    expect(compactMoney(1250)).toBe('$12.5')
    expect(compactMoney(10_000)).toBe('$100')
    expect(compactMoney(1234)).toBe('$12.34')
    expect(compactMoney(0)).toBe('$0')
    expect(compactMoney(120_000)).toBe('$1.2k')
    expect(compactMoney(100_000)).toBe('$1k')
    expect(compactMoney(-5)).toBe('$0')
    expect(compactMoney(Number.NaN)).toBe('$0')
  })

  it('lists Usage & Billing once a summary is in', () => {
    const summary = usageSummary({ creditsLimit: 100, creditsUsed: 5 })
    expect(showsSection({ kind: 'empty' })).toBe(false)
    expect(showsSection({ kind: 'loading' })).toBe(false)
    expect(showsSection({ kind: 'loading', previous: summary })).toBe(true)
    expect(showsSection({ kind: 'failed', previous: summary })).toBe(true)
    expect(showsSection({ kind: 'failed' })).toBe(false)
  })
})

describe('the account menu’s reading and About (AccountMenuTests)', () => {
  const readAt = 1_791_000_000_000
  const iso = (ms: number) => new Date(ms).toISOString()
  function reading(
    used: number,
    options: {
      limit?: number
      resetIn?: number | null
      onDemand?: JSONValue
    } = {},
  ) {
    const quota: Record<string, JSONValue> = {
      creditsLimit: options.limit ?? 100,
      creditsUsed: used,
      onDemand: options.onDemand ?? null,
    }
    const resetIn = options.resetIn === undefined ? 4 * 86_400 : options.resetIn
    if (resetIn !== null) quota.periodEnd = iso(readAt + resetIn * 1000)
    return usageReading(
      { kind: 'ready', summary: usageSummary(quota, readAt) },
      readAt,
    )
  }

  it('shows the share', () => {
    expect(reading(38)?.percent).toBe('38%')
    expect(reading(0.4)?.percent).toBe('1%')
    expect(reading(38.5)?.percent).toBe('39%')
    expect(reading(99.5)?.percent).toBe('100%')
    expect(reading(150)?.percent).toBe('100%')
    expect(reading(-5)?.percent).toBe('0%')
    expect(reading(0)?.percent).toBe('0%')
  })

  it('says when it resets', () => {
    expect(reading(38)?.reset).toBe('Resets in 4 days')
    expect(reading(38, { resetIn: 3_600 })?.reset).toBe('Resets in 1 day')
    expect(reading(38, { resetIn: 86_400 })?.reset).toBe('Resets in 1 day')
    expect(reading(38, { resetIn: 86_400 + 120 })?.reset).toBe(
      'Resets in 2 days',
    )
    expect(reading(38, { resetIn: -1 })?.reset).toBe('Resets today')
    expect(reading(38, { resetIn: null })?.reset).toBe('Resets in 7 days')
    expect(reading(0, { limit: 0, resetIn: null })?.reset).toBeUndefined()
    expect(reading(0, { limit: 0, resetIn: null })?.percent).toBe('0%')
  })

  it('has no row without a reading', () => {
    expect(usageReading({ kind: 'empty' }, undefined)).toBeUndefined()
    expect(usageReading({ kind: 'loading' }, undefined)).toBeUndefined()
    const summary = usageSummary({ creditsLimit: 100, creditsUsed: 38 }, readAt)
    const failed: UsageLoad = { kind: 'failed', previous: summary }
    expect(usageReading(failed, readAt)).toBeUndefined()
    expect(
      usageReading({ kind: 'loading', previous: summary }, readAt)?.percent,
    ).toBe('38%')
    expect(
      usageReading(
        { kind: 'ready', summary: usageSummary({ creditsUsed: 3 }, readAt) },
        readAt,
      ),
    ).toBeUndefined()
  })

  it('writes the spend', () => {
    const spend = (used: number, limit: number) =>
      reading(38, { onDemand: { usedCents: used, limitCents: limit } })?.spend
    expect(spend(1240, 5000)).toBe('$12.4/$50')
    expect(spend(0, 5000)).toBe('$0/$50')
    expect(spend(1250, 2500)).toBe('$12.5/$25')
    expect(spend(10, 2500)).toBe('$0.1/$25')
    expect(spend(5, 2550)).toBe('$0.05/$25.5')
    expect(spend(1, 10)).toBe('$0.01/$0.1')
    expect(spend(99_999, 100_000)).toBe('$999.99/$1k')
    expect(spend(100_050, 1_999_999)).toBe('$1k/$20k')
    expect(spend(123_456, 500_000)).toBe('$1.2k/$5k')
    expect(spend(125_000, 325_000)).toBe('$1.3k/$3.3k')
    expect(spend(12.5, 99_999_999)).toBe('$0.13/$1000k')
    expect(spend(123_456_789, 987_654_321)).toBe('$1234.6k/$9876.5k')
    expect(spend(100, 0)).toBeUndefined()
    expect(reading(38)?.spend).toBeUndefined()
  })

  it('rounds as JavaScript does (the core’s own `toFixed`)', () => {
    expect((1.25).toFixed(1)).toBe('1.3')
    expect((1.005).toFixed(2)).toBe('1.00')
    expect((0.125).toFixed(2)).toBe('0.13')
    expect((9.99).toFixed(1)).toBe('10.0')
    expect((999.999).toFixed(2)).toBe('1000.00')
    expect(compactMoney(125_000)).toBe('$1.3k')
    expect(compactMoney(325_000)).toBe('$3.3k')
  })

  it('writes About’s version info', () => {
    expect(versionInfo('0.1.2')).toBe(
      'Version: 0.1.2\nRelease Track: stable\nOS: darwin',
    )
    expect(versionLine('0.1.0')).toBe('Version 0.1.0')
  })
})

// The time on a list row (`Chat.listTime` in
// ios/SimeonCore/Sources/SimeonCore/Chat.swift, the window's `l5e`): "6:34 AM"
// today, "Yesterday", the weekday this week, "10/7" this year, "10/7/25"
// before; nothing for a chat with no time (the host sends 0 for one).

import { t } from './l10n'
import { english, languageCode } from './language'
import { wordsLanguage } from './words'

/**
 * Where dates and times are shown (`L10n.locale`): the US English the English
 * screens always used while the app is in English, else the app's language
 * in the person's region when the browser names one for it.
 */
export function displayLocale(
  language: string = wordsLanguage(),
  browser: readonly string[] = typeof navigator === 'undefined'
    ? []
    : navigator.languages,
): string {
  if (languageCode(language) === english) return 'en-US'
  if (language.includes('-')) return language
  const regional = browser.find(
    (tag) => languageCode(tag) === languageCode(language) && tag.includes('-'),
  )
  return regional ?? language
}

/** The day of `date` in `timeZone`, as a count of days. */
function dayNumber(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000
}

export function listTime(
  ms: number | undefined,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): string | undefined {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return undefined
  const date = new Date(ms)
  const now = options.now ?? new Date()
  const locale = options.locale ?? displayLocale()
  const timeZone = options.timeZone
  const format = (shape: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...shape }).format(date)
  const days = dayNumber(now, timeZone) - dayNumber(date, timeZone)
  if (days <= 0) return format({ hour: 'numeric', minute: '2-digit' })
  if (days === 1) return t('Yesterday')
  if (days < 7) return format({ weekday: 'long' })
  const year = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(d)
  if (year(date) === year(now))
    return format({ month: 'numeric', day: 'numeric' })
  return format({ month: 'numeric', day: 'numeric', year: '2-digit' })
}

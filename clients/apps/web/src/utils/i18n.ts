import {
  isAcceptedLocale,
  SIMEON_ONLY_LOCALES,
  simeonLocale,
  type AcceptedLocale,
} from '@simeon/i18n'
import { headers } from 'next/headers'

const SUPPORTED_LOCALES = [
  'en',
  'de',
  'fr',
  'es',
  'pt',
  'pt-PT',
  'it',
  'nl',
  'sv',
  'hu',
]

/** Simeon's own pages also read the languages the checkout is not in. */
const PAGE_LOCALES = [...SUPPORTED_LOCALES, ...SIMEON_ONLY_LOCALES]

function normalizeBCP47(locale: string): string {
  const [lang, region] = locale.split('-')
  if (region) {
    return `${lang.toLowerCase()}-${region.toUpperCase()}`
  }
  return lang.toLowerCase()
}

function matchLocale(
  locale: string,
  supported: readonly string[] = SUPPORTED_LOCALES,
): string | null {
  const normalized = normalizeBCP47(locale)
  // Exact match (e.g. 'pt-PT')
  if (supported.includes(normalized)) {
    return normalized
  }
  // Language-only fallback (e.g. 'en' from 'en-US')
  const lang = normalized.split('-')[0]
  if (supported.includes(lang)) {
    return lang
  }
  return null
}

/**
 * Resolves the best locale from:
 * 1. URL query param (?locale=fr)
 * 2. Checkout's stored locale
 * 3. Browser Accept-Language header
 * 4. Falls back to 'en'
 */
export async function resolveLocale(
  queryLocale?: string,
  checkoutLocale?: string | null,
  supported: readonly string[] = SUPPORTED_LOCALES,
): Promise<string> {
  if (queryLocale) {
    const match = matchLocale(queryLocale, supported)
    if (match) return match
  }

  if (checkoutLocale) {
    const match = matchLocale(checkoutLocale, supported)
    if (match) return match
  }

  try {
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language')
    if (acceptLanguage) {
      for (const part of acceptLanguage.split(',')) {
        const lang = part.split(';')[0].trim()
        const match = matchLocale(lang, supported)
        if (match) return match
      }
    }
  } catch {
    // headers() may throw outside request context
  }

  return 'en'
}

/**
 * The language of Simeon's own pages, the sign-in and the billing page (20
 * October 2026, docs/localization.md): `?locale=`, else the browser's, else
 * English. They are in each language of the apps; the checkout's other
 * language (Hungarian) reads English there (`simeonLocale`).
 */
export async function pageLocale(
  queryLocale?: string,
): Promise<AcceptedLocale> {
  const locale = await resolveLocale(queryLocale, undefined, PAGE_LOCALES)
  return isAcceptedLocale(locale) ? simeonLocale(locale) : 'en'
}

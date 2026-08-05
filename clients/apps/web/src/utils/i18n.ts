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

function normalizeBCP47(locale: string): string {
  const [lang, region] = locale.split('-')
  if (region) {
    return `${lang.toLowerCase()}-${region.toUpperCase()}`
  }
  return lang.toLowerCase()
}

function matchLocale(locale: string): string | null {
  const normalized = normalizeBCP47(locale)
  // Exact match (e.g. 'pt-PT')
  if (SUPPORTED_LOCALES.includes(normalized)) {
    return normalized
  }
  // Language-only fallback (e.g. 'en' from 'en-US')
  const lang = normalized.split('-')[0]
  if (SUPPORTED_LOCALES.includes(lang)) {
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
): Promise<string> {
  if (queryLocale) {
    const match = matchLocale(queryLocale)
    if (match) return match
  }

  if (checkoutLocale) {
    const match = matchLocale(checkoutLocale)
    if (match) return match
  }

  try {
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language')
    if (acceptLanguage) {
      for (const part of acceptLanguage.split(',')) {
        const lang = part.split(';')[0].trim()
        const match = matchLocale(lang)
        if (match) return match
      }
    }
  } catch {
    // headers() may throw outside request context
  }

  return 'en'
}

import { useCallback } from 'react'

export { DEFAULT_LOCALE, LOCALE_NAMES, SUPPORTED_LOCALES } from './config'
export type { AcceptedLocale, SupportedLocale } from './config'
export type { TranslateFn, TranslationKey, Translations } from './types'

import type { AcceptedLocale, SupportedLocale } from './config'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './config'
import type { LocaleShape, TranslateFn, Translations } from './types'

export function getTranslationLocale(locale: AcceptedLocale): SupportedLocale {
  if (SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    return locale as SupportedLocale
  }
  const language = locale.split('-')[0].toLowerCase()
  if (SUPPORTED_LOCALES.includes(language as SupportedLocale)) {
    return language as SupportedLocale
  }
  return DEFAULT_LOCALE
}

export function isAcceptedLocale(value: string): value is AcceptedLocale {
  const language = value.split('-')[0].toLowerCase()
  return SUPPORTED_LOCALES.includes(language as SupportedLocale)
}

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale)
}

import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import hu from './locales/hu'
import it from './locales/it'
import nl from './locales/nl'
import pt from './locales/pt'
import ptPT from './locales/pt-PT'
import sv from './locales/sv'

/**
 * Simeon's own pages (`simeon`: the website's sign-in and billing, 20
 * October 2026) are in English and French. The checkout's other languages
 * have no words for them, and read English there (`lookup`).
 */
type LocaleTable = Omit<LocaleShape<Translations>, 'simeon'> & {
  simeon?: LocaleShape<Translations>['simeon']
}

const translations: Record<SupportedLocale, LocaleTable> = {
  en,
  nl,
  sv,
  fr,
  es,
  de,
  hu,
  it,
  pt,
  'pt-PT': ptPT,
}

export function getTranslations(
  locale: AcceptedLocale = DEFAULT_LOCALE,
): Translations {
  const translationLocale = getTranslationLocale(locale)
  return (translations[translationLocale] ??
    translations[DEFAULT_LOCALE]) as Translations
}

/** `locale` where Simeon's own pages have its words, else English (the checkout's other languages). */
export function simeonLocale(locale: AcceptedLocale): AcceptedLocale {
  return translations[getTranslationLocale(locale)]?.simeon
    ? locale
    : DEFAULT_LOCALE
}

const at = (table: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (obj, k) =>
        obj !== null && typeof obj === 'object'
          ? (obj as Record<string, unknown>)[k]
          : undefined,
      table,
    )

/** The entry at `key` in `locale`, or the English one where that locale has none. */
const lookup = (locale: AcceptedLocale, key: string): unknown =>
  at(getTranslations(locale), key) ?? at(en, key)

const fill = (template: string, interpolations?: Record<string, unknown>) =>
  interpolations
    ? template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => {
        const val = interpolations[k]
        return val === undefined ? `{${k}}` : String(val)
      })
    : template

/** The translate function for `locale`, outside React too (a server page, its metadata). */
export function getTranslator(locale: AcceptedLocale): TranslateFn {
  return ((key: string, interpolations?: Record<string, unknown>) => {
    const value = lookup(locale, key)

    // Handle plural objects
    if (
      typeof value === 'object' &&
      value !== null &&
      '_mode' in value &&
      (value as { _mode: string })._mode === 'plural'
    ) {
      const pluralObj = value as Record<string, string>
      const count = (interpolations as { count: number })?.count ?? 0

      // Exact match first (=0, =1, etc.), then fall back to 'other'
      const template = pluralObj[`=${count}`] ?? pluralObj.other

      // Replace # with count, then handle other interpolations
      return fill(template.replace(/#/g, count.toString()), interpolations)
    }

    // Handle annotated entries — extract the value string
    const template =
      typeof value === 'object' &&
      value !== null &&
      'value' in value &&
      typeof (value as { value: unknown }).value === 'string'
        ? (value as { value: string }).value
        : (value as string)

    return fill(template, interpolations)
  }) as TranslateFn
}

export const useTranslations = (locale: AcceptedLocale): TranslateFn => {
  return useCallback(
    ((key: string, interpolations?: Record<string, unknown>) =>
      (
        getTranslator(locale) as (
          key: string,
          interpolations?: Record<string, unknown>,
        ) => string
      )(key, interpolations)) as TranslateFn,
    [locale],
  )
}

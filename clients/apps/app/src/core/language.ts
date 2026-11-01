// The app's language (ios/SimeonCore/Sources/SimeonCore/AppLanguage.swift):
// one language for the whole product, sent to the server on every request
// (`Accept-Language`) and to the agents (`userLanguage`).

/** English, the source language. */
export const english = 'en'

/**
 * The languages the apps are translated into (`CFBundleLocalizations` in
 * ios/project.yml), English first. The words' check (step 1c) keeps this
 * list and the catalogue together.
 */
export const languages = [
  'en',
  'fr',
  'es',
  'de',
  'nl',
  'it',
  'pt-BR',
  'sv',
  'pl',
  'tr',
] as const

/** A localization's name as a language tag: "pt_BR" is "pt-BR". */
export function languageTag(identifier: string): string {
  const trimmed = identifier.trim().replace(/_/g, '-')
  return trimmed === '' || trimmed === 'Base' ? english : trimmed
}

/** "fr" for "fr-CA", "pt" for "pt-BR". */
export function languageCode(tag: string): string {
  return (tag.split('-')[0] ?? tag).toLowerCase()
}

export function isEnglish(tag: string): boolean {
  return languageCode(tag) === english
}

/**
 * The language the app is in: the first of the person's languages (the
 * browser's, or Windows' in Electron) that Simeon is translated into, the
 * way Apple picks an app's language from the device's list. English when
 * none is.
 */
export function pickLanguage(preferred: readonly string[]): string {
  for (const wanted of preferred.map(languageTag)) {
    const exact = languages.find(
      (tag) => tag.toLowerCase() === wanted.toLowerCase(),
    )
    if (exact) return exact
    const same = languages.find(
      (tag) => languageCode(tag) === languageCode(wanted),
    )
    if (same) return same
  }
  return english
}

/** This run's language. */
export function currentLanguage(): string {
  if (typeof navigator === 'undefined') return english
  return pickLanguage(navigator.languages ?? [navigator.language])
}

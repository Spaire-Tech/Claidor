// The app's language (ios/SimeonCore/Sources/SimeonCore/AppLanguage.swift):
// one language for the whole product, sent to the server on every request
// (`Accept-Language`) and to the agents (`userLanguage`). The person may
// choose it in Settings › General (step 6e): kept in this browser, used from
// the next load.

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

// MARK: The language chosen in Settings › General (AppLanguage.swift's picker)

/** The picker's System: no language of the app's own, the browser's order (`AppLanguage.system`). */
export const systemLanguage = 'system'

/**
 * Where this browser keeps the language chosen in Settings › General, in
 * the Mac's naming (the Mac keeps its own in the app's `AppleLanguages`).
 * Only which language, nothing of the person's.
 */
export const languageKey = 'simeon.language'

/** The page's storage, or none (a private window that refuses it, the tests). */
function storage():
  | Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * What the picker shows chosen: a language Simeon is in that was picked for
 * the app in this browser, else System (`AppLanguage.chosen`).
 */
export function chosenLanguage(
  kept: Pick<Storage, 'getItem'> | undefined = storage(),
): string {
  let value: string | null = null
  try {
    value = kept?.getItem(languageKey) ?? null
  } catch {
    // System.
  }
  if (value == null) return systemLanguage
  const wanted = languageTag(value).toLowerCase()
  return languages.find((tag) => tag.toLowerCase() === wanted) ?? systemLanguage
}

/** Picks the language the app opens in next time; System gives it back to the browser (`AppLanguage.choose`). Read as the page loads only. */
export function chooseLanguage(
  value: string,
  kept: Pick<Storage, 'setItem' | 'removeItem'> | undefined = storage(),
): void {
  try {
    if (value === systemLanguage) kept?.removeItem(languageKey)
    else kept?.setItem(languageKey, value)
  } catch {
    // Not kept: the page goes on in its language.
  }
}

/** This run's language and the choice it was opened with, read once. */
let launched: { language: string; chosen: string } | undefined

function launch(): { language: string; chosen: string } {
  if (launched) return launched
  const chosen = chosenLanguage()
  const browser =
    typeof navigator === 'undefined'
      ? [english]
      : (navigator.languages ?? [navigator.language])
  launched = {
    language: chosen !== systemLanguage ? chosen : pickLanguage(browser),
    chosen,
  }
  return launched
}

/**
 * This run's language: the one chosen in Settings › General, else the first
 * of the person's languages Simeon is in. Read once, as the page loads, as
 * Apple reads an app's language at launch: a new choice waits for the page
 * to be loaded again ("Relaunch Simeon to use it.").
 */
export function currentLanguage(): string {
  return launch().language
}

/** The choice the page was opened with: another one waits for a reload (`MacLanguage.atLaunch`). */
export function chosenAtLaunch(): string {
  return launch().chosen
}

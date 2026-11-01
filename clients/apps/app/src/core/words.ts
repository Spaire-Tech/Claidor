// The app's words in its language (docs/localization.md; L10n.swift). English
// is the source and is written in the code; the translations are the Mac
// app's String Catalogs, made into one table per language
// (scripts/make-words.mjs, `src/words`).
//
//     t`Couldn’t reach ${name}.`     // the key is "Couldn’t reach %@."
//     t('Sign in to Simeon first.')  // no values
//     tk('section.open')             // one English word, two meanings: its own key
//
// A key is the English with each value written as Apple's format does: text
// is `%@`, a whole number `%lld`, and a written % is `%%`. A count's plural is
// a variation of its key in the catalogue; the English keeps its own
// `n === 1` branch, as in Swift. Where a translation is missing the English
// is shown.
//
// Two tables, as two catalogues: the screens read the Mac app's (`src/l10n.ts`),
// the code translated from the shared core reads the core's (`src/core/l10n.ts`).

import { english } from './language'

export type Value = string | number
/** A translation in Apple's format, or its plural forms by category. */
export type Entry = string | Partial<Record<Intl.LDMLPluralRule, string>>
export type Table = Record<string, Entry>
export type TableName = 'mac' | 'core'

interface Loaded {
  language: string
  tables: Record<TableName, Table>
  /** The keyed entries' English (`section.open` is "Open"). */
  english: Record<TableName, Table>
}

let loaded: Loaded = {
  language: english,
  tables: { mac: {}, core: {} },
  english: { mac: {}, core: {} },
}

/** The language the words are in now. */
export function wordsLanguage(): string {
  return loaded.language
}

/** Puts the words in place (the tests, and `loadWords`). */
export function setWords(
  language: string,
  tables: Partial<Record<TableName, Table>>,
  englishTables: Partial<Record<TableName, Table>> = {},
): void {
  loaded = {
    language,
    tables: { mac: tables.mac ?? {}, core: tables.core ?? {} },
    english: { mac: englishTables.mac ?? {}, core: englishTables.core ?? {} },
  }
}

const files = import.meta.glob<{ default: Table }>('../words/*/*.json')

async function file(name: TableName, language: string): Promise<Table> {
  const load = files[`../words/${name}/${language}.json`]
  return load ? (await load()).default : {}
}

/** Loads the language's words (only that language is downloaded), before the window draws. */
export async function loadWords(language: string): Promise<void> {
  const [mac, core, macEnglish, coreEnglish] = await Promise.all([
    file('mac', language),
    file('core', language),
    file('mac', english),
    file('core', english),
  ])
  setWords(language, { mac, core }, { mac: macEnglish, core: coreEnglish })
}

/** The key Swift's interpolation makes: text as `%@`, a number as `%lld`, a written % as `%%`. */
export function keyOf(
  strings: readonly string[],
  values: readonly Value[],
): string {
  let key = strings[0]?.replace(/%/g, '%%') ?? ''
  values.forEach((value, index) => {
    key += typeof value === 'number' ? '%lld' : '%@'
    key += strings[index + 1]?.replace(/%/g, '%%') ?? ''
  })
  return key
}

/** Apple's format with its values in place: `%@` and `%lld` in turn, `%2$@` by place, `%%` a %. */
export function format(template: string, values: readonly Value[]): string {
  let next = 0
  return template.replace(
    /%(?:(\d+)\$)?(@|lld|%)/g,
    (_, place: string | undefined, kind: string) => {
      if (kind === '%') return '%'
      const value = place ? values[Number(place) - 1] : values[next++]
      if (value == null) return ''
      return typeof value === 'number' ? String(Math.trunc(value)) : value
    },
  )
}

function chosen(
  entry: Entry,
  values: readonly Value[],
  language: string,
): string {
  if (typeof entry === 'string') return entry
  const count =
    values.find((value): value is number => typeof value === 'number') ?? 0
  const category = new Intl.PluralRules(language).select(count)
  return entry[category] ?? entry.other ?? Object.values(entry)[0] ?? ''
}

function lookup(
  name: TableName,
  key: string,
  fallback: string,
  values: readonly Value[],
): string {
  const entry = loaded.tables[name][key] ?? loaded.english[name][key]
  const language = loaded.tables[name][key] != null ? loaded.language : english
  return format(
    entry != null ? chosen(entry, values, language) : fallback,
    values,
  )
}

export type Translate = {
  (english: string): string
  (strings: TemplateStringsArray, ...values: Value[]): string
}

/** `t` for one table: a plain English sentence, or one with values as a template. */
export function translator(name: TableName): Translate {
  return ((english: string | TemplateStringsArray, ...values: Value[]) => {
    const key =
      typeof english === 'string'
        ? keyOf([english], [])
        : keyOf(english, values)
    return lookup(name, key, key, values)
  }) as Translate
}

/** `tk` for one table: a sentence with its own key, its English in the catalogue. */
export function keyedTranslator(
  name: TableName,
): (key: string, ...values: Value[]) => string {
  return (key, ...values) => lookup(name, key, key, values)
}

// The app's words, made from the Mac app's String Catalogs
// (docs/localization.md): English is the source, written in the code; each
// translation lives in the catalogue its Swift lives with, and the web app
// reads the same two, turned into one small table per language:
//
// - `src/words/mac/<language>.json`: the Mac app's screens
//   (mac/Simeon/Localizable.xcstrings), for the web app's screens;
// - `src/words/core/<language>.json`: the shared core's sentences
//   (ios/SimeonCore/Sources/SimeonCore/Resources/Localizable.xcstrings), for
//   the code translated from it (`src/core`).
//
// Two tables because the two catalogues sometimes say the same English two
// ways ("Done" is "OK" on a Mac screen and "Terminé" in the core's
// sentences). Each entry is the translation in Apple's format (`%@`, `%lld`,
// `%1$@`, `%%`), or its plural forms by category (`one`, `few`, `many`,
// `other`). English has a table only for the entries whose key is not the
// English itself (`section.open`).
//
//   node scripts/make-words.mjs          # writes the tables
//   node scripts/make-words.mjs --check  # fails when they are not the catalogues' (run by `pnpm test`)

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const root = join(app, '../../..')
const out = join(app, 'src/words')

export const catalogues = {
  mac: 'mac/Simeon/Localizable.xcstrings',
  core: 'ios/SimeonCore/Sources/SimeonCore/Resources/Localizable.xcstrings',
}

/** One localization as the web keeps it: a string, or its plural forms. */
function entry(localization) {
  if (localization.stringUnit) return localization.stringUnit.value
  const plural = localization.variations?.plural
  if (plural) {
    const forms = {}
    for (const category of Object.keys(plural).sort()) {
      forms[category] = plural[category].stringUnit.value
    }
    return forms
  }
  throw new Error(
    `An entry this script cannot read: ${JSON.stringify(localization)}`,
  )
}

/** Every table, by catalogue and language: `{ mac: { fr: {...} }, core: {...} }`. */
export function makeTables() {
  const tables = {}
  for (const [name, path] of Object.entries(catalogues)) {
    const catalogue = JSON.parse(readFileSync(join(root, path), 'utf8'))
    const byLanguage = {}
    for (const key of Object.keys(catalogue.strings).sort()) {
      const item = catalogue.strings[key]
      if (item.shouldTranslate === false) continue
      for (const [language, localization] of Object.entries(
        item.localizations ?? {},
      )) {
        byLanguage[language] ??= {}
        byLanguage[language][key] = entry(localization)
      }
    }
    tables[name] = byLanguage
  }
  return tables
}

function text(table) {
  return JSON.stringify(table, null, 1) + '\n'
}

function written() {
  const found = {}
  for (const name of Object.keys(catalogues)) {
    found[name] = {}
    let files = []
    try {
      files = readdirSync(join(out, name))
    } catch {
      continue
    }
    for (const file of files) {
      found[name][file] = readFileSync(join(out, name, file), 'utf8')
    }
  }
  return found
}

const tables = makeTables()

if (process.argv.includes('--check')) {
  const kept = written()
  const problems = []
  for (const [name, byLanguage] of Object.entries(tables)) {
    for (const [language, table] of Object.entries(byLanguage)) {
      const file = `${language}.json`
      if (kept[name][file] == null)
        problems.push(`missing: src/words/${name}/${file}`)
      else if (kept[name][file] !== text(table))
        problems.push(`out of date: src/words/${name}/${file}`)
    }
    for (const file of Object.keys(kept[name])) {
      if (!byLanguage[file.replace(/\.json$/, '')])
        problems.push(`left over: src/words/${name}/${file}`)
    }
  }
  if (problems.length > 0) {
    console.error("The web app's words are not the String Catalogs':")
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(
      'Run `node scripts/make-words.mjs` in clients/apps/app and commit the result.',
    )
    process.exitCode = 1
  } else {
    const counts = Object.entries(tables)
      .map(
        ([name, byLanguage]) =>
          `${name} ${Object.keys(byLanguage).length} languages`,
      )
      .join(', ')
    console.log(`The words are the String Catalogs' (${counts}).`)
  }
} else {
  rmSync(out, { recursive: true, force: true })
  for (const [name, byLanguage] of Object.entries(tables)) {
    for (const [language, table] of Object.entries(byLanguage)) {
      const path = join(out, name, `${language}.json`)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text(table))
    }
  }
  console.log(`Wrote src/words/{${Object.keys(tables).join(',')}}/*.json`)
}

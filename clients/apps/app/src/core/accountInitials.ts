// The account's letters on its disc (AccountSettings.swift's
// `AccountInitials`): the first letter of the name's first word and of its
// last, what is in brackets left out ("Ana (Team) Lopez" is AL); a single
// word gives one letter; with no word, the first letter that isn't
// punctuation, space or a mark; else "?".

const bracketed = /[([{（［｛【〔][^)\]}）］｝】〕]*[)\]}）］｝】〕]?/gu
const word = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu
const quiet = /^[\p{P}\p{Z}\p{C}\p{M}]+$/u

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** A word's first character as a person sees it (Swift's `Character`). */
function firstCharacter(text: string): string {
  for (const { segment } of graphemes.segment(text)) return segment
  return ''
}

function firstLetter(text: string): string | undefined {
  for (const { segment } of graphemes.segment(text))
    if (!quiet.test(segment)) return segment
  return undefined
}

export function accountInitials(name: string): string {
  const plain = name.replace(bracketed, ' ')
  for (const text of [plain, name]) {
    const words = text.match(word) ?? []
    const first = words[0]
    if (first === undefined) continue
    const last = words.length > 1 ? words[words.length - 1] : undefined
    const letters = firstCharacter(first) + (last ? firstCharacter(last) : '')
    if (letters !== '') return letters.toUpperCase()
  }
  const lone = firstLetter(plain) ?? firstLetter(name) ?? ''
  return lone === '' ? '?' : lone.toUpperCase()
}

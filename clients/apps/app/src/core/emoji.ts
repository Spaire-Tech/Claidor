// Every emoji, as the window lists them (SimeonCore's Emoji.swift, from the
// core's own Resources/emoji.json): in its groups and order, each with its
// name, shortcodes and search words; found as the window's search finds them.
// The list is read when the picker first opens (`loadEmojiCatalog`).

import { t } from './l10n'

export interface Emoji {
  /** Its shortcode-like id ("tada"). */
  id: string
  name: string
  character: string
  shortcodes: string[]
  /** The words it is found by, in small letters. */
  search: string
}

/** One of the window's groups ("Smileys & emotion", "People & body"…). */
export interface EmojiCategory {
  id: string
  label: string
  emojis: Emoji[]
}

/** A group's name in the app's language; the list's own English for a group it does not know (`EmojiCatalog.label`). */
export function categoryLabel(id: string, english: string): string {
  switch (id) {
    case 'smileys-emotion':
      return t('Smileys & emotion')
    case 'people-body':
      return t('People & body')
    case 'animals-nature':
      return t('Animals & nature')
    case 'food-drink':
      return t('Food & drink')
    case 'travel-places':
      return t('Travel & places')
    case 'activities':
      return t('Activities')
    case 'objects':
      return t('Objects')
    case 'symbols':
      return t('Symbols')
    case 'flags':
      return t('Flags')
    default:
      return english
  }
}

/** The list's groups, in its order (the "components" group left out, as the window does), and every emoji in that order. */
export class EmojiCatalog {
  readonly all: Emoji[]

  constructor(readonly categories: EmojiCategory[]) {
    this.all = categories.flatMap((category) => category.emojis)
  }

  /** The catalogue from emoji.json's `{categories: [{id, label, emojis: [[id, name, character, shortcodes, search]]}]}`. */
  static from(root: unknown): EmojiCatalog {
    const groups = (root as { categories?: unknown[] } | null)?.categories
    if (!Array.isArray(groups)) return new EmojiCatalog([])
    const categories: EmojiCategory[] = []
    for (const group of groups) {
      const { id, label, emojis } = (group ?? {}) as {
        id?: unknown
        label?: unknown
        emojis?: unknown
      }
      if (
        typeof id !== 'string' ||
        typeof label !== 'string' ||
        !Array.isArray(emojis)
      )
        continue
      const rows: Emoji[] = []
      for (const row of emojis) {
        if (!Array.isArray(row) || row.length !== 5) continue
        const [emojiId, name, character, codes, search] = row as unknown[]
        if (
          typeof emojiId !== 'string' ||
          typeof name !== 'string' ||
          typeof character !== 'string' ||
          !Array.isArray(codes) ||
          typeof search !== 'string'
        )
          continue
        rows.push({
          id: emojiId,
          name,
          character,
          shortcodes: codes.filter((c): c is string => typeof c === 'string'),
          search,
        })
      }
      categories.push({ id, label: categoryLabel(id, label), emojis: rows })
    }
    return new EmojiCatalog(categories)
  }

  /**
   * The emoji `query` finds, as the window's `lft`: every one whose words
   * hold it; first those whose id or a shortcode starts with it, or whose
   * name starts with it or has a word that does; each group in the order of
   * `recent` (ids, newest first), then the list's; at most `limit`. Nothing
   * typed gives the list from its start.
   */
  search(query: string, limit = 96, recent: readonly string[] = []): Emoji[] {
    const wanted = query.trim().toLowerCase()
    const first: Emoji[] = []
    const second: Emoji[] = []
    for (const emoji of this.all) {
      if (wanted === '') {
        first.push(emoji)
        continue
      }
      if (!emoji.search.includes(wanted)) continue
      const name = emoji.name.toLowerCase()
      if (
        emoji.id.startsWith(wanted) ||
        emoji.shortcodes.some((code) => code.startsWith(wanted)) ||
        name.startsWith(wanted) ||
        name.includes(' ' + wanted)
      )
        first.push(emoji)
      else second.push(emoji)
    }
    const rank = new Map<string, number>()
    recent.forEach((id, index) => {
      if (!rank.has(id)) rank.set(id, index)
    })
    const ordered = (list: Emoji[]) =>
      rank.size === 0
        ? list
        : list
            .map((emoji, offset) => ({ emoji, offset }))
            .sort((a, b) => {
              const ra = rank.get(a.emoji.id) ?? Number.MAX_SAFE_INTEGER
              const rb = rank.get(b.emoji.id) ?? Number.MAX_SAFE_INTEGER
              return ra !== rb ? ra - rb : a.offset - b.offset
            })
            .map((item) => item.emoji)
    return [...ordered(first), ...ordered(second)].slice(0, limit)
  }

  /** What ":" offers for `query`: twelve at most, the ones picked lately first. */
  suggestions(query: string, recent: readonly string[]): Emoji[] {
    return this.search(query, 12, recent)
  }
}

/** The ids picked lately from ":", newest first, after `id` is picked: at most 50 (the window's `emojiRecents`). */
export function remembering(id: string, recent: readonly string[]): string[] {
  return [id, ...recent.filter((one) => one !== id)].slice(0, 50)
}

/**
 * The ":" being typed at the end of a draft (`EmojiCatalog.query`): a colon
 * at the start or after anything but a letter, a digit, "_", ":" or "/" (so
 * not in "10:30" or "https://"), then two to fifty of a–z, 0–9, "_", "+" or
 * "-", and nothing after.
 */
export function emojiQuery(draft: string): string | undefined {
  const colon = draft.lastIndexOf(':')
  if (colon < 0) return undefined
  if (colon > 0) {
    const before = [...draft.slice(0, colon)].pop()!
    if (/[\p{L}\p{N}_:/]/u.test(before)) return undefined
  }
  const typed = draft.slice(colon + 1)
  if (typed.length < 2 || typed.length > 50 || !/^[a-z0-9_+-]+$/.test(typed))
    return undefined
  return typed
}

/** The draft with its ":query" at the end swapped for the emoji and a space. */
export function insertingEmoji(emoji: string, draft: string): string {
  const colon = draft.lastIndexOf(':')
  if (colon < 0) return draft + emoji + ' '
  return draft.slice(0, colon) + emoji + ' '
}

let loading: Promise<EmojiCatalog> | undefined

/** The catalogue, read once, when it is first wanted (706 KB: not in the app's first script). */
export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  loading ??=
    import('../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/emoji.json').then(
      (module) => EmojiCatalog.from(module.default),
    )
  return loading
}

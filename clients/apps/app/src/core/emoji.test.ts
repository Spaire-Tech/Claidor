// SimeonCore's EmojiTests (ChatExtrasTests.swift), translated.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  type EmojiCatalog,
  emojiQuery,
  insertingEmoji,
  loadEmojiCatalog,
  remembering,
} from './emoji'
import { loadWords } from './words'

let catalog: EmojiCatalog
beforeAll(async () => {
  loadWords('en')
  catalog = await loadEmojiCatalog()
})

describe('the emoji', () => {
  it("are the window's list in its groups", () => {
    expect(catalog.categories.map((c) => c.label)).toEqual([
      'Smileys & emotion',
      'People & body',
      'Animals & nature',
      'Food & drink',
      'Travel & places',
      'Activities',
      'Objects',
      'Symbols',
      'Flags',
    ])
    // Each emoji and its skin tones, as the window lists them.
    expect(catalog.all.length).toBe(3_944)
    expect(catalog.all[0]?.character).toBe('😀')
    expect(new Set(catalog.all.map((e) => e.id)).size).toBe(catalog.all.length)
    const tada = catalog.all.find((e) => e.character === '🎉')
    expect(tada?.id).toBe('tada')
    expect(tada?.name).toBe('Party popper')
    for (const reaction of ['👍', '👎', '❤️', '😂', '🎉', '😮'])
      expect(catalog.all.some((e) => e.character === reaction)).toBe(true)
  })

  it('are found as the window finds them', () => {
    expect(catalog.search('tada')[0]?.character).toBe('🎉')
    expect(catalog.search('+1')[0]?.character).toBe('👍')
    expect(catalog.search('joy')[0]?.character).toBe('😂')
    expect(catalog.search('rocket').map((e) => e.character)).toContain('🚀')
    // Nothing typed gives the list from its start, 96 at most.
    expect(catalog.search('').length).toBe(96)
    expect(catalog.search('zzzzqqq')).toEqual([])
    // Starting matches come before ones only holding the words; recents first within each.
    const plain = catalog.search('smile', 400)
    const starts = (e: (typeof plain)[number]) =>
      e.id.startsWith('smile') ||
      e.shortcodes.some((c) => c.startsWith('smile')) ||
      e.name.toLowerCase().startsWith('smile') ||
      e.name.toLowerCase().includes(' smile')
    const firstNonStarting = plain.findIndex((e) => !starts(e))
    const lastStarting = plain.map(starts).lastIndexOf(true)
    if (firstNonStarting >= 0)
      expect(lastStarting).toBeLessThan(firstNonStarting)
    const recentFirst = catalog.suggestions('smile', [plain[3]!.id])
    expect(recentFirst[0]?.id).toBe(plain[3]!.id)
    expect(recentFirst.length).toBeLessThanOrEqual(12)
  })

  it('read the colon being typed', () => {
    expect(emojiQuery('well done :ta')).toBe('ta')
    expect(emojiQuery(':+1')).toBe('+1')
    expect(emojiQuery('(:smile')).toBe('smile')
    expect(emojiQuery('well done :t')).toBeUndefined()
    expect(emojiQuery('at 10:30')).toBeUndefined()
    expect(emojiQuery('well :tada done')).toBeUndefined()
    expect(emojiQuery('see https://x')).toBeUndefined()
    expect(emojiQuery('well::ta')).toBeUndefined()
    // The window's rule is lowercase.
    expect(emojiQuery('well done :Ta')).toBeUndefined()
    expect(emojiQuery(':' + 'a'.repeat(51))).toBeUndefined()
    expect(insertingEmoji('🎉', 'well done :ta')).toBe('well done 🎉 ')
  })

  it('remember fifty recent picks at most', () => {
    const recent = remembering('smile', remembering('tada', []))
    expect(recent).toEqual(['smile', 'tada'])
    expect(remembering('tada', recent)).toEqual(['tada', 'smile'])
    expect(
      remembering(
        'x',
        Array.from({ length: 80 }, (_, i) => String(i)),
      ).length,
    ).toBe(50)
  })
})

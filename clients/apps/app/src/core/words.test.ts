// The words as the Mac shows them: the same keys, the same tables, the same
// plurals, against the real catalogues' French and Polish.

import { afterEach, describe, expect, it } from 'vitest'
import { t as screens, tk as screensKeyed } from '../l10n'
import { t as core, tk as coreKeyed } from './l10n'
import { format, keyOf, loadWords, setWords, wordsLanguage } from './words'

afterEach(() => setWords('en', {}))

describe('the keys', () => {
  it('writes text as %@, a number as %lld and a written % as %%, as Swift does', () => {
    expect(keyOf(['Couldn’t reach ', '.'], ['Ada'])).toBe('Couldn’t reach %@.')
    expect(keyOf(['', ' agents'], [3])).toBe('%lld agents')
    expect(keyOf(['', '%'], [50])).toBe('%lld%%')
  })

  it('puts the values in, in turn or by place', () => {
    expect(format('%@ on %@', ['main', 'simeon'])).toBe('main on simeon')
    expect(
      format('Remplir ton identifiant %1$@ sur %2$@', ['Gmail', 'google.com']),
    ).toBe('Remplir ton identifiant Gmail sur google.com')
    expect(format('%2$@ ← %1$@', ['a', 'b'])).toBe('b ← a')
    expect(format('%lld %%', [50])).toBe('50 %')
  })
})

describe('English', () => {
  it('shows the English as written, with its values', () => {
    expect(wordsLanguage()).toBe('en')
    expect(core('Sign in to Simeon first.')).toBe('Sign in to Simeon first.')
    expect(core`Fill your ${'Gmail'} login on ${'google.com'}`).toBe(
      'Fill your Gmail login on google.com',
    )
    expect(core`${50}%`).toBe('50%')
  })

  it('reads a keyed sentence’s English from the catalogue', async () => {
    await loadWords('en')
    expect(screensKeyed('section.open')).toBe('Open')
    expect(coreKeyed('day.ordinal', 3)).toBe('3')
  })
})

describe('French', () => {
  it('reads each table: the screens the Mac’s, the core’s its own', async () => {
    await loadWords('fr')
    expect(wordsLanguage()).toBe('fr')
    // "Done" is "OK" on a Mac screen and "Terminé" in the core's sentences.
    expect(screens('Done')).toBe('OK')
    expect(core('Done')).toBe('Terminé')
    expect(screens('Not now')).toBe('Pas maintenant')
    expect(core('Not now')).toBe('Plus tard')
    expect(core('Sign in to Simeon first.')).toBe(
      'Connecte-toi d’abord à Simeon.',
    )
  })

  it('puts values where the translation puts them', async () => {
    await loadWords('fr')
    expect(core`Fill your ${'Gmail'} login on ${'google.com'}`).toBe(
      'Remplir ton identifiant Gmail sur google.com',
    )
    expect(screens`${'Slack'}\n\nComing soon\n${'Bientôt'}`).toBe(
      'Slack\n\nBientôt disponible\nBientôt',
    )
    expect(core`${50}%`).toBe('50\u202f%')
  })

  it('picks the plural the number needs', async () => {
    await loadWords('fr')
    expect(core`${1} agents`).toBe('1 agent')
    expect(core`${3} agents`).toBe('3 agents')
    expect(coreKeyed('day.ordinal', 1)).toBe('1er')
    expect(coreKeyed('day.ordinal', 2)).toBe('2')
    expect(screensKeyed('section.open')).toBe('Ouverte')
  })

  it('shows the English where a sentence has no translation', async () => {
    await loadWords('fr')
    expect(core`Nothing like this is in the catalogue, ${'Ada'}.`).toBe(
      'Nothing like this is in the catalogue, Ada.',
    )
  })
})

describe('Polish', () => {
  it('has its four plurals', async () => {
    await loadWords('pl')
    expect([1, 3, 5, 22].map((n) => core`${n} agents`)).toEqual([
      '1 agent',
      '3 agenty',
      '5 agentów',
      '22 agenty',
    ])
  })
})

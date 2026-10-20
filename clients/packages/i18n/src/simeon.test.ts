import { describe, expect, it } from 'vitest'
import { getTranslator, simeonLocale } from './index'
import en from './locales/en'
import fr from './locales/fr'

// Simeon's own pages (`simeon`, 20 October 2026): English and French, in
// "tu"; the checkout's other languages read English there.

const leaves = (table: object, prefix = ''): [string, string][] =>
  Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value as object, `${prefix}${key}.`),
  )

const values = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('simeon', () => {
  it('has every English sentence in French, with the same values', () => {
    const french = new Map(leaves(fr.simeon))
    for (const [key, english] of leaves(en.simeon)) {
      const translated = french.get(key)
      expect(translated, key).toBeTruthy()
      expect(values(translated ?? ''), key).toEqual(values(english))
    }
    expect([...french.keys()].sort()).toEqual(
      leaves(en.simeon)
        .map(([key]) => key)
        .sort(),
    )
  })

  it('writes French typography', () => {
    for (const [key, text] of leaves(fr.simeon)) {
      expect(text, key).not.toMatch(/[  ][:;!?](\s|$)/)
      expect(text, key).not.toMatch(/'/)
    }
  })

  it('reads French in French, English in a language Simeon is not in', () => {
    expect(getTranslator('fr')('simeon.signIn.signIn')).toBe('Se connecter')
    expect(getTranslator('fr-CA')('simeon.signIn.signIn')).toBe('Se connecter')
    expect(getTranslator('en')('simeon.signIn.signIn')).toBe('Sign in')
    expect(getTranslator('de')('simeon.signIn.signIn')).toBe('Sign in')
    expect(
      getTranslator('de')('simeon.signIn.codeSentTo', { email: 'a@b.co' }),
    ).toBe('We sent a six-character code to a@b.co.')
  })

  it('picks English for the pages in a language Simeon is not in', () => {
    expect(simeonLocale('fr')).toBe('fr')
    expect(simeonLocale('fr-CA')).toBe('fr-CA')
    expect(simeonLocale('en-GB')).toBe('en-GB')
    expect(simeonLocale('de')).toBe('en')
    expect(simeonLocale('pt-PT')).toBe('en')
  })

  it('keeps the checkout as it was', () => {
    expect(getTranslator('de')('checkout.footer.poweredBy')).toBe(
      'Bereitgestellt von',
    )
    expect(getTranslator('fr')('checkout.form.email')).toBe(
      (fr.checkout.form as { email: string }).email,
    )
  })
})

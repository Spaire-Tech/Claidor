import { describe, expect, it } from 'vitest'
import { getTranslator, simeonLocale } from './index'
import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import hu from './locales/hu'
import it_ from './locales/it'
import nl from './locales/nl'
import pt from './locales/pt'
import ptPT from './locales/pt-PT'
import sv from './locales/sv'

// Simeon's own pages (`simeon`): English, French (20 October 2026) and
// Spanish (21 October 2026), in "tu" and "tú"; the checkout's other
// languages read English there.

const leaves = (table: object, prefix = ''): [string, string][] =>
  Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value as object, `${prefix}${key}.`),
  )

const values = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** Every locale that has Simeon's pages, besides English. */
const translated: Record<string, object> = Object.fromEntries(
  Object.entries({ de, es, fr, hu, it: it_, nl, pt, 'pt-PT': ptPT, sv })
    .filter(([, table]) => 'simeon' in table)
    .map(([language, table]) => [
      language,
      (table as { simeon: object }).simeon,
    ]),
)

/** How each language is written, beyond its words. */
const typography: Record<string, (text: string, key: string) => void> = {
  fr: (text, key) => {
    expect(text, key).not.toMatch(/[  ][:;!?](\s|$)/)
    expect(text, key).not.toMatch(/'/)
  },
  es: (text, key) => {
    expect(text, key).not.toMatch(/[ «»']/)
    expect(text, key).not.toMatch(/\s[:;!?]/)
    expect(text.split('?').length, key).toBe(text.split('¿').length)
    expect(text.split('!').length, key).toBe(text.split('¡').length)
  },
}

describe('simeon', () => {
  it('is in French and Spanish', () => {
    expect(Object.keys(translated).sort()).toEqual(['es', 'fr'])
  })

  for (const [language, table] of Object.entries(translated)) {
    it(`has every English sentence in ${language}, with the same values`, () => {
      const words = new Map(leaves(table))
      for (const [key, english] of leaves(en.simeon)) {
        const said = words.get(key)
        expect(said, key).toBeTruthy()
        expect(values(said ?? ''), key).toEqual(values(english))
      }
      expect([...words.keys()].sort()).toEqual(
        leaves(en.simeon)
          .map(([key]) => key)
          .sort(),
      )
    })

    it(`writes ${language} the way it is written`, () => {
      const check = typography[language]
      expect(check, language).toBeDefined()
      for (const [key, text] of leaves(table)) check(text, key)
    })
  }

  it('reads each language in it, English in a language Simeon is not in', () => {
    expect(getTranslator('fr')('simeon.signIn.signIn')).toBe('Se connecter')
    expect(getTranslator('fr-CA')('simeon.signIn.signIn')).toBe('Se connecter')
    expect(getTranslator('es')('simeon.signIn.signIn')).toBe('Iniciar sesión')
    expect(getTranslator('es-MX')('simeon.signIn.signIn')).toBe(
      'Iniciar sesión',
    )
    expect(getTranslator('en')('simeon.signIn.signIn')).toBe('Sign in')
    expect(getTranslator('de')('simeon.signIn.signIn')).toBe('Sign in')
    expect(
      getTranslator('de')('simeon.signIn.codeSentTo', { email: 'a@b.co' }),
    ).toBe('We sent a six-character code to a@b.co.')
  })

  it('picks English for the pages in a language Simeon is not in', () => {
    expect(simeonLocale('fr')).toBe('fr')
    expect(simeonLocale('fr-CA')).toBe('fr-CA')
    expect(simeonLocale('es')).toBe('es')
    expect(simeonLocale('es-MX')).toBe('es-MX')
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
    expect(getTranslator('es')('checkout.form.email')).toBe(
      (es.checkout.form as { email: string }).email,
    )
  })
})

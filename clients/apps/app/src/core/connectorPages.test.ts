// SimeonCore's ConnectorPagesTests (the connector pages' words and links,
// ConnectorPages.swift), translated, with the table's own checks: it is the
// core's (scripts/make-connector-pages.mjs --check, run by `pnpm test`), and
// a page's words are in the app's language when it is asked for.

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  byline,
  connectorPage,
  informationWords,
  shownAddress,
  written,
} from './connectorPages'
import { findMentions } from './mentions'
import { type Table, setWords } from './words'

afterEach(() => setWords('en', {}))

describe('the connector pages', () => {
  it('every written page has three examples naming its connector, and safe links', () => {
    expect(written.length).toBe(232)
    for (const id of written) {
      const page = connectorPage(id)
      expect(page, id).toBeDefined()
      expect(page!.maker, id).not.toBe('')
      expect(page!.about, id).not.toBe('')
      expect(page!.examples.length, id).toBe(3)
      // Each example names an app the chat dresses with its logo (an everyday-word name, as Square, only after "in", "on", "from"…), so the card shows it as a message would.
      for (const example of page!.examples) {
        const apps = findMentions(example, { agents: [] }).filter(
          (m) => m.kind.kind === 'brand',
        )
        expect(apps.length, `${id}: ${example}`).toBeGreaterThan(0)
      }
      for (const link of [page!.website, page!.privacy, page!.terms]) {
        expect(new URL(link).protocol, id).toBe('https:')
      }
    }
    expect(connectorPage('not-a-connector')).toBeUndefined()
  })

  it('a link shows its host', () => {
    expect(shownAddress('https://www.dropbox.com/privacy')).toBe('dropbox.com')
    expect(shownAddress('https://policies.google.com/terms')).toBe(
      'policies.google.com',
    )
  })

  it('reads every case of the core’s pages, and is in the app’s language when asked for', () => {
    const swift = readFileSync(
      new URL(
        '../../../../../ios/SimeonCore/Sources/SimeonCore/ConnectorPages.swift',
        import.meta.url,
      ),
      'utf8',
    )
    // One page per case of `page(for:)`, each in `written`.
    const cases = [...swift.matchAll(/^ {4}case "([^"]+)":/gm)].map((m) => m[1])
    expect([...cases].sort()).toEqual([...written].sort())
    const gmail = connectorPage('gmail')!
    expect(gmail.maker).toBe('Google')
    expect(gmail.website).toBe('https://workspace.google.com/products/gmail/')
    expect(byline(gmail)).toBe('By Google')
    expect(gmail.examples[0]).toBe(
      'Summarize the last five emails from my accountant in Gmail and list what needs a reply.',
    )
    const core = JSON.parse(
      readFileSync(new URL('../words/core/fr.json', import.meta.url), 'utf8'),
    ) as Table
    setWords('fr', { core })
    const french = connectorPage('gmail')!
    expect(byline(french)).toBe('Par Google')
    expect(french.examples[0]).toBe(
      'Résume les cinq derniers e-mails de mon comptable dans Gmail et liste ce qui demande une réponse.',
    )
    // The maker's name and the links are the same in every language.
    expect(french.maker).toBe('Google')
    expect(french.terms).toBe(gmail.terms)
    expect(informationWords.developer()).not.toBe('Developer')
  })
})

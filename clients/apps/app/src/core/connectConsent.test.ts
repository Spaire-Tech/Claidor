// What the person reads before an app's sign-in (the core's
// ConnectConsent.swift): CoreTests.swift's `ConnectConsentTests`, and each
// app's part read from the Swift itself, so the two tables can't drift.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type CatalogApp,
  appsComingSoonBuiltIn,
  comingSoonNames,
  connectorIconId,
} from './connectCards'
import { connectConsent, consentTables } from './connectConsent'

function app(
  values: Partial<CatalogApp> & { id: string; title: string },
): CatalogApp {
  return {
    name: values.id,
    summary: '',
    category: '',
    comingSoon: false,
    ...values,
  }
}

describe('the consent (ConnectConsentTests)', () => {
  it('each app fills the template', () => {
    const stripe = app({
      id: 'stripe',
      title: 'Stripe',
      summary: 'Customers, payments, subscriptions, and invoices.',
      serverURL: 'https://mcp.stripe.com',
    })
    const consent = connectConsent(stripe, 'Stripe')
    expect(consent.title).toBe('Stripe')
    expect(consent.points.map((point) => point.title)).toEqual([
      'Put Stripe to work',
      'You stay in charge',
      'Check their work',
    ])
    expect(consent.points[0]!.body).toBe(
      'Your agents can read and use customers, payments, subscriptions and invoices in Stripe.',
    )
    expect(consent.route).toEqual({ kind: 'vendor', host: 'mcp.stripe.com' })
    expect(consent.smallPrint[0]).toContain("Stripe's own page")
    // No consent names the sign-in partner.
    expect(consent.smallPrint.join('')).not.toContain('Composio')
    expect(consent.note).toBe(
      'Anything that moves money in Stripe is real. Ask your agents to check with you before they move any.',
    )
  })

  it('never names the sign-in partner', () => {
    const gmail = app({
      id: 'gmail',
      title: 'Gmail',
      summary: 'Search, read, draft, and manage email.',
      serverURL: 'https://api.simeonlabs.com/desktop/api/apps/mcp/gmail',
    })
    const consent = connectConsent(gmail, 'Gmail')
    expect(consent.route).toEqual({ kind: 'composio' })
    // White label (13 October 2026): the partner is said, not named.
    expect(
      consent.smallPrint[0]!.startsWith(
        'Simeon connects Gmail through a secure sign-in partner',
      ),
    ).toBe(true)
    expect(
      [
        consent.title,
        consent.summary,
        consent.note ?? '',
        ...consent.smallPrint,
        ...consent.points.map((point) => point.body),
      ]
        .join('')
        .toLowerCase(),
    ).not.toContain('composio')
    expect(consent.note).toBe(
      'Emails your agents send go out from your own address.',
    )
    const byToolkit = app({
      id: 'notion',
      title: 'Notion',
      composioToolkit: 'notion',
    })
    expect(connectConsent(byToolkit, 'Notion').route).toEqual({
      kind: 'composio',
    })
  })

  it('Link says every purchase waits for the Link app', () => {
    const link = connectConsent(
      app({
        id: 'link',
        title: 'Link',
        summary: 'Buy what you ask for.',
        serverURL: 'https://link.com/agents',
      }),
      'Link',
    )
    expect(link.points[0]!.body).toContain('one-time card')
    expect(
      link.smallPrint[0]!.startsWith(
        "You'll approve the connection on link.com or in the Link app",
      ),
    ).toBe(true)
    expect(link.smallPrint[0]).toContain(
      'never sees your password or your card numbers',
    )
    expect(
      link.note?.startsWith(
        'Nothing is paid until you approve the purchase in the Link app',
      ),
    ).toBe(true)
  })

  it('Shop says how it pays', () => {
    const shop = connectConsent(
      app({
        id: 'shop',
        title: 'Shop',
        summary: 'Find products across Shopify stores.',
        serverURL: 'https://shop.app',
      }),
      'Shop',
    )
    expect(shop.points[0]!.body).toContain(
      'pay for what you asked them to buy with your Shop card',
    )
    expect(
      shop.smallPrint[0]!.startsWith(
        "You'll approve the connection on Shop's own page",
      ),
    ).toBe(true)
    expect(shop.note?.startsWith('Nothing is paid until you press Allow')).toBe(
      true,
    )
    expect(connectorIconId('Shop')).toBe('shop')
    // Shop and Shopify stay apart.
    expect(connectorIconId('Shopify')).toBe('shopify')
  })

  it('an app on its maker’s server says so', () => {
    const granola = connectConsent(
      app({
        id: 'granola',
        title: 'Granola',
        serverURL: 'https://mcp.granola.ai/mcp',
      }),
      'Granola',
    )
    expect(granola.route).toEqual({ kind: 'vendor', host: 'mcp.granola.ai' })
    expect(granola.points[0]!.body).toBe(
      'Your agents can read and use your meeting notes, transcripts and folders in Granola.',
    )
    expect(granola.smallPrint[0]).toContain(
      'Granola runs this connection from its own server (mcp.granola.ai)',
    )
    const resend = connectConsent(
      app({
        id: 'resend',
        title: 'Resend',
        serverURL: 'https://mcp.resend.com',
      }),
      'Resend',
    )
    expect(resend.note).toBe(
      'Emails your agents send go out from your own domains.',
    )
    // Shopify's own server takes only the clients it has approved (13 October 2026): still "Coming soon".
    expect(appsComingSoonBuiltIn).toContain('shopify')
    // The server names an app by Composio's name, the catalogue by its own: either finds it.
    expect(comingSoonNames(appsComingSoonBuiltIn, 'microsoft-to-do')).toBe(true)
    expect(comingSoonNames(appsComingSoonBuiltIn, 'Microsoft To Do')).toBe(true)
    expect(comingSoonNames(['Microsoft_ToDo'], 'microsoft-to-do')).toBe(true)
    expect(comingSoonNames(appsComingSoonBuiltIn, 'Microsoft Teams')).toBe(
      false,
    )
    expect(comingSoonNames(appsComingSoonBuiltIn, '')).toBe(false)
    const lovable = connectConsent(
      app({
        id: 'lovable',
        title: 'Lovable',
        serverURL: 'https://mcp.lovable.dev',
      }),
      'Lovable',
    )
    expect(lovable.points[0]!.body).toBe(
      'Your agents can read and use your projects, workspaces and their code in Lovable.',
    )
    expect(lovable.route).toEqual({ kind: 'vendor', host: 'mcp.lovable.dev' })
    // 17 October 2026: Excalidraw's server signs nobody in, so the consent says so; Otter.ai's is read-only.
    const excalidraw = connectConsent(
      app({
        id: 'excalidraw',
        title: 'Excalidraw',
        serverURL: 'https://mcp.excalidraw.com/mcp',
      }),
      'Excalidraw',
    )
    expect(excalidraw.route).toEqual({
      kind: 'vendor',
      host: 'mcp.excalidraw.com',
    })
    expect(
      excalidraw.smallPrint[0]!.startsWith("There's nothing to sign in to"),
    ).toBe(true)
    expect(excalidraw.note).toContain('excalidraw.com')
    const otter = connectConsent(
      app({
        id: 'otter',
        title: 'Otter.ai',
        serverURL: 'https://mcp.otter.ai/mcp',
      }),
      'Otter.ai',
    )
    expect(otter.points[0]!.body).toBe(
      'Your agents can read your meeting transcripts and summaries in Otter.ai.',
    )
    const freshbooks = connectConsent(
      app({ id: 'freshbooks', title: 'FreshBooks' }),
      'FreshBooks',
    )
    expect(freshbooks.note).toBe(
      'Anything that moves money in FreshBooks is real. Ask your agents to check with you before they move any.',
    )
    // The 52 on their makers' servers: a model maker said by what it makes, tl;dv read-only, Coinbase's money and approval.
    const elevenlabs = connectConsent(
      app({
        id: 'elevenlabs',
        title: 'ElevenLabs',
        serverURL: 'https://api.us.elevenlabs.io/v1/mcp',
      }),
      'ElevenLabs',
    )
    expect(elevenlabs.route).toEqual({
      kind: 'vendor',
      host: 'api.us.elevenlabs.io',
    })
    expect(elevenlabs.points[0]!.body).toBe(
      'Your agents can make speech, sound effects and music with ElevenLabs, and use your voices.',
    )
    expect(elevenlabs.note).toBe(
      'Making speech, sound effects and music uses your ElevenLabs credits.',
    )
    const tldv = connectConsent(
      app({ id: 'tldv', title: 'tl;dv', serverURL: 'https://mcp.tldv.io/mcp' }),
      'tl;dv',
    )
    expect(tldv.points[0]!.body).toBe(
      'Your agents can read your meeting recordings, transcripts and notes in tl;dv.',
    )
    const coinbase = connectConsent(
      app({
        id: 'coinbase',
        title: 'Coinbase',
        serverURL: 'https://agents.coinbase.com/mcp',
      }),
      'Coinbase',
    )
    expect(
      coinbase.note?.startsWith(
        'Anything that moves money or crypto in Coinbase is real.',
      ),
    ).toBe(true)
    const razorpay = connectConsent(
      app({ id: 'razorpay', title: 'Razorpay' }),
      'Razorpay',
    )
    expect(razorpay.note).toBe(
      'Anything that moves money in Razorpay is real. Ask your agents to check with you before they move any.',
    )
  })

  it('the extra layer and the unknown', () => {
    const shopify = connectConsent(
      app({
        id: 'shopify',
        title: 'Shopify',
        summary: 'Orders, products, customers, and your store.',
      }),
      'Shopify',
    )
    expect(shopify.note).toContain('live store')
    const mercury = connectConsent(
      app({ id: 'mercury', title: 'Mercury' }),
      'Mercury',
    )
    expect(mercury.points[0]!.body).toBe(
      'Your agents can read your accounts, balances and transactions in Mercury.',
    )
    const linkedin = connectConsent(
      app({ id: 'linkedin', title: 'LinkedIn' }),
      'LinkedIn',
    )
    expect(linkedin.points[0]!.body).toBe(
      'Your agents can read your profile and publish posts on LinkedIn.',
    )
    const unknown = connectConsent(undefined, 'Acme CRM')
    expect(unknown.route).toEqual({ kind: 'unknown' })
    expect(unknown.points[0]!.body).toBe(
      "Your agents can read and use what's in your Acme CRM account.",
    )
    expect(unknown.note).toBeUndefined()
    // An app not in the catalogue is found by its slug, as the Swift finds it.
    expect(unknown.id).toBe('acme-crm')
    for (const consent of [shopify, mercury, linkedin, unknown])
      expect(
        [...consent.points.map((point) => point.body), ...consent.smallPrint]
          .join('')
          .includes('Muse'),
      ).toBe(false)
  })
})

// MARK: Each app's part, as the Swift has it

const swift = readFileSync(
  new URL(
    '../../../../../ios/SimeonCore/Sources/SimeonCore/ConnectConsent.swift',
    import.meta.url,
  ),
  'utf8',
)

/** The literal of `static let <name>` in the Swift: its text between its brackets. */
function literal(name: string): string {
  const start = swift.indexOf(`static let ${name}`)
  const open = swift.indexOf('[', swift.indexOf('=', start))
  let depth = 0
  for (let at = open; at < swift.length; at += 1) {
    const char = swift[at]
    if (char === '"') {
      at += 1
      while (swift[at] !== '"') at += swift[at] === '\\' ? 2 : 1
      continue
    }
    if (char === '[') depth += 1
    if (char === ']' && --depth === 0) return swift.slice(open + 1, at)
  }
  throw new Error(`No ${name}`)
}

function table(name: string): Map<string, string> {
  return new Map(
    [
      ...literal(name).matchAll(
        /"([^"]+)": L10n\.text\("((?:[^"\\]|\\.)*)"\)/g,
      ),
    ].map((match) => [match[1]!, match[2]!.replace(/\\"/g, '"')]),
  )
}

function set(name: string): Set<string> {
  return new Set([...literal(name).matchAll(/"([^"]+)"/g)].map((m) => m[1]!))
}

describe('each app’s part', () => {
  const reaches = table('reaches')
  const reachSentence = table('reachSentence')
  const signInSentence = table('signInSentence')
  const notes = table('notes')
  const readOnly = set('readOnly')
  const money = set('money')
  const consentFor = (key: string) =>
    connectConsent(app({ id: key, title: 'Acme' }), 'Acme')

  it('reads the Swift’s tables whole', () => {
    expect(reaches.size).toBe(189)
    expect(reachSentence.size).toBe(34)
    expect(signInSentence.size).toBe(4)
    expect(notes.size).toBe(95)
    expect([...readOnly]).toEqual([
      'mercury',
      'figma',
      'otter',
      'plaid',
      'tldv',
      'draftable',
    ])
    expect(money.size).toBe(14)
  })

  it('holds no app the Swift doesn’t, and the same sentences, both ways', () => {
    const tables = consentTables()
    const same = (ts: Record<string, string>, swift: Map<string, string>) => {
      expect(Object.keys(ts).sort()).toEqual([...swift.keys()].sort())
      for (const [key, words] of swift) expect(ts[key], key).toBe(words)
    }
    same(tables.reaches, reaches)
    same(tables.reachSentences, reachSentence)
    same(tables.signInSentences, signInSentence)
    same(tables.notes, notes)
    expect([...tables.readOnly].sort()).toEqual([...readOnly].sort())
    expect([...tables.money].sort()).toEqual([...money].sort())
  })

  it('puts a title in its place as it is, whatever it holds', () => {
    // Swift's `replacingOccurrences` is literal: "$&" in a title is not a pattern.
    const odd = 'Pay$&Co'
    expect(
      connectConsent(app({ id: 'linkedin', title: odd }), odd).points[0]!.body,
    ).toBe('Your agents can read your profile and publish posts on Pay$&Co.')
    expect(
      connectConsent(app({ id: 'link', title: "A$'B" }), "A$'B").smallPrint[0],
    ).toContain("in the A$'B app")
  })

  it('says what the agents reach in every app as the Swift does', () => {
    for (const [key, things] of reaches) {
      const sentence = reachSentence.get(key)
      const expected =
        sentence != null
          ? sentence.replaceAll('{App}', 'Acme')
          : readOnly.has(key)
            ? `Your agents can read ${things} in Acme.`
            : `Your agents can read and use ${things} in Acme.`
      expect(consentFor(key).points[0]!.body, key).toBe(expected)
    }
    for (const [key, sentence] of reachSentence)
      expect(consentFor(key).points[0]!.body, key).toBe(
        sentence.replaceAll('{App}', 'Acme'),
      )
  })

  it('says who signs in, and the one more thing, as the Swift does', () => {
    for (const [key, sentence] of signInSentence)
      expect(consentFor(key).smallPrint[0], key).toBe(
        sentence.replaceAll('{App}', 'Acme'),
      )
    for (const [key, note] of notes)
      expect(consentFor(key).note, key).toBe(note)
    for (const key of money)
      expect(consentFor(key).note, key).toBe(
        notes.get(key) ??
          'Anything that moves money in Acme is real. Ask your agents to check with you before they move any.',
      )
    // No route and no table: the plain lines.
    const plain = consentFor('nothing-known')
    expect(plain.smallPrint[0]).toBe(
      "You'll sign in on Acme's own page. Simeon never sees your password.",
    )
    expect(plain.note).toBeUndefined()
  })
})

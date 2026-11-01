// SimeonCore's Mentions tests (CoreTests.swift), translated.

import { describe, expect, it } from 'vitest'
import { brandLogos, brandMentions } from './generatedBrands'
import { type AgentName, findMentions } from './mentions'

const said = (text: string, found: { location: number; length: number }[]) =>
  found.map((m) => text.slice(m.location, m.location + m.length))

/** The apps named, as "Name=key". */
function apps(text: string): string[] {
  return findMentions(text, { agents: [] }).flatMap((m) =>
    m.kind.kind === 'brand'
      ? [`${text.slice(m.location, m.location + m.length)}=${m.kind.brand.key}`]
      : [],
  )
}

/** The apps named, their words only. */
const appWords = (text: string) => apps(text).map((a) => a.split('=')[0])

describe('names in a message', () => {
  it('reads apps and agents', () => {
    const agents: AgentName[] = [
      { name: 'Theo', id: 'theo' },
      { name: 'Bass', id: 'bass' },
    ]
    const text =
      'Theo sent it to Google Calendar and Stripe, not @Stripe or Theodore. Bass'
    const found = findMentions(text, { agents, personName: 'Bass' })
    expect(said(text, found)).toEqual(['Theo', 'Google Calendar', 'Stripe'])
    expect(found[1]!.kind).toMatchObject({
      kind: 'brand',
      brand: { key: 'google-calendar' },
    })
    expect(found[0]!.kind).toEqual({ kind: 'agent', id: 'theo' })
  })

  it("reads the connectors added after the Mac window's list", () => {
    expect(
      apps('Your Link wallet checks out; re-add it in the Link app.'),
    ).toEqual(['Link=link', 'Link=link'])
    expect(
      apps('Link your Google Calendar first. Then Square and Ramp.'),
    ).toEqual(['Google Calendar=google-calendar', 'Square=square', 'Ramp=ramp'])
    expect(
      apps('1. Link the card\n- **Square** is next\n"Kit" sends it'),
    ).toEqual([])
    expect(
      apps(
        'Post on LinkedIn, Facebook Pages and TikTok Ads, then OneDrive and monday.com.',
      ),
    ).toEqual([
      'LinkedIn=linkedin',
      'Facebook Pages=facebook',
      'TikTok Ads=tiktok',
      'OneDrive=onedrive',
      'monday.com=monday',
    ])
    expect(apps('Granola, Resend and Microsoft To Do.')).toEqual([
      'Granola=granola',
      'Resend=resend',
      'Microsoft To Do=microsoft-to-do',
    ])
    // An app whose name is not an everyday word is marked anywhere, first word included.
    expect(apps('Stripe charged it.')).toEqual(['Stripe=stripe'])
    expect(
      apps(
        'Put it in Box, then Confluence and Lucidchart; GitLab, Otter.ai and BigQuery too.',
      ),
    ).toEqual([
      'Box=box',
      'Confluence=confluence',
      'Lucidchart=lucid',
      'GitLab=gitlab',
      'Otter.ai=otter',
      'BigQuery=google-bigquery',
    ])
    expect(apps('Run Pinterest Ads and Reddit Ads, not Pinterest.')).toEqual([
      'Pinterest Ads=pinterest-ads',
      'Reddit Ads=reddit-ads',
      'Pinterest=pinterest',
    ])
    expect(apps('Clay first. Neon after.')).toEqual([])
    expect(apps('Excalidraw drew it; HeyGen voiced it.')).toEqual([
      'Excalidraw=excalidraw',
      'HeyGen=heygen',
    ])
    expect(apps('Black Forest Labs makes FLUX; fal.ai and tl;dv too.')).toEqual(
      [
        'Black Forest Labs=black-forest-labs',
        'FLUX=black-forest-labs',
        'fal.ai=fal',
        'tl;dv=tldv',
      ],
    )
    expect(
      apps(
        'Make sure Close is open. Hunter found it in Customer.io and lemlist.',
      ),
    ).toEqual(['Customer.io=customer-io', 'lemlist=lemlist'])
    expect(
      apps('Log the call in Close, then open your Hunter account.'),
    ).toEqual(['Close=close', 'Hunter=hunter'])
  })

  it("reads an everyday word as an app only in an app's place", () => {
    // As a verb, after "the", in a title: plain.
    expect(appWords('Yes, we can Shop here.')).toEqual([])
    expect(appWords('Sure, the Link is here: https://example.com')).toEqual([])
    expect(
      appWords("Here's the Payment Link for the Coffee Shop app."),
    ).toEqual([])
    expect(appWords("I'll Close the deal and let's Square it up.")).toEqual([])
    expect(appWords('Click to Link your card.')).toEqual([])
    // A cue before it, an app's word after it, or another app beside it: the app.
    expect(
      appWords('You can pay with Link or check out via **Shop**.'),
    ).toEqual(['Link', 'Shop'])
    expect(
      appWords(
        "Your Shop account and the Link wallet are ready; Link's checkout too.",
      ),
    ).toEqual(['Shop', 'Link', 'Link'])
    expect(appWords('I signed in to Link, then connected Square.')).toEqual([
      'Link',
      'Square',
    ])
    expect(appWords('Connected: Gmail, Link and Shop.')).toEqual([
      'Gmail',
      'Link',
      'Shop',
    ])
    expect(appWords('Link and Shop are in your Wallet.')).toEqual([
      'Link',
      'Shop',
    ])
    expect(appWords('Pay with Stripe Link.')).toEqual(['Stripe', 'Link'])
    // A name that is not an everyday word stays marked wherever it is.
    expect(
      appWords('Yes, the Stripe charge and the Gmail draft are here.'),
    ).toEqual(['Stripe', 'Gmail'])
  })

  it("leaves an agent's name plain where it is a thing's", () => {
    const agents: AgentName[] = [
      { name: 'Simeon', id: 'simeon' },
      { name: 'Theo', id: 'theo' },
    ]
    const named = (text: string, speaker?: string, introducing = false) =>
      findMentions(text, { agents, speaker, introducing }).flatMap((m) =>
        m.kind.kind === 'agent' ? [m.kind.id] : [],
      )
    expect(
      named(
        'Got it: your app is called Simeon, and the Simeon app is on the App Store.',
      ),
    ).toEqual([])
    expect(
      named(
        "So your app name is Simeon. I'll read Simeon's website and the Simeon customer feedback.",
      ),
    ).toEqual([])
    expect(
      named(
        "I'll look at the onboarding in Simeon and at your startup, Simeon, after Simeon Labs.",
      ),
    ).toEqual([])
    expect(
      named("Ask Simeon, or let Theo plan it; Simeon will check Theo's draft."),
    ).toEqual(['simeon', 'theo', 'simeon', 'theo'])
    expect(named("I left a note in Theo's chat for Simeon.")).toEqual([
      'theo',
      'simeon',
    ])
    // Simeon writing about Simeon: its own name is never its pill.
    expect(
      named("I'm Simeon. Simeon helps founders, and Theo helps me.", 'simeon'),
    ).toEqual(['theo'])
    // Save in his introduction, even as a name being given.
    const hello = "Hi Bass, my name is Simeon, and I'm your Chief of Staff."
    expect(named(hello, 'simeon')).toEqual([])
    expect(named(hello, 'simeon', true)).toEqual(['simeon'])
    expect(
      named(
        'Salut Bass, je m’appelle Simeon, et je suis ton bras droit.',
        'simeon',
        true,
      ),
    ).toEqual(['simeon'])
    expect(
      named(
        'My name is Simeon; Theo is on it, in the Theo app.',
        'simeon',
        true,
      ),
    ).toEqual(['simeon', 'theo'])
    // A name being given that is not his.
    expect(named('My name is Theo.', 'simeon', true)).toEqual([])
  })

  it('reads a run of a line in its whole line', () => {
    const line = 'Pay with Link or ask Theo.'
    const agents: AgentName[] = [{ name: 'Theo', id: 'theo' }]
    const run = { location: line.indexOf('Link'), length: 4 }
    expect(
      findMentions(line, { within: run, agents }).map((m) => m.location),
    ).toEqual([run.location])
    expect(findMentions('Link', { agents }).length).toBe(0)
    const rest = {
      location: run.location + 4,
      length: line.length - run.location - 4,
    }
    expect(
      findMentions(line, { within: rest, agents }).map((m) => m.kind),
    ).toEqual([{ kind: 'agent', id: 'theo' }])
  })

  it("reads Ava's chat quickly", () => {
    const lines = [
      'Hi Bass, I’m Ava. I’ll find where customer feedback actually lives, then pull out the strongest themes with source links and flag what’s only a one-off comment.',
      'I don’t have Simeon customer feedback yet. The connected Gmail account is for Prime Seattle, and I found no Simeon-related messages or feedback labels there, so I won’t treat that mail as product evidence.',
      'My avatar is now a violet customer-voice icon, distinct from the others. I’m still waiting on the location of Simeon’s feedback before I can give Leo or you evidence-backed themes.',
    ]
    const agents: AgentName[] = [
      { name: 'Simeon', id: 'simeon' },
      { name: 'Ava', id: 'ava' },
      { name: 'Leo', id: 'leo' },
    ]
    const start = performance.now()
    const found = lines.map((line) =>
      said(line, findMentions(line, { agents, personName: 'Bass Fall' })),
    )
    // "Simeon customer feedback" is the product's; "Simeon's feedback" could be the agent's.
    expect(found).toEqual([['Ava'], ['Gmail'], ['Simeon', 'Leo']])
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('has a logo for every app named', () => {
    for (const brand of brandMentions)
      expect(brandLogos[brand.key]).toBeTruthy()
  })
})

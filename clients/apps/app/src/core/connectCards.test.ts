// Step 3c's cards as the core reads them, against the shared core's own tests
// (ios/SimeonCore/Tests/SimeonCoreTests): JoinedCardTests, ConnectorIconsTests,
// CloudAgentTests (ChatExtrasTests.swift), CoreTests' connectors rows, the
// gallery's cards and `AppsComingSoon`, PluginCallsTests' Coming soon, and the
// demo's connected apps.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardText, chatRows, rowSide } from './chat'
import {
  appIconURL,
  appLogo,
  appsComingSoonBuiltIn,
  catalogApp,
  catalogAppFrom,
  catalogFrom,
  cloudAgentCard,
  cloudAgentChangedLabel,
  cloudAgentInfo,
  cloudAgentIsLive,
  cloudAgentNextPoll,
  cloudAgentPullState,
  cloudAgentStatusLabel,
  cloudAgentWebURL,
  comingSoonFrom,
  comingSoonNames,
  comingSoonWord,
  connectedToolCount,
  connectedWord,
  connectorIconId,
  connectorsCard,
  gitHubConnectedLabel,
  gitHubSignInCard,
  gitHubSignInLine,
  gitHubSignInNextPoll,
  gitHubSignInState,
  gitHubSignInTitle,
  gitHubSignInWords,
  goToChatWord,
  hexOf,
  iconConnectors,
  isComingSoon,
  isConnected,
  joinedAgent,
  joinedCard,
  joinedColours,
  joinedColoursForFace,
  joinedInk,
  joinedSecondaryInk,
  joinedTitleIn,
  listenerCard,
  listenerConnectedIn,
  luminance,
  middleCut,
  cursorSignInState,
  modelConnectCard,
  modelConnectLine,
  modelConnectLogo,
  modelConnectNextPoll,
  modelConnectOnComputer,
  modelConnectPreview,
  modelConnectProgram,
  modelConnectTitle,
  rgb,
  slug,
  standingFace,
  standingURL,
  unavailableCloudAgent,
  viewProfileWord,
  webPage,
} from './connectCards'
import { codingConsent, consentProgramLogo } from './connectConsent'
import { makeApp } from './connectedApps'
import { Entry } from './entry'
import { type AgentFace, faceById, faces } from './faces'
import type { JSONObject } from './json'
import { makeAgent } from './models'

function entry(json: JSONObject): Entry {
  const made = Entry.from(json)
  if (!made) throw new Error('no entry')
  return made
}

const card = (id: string, message: JSONObject) =>
  entry({ kind: 'send-message', id, message })

describe('apps to connect', () => {
  it('reads the apps a card names, and leaves a card that names none out (CoreTests)', () => {
    const rows = chatRows([
      card('q', {
        type: 'widget',
        widget: { prompt: 'What first?', options: [{ label: 'Inbox' }] },
      }),
      card('c', { type: 'connectors', connectors: ['Gmail', 'Notion'] }),
      entry({ kind: 'tool-call', id: 't' }),
    ])
    expect(rows.map((row) => row.kind)).toEqual(['card', 'card'])
    const row = rows[1]!
    if (row.kind !== 'card') throw new Error('not a card')
    expect(row.card).toBe('connectors')
    expect(connectorsCard(row.entry)).toEqual({
      names: ['Gmail', 'Notion'],
      connected: false,
    })
    expect(rowSide(row)).toBe('agent:')
    expect(
      chatRows([card('c', { type: 'connectors', connectors: [] })]),
    ).toEqual([])
    expect(
      connectorsCard(card('c', { type: 'connectors', connectors: ['', 3] })),
    ).toBeUndefined()
  })

  it('reads one app with the agent’s reason, or already connected (the gallery’s card)', () => {
    expect(
      connectorsCard(
        card('x8', {
          type: 'connector',
          variant: 'connect',
          connector: 'Linear',
          reason: 'To read the launch tickets.',
        }),
      ),
    ).toEqual({
      names: ['Linear'],
      connected: false,
      reason: 'To read the launch tickets.',
    })
    expect(
      connectorsCard(
        card('c', { type: 'connector', variant: 'connected', connector: 'X' }),
      ),
    ).toEqual({ names: ['X'], connected: true, reason: undefined })
    expect(connectorsCard(card('c', { type: 'connector' }))).toBeUndefined()
    expect(chatRows([card('c', { type: 'connector', connector: '' })])).toEqual(
      [],
    )
  })

  it('reads the catalogue as the core does', () => {
    expect(
      catalogAppFrom({
        id: 'gmail',
        name: 'gmail',
        displayName: 'Gmail',
        description: 'Search, read, draft, and send email.',
        category: 'Email',
        comingSoon: false,
        composioToolkit: 'gmail',
      }),
    ).toEqual({
      id: 'gmail',
      name: 'gmail',
      title: 'Gmail',
      summary: 'Search, read, draft, and send email.',
      category: 'Email',
      comingSoon: false,
      serverURL: undefined,
      composioToolkit: 'gmail',
    })
    // The plugin's id, its name for a title, its id for both.
    expect(catalogAppFrom({ pluginId: 'acme', name: 'Acme' })).toMatchObject({
      id: 'acme',
      name: 'Acme',
      title: 'Acme',
    })
    expect(catalogAppFrom({ id: 'acme' })).toMatchObject({
      name: 'acme',
      title: 'acme',
      summary: '',
    })
    expect(catalogAppFrom({ name: 'No id' })).toBeUndefined()
    expect(
      catalogFrom({ plugins: [{ id: 'a' }, { name: 'x' }] }).map((a) => a.id),
    ).toEqual(['a'])
    expect(catalogFrom([{ id: 'b' }]).map((a) => a.id)).toEqual(['b'])
    expect(catalogFrom(null)).toEqual([])
  })

  it('finds an app by its title, name or id, and knows it connected by its name or the catalogue’s id (CoreTests, the demo’s apps)', () => {
    const catalog = catalogFrom([
      { id: 'gmail', name: 'Gmail', displayName: 'Gmail' },
      { id: 'linear', name: 'Linear', displayName: 'Linear' },
      { id: 'google-drive', name: 'google_drive', displayName: 'Google Drive' },
    ])
    expect(catalogApp(catalog, 'GMAIL')?.id).toBe('gmail')
    expect(catalogApp(catalog, 'google_drive')?.id).toBe('google-drive')
    expect(catalogApp(catalog, 'google-drive')?.title).toBe('Google Drive')
    expect(catalogApp(catalog, 'Drive')).toBeUndefined()
    const apps = [
      makeApp({
        serverId: 'demo-gmail',
        name: 'Gmail',
        pluginId: 'gmail',
        status: 'connected',
        toolCount: 12,
      }),
      makeApp({
        serverId: '900001',
        name: 'Drive (work)',
        pluginId: 'google-drive',
        status: 'connected',
        toolCount: 4,
      }),
      makeApp({ serverId: '900002', name: 'Linear', status: 'needs-auth' }),
    ]
    expect(isConnected(apps, catalog, 'Gmail')).toBe(true)
    expect(isConnected(apps, catalog, 'Linear')).toBe(false)
    expect(isConnected(apps, catalog, 'Google Drive')).toBe(true)
    expect(isConnected(apps, [], 'Google Drive')).toBe(false)
    // Its tools are found by its name alone, as the Mac's card finds them.
    expect(connectedToolCount(apps, 'gmail')).toBe(12)
    expect(connectedToolCount(apps, 'Google Drive')).toBe(0)
    expect(connectedToolCount(apps, 'Linear')).toBe(0)
  })

  it('says Connected and Coming soon in the core’s words', () => {
    expect(connectedWord()).toBe('Connected')
    expect(comingSoonWord()).toBe('Coming soon')
  })
})

describe('apps that can’t be connected yet (AppsComingSoon)', () => {
  it('matches the server’s names and the catalogue’s by their letters and digits (CoreTests)', () => {
    expect(appsComingSoonBuiltIn).toContain('shopify')
    expect(comingSoonNames(appsComingSoonBuiltIn, 'microsoft-to-do')).toBe(true)
    expect(comingSoonNames(appsComingSoonBuiltIn, 'Microsoft To Do')).toBe(true)
    expect(comingSoonNames(['Microsoft_ToDo'], 'microsoft-to-do')).toBe(true)
    expect(comingSoonNames(appsComingSoonBuiltIn, 'Microsoft Teams')).toBe(
      false,
    )
    expect(comingSoonNames(appsComingSoonBuiltIn, '')).toBe(false)
  })

  it('reads the server’s list, and none from an older server (PluginCallsTests)', () => {
    expect(comingSoonFrom({ available: true })).toBeUndefined()
    expect(comingSoonFrom({ comingSoon: [] })).toEqual(new Set())
    expect(
      comingSoonFrom({ available: true, comingSoon: ['gusto', 'Brex', 4] }),
    ).toEqual(new Set(['gusto', 'brex']))
  })

  it('is said for the list’s apps and the catalogue’s own (PluginCallsTests)', () => {
    // Before Simeon Labs' server answers: the apps that need its own sign-in with the company.
    expect(isComingSoon(appsComingSoonBuiltIn, [], 'Xero')).toBe(true)
    expect(isComingSoon(appsComingSoonBuiltIn, [], 'docusign')).toBe(true)
    expect(isComingSoon(appsComingSoonBuiltIn, [], 'Gmail')).toBe(false)
    const catalog = catalogFrom({
      plugins: [
        { id: 'xero', displayName: 'Xero' },
        { id: 'acme', displayName: 'Acme', comingSoon: true },
        { id: 'gmail', displayName: 'Gmail' },
        {
          id: 'clio',
          displayName: 'Clio Manage',
          composioToolkit: 'clio_manage',
        },
      ],
    })
    const served = ['gusto', 'brex', 'clio_manage']
    expect(isComingSoon(served, catalog, 'Xero')).toBe(false)
    expect(isComingSoon(served, catalog, 'Gusto')).toBe(true)
    expect(isComingSoon(served, catalog, 'Acme')).toBe(true)
    expect(isComingSoon(served, catalog, 'Gmail')).toBe(false)
    // Its toolkit too: Clio is `clio_manage` on the server's list.
    expect(isComingSoon(served, catalog, 'Clio Manage')).toBe(true)
  })
})

describe('the apps’ icons (ConnectorIconsTests)', () => {
  it('has every connector’s app icon', () => {
    expect(iconConnectors).toHaveLength(232)
    for (const [id] of iconConnectors) expect(appIconURL(id), id).toBeTruthy()
  })

  it('finds every connector by its id and its title', () => {
    for (const [id, name] of iconConnectors) {
      expect(connectorIconId(id)).toBe(id)
      expect(connectorIconId(name), name).toBe(id)
      expect(connectorIconId(name.toUpperCase()), name).toBe(id)
    }
  })

  it('finds the five whose title’s slug is not their id', () => {
    expect(connectorIconId('monday.com')).toBe('monday')
    expect(connectorIconId('Facebook Pages')).toBe('facebook')
    // Bigin by Zoho left the store on 17 October 2026, with every Zoho app.
    expect(connectorIconId('Bigin by Zoho')).toBeUndefined()
    expect(connectorIconId('Capsule')).toBe('capsule-crm')
    expect(connectorIconId('Excel')).toBe('microsoft-excel')
  })

  it('knows the other names the apps go by', () => {
    expect(connectorIconId('Facebook')).toBe('facebook')
    expect(connectorIconId('Microsoft Excel')).toBe('microsoft-excel')
    expect(connectorIconId('Microsoft Outlook')).toBe('outlook')
    expect(connectorIconId('Capsule CRM')).toBe('capsule-crm')
    expect(connectorIconId(' Cal.com ')).toBe('cal-com')
    expect(connectorIconId('google_drive')).toBe('google-drive')
    expect(connectorIconId('Photoshop')).toBeUndefined()
    expect(connectorIconId('')).toBeUndefined()
  })

  it('draws the icon, else the brand’s logo, else the first letter (AppLogoTile)', () => {
    expect(appLogo('Gmail')).toEqual({
      kind: 'icon',
      url: appIconURL('gmail'),
    })
    expect(appLogo('Mystery', 'notion')).toEqual({
      kind: 'icon',
      url: appIconURL('notion'),
    })
    // Not a connector: the brand's logo, one colour (a template on the Mac).
    expect(appLogo('Airbnb')).toMatchObject({ kind: 'logo', mono: true })
    expect(appLogo('photoshop')).toEqual({ kind: 'letter', letter: 'P' })
    expect(appLogo('')).toEqual({ kind: 'letter', letter: '' })
  })

  it('writes an app’s slug as the catalogue does', () => {
    expect(slug('monday.com')).toBe('monday-com')
    expect(slug(' Cal.com ')).toBe('cal-com')
    expect(slug('Google  Drive!')).toBe('google-drive')
    expect(slug('tl;dv')).toBe('tl-dv')
  })
})

describe('Slack or GitHub for a routine', () => {
  it('reads the platform and the reason (the gallery’s card)', () => {
    const rows = chatRows([
      card('x8b', {
        type: 'listener-connect',
        platform: 'slack',
        reason: 'so this routine can fire',
      }),
      card('g', { type: 'listener-connect', platform: 'github' }),
      card('n', { type: 'listener-connect', platform: 'discord' }),
    ])
    expect(rows).toHaveLength(2)
    const read = rows.map((row) =>
      row.kind === 'card' ? listenerCard(row.entry) : undefined,
    )
    expect(read).toEqual([
      { platform: 'slack', reason: 'so this routine can fire' },
      { platform: 'github', reason: undefined },
    ])
    expect(
      rows.every(
        (row) => row.kind === 'card' && row.card === 'listenerConnect',
      ),
    ).toBe(true)
  })

  it('knows whether it is linked from the computer’s list (the demo’s answer)', () => {
    const answer = {
      integrations: [
        { platform: 'slack', isConnected: false },
        { platform: 'github', isConnected: true },
      ],
    }
    expect(listenerConnectedIn(answer, 'slack')).toBe(false)
    expect(listenerConnectedIn(answer, 'github')).toBe(true)
    expect(listenerConnectedIn({ integrations: [] }, 'slack')).toBe(false)
    expect(listenerConnectedIn({}, 'github')).toBe(false)
  })
})

describe('GitHub on the computer (GitHubSignInCardTests)', () => {
  const line = (message: JSONObject) => card('g1', message)

  it('reads the card: a one-time code, GitHub’s own page, when it stops working', () => {
    const read = line({
      type: 'github-sign-in',
      code: ' ABCD-1234 ',
      url: 'https://github.com/login/device',
      expiresAtMs: 2_000,
    })
    const row = chatRows([read]).at(-1)
    expect(row?.kind === 'card' && row.card).toBe('gitHubSignIn')
    expect(cardText(read.message)).toBe('Connect GitHub')
    expect(gitHubSignInCard(read)).toEqual({
      code: 'ABCD-1234',
      url: 'https://github.com/login/device',
      expiresAtMs: 2_000,
    })
    // Another site's address is never opened: GitHub's page instead.
    expect(
      gitHubSignInCard(
        line({
          type: 'github-sign-in',
          code: 'ABCD-1234',
          url: 'https://evil.example/login/device',
        }),
      ),
    ).toEqual({
      code: 'ABCD-1234',
      url: 'https://github.com/login/device',
      expiresAtMs: 0,
    })
    expect(
      gitHubSignInCard(line({ type: 'github-sign-in', code: 'abcd-1234' })),
    ).toBeUndefined()
    expect(gitHubSignInCard(line({ type: 'github-sign-in' }))).toBeUndefined()
    expect(gitHubSignInCard(line({ type: 'cloud-agent', bcId: 'b' }))).toBe(
      undefined,
    )
  })

  it('reads the computer’s answer for this code: waiting, connected, expired, failed', () => {
    const read = gitHubSignInCard(
      line({ type: 'github-sign-in', code: 'ABCD-1234', expiresAtMs: 2_000 }),
    )!
    expect(
      gitHubSignInState(read, { state: 'waiting', code: 'ABCD-1234' }, 1_000),
    ).toEqual({ kind: 'waiting' })
    // A newer code, or this one's quarter of an hour gone: expired.
    expect(
      gitHubSignInState(read, { state: 'waiting', code: 'WXYZ-9876' }, 1_000),
    ).toEqual({ kind: 'expired' })
    expect(
      gitHubSignInState(read, { state: 'waiting', code: 'ABCD-1234' }, 2_000),
    ).toEqual({ kind: 'expired' })
    expect(
      gitHubSignInState(read, { state: 'connected', login: 'octocat' }, 1_000),
    ).toEqual({ kind: 'connected', login: 'octocat' })
    expect(gitHubSignInState(read, { state: 'none' }, 1_000)).toEqual({
      kind: 'expired',
    })
    expect(
      gitHubSignInState(read, { state: 'failed', why: 'x' }, 1_000),
    ).toEqual({ kind: 'failed' })
    expect(gitHubSignInState(read, undefined, 1_000)).toBeUndefined()

    expect(gitHubSignInNextPoll(undefined)).toBe(3)
    expect(gitHubSignInNextPoll({ kind: 'waiting' })).toBe(3)
    expect(gitHubSignInNextPoll({ kind: 'connected' })).toBeUndefined()
    expect(gitHubSignInNextPoll({ kind: 'expired' })).toBeUndefined()
  })

  it('says what to do, and how it ended', () => {
    expect(gitHubSignInLine(undefined)).toBe(
      'Enter this code on GitHub to connect it to your computer.',
    )
    expect(gitHubSignInLine({ kind: 'expired' })).toBe(
      'This code expired. Ask your agent for a new one.',
    )
    expect(gitHubSignInLine({ kind: 'failed' })).toBe(
      "GitHub couldn't be connected.",
    )
    // Once connected the card reads as a connected app's: "GitHub", the account under it (13 November 2026).
    expect(gitHubSignInLine({ kind: 'connected', login: 'octocat' })).toBe(
      'octocat',
    )
    expect(gitHubSignInLine({ kind: 'connected' })).toBe('')
    expect(gitHubSignInTitle(undefined)).toBe('Connect GitHub')
    expect(gitHubSignInTitle({ kind: 'waiting' })).toBe('Connect GitHub')
    expect(gitHubSignInTitle({ kind: 'expired' })).toBe('Connect GitHub')
    expect(gitHubSignInTitle({ kind: 'connected', login: 'octocat' })).toBe(
      'GitHub',
    )
    expect(gitHubConnectedLabel('octocat')).toBe('Connected as octocat')
    expect(gitHubConnectedLabel(undefined)).toBe('Connected')
    expect(gitHubSignInWords()).toEqual({
      title: 'Connect GitHub',
      open: 'Open GitHub',
      copy: 'Copy code',
      copied: 'Copied',
    })
  })
})

describe('cloud agents (CloudAgentTests)', () => {
  it('reads the card and its state', () => {
    const line = entry({
      kind: 'send-message',
      id: 'c1',
      message: { type: 'cloud-agent', bcId: 'bc-42' },
    })
    const row = chatRows([line]).at(-1)
    expect(row?.kind === 'card' && row.card).toBe('cloudAgent')
    expect(cloudAgentCard(line)).toEqual({ bcId: 'bc-42' })
    const info = cloudAgentInfo({
      bcId: 'bc-42',
      status: 'running',
      name: 'Fix the login',
      branchName: 'fix/login',
      prUrl: 'https://github.com/a/b/pull/7',
      prState: 'open',
      prNumber: 7,
      filesChanged: 3,
      linesAdded: 40,
      linesRemoved: 2,
    })!
    expect(cloudAgentStatusLabel(info)).toBe('Running')
    expect(cloudAgentIsLive(info)).toBe(true)
    expect(cloudAgentChangedLabel(info)).toBe('3 files changed')
    expect(info.pullRequestNumber).toBe(7)
    const finished = cloudAgentInfo({ status: 'finished', filesChanged: 1 })!
    expect(cloudAgentStatusLabel(finished)).toBe('Done')
    expect(cloudAgentChangedLabel(finished)).toBe('1 file changed')
    expect(cloudAgentStatusLabel(cloudAgentInfo({ status: 'odd' })!)).toBe(
      'Status unavailable',
    )
    expect(cloudAgentInfo(null)).toBeUndefined()
    expect(cloudAgentWebURL('bc 42')).toBe(
      'https://app.simeonlabs.com/agents/bc%2042',
    )
    expect(cloudAgentPullState(info)).toBe('open')
    expect(
      cloudAgentPullState(
        cloudAgentInfo({ prUrl: 'https://github.com/a/b/pull/7' })!,
      ),
    ).toBe('unknown')
    expect(cloudAgentPullState(cloudAgentInfo({ status: 'running' })!)).toBe(
      'none',
    )
    expect(cloudAgentStatusLabel(unavailableCloudAgent)).toBe(
      'Status unavailable',
    )
    // The person's Claude plan reached its limit: Paused, not asked again.
    const paused = cloudAgentInfo({ status: 'paused' })!
    expect(cloudAgentStatusLabel(paused)).toBe('Paused')
    expect(cloudAgentIsLive(paused)).toBe(false)
    expect(cloudAgentNextPoll({ kind: 'info', info: paused }, undefined)).toBe(
      undefined,
    )
  })

  it('asks again as the window’s poll: 5 s while it works, 60 s after a failure with nothing read, never once done or empty', () => {
    const running = cloudAgentInfo({ status: 'running' })!
    const done = cloudAgentInfo({ status: 'finished' })!
    expect(cloudAgentNextPoll({ kind: 'info', info: running }, undefined)).toBe(
      5,
    )
    expect(cloudAgentNextPoll({ kind: 'info', info: done }, running)).toBe(
      undefined,
    )
    expect(cloudAgentNextPoll({ kind: 'empty' }, undefined)).toBe(undefined)
    expect(cloudAgentNextPoll({ kind: 'failed' }, undefined)).toBe(60)
    expect(cloudAgentNextPoll({ kind: 'failed' }, running)).toBe(5)
  })

  it('reads its words trimmed, a pull request’s number only above nought, every status', () => {
    const info = cloudAgentInfo({
      name: '  Tidy  ',
      prompt: ' Tidy the repo ',
      prNumber: 0,
      filesChanged: 'x',
    })!
    expect(info).toMatchObject({
      name: 'Tidy',
      prompt: 'Tidy the repo',
      pullRequestNumber: undefined,
      filesChanged: 0,
    })
    expect(cloudAgentChangedLabel(info)).toBeUndefined()
    const labels = ['creating', 'running', 'finished', 'error', 'expired'].map(
      (status) => cloudAgentStatusLabel(cloudAgentInfo({ status })!),
    )
    expect(labels).toEqual(['Creating', 'Running', 'Done', 'Failed', 'Expired'])
    expect(
      ['creating', 'running', 'finished', 'error', 'expired', 'odd'].map(
        (status) => cloudAgentIsLive(cloudAgentInfo({ status })!),
      ),
    ).toEqual([true, true, false, false, false, true])
    // A path's part as Foundation writes it: its sub-delimiters, ":" and "@" kept, "/" and "?" escaped.
    expect(cloudAgentWebURL('a/b?c$d&e+f,g;h=i:j@k')).toBe(
      'https://app.simeonlabs.com/agents/a%2Fb%3Fc$d&e+f,g;h=i:j@k',
    )
    expect(cloudAgentWebURL('é')).toBe(
      'https://app.simeonlabs.com/agents/%C3%A9',
    )
  })

  it('opens only web pages', () => {
    expect(webPage('https://github.com/a/b/pull/7')).toBe(
      'https://github.com/a/b/pull/7',
    )
    expect(webPage('http://example.com')).toBe('http://example.com/')
    expect(webPage('javascript:alert(1)')).toBeUndefined()
    expect(webPage('github.com/a/b/pull/7')).toBeUndefined()
    expect(webPage('')).toBeUndefined()
    expect(webPage(undefined)).toBeUndefined()
  })

  it('cuts a branch’s name in its middle to fit', () => {
    const width = (words: string) => [...words].length * 10
    expect(middleCut('fix/login', 90, width)).toBe('fix/login')
    expect(middleCut('feature/very-long-name', 100, width)).toBe('featu…name')
    expect(middleCut('feature/very-long-name', 110, width)).toBe('featu…-name')
    expect(middleCut('feature/very-long-name', 0, width)).toBe('…')
  })
})

describe('a new teammate joined (JoinedCardTests)', () => {
  const joined = (message: JSONObject, id = 't1s1') =>
    entry({ id, kind: 'send-message', timestampMs: 1_000, message })

  it('reads the card from its message', () => {
    const rows = chatRows([
      joined({
        type: 'agent-joined',
        agentId: 'a2',
        name: 'Iris',
        line: ' Sorts your inbox. ',
        content: 'Iris just joined your team. Sorts your inbox.',
      }),
    ])
    const row = rows.at(-1)!
    if (row.kind !== 'card') throw new Error(row.kind)
    expect(row.id).toBe('t1s1')
    expect(row.card).toBe('joined')
    expect(joinedCard(row.entry)).toEqual({
      agentId: 'a2',
      name: 'Iris',
      line: 'Sorts your inbox.',
    })
    expect(rowSide(row)).toBe('agent:')
    // No line: the card still shows, with its title alone.
    const bare = chatRows([
      joined({ type: 'agent-joined', agentId: 'a2', name: 'Iris' }),
    ]).at(-1)!
    if (bare.kind !== 'card') throw new Error(bare.kind)
    expect(joinedCard(bare.entry)?.line).toBe('')
  })

  it('says its words when its agent is missing', () => {
    const rows = chatRows([
      joined({
        type: 'agent-joined',
        name: 'Iris',
        content: 'Iris just joined your team.',
      }),
    ])
    expect(rows.at(-1)).toEqual({
      kind: 'notice',
      id: 't1s1',
      text: 'Iris just joined your team.',
    })
    expect(
      chatRows([
        joined({ type: 'agent-joined', agentId: 'a2', name: '  ' }),
      ]).at(-1),
    ).toEqual({
      kind: 'notice',
      id: 't1s1',
      text: "This message can't be shown in this version of Simeon.",
    })
  })

  it('takes its title from the roster and its buttons’ words', () => {
    const iris = { agentId: 'a2', name: 'Iris', line: 'Sorts your inbox.' }
    expect(joinedTitleIn(iris, [])).toBe('Iris just joined your team')
    expect(joinedTitleIn(iris, [makeAgent({ id: 'a2', name: 'Ivy' })])).toBe(
      'Ivy just joined your team',
    )
    expect(
      joinedAgent(iris, [makeAgent({ id: 'a3', name: 'Max' })]),
    ).toBeUndefined()
    expect(goToChatWord()).toBe('Go to Chat')
    expect(viewProfileWord()).toBe('View Profile')
    // Quoted or named as a thread's first message: its title.
    expect(
      cardText({ type: 'agent-joined', agentId: 'a2', name: 'Iris' }),
    ).toBe('Iris just joined your team')
  })

  it('has every face standing on its own', () => {
    expect(faces).toHaveLength(31)
    const folder = new URL(
      '../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/Standing/',
      import.meta.url,
    )
    for (const face of faces) {
      expect(standingURL(face), face.id).toBeTruthy()
      const data = readFileSync(new URL(`${face.id}.webp`, folder))
      // WebP: "RIFF", its size, "WEBP".
      expect(data.subarray(0, 4).toString('latin1'), face.id).toBe('RIFF')
      expect(data.subarray(8, 12).toString('latin1'), face.id).toBe('WEBP')
    }
  })

  it('stands the agent as the face it wears', () => {
    const face = faceById('clay-03')!
    const other = faceById('clay-07')!
    const wearing = makeAgent({
      id: 'a2',
      name: 'Iris',
      avatarVersion: face.version,
      avatarShape: other.id,
    })
    expect(standingFace(wearing)).toBe(face)
    // No picture yet: the face it was given.
    const waiting = makeAgent({ id: 'a2', name: 'Iris', avatarShape: face.id })
    expect(standingFace(waiting)).toBe(face)
    // A picture of its own: no face stands for it.
    const own = makeAgent({
      id: 'a2',
      name: 'Iris',
      avatarVersion: '0123456789abcdef',
      avatarShape: face.id,
    })
    expect(standingFace(own)).toBeUndefined()
    expect(standingFace(makeAgent({ id: 'a2', name: 'Iris' }))).toBeUndefined()
  })

  it('has every face’s backdrop', () => {
    for (const face of faces) expect(face.backdrop, face.id).toBeTruthy()
    expect(faceById('clay-23')?.backdrop).toBe('#618283')
  })

  it('is in its face’s colour, with white words', () => {
    const teal = joinedColoursForFace(faceById('clay-23'))!
    expect(hexOf(teal.top)).toBe('#7a9697')
    expect(hexOf(teal.bottom)).toBe('#4a6364')
    // Go to Chat's words, darker still.
    expect(luminance(teal.deep)).toBeLessThan(luminance(teal.bottom))
    // White words on every face (the founder: "make em all white").
    for (const face of faces) {
      expect(joinedColoursForFace(face), face.id).toBeTruthy()
    }
    expect(joinedInk).toEqual(rgb(1, 1, 1))
    expect(joinedSecondaryInk).toEqual(rgb(1, 1, 1, 0.8))
    const bare: AgentFace = {
      id: 'x',
      gender: 'female',
      file: 'x.webp',
      version: '0',
    }
    expect(joinedColoursForFace(bare)).toBeUndefined()
  })

  it('takes its colour from the face its agent stands as', () => {
    const face = faceById('clay-23')!
    const iris = { agentId: 'a2', name: 'Iris', line: '' }
    const wearing = makeAgent({
      id: 'a2',
      name: 'Iris',
      avatarVersion: face.version,
    })
    expect(joinedColours(iris, [wearing])).toEqual(joinedColoursForFace(face))
    const own = makeAgent({
      id: 'a2',
      name: 'Iris',
      avatarVersion: '0123456789abcdef',
      avatarShape: face.id,
    })
    // A picture of its own, or gone from the roster: the chat's grey.
    expect(joinedColours(iris, [own])).toBeUndefined()
    expect(joinedColours(iris, [])).toBeUndefined()
  })
})

describe('the card that offers Claude Code and Codex to connect (13 November 2026)', () => {
  it('reads its providers, in the order shown, and only the two a cloud agent codes on', () => {
    const read = card('m1', {
      type: 'model-connect',
      providers: ['claude', 'chatgpt'],
    })
    const row = chatRows([read]).at(-1)
    expect(row?.kind === 'card' && row.card).toBe('modelConnect')
    expect(cardText(read.message)).toBe('Connect Claude Code, Codex')
    expect(modelConnectPreview()).toBe('Connect Claude Code, Codex, Cursor')
    expect(modelConnectCard(read)).toEqual({ providers: ['claude', 'chatgpt'] })
    // One named twice is shown once; a provider no cloud agent codes on is left out.
    expect(
      modelConnectCard(
        card('m2', {
          type: 'model-connect',
          providers: ['chatgpt', 'gemini', 'chatgpt', 7],
        }),
      ),
    ).toEqual({ providers: ['chatgpt'] })
    // None it knows, or none named: all of them all the same.
    expect(
      modelConnectCard(
        card('m3', { type: 'model-connect', providers: ['new-one'] }),
      ),
    ).toEqual({ providers: ['claude', 'chatgpt', 'cursor'] })
    expect(modelConnectCard(card('m4', { type: 'model-connect' }))).toEqual({
      providers: ['claude', 'chatgpt', 'cursor'],
    })
    // Cursor, the third program (the founder, the same day: "Cursor now"): a launch that named it offers it alone.
    const one = card('m6', { type: 'model-connect', providers: ['cursor'] })
    expect(modelConnectCard(one)).toEqual({ providers: ['cursor'] })
    expect(cardText(one.message)).toBe('Connect Cursor')
    expect(modelConnectTitle('cursor', false)).toBe('Connect Cursor')
    expect(modelConnectTitle('cursor', true)).toBe('Cursor')
    expect(modelConnectLine('cursor', false)).toBe('Runs on your Cursor plan.')
    expect(modelConnectLogo('cursor')).toBe('cursor')
    expect(
      ['claude', 'chatgpt', 'cursor'].map(modelConnectOnComputer),
    ).toEqual([false, false, true])
    // Its sign-in is the cloud computer's word; only a page on its own site is ever opened.
    expect(cursorSignInState({ state: 'installing' })).toEqual({
      state: 'installing',
    })
    expect(cursorSignInState({ state: 'connected' })).toEqual({
      state: 'connected',
    })
    expect(cursorSignInState({ state: 'failed', why: 'ended' })).toEqual({
      state: 'failed',
      why: 'ended',
    })
    expect(
      cursorSignInState({
        state: 'waiting',
        url: 'https://cursor.com/loginDeepControl?challenge=a&uuid=b',
        expiresAtMs: 99,
      }),
    ).toEqual({
      state: 'waiting',
      url: 'https://cursor.com/loginDeepControl?challenge=a&uuid=b',
      expiresAtMs: 99,
    })
    for (const url of [
      'https://cursor.com.example.org/login',
      'http://cursor.com/login',
      'javascript:alert(1)',
    ])
      expect(cursorSignInState({ state: 'waiting', url })).toEqual({
        state: 'none',
      })
    expect(cursorSignInState(undefined)).toEqual({ state: 'none' })
    // Its consent: Cursor's plan for cloud agents alone; nothing sends the person to AI Models.
    const consent = codingConsent('cursor')
    expect([consent.id, consent.title, consentProgramLogo(consent)]).toEqual([
      'coding:cursor',
      'Cursor',
      'cursor',
    ])
    expect(consent.points.map((point) => point.body)).toEqual([
      'Cloud agents code in Cursor on your Cursor plan, not on your Simeon credits. Your agents keep the model they have.',
      "You approve on Cursor's own page, and the sign-in stays on your cloud computer. To disconnect, ask one of your agents.",
      'Cloud agents in Cursor pause until it resets.',
    ])
    expect(consent.smallPrint).toEqual([
      "You'll sign in on Cursor's own page. Simeon never sees your password.",
    ])
    expect(
      modelConnectCard(card('m5', { type: 'github-sign-in' })),
    ).toBeUndefined()
  })

  it('names the programs, says whose plan each runs on, and reads as a connected app once it is', () => {
    // The card names the programs; Settings names the plans (the founder, 13 November 2026).
    expect(modelConnectTitle('claude', false)).toBe('Connect Claude Code')
    expect(modelConnectTitle('chatgpt', false)).toBe('Connect Codex')
    expect(modelConnectLine('claude', false)).toBe('Runs on your Claude plan.')
    expect(modelConnectLine('chatgpt', false)).toBe(
      'Runs on your ChatGPT plan.',
    )
    expect(modelConnectTitle('chatgpt', true)).toBe('Codex')
    expect(modelConnectTitle('claude', true)).toBe('Claude Code')
    expect(modelConnectLine('chatgpt', true)).toBe('')
    expect(modelConnectLogo('claude')).toBe('claudecode')
    expect(modelConnectLogo('chatgpt')).toBe('codex')
    expect(modelConnectProgram('claude')).toBe('Claude Code')
    expect(modelConnectProgram('chatgpt')).toBe('Codex')
    // The accounts are read again while both rows wait, never once one is connected.
    expect(modelConnectNextPoll(false)).toBe(4)
    expect(modelConnectNextPoll(true)).toBeUndefined()
  })
})

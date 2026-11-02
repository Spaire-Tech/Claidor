// Send Feedback and Report an Issue (the core's FeedbackTests): what the
// sheets post, what a report's diagnostics carry and never carry, the
// recent activity, the route and its refusal; and the web's own facts (the
// browser, its system) and screenshots' size.

import { describe, expect, it } from 'vitest'
import { MemoryVault, SimeonAPI, SimeonAPIError } from './api'
import {
  type DeviceFacts,
  browserName,
  canSendReport,
  clippedMessage,
  deviceFactsFrom,
  diagnosticsText,
  feedbackAgent,
  feedbackAgentChoices,
  feedbackAgentLabel,
  feedbackBody,
  feedbackTopics,
  messageLimit,
  newFeedbackReport,
  roomForScreenshots,
  shrunkSize,
  systemName,
  toggledTopic,
} from './feedback'
import { field } from './json'
import { makeAgent } from './models'
import {
  clearRecentActivity,
  note,
  recentActivity,
  scrub,
} from './recentActivity'
import { AppStore } from './store'
import { FakeBackend, ScriptedHTTP, answer } from './testing'

const facts: DeviceFacts = {
  platform: 'iPhone',
  appVersion: '1.0 (29)',
  device: 'iPhone16,2',
  osVersion: 'iOS 26.1',
  language: 'fr',
  timeZone: 'Africa/Dakar',
}

describe('what the sheets post (FeedbackTests)', () => {
  it('sends feedback’s words, the facts and the agent (testFeedbackSendsItsWordsTheFactsAndTheAgent)', () => {
    let report = newFeedbackReport('feedback')
    expect(canSendReport(report)).toBe(false)
    report = { ...report, message: '  \n ' }
    expect(canSendReport(report)).toBe(false)
    report = {
      ...report,
      message: '  I love the joined card.\n',
      agent: feedbackAgent('a1', 'Maya', ' Inbox '),
      includesDiagnostics: true,
    }
    expect(canSendReport(report)).toBe(true)
    const body = feedbackBody(
      report,
      facts,
      'ignored for feedback? no: only when included',
    )
    expect(field(body, 'kind')).toBe('feedback')
    expect(field(body, 'message')).toBe('I love the joined card.')
    expect(field(body, 'platform')).toBe('iPhone')
    expect(field(body, 'appVersion')).toBe('1.0 (29)')
    expect(field(body, 'device')).toBe('iPhone16,2')
    expect(field(body, 'osVersion')).toBe('iOS 26.1')
    expect(field(body, 'language')).toBe('fr')
    expect(field(body, 'timeZone')).toBe('Africa/Dakar')
    expect(field(field(body, 'agent'), 'name')).toBe('Maya')
    expect(field(field(body, 'agent'), 'title')).toBe('Inbox')
    expect(field(body, 'topics')).toBeUndefined()
    expect(field(body, 'screenshots')).toBeUndefined()
    expect(feedbackAgentLabel(feedbackAgent('a1', 'Maya', 'Inbox'))).toBe(
      'Maya · Inbox',
    )
    expect(feedbackAgentLabel(feedbackAgent('a2', 'Leo', '  '))).toBe('Leo')
    expect(
      canSendReport({ ...report, message: 'a'.repeat(messageLimit + 1) }),
    ).toBe(false)
    // The editor keeps the words within the limit, as Swift counts them.
    expect(clippedMessage('😀'.repeat(messageLimit + 3))).toBe(
      '😀'.repeat(messageLimit),
    )
  })

  it('sends an issue’s topics, screenshots and only the diagnostics agreed to (testAnIssueSendsTopicsScreenshotsAndOnlyAgreedDiagnostics)', () => {
    let report = {
      ...newFeedbackReport('issue'),
      message: "Gmail won't connect.",
    }
    const topics = feedbackTopics()
    expect(topics.map((topic) => topic.id)).toEqual([
      'Account and sign-in',
      'Agents',
      'Chats',
      'Cloud computer',
      'Connectors',
      'Routines',
      'Voice calls',
      'Notifications',
      'Plans and billing',
      'Settings',
      'Other',
    ])
    expect(new Set(topics.map((topic) => topic.symbol)).size).toBe(
      topics.length,
    )
    report = toggledTopic(report, topics[4]!)
    report = toggledTopic(report, topics[3]!)
    report = toggledTopic(report, topics[4]!)
    report = toggledTopic(report, topics[0]!)
    expect(report.topics).toEqual(['Cloud computer', 'Account and sign-in'])
    report = {
      ...report,
      screenshots: [{ base64: '/9j/' }, { base64: '/9j/AA==' }],
    }
    expect(roomForScreenshots(report)).toBe(2)

    const without = feedbackBody(report, facts, 'log')
    expect(field(without, 'kind')).toBe('issue')
    expect(field(without, 'topics')).toEqual([
      'Cloud computer',
      'Account and sign-in',
    ])
    expect(
      field((field(without, 'screenshots') as unknown[])[1], 'filename'),
    ).toBe('screenshot-2.jpg')
    expect(field((field(without, 'screenshots') as unknown[])[0], 'data')).toBe(
      '/9j/',
    )
    expect(field(without, 'diagnostics')).toBeUndefined()
    expect(field(without, 'agent')).toBeUndefined()

    report = { ...report, includesDiagnostics: true }
    expect(field(feedbackBody(report, facts, 'log'), 'diagnostics')).toBe('log')
    expect(
      field(feedbackBody(report, facts, ''), 'diagnostics'),
    ).toBeUndefined()
  })

  it('never carries in diagnostics what could open an account (testDiagnosticsNeverCarryWhatCouldOpenAnAccount)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'
    const cases: [string, string][] = [
      [
        'guest console[info] open wss://box.simeonlabs.com/screen?token=abc&x=1 now',
        'guest console[info] open wss://box.simeonlabs.com/screen?*** now',
      ],
      ['Authorization: Bearer sk-live-123', 'Authorization: Bearer ***'],
      ['refresh_token=r-123&scope=all', 'refresh_token=***&scope=all'],
      ['{"password": "hunter2"}', '{"password": "***"}'],
      [`token ${jwt} kept`, 'token *** kept'],
      ['key q7Rk2Vx9Lm4Pz8Nw3Ty6Bh1Jc5Gd0Fs2Aa9Ee', 'key ***'],
    ]
    for (const [line, scrubbed] of cases)
      expect(scrub(line), line).toBe(scrubbed)
    // What helps find a problem stays: an agent's id, an error's code, a status.
    const kept =
      'openAgent 3f2a9c1e-7b4d-4e8a-9c2b-1d5e6f7a8b9c failed code=-1009 status 502 in 840 ms'
    expect(scrub(kept)).toBe(kept)
  })

  it('keeps the last lines of recent activity, scrubbed and timed (testRecentActivityKeepsTheLastLinesScrubbedAndTimed)', () => {
    clearRecentActivity()
    const at = new Date(1_793_000_000 * 1000)
    for (let index = 0; index < 405; index += 1) note(`step ${index}`, at)
    note('api GET apps?code=XYZ\n502', at)
    const lines = recentActivity()
    expect(lines).toHaveLength(400)
    expect(lines[0]!.endsWith(' step 6')).toBe(true)
    // One line; not an address, so its query is kept.
    expect(lines.at(-1)!.endsWith(' api GET apps?code=XYZ 502')).toBe(true)
    expect(lines.at(-1)!.startsWith('2026-10-26T')).toBe(true)
    clearRecentActivity()
  })

  it('names the device, the state and the logs in the diagnostics’ text (testTheDiagnosticsTextNamesTheDeviceTheStateAndTheLogs)', () => {
    const text = diagnosticsText(
      facts,
      ['Signed in: yes', 'Agents: 3'],
      ['t1 api GET apps 502 in 12 ms'],
      [
        {
          name: 'computer-stream.log',
          text: 'one\ntwo https://x.io/s?token=abc\n',
        },
      ],
    )
    expect(text).toBe(
      [
        'Simeon iPhone 1.0 (29)',
        'Device: iPhone16,2, iOS 26.1',
        'Language: fr, time zone: Africa/Dakar',
        'Signed in: yes',
        'Agents: 3',
        '',
        'Recent activity (oldest first):',
        't1 api GET apps 502 in 12 ms',
        '',
        'computer-stream.log (last 2 lines):',
        'one',
        'two https://x.io/s?***',
      ].join('\n'),
    )
    expect(diagnosticsText(facts, [], [])).toContain('Nothing yet.')
    // A log's last 300 lines, its empty ones left out.
    const long = Array.from({ length: 320 }, (_, i) => `line ${i}`).join('\n\n')
    const lines = diagnosticsText(
      facts,
      [],
      [],
      [{ name: 'x.log', text: long }],
    ).split('\n')
    expect(lines.at(-301)).toBe('x.log (last 300 lines):')
    expect(lines.at(-300)).toBe('line 20')
  })

  it('posts the report to the feedback route, and notes a refusal (testTheReportIsPostedToTheFeedbackRouteAndARefusalIsNoted)', async () => {
    clearRecentActivity()
    const http = new ScriptedHTTP([
      (request) => {
        expect(new URL(request.url).pathname).toBe('/desktop/api/feedback')
        expect(request.method).toBe('POST')
        const body = JSON.parse(request.body as string) as unknown
        expect(field(body, 'kind')).toBe('issue')
        expect(field(body, 'diagnostics')).toBe('the log')
        return answer(200, '{"code":0,"data":{"received":true}}')
      },
      () =>
        answer(
          400,
          '{"code":40002,"message":"A screenshot couldn\'t be sent. Try another one."}',
        ),
    ])
    const api = new SimeonAPI({
      base: 'https://api.example.com',
      clientVersion: '1',
      vault: new MemoryVault({
        accessToken: 't',
        refreshToken: 'r',
        expiresAtMs: 9e15,
      }),
      http,
      language: 'en',
    })
    const report = {
      ...newFeedbackReport('issue'),
      message: 'It froze.',
      includesDiagnostics: true,
    }
    await api.data('feedback', { json: feedbackBody(report, facts, 'the log') })
    expect(recentActivity(), 'an answered call is not noted').toHaveLength(0)
    let refused: unknown
    try {
      await api.data('feedback', {
        json: feedbackBody(report, facts, undefined),
      })
    } catch (error) {
      refused = error
    }
    expect(refused).toBeInstanceOf(SimeonAPIError)
    expect((refused as SimeonAPIError).message).toBe(
      "A screenshot couldn't be sent. Try another one.",
    )
    expect((refused as SimeonAPIError).status).toBe(400)
    expect(recentActivity()).toHaveLength(1)
    expect(recentActivity()[0]).toContain(' api POST feedback 400 in ')
    clearRecentActivity()
  })

  it('lets a message be about the person’s own agents only (testAMessageCanBeAboutThePersonsOwnAgentsOnly)', () => {
    const agents = [
      makeAgent({ id: 'a', name: 'Maya', title: 'Inbox' }),
      makeAgent({ id: 'g', name: 'Launch', isGroup: true }),
      makeAgent({ id: 'h', name: 'Old', isHidden: true }),
      makeAgent({ id: 'd', name: 'Disk Saver', purpose: 'disk-saver' }),
      makeAgent({ id: 'b', name: 'Leo' }),
    ]
    expect(feedbackAgentChoices(agents).map(feedbackAgentLabel)).toEqual([
      'Maya · Inbox',
      'Leo',
    ])
  })

  it('tells the browser and its system, as the browser tells every site (testTheDeviceFactsAreThisMachines, for the web)', () => {
    const chrome = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      brands: [
        { brand: 'Chromium', version: '142' },
        { brand: 'Google Chrome', version: '142' },
        { brand: 'Not_A Brand', version: '99' },
      ],
      platform: 'macOS',
      platformVersion: '15.1.0',
    }
    const web = deviceFactsFrom(chrome, 'web-next-0.1.0', 'fr', 'Europe/Paris')
    expect(web).toEqual({
      platform: 'Web',
      appVersion: 'web-next-0.1.0',
      device: 'Google Chrome 142',
      osVersion: 'macOS 15.1',
      language: 'fr',
      timeZone: 'Europe/Paris',
    })
    expect(
      systemName({ ...chrome, platform: 'Windows', platformVersion: '15.0.0' }),
    ).toBe('Windows 11')
    expect(
      systemName({ ...chrome, platform: 'Windows', platformVersion: '10.0.0' }),
    ).toBe('Windows 10')
    // Without client hints: the user agent.
    const safari = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
    }
    expect(browserName(safari)).toBe('Safari 26.1')
    expect(systemName(safari)).toBe('macOS 10.15.7')
    const firefox = {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
    }
    expect(browserName(firefox)).toBe('Firefox 145')
    expect(systemName(firefox)).toBe('Windows')
    const edge = {
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
    }
    expect(browserName(edge)).toBe('Microsoft Edge 142')
    expect(systemName(edge)).toBe('Linux')
  })

  it('draws a screenshot no larger than it is, its long side 1,600 at most', () => {
    expect(shrunkSize(3_200, 2_000)).toEqual({ width: 1_600, height: 1_000 })
    expect(shrunkSize(900, 2_400)).toEqual({ width: 600, height: 1_600 })
    expect(shrunkSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(shrunkSize(0, 600)).toBeUndefined()
  })
})

describe('the store’s report (Feedback.swift’s AppStore extension)', () => {
  it('posts the report with the facts, and says what the app knows of itself', async () => {
    const backend = new FakeBackend()
    backend.agents = [
      makeAgent({ id: 'theo', name: 'Theo' }),
      makeAgent({ id: 'squad', name: 'Squad', isGroup: true }),
    ]
    backend.serverAnswers.feedback = { received: true }
    const store = new AppStore()
    store.account = { name: 'Bass', email: 'bass@simeonlabs.com' }
    await store.attach(backend)
    store.apply({ kind: 'connection', live: true })
    expect(store.diagnosticsState).toEqual([
      'Signed in: yes',
      'Agents: 1, groups: 1',
      'Computer: unknown, stream connected',
      'Open chat: none',
    ])
    const report = { ...newFeedbackReport('feedback'), message: 'Hello' }
    await store.sendFeedback(report, facts, undefined)
    expect(backend.serverCalls.find((c) => c.path === 'feedback')).toEqual({
      path: 'feedback',
      method: 'POST',
      body: feedbackBody(report, facts, undefined),
    })
    store.detach()
    let refused: unknown
    try {
      await store.sendFeedback(report, facts, undefined)
    } catch (error) {
      refused = error
    }
    expect((refused as SimeonAPIError).status).toBe(401)
  })
})

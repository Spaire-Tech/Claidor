// The session in the Windows app (MacSession.swift): signed out, the sign-in
// screen; Continue to sign in opens the server's page in the default browser
// (`openExternal`) and polls for the pair; Reopen link, Cancel, the Mac's
// lines when it fails or ends; the pair kept by the app; signing out forgets
// it all and shows the screen again; the agents kept on the PC at launch;
// the logs and the facts a report and About give.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimeonAPI, sessionVault } from '../core/api'
import type { LiveBackend } from '../core/backend'
import { streamLog } from '../core/cloudComputer'
import type { JSONValue } from '../core/json'
import { makeAgent } from '../core/models'
import { MemorySavedPlace, savedOwner } from '../core/savedChats'
import {
  FakeBackend,
  ScriptedHTTP,
  answer,
  eventually,
  ms,
  tokenFor,
} from '../core/testing'
import { WebSession } from '../session'
import type { Desktop } from './desktop'
import { desktop } from './desktop'
import {
  aboutFacts,
  desktopDeviceFacts,
  reportVersion,
  systemVersion,
} from './facts'
import { beforeQuit, runBeforeQuit } from './quitting'
import {
  desktopSessionOptions,
  isCallWindow,
  startDesktopSession,
} from './session'
import { FakeDesktop } from './testing'

const base = 'https://api.example.com'
const profile = () =>
  answer(
    200,
    '{"code":0,"data":{"email":"bass@simeonlabs.com","name":"Bass Fall","id":"acct-1"}}',
  )
const pairBody = () =>
  answer(200, `{"accessToken":"${tokenFor('acct-1')}","refreshToken":"r1"}`)

/** The app around the page: its facts, the browser it opens, and its folder of kept chats (a place in memory). */
function windowsApp(kept: Record<string, string> = {}) {
  const fake = new FakeDesktop({ apiBase: base }, kept)
  const opened: string[] = []
  const place = new MemorySavedPlace()
  const logs: { name: string; line: string }[] = []
  fake
    .answer('openExternal', (url) => void opened.push(url))
    .answer('readSaved', () => place.read() as never)
    .answer('readSavedChat', (id) => place.readChat(id) as never)
    .answer(
      'writeSaved',
      (name, record) => void place.write(name, record as JSONValue),
    )
    .answer(
      'writeSavedChat',
      (id, record) => void place.writeChat(id, record as JSONValue | null),
    )
    .answer('keepSavedChats', (ids) => void place.keepChats(ids))
    .answer('forgetSaved', () => void place.forget())
    .answer('writeLog', (name, line) => void logs.push({ name, line }))
    .answer('readLogs', () => [
      { name: 'voice-call.log' as const, text: 'a line' },
    ])
    .answer('deviceModel', () => 'LENOVO 21HM')
    .answer('relaunch', () => undefined)
  return { fake, opened, place, logs }
}

function session(
  host: Desktop,
  options: {
    http: ScriptedHTTP
    poll?: ScriptedHTTP
    backend: FakeBackend
    wait?: (seconds: number) => Promise<void>
  },
): WebSession {
  const desktopOptions = desktopSessionOptions(host)
  return new WebSession({
    ...desktopOptions,
    gateRetryMs: 0,
    forcesFirstRun: false,
    makeAPI: () =>
      new SimeonAPI({
        base,
        clientVersion: desktopOptions.clientVersion ?? '',
        vault: sessionVault(host.kept),
        http: options.http,
        language: 'en',
      }),
    makeBackend: () => options.backend as unknown as LiveBackend,
    signInHTTP: options.poll,
    signInWait: options.wait ?? (async () => {}),
  })
}

describe('the Windows app’s session', () => {
  const undo: (() => void)[] = []
  afterEach(() => {
    for (const step of undo.splice(0).reverse()) step()
  })

  function install(fake: FakeDesktop): Desktop {
    undo.push(fake.install())
    const host = desktop()
    if (!host) throw new Error('no desktop')
    return host
  }

  it('shows the sign-in screen with nothing kept, and no website', async () => {
    const { fake } = windowsApp()
    const host = install(fake)
    const http = new ScriptedHTTP([])
    const web = session(host, { http, backend: new FakeBackend() })
    await web.start()
    expect(web.phase).toBe('signedOut')
    expect(web.signedOutMessage).toBeUndefined()
    // No cookie traded, nothing asked of the website.
    expect(http.sent).toEqual([])
  })

  it('forgets at launch a copy of the chats left by a sign-in no longer kept', async () => {
    const { fake, place } = windowsApp()
    // A sign-out whose delete Windows refused (a file held a moment): the copy stayed, the pair went.
    await place.write('roster', {
      version: 1,
      email: 'rhea@simeonlabs.com',
      agents: [{ id: 'rhea-agent', name: 'Rhea’s' }],
    })
    await place.writeChat('rhea-agent', {
      version: 1,
      agentId: 'rhea-agent',
      entries: [],
    })
    const host = install(fake)
    const web = session(host, {
      http: new ScriptedHTTP([]),
      backend: new FakeBackend(),
    })
    await web.start()
    expect(web.phase).toBe('signedOut')
    await ms(5)
    expect(place.files).toEqual({})
    expect(place.chats.size).toBe(0)
  })

  it('never signs in nor keeps the chats in the call’s own window', async () => {
    const fake = new FakeDesktop({ apiBase: base, window: 'call' })
    const host = install(fake)
    expect(isCallWindow(host)).toBe(true)
    expect(desktopSessionOptions(host).savedChats).toBeUndefined()
    const web = new WebSession(desktopSessionOptions(host))
    const stop = startDesktopSession(host, web)
    stop()
    // No log written, no file asked for: the call's window answers nothing of the session's.
    expect(fake.calls).toEqual([])
    expect(web.store.startsDiskSaver).toBe(false)
  })

  it('lets the buttons work again when the sign-in can’t even start', async () => {
    const { fake, opened } = windowsApp()
    const host = install(fake)
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockRejectedValueOnce(new Error('No hash here.'))
    undo.push(() => digest.mockRestore())
    const poll = new ScriptedHTTP([() => answer(404), pairBody])
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const web = session(host, {
      http: new ScriptedHTTP([profile]),
      poll,
      backend,
    })
    await web.start()
    web.signInWithBrowser()
    await eventually(() => web.signedOutMessage != null)
    expect(web.signedOutMessage).toBe('Sign-in did not finish. Try again.')
    expect(opened).toEqual([])
    // Continue works again.
    web.signInWithBrowser()
    await eventually(() => web.phase === 'signedIn')
    expect(opened).toHaveLength(1)
  })

  it('signs in through the browser and /auth/poll, then the window', async () => {
    const { fake, opened } = windowsApp()
    const host = install(fake)
    const poll = new ScriptedHTTP([() => answer(404), pairBody])
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const web = session(host, {
      http: new ScriptedHTTP([profile]),
      poll,
      backend,
    })
    await web.start()
    const phases: string[] = []
    web.subscribe(() => phases.push(web.phase))
    web.signInWithBrowser()
    await eventually(() => web.phase === 'signedIn')
    expect(phases).toEqual(['waitingForBrowser', 'settingUp', 'signedIn'])
    expect(opened).toHaveLength(1)
    const page = new URL(opened[0]!)
    expect(`${page.origin}${page.pathname}`).toBe(`${base}/loginDeepControl`)
    expect([...page.searchParams.keys()]).toEqual([
      'challenge',
      'uuid',
      'mode',
      'redirectTarget',
    ])
    expect(page.searchParams.get('mode')).toBe('login')
    expect(page.searchParams.get('redirectTarget')).toBe('simeon')
    // The poll names the Windows app and carries the verifier in its body only.
    expect(poll.sent).toHaveLength(2)
    expect(poll.sent[0]!.url).toBe(`${base}/auth/poll`)
    expect(poll.sent[0]!.headers['x-simeon-client-version']).toBe(
      'windows-0.1.0+7',
    )
    const body = JSON.parse(String(poll.sent[0]!.body)) as { uuid: string }
    expect(body.uuid).toBe(page.searchParams.get('uuid'))
    // The pair is kept by the app, sealed (FakeDesktop records what was kept).
    const keptPair = fake.keeps.find((k) => k.key === 'simeon.web.tokens')
    expect(JSON.parse(keptPair?.value ?? '{}').refreshToken).toBe('r1')
    expect(web.store.agents.map((a) => a.id)).toEqual(['theo'])
  })

  it('opens the sign-up page for Sign up, and the same page again for Reopen link', async () => {
    const { fake, opened } = windowsApp()
    const host = install(fake)
    const poll = new ScriptedHTTP(
      Array.from({ length: 20 }, () => () => answer(404)),
    )
    const web = session(host, {
      http: new ScriptedHTTP([]),
      poll,
      backend: new FakeBackend(),
      wait: () => ms(20),
    })
    await web.start()
    web.signInWithBrowser(true)
    await eventually(() => opened.length === 1)
    expect(new URL(opened[0]!).searchParams.get('mode')).toBe('signup')
    web.reopenLink()
    expect(opened).toEqual([opened[0], opened[0]])
    // A second press while one waits starts nothing.
    web.signInWithBrowser()
    await ms(5)
    expect(opened).toHaveLength(2)
    web.cancelSignIn()
  })

  it('stops on Cancel and shows the screen again', async () => {
    const { fake } = windowsApp()
    const host = install(fake)
    let asked = 0
    const poll = new ScriptedHTTP(
      Array.from({ length: 50 }, () => () => {
        asked += 1
        return answer(404)
      }),
    )
    const web = new WebSession({
      ...desktopSessionOptions(host),
      signInHTTP: poll,
      signInWait: () => ms(5),
    })
    await web.start()
    web.signInWithBrowser()
    await eventually(() => web.phase === 'waitingForBrowser')
    await ms(12)
    web.cancelSignIn()
    expect(web.phase).toBe('signedOut')
    expect(web.signedOutMessage).toBeUndefined()
    const after = asked
    await ms(30)
    expect(asked).toBe(after)
    // Reopen link has nothing to open once cancelled.
    web.reopenLink()
  })

  it('says the Mac’s line when the sign-in doesn’t finish, or the server refuses it', async () => {
    const { fake } = windowsApp()
    const host = install(fake)
    const errors = new ScriptedHTTP([
      () => answer(500),
      () => answer(502),
      () => answer(503),
    ])
    const web = session(host, {
      http: new ScriptedHTTP([]),
      poll: errors,
      backend: new FakeBackend(),
    })
    await web.start()
    web.signInWithBrowser()
    await eventually(() => web.signedOutMessage != null)
    expect(web.phase).toBe('signedOut')
    expect(web.signedOutMessage).toBe('Sign-in did not finish. Try again.')

    const refused = new ScriptedHTTP([
      () => answer(403, '{"error":"sign_in_policy_violation"}'),
      ...Array.from({ length: 20 }, () => () => answer(404)),
    ])
    const again = session(host, {
      http: new ScriptedHTTP([]),
      poll: refused,
      backend: new FakeBackend(),
      wait: () => ms(20),
    })
    await again.start()
    again.signInWithBrowser()
    await eventually(() => again.signedOutMessage != null)
    expect(again.signedOutMessage).toBe(
      "Sign-in on this device is restricted by your organization's device policy. Sign in with an allowed account to continue.",
    )
    // Signing in again clears the line.
    again.signInWithBrowser()
    await eventually(() => again.phase === 'waitingForBrowser')
    expect(again.signedOutMessage).toBeUndefined()
    again.cancelSignIn()
  })

  it('goes straight in with a kept pair, and shows the agents kept on the PC before the computer answers', async () => {
    const tokens = JSON.stringify({
      accessToken: tokenFor('acct-1'),
      refreshToken: 'r',
      expiresAtMs: 9e15,
    })
    const { fake, place } = windowsApp({ 'simeon.web.tokens': tokens })
    const kept = makeAgent({ id: 'iris', name: 'Iris' })
    await place.write('roster', {
      version: 1,
      email: 'bass@simeonlabs.com',
      accountId: 'acct-1',
      agents: [{ id: 'iris', name: 'Iris' }],
    })
    void kept
    const host = install(fake)
    const backend = new FakeBackend()
    backend.listDelayMs = 40
    backend.agents = [makeAgent({ id: 'nora', name: 'Nora' })]
    const web = session(host, { http: new ScriptedHTTP([profile]), backend })
    const started = web.start()
    await ms(15)
    expect(web.phase).toBe('signedIn')
    expect(web.store.showingSaved).toBe(true)
    expect(web.store.agents.map((a) => a.id)).toEqual(['iris'])
    await started
    expect(web.store.agents.map((a) => a.id)).toEqual(['nora'])
  })

  it('forgets the pair, the computer’s address and the chats kept on signing out, and shows the screen', async () => {
    const tokens = JSON.stringify({
      accessToken: tokenFor('acct-1'),
      refreshToken: 'r',
      expiresAtMs: 9e15,
    })
    const { fake, place } = windowsApp({
      'simeon.web.tokens': tokens,
      'simeon.web.gateway': '{"kept":true}',
    })
    await place.write('roster', {
      version: 1,
      email: 'bass@simeonlabs.com',
      agents: [{ id: 'iris', name: 'Iris' }],
    })
    const host = install(fake)
    const http = new ScriptedHTTP([profile, () => answer(200, '{}')])
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const web = session(host, { http, backend })
    await web.start()
    await web.signOut()
    expect(web.phase).toBe('signedOut')
    expect(web.signedOutMessage).toBeUndefined()
    await web.store.saved?.waitForWrites()
    expect(place.files).toEqual({})
    expect(fake.keeps).toContainEqual({ key: 'simeon.web.tokens', value: null })
    expect(fake.keeps).toContainEqual({
      key: 'simeon.web.gateway',
      value: null,
    })
    expect(http.sent.map((r) => new URL(r.url).pathname)).toContain(
      '/desktop/api/auth/logout',
    )
  })

  it('says the sign-in expired when the server ends it, and forgets what was kept', async () => {
    const tokens = JSON.stringify({
      accessToken: tokenFor('acct-1'),
      refreshToken: 'spent',
      expiresAtMs: 9e15,
    })
    const { fake, place } = windowsApp({ 'simeon.web.tokens': tokens })
    await place.write('roster', {
      version: 1,
      email: 'bass@simeonlabs.com',
      agents: [{ id: 'iris', name: 'Iris' }],
    })
    const host = install(fake)
    const http = new ScriptedHTTP([
      () => answer(401),
      () => answer(200, '{"shouldLogout":true}'),
    ])
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const web = session(host, { http, backend })
    await web.start()
    await eventually(() => web.phase === 'signedOut')
    expect(web.signedOutMessage).toBe(
      'Your Simeon sign-in expired. Sign in again.',
    )
    expect(web.store.agents).toEqual([])
    await ms(5)
    expect(place.files).toEqual({})
  })

  it('writes the call’s and the screens’ lines to the app’s logs, and keeps the chats before quitting', async () => {
    const tokens = JSON.stringify({
      accessToken: tokenFor('acct-1'),
      refreshToken: 'r',
      expiresAtMs: 9e15,
    })
    const { fake, place, logs } = windowsApp({ 'simeon.web.tokens': tokens })
    const host = install(fake)
    const listeners: Record<string, (() => void)[]> = {}
    const target = {
      addEventListener: (name: string, listener: () => void) => {
        ;(listeners[name] ??= []).push(listener)
      },
      removeEventListener: () => {},
    }
    const globals = globalThis as unknown as {
      window?: unknown
      document?: unknown
    }
    const before = { window: globals.window, document: globals.document }
    globals.window = target
    globals.document = { ...target, visibilityState: 'visible' }
    undo.push(() => {
      globals.window = before.window
      globals.document = before.document
    })
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const web = session(host, { http: new ScriptedHTTP([profile]), backend })
    expect(web.store.startsDiskSaver).toBe(false)
    undo.push(startDesktopSession(host, web))
    // The app sets Disk Saver to work when the disk runs low, as the Mac does (a browser's tab never does).
    expect(web.store.startsDiskSaver).toBe(true)
    await web.start()
    await eventually(() => web.store.account != null)
    web.store.callLog('call started')
    streamLog.write('screen theo connecting')
    await ms(1)
    expect(logs).toEqual([
      { name: 'voice-call.log', line: 'call started' },
      { name: 'computer-stream.log', line: 'screen theo connecting' },
    ])
    // The window going behind keeps the list now, not two seconds later.
    for (const listener of listeners.blur ?? []) listener()
    await web.store.saved?.waitForWrites()
    expect(JSON.parse(place.files.roster ?? '{}').agents?.[0]?.id).toBe('theo')
    // Quitting keeps what changed since, and waits for it.
    web.store.saved?.writeRoster(
      [],
      savedOwner('acct-1', 'bass@simeonlabs.com'),
    )
    await runBeforeQuit(200)
    void beforeQuit
  })
})

describe('the facts', () => {
  it('names Windows and its version as the Mac names macOS', () => {
    expect(systemVersion('win32', '10.0.26100')).toBe('Windows 11 (10.0.26100)')
    expect(systemVersion('win32', '10.0.19045')).toBe('Windows 10 (10.0.19045)')
    expect(systemVersion('win32', '6.3.9600')).toBe('Windows (6.3.9600)')
    expect(systemVersion('linux', '6.18.44')).toBe('Linux 6.18.44')
  })

  it('gives a report the Windows app’s facts, and About its three', async () => {
    const { fake } = windowsApp()
    const host = (() => {
      undoInstall = fake.install()
      return desktop()!
    })()
    try {
      expect(reportVersion(host.facts)).toBe('0.1.0 (7)')
      expect(await desktopDeviceFacts(host, 'fr', 'Europe/Paris')).toEqual({
        platform: 'Windows',
        appVersion: '0.1.0 (7)',
        device: 'LENOVO 21HM',
        osVersion: 'Windows 11 (10.0.26100)',
        language: 'fr',
        timeZone: 'Europe/Paris',
      })
      expect(aboutFacts(host)).toEqual({
        version: '0.1.0',
        track: 'stable',
        os: 'win32',
      })
    } finally {
      undoInstall?.()
    }
  })
})

let undoInstall: (() => void) | undefined

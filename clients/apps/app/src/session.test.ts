// Signing in and reaching the computer, the web's way: the pair kept in the
// tab, the website's cookie traded, the website's sign-in page when there is
// neither, the window as soon as a list is on screen, and back to the sign-in
// page when the server ends the sign-in.

import { describe, expect, it } from 'vitest'
import { MemoryVault, SimeonAPI } from './core/api'
import type { LiveBackend } from './core/backend'
import { makeAgent } from './core/models'
import { MemorySavedGateway } from './core/savedGateway'
import { FakeBackend, ScriptedHTTP, answer, ms, tokenFor } from './core/testing'
import { WebSession } from './session'

function session(options: {
  vault: MemoryVault
  http: ScriptedHTTP
  backend: FakeBackend
  signIns: string[]
  saved?: MemorySavedGateway
}): WebSession {
  return new WebSession({
    base: 'https://api.example.com',
    here: () => '/app-next/?agent=theo',
    goSignIn: (returnTo) => options.signIns.push(returnTo),
    saved: options.saved ?? new MemorySavedGateway(),
    makeAPI: () =>
      new SimeonAPI({
        base: 'https://api.example.com',
        clientVersion: '1',
        vault: options.vault,
        http: options.http,
        language: 'en',
      }),
    makeBackend: () => options.backend as unknown as LiveBackend,
  })
}

const profile = () =>
  answer(
    200,
    '{"code":0,"data":{"email":"bass@simeonlabs.com","name":"Bass Fall"}}',
  )

describe('the web session', () => {
  it('uses the pair kept in the tab, and shows the window with the agents', async () => {
    const vault = new MemoryVault({
      accessToken: tokenFor('u1'),
      refreshToken: 'r',
      expiresAtMs: 9e15,
    })
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const http = new ScriptedHTTP([profile])
    const signIns: string[] = []
    const web = session({ vault, http, backend, signIns })
    const phases: string[] = []
    web.subscribe(() => phases.push(web.phase))
    await web.start()
    await ms(5)
    expect(phases).toEqual(['settingUp', 'signedIn'])
    expect(web.store.agents.map((a) => a.id)).toEqual(['theo'])
    expect(web.store.account?.name).toBe('Bass Fall')
    expect(signIns).toEqual([])
    // No cookie was traded: the pair was there.
    expect(http.sent.map((r) => new URL(r.url).pathname)).toEqual([
      '/desktop/api/user/profile',
    ])
  })

  it('trades the website’s cookie when the tab has no pair', async () => {
    const vault = new MemoryVault()
    const http = new ScriptedHTTP([
      (request) => {
        expect(request.credentials).toBe('include')
        return answer(
          200,
          `{"accessToken":"${tokenFor('u1')}","refreshToken":"r"}`,
        )
      },
      profile,
    ])
    const signIns: string[] = []
    const web = session({ vault, http, backend: new FakeBackend(), signIns })
    await web.start()
    expect(web.phase).toBe('signedIn')
    expect(vault.read()?.refreshToken).toBe('r')
    expect(signIns).toEqual([])
  })

  it('goes to the website’s sign-in page with neither, told to come back here', async () => {
    const http = new ScriptedHTTP([() => answer(401)])
    const signIns: string[] = []
    const backend = new FakeBackend()
    const web = session({ vault: new MemoryVault(), http, backend, signIns })
    await web.start()
    expect(web.phase).toBe('signedOut')
    expect(signIns).toEqual(['/app-next/?agent=theo'])
    expect(backend.emit).toBeUndefined()
  })

  it('shows the window on the server’s copy before the computer answers', async () => {
    const vault = new MemoryVault({
      accessToken: tokenFor('u1'),
      refreshToken: 'r',
      expiresAtMs: 9e15,
    })
    const backend = new FakeBackend()
    backend.listDelayMs = 40
    backend.agents = [makeAgent({ id: 'nora', name: 'Nora' })]
    backend.serverAnswers['chats/agents'] = {
      agents: [{ id: 'theo', name: 'Theo' }],
    }
    const web = session({
      vault,
      http: new ScriptedHTTP([profile]),
      backend,
      signIns: [],
    })
    const started = web.start()
    await ms(15)
    expect(web.phase).toBe('signedIn')
    expect(web.store.agents.map((a) => a.id)).toEqual(['theo'])
    await started
    expect(web.store.agents.map((a) => a.id)).toEqual(['nora'])
  })

  it('goes back to the website’s sign-in page when the server ends the sign-in, forgetting the computer', async () => {
    const vault = new MemoryVault({
      accessToken: tokenFor('u1'),
      refreshToken: 'spent',
      expiresAtMs: 9e15,
    })
    const saved = new MemorySavedGateway('{"kept":true}')
    const http = new ScriptedHTTP([
      // The profile answers 401, and the refresh it asks for is refused.
      () => answer(401),
      () => answer(200, '{"shouldLogout":true}'),
    ])
    const signIns: string[] = []
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const web = session({ vault, http, backend, signIns, saved })
    await web.start()
    await ms(10)
    expect(signIns).toEqual(['/app-next/?agent=theo'])
    expect(web.phase).toBe('signedOut')
    expect(web.store.agents).toEqual([])
    expect(saved.read()).toBeNull()
    expect(vault.read()).toBeNull()
  })
})

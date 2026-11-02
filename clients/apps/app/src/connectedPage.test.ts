// The page that ends a sign-in come back through Simeon Labs' server
// (connected.html, connectedPage.ts): what the old web app's page does
// (desktop/web/bridge.ts, `finishConnectedAppSignIn`), with stand-ins for
// the website's cookie and the computer; what it tells the window; the
// server it talks to; its pair signed out so it outlives the tab.

import { describe, expect, it } from 'vitest'
import {
  type Finishing,
  finishSignIn,
  pageApiBase,
  pageClientVersion,
  signOutPair,
} from './connectedPage'
import { clientVersion } from './session'

function standIns(
  options: { signedIn?: boolean; refuses?: string; cookieFails?: boolean } = {},
) {
  const done: string[] = []
  const finishing: Finishing = {
    async signIn() {
      done.push('signIn')
      if (options.cookieFails) throw new Error('offline')
      return options.signedIn ?? true
    },
    async complete(answer) {
      done.push(`complete ${answer.stateId} ${answer.code}`)
      if (options.refuses) throw new Error(options.refuses)
    },
    async signOut() {
      done.push('signOut')
    },
  }
  return { finishing, done }
}

const notFinished = {
  title: "That didn't work.",
  body: 'Sign-in did not finish. Try again.',
}

describe('the sign-in’s return page', () => {
  it('hands the code to the computer, signs its pair out, says Connected and closes', async () => {
    const { finishing, done } = standIns()
    const end = await finishSignIn(
      '?state=vendor-stripe-1&code=c%2F1',
      finishing,
    )
    expect(end).toEqual({
      words: { title: 'Connected', body: '' },
      closes: true,
      heard: { state: 'vendor-stripe-1', refused: false },
    })
    expect(done).toEqual(['signIn', 'complete vendor-stripe-1 c/1', 'signOut'])
  })

  it('says a maker’s refusal in the catalogue’s words, never the address’s, and tells the window', async () => {
    const { finishing, done } = standIns()
    expect(
      await finishSignIn(
        '?state=s&error=access_denied&error_description=Call+0800+now',
        finishing,
      ),
    ).toEqual({
      words: notFinished,
      closes: false,
      heard: { state: 's', refused: true },
    })
    // Back without its code: incomplete, not a refusal.
    expect(await finishSignIn('?state=s', finishing)).toEqual({
      words: notFinished,
      closes: false,
      heard: { state: 's', refused: false },
    })
    // No state: nothing to tell.
    for (const query of ['?code=c', ''])
      expect(await finishSignIn(query, finishing)).toEqual({
        words: notFinished,
        closes: false,
        heard: undefined,
      })
    expect(done).toEqual([])
  })

  it('asks to sign in first when the website’s cookie holds no one', async () => {
    for (const options of [{ signedIn: false }, { cookieFails: true }]) {
      const { finishing, done } = standIns(options)
      expect(await finishSignIn('?state=s&code=c', finishing)).toEqual({
        words: { title: 'Sign in to Simeon first.', body: '' },
        closes: false,
      })
      expect(done).toEqual(['signIn'])
    }
  })

  it('says why the computer couldn’t finish, and still leaves no session', async () => {
    const { finishing, done } = standIns({
      refuses: 'No pending vendor sign-in matches this callback.',
    })
    expect(await finishSignIn('?state=s&code=c', finishing)).toEqual({
      words: {
        title: "That didn't work.",
        body: 'No pending vendor sign-in matches this callback.',
      },
      closes: false,
      heard: { state: 's', refused: false },
    })
    expect(done).toEqual(['signIn', 'complete s c', 'signOut'])
  })

  it('names itself to the server as the window does', () => {
    expect(pageClientVersion).toBe(clientVersion)
  })

  it('takes its server from where it is, never from its address but on this computer', () => {
    const at = (hostname: string, search: string) =>
      pageApiBase({ hostname, search, protocol: 'https:' })
    expect(at('app.simeonlabs.com', '?api=https://other.example&state=s')).toBe(
      'https://api.simeonlabs.com',
    )
    expect(at('app.simeonlabs.com', '')).toBe('https://api.simeonlabs.com')
    // A developer's or the checks' stand-in server, on the loopback only.
    expect(
      pageApiBase({
        hostname: 'localhost',
        search: '?api=http://localhost:4211/fake',
        protocol: 'http:',
      }),
    ).toBe('http://localhost:4211/fake')
    expect(
      pageApiBase({ hostname: '127.0.0.1', search: '', protocol: 'http:' }),
    ).toBe('http://127.0.0.1:8000')
  })

  it('signs its pair out so it outlives the tab, and plainly when the browser won’t', async () => {
    const sent: { url: string; init: RequestInit }[] = []
    const send = (async (url: string, init: RequestInit) => {
      sent.push({ url, init })
      return new Response('{}')
    }) as typeof fetch
    await signOutPair(send, 'https://api.example.com', 'fr', 'tok')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('https://api.example.com/desktop/api/auth/logout')
    expect(sent[0]!.init).toMatchObject({
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { authorization: 'Bearer tok', 'accept-language': 'fr' },
    })
    const refusing = (async (url: string, init: RequestInit) => {
      sent.push({ url, init })
      if (init.keepalive) throw new TypeError('keepalive not supported')
      return new Response('{}')
    }) as typeof fetch
    sent.length = 0
    await signOutPair(refusing, 'https://api.example.com', 'en', 'tok')
    expect(sent.map((one) => one.init.keepalive ?? false)).toEqual([
      true,
      false,
    ])
    // A network that answers nothing: let go.
    await signOutPair(
      (async () => {
        throw new TypeError('offline')
      }) as typeof fetch,
      'https://api.example.com',
      'en',
      'tok',
    )
  })
})

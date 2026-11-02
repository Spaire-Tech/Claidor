// The page that ends a sign-in come back through Simeon Labs' server
// (connected.html, connectedPage.ts): what the old web app's page does
// (desktop/web/bridge.ts, `finishConnectedAppSignIn`), with stand-ins for
// the website's cookie and the computer.

import { describe, expect, it } from 'vitest'
import {
  type Finishing,
  finishSignIn,
  pageClientVersion,
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

describe('the sign-in’s return page', () => {
  it('hands the code to the computer, says Connected, closes, and leaves no session', async () => {
    const { finishing, done } = standIns()
    const end = await finishSignIn(
      '?state=vendor-stripe-1&code=c%2F1',
      finishing,
    )
    expect(end).toEqual({
      words: { title: 'Connected', body: '' },
      closes: true,
    })
    expect(done).toEqual(['signIn', 'complete vendor-stripe-1 c/1', 'signOut'])
  })

  it('says the maker’s refusal, and asks nothing', async () => {
    const { finishing, done } = standIns()
    expect(
      await finishSignIn(
        '?state=s&error=access_denied&error_description=The+user+said+no',
        finishing,
      ),
    ).toEqual({
      words: { title: "That didn't work.", body: 'The user said no' },
      closes: false,
    })
    expect(
      (await finishSignIn('?state=s&error=access_denied', finishing)).words,
    ).toEqual({
      title: "That didn't work.",
      body: 'Sign-in did not finish. Try again.',
    })
    // Back without its code or its state: incomplete.
    for (const query of ['?state=s', '?code=c', ''])
      expect((await finishSignIn(query, finishing)).words.body).toBe(
        'Sign-in did not finish. Try again.',
      )
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
    })
    expect(done).toEqual(['signIn', 'complete s c', 'signOut'])
  })

  it('names itself to the server as the window does', () => {
    expect(pageClientVersion).toBe(clientVersion)
  })
})

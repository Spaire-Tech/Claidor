// One Connect and where a sign-in comes back (the core's Connecting.swift,
// LoopbackSignIn.swift, AppReturnSignIn.swift): PluginCallsTests' words,
// LoopbackSignInTests' and AppReturnSignInTests' which-sign-in and
// answer cases.

import { describe, expect, it } from 'vitest'
import {
  alreadySignedIn,
  authorizationURL,
  connectWord,
  connectedNotice,
  didntConnect,
  isLoopback,
  loopbackAddress,
  loopbackState,
  notConnectedNotice,
  queryItems,
  serverReturnState,
  signInAnswer,
  signInEndsChannel,
  signInHeard,
  stillConnectingNotice,
  undoes,
} from './connecting'

describe('one Connect (Connecting)', () => {
  it('takes back only what the person cancelled', () => {
    const start = { url: 'https://linear.app/oauth', addedPlugin: 'linear' }
    expect(undoes('cancelled', start)).toBe(true)
    expect(undoes('unconfirmed', start)).toBe(false)
    expect(undoes('connected', start)).toBe(false)
    expect(undoes('replaced', start)).toBe(false)
    // An app that was there before stays.
    expect(undoes('cancelled', { url: start.url })).toBe(false)
  })

  it('says how it went', () => {
    expect(connectWord()).toBe('Connect')
    expect(connectedNotice('Linear', 0).text).toBe('Connected Linear')
    expect(connectedNotice('Linear', 1).text).toBe(
      'Connected Linear and 1 skill',
    )
    expect(connectedNotice('Linear', 2).text).toBe(
      'Connected Linear and 2 skills',
    )
    expect(connectedNotice('Linear', 2).isError).toBe(false)
    expect(connectedNotice('Linear', 0, 'offline')).toEqual({
      isError: true,
      text: "Connected Linear, but its skills didn't sync: offline",
    })
    expect(notConnectedNotice('Linear')).toEqual({
      isError: false,
      text: "Linear wasn't connected",
    })
    expect(stillConnectingNotice('Linear').text).toBe(
      "Finishing Linear's sign-in…",
    )
    expect(didntConnect('Linear')).toBe("Linear didn't connect. Try again.")
    expect(didntConnect('Linear', '')).toBe("Linear didn't connect. Try again.")
    expect(didntConnect('Linear', 'Linear is coming soon in Simeon.')).toBe(
      "Linear didn't connect: Linear is coming soon in Simeon.",
    )
  })

  it('reads the computer’s answer to authenticateServer', () => {
    expect(
      authorizationURL({
        status: 'started',
        authorizationUrl: 'https://linear.app/oauth',
      }),
    ).toBe('https://linear.app/oauth')
    // A web page only: never another kind of link a tab would hand elsewhere.
    expect(
      authorizationURL({ authorizationUrl: 'javascript:alert(1)' }),
    ).toBeUndefined()
    expect(authorizationURL({ authorizationUrl: 'not a link' })).toBeUndefined()
    expect(authorizationURL({ authorizationUrl: '' })).toBeUndefined()
    expect(authorizationURL({})).toBeUndefined()
    expect(alreadySignedIn({ status: 'already-authenticated' })).toBe(true)
    expect(alreadySignedIn({ status: 'started' })).toBe(false)
  })
})

/** Canva's authorization page as the computer builds it (`finishStart`, URLSearchParams' encoding). */
const canva =
  'https://mcp.canva.com/authorize?client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback&response_type=code&code_challenge=x&code_challenge_method=S256&state=vendor-canva-Zz9_&resource=https%3A%2F%2Fmcp.canva.com%2Fmcp'

/** Stripe's authorization page as the computer builds it: back to Simeon Labs' server. */
const stripe =
  'https://access.stripe.com/mcp/oauth2/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback&response_type=code&code_challenge=x&code_challenge_method=S256&state=vendor-stripe-Ab_9&resource=https%3A%2F%2Fmcp.stripe.com'

describe('a sign-in returning to the loopback (LoopbackSignInTests)', () => {
  it('only a sign-in returning to the loopback is caught', () => {
    expect(loopbackState(canva)).toBe('vendor-canva-Zz9_')
    expect(
      loopbackState(
        'https://x.example/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fcallback&state=s',
      ),
    ).toBe('s')
    // Notion's, back to Simeon Labs' hosted page: the web's tab as before.
    expect(
      loopbackState(
        'https://mcp.notion.com/authorize?redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback&state=s',
      ),
    ).toBeUndefined()
    // Another port, another path, https, no state, or an app's own link (Composio's): not the loopback.
    for (const other of [
      'https://x.example/a?redirect_uri=http%3A%2F%2Flocalhost%3A8788%2Fcallback&state=s',
      'https://x.example/a?redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fother&state=s',
      'https://x.example/a?redirect_uri=https%3A%2F%2Flocalhost%3A8787%2Fcallback&state=s',
      'https://x.example/a?redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback',
      'https://connect.composio.dev/link/lk_123',
      'not a link',
    ])
      expect(loopbackState(other), other).toBeUndefined()
  })

  it('the address matches the computer’s', () => {
    expect(loopbackAddress).toBe('http://localhost:8787/callback')
    expect(isLoopback(loopbackAddress)).toBe(true)
  })
})

describe('a sign-in returning through the server (AppReturnSignInTests)', () => {
  it('only a sign-in returning through the server is named', () => {
    expect(serverReturnState(stripe)).toBe('vendor-stripe-Ab_9')
    // Canva's comes back to the loopback; an app's own link (Composio's) has no state.
    expect(serverReturnState(canva)).toBeUndefined()
    expect(
      serverReturnState('https://connect.composio.dev/link/lk_123'),
    ).toBeUndefined()
    expect(
      serverReturnState(
        'https://x.example/a?redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback',
      ),
    ).toBeUndefined()
  })

  it('the answer the server sends on is read from the page’s own address', () => {
    expect(signInAnswer('?state=vendor-stripe-Ab_9&code=c%2F1')).toEqual({
      state: 'vendor-stripe-Ab_9',
      code: 'c/1',
      error: undefined,
      errorDescription: undefined,
    })
    expect(
      signInAnswer(
        '?state=s&error=access_denied&error_description=The+user+said+no',
      ),
    ).toEqual({
      state: 's',
      code: undefined,
      error: 'access_denied',
      errorDescription: 'The user said no',
    })
    // No state, or nothing: not a sign-in's answer.
    expect(signInAnswer('?code=c')).toBeUndefined()
    expect(signInAnswer('?state=&code=c')).toBeUndefined()
    expect(signInAnswer('')).toBeUndefined()
  })

  it('reads what the web app’s return page tells the window', () => {
    expect(signInEndsChannel).toBe('simeon.sign-in-ends')
    expect(signInHeard({ state: 'vendor-stripe-1', refused: true })).toEqual({
      state: 'vendor-stripe-1',
      refused: true,
    })
    expect(signInHeard({ state: 's', refused: false })?.refused).toBe(false)
    for (const other of [
      { state: '', refused: true },
      { state: 's' },
      { refused: true },
      'refused',
      null,
    ])
      expect(signInHeard(other)).toBeUndefined()
  })

  it('reads the query as Apple’s URLComponents does', () => {
    expect(queryItems('?a=1&b&c=&d=x%2By+z')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b' },
      { name: 'c', value: '' },
      // A "+" stays a "+".
      { name: 'd', value: 'x+y+z' },
    ])
    expect(queryItems('?bad=%E0%A4%A')).toEqual([
      { name: 'bad', value: '%E0%A4%A' },
    ])
    expect(queryItems('')).toEqual([])
  })
})

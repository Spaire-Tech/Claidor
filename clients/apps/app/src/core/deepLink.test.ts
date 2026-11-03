// The links that open the app: SimeonMacCoreTests' DeepLinkTests (MacCoreTests.swift),
// and the two a connector's sign-in comes back on: AppReturnSignInTests'
// answers and PluginCallsTests' `Connecting.failed`.

import { describe, expect, it } from 'vitest'
import {
  type DeepLink,
  type DeepLinkRoute,
  appReturnAnswer,
  canonicalDeepLink,
  connectedReturn,
  parseDeepLink,
} from './deepLink'

const schemes = ['simeon', 'simeon-mac']
const route = (raw: string): DeepLinkRoute | undefined =>
  parseDeepLink(raw, schemes)?.route

describe('DeepLink (DeepLinkTests)', () => {
  it('reads the Electron app’s routes', () => {
    expect(parseDeepLink('simeon://app/v1/open', schemes)).toEqual<DeepLink>({
      route: { kind: 'open' },
      source: 'scheme',
    })
    expect(route('simeon-mac://app/v1/open')).toEqual({ kind: 'open' })
    expect(route('SIMEON-MAC://app/v1/open')).toEqual({ kind: 'open' })
    expect(route('simeon://app/v1/info?topic=deep-links')).toEqual({
      kind: 'info',
      topic: 'deep-links',
    })
    expect(route('simeon://app/v1/plugin/add?id=42')).toEqual({
      kind: 'pluginAdd',
      id: '42',
    })
    expect(route('simeon://app/v1/plugin/add?id=1234567890123456789')).toEqual({
      kind: 'pluginAdd',
      id: '1234567890123456789',
    })
    expect(
      parseDeepLink('https://app.simeonlabs.com/sand/link/v1/open', schemes),
    ).toEqual<DeepLink>({ route: { kind: 'open' }, source: 'https' })
    expect(
      route('https://app.simeonlabs.com/sand/link/v1/plugin/add?id=7'),
    ).toEqual({ kind: 'pluginAdd', id: '7' })
    expect(
      route('https://app.simeonlabs.com/sand/link/v1/info?topic=deep-links'),
    ).toEqual({ kind: 'info', topic: 'deep-links' })
    // An empty piece of the query is no key, as the browser reads it.
    expect(route('simeon://app/v1/plugin/add?id=42&')).toEqual({
      kind: 'pluginAdd',
      id: '42',
    })
  })

  it('refuses what the Electron app refuses', () => {
    for (const raw of [
      '',
      'sand://app/v1/open',
      'simeon-ios://app/v1/open',
      'http://app.simeonlabs.com/sand/link/v1/open',
      'simeon://app/v1/open#x',
      'simeon://app/v1/open\\',
      'simeon://app/v1/open?x=1',
      'simeon://app/v1/%6Fpen',
      'simeon://app/v1/./open',
      'simeon://app/v1/../open',
      'simeon://APP/v1/open',
      'simeon://other/v1/open',
      'simeon://user@app/v1/open',
      'simeon://app:80/v1/open',
      'simeon://app/v1/open?%zz',
      'simeon://app/v1/plugin/add',
      'simeon://app/v1/plugin/add?id=',
      'simeon://app/v1/plugin/add?id=abc',
      'simeon://app/v1/plugin/add?id=12345678901234567890',
      'simeon://app/v1/plugin/add?id=1&id=2',
      'simeon://app/v1/plugin/add?id=1&x=2',
      'simeon://app/v1/plugin/add?id=42&=',
      'simeon://app/v1/info',
      'simeon://app/v1/info?topic=other',
      'simeon://app/v1/info?topic=deep-links&topic=deep-links',
      'https://evil.example/sand/link/v1/open',
      'https://app.simeonlabs.com/v1/open',
      'simeon://app/v1/op en',
      'simeon://app/v1/opén',
      `simeon://app/v1/${'a'.repeat(2_100)}`,
    ])
      expect(parseDeepLink(raw, schemes), raw).toBeUndefined()
  })

  it('writes each link the one way (canonical)', () => {
    expect(
      canonicalDeepLink({ route: { kind: 'open' }, source: 'https' }, 'simeon'),
    ).toBe('simeon://app/v1/open')
    expect(
      canonicalDeepLink(
        { route: { kind: 'pluginAdd', id: '42' }, source: 'scheme' },
        'simeon-mac',
      ),
    ).toBe('simeon-mac://app/v1/plugin/add?id=42')
    expect(
      canonicalDeepLink(
        { route: { kind: 'info', topic: 'deep-links' }, source: 'scheme' },
        'simeon',
      ),
    ).toBe('simeon://app/v1/info?topic=deep-links')
    expect(
      canonicalDeepLink(
        { route: { kind: 'packAdd', id: 'coffee-shop' }, source: 'https' },
        'simeon',
      ),
    ).toBe('simeon://app/v1/pack/add?id=coffee-shop')
  })

  /** The website's Add to Simeon (`sites/simeonlabs.com/source/teams.py`): a pack's id, and nothing else. */
  it('reads a starter pack’s link', () => {
    expect(route('simeon://app/v1/pack/add?id=coffee-shop')).toEqual({
      kind: 'packAdd',
      id: 'coffee-shop',
    })
    expect(
      route('https://app.simeonlabs.com/sand/link/v1/pack/add?id=law-firms'),
    ).toEqual({ kind: 'packAdd', id: 'law-firms' })
    for (const raw of [
      'simeon://app/v1/pack/add',
      'simeon://app/v1/pack/add?id=',
      'simeon://app/v1/pack/add?id=Coffee',
      'simeon://app/v1/pack/add?id=coffee_shop',
      'simeon://app/v1/pack/add?id=a&id=b',
      'simeon://app/v1/pack/add?id=a&x=1',
      `simeon://app/v1/pack/add?id=${'a'.repeat(65)}`,
      'simeon://app/v1/pack?id=coffee-shop',
    ])
      expect(parseDeepLink(raw, schemes), raw).toBeUndefined()
  })

  it('answers only to the Windows app’s own scheme by default', () => {
    expect(parseDeepLink('simeon://app/v1/open')?.route).toEqual({
      kind: 'open',
    })
    expect(parseDeepLink('simeon-mac://app/v1/open')).toBeUndefined()
  })
})

describe('a sign-in coming back to the app (AppReturnSignInTests, Connecting.failed)', () => {
  it('reads the answer the server sends back', () => {
    expect(
      appReturnAnswer(
        'simeon-ios://mcp-oauth?state=vendor-stripe-Ab_9&code=c%2F1',
        'simeon-ios',
      ),
    ).toEqual({ state: 'vendor-stripe-Ab_9', code: 'c/1' })
    expect(
      appReturnAnswer(
        'simeon://mcp-oauth?state=s&error=access_denied&error_description=The+user+said+no',
      ),
    ).toEqual({
      state: 's',
      error: 'access_denied',
      errorDescription: 'The user said no',
    })
    // The billing page's way back, a sign-in's "connected", no state, another scheme: not a sign-in's answer.
    expect(appReturnAnswer('simeon://billing-done')).toBeUndefined()
    expect(appReturnAnswer('simeon://connected?status=ok')).toBeUndefined()
    expect(appReturnAnswer('simeon://mcp-oauth?code=c')).toBeUndefined()
    expect(appReturnAnswer('simeon://app/v1/open')).toBeUndefined()
    expect(appReturnAnswer('simeon-ios://mcp-oauth?state=s&code=c')).toBe(
      undefined,
    )
    expect(appReturnAnswer('not a link')).toBeUndefined()
  })

  it('reads the server’s last page back on the app’s address, and whether it failed', () => {
    expect(connectedReturn('simeon://connected')).toEqual({ failed: false })
    expect(connectedReturn('simeon://connected?status=failed')).toEqual({
      failed: true,
    })
    expect(connectedReturn('simeon://connected?status=ERROR')).toEqual({
      failed: true,
    })
    expect(connectedReturn('simeon://connected?status=ok')).toEqual({
      failed: false,
    })
    expect(connectedReturn('simeon://app/v1/open')).toBeUndefined()
    expect(connectedReturn('simeon-ios://connected')).toBeUndefined()
  })
})

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appFile, contentType } from '../src/main/appProtocol'
import { apiBaseFrom, defaultAPI, factsArgument, factsFlag, factsFor } from '../src/main/facts'
import { KeptValues, type Sealer, isKeptKey } from '../src/main/kept'
import { linksIn } from '../src/main/links'
import { allowsPermission, contentSecurityPolicy, opensOutside } from '../src/main/policy'

// window.ts and bridge.ts import Electron; their pure parts are checked by `npm run smoke`.

const root = path.resolve('/srv/app-next')

describe('the app address', () => {
  it('names files inside the build', () => {
    expect(appFile(root, 'app://simeon/app-next/')).toBe(path.join(root, 'index.html'))
    expect(appFile(root, 'app://simeon/app-next/index.html')).toBe(path.join(root, 'index.html'))
    expect(appFile(root, 'app://simeon/app-next/assets/index-1.js')).toBe(
      path.join(root, 'assets', 'index-1.js'),
    )
    expect(appFile(root, 'app://simeon/app-next/fonts/a%20b.ttf?x=1#y')).toBe(
      path.join(root, 'fonts', 'a b.ttf'),
    )
  })

  it('names nothing outside it', () => {
    for (const address of [
      'app://simeon/',
      'app://simeon/package.json',
      'app://simeon/app-nextx/index.html',
      'app://other/app-next/index.html',
      'https://simeon/app-next/index.html',
      'app://simeon/app-next/%2e%2e/secret',
      'app://simeon/app-next/a/%2E%2E/%2E%2E/secret',
      'app://simeon/app-next/..%2fsecret',
      'app://simeon/app-next/a%5c..%5csecret',
      'app://simeon/app-next/a%00b',
      'app://simeon/app-next/%E0%A4%A',
      'not a url',
    ])
      expect(appFile(root, address), address).toBeUndefined()
  })

  it('serves each kind of file as what it is', () => {
    expect(contentType('index.html')).toBe('text/html; charset=utf-8')
    expect(contentType('a.MJS')).toBe('text/javascript; charset=utf-8')
    expect(contentType('logo.svg')).toBe('image/svg+xml')
    expect(contentType('LICENSE-2.0')).toBe('text/plain; charset=utf-8')
  })
})

describe('the policy', () => {
  it('is the website’s, with the real server', () => {
    const policy = contentSecurityPolicy('https://api.simeonlabs.com')
    expect(policy).toContain(
      "connect-src 'self' blob: https://api.simeonlabs.com wss://api.simeonlabs.com https://*.elevenlabs.io wss://*.elevenlabs.io",
    )
    expect(policy).toContain("script-src 'self' blob:")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain('upgrade-insecure-requests')
    expect(policy).not.toContain('unsafe-eval')
  })

  it('reaches a stand-in on this computer as it is', () => {
    const policy = contentSecurityPolicy('http://127.0.0.1:4310')
    expect(policy).toContain('http://127.0.0.1:4310 ws://127.0.0.1:4310')
    expect(policy).not.toContain('upgrade-insecure-requests')
  })

  it('hands the default browser only the Mac’s kinds of address', () => {
    for (const ok of [
      'https://simeonlabs.com/privacy',
      'http://example.com',
      'mailto:bass@simeonlabs.com',
      'tel:+33100000000',
      'obsidian://open?vault=a',
    ])
      expect(opensOutside(ok), ok).toBe(true)
    for (const no of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-settings:privacy',
      'app://simeon/app-next/',
      'smb://server/share',
      'https://',
      'nonsense',
    ])
      expect(opensOutside(no), no).toBe(false)
  })

  it('lets only the app’s page have the microphone, the clipboard and full screen', () => {
    expect(allowsPermission('media', true, { mediaTypes: ['audio'] })).toBe(true)
    expect(allowsPermission('media', true, { mediaTypes: ['audio', 'video'] })).toBe(false)
    expect(allowsPermission('media', true, { mediaTypes: [] })).toBe(false)
    expect(allowsPermission('media', false, { mediaTypes: ['audio'] })).toBe(false)
    expect(allowsPermission('clipboard-read', true)).toBe(true)
    expect(allowsPermission('fullscreen', true)).toBe(true)
    for (const no of ['geolocation', 'notifications', 'openExternal', 'hid', 'usb', 'serial'])
      expect(allowsPermission(no, true), no).toBe(false)
  })
})

describe('the facts', () => {
  it('follows --api= or SIMEON_API only to this computer or Simeon Labs over https', () => {
    expect(apiBaseFrom([], {})).toBe(defaultAPI)
    expect(apiBaseFrom(['--api=http://127.0.0.1:8000'], {})).toBe('http://127.0.0.1:8000')
    expect(apiBaseFrom(['--api=http://localhost:9/fake/'], {})).toBe('http://localhost:9/fake')
    expect(apiBaseFrom([], { SIMEON_API: 'https://staging.simeonlabs.com' })).toBe(
      'https://staging.simeonlabs.com',
    )
    for (const no of [
      'http://api.simeonlabs.com',
      'https://simeonlabs.com.evil.example',
      'https://evil.example',
      'file:///etc',
      'https://user:pw@api.simeonlabs.com',
      'https://api.simeonlabs.com/?x=1',
      'nonsense',
    ])
      expect(apiBaseFrom([`--api=${no}`], {}), no).toBe(defaultAPI)
  })

  it('hands the page only the settings it reads', () => {
    const facts = factsFor(
      {
        version: '0.1.0',
        build: '12',
        osVersion: '10.0.26100',
        platform: 'win32',
        systemLanguages: ['fr-FR', 'en-US'],
        argv: [],
        env: { SIMEON_VOICE_CALLS: '1', AWS_SECRET_ACCESS_KEY: 'never', PATH: 'x' },
      },
      'main',
    )
    expect(facts.env).toEqual({ SIMEON_VOICE_CALLS: '1' })
    expect(facts.track).toBe('stable')
    expect(facts.window).toBe('main')
    const argument = factsArgument(facts)
    expect(argument.startsWith(factsFlag)).toBe(true)
    expect(
      JSON.parse(Buffer.from(argument.slice(factsFlag.length), 'base64').toString('utf8')),
    ).toEqual(facts)
  })
})

describe('links on the command line', () => {
  it('finds simeon:// links, nothing else, none too long', () => {
    expect(
      linksIn([
        'C:\\Simeon\\Simeon.exe',
        '--allow-file-access',
        'simeon://app/v1/pack/add?id=growth',
        'SIMEON://app/v1/open',
        'https://simeonlabs.com',
        `simeon://app/v1/open?x=${'a'.repeat(2_100)}`,
      ]),
    ).toEqual(['simeon://app/v1/pack/add?id=growth', 'SIMEON://app/v1/open'])
  })
})

describe('the kept values', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })
  const folder = () => {
    const made = mkdtempSync(path.join(os.tmpdir(), 'kept-'))
    folders.push(made)
    return path.join(made, 'kept')
  }
  // A stand-in for Windows' protection: reversible, never the plain text.
  const sealer: Sealer = {
    available: () => true,
    seal: (text) => Buffer.from(`sealed:${Buffer.from(text).toString('base64')}`),
    open: (sealed) => {
      const raw = sealed.toString()
      if (!raw.startsWith('sealed:')) throw new Error('not ours')
      return Buffer.from(raw.slice(7), 'base64').toString()
    },
  }

  it('keeps each value sealed in a file of its own, and forgets it', () => {
    const where = folder()
    const kept = new KeptValues(where, sealer)
    kept.write('simeon.web.tokens', '{"accessToken":"a"}')
    kept.write('simeon.web.gateway', 'g')
    expect(readdirSync(where).sort()).toEqual([
      'simeon.web.gateway.sealed',
      'simeon.web.tokens.sealed',
    ])
    expect(readFileSync(path.join(where, 'simeon.web.tokens.sealed'), 'utf8')).not.toContain(
      'accessToken',
    )
    expect(new KeptValues(where, sealer).readAll()).toEqual({
      'simeon.web.tokens': '{"accessToken":"a"}',
      'simeon.web.gateway': 'g',
    })
    kept.write('simeon.web.gateway', null)
    expect(new KeptValues(where, sealer).readAll()).toEqual({
      'simeon.web.tokens': '{"accessToken":"a"}',
    })
  })

  it('drops a file that no longer opens', () => {
    const where = folder()
    new KeptValues(where, sealer).write('simeon.web.tokens', 't')
    writeFileSync(path.join(where, 'simeon.web.tokens.sealed'), 'damaged')
    expect(new KeptValues(where, sealer).readAll()).toEqual({})
    expect(readdirSync(where)).toEqual([])
  })

  it('writes nothing when nothing can seal, and keeps the values until the app quits', () => {
    const where = folder()
    const kept = new KeptValues(where, { ...sealer, available: () => false })
    kept.write('simeon.web.tokens', 't')
    expect(kept.readAll()).toEqual({ 'simeon.web.tokens': 't' })
    expect(() => readdirSync(where)).toThrow()
  })

  it('knows only the two keys', () => {
    expect(isKeptKey('simeon.web.tokens')).toBe(true)
    expect(isKeptKey('simeon.theme')).toBe(false)
    expect(isKeptKey(undefined)).toBe(false)
  })
})

// Step 7d's guards, after the independent review of 2 November 2026
// (SCRATCH/review-7d.md): where 1Password's tool may be taken from (B1),
// Windows Hello never unlocking on a wait or an error (B2), the loopback
// "busy" when its IPv6 address is taken (S1), the loopback let go when its
// page goes (S3), what Stripe's window may hand the default browser (S4),
// and the vault's id (nit 7).

import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { opensFromBilling, pressWindowMs } from '../src/main/outside/billing'
import { Hello, type PowerShellRun, helloAnswer, helloScript } from '../src/main/outside/hello'
import { pageLeaves } from '../src/main/outside/leaving'
import { LoopbackCatcher, type Bind } from '../src/main/outside/loopback'
import { LoopbackSlot } from '../src/main/outside/loopbackSlot'
import { connectAccount, findTool, isVaultId, toolPlaces } from '../src/main/outside/onePassword'

describe('1Password’s tool, only from folders another account can’t make (B1)', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\sam',
    ProgramData: 'C:\\ProgramData',
    Path: 'C:\\Tools\\1Password;.;',
  }

  it('never looks in ProgramData, which any account may write to', () => {
    expect(toolPlaces(env).some((place) => place.toLowerCase().startsWith('c:\\programdata'))).toBe(false)
    // A planted op.exe there and the real one on PATH: PATH's.
    const planted = 'C:\\ProgramData\\chocolatey\\bin\\op.exe'
    const real = 'C:\\Tools\\1Password\\op.exe'
    expect(findTool('win32', env, (file) => file === planted || file === real)).toBe(real)
  })

  it('looks in both Program Files folders first, then the person’s own, then PATH, never the current folder', () => {
    expect(toolPlaces(env)).toEqual([
      'C:\\Program Files\\1Password CLI\\op.exe',
      'C:\\Program Files (x86)\\1Password CLI\\op.exe',
      'C:\\Users\\sam\\AppData\\Local\\Microsoft\\WinGet\\Links\\op.exe',
      'C:\\Users\\sam\\scoop\\shims\\op.exe',
    ])
    const looked: string[] = []
    findTool('win32', env, (file) => (looked.push(file), false))
    expect(looked.at(-1)).toBe('C:\\Tools\\1Password\\op.exe')
    expect(looked.some((file) => !/^[A-Z]:\\/.test(file))).toBe(false)
  })
})

describe('Windows Hello never unlocks on a wait or an error (B2)', () => {
  it('says the script is asking before it asks', () => {
    const asking = helloScript.indexOf("Write-Output 'asking'")
    expect(asking).toBeGreaterThan(helloScript.indexOf('CheckAvailabilityAsync'))
    expect(asking).toBeLessThan(helloScript.indexOf('RequestVerificationAsync'))
  })

  it('is unavailable only when Hello said so before asking, or PowerShell never started', () => {
    expect(helloAnswer({ output: 'unavailable:NotConfiguredForUser\r\n', ended: 'exited' })).toBe('unavailable')
    expect(helloAnswer({ output: 'unavailable:error\r\n', ended: 'exited' })).toBe('unavailable')
    expect(helloAnswer({ output: '', ended: 'notStarted' })).toBe('unavailable')
  })

  it('is cancelled once it may have asked: a timeout, a killed PowerShell, an error, an unknown answer', () => {
    expect(helloAnswer({ output: 'asking\r\nresult:Verified\r\n', ended: 'exited' })).toBe('confirmed')
    for (const run of [
      { output: 'asking\r\n', ended: 'timedOut' },
      { output: '', ended: 'timedOut' },
      { output: '', ended: 'exited' },
      { output: 'asking\r\n', ended: 'exited' },
      { output: 'asking\r\nunavailable:error\r\n', ended: 'exited' },
      { output: 'asking\r\nresult:Unknown\r\n', ended: 'exited' },
      { output: 'garbage', ended: 'exited' },
      { output: 'unavailable:DeviceNotPresent\r\n', ended: 'timedOut' },
    ] as PowerShellRun[])
      expect(helloAnswer(run), JSON.stringify(run)).toBe('cancelled')
  })

  it('answers cancelled when PowerShell runs out of time or is ended', async () => {
    const timedOut = new Hello('win32', {}, async () => ({ output: 'asking\r\n', ended: 'timedOut' }))
    expect(await timedOut.confirm('Show the password for GitHub')).toBe('cancelled')
    const killed = new Hello('win32', {}, async () => ({ output: '', ended: 'exited' }))
    expect(await killed.confirm('Show the password for GitHub')).toBe('cancelled')
  })
})

/** A bind that gives the test's own answer per address. */
function binds(answers: Record<string, string | 'ok'>): { bind: Bind; closed: string[] } {
  const closed: string[] = []
  return {
    closed,
    bind: async (_port, host) => {
      const answer = answers[host] ?? 'ok'
      if (answer !== 'ok') return { error: answer }
      const server = net.createServer()
      server.close = (() => {
        closed.push(host)
        return server
      }) as typeof server.close
      return { server }
    },
  }
}

describe('the loopback is busy when its IPv6 address is taken (S1)', () => {
  it('starts on IPv4 alone only when this PC has no IPv6', async () => {
    for (const code of ['EADDRNOTAVAIL', 'EAFNOSUPPORT']) {
      const { bind, closed } = binds({ '::1': code })
      const catcher = await LoopbackCatcher.start('s', () => {}, { bind, retryMs: 0 })
      expect(catcher, code).toBeDefined()
      catcher?.stop()
      expect(closed).toEqual(['127.0.0.1'])
    }
  })

  it('is busy when another program holds [::1]:8787, and lets go of IPv4', async () => {
    for (const code of ['EADDRINUSE', 'EACCES']) {
      const { bind, closed } = binds({ '::1': code })
      expect(await LoopbackCatcher.start('s', () => {}, { bind, retryMs: 0 }), code).toBeUndefined()
      // Each of the five tries let go of the IPv4 address it had.
      expect(closed).toEqual(Array(5).fill('127.0.0.1'))
    }
  })
})

describe('the loopback let go when its page goes (S3)', () => {
  const page = () => ({ id: Math.random() })

  it('lets go when the page that asked reloads or goes, and on a newer sign-in', async () => {
    const stopped: string[] = []
    const start = async (state: string) => ({ state, stop: () => stopped.push(state) })
    const slot = new LoopbackSlot(start, 60_000)
    const first = page()
    expect(await slot.catch(first, 'a')).toBe(true)
    expect(await slot.catch(first, 'b')).toBe(true)
    expect(stopped).toEqual(['a'])
    slot.left(page())
    expect(stopped).toEqual(['a'])
    slot.left(first)
    expect(stopped).toEqual(['a', 'b'])
    expect(slot.holding).toBe(false)
  })

  it('lets go after its longest wait, and only its own state on stop', async () => {
    const stopped: string[] = []
    const slot = new LoopbackSlot(async (state) => ({ state, stop: () => stopped.push(state) }), 20)
    await slot.catch(page(), 'a')
    slot.stop('other')
    expect(stopped).toEqual([])
    await new Promise((done) => setTimeout(done, 40))
    expect(stopped).toEqual(['a'])
  })

  it('keeps the newest when two ask at once', async () => {
    const stopped: string[] = []
    let open!: () => void
    const slow = new Promise<void>((done) => (open = done))
    const slot = new LoopbackSlot(async (state) => {
      if (state === 'a') await slow
      return { state, stop: () => stopped.push(state) }
    }, 60_000)
    const first = slot.catch(page(), 'a')
    expect(await slot.catch(page(), 'b')).toBe(true)
    open()
    expect(await first).toBe(false)
    expect(stopped).toEqual(['a'])
    expect(slot.holding).toBe(true)
  })
})

describe('the page leaves only for the app’s own address (S3)', () => {
  const start = (url: string, more: Partial<{ isMainFrame: boolean; isSameDocument: boolean }> = {}) => ({
    url,
    isMainFrame: true,
    isSameDocument: false,
    ...more,
  })

  it('a reload, or another of the app’s addresses: the page goes', () => {
    expect(pageLeaves(start('app://simeon/app-next/'))).toBe(true)
    expect(pageLeaves(start('app://simeon/app-next/?first-run'))).toBe(true)
  })

  it('a link to another site the window refuses (it starts a navigation first), a frame, the same page: it stays', () => {
    for (const url of ['https://stripe.com/', 'http://127.0.0.1:8787/callback', 'simeon://app/v1/open', 'app://simeon/other/', 'about:blank'])
      expect(pageLeaves(start(url)), url).toBe(false)
    expect(pageLeaves(start('app://simeon/app-next/', { isMainFrame: false }))).toBe(false)
    expect(pageLeaves(start('app://simeon/app-next/#chat', { isSameDocument: true }))).toBe(false)
  })
})

describe('what Stripe’s window may hand the default browser (S4)', () => {
  it('only https, only just after the person pressed something in it', () => {
    const now = 100_000
    expect(opensFromBilling('https://stripe.com/privacy', now - 200, now)).toBe(true)
    expect(opensFromBilling('https://stripe.com/privacy', now - pressWindowMs - 1, now)).toBe(false)
    expect(opensFromBilling('https://stripe.com/privacy', undefined, now)).toBe(false)
    for (const url of ['http://stripe.com/', 'obsidian://open?vault=x', 'tel:+15551234', 'mailto:a@b.c', 'simeon://app/v1/open', 'file:///C:/'])
      expect(opensFromBilling(url, now - 10, now), url).toBe(false)
  })
})

describe('the vault’s id as 1Password writes it (nit 7)', () => {
  it('is 26 letters and digits, so it can never widen the grant', async () => {
    expect(isVaultId('abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(isVaultId('0123456789abcdefghijklmnop')).toBe(true)
    for (const id of ['v1', 'abcdefghijklmnopqrstuvwxy:', 'abcdefghijklmnopqrstuvwx,y', '-bcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'])
      expect(isVaultId(id), id).toBe(false)
    const run = async (args: string[]) =>
      args[1] === 'list'
        ? { ok: true as const, out: JSON.stringify([{ id: 'x,y:all', name: 'Shared with Simeon' }]) }
        : { ok: true as const, out: 'ops_fake_key_for_the_test_only_0123456789' }
    expect(await connectAccount(run, { id: 'A1', email: '', url: '' })).toEqual({ failure: 'noVault' })
  })
})

// Step 7d's main process, its own logic (Electron itself is checked by the
// part's run of the app): the links held for the page, the loopback
// listener (the core's LoopbackSignInTests, and a real listener on this
// computer's loopback), Stripe's window's rules, Windows Hello's script and
// its answers, 1Password's command-line tool (MacOnePassword.swift's
// arguments and flow).

import { spawnSync } from 'node:child_process'
import { createServer, connect } from 'node:net'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { billingBounds, billingStep, opensBilling } from '../src/main/outside/billing'
import {
  Hello,
  type RunPowerShell,
  encodedScript,
  helloAnswer,
  helloScript,
  reasonVariable,
  windowsPowerShell,
} from '../src/main/outside/hello'
import { LinkPost, heldAtMost } from '../src/main/outside/links'
import {
  LoopbackCatcher,
  answerFrom,
  loopbackFinish,
  loopbackPath,
  loopbackPort,
  notFound,
  redirect,
} from '../src/main/outside/loopback'
import {
  OnePassword,
  type RunTool,
  type ToolRun,
  complaint,
  connectAccount,
  findTool,
  isAccountId,
  listAccounts,
  toolEnvironment,
  toolPlaces,
} from '../src/main/outside/onePassword'

describe('the links held for the page (LinkPost)', () => {
  it('holds links until the page takes them, then sends them as they come', () => {
    const post = new LinkPost()
    post.arrive('simeon://app/v1/open')
    post.arrive('simeon://app/v1/pack/add?id=coffee-shop')
    const sent: string[] = []
    const page = { alive: true, send: (url: string) => sent.push(url) }
    expect(post.take(page)).toEqual(['simeon://app/v1/open', 'simeon://app/v1/pack/add?id=coffee-shop'])
    expect(post.take(page)).toEqual([])
    post.arrive('simeon://app/v1/info?topic=deep-links')
    expect(sent).toEqual(['simeon://app/v1/info?topic=deep-links'])
  })

  it('holds them again while the page reloads or is gone, the newest kept', () => {
    const post = new LinkPost()
    const sent: string[] = []
    const page = { alive: true, send: (url: string) => sent.push(url) }
    post.take(page)
    post.left(page)
    post.arrive('simeon://app/v1/open')
    expect(sent).toEqual([])
    const dead = { alive: false, send: (url: string) => sent.push(url) }
    expect(post.take(dead)).toEqual(['simeon://app/v1/open'])
    for (let i = 0; i < heldAtMost + 5; i += 1) post.arrive(`simeon://app/v1/plugin/add?id=${i}`)
    expect(sent).toEqual([])
    const held = post.take(page)
    expect(held).toHaveLength(heldAtMost)
    expect(held.at(-1)).toBe(`simeon://app/v1/plugin/add?id=${heldAtMost + 4}`)
  })
})

describe('the loopback sign-in (LoopbackSignInTests)', () => {
  it('reads the callback from the request’s head', () => {
    const head = 'GET /callback?code=c%2F1&state=vendor-canva-Zz9_ HTTP/1.1\r\nHost: localhost:8787\r\nUser-Agent: Edge\r\n\r\n'
    expect(answerFrom(head)).toEqual({ state: 'vendor-canva-Zz9_', code: 'c/1' })
    const refused = 'GET /callback?error=access_denied&error_description=The+user+said+no&state=s HTTP/1.1\r\n\r\n'
    expect(answerFrom(refused)).toEqual({
      state: 's',
      error: 'access_denied',
      errorDescription: 'The user said no',
    })
    // The favicon, another path, a POST, no state, or half a line: not the callback.
    for (const other of [
      'GET /favicon.ico HTTP/1.1\r\n\r\n',
      'POST /callback?code=c&state=s HTTP/1.1\r\n\r\n',
      'GET /callback?code=c HTTP/1.1\r\n\r\n',
      'GET http://evil.example/callback?state=s HTTP/1.1\r\n\r\n',
      'GET /callbackx?state=s HTTP/1.1\r\n\r\n',
      'GET',
      '',
    ])
      expect(answerFrom(other), other).toBeUndefined()
  })

  it('sends the page on to the app’s own address, and refuses the rest', () => {
    const text = redirect('simeon://connected').toString()
    expect(text.startsWith('HTTP/1.1 302 Found\r\n')).toBe(true)
    expect(text).toContain('\r\nLocation: simeon://connected\r\n')
    expect(text).toContain('\r\nCache-Control: no-store\r\n')
    expect(text.endsWith('\r\n\r\n')).toBe(true)
    expect(notFound.toString().startsWith('HTTP/1.1 404')).toBe(true)
  })

  it('listens where the computer asks the makers to send it', () => {
    expect(`http://localhost:${loopbackPort}${loopbackPath}`).toBe('http://localhost:8787/callback')
    expect(loopbackFinish).toBe('simeon://connected')
  })
})

/** A free port on this computer's loopback, for a listener of the test's own. */
async function freePort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      server.close(() => done(port))
    })
  })
}

/** One raw request to the listener, its answer as text. */
function ask(port: number, head: string): Promise<string> {
  return new Promise((done, failed) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(head))
    let answer = ''
    socket.on('data', (data) => (answer += data.toString()))
    socket.on('end', () => done(answer))
    socket.on('error', failed)
  })
}

describe('the loopback listener (LoopbackCatcher), for real on this computer', () => {
  it('answers this sign-in’s callback once, refuses the rest, and stops', async () => {
    const port = await freePort()
    const caught: unknown[] = []
    const catcher = await LoopbackCatcher.start('vendor-canva-1', (answer) => caught.push(answer), {
      port,
      hosts: ['127.0.0.1'],
    })
    expect(catcher).toBeDefined()
    expect(await ask(port, 'GET /favicon.ico HTTP/1.1\r\n\r\n')).toMatch(/^HTTP\/1\.1 404/)
    expect(await ask(port, 'GET /callback?state=other&code=x HTTP/1.1\r\n\r\n')).toMatch(/^HTTP\/1\.1 404/)
    const first = await ask(port, 'GET /callback?code=abc&state=vendor-canva-1 HTTP/1.1\r\nHost: localhost\r\n\r\n')
    expect(first).toMatch(/^HTTP\/1\.1 302 Found\r\n/)
    expect(first).toContain('Location: simeon://connected')
    expect(caught).toEqual([{ state: 'vendor-canva-1', code: 'abc' }])
    // Once.
    expect(await ask(port, 'GET /callback?code=abc&state=vendor-canva-1 HTTP/1.1\r\n\r\n')).toMatch(/^HTTP\/1\.1 404/)
    expect(caught).toHaveLength(1)
    catcher!.stop()
    await new Promise((done) => setTimeout(done, 50))
    await expect(ask(port, 'GET / HTTP/1.1\r\n\r\n')).rejects.toThrow()
  })

  it('reads a head that comes in pieces', async () => {
    const port = await freePort()
    const caught: unknown[] = []
    const catcher = await LoopbackCatcher.start('s', (answer) => caught.push(answer), { port, hosts: ['127.0.0.1'] })
    const answer = await new Promise<string>((done) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('GET /callback?state=s')
        setTimeout(() => socket.write('&code=c HTTP/1.1\r\n\r\n'), 30)
      })
      let text = ''
      socket.on('data', (data) => (text += data.toString()))
      socket.on('end', () => done(text))
    })
    expect(answer).toContain('302 Found')
    expect(caught).toEqual([{ state: 's', code: 'c' }])
    catcher!.stop()
  })

  it('says the address is taken, after about a second of tries', async () => {
    const port = await freePort()
    const other = createServer()
    await new Promise<void>((done) => other.listen(port, '127.0.0.1', () => done()))
    const started = Date.now()
    const catcher = await LoopbackCatcher.start('s', () => {}, { port, hosts: ['127.0.0.1'] })
    expect(catcher).toBeUndefined()
    expect(Date.now() - started).toBeGreaterThanOrEqual(900)
    await new Promise<void>((done) => other.close(() => done()))
  })
})

describe('Stripe’s window (MacBillingPage)', () => {
  const api = 'https://api.simeonlabs.com'
  it('opens only an https page', () => {
    expect(opensBilling('https://billing.stripe.com/p/session/x')).toBe(true)
    for (const url of ['http://billing.stripe.com/p', 'simeon://app/v1/open', 'javascript:alert(1)', 'file:///etc/hosts', 'https://user:pw@billing.stripe.com/', 'not a url'])
      expect(opensBilling(url), url).toBe(false)
  })

  it('goes on inside to https pages, comes back on the app’s own link, refuses the rest', () => {
    expect(billingStep('https://checkout.stripe.com/c/pay/x', api)).toBe('go')
    expect(billingStep('https://hooks.stripe.com/3d_secure/x', api)).toBe('go')
    expect(billingStep('https://api.simeonlabs.com/desktop/billing/back?to=simeon', api)).toBe('go')
    expect(billingStep('simeon://app/v1/open', api)).toBe('back')
    expect(billingStep('SIMEON://app/v1/open', api)).toBe('back')
    for (const url of ['http://evil.example/', 'file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,hi', 'app://simeon/app-next/', 'simeon-ios://app/v1/open'])
      expect(billingStep(url, api), url).toBe('refuse')
    // A server on this computer (the checks' stand-in): its own return page.
    expect(billingStep('http://127.0.0.1:8000/desktop/billing/back?to=simeon', 'http://127.0.0.1:8000')).toBe('go')
    expect(billingStep('http://127.0.0.1:9000/x', 'http://127.0.0.1:8000')).toBe('refuse')
  })

  it('is 960 × 760 at most, inside the screen, over the app’s window', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(billingBounds({ x: 100, y: 100, width: 1040, height: 760 }, area)).toEqual({ x: 140, y: 100, width: 960, height: 760 })
    // A small screen: smaller, never off it.
    const small = billingBounds({ x: 0, y: 0, width: 800, height: 600 }, { x: 0, y: 0, width: 800, height: 600 })
    expect(small).toEqual({ x: 24, y: 24, width: 752, height: 552 })
    // A window near the edge: kept on the screen.
    expect(billingBounds({ x: 1800, y: 900, width: 512, height: 520 }, area)).toEqual({ x: 960, y: 280, width: 960, height: 760 })
  })
})

describe('Windows Hello (PurchaseApproval.confirm)', () => {
  it('reads Hello’s answers', () => {
    const asked = (result: string) => helloAnswer({ output: `asking\r\nresult:${result}\r\n`, ended: 'exited' })
    expect(asked('Verified')).toBe('confirmed')
    // Once it asked, every other answer is a no (the guard's own answers too).
    for (const result of ['Canceled', 'RetriesExhausted', 'DeviceBusy', 'DeviceNotPresent', 'NotConfiguredForUser', 'DisabledByPolicy'])
      expect(asked(result), result).toBe('cancelled')
    // Known before asking: the window's alert may ask instead.
    for (const why of ['DeviceNotPresent', 'NotConfiguredForUser', 'DisabledByPolicy', 'DeviceBusy', 'error'])
      expect(helloAnswer({ output: `unavailable:${why}\r\n`, ended: 'exited' }), why).toBe('unavailable')
    // A Verified with no ask before it is no answer of Hello's.
    expect(helloAnswer({ output: 'garbage\nresult:Verified', ended: 'exited' })).toBe('cancelled')
  })

  it('carries the reason in the environment, never in the script or on the command line', async () => {
    const runs: { file: string; args: string[]; env: Record<string, string> }[] = []
    const run: RunPowerShell = async (file, args, env) => {
      runs.push({ file, args, env })
      return { output: 'asking\r\nresult:Verified\r\n', ended: 'exited' }
    }
    const reason = "Approve $2.47 at gumroad.com'; Remove-Item C:\\ -Recurse; '"
    const hello = new Hello('win32', { SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows' }, run)
    expect(await hello.confirm(reason)).toBe('confirmed')
    const [one] = runs
    expect(one?.file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(one?.env[reasonVariable]).toBe(reason)
    expect(one?.args.join(' ')).not.toContain('gumroad')
    expect(one?.args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand']))
    const encoded = one?.args.at(-1) ?? ''
    const script = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(script).toBe(helloScript)
    expect(script).not.toContain('gumroad')
    expect(script).toContain(`$env:${reasonVariable}`)
    expect(script).toContain('IAsyncOperation`1')
    expect(script).toContain('UserConsentVerifier]::RequestVerificationAsync($reason)')
  })

  it('is not there off Windows, asks one at a time, and is unavailable when PowerShell can’t start', async () => {
    expect(await new Hello('linux', {}).confirm('x')).toBe('unavailable')
    let finish!: (run: { output: string; ended: 'exited' }) => void
    const slow = new Hello('win32', {}, () => new Promise((done) => (finish = done)))
    const first = slow.confirm('x')
    expect(await slow.confirm('y')).toBe('cancelled')
    finish({ output: 'asking\r\nresult:Canceled\r\n', ended: 'exited' })
    expect(await first).toBe('cancelled')
    expect(await new Hello('win32', {}, async () => ({ output: '', ended: 'notStarted' })).confirm('x')).toBe('unavailable')
    // A runner that throws: nothing unlocks.
    expect(await new Hello('win32', {}, async () => Promise.reject(new Error('x'))).confirm('x')).toBe('cancelled')
    expect(windowsPowerShell({})).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(windowsPowerShell({ SystemRoot: 'D:\\Win' })).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(encodedScript('a')).toBe(Buffer.from('a', 'utf16le').toString('base64'))
  })

  // PowerShell itself reads the script (PowerShell 7 for Linux in the checks: put its folder on PATH). Windows PowerShell 5.1, which runs it, can't run here.
  const pwsh = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', 'exit 0']).status === 0
  it.skipIf(!pwsh)('is a script PowerShell reads without a fault', () => {
    const check = `$errors = $null; $null = [System.Management.Automation.Language.Parser]::ParseInput([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedScript()}')), [ref] $null, [ref] $errors); $errors.Count`
    const out = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', check], { encoding: 'utf8' })
    expect(out.stdout.trim()).toBe('0')
  })
})

describe('1Password’s command-line tool (MacOnePassword)', () => {
  const windowsEnv = {
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\sam',
    ProgramData: 'C:\\ProgramData',
    Path: 'C:\\Windows\\System32;.;relative\\bin;"C:\\Tools\\1Password";',
  }

  it('is found in Windows’ usual places first, then on PATH, never in a relative folder', () => {
    expect(toolPlaces(windowsEnv)).toEqual([
      'C:\\Program Files\\1Password CLI\\op.exe',
      'C:\\Users\\sam\\AppData\\Local\\Microsoft\\WinGet\\Links\\op.exe',
      'C:\\Users\\sam\\scoop\\shims\\op.exe',
    ])
    const looked: string[] = []
    expect(findTool('win32', windowsEnv, (file) => (looked.push(file), false))).toBeUndefined()
    expect(looked.slice(3)).toEqual(['C:\\Windows\\System32\\op.exe', 'C:\\Tools\\1Password\\op.exe'])
    expect(findTool('win32', windowsEnv, (file) => file.startsWith('C:\\Tools'))).toBe('C:\\Tools\\1Password\\op.exe')
    expect(findTool('win32', windowsEnv, (file) => file.includes('WinGet') || file.startsWith('C:\\Tools'))).toBe(
      'C:\\Users\\sam\\AppData\\Local\\Microsoft\\WinGet\\Links\\op.exe',
    )
    // Elsewhere (the checks on Linux): `op` on PATH.
    expect(findTool('linux', { PATH: '/opt/stand-in:/usr/bin' }, (file) => file === '/opt/stand-in/op')).toBe('/opt/stand-in/op')
  })

  it('runs with none of the caller’s OP_ settings, unlocking through the 1Password app', () => {
    const env = toolEnvironment({ PATH: 'x', OP_SERVICE_ACCOUNT_TOKEN: 'ops_secret', op_session_x: 'y', OP_CACHE: 'true' })
    expect(env).toEqual({
      PATH: 'x',
      OP_CACHE: 'false',
      OP_BIOMETRIC_UNLOCK_ENABLED: 'true',
      OP_LOAD_DESKTOP_APP_SETTINGS: 'false',
    })
  })

  it('says 1Password’s own first line of complaint, without its stamp', () => {
    expect(complaint('[ERROR] 2026/11/02 21:00:00 You are not currently signed in.\nmore')).toBe(
      'You are not currently signed in.',
    )
    expect(complaint('\n  \n')).toBeUndefined()
    expect(complaint('x'.repeat(400))).toHaveLength(300)
  })

  /** A tool that answers as told, each run written down. */
  function tool(answers: Record<string, ToolRun>): { run: RunTool; runs: string[][] } {
    const runs: string[][] = []
    return {
      runs,
      run: async (args) => {
        runs.push(args)
        return answers[args.slice(0, 2).join(' ')] ?? { ok: false }
      },
    }
  }

  it('lists the accounts, then makes the vault and its read-only key with the Mac’s arguments', async () => {
    const { run, runs } = tool({
      'account list': {
        ok: true,
        out: JSON.stringify([
          { account_uuid: 'WORKUUID', email: 'sam@work.example', url: 'work.1password.com' },
          { email: 'no id' },
        ]),
      },
      'vault list': { ok: true, out: JSON.stringify([{ id: 'other', name: 'Private' }]) },
      'vault create': { ok: true, out: JSON.stringify({ id: 'v123abcdefghijklmnopqrstuv', name: 'Shared with Simeon' }) },
      'service-account create': { ok: true, out: 'ops_fake_key_for_the_test_only_0123456789\n' },
    })
    const listed = await listAccounts(run)
    expect(listed).toEqual({ accounts: [{ id: 'WORKUUID', email: 'sam@work.example', url: 'work.1password.com' }] })
    const made = await connectAccount(run, { id: 'WORKUUID', email: 'sam@work.example', url: '' })
    expect(made).toEqual({
      token: 'ops_fake_key_for_the_test_only_0123456789',
      vaultId: 'v123abcdefghijklmnopqrstuv',
      vaultName: 'Shared with Simeon',
      accountEmail: 'sam@work.example',
    })
    expect(runs).toEqual([
      ['account', 'list', '--format=json'],
      ['vault', 'list', '--account', 'WORKUUID', '--format=json'],
      ['vault', 'create', 'Shared with Simeon', '--account', 'WORKUUID', '--format=json'],
      ['service-account', 'create', 'Simeon', '--vault', 'v123abcdefghijklmnopqrstuv:read_items', '--expires-in', '52w', '--account', 'WORKUUID', '--raw'],
    ])
  })

  it('uses the vault that is there, and says each failure as the Mac does', async () => {
    const there = tool({
      'vault list': { ok: true, out: JSON.stringify([{ id: 'v9abcdefghijklmnopqrstuvwx', name: 'Shared with Simeon' }]) },
      'service-account create': { ok: true, out: 'not a key' },
    })
    expect(await connectAccount(there.run, { id: 'A1', email: 'a@b', url: '' })).toEqual({ failure: 'noKey' })
    expect(there.runs.map((args) => args[0] + ' ' + args[1])).toEqual(['vault list', 'service-account create'])

    const noVault = tool({ 'vault list': { ok: true, out: '[]' }, 'vault create': { ok: false, said: 'Not allowed.' } })
    expect(await connectAccount(noVault.run, { id: 'A1', email: '', url: '' })).toEqual({ failure: 'noVault' })

    const locked = tool({ 'vault list': { ok: false, said: 'You are not currently signed in.' } })
    expect(await connectAccount(locked.run, { id: 'A1', email: '', url: '' })).toEqual({
      refused: 'You are not currently signed in.',
    })
    expect(await listAccounts(tool({ 'account list': { ok: true, out: '[]' } }).run)).toEqual({ failure: 'noAccounts' })
    expect(await listAccounts(tool({}).run)).toEqual({ failure: 'noAnswer' })
    // An account's id never reads as a flag.
    expect(isAccountId('--help')).toBe(false)
    expect(await connectAccount(tool({}).run, { id: '--x', email: '', url: '' })).toEqual({ failure: 'noAccounts' })
  })

  it('connects only an account it just listed, one run at a time, and says when there is no tool', async () => {
    expect(await new OnePassword('linux', { PATH: '/nowhere' }).accounts()).toEqual({ failure: 'noTool' })
    const runs: string[][] = []
    let running = 0
    let most = 0
    const onePassword = new OnePassword(
      'linux',
      {},
      () => async (args) => {
        running += 1
        most = Math.max(most, running)
        runs.push(args)
        await new Promise((done) => setTimeout(done, 5))
        running -= 1
        if (args[0] === 'account') return { ok: true, out: JSON.stringify([{ account_uuid: 'A1', email: 'a@b', url: '' }]) }
        if (args[0] === 'vault' && args[1] === 'list') return { ok: true, out: JSON.stringify([{ id: 'v1abcdefghijklmnopqrstuvwx', name: 'Shared with Simeon' }]) }
        return { ok: true, out: 'ops_fake_key_for_the_test_only_0123456789' }
      },
      () => '/opt/stand-in/op',
    )
    // Before any list: no account may be connected.
    expect(await onePassword.connect('A1')).toEqual({ failure: 'noAccounts' })
    const [listed, made, other] = await Promise.all([
      onePassword.accounts(),
      onePassword.connect('A1'),
      onePassword.connect('B2'),
    ])
    expect(listed).toEqual({ accounts: [{ id: 'A1', email: 'a@b', url: '' }] })
    expect(made).toMatchObject({ vaultId: 'v1abcdefghijklmnopqrstuvwx', accountEmail: 'a@b' })
    expect(other).toEqual({ failure: 'noAccounts' })
    expect(most).toBe(1)
    expect(runs.map((args) => args.slice(0, 2).join(' '))).toEqual(['account list', 'vault list', 'service-account create'])
  })
})

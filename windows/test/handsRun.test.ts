// The agent's hands run for real: the provider (src/main/hands/provider.ts)
// against a stand-in for the person's computer on 127.0.0.1
// (handsStandIn.mjs), its commands run in PowerShell (Windows PowerShell or
// PowerShell 7 on Windows; on Linux, `pwsh` first on PATH). Everything
// happens in a temporary folder of its own: the home folder, the root and
// the app's data folder are made there, and nothing outside it is read.
// Skipped where no PowerShell is found.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalToolApprovals } from '../src/main/hands/approvals'
import { Hands, placesFrom } from '../src/main/hands/hands'
import { findPowerShell } from '../src/main/hands/powershell'
import { HandsProvider, type StreamEnd } from '../src/main/hands/provider'
import { LocalExec, type Permission } from '../src/main/hands/rules'
import { launch } from '../src/main/hands/shell'
import { fetchTransport } from '../src/main/hands/transport'
import * as wire from '../src/main/hands/wire'
import { type Frame, startHandsGateway } from './handsStandIn.mjs'

const shell = findPowerShell(process.env, process.platform)

type Message = Record<string, unknown>

function shellEvents(frames: Frame[]): Message[] {
  return frames
    .filter((frame) => frame.kind === 'client')
    .map((frame) => (frame.message as { shellStream?: Message })?.shellStream)
    .filter((event): event is Message => event != null)
}

function output(frames: Frame[], stream: 'stdout' | 'stderr' = 'stdout'): string {
  return shellEvents(frames)
    .map((event) => ((event[stream] as { data?: string } | undefined)?.data ?? ''))
    .join('')
}

function controls(frames: Frame[]): Message[] {
  return frames.filter((frame) => frame.kind === 'control').map((frame) => frame.message as Message)
}

function thrownOf(frames: Frame[]): string | undefined {
  return (controls(frames).find((message) => message.throw)?.throw as { error?: string } | undefined)?.error
}

describe.skipIf(!shell)('the hands run for real in PowerShell', () => {
  let folder: string
  let home: string
  let root: string
  let data: string
  let permission: Permission = 'always'
  let approvals: LocalToolApprovals
  let provider: HandsProvider
  let standIn: Awaited<ReturnType<typeof startHandsGateway>>
  let streaming: Promise<StreamEnd>
  const logs: string[] = []
  let requests = 0

  beforeAll(async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-run-'))
    home = path.join(folder, 'home')
    root = path.join(folder, 'root')
    data = path.join(folder, 'data')
    for (const one of [home, root, data]) mkdirSync(one, { recursive: true })
    // A stand-in key in the stand-in home folder: refused before anything runs, so never read.
    mkdirSync(path.join(home, '.ssh'))
    writeFileSync(path.join(home, '.ssh', 'id_rsa'), 'NOT-A-REAL-KEY')
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: home,
      XDG_CACHE_HOME: path.join(home, '.cache'),
      XDG_DATA_HOME: path.join(home, '.local', 'share'),
      XDG_CONFIG_HOME: path.join(home, '.config'),
    }
    standIn = await startHandsGateway()
    approvals = new LocalToolApprovals(data)
    provider = new HandsProvider({
      transport: fetchTransport(fetch),
      root,
      home,
      places: placesFrom(env, home, data, process.platform),
      approvals,
      permission: () => permission,
      system: { shell, platform: process.platform, environment: env, log: (line) => logs.push(line) },
      log: (line) => logs.push(line),
      hostName: 'test-pc',
    })
    streaming = provider.openStream(standIn.target)
    await standIn.gateway.waitFor(() => standIn.gateway.state.frames.find((frame) => frame.kind === 'hello'))
  }, 30_000)

  afterAll(async () => {
    await provider?.stop()
    await standIn?.close()
    if (folder) rmSync(folder, { recursive: true, force: true })
  }, 30_000)

  /** One request from the computer; its frames once it ends (`streamClose`, or a refusal). */
  async function exec(command: Message, approvalId?: string, ms = 30_000): Promise<Frame[]> {
    requests += 1
    const requestId = `r${requests}`
    standIn.gateway.push({
      kind: 'exec',
      requestId,
      serverMessage: { id: requests, ...command },
      ...(approvalId ? { approvalId } : {}),
    })
    await standIn.gateway.waitFor(
      () => controls(standIn.gateway.framesFor(requestId)).some((m) => m.streamClose || m.throw),
      ms,
      requestId,
    )
    await provider.settled
    return standIn.gateway.framesFor(requestId)
  }

  const run = (command: string, more: Message = {}) => exec({ shellStreamArgs: { command, ...more } })

  it('says hello with its root and terminals folder, then pings, with the gateway’s key', async () => {
    const hello = standIn.gateway.state.frames.find((frame) => frame.kind === 'hello')
    expect(hello).toMatchObject({
      localRoot: root,
      terminalsFolder: path.join(root, 'terminals'),
      computerId: 'test-pc',
      label: 'test-pc',
      supervised: true,
      variant: 'sand',
    })
    await standIn.gateway.waitFor(() => standIn.gateway.state.frames.find((frame) => frame.kind === 'ping'))
    expect(standIn.gateway.state.streams.every((one) => one.authorized)).toBe(true)
    expect(standIn.gateway.state.batches.every((one) => one.authorized)).toBe(true)
  })

  it('says its system and its shell in the hello, so the agent writes PowerShell', async () => {
    const hello = await standIn.gateway.waitFor(() =>
      standIn.gateway.state.frames.find((frame) => frame.kind === 'hello' && frame.shellVersion),
    )
    expect(hello).toMatchObject({ platform: process.platform, shell: 'pwsh', osVersion: `${os.type()} ${os.release()}` })
    expect(String(hello.shellVersion)).toMatch(/^\d+\.\d+/)
  }, 20_000)

  it('runs a command and streams its answer', async () => {
    const frames = await run("Write-Output 'hello from PowerShell'")
    const events = shellEvents(frames)
    expect(events[0]).toEqual({ start: { sandboxPolicy: { type: 'TYPE_INSECURE_NONE' } } })
    expect(output(frames)).toContain('hello from PowerShell')
    const exit = events.find((event) => event.exit)?.exit as Message
    expect(exit.code).toBeUndefined()
    expect(exit.cwd).toBe(root)
    expect(controls(frames).at(-1)).toEqual({ streamClose: { id: expect.any(Number) } })
    // Once welcomed, the batches name the provider.
    const answered = standIn.gateway.state.batches.find((one) => one.frames?.some((frame) => frame.requestId === frames[0]?.requestId))
    expect(answered?.providerId).toBe('p1')
  }, 30_000)

  it('carries the folder, the environment, functions and aliases to the next command', async () => {
    const first = await run(
      "New-Item -ItemType Directory -Force sub | Out-Null; Set-Location sub; $env:SIMEON_TEST_COLOUR = 'blue'; function Get-Greeting { 'hi there' }; Set-Alias greet Get-Greeting",
    )
    expect((shellEvents(first).find((event) => event.exit)?.exit as Message).cwd).toBe(path.join(root, 'sub'))
    const second = await run('(Get-Location).Path; $env:SIMEON_TEST_COLOUR; greet')
    expect(output(second).split(/\r?\n/).filter(Boolean)).toEqual([path.join(root, 'sub'), 'blue', 'hi there'])
    await run(`Set-Location '${root.replace(/'/g, "''")}'`)
  }, 60_000)

  it('gives the command’s own code, and its errors on stderr', async () => {
    const exited = await run('exit 3')
    expect((shellEvents(exited).find((event) => event.exit)?.exit as Message).code).toBe(3)
    const failed = await run('Get-Item ./nothing-here')
    expect((shellEvents(failed).find((event) => event.exit)?.exit as Message).code).toBe(1)
    expect(output(failed, 'stderr')).toContain('nothing-here')
    // No colours, and nothing of the state said after the command.
    expect(output(failed, 'stderr')).not.toContain('\u001b[')
    expect(output(exited) + output(failed)).not.toContain('__SIMEON_PS_STATE')
  }, 60_000)

  it('keeps the run’s state when the command lists every variable (S3)', async () => {
    const listed = await run(
      "New-Item -ItemType Directory -Force listed | Out-Null; Set-Location listed; $env:SIMEON_TEST_B = 'two'; Get-Variable | Format-List; dir variable: | Format-List; 'LAST LINE'",
    )
    const said = output(listed)
    expect(said).toContain('LAST LINE')
    // The run's own marker is in no variable listed (the closure's text names only the end marker, which marks nothing on its own).
    expect(said).not.toMatch(/__SIMEON_PS_STATE_[0-9a-f]{32}__/)
    expect(said).not.toMatch(/marker\s*=/)
    expect((shellEvents(listed).find((event) => event.exit)?.exit as Message).cwd).toBe(path.join(root, 'listed'))
    const next = await run('(Get-Location).Path; $env:SIMEON_TEST_B')
    expect(output(next).split(/\r?\n/).filter(Boolean)).toEqual([path.join(root, 'listed'), 'two'])
    await run(`Set-Location '${root.replace(/'/g, "''")}'`)
  }, 60_000)

  it('gives the agent the Mac’s line ends (N9)', async () => {
    const frames = await run('[Console]::Out.Write("one`r`ntwo`r`n")')
    expect(output(frames)).toBe('one\ntwo\n')
  }, 30_000)

  it('waits as long as it is asked, even past what a timer keeps (N4)', async () => {
    const frames = await run("Write-Output 'a long wait asked'", { timeout: 2 ** 31 + 1_000 })
    const exit = shellEvents(frames).find((event) => event.exit)?.exit as Message
    expect(exit.aborted).toBeUndefined()
    expect(output(frames)).toContain('a long wait asked')
  }, 30_000)

  it('refuses a command whose folder leads to a place that holds keys through a link (S1)', async () => {
    permission = 'always'
    // `k` in the root leads to the stand-in home's `.ssh` (a junction would on Windows).
    symlinkSync(path.join(home, '.ssh'), path.join(root, 'k'))
    const asked = await run('Get-Content id_rsa', { workingDirectory: 'k' })
    expect(thrownOf(asked)).toContain('~\\.ssh')
    expect(shellEvents(asked)).toEqual([])
    // The shell moved there by a name that says nothing: its next command is refused all the same.
    const moved = await run('Set-Location k')
    expect((shellEvents(moved).find((event) => event.exit)?.exit as Message).cwd).toBe(path.join(root, 'k'))
    const after = await run('Get-Content id_rsa')
    expect(thrownOf(after)).toContain('~\\.ssh')
    expect(JSON.stringify(standIn.gateway.state.frames)).not.toContain('NOT-A-REAL-KEY')
    // A folder asked for that is not one runs, and takes the shell back.
    await run(`Set-Location '${root.replace(/'/g, "''")}'`, { workingDirectory: root })
    rmSync(path.join(root, 'k'))
  }, 60_000)

  it('refuses a place that holds keys, whatever the setting, before anything runs', async () => {
    permission = 'always'
    for (const command of ['Get-Content ~/.ssh/id_rsa', `Get-Content "${path.join(home, '.SSH', 'id_rsa')}"`, 'Get-Content $HOME/.ssh/id_rsa']) {
      const frames = await run(command)
      expect(thrownOf(frames), command).toBe(
        'Simeon does not read, write or run anything under ~\\.ssh on this PC: it holds keys or sign-ins. Ask the person to do that part themselves on their PC, in PowerShell (for example `Get-Content`), not in a Mac\'s Terminal.',
      )
      expect(shellEvents(frames), command).toEqual([])
    }
    const read = await exec({ readArgs: { path: '~/.ssh/id_rsa' } })
    expect(thrownOf(read)).toContain('~\\.ssh')
    const inside = await run('Get-ChildItem', { workingDirectory: path.join(home, '.ssh') })
    expect(thrownOf(inside)).toContain('~\\.ssh')
    expect(JSON.stringify(standIn.gateway.state.frames)).not.toContain('NOT-A-REAL-KEY')
  }, 60_000)

  it('refuses everything under Never', async () => {
    permission = 'never'
    const frames = await run("Write-Output 'should not run'")
    expect(thrownOf(frames)).toBe(LocalExec.disabled)
    expect(shellEvents(frames)).toEqual([])
    permission = 'always'
  }, 30_000)

  it('runs under Ask only what the person allowed once, exactly that', async () => {
    permission = 'ask'
    const unasked = await run("Write-Output 'allowed?'")
    expect(thrownOf(unasked)).toBe(LocalExec.unapproved)
    approvals.record({ id: 'q-allowed', action: 'run-command', target: "Write-Output 'allowed once'" })
    const allowed = await exec({ shellStreamArgs: { command: "Write-Output 'allowed once'" } }, 'q-allowed')
    expect(output(allowed)).toContain('allowed once')
    const other = await exec({ shellStreamArgs: { command: "Write-Output 'something else'" } }, 'q-allowed')
    expect(thrownOf(other)).toBe(LocalExec.unapproved)
    // Retired by the computer: covers nothing more.
    standIn.gateway.push({ kind: 'retire-approval', requestId: 'x', approvalId: 'q-allowed' })
    await new Promise((done) => setTimeout(done, 200))
    const again = await exec({ shellStreamArgs: { command: "Write-Output 'allowed once'" } }, 'q-allowed')
    expect(thrownOf(again)).toBe(LocalExec.unapproved)
    permission = 'always'
  }, 60_000)

  it('stops a command and all it started on cancel', async () => {
    requests += 1
    const requestId = `r${requests}`
    const began = Date.now()
    standIn.gateway.push({
      kind: 'exec',
      requestId,
      serverMessage: { id: requests, shellStreamArgs: { command: "Start-Sleep -Seconds 30; 'not reached'" } },
    })
    await standIn.gateway.waitFor(() => shellEvents(standIn.gateway.framesFor(requestId)).some((event) => event.start))
    await new Promise((done) => setTimeout(done, 1_500))
    standIn.gateway.push({ kind: 'cancel', requestId })
    await standIn.gateway.waitFor(() => controls(standIn.gateway.framesFor(requestId)).some((m) => m.streamClose))
    const frames = standIn.gateway.framesFor(requestId)
    const exit = shellEvents(frames).find((event) => event.exit)?.exit as Message
    expect(exit).toMatchObject({ code: 4294967295, aborted: true, abortReason: 'SHELL_ABORT_REASON_USER_ABORT' })
    expect(output(frames)).not.toContain('not reached')
    expect(Date.now() - began).toBeLessThan(15_000)
  }, 30_000)

  it('sends a long command to the background with its terminal file', async () => {
    const frames = await run("Write-Output 'started'; Start-Sleep -Milliseconds 1500; Write-Output 'done in the background'", {
      timeout: 500,
      timeoutBehavior: 'TIMEOUT_BEHAVIOR_BACKGROUND',
      description: 'A wait',
    })
    const backgrounded = shellEvents(frames).find((event) => event.backgrounded)?.backgrounded as Message
    expect(backgrounded).toMatchObject({ msToWait: 500, reason: 'SHELL_BACKGROUND_REASON_TIMEOUT', workingDirectory: root })
    const file = path.join(root, 'terminals', `${backgrounded.shellId}.txt`)
    const ended = await standIn.gateway.waitFor(
      () => existsSync(file) && readFileSync(file, 'utf8').includes('exit_code: 0') && readFileSync(file, 'utf8'),
      20_000,
      'the terminal file',
    )
    expect(ended).toContain('status: succeeded')
    expect(ended).toContain('title: "A wait"')
    expect(ended).toContain('done in the background')
    expect(ended).not.toContain('__SIMEON_PS_STATE')
    // Its approval's terminal file is a read the command's approval covers.
    const read = await exec({ readArgs: { path: `${path.join(root, 'terminals')}/${backgrounded.shellId}.txt` } })
    expect(JSON.stringify(read)).toContain('done in the background')
  }, 40_000)

  it('reads, lists and moves files inside the root only', async () => {
    writeFileSync(path.join(root, 'notes.txt'), 'one\ntwo\nthree')
    const read = await exec({ readArgs: { path: 'notes.txt', offset: 2, limit: 1 } })
    const result = (read.find((frame) => frame.kind === 'client')?.message as { readResult?: Message }).readResult
    expect(result).toEqual({
      success: { path: path.join(root, 'notes.txt'), content: 'two', totalLines: 3, fileSize: '13', rangeApplied: true },
    })
    const outside = await exec({ readArgs: { path: '../outside.txt' } })
    expect(thrownOf(outside)).toBe(LocalExec.outsideRoot(path.join(folder, 'outside.txt')))
    // The listing answers only for a path that is not a folder (the shipped one's way).
    expect(thrownOf(await exec({ lsArgs: { path: 'notes.txt' } }))).toBe(`Path is not a directory: ${path.join(root, 'notes.txt')}`)
    expect(thrownOf(await exec({ lsArgs: { path: '.' } }))).toBe('')
    // Upload and download.
    standIn.gateway.push({ kind: 'upload', requestId: 'u1', path: 'up/a.txt', bytesBase64: Buffer.from('hello').toString('base64') })
    await standIn.gateway.waitFor(() => standIn.gateway.framesFor('u1').find((frame) => frame.kind === 'file'))
    expect(readFileSync(path.join(root, 'up', 'a.txt'), 'utf8')).toBe('hello')
    standIn.gateway.push({ kind: 'download', requestId: 'd1', path: 'up/a.txt' })
    const file = await standIn.gateway.waitFor(() => standIn.gateway.framesFor('d1').find((frame) => frame.kind === 'file'))
    expect(Buffer.from(String(file.bytesBase64), 'base64').toString()).toBe('hello')
    standIn.gateway.push({ kind: 'download', requestId: 'd2', path: '../../etc/hostname' })
    const refused = await standIn.gateway.waitFor(() => standIn.gateway.framesFor('d2').find((frame) => frame.kind === 'file-error'))
    expect(refused.error).toContain('outside the allowed local-exec root')
    standIn.gateway.push({ kind: 'upload', requestId: 'u2', path: 'bad.txt', bytesBase64: 'not base64!' })
    const bad = await standIn.gateway.waitFor(() => standIn.gateway.framesFor('u2').find((frame) => frame.kind === 'file-error'))
    expect(bad.error).toBe('The upload was not valid base64.')
  }, 40_000)

  it('reads a file for the computer without holding up the app (S6)', async () => {
    const fifo = path.join(root, 'slow.pipe')
    execFileSync('mkfifo', [fifo])
    // Another program writes it a second from now; until then a read waits.
    const writer = spawn('sh', ['-c', `sleep 1; printf 'piped' > '${fifo}'`], { stdio: 'ignore' })
    let ticks = 0
    const ticker = setInterval(() => {
      ticks += 1
    }, 20)
    try {
      standIn.gateway.push({ kind: 'download', requestId: 'slow', path: 'slow.pipe' })
      const file = await standIn.gateway.waitFor(() => standIn.gateway.framesFor('slow').find((frame) => frame.kind === 'file'), 10_000)
      expect(Buffer.from(String(file.bytesBase64), 'base64').toString()).toBe('piped')
      // The app went on answering meanwhile: its timers kept firing.
      expect(ticks).toBeGreaterThan(20)
    } finally {
      clearInterval(ticker)
      writer.kill()
      rmSync(fifo, { force: true })
    }
  }, 30_000)

  it('says when it has no handler for a kind', async () => {
    const frames = await exec({ grepArgs: { pattern: 'x' } })
    expect(thrownOf(frames)).toBe(LocalExec.noHandler('grepArgs'))
    expect(controls(frames).at(-1)).toMatchObject({ streamClose: {} })
  }, 30_000)

  it('writes no command, address or key in its log', () => {
    const log = logs.join('\n')
    expect(log).not.toContain('fake-gateway')
    expect(log).not.toContain('Write-Output')
    expect(log).not.toContain('127.0.0.1')
  })

  it('stops what runs in the background when it stops, and the stream ends with it', async () => {
    const spawned = await exec({ backgroundShellSpawnArgs: { command: 'Start-Sleep -Seconds 60' } })
    const result = (spawned.find((frame) => frame.kind === 'client')?.message as { backgroundShellSpawnResult?: { success?: Message } })
      .backgroundShellSpawnResult?.success
    expect(result?.pid).toBeGreaterThan(0)
    expect(provider.background.count).toBeGreaterThan(0)
    await provider.stop()
    expect(await streaming).toEqual({ connected: true, ended: 'stopped' })
    const pid = Number(result?.pid)
    const alive = await standIn.gateway.waitFor(
      () => {
        try {
          process.kill(pid, 0)
          return undefined
        } catch {
          return 'gone'
        }
      },
      10_000,
      'the background command to stop',
    )
    expect(alive).toBe('gone')
    expect(await provider.openStream(standIn.target)).toEqual({ connected: false, ended: 'stopped' })
  }, 30_000)
})

describe('the stream, with no PowerShell needed', () => {
  it('ends “closed” when the computer closes it, and “failed” when refused', async () => {
    const standIn = await startHandsGateway()
    const folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-stream-'))
    try {
      const provider = new HandsProvider({
        transport: fetchTransport(fetch),
        root: folder,
        home: folder,
        places: placesFrom({}, folder, path.join(folder, 'data'), process.platform),
        approvals: new LocalToolApprovals(path.join(folder, 'data')),
        permission: () => 'ask',
        system: { shell: undefined, platform: process.platform, environment: {}, log: () => {} },
        log: () => {},
      })
      const open = provider.openStream(standIn.target)
      await standIn.gateway.waitFor(() => standIn.gateway.openStreams > 0)
      standIn.gateway.closeStreams()
      expect(await open).toEqual({ connected: true, ended: 'closed' })
      const refused = await provider.openStream({ ...standIn.target, headers: { authorization: 'Bearer wrong' } })
      expect(refused).toEqual({ connected: false, ended: 'failed' })
      // Ended by the page (the address moved), once it said hello on it.
      const hellos = () => standIn.gateway.state.frames.filter((frame) => frame.kind === 'hello').length
      const before = hellos()
      const again = provider.openStream(standIn.target)
      await standIn.gateway.waitFor(() => hellos() > before)
      provider.endStream('ended')
      expect(await again).toEqual({ connected: true, ended: 'ended' })
      await provider.stop()
    } finally {
      await standIn.close()
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30_000)

  it('ends “stalled” after a silence', async () => {
    const standIn = await startHandsGateway()
    const folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-stall-'))
    try {
      const provider = new HandsProvider({
        transport: fetchTransport(fetch),
        root: folder,
        home: folder,
        places: placesFrom({}, folder, path.join(folder, 'data'), process.platform),
        approvals: new LocalToolApprovals(path.join(folder, 'data')),
        permission: () => 'ask',
        system: { shell: undefined, platform: process.platform, environment: {}, log: () => {} },
        log: () => {},
        timing: { pingMs: 100, stallMs: 300 },
      })
      expect(await provider.openStream(standIn.target)).toEqual({ connected: true, ended: 'stalled' })
      await provider.stop()
    } finally {
      await standIn.close()
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30_000)
})

describe.skipIf(!shell)('a stop on Windows when taskkill does not stop it (S4)', () => {
  it('stops the shell itself a second later', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-stop-'))
    const logs: string[] = []
    // Windows' rules on Linux: `taskkill.exe` is not there, so only the fallback can stop it.
    const system = { shell, platform: 'win32', environment: { SystemRoot: path.join(folder, 'no-windows') }, log: (line: string) => logs.push(line) }
    const started = launch(system, {
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30'],
      cwd: folder,
      env: { ...process.env } as Record<string, string>,
      pipeStdin: false,
    })
    try {
      const began = Date.now()
      started.terminate()
      await Promise.race([started.waitForExit(), new Promise((_, fail) => setTimeout(() => fail(new Error('the stop did not end it')), 8_000))])
      expect(Date.now() - began).toBeLessThan(8_000)
    } finally {
      started.child.kill('SIGKILL')
      rmSync(folder, { recursive: true, force: true })
    }
  }, 20_000)
})

describe('a stop that nothing ends (S4)', () => {
  it('is told ended all the same, so a cancel never hangs', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-stuck-'))
    const logs: string[] = []
    const system = { shell: '/bin/sh', platform: 'win32', environment: { SystemRoot: path.join(folder, 'no-windows') }, log: (line: string) => logs.push(line) }
    // A program that lets the stop's signal go by.
    const started = launch(system, {
      args: ['-c', 'trap "" TERM; while :; do sleep 1; done'],
      cwd: folder,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      pipeStdin: false,
    })
    try {
      await new Promise((done) => setTimeout(done, 300))
      started.terminate()
      const exit = await Promise.race([
        started.waitForExit(),
        new Promise((_, fail) => setTimeout(() => fail(new Error('the wait did not end')), 12_000)),
      ])
      expect(exit).toEqual({ code: null, signaled: true })
      expect(logs.join('\n')).toContain('did not end')
    } finally {
      started.child.kill('SIGKILL')
      rmSync(folder, { recursive: true, force: true })
    }
  }, 20_000)
})

describe('signing out and stopping', () => {
  it('forgets the “Allow once” answers with the setting (N7)', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-out-'))
    try {
      const made = new Hands({
        dataFolder: path.join(folder, 'data'),
        env: {},
        home: folder,
        platform: process.platform,
        transport: fetchTransport(fetch),
      })
      made.permission('a@x.co')
      made.choose('always')
      made.allowOnce({ id: 'q1', action: 'run-command', target: 'ls' })
      expect(made.approvals.live().size).toBe(1)
      await made.signedOut()
      expect(made.approvals.live().size).toBe(0)
      expect(made.settings.now().effective).toBe('ask')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('sends each answer once after it stops, never again to the old address (N8)', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-outbox-'))
    let posts = 0
    try {
      const provider = new HandsProvider({
        transport: {
          stream: async () => ({ status: 503, body: (async function* () {})() }),
          post: async () => {
            posts += 1
            return { status: 503 }
          },
        },
        root: folder,
        home: folder,
        places: placesFrom({}, folder, path.join(folder, 'data'), process.platform),
        approvals: new LocalToolApprovals(path.join(folder, 'data')),
        permission: () => 'ask',
        system: { shell: undefined, platform: process.platform, environment: {}, log: () => {} },
        log: () => {},
        timing: { postGapMs: 10 },
      })
      await provider.openStream({ baseURL: 'http://127.0.0.1:9', headers: {} })
      await provider.stop()
      provider.enqueue(wire.fileError('late', 'stopped'))
      const settled = await Promise.race([provider.settled.then(() => true), new Promise((done) => setTimeout(() => done(false), 3_000))])
      expect(settled).toBe(true)
      expect(posts).toBe(3)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

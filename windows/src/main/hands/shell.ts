// The shell on this PC (mac/Simeon/MacLocalHands.swift: `ShellProcess`,
// `ZshHost`, `BackgroundShells`): each command started in PowerShell with
// the state carried from the last, its output as it comes (each stream cut
// at 1 MiB), its end, and, stopped, the whole tree of what it started
// (`taskkill /T /F` on Windows, as the Mac stops its process group).
// Commands gone to the background keep a terminal file in the root's
// `terminals` folder until they end.

import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { type FileHandle, open } from 'node:fs/promises'
import path from 'node:path'
import { TerminalFile } from './files'
import {
  type ShellState,
  commandInput,
  emptyState,
  isFolder,
  parseInitOutput,
  parseStateBody,
  shellArguments,
  shellEnvironment,
} from './powershell'
import { LocalExec } from './rules'

export type Stream = 'stdout' | 'stderr'

/** How the shell is started and stopped: PowerShell on Windows; the same on Linux for the checks. */
export interface ShellSystem {
  /** The PowerShell to run; undefined when this PC has none. */
  shell: string | undefined
  platform: string
  /** The environment commands start from (the app's). */
  environment: Readonly<Record<string, string | undefined>>
  log(line: string): void
}

/**
 * Splits a command's output from the state said after its run's own
 * marker: what comes before goes on as it comes; only what could be the
 * marker's start is held back until the next piece says.
 */
export class StateSplitter {
  private held: Buffer = Buffer.alloc(0)
  private found = false
  private state: Buffer[] = []

  constructor(
    private readonly marker: Buffer,
    private readonly out: (data: Buffer) => void,
  ) {}

  push(chunk: Buffer): void {
    if (this.found) {
      this.state.push(chunk)
      return
    }
    const data = this.held.length > 0 ? Buffer.concat([this.held, chunk]) : chunk
    const at = data.indexOf(this.marker)
    if (at >= 0) {
      if (at > 0) this.out(data.subarray(0, at))
      this.found = true
      this.held = Buffer.alloc(0)
      this.state.push(data.subarray(at + this.marker.length))
      return
    }
    let hold = 0
    for (let size = Math.min(data.length, this.marker.length - 1); size > 0; size -= 1) {
      if (data.subarray(data.length - size).equals(this.marker.subarray(0, size))) {
        hold = size
        break
      }
    }
    if (data.length - hold > 0) this.out(data.subarray(0, data.length - hold))
    this.held = Buffer.from(data.subarray(data.length - hold))
  }

  /** The output ended: what was held is output after all. */
  end(): void {
    if (!this.found && this.held.length > 0) this.out(this.held)
    this.held = Buffer.alloc(0)
  }

  /** What was said after the marker, if it came. */
  get stateText(): string | undefined {
    return this.found ? Buffer.concat(this.state).toString('utf8') : undefined
  }
}

export interface Exit {
  code: number | null
  signaled: boolean
}

/** One command started in PowerShell: its output, its end, its tree. */
export class ShellProcess {
  readonly pid: number
  exit?: Exit
  private readonly handlers: ((stream: Stream, data: Buffer) => void)[] = []
  private readonly captured: [Stream, Buffer][] = []
  private readonly bytes: Record<Stream, number> = { stdout: 0, stderr: 0 }
  private readonly waiters: ((exit: Exit) => void)[] = []
  private splitter?: StateSplitter
  private terminating = false

  constructor(
    readonly child: ChildProcess,
    private readonly system: ShellSystem,
    marker: Buffer | undefined,
  ) {
    this.pid = child.pid ?? 0
    if (marker) this.splitter = new StateSplitter(marker, (data) => this.received('stdout', data))
  }

  /**
   * Output as it comes, each stream cut at 1 MiB without a word
   * (`BaseShellCoreExecutor`); what came before is given first, so nothing
   * newer reaches the handler ahead of it.
   */
  onOutput(handler: (stream: Stream, data: Buffer) => void): void {
    this.handlers.push(handler)
    for (const [stream, data] of this.captured) handler(stream, data)
  }

  /** Raw output from the process; the state after the marker is taken off the output first, so the cap never cuts it. */
  take(stream: Stream, data: Buffer): void {
    if (stream === 'stdout' && this.splitter) this.splitter.push(data)
    else this.received(stream, data)
  }

  private received(stream: Stream, data: Buffer): void {
    const used = this.bytes[stream]
    const room = Math.max(0, LocalExec.streamCap - used)
    const kept = data.subarray(0, room)
    this.bytes[stream] = used + kept.length
    if (kept.length === 0) return
    const copy = Buffer.from(kept)
    this.captured.push([stream, copy])
    for (const handler of [...this.handlers]) handler(stream, copy)
  }

  /** What the shell said of its state after the command, when it said it whole. */
  get stateText(): string | undefined {
    return this.splitter?.stateText
  }

  ended(exit: Exit): void {
    if (this.exit) return
    this.splitter?.end()
    this.exit = exit
    for (const waiter of this.waiters.splice(0)) waiter(exit)
  }

  get hasEnded(): boolean {
    return this.exit != null
  }

  waitForExit(): Promise<Exit> {
    if (this.exit) return Promise.resolve(this.exit)
    return new Promise((done) => this.waiters.push(done))
  }

  /** Stops it and everything it started: Windows' `taskkill /T /F`; elsewhere its group, SIGTERM then SIGKILL a second later (`killProcess`). */
  terminate(): void {
    if (this.terminating || this.hasEnded) return
    this.terminating = true
    killTree(this.pid, this.system)
    if (this.system.platform !== 'win32')
      setTimeout(() => {
        if (!this.hasEnded) killGroup(this.pid, 'SIGKILL', this.child)
      }, 1_000).unref()
  }
}

function killGroup(pid: number, signal: NodeJS.Signals, child?: ChildProcess): void {
  if (pid <= 0) return
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      child?.kill(signal)
    } catch {
      // Gone already.
    }
  }
}

/** Windows' own `taskkill`, by its full path, the process's number its only word. */
function taskkill(system: ShellSystem): string {
  const root = system.environment.SystemRoot ?? system.environment.SYSTEMROOT ?? 'C:\\Windows'
  return path.win32.join(root, 'System32', 'taskkill.exe')
}

export function killTree(pid: number, system: ShellSystem): void {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (system.platform === 'win32') {
    try {
      const killer = spawn(taskkill(system), ['/T', '/F', '/PID', String(pid)], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('error', () => {})
    } catch {
      // Not stopped: the end's own watch tries the rest.
    }
    return
  }
  killGroup(pid, 'SIGTERM')
}

/**
 * What a command started and left holding its output after it ended
 * (Windows has no process group to stop): found by their parent's number,
 * which Windows keeps, and stopped with theirs.
 */
function killLeftBehind(pid: number, system: ShellSystem): void {
  if (system.platform !== 'win32' || !system.shell) {
    killGroup(pid, 'SIGKILL')
    return
  }
  const script = `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | ForEach-Object { & '${taskkill(system).replace(/'/g, "''")}' /T /F /PID $_.ProcessId | Out-Null }`
  try {
    const sweeper = spawn(system.shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      stdio: 'ignore',
      windowsHide: true,
    })
    sweeper.on('error', () => {})
  } catch {
    // Left running; its output is let go below.
  }
}

/**
 * Starts PowerShell (`ZshHost.launch`): its input either the command's one
 * line then nothing (as `< /dev/null`), or left open (`pipeStdin`); its two
 * outputs read; on Windows no window of its own (`windowsHide`); elsewhere a
 * group of its own, so it can be stopped whole. Its end is told once its
 * output is closed too, or 5 s after it exited, when what it left holding
 * its output is stopped (`closeTimeout`).
 */
export function launch(
  system: ShellSystem,
  fields: {
    args: string[]
    cwd: string
    env: Record<string, string>
    input?: string
    pipeStdin: boolean
    marker?: Buffer
  },
): ShellProcess {
  if (!system.shell) throw new Error('PowerShell was not found on this PC.')
  const windows = system.platform === 'win32'
  const child = spawn(system.shell, fields.args, {
    cwd: fields.cwd,
    env: fields.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: !windows,
  })
  const process = new ShellProcess(child, system, fields.marker)
  child.stdout?.on('data', (data: Buffer) => process.take('stdout', data))
  child.stderr?.on('data', (data: Buffer) => process.take('stderr', data))
  child.stdin?.on('error', () => {
    // A shell gone before it read its input: the write fails, the app goes on.
  })
  if (fields.input != null) child.stdin?.write(fields.input)
  if (!fields.pipeStdin) child.stdin?.end()
  let exited: Exit | undefined
  let watch: ReturnType<typeof setTimeout> | undefined
  child.on('error', (error) => {
    clearTimeout(watch)
    process.take('stderr', Buffer.from(`${error.message}\n`))
    process.ended({ code: 127, signaled: false })
  })
  child.on('exit', (code, signal) => {
    exited = { code: signal ? null : code, signaled: signal != null }
    watch = setTimeout(() => {
      if (process.hasEnded) return
      system.log(
        '[shell-exec] Close event did not fire within 5000ms after exit. This may indicate a background process is holding file descriptors open. Killing detached process group.',
      )
      killLeftBehind(process.pid, system)
      child.stdout?.destroy()
      child.stderr?.destroy()
      process.ended(exited ?? { code: null, signaled: true })
    }, 5_000)
    watch.unref()
  })
  child.on('close', (code, signal) => {
    clearTimeout(watch)
    process.ended(exited ?? { code: signal ? null : code, signaled: signal != null })
  })
  return process
}

/**
 * The person's PowerShell (`ZshHost`): started once with their profile for
 * its state, then each command run with that state and its own, carried on.
 */
export class ShellHost {
  private state: ShellState = emptyState
  private folder: string
  private starting?: Promise<void>

  constructor(
    readonly root: string,
    private readonly system: ShellSystem,
  ) {
    this.folder = root
  }

  /** Where the shell is now: the last command's folder, or the root while that folder is gone. */
  get cwd(): string {
    return isFolder(this.folder) ? this.folder : this.root
  }

  /** The folder the shell says it is in, as it said it. */
  get saidFolder(): string {
    return this.folder
  }

  private environment(): Record<string, string> {
    return shellEnvironment(this.system.environment, this.root, this.system.platform)
  }

  /** The person's state, once, every command waiting for it, with a deadline of 20 s; the folder stays the root. */
  private ensureInitialized(): Promise<void> {
    this.starting ??= this.initialize()
    return this.starting
  }

  private async initialize(): Promise<void> {
    let process: ShellProcess
    try {
      process = launch(this.system, {
        args: shellArguments('init'),
        cwd: this.root,
        env: this.environment(),
        pipeStdin: false,
      })
    } catch {
      return
    }
    const chunks: Buffer[] = []
    process.onOutput((stream, data) => {
      if (stream === 'stdout') chunks.push(data)
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const ended = await Promise.race([
      process.waitForExit().then(() => true),
      new Promise<boolean>((done) => {
        timer = setTimeout(() => done(false), 20_000)
      }),
    ])
    clearTimeout(timer)
    if (!ended) process.terminate()
    const parsed = parseInitOutput(Buffer.concat(chunks).toString('utf8'))
    if (parsed) this.state = parsed.state
    else this.system.log('[shell-exec] PowerShell state init gave no state; falling back to empty state')
  }

  /** One command with the current state; its output read past its run's marker. */
  async spawn(command: string, cwd: string, pipeStdin: boolean): Promise<ShellProcess> {
    await this.ensureInitialized()
    const marker = `__SIMEON_PS_STATE_${randomBytes(16).toString('hex')}__`
    return launch(this.system, {
      args: shellArguments('command'),
      cwd: isFolder(cwd) ? cwd : this.root,
      env: this.environment(),
      input: commandInput(marker, command, this.state),
      pipeStdin,
      marker: Buffer.from(marker, 'utf8'),
    })
  }

  /** After a command that was not stopped: its state and folder become the shell's, when whole. */
  adopt(process: ShellProcess): void {
    const text = process.stateText
    if (text == null) return
    const parsed = parseStateBody(text)
    if (!parsed) return
    this.state = parsed.state
    this.folder = parsed.cwd
  }
}

/** A terminal file written in order: the head rewritten at its start, the output added at its end. */
class TerminalWriter {
  private chain: Promise<void> = Promise.resolve()
  private handle?: FileHandle
  private end = 0

  constructor(
    readonly file: string,
    head: string,
  ) {
    const first = Buffer.from(head, 'utf8')
    this.end = first.length
    this.queue(async () => {
      this.handle = await open(file, 'w+')
      await this.handle.write(first, 0, first.length, 0)
    })
  }

  private queue(work: () => Promise<void>): void {
    this.chain = this.chain.then(work).catch(() => {})
  }

  append(data: Buffer): void {
    const at = this.end
    this.end += data.length
    this.queue(async () => {
      await this.handle?.write(data, 0, data.length, at)
    })
  }

  rewriteHead(head: string): void {
    const bytes = Buffer.from(head, 'utf8')
    this.queue(async () => {
      await this.handle?.write(bytes, 0, bytes.length, 0)
    })
  }

  close(): Promise<void> {
    this.queue(async () => {
      await this.handle?.close()
      this.handle = undefined
    })
    return this.chain
  }
}

/**
 * Commands gone to the background (`background-shell-lifecycle.ts`): each
 * with an id from 1,000 to 999,999 (random first, then the next free one)
 * and its terminal file, kept until it ends.
 */
export class BackgroundShells {
  private nextId = randomInt(1000, 1_000_000)
  private readonly running = new Map<number, ShellProcess>()
  /** The terminal files still being written (the tests wait for them). */
  readonly writing = new Set<Promise<void>>()

  constructor(readonly terminalsFolder: string) {}

  private takeId(): number {
    while (this.running.has(this.nextId)) this.nextId = this.nextId >= 999_999 ? 1000 : this.nextId + 1
    const id = this.nextId
    this.nextId = this.nextId >= 999_999 ? 1000 : this.nextId + 1
    return id
  }

  /**
   * A command taken into the background: its terminal file made with what
   * it printed so far, the rest added as it comes, the head rewritten every
   * 5 s and at its end, the foot added unless it was stopped. Its times, and
   * its hard timeout, count from when it started, not from when it went to
   * the background.
   */
  adopt(
    process: ShellProcess,
    fields: {
      command: string
      cwd: string
      title?: string
      shell: ShellHost
      startedAt?: number
      hardTimeoutMs?: number
    },
  ): number {
    const shellId = this.takeId()
    this.running.set(shellId, process)
    const started = fields.startedAt ?? Date.now()
    const file = path.join(this.terminalsFolder, `${shellId}.txt`)
    try {
      mkdirSync(this.terminalsFolder, { recursive: true })
    } catch {
      // The file's own open says so.
    }
    const head = (status: string) =>
      TerminalFile.head({
        pid: process.pid,
        cwd: fields.cwd,
        command: fields.command,
        title: fields.title,
        status,
        startedAt: new Date(started),
        runningForMs: Date.now() - started,
      })
    const writer = new TerminalWriter(file, head('running'))
    // What it printed so far first (given again on registering), then the rest as it comes, both streams in order.
    process.onOutput((_stream, data) => writer.append(data))
    const ticker = setInterval(() => writer.rewriteHead(head('running')), 5_000)
    ticker.unref()
    let stoppedByTimeout = false
    let killer: ReturnType<typeof setTimeout> | undefined
    if (fields.hardTimeoutMs != null) {
      const left = Math.max(0, fields.hardTimeoutMs - (Date.now() - started))
      killer = setTimeout(() => {
        stoppedByTimeout = true
        process.terminate()
      }, left)
      killer.unref()
    }
    const done = (async () => {
      const exit = await process.waitForExit()
      clearInterval(ticker)
      clearTimeout(killer)
      if (stoppedByTimeout) {
        writer.rewriteHead(head('aborted'))
      } else {
        // Ended by a signal it has no code: "failed", and "unknown" at its foot.
        writer.rewriteHead(head(exit.code === 0 ? 'succeeded' : 'failed'))
        writer.append(
          Buffer.from(
            TerminalFile.foot({ exitCode: exit.code, elapsedMs: Date.now() - started, endedAt: new Date() }),
            'utf8',
          ),
        )
        fields.shell.adopt(process)
      }
      await writer.close()
      this.running.delete(shellId)
    })()
    this.writing.add(done)
    void done.finally(() => this.writing.delete(done))
    return shellId
  }

  /** Simeon quit or signed out: the commands it holds are stopped. */
  stopAll(): void {
    const all = [...this.running.values()]
    this.running.clear()
    for (const process of all) process.terminate()
  }

  get count(): number {
    return this.running.size
  }
}

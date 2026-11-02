// The agent's hands on this PC (mac/Simeon/MacLocalHands.swift:
// `LocalHandsProvider`, `ShellStreamRun`, `LocalReader`): the computer's
// requests read from one stream at a time, the answers queued and posted
// in batches, each request passed through the places that hold keys and
// the setting (Never, Always allow, or what the person allowed once)
// before anything runs. A command runs in PowerShell, its state carried
// from one to the next; a file is read, listed or moved inside the root.
//
// Where the Mac's provider asks its `Gateway` for the computer's address,
// this one is handed it by the page, which has the gateway
// (`handsStream`): the page dials, waits while the computer rests, and
// asks again when the stream drops, as the Mac's loop does
// (src/core/store.ts, step 7f's section). What the stream brings, and every
// command, lives here, in the main process, until the app quits or signs
// out.

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { LocalToolApprovals } from './approvals'
import {
  binaryRefusal,
  capText,
  countLines,
  decodeText,
  isPDF,
  isVideo,
  readKind,
  readRange,
  resolveReadPath,
} from './files'
import {
  LocalExec,
  type LocalToolRequest,
  type PathFlavor,
  type Permission,
  describe,
  escapesRoot,
  refusal,
  resolveAgainst,
  workingDirectory,
} from './rules'
import { type SensitivePlaces, sensitiveRefusal } from './sensitivePaths'
import { isFolder, shellEnvironment } from './powershell'
import { BackgroundShells, ShellHost, type ShellProcess, type ShellSystem } from './shell'
import type { Target } from './target'
import type { Transport } from './transport'
import * as wire from './wire'
import type { JSONObject, JSONValue } from './wire'

/** How a stream ended: the computer closed it, it could not be opened or broke, it went silent 35 s, the page ended it (the address moved), or the hands stopped. */
export type StreamEnding = 'closed' | 'failed' | 'stalled' | 'ended' | 'stopped'

export interface StreamEnd {
  /** The stream opened (the page's loop starts counting again). */
  connected: boolean
  ended: StreamEnding
}

export interface HandsOptions {
  transport: Transport
  /** Where the agent may read and write, and where commands start (`resolveLocalExecRoot`). */
  root: string
  home: string
  places: SensitivePlaces
  approvals: LocalToolApprovals
  /** "Execution on Local Computer", read before each request. */
  permission: () => Permission
  system: ShellSystem
  log(line: string): void
  /** A picture made at most 1,024 on its long side and 1 MiB (`ImageShrinker`); as it is when not given. */
  shrinkImage?: (data: Buffer) => Buffer
  /** This PC's name (`os.hostname()`), as the computer lists it. */
  hostName?: string
  /** This PC's system as the hello says it (`os.version()` and `os.release()` when not given). */
  osVersion?: string
  flavor?: PathFlavor
  /** Shorter waits for the tests. */
  timing?: { pingMs?: number; stallMs?: number; heartbeatMs?: number; postGapMs?: number }
}

/** A refusal or a failure said to the agent as it is. */
class HandsError extends Error {}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function int(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return undefined
}

function field(value: JSONValue | undefined, key: string): JSONValue | undefined {
  return wire.isObject(value) ? value[key] : undefined
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal?.aborted) return done()
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      done()
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener('abort', finish, { once: true })
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The nearest folder that exists, links followed, with the rest put back
 * (`realpathNearestExisting`). On Windows the system's own answer
 * (`GetFinalPathNameByHandle`): junctions, links and short names worked
 * out. Never blocks the main process (`fs/promises`).
 */
export async function realpathNearestExisting(target: string, flavor: PathFlavor = path): Promise<string> {
  let head = target
  const tail: string[] = []
  for (;;) {
    try {
      const real = await realpath(head)
      return tail.length === 0 ? real : flavor.join(real, ...tail.reverse())
    } catch {
      const parent = flavor.dirname(head)
      if (parent === head || parent === '') return target
      tail.push(flavor.basename(head))
      head = parent
    }
  }
}

async function regularFileSize(file: string): Promise<number | undefined> {
  try {
    const info = await stat(file)
    return info.isFile() ? info.size : undefined
  } catch {
    return undefined
  }
}

/**
 * `.name.<16 hex>.part` made new beside it, flushed to disk, then moved
 * over it (`writeFileAtomic`); written without blocking the main process,
 * where the window's calls and the stream's pings are answered.
 */
export async function writeAtomically(data: Buffer, target: string, flavor: PathFlavor = path): Promise<void> {
  const folder = flavor.dirname(target)
  await mkdir(folder, { recursive: true })
  const temp = flavor.join(folder, `.${flavor.basename(target)}.${randomBytes(8).toString('hex')}.part`)
  const handle = await open(temp, 'wx', 0o666)
  try {
    let offset = 0
    while (offset < data.length) offset += (await handle.write(data, offset, data.length - offset)).bytesWritten
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(temp, { force: true })
    throw error
  }
  await handle.close()
  try {
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/**
 * The read executor (`LocalReadExecutor`): text with its lines, or the
 * bytes of an image, a PDF or a video. `file` is what is read; `shown` the
 * path the answer names (the one the agent gave, worked out).
 */
export async function readLocalFile(
  file: string,
  offset: number | undefined,
  limit: number | undefined,
  shrinkImage: (data: Buffer) => Buffer = (data) => data,
  shown: string = file,
): Promise<JSONObject> {
  let info
  try {
    info = await stat(file)
  } catch {
    return wire.readFailure('fileNotFound', shown)
  }
  if (info.isDirectory())
    return wire.readFailure('invalidFile', shown, { key: 'reason', value: 'Path is a directory, not a file' })
  if (!info.isFile())
    return wire.readFailure('invalidFile', shown, { key: 'reason', value: 'Path is neither a file nor a directory' })
  let data: Buffer
  try {
    data = await readFile(file)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') return wire.readFailure('permissionDenied', shown)
    return wire.readFailure('error', shown, { key: 'error', value: messageOf(error) })
  }
  const size = data.length
  switch (readKind(data.subarray(0, 8192))) {
    case 'image':
      return wire.readData(shown, shrinkImage(data), size)
    case 'binary':
      if (isPDF(shown) || isVideo(shown)) return wire.readData(shown, data, size)
      return wire.readFailure('invalidFile', shown, { key: 'reason', value: binaryRefusal(shown) })
    case 'text': {
      if (isPDF(shown)) return wire.readData(shown, data, size)
      const content = decodeText(data)
      const total = countLines(content)
      const ranged = readRange(content, total, offset, limit)
      const capped = capText(ranged.content)
      return wire.readText({
        path: shown,
        content: capped.content,
        totalLines: total,
        fileSize: size,
        truncated: capped.truncated,
        rangeApplied: ranged.applied,
      })
    }
  }
}

interface CurrentStream {
  abort: AbortController
  reason?: StreamEnding
  done: boolean
}

/** The stream, the outbox and the requests in flight (`SandLocalExecProvider`). */
export class HandsProvider {
  readonly root: string
  readonly home: string
  readonly terminalsFolder: string
  readonly shell: ShellHost
  readonly background: BackgroundShells
  private readonly flavor: PathFlavor
  private readonly pingMs: number
  private readonly stallMs: number
  private readonly heartbeatMs: number
  private readonly postGapMs: number
  private target?: Target
  private providerId?: string
  private outbox: JSONValue[] = []
  private flushing = false
  private flushed: Promise<void> = Promise.resolve()
  private execIds = 0
  private readonly inFlight = new Map<string, Promise<void>>()
  private readonly cancelled = new Set<string>()
  private readonly cancelListeners = new Map<string, () => void>()
  private lastChunk = 0
  private current?: CurrentStream
  private stopped = false
  /** The shell's version once asked (`$PSVersionTable.PSVersion`), for the hello. */
  private shellVersion?: string
  private readonly versionAsked: Promise<void>

  constructor(private readonly options: HandsOptions) {
    this.flavor = options.flavor ?? path
    this.root = options.root
    this.home = options.home
    this.terminalsFolder = this.flavor.join(options.root, 'terminals')
    this.shell = new ShellHost(options.root, options.system)
    this.background = new BackgroundShells(this.terminalsFolder)
    this.pingMs = options.timing?.pingMs ?? LocalExec.pingSeconds * 1000
    this.stallMs = options.timing?.stallMs ?? LocalExec.stallSeconds * 1000
    this.heartbeatMs = options.timing?.heartbeatMs ?? LocalExec.execHeartbeatSeconds * 1000
    this.postGapMs = options.timing?.postGapMs ?? 200
    this.versionAsked = askShellVersion(options.system, options.root).then((version) => {
      this.shellVersion = version
    })
  }

  /** Whether a stream is open now. */
  get streaming(): boolean {
    return this.current != null
  }

  // MARK: The stream

  /**
   * One stream (`stream(connected:)`): opened with the gateway's headers,
   * this PC's hello first, then a ping every 10 s; 35 s without a byte ends
   * it. Resolves when it ends, saying how. A stream already open is ended
   * first.
   */
  async openStream(target: Target): Promise<StreamEnd> {
    if (this.stopped) return { connected: false, ended: 'stopped' }
    this.endStream('ended')
    this.target = target
    const current: CurrentStream = { abort: new AbortController(), done: false }
    this.current = current
    let connected = false
    let pinging: Promise<void> | undefined
    try {
      const { status, body } = await this.options.transport.stream(
        target.baseURL + wire.requestsPath,
        target.headers,
        current.abort.signal,
      )
      if (status < 200 || status >= 300) return { connected: false, ended: current.reason ?? 'failed' }
      connected = true
      this.lastChunk = Date.now()
      // The hello names the shell's version when it is known in time; else a second hello says it.
      const known = await Promise.race([this.versionAsked.then(() => true), sleep(2_000).then(() => false)])
      await this.post([this.helloFrame()], LocalExec.controlPostSeconds)
      if (!known)
        void this.versionAsked
          .then(async () => {
            if (this.current === current && !current.done && this.shellVersion != null)
              await this.post([this.helloFrame()], LocalExec.controlPostSeconds)
          })
          .catch(() => {})
      pinging = this.pingWhileOpen(current)
      const parser = new wire.EventParser()
      for await (const chunk of body) {
        this.lastChunk = Date.now()
        for (const event of parser.feed(chunk)) this.take(event)
      }
      return { connected, ended: current.reason ?? 'closed' }
    } catch {
      return { connected, ended: current.reason ?? 'failed' }
    } finally {
      current.done = true
      current.abort.abort()
      if (this.current === current) {
        this.current = undefined
        this.providerId = undefined
      }
      await pinging
    }
  }

  /** The page ended the stream (the computer's address moved), or a new one replaces it. */
  endStream(reason: StreamEnding): void {
    const current = this.current
    if (!current) return
    current.reason ??= reason
    current.abort.abort()
  }

  /** The ping every 10 s, the first at once; 35 s without a byte ends the stream. */
  private async pingWhileOpen(current: CurrentStream): Promise<void> {
    while (!current.done) {
      await this.post([wire.ping(true)], LocalExec.controlPostSeconds)
      if (current.done) return
      if (Date.now() - this.lastChunk > this.stallMs) {
        current.reason ??= 'stalled'
        current.abort.abort()
        return
      }
      await sleep(this.pingMs, current.abort.signal)
    }
  }

  /** The hello: the Mac's fields, then this PC's system and shell, so the agent writes PowerShell and Windows paths. */
  private helloFrame(): JSONObject {
    const name = (this.options.hostName ?? os.hostname()).trim()
    const shell = this.options.system.shell
    return wire.hello({
      localRoot: this.root,
      terminalsFolder: this.terminalsFolder,
      computerId: name === '' ? 'this-computer' : name,
      label: name === '' ? 'this computer' : name,
      supervised: true,
      variant: 'sand',
      platform: this.options.system.platform,
      shell: shell == null ? undefined : shellName(shell),
      shellVersion: this.shellVersion,
      osVersion: this.options.osVersion ?? systemVersion(this.options.system.platform),
    })
  }

  /**
   * Signed out, another account, or quitting: the stream ends, the commands
   * still holding a stream are stopped as a cancel stops them, the ones in
   * the background too, and all of them are waited for.
   */
  async stop(): Promise<void> {
    this.stopped = true
    this.endStream('stopped')
    for (const id of this.inFlight.keys()) {
      this.cancelled.add(id)
      this.cancelListeners.get(id)?.()
    }
    this.background.stopAll()
    await Promise.all([...this.inFlight.values()])
  }

  // MARK: Requests

  private take(event: wire.StreamEvent): void {
    switch (event.kind) {
      case 'unreadable':
        this.options.log('[local-exec-provider] dropping unparseable request frame: SyntaxError')
        return
      case 'tooLarge':
        if (event.requestId != null) this.enqueue(wire.fileError(event.requestId, LocalExec.uploadTooLarge))
        return
      case 'frame': {
        const request = wire.readRequest(event.json)
        if (!request) return
        switch (request.kind) {
          case 'welcome':
            this.providerId = wire.request.providerId(request)
            return
          case 'exec':
          case 'upload':
          case 'download': {
            if (this.stopped) return
            const id = request.requestId
            const task = (async () => {
              try {
                await this.handle(request)
              } catch {
                // Each request says its own failure; nothing else is left to say.
              } finally {
                this.finished(id)
              }
            })()
            this.inFlight.set(id, task)
            return
          }
          case 'cancel':
            // Seen by the command waiting to end; one gone to the background goes on.
            if (this.inFlight.has(request.requestId)) {
              this.cancelled.add(request.requestId)
              this.cancelListeners.get(request.requestId)?.()
            }
            return
          case 'retire-approval': {
            const approvalId = wire.request.approvalId(request)
            if (approvalId != null) this.options.approvals.retire(approvalId)
            return
          }
          default:
            return
        }
      }
    }
  }

  private finished(requestId: string): void {
    this.inFlight.delete(requestId)
    this.cancelled.delete(requestId)
    this.cancelListeners.delete(requestId)
  }

  private async handle(request: wire.WireRequest): Promise<void> {
    switch (request.kind) {
      case 'exec':
        return this.exec(request)
      case 'download':
        return this.download(request)
      case 'upload':
        return this.upload(request)
    }
  }

  /** The places that hold keys, then the setting (`isLocalUseBlocked`). */
  private refusal(
    request: LocalToolRequest | undefined,
    approvalId: string | undefined,
    folders?: readonly string[],
  ): string | undefined {
    return refusal({
      request,
      approvalId,
      permission: this.options.permission(),
      live: this.options.approvals.live(),
      terminalsFolder: this.terminalsFolder,
      places: this.options.places,
      folders,
    })
  }

  private async exec(request: wire.WireRequest): Promise<void> {
    const requestId = request.requestId
    const message = wire.request.serverMessage(request)
    if (!wire.isObject(message)) {
      this.enqueue(wire.control(requestId, wire.thrown(0, 'local-exec exec request carried no server message')))
      return
    }
    const { kind, value } = wire.command(message)
    const described = describe(kind, value, this.terminalsFolder)
    // The folder the command would run in (the one asked for, else where the shell is), as written and where it really is (links, junctions and short names worked out, as `contain` does).
    let folders: string[] | undefined
    if (kind === 'shellStreamArgs' || kind === 'backgroundShellSpawnArgs') {
      const asked = text(field(value, 'workingDirectory'))?.trim() ?? ''
      const folder = asked === '' ? this.shell.saidFolder : resolveAgainst(asked, this.root, this.flavor)
      const real = await realpathNearestExisting(folder, this.flavor)
      folders = real === folder ? [folder] : [folder, real]
    }
    const reason = this.refusal(described, wire.request.approvalId(request), folders)
    if (reason) {
      this.enqueue(wire.control(requestId, wire.thrown(0, reason)))
      return
    }
    this.execIds += 1
    const id = this.execIds
    const started = Date.now()
    const beat = setInterval(() => this.enqueue(wire.control(requestId, wire.heartbeat(id))), this.heartbeatMs)
    const send = (messageKind: string, payload: JSONValue) =>
      this.enqueue(
        wire.client(requestId, wire.clientMessage(id, messageKind, payload, Date.now() - started)),
      )
    try {
      switch (kind) {
        case 'shellStreamArgs':
          await this.shellStream(value, requestId, started, (event) => send('shellStream', event))
          break
        case 'backgroundShellSpawnArgs':
          send('backgroundShellSpawnResult', await this.spawnInBackground(value))
          break
        case 'readArgs':
          send('readResult', await this.read(value))
          break
        case 'lsArgs':
          await this.list(value)
          break
        default:
          this.options.log(LocalExec.noHandler(kind))
          this.enqueue(wire.control(requestId, wire.thrown(id, LocalExec.noHandler(kind))))
      }
      this.enqueue(wire.control(requestId, wire.streamClose(id)))
    } catch (error) {
      const said = messageOf(error)
      this.enqueue(wire.control(requestId, wire.thrown(id, said, `Error: ${said}`)))
    } finally {
      clearInterval(beat)
    }
  }

  // MARK: Commands

  /**
   * A command with its output streamed (`ShellStreamRun`): the folder
   * notice, `start`, the output, then its `exit`; or, once it has held the
   * stream as long as it may, `backgrounded` and its terminal file. A
   * cancel before that stops it and all it started; after, it goes on.
   */
  private async shellStream(
    args: JSONValue,
    requestId: string,
    started: number,
    send: (event: JSONValue) => void,
  ): Promise<void> {
    const commandText = text(field(args, 'command')) ?? ''
    const folder = workingDirectory(text(field(args, 'workingDirectory')) ?? '', this.root, isFolder, this.flavor)
    if (folder.notice) send(wire.shellOutput('stderr', folder.notice))
    send(wire.shellStart)
    const backgroundBehavior = field(args, 'timeoutBehavior') === 'TIMEOUT_BEHAVIOR_BACKGROUND'
    // Only a hard timeout above 0 is one (`args.hardTimeout > 0`).
    const hard = int(field(args, 'hardTimeout'))
    const hardTimeout = hard != null && hard > 0 ? hard : undefined
    const block = LocalExec.blockMs({
      timeout: int(field(args, 'timeout')) ?? 0,
      isBackground: field(args, 'isBackground') === true,
      timeoutBehaviorBackground: backgroundBehavior,
      hardTimeout,
    })
    const pipeStdin = backgroundBehavior && field(args, 'closeStdin') !== true
    const cwd = folder.path === '' ? this.shell.cwd : folder.path
    const process = await this.shell.spawn(commandText, cwd, pipeStdin)

    // Output in order, each stream's bytes read as UTF-8 across the pipe's pieces, Windows' line ends made the Mac's (a `\r` at a piece's end held until the next says).
    let forwarding = true
    const lines = { stdout: new LineEnds(), stderr: new LineEnds() }
    const sendWords = (stream: 'stdout' | 'stderr', words: string) => {
      if (words !== '') send(wire.shellOutput(stream, words))
    }
    process.onOutput((stream, data) => {
      if (forwarding) sendWords(stream, lines[stream].write(data))
    })
    const flushLines = () => {
      if (!forwarding) return
      for (const stream of ['stdout', 'stderr'] as const) sendWords(stream, lines[stream].end())
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const ending = await new Promise<'exited' | 'timedOut' | 'cancelled'>((resolve) => {
      void process.waitForExit().then(() => resolve('exited'))
      if (backgroundBehavior || block > 0)
        timer = setTimeout(() => resolve('timedOut'), Math.min(block, LocalExec.longestTimerMs))
      this.cancelListeners.set(requestId, () => resolve('cancelled'))
      if (this.cancelled.has(requestId)) resolve('cancelled')
    })
    clearTimeout(timer)
    this.cancelListeners.delete(requestId)
    const localMs = () => Date.now() - started

    switch (ending) {
      case 'exited': {
        const exit = await process.waitForExit()
        flushLines()
        this.shell.adopt(process)
        send(wire.shellExit({ code: exit.code ?? 0, cwd: this.shell.saidFolder, aborted: false, localMs: localMs() }))
        return
      }
      case 'cancelled':
        await this.stopCommand(process)
        flushLines()
        send(
          wire.shellExit({
            code: -1,
            cwd: this.shell.saidFolder,
            aborted: true,
            abortReason: 'SHELL_ABORT_REASON_USER_ABORT',
            localMs: localMs(),
          }),
        )
        return
      case 'timedOut':
        if (backgroundBehavior) {
          // What was already sent goes first, so no output follows `backgrounded`; its terminal file starts with what it printed so far.
          flushLines()
          forwarding = false
          const shellId = this.background.adopt(process, {
            command: commandText,
            cwd,
            title: text(field(args, 'description')),
            shell: this.shell,
            startedAt: started,
            hardTimeoutMs: hardTimeout,
          })
          send(
            wire.shellBackgrounded({
              shellId,
              command: commandText,
              workingDirectory: cwd,
              pid: process.pid,
              msToWait: block,
            }),
          )
          return
        }
        await this.stopCommand(process)
        flushLines()
        send(
          wire.shellExit({
            code: -1,
            cwd: this.shell.saidFolder,
            aborted: true,
            abortReason: 'SHELL_ABORT_REASON_TIMEOUT',
            localMs: localMs(),
          }),
        )
        return
    }
  }

  private async stopCommand(process: ShellProcess): Promise<void> {
    process.terminate()
    await process.waitForExit()
  }

  /** `backgroundShellSpawnArgs`: started straight into the background, its terminal file from the start. */
  private async spawnInBackground(args: JSONValue): Promise<JSONObject> {
    const commandText = text(field(args, 'command')) ?? ''
    const folder = workingDirectory(text(field(args, 'workingDirectory')) ?? '', this.root, isFolder, this.flavor)
    const cwd = folder.path === '' ? this.shell.cwd : folder.path
    try {
      const process = await this.shell.spawn(commandText, cwd, false)
      const shellId = this.background.adopt(process, {
        command: commandText,
        cwd,
        title: text(field(args, 'description')),
        shell: this.shell,
      })
      return wire.spawnSuccess({ shellId, command: commandText, workingDirectory: cwd, pid: process.pid })
    } catch (error) {
      return wire.spawnError(commandText, cwd, messageOf(error))
    }
  }

  // MARK: Files

  /**
   * Inside the root, also once links are followed (`containPath`): the path
   * as the root sees it (`shown`, what the answers name) and where it
   * really is (`real`, links, junctions and short names worked out), which
   * is checked against the places that hold keys again, and is what is
   * then read or written, so a link changed after the check is not
   * followed (it narrows the moment, without closing it: a folder on the
   * way could still be swapped between the check and the open).
   */
  async contain(target: string): Promise<{ shown: string; real: string }> {
    const resolved = resolveAgainst(target, this.root, this.flavor)
    if (escapesRoot(this.root, resolved, this.flavor)) throw new HandsError(LocalExec.outsideRoot(target))
    const realRoot = await realpathNearestExisting(this.root, this.flavor)
    const realResolved = await realpathNearestExisting(resolved, this.flavor)
    if (escapesRoot(realRoot, realResolved, this.flavor)) throw new HandsError(LocalExec.throughSymlink(target))
    for (const one of [resolved, realResolved]) {
      const sensitive = sensitiveRefusal('read-file', one, this.options.places)
      if (sensitive) throw new HandsError(sensitive)
    }
    return { shown: resolved, real: realResolved }
  }

  /** A read (`readArgs`): the places that hold keys and the root checked on what is read, too large, then the read executor's answers. */
  private async read(args: JSONValue): Promise<JSONObject> {
    const target = resolveReadPath(text(field(args, 'path')) ?? '', this.root, this.home, this.flavor)
    const sensitive = sensitiveRefusal('read-file', target, this.options.places)
    if (sensitive) throw new HandsError(sensitive)
    const contained = await this.contain(target)
    const size = await regularFileSize(contained.real)
    if (size != null && size > LocalExec.maxFileBytes)
      return wire.readFailure('error', contained.shown, { key: 'error', value: LocalExec.fileTooLarge(size) })
    return readLocalFile(
      contained.real,
      int(field(args, 'offset')),
      int(field(args, 'limit')),
      this.options.shrinkImage,
      contained.shown,
    )
  }

  /** A folder's listing (`lsArgs`): the shipped one answers for a missing path or a file, and fails on a real folder. */
  private async list(args: JSONValue): Promise<void> {
    const contained = await this.contain(text(field(args, 'path')) ?? '')
    let info
    try {
      info = await stat(contained.real)
    } catch {
      throw new HandsError(`Path does not exist: ${contained.shown}`)
    }
    if (!info.isDirectory()) throw new HandsError(`Path is not a directory: ${contained.shown}`)
    throw new HandsError('')
  }

  /** CopyToBox (`download`): the file whole, or why not. */
  private async download(request: wire.WireRequest): Promise<void> {
    const requestId = request.requestId
    const target = wire.request.path(request) ?? ''
    const reason = this.refusal(
      { action: 'read-file', target, attachToResourcePath: target },
      wire.request.approvalId(request),
    )
    if (reason) {
      this.enqueue(wire.fileError(requestId, reason))
      return
    }
    try {
      const contained = await this.contain(target)
      const size = await regularFileSize(contained.real)
      if (size != null && size > LocalExec.maxFileBytes) throw new HandsError(LocalExec.fileTooLarge(size))
      const data = await readFile(contained.real)
      this.enqueue(wire.file(requestId, data.toString('base64')))
    } catch (error) {
      this.enqueue(wire.fileError(requestId, messageOf(error)))
    }
  }

  /** CopyFromBox (`upload`): written beside the target and moved over it. */
  private async upload(request: wire.WireRequest): Promise<void> {
    const requestId = request.requestId
    const target = wire.request.path(request) ?? ''
    const reason = this.refusal({ action: 'write-file', target }, wire.request.approvalId(request))
    if (reason) {
      this.enqueue(wire.fileError(requestId, reason))
      return
    }
    const base64 = wire.request.bytesBase64(request) ?? ''
    // The size it would be, in the read's words; the frame's own cap is the parser's.
    const approximate = Math.floor((Buffer.byteLength(base64, 'utf8') * 3) / 4)
    if (approximate > LocalExec.maxFileBytes) {
      this.enqueue(wire.fileError(requestId, LocalExec.fileTooLarge(approximate)))
      return
    }
    try {
      const contained = await this.contain(target)
      // As strict as Foundation's `Data(base64Encoded:)`: nothing but the alphabet, whole quads.
      if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
        throw new HandsError('The upload was not valid base64.')
      await writeAtomically(Buffer.from(base64, 'base64'), contained.real, this.flavor)
      this.enqueue(wire.file(requestId))
    } catch (error) {
      this.enqueue(wire.fileError(requestId, messageOf(error)))
    }
  }

  // MARK: The outbox

  /** Queued in order; one flusher posts what is queued as one batch, then the next. */
  enqueue(frame: JSONValue): void {
    this.outbox.push(frame)
    if (this.flushing) return
    this.flushing = true
    this.flushed = this.flush()
  }

  /** Every answer sent (or dropped): the tests wait for it. */
  get settled(): Promise<void> {
    return this.flushed
  }

  /**
   * A batch the computer did not take is kept and sent again, with what was
   * queued since, after each of `answerRetrySeconds`; then dropped. Once the
   * hands have stopped (signed out, quitting), each answer goes once, with
   * its three tries, and is not kept for the old address.
   */
  private async flush(): Promise<void> {
    let retries = 0
    while (this.outbox.length > 0) {
      const batch = this.outbox
      this.outbox = []
      if (await this.post(batch, LocalExec.dataPostSeconds)) {
        retries = 0
        continue
      }
      const wait = this.stopped ? undefined : LocalExec.answerRetrySeconds[retries]
      if (wait == null) {
        this.options.log(`[local-exec-provider] dropping ${batch.length}-frame response batch after ${retries} retries`)
        retries = 0
        continue
      }
      this.outbox = [...batch, ...this.outbox]
      await sleep(wait * 1000)
      retries += 1
    }
    this.flushing = false
  }

  /**
   * Three tries, 200 ms apart: false when the computer did not take it and
   * it may go again (`answerRetried`); one refused for good is dropped.
   * Either is said in the log, by the frames' count and the status, never
   * the address or what the frames held.
   */
  private async post(frames: JSONValue[], deadlineSeconds: number): Promise<boolean> {
    const target = this.target
    if (!target) {
      this.options.log(`[local-exec-provider] ${frames.length}-frame response batch not sent: no address for the computer`)
      return false
    }
    const body = JSON.stringify(wire.batch(this.providerId, frames))
    let last = ''
    let status = 0
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answer = await this.options.transport.post(
        target.baseURL + wire.responsesPath,
        target.headers,
        body,
        deadlineSeconds * 1000,
      )
      status = answer.status
      if (status >= 200 && status < 300) return true
      last = status !== 0 ? `Error (http_${status})` : (answer.failure ?? 'Error')
      if (attempt < 2) await sleep(this.postGapMs)
    }
    if (LocalExec.answerRetried(status)) {
      this.options.log(`[local-exec-provider] ${frames.length}-frame response batch failed 3 POSTs: ${last}`)
      return false
    }
    this.options.log(`[local-exec-provider] dropping ${frames.length}-frame response batch after 3 failed POSTs: ${last}`)
    return true
  }
}

/** `powershell` (Windows PowerShell 5.1) or `pwsh` (PowerShell 7), by the program's name. */
export function shellName(program: string): 'powershell' | 'pwsh' {
  const name = program.replace(/\\/g, '/').split('/').at(-1)?.toLowerCase() ?? ''
  return name.startsWith('pwsh') ? 'pwsh' : 'powershell'
}

/** The system as the hello says it: Windows' own name and number ("Windows 11 Pro 10.0.22631"), elsewhere its kind and release. */
export function systemVersion(platform: string): string {
  return platform === 'win32' ? `${os.version()} ${os.release()}`.trim() : `${os.type()} ${os.release()}`
}

/** The shell's version (`$PSVersionTable.PSVersion`), asked once without the person's profile, ten seconds at most; undefined when it doesn't say. */
export function askShellVersion(system: ShellSystem, root: string): Promise<string | undefined> {
  const shell = system.shell
  if (!shell) return Promise.resolve(undefined)
  return new Promise((done) => {
    try {
      execFile(
        shell,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'],
        {
          cwd: isFolder(root) ? root : undefined,
          env: shellEnvironment(system.environment, root, system.platform),
          timeout: 10_000,
          windowsHide: true,
          maxBuffer: 64 * 1024,
        },
        (error, stdout) => {
          const version = String(stdout).trim()
          done(!error && /^\d+(\.\d+){1,3}(-[\w.]+)?$/.test(version) ? version : undefined)
        },
      )
    } catch {
      done(undefined)
    }
  })
}

/** Text as it comes, Windows' line ends (`\r\n`) made `\n`; a `\r` at a piece's end held until the next piece says. */
export class LineEnds {
  private readonly decoder = new StringDecoder('utf8')
  private held = ''

  write(data: Buffer): string {
    return this.take(this.held + this.decoder.write(data), false)
  }

  end(): string {
    return this.take(this.held + this.decoder.end(), true)
  }

  private take(text: string, last: boolean): string {
    this.held = ''
    let out = text
    if (!last && out.endsWith('\r')) {
      this.held = '\r'
      out = out.slice(0, -1)
    }
    return out.replace(/\r\n/g, '\n')
  }
}

// The server's side of the computer's rebuild
// (ios/SimeonCore/Sources/SimeonCore/MigrationWatch.swift, and
// `LiveBackend.updateComputer`, `resetComputer` and `migrations` in
// Backend.swift; `box-migration-watcher.ts` and `box-host-connector.ts` in
// the Electron app): the two calls that rebuild the computer
// (`RecreateSandBox`, `ForceRecreateSandBox`) and what they answered, and
// the server's record of the computer being replaced, followed while the
// window is open (`WatchSandBoxMigration`, a Connect server stream:
// `server/simeon/sand/connect.py`).

import { SimeonAPI, SimeonAPIError } from './api'
import type { AgentBackend } from './backend'
import { LiveBackend } from './backend'
import {
  type MigrationEvent,
  isTerminal,
  migrationEventFrom,
  sameOperation,
} from './computerRebuild'
import { type JSONValue, bool, field, parseJSON, str, text } from './json'
import { t } from './l10n'

// MARK: Connect's stream

/** One frame of a Connect server stream: a message, or the end (with its error's words, if it ended on one). */
export type ConnectFrame =
  | { kind: 'message'; json: JSONValue }
  | { kind: 'end'; error?: string }

/**
 * A Connect server stream's body (`ConnectEnvelopes`): each message an
 * envelope of one flags byte, a four-byte big-endian length and the JSON;
 * the last has flags 0x02 and carries `{}` or `{error}`.
 */
export class ConnectEnvelopes {
  private buffer = new Uint8Array(0)
  private readonly decoder = new TextDecoder()

  /** Bytes as they arrive; the frames they finished. */
  feed(bytes: Uint8Array): ConnectFrame[] {
    const joined = new Uint8Array(this.buffer.length + bytes.length)
    joined.set(this.buffer, 0)
    joined.set(bytes, this.buffer.length)
    let buffer = joined
    const frames: ConnectFrame[] = []
    while (buffer.length >= 5) {
      const flags = buffer[0]!
      const length =
        ((buffer[1]! << 24) |
          (buffer[2]! << 16) |
          (buffer[3]! << 8) |
          buffer[4]!) >>>
        0
      if (buffer.length < 5 + length) break
      const body = buffer.subarray(5, 5 + length)
      buffer = buffer.subarray(5 + length)
      const json = parseJSON(this.decoder.decode(body)) ?? {}
      if ((flags & 0x02) !== 0) {
        const error = field(json, 'error')
        frames.push({
          kind: 'end',
          error:
            error === undefined
              ? undefined
              : (text(field(error, 'message')) ??
                text(field(error, 'code')) ??
                'the stream failed'),
        })
      } else {
        frames.push({ kind: 'message', json })
      }
    }
    this.buffer = buffer.slice()
    return frames
  }

  /** One message as an envelope, for the request's body. */
  static envelope(message: JSONValue): Uint8Array<ArrayBuffer> {
    const body = new TextEncoder().encode(JSON.stringify(message))
    const out = new Uint8Array(5 + body.length)
    out[0] = 0
    out[1] = (body.length >>> 24) & 0xff
    out[2] = (body.length >>> 16) & 0xff
    out[3] = (body.length >>> 8) & 0xff
    out[4] = body.length & 0xff
    out.set(body, 5)
    return out
  }
}

/** How long the stream may stay silent before it is dropped and dialled again (the Mac's `timeoutInterval`, 60 s). */
const streamSilenceMs = 60_000

/** A server stream whose connection ended before the server's last frame (MigrationWatch.swift's `ConnectStreamCut`): cut, not ended by the server. */
export class ConnectStreamCut extends Error {
  constructor() {
    super('The stream was cut before its end.')
    this.name = 'ConnectStreamCut'
  }
}

/**
 * A server stream on the box broker, Connect JSON enveloped, message by
 * message, until it ends or `signal` aborts (`SimeonAPI.connectStream`).
 * Read with the browser's own fetch, which can send the request's body.
 */
export async function* connectStream(
  api: SimeonAPI,
  method: string,
  message: JSONValue,
  signal: AbortSignal,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): AsyncGenerator<JSONValue> {
  const token = await api.accessToken()
  // Stopped while the token was read (a sign-out, the stall watchdog): nothing is sent.
  if (signal.aborted) return
  if (token == null)
    throw new SimeonAPIError(t('Sign in to Simeon first.'), 401)
  const ended = new AbortController()
  const stop = () => ended.abort()
  signal.addEventListener('abort', stop, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const watch = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => ended.abort(), streamSilenceMs)
  }
  try {
    watch()
    const response = await fetcher(
      `${api.base}/${SimeonAPI.connectService}/${method}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/connect+json',
          'connect-protocol-version': '1',
          authorization: `Bearer ${token}`,
          ...api.clientHeaders,
        },
        body: ConnectEnvelopes.envelope(message),
        credentials: 'omit',
        signal: ended.signal,
      },
    )
    if (!response.ok)
      throw new SimeonAPIError(
        `Simeon's cloud computer answered ${method} with ${response.status}.`,
        response.status,
      )
    const reader = response.body?.getReader()
    // No body, or one that ends before the server's last frame: cut, which the relay tells from the server's own end.
    if (!reader) throw new ConnectStreamCut()
    const frames = new ConnectEnvelopes()
    try {
      for (;;) {
        watch()
        const { done, value } = await reader.read()
        if (done) throw new ConnectStreamCut()
        if (!value) continue
        for (const frame of frames.feed(value)) {
          if (frame.kind === 'message') {
            yield frame.json
          } else {
            if (frame.error !== undefined)
              throw new SimeonAPIError(frame.error, 0)
            return
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }
  } finally {
    if (timer) clearTimeout(timer)
    signal.removeEventListener('abort', stop)
  }
}

// MARK: The rebuild's calls

/**
 * What a recreate the person asked for answered (`RecreateAnswer`,
 * `box-host-connector.ts`): started, with the operation to follow; started
 * with nothing to follow it by; or refused, with the words to show.
 */
export type RecreateAnswer =
  | { kind: 'started'; operationId: string }
  | { kind: 'untrackable' }
  | { kind: 'rejected'; reason: string }

/** `RecreateSandBox` / `ForceRecreateSandBox`'s `{started, reason, operationId}` (`RecreateAnswer.read`). */
export function recreateAnswerFrom(
  answer: JSONValue,
  preserveData: boolean,
): RecreateAnswer {
  if (bool(field(answer, 'started')) !== true) {
    const reason = str(field(answer, 'reason')) ?? ''
    if (preserveData)
      return {
        kind: 'rejected',
        reason:
          reason === ''
            ? t("Couldn't update the computer. It is unchanged.")
            : t`Couldn't update the computer (${reason}). It is unchanged.`,
      }
    return {
      kind: 'rejected',
      reason:
        reason === ''
          ? t("Couldn't reset the computer. It is unchanged.")
          : t`Couldn't reset the computer (${reason}). It is unchanged.`,
    }
  }
  const operationId = text(field(answer, 'operationId'))
  return operationId !== undefined
    ? { kind: 'started', operationId }
    : { kind: 'untrackable' }
}

/** The rebuild's three calls to Simeon Labs' server (`LiveBackend`'s). */
export interface RebuildServer {
  /** Update the computer, keeping its files (`RecreateSandBox {preserveData: true, force}`). */
  updateComputer(force: boolean): Promise<RecreateAnswer>
  /** A fresh computer in place of this one (`ForceRecreateSandBox`): the sidebar's "Recover computer" and the dialog's. */
  resetComputer(): Promise<RecreateAnswer>
  /** The server's record of the computer being replaced, from an offset (`WatchSandBoxMigration {fromOffsetKey, includeFinished: true}`). */
  watchMigration(
    fromOffset: string,
    signal: AbortSignal,
  ): AsyncIterable<JSONValue>
}

/** The calls through the sign-in's own connection to Simeon Labs' server. */
export function apiRebuildServer(
  api: SimeonAPI,
  fetcher?: typeof fetch,
): RebuildServer {
  return {
    updateComputer: async (force) =>
      recreateAnswerFrom(
        await api.connect('RecreateSandBox', { preserveData: true, force }),
        true,
      ),
    resetComputer: async () =>
      recreateAnswerFrom(await api.connect('ForceRecreateSandBox', {}), false),
    watchMigration: (fromOffset, signal) =>
      connectStream(
        api,
        'WatchSandBoxMigration',
        { fromOffsetKey: fromOffset, includeFinished: true },
        signal,
        fetcher,
      ),
  }
}

/** The server's calls for the computer the window uses: through its sign-in; none without one. */
export function rebuildServerOf(
  backend: AgentBackend,
): RebuildServer | undefined {
  return backend instanceof LiveBackend && backend.api
    ? apiRebuildServer(backend.api)
    : undefined
}

// MARK: Following the server's record

/** Waits `ms`, or throws once `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Stopped.'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    }, ms)
    const stop = () => {
      clearTimeout(timer)
      reject(new Error('Stopped.'))
    }
    signal.addEventListener('abort', stop, { once: true })
  })
}

/** A timer that can be cancelled (the stall watchdog's). */
export type RelayTimer = (ms: number, work: () => void) => () => void

const systemTimer: RelayTimer = (ms, work) => {
  const timer = setTimeout(work, ms)
  return () => clearTimeout(timer)
}

/**
 * The server's record of the computer being replaced, followed while the
 * window is open (`MigrationRelay`, `createSandBoxMigrationRelay`): the
 * stream read again 3 s after it ends, from where it stopped; a stream
 * silent for 30 s while a step is under way is dropped and read again,
 * twenty times at most; and the last event (or the last finished one) kept
 * for the window to read back. While the server says the account has no
 * computer, it is asked less and less often (`reattachWaitMs`).
 */
export class MigrationRelay {
  static readonly reattachMs = 3_000
  static readonly stallMs = 30_000
  static readonly maxStallReattaches = 20
  /** The longest wait between two reads while the server says there is no computer. */
  static readonly maxReattachMs = 60_000
  /**
   * A stream the server ends this soon, with its last frame and nothing
   * before it, says the account has no computer (MigrationWatch.swift's
   * `noComputerWithin`): it ends at once for one with none
   * (`watch_sand_box_migration`), and holds a computer's open 25 s while
   * nothing happens (`MigrationLog.idle`). A connection cut before that
   * frame (`ConnectStreamCut`) says nothing.
   */
  static readonly noComputerWithinMs = 5_000

  /**
   * The wait before the stream is read again after the server said
   * `streak` times running that there is no computer: 3 s, then doubled
   * each time, 60 s at most; 3 s again once it says anything else, at a new
   * sign-in (a new relay) and when the stream is followed again (`start`).
   */
  static reattachWaitMs(streak: number): number {
    if (streak <= 1) return MigrationRelay.reattachMs
    return Math.min(
      MigrationRelay.reattachMs * 2 ** Math.min(streak - 1, 5),
      MigrationRelay.maxReattachMs,
    )
  }

  private lastUpdate?: MigrationEvent
  private lastTerminal?: MigrationEvent
  private resumeOffset = ''
  private readonly listeners = new Set<(event: MigrationEvent) => void>()
  private running?: AbortController
  private attempt?: AbortController
  private watchdog?: () => void
  private remainingStalls = 0
  private owed?: string
  /** How many reads running the server said there is no computer. */
  private noComputer = 0
  /** The wait before the next read, while it lasts. */
  private pausing?: AbortController

  constructor(
    /** Reads the stream from an offset. */
    private readonly open: (
      fromOffset: string,
      signal: AbortSignal,
    ) => AsyncIterable<JSONValue>,
    private readonly wait: (
      ms: number,
      signal: AbortSignal,
    ) => Promise<void> = pause,
    private readonly timer: RelayTimer = systemTimer,
    private readonly now: () => number = Date.now,
  ) {}

  /** What the window reads back on connecting (`getBoxMigrationStatus`). */
  get status(): MigrationEvent | undefined {
    return this.lastUpdate ?? this.lastTerminal
  }

  /** Each event as it comes, until the returned function is called. */
  listen(handler: (event: MigrationEvent) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  start(): void {
    if (this.running) return
    this.noComputer = 0
    const running = new AbortController()
    this.running = running
    void this.loop(running)
  }

  stop(): void {
    this.running?.abort()
    this.running = undefined
    this.attempt?.abort()
    this.attempt = undefined
    this.watchdog?.()
    this.watchdog = undefined
    this.owed = undefined
  }

  /** A recreate was accepted: watch for its steps (`noteRecreateAccepted`). */
  recreateAccepted(operationId: string | undefined): void {
    this.owed = operationId
    // There is a computer now (a recreate is refused without one): read again at once if it was being asked less often.
    if (this.noComputer > 1) this.pausing?.abort()
    this.noComputer = 0
    this.arm(operationId)
  }

  private async loop(running: AbortController): Promise<void> {
    while (!running.signal.aborted) {
      const from = this.resumeOffset
      const attempt = new AbortController()
      const stop = () => attempt.abort()
      running.signal.addEventListener('abort', stop, { once: true })
      this.attempt = attempt
      const began = this.now()
      let received = false
      let failed = false
      try {
        for await (const message of this.open(from, attempt.signal)) {
          if (attempt.signal.aborted) break
          received = true
          this.take(message)
        }
      } catch (error) {
        failed = true
        // A stream that failed before anything came starts over from the beginning (the offset may be gone); one cut
        // before the server's last frame is read again from where it stopped, as a stream that ended.
        if (
          !(error instanceof ConnectStreamCut) &&
          !received &&
          from !== '' &&
          !attempt.signal.aborted
        )
          this.resumeOffset = ''
      }
      running.signal.removeEventListener('abort', stop)
      this.lastUpdate = undefined
      if (this.attempt === attempt) this.attempt = undefined
      if (running.signal.aborted) break
      // Ended by the server's last frame with nothing in it, at once (not a failure, a cut connection, nor the watchdog): no computer.
      const saysNoComputer =
        !received &&
        !failed &&
        !attempt.signal.aborted &&
        this.now() - began < MigrationRelay.noComputerWithinMs
      this.noComputer = saysNoComputer ? this.noComputer + 1 : 0
      const pausing = new AbortController()
      const stopWaiting = () => pausing.abort()
      running.signal.addEventListener('abort', stopWaiting, { once: true })
      this.pausing = pausing
      try {
        await this.wait(
          MigrationRelay.reattachWaitMs(this.noComputer),
          pausing.signal,
        )
      } catch {
        // Cut short: by a stop (the loop ends), or by a recreate accepted (read again at once).
      }
      running.signal.removeEventListener('abort', stopWaiting)
      if (this.pausing === pausing) this.pausing = undefined
    }
  }

  private take(message: JSONValue): void {
    const offset = text(field(message, 'offsetKey'))
    if (offset !== undefined) this.resumeOffset = offset
    const event = migrationEventFrom(message)
    if (!event) return
    this.lastUpdate = event
    if (isTerminal(event.phase)) this.lastTerminal = event
    else if (
      this.lastTerminal !== undefined &&
      event.operationId !== undefined &&
      !sameOperation(this.lastTerminal.operationId, event.operationId)
    )
      this.lastTerminal = undefined
    if (isTerminal(event.phase)) {
      const answersOwed =
        this.owed === undefined || sameOperation(this.owed, event.operationId)
      if (answersOwed) this.disarm()
      else this.kick()
    } else {
      this.arm(event.operationId)
      this.kick()
    }
    for (const handler of [...this.listeners]) handler(event)
  }

  // MARK: The stall watchdog

  private arm(operationId: string | undefined): void {
    this.remainingStalls = MigrationRelay.maxStallReattaches
    if (this.watchdog !== undefined || this.running === undefined) return
    this.owed = operationId
    this.kick()
  }

  private kick(): void {
    if (this.running === undefined) return
    this.watchdog?.()
    this.watchdog = this.timer(MigrationRelay.stallMs, () => this.stalled())
  }

  private stalled(): void {
    if (this.remainingStalls <= 0) {
      this.disarm()
      return
    }
    this.remainingStalls -= 1
    this.attempt?.abort()
    this.kick()
  }

  private disarm(): void {
    this.watchdog?.()
    this.watchdog = undefined
    this.owed = undefined
  }
}

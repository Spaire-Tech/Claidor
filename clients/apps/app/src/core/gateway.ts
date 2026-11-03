// The person's cloud computer, as the app reaches it
// (ios/SimeonCore/Sources/SimeonCore/Gateway.swift): ask the broker where the
// box is (`EnsureSandBox`), POST each command to `{gateway}/api/{method}`,
// read events from `{gateway}/events`. Everything else happens in the host
// there; the app only asks and listens.
//
// Found and kept as the Electron app found and kept it (16 October 2026):
// - At launch, the address kept from the last launch at once, while the
//   broker is asked again in the background; once this run has a live answer,
//   the broker's answers only. A kept address is tried once.
// - A known address is used as it is while the event stream is up, or while
//   the box answered `/health` in the last 5 s; otherwise `/health` is asked
//   first (1.5 s), and only when it does not answer is the broker asked again.
// - The broker saying the box server is full (`SAND_BOX_BLOCKED`) is not
//   asked again until its `retry-after` (a minute without one, 15 at most).
// - The event stream dials again after 1, 2, 4, 8, then every 10 s, and a
//   stream silent for 35 s is dead.
// - Where the server lets the box sleep while the app is open (26 October
//   2026), reads do not wake it and the stream does not dial it while the
//   broker's record says it rests.

import { SimeonAPI, SimeonAPIError } from './api'
import { GatewayConnection, GatewayError } from './gatewayConnection'
import { FetchClient, type HTTPClient, answerJSON, isOk } from './http'
import { type JSONValue, bool, field, int, parseJSON, text } from './json'
import { note } from './recentActivity'
import {
  type SavedGatewayStore,
  decodeSavedGateway,
  encodeSavedGateway,
} from './savedGateway'

export { GatewayConnection, GatewayError } from './gatewayConnection'

/** One event from the host: `{channel, payload}` on the gateway's event stream. */
export interface GatewayEvent {
  channel: string
  payload: JSONValue
}

/**
 * The event stream, line by line (`gateway-client.ts`): a block of `data:`
 * lines ends at a blank line, and its data is one JSON `{channel, payload}`.
 * Anything else (comments, `event:` and `id:` lines, a block that is not
 * JSON) is skipped.
 */
export class EventStreamParser {
  private dataLines: string[] = []
  private pending: number[] = []
  private readonly decoder = new TextDecoder()

  /** One line, without its newline. A blank line ends the block. */
  feedLine(line: string): GatewayEvent | undefined {
    const clean = line.endsWith('\r') ? line.slice(0, -1) : line
    if (clean === '') {
      const lines = this.dataLines
      this.dataLines = []
      if (lines.length === 0) return undefined
      const event = parseJSON(lines.join('\n'))
      const channel = text(field(event, 'channel'))
      if (channel == null) return undefined
      return { channel, payload: field(event, 'payload') ?? null }
    }
    if (clean.startsWith('data:')) this.dataLines.push(clean.slice(5).trim())
    return undefined
  }

  /** Raw bytes as they arrive; returns the events they finished. */
  feedBytes(bytes: Uint8Array): GatewayEvent[] {
    const events: GatewayEvent[] = []
    for (const byte of bytes) {
      if (byte === 0x0a) {
        const line = this.decoder.decode(new Uint8Array(this.pending))
        this.pending = []
        const event = this.feedLine(line)
        if (event) events.push(event)
      } else {
        this.pending.push(byte)
      }
    }
    return events
  }
}

/** A box that rests where the server lets it: asleep, or not made yet (a new account, before its first task). */
export type Rest = 'asleep' | 'absent'

function aborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

/** Seconds, ended early when `signal` aborts. */
function sleep(seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, seconds * 1000)
    signal?.addEventListener('abort', done, { once: true })
  })
}

export interface GatewayOptions {
  api: SimeonAPI
  http?: HTTPClient
  saved?: SavedGatewayStore
  /** Seconds that only go forward, for the health and hold clocks. */
  clock?: () => number
  now?: () => Date
  /** A wait of some seconds (the tests' is at once). */
  pause?: (seconds: number, signal?: AbortSignal) => Promise<void>
}

export class Gateway {
  /** A box's `/health` answers within 1.5 s (`HEALTH_TIMEOUT_MS`)… */
  static readonly healthTimeout = 1.5
  /** …and is trusted for 5 s (`HEALTH_PROBE_TTL_MS`). */
  static readonly healthTrusted = 5
  static readonly stallSeconds = GatewayConnection.stallSeconds
  /** A full box server is not asked again for its `retry-after`, else a minute, never more than 15 minutes. */
  static readonly blockedHold = 60
  static readonly blockedHoldMax = 15 * 60
  /** The broker's refusal hints (`x-automation-failure-hint`). */
  static readonly hintHeader = 'x-automation-failure-hint'
  static readonly blockedHint = 'SAND_BOX_BLOCKED'
  static readonly noStorageHint = 'CLOUD_AGENT_STORAGE_DISABLED'
  /** While the box sleeps, the broker's record of it is read again this often. */
  static readonly asleepRecheck = 15
  /** `GetSandBoxRunState`'s asleep and none. */
  static readonly runStateHibernated = 2
  static readonly runStateAbsent = 1

  /** The wait before the event stream dials again after `failures` failures in a row: 1, 2, 4, 8, then 10 s. */
  static reconnectDelay(failures: number): number {
    return Math.min(10, 2 ** (Math.max(failures, 1) - 1))
  }

  private readonly api: SimeonAPI
  private readonly http: HTTPClient
  private readonly saved?: SavedGatewayStore
  private readonly clock: () => number
  private readonly now: () => Date
  private readonly pause: (
    seconds: number,
    signal?: AbortSignal,
  ) => Promise<void>

  private connection?: GatewayConnection
  private resolving?: Promise<GatewayConnection>
  private lastHealthyAt = -Infinity
  private healthEpoch = 0
  private streamLive = false
  /** This run has had a live answer from the broker: from then on the kept address is not used. */
  private hasLiveConnection = false
  /** The kept address has been handed out once this run. */
  private keptUsed = false
  private readonly deniedScopes = new Set<string>()
  private blocked?: { error: unknown; until: number }
  /** The box rests where the server lets it; null once it is known awake. */
  rest: Rest | null = null
  /** The server's latest word this launch on whether the box may sleep; null until it says. */
  private serverLetsSleep: boolean | null = null
  /** The launch's question, asked once. */
  private launchCheck?: Promise<void>

  constructor(options: GatewayOptions) {
    this.api = options.api
    this.http = options.http ?? new FetchClient()
    this.saved = options.saved
    this.clock = options.clock ?? (() => performance.now() / 1000)
    this.now = options.now ?? (() => new Date())
    this.pause = options.pause ?? sleep
  }

  /**
   * Where the box is now: the known address while it answers, else the
   * broker's. Not for a read that lets the box rest (`wakes` false): where
   * the server lets it sleep, a box the record says rests is not asked for,
   * which would wake it (or make it).
   */
  async currentConnection(wakes = true): Promise<GatewayConnection> {
    const cached = this.connection
    if (cached) {
      if (this.streamLive) return cached
      if (this.clock() - this.lastHealthyAt < Gateway.healthTrusted)
        return cached
      const epoch = this.healthEpoch
      if (await this.answersHealth(cached)) {
        if (epoch === this.healthEpoch) this.lastHealthyAt = this.clock()
        // It answers: awake (woken for its work since the record was read).
        this.rest = null
        return cached
      }
    }
    // A read waits for a wake already under way (an action's); otherwise it lets a resting box rest.
    if (!wakes && this.resolving == null) await this.holdWhileResting(true)
    if (!this.hasLiveConnection && !this.keptUsed) {
      const kept = this.keptConnection()
      if (kept) {
        // The fast path: the kept address now, the broker asked meanwhile (its answer replaces it when it comes).
        this.keptUsed = true
        this.live().catch(() => {})
        this.connection = kept
        this.lastHealthyAt = -Infinity
        return kept
      }
    }
    return this.live()
  }

  /** Forget where the box was: the next call asks the broker again (a restarted box can move). */
  invalidate(): void {
    this.connection = undefined
    this.keptUsed = true
    this.lastHealthyAt = -Infinity
  }

  /** A broker call is out (for the tests). */
  get isAskingBroker(): boolean {
    return this.resolving != null
  }

  /** The stream is up: its address needs no `/health` while it lasts. */
  streamConnected(): void {
    this.streamLive = true
    this.rest = null
  }

  /** The stream dropped: the next call asks `/health` before it trusts the address. */
  streamDropped(): void {
    this.streamLive = false
    this.healthEpoch += 1
    this.lastHealthyAt = -Infinity
  }

  /** The address kept from an earlier launch, for the account signed in now. */
  private keptConnection(): GatewayConnection | undefined {
    const scope = this.api.accountScope
    if (!this.saved || scope == null || this.deniedScopes.has(scope))
      return undefined
    return decodeSavedGateway(this.saved.read(), scope, this.now())
  }

  /** One `EnsureSandBox` at a time; its answer becomes the address and is kept for the next launch. */
  private live(): Promise<GatewayConnection> {
    if (this.resolving) return this.resolving
    const held = this.blocked
    if (held && this.clock() < held.until) return Promise.reject(held.error)
    const scope = this.api.accountScope
    const task = (async () => {
      // `resolving` is set before the answer can be read.
      await Promise.resolve()
      try {
        const fresh = GatewayConnection.fromBox(
          await this.api.connect('EnsureSandBox'),
        )
        this.answered(fresh, scope)
        return fresh
      } catch (error) {
        this.refused(error, scope)
        throw error
      }
    })()
    this.resolving = task
    return task
  }

  private answered(fresh: GatewayConnection, scope: string | null): void {
    this.resolving = undefined
    this.blocked = undefined
    // The broker answered: the box is awake (woken for an action here, or made).
    this.rest = null
    // Signed out, or into another account, while the broker answered: nothing is kept.
    if (this.api.accountScope !== scope) return
    this.hasLiveConnection = true
    this.connection = fresh
    this.serverLetsSleep = fresh.letsSleep
    this.lastHealthyAt = -Infinity
    if (scope != null) {
      this.deniedScopes.delete(scope)
      this.saved?.write(encodeSavedGateway(fresh, scope, this.now()))
    }
  }

  private refused(error: unknown, scope: string | null): void {
    this.resolving = undefined
    if (!(error instanceof SimeonAPIError)) return
    const hint = error.header(Gateway.hintHeader)
    if (hint === Gateway.blockedHint) {
      const said = Number(error.header('retry-after') ?? '')
      const retryAfter = Number.isFinite(said) && said > 0 ? said : undefined
      this.blocked = {
        error,
        until:
          this.clock() +
          Math.min(retryAfter ?? Gateway.blockedHold, Gateway.blockedHoldMax),
      }
    }
    // Refused for this account (no access, no storage): its kept address goes.
    const denied =
      hint === Gateway.noStorageHint ||
      (hint == null && (error.status === 401 || error.status === 403))
    if (denied && scope != null && this.api.accountScope === scope) {
      this.deniedScopes.add(scope)
      this.saved?.write(null)
    }
  }

  /**
   * After the stream dropped, a box the server lets sleep and records as
   * asleep, or not made yet, is not dialled: dialling would wake it, or make
   * it. This waits, telling `onAsleep`, until the record says it runs, or
   * until something here needed it and the broker woke it. True when it
   * waited; false when the box is not known to rest. With `ask` false it
   * waits only for a rest already known (the launch's question). A record
   * that says it runs ends the asleep state (`onAsleep(false)`).
   */
  async waitWhileAsleep(
    onAsleep: (asleep: boolean) => void,
    options: { ask?: boolean; signal?: AbortSignal } = {},
  ): Promise<boolean> {
    const ask = options.ask ?? true
    await this.checkedAtLaunch()
    if (!this.letsSleep) return false
    if (this.rest == null) {
      if (!ask) return false
      const record = await this.recordNow()
      if (!record) return false
      // Running, or the server no longer lets it sleep: dialled, and a failure to reach it shows.
      if (!this.letsSleep || record.rest == null) {
        onAsleep(false)
        return false
      }
      this.rest = record.rest
    }
    onAsleep(true)
    let waited = 0
    while (!options.signal?.aborted) {
      await this.pause(1, options.signal)
      if (this.rest == null) return true
      waited += 1
      if (waited >= Gateway.asleepRecheck) {
        waited = 0
        const record = await this.recordNow()
        if (!record) continue
        this.rest = this.letsSleep ? record.rest : null
        if (this.rest == null) return true
      }
    }
    return true
  }

  /**
   * The server is waking the box (a message handed to it): the event stream,
   * resting, would look again only every 15 s, so it dials now.
   */
  waking(): void {
    this.rest = null
  }

  /** The broker's record of the box (`GetSandBoxRunState` with `fromRecord`); null when it could not be asked. */
  private async recordNow(): Promise<{ rest: Rest | null } | null> {
    let answer: JSONValue
    try {
      answer = await this.api.connect('GetSandBoxRunState', {
        fromRecord: true,
      })
    } catch {
      return null
    }
    const state = int(field(answer, 'state'))
    const named = text(field(answer, 'state'))
    const rest: Rest | null =
      state === Gateway.runStateHibernated ||
      named === 'SAND_BOX_RUN_STATE_HIBERNATED'
        ? 'asleep'
        : state === Gateway.runStateAbsent ||
            named === 'SAND_BOX_RUN_STATE_ABSENT'
          ? 'absent'
          : null
    const says = bool(field(answer, 'letsSleep'))
    if (says != null) this.serverLetsSleep = says
    return { rest }
  }

  /**
   * Whether the server lets the box sleep while the app is open, by its
   * latest word this launch, else the answer kept from the last launch.
   * False wherever it never said so.
   */
  get letsSleep(): boolean {
    return this.serverLetsSleep ?? this.keptConnection()?.letsSleep ?? false
  }

  /**
   * The launch's one question: before anything here would wake the box (or
   * make a new account's), the record is asked, where the server let it
   * sleep at the last launch or nothing was kept. Once, and not after the
   * broker has answered.
   */
  checkedAtLaunch(): Promise<void> {
    this.launchCheck ??= this.checkAtLaunch()
    return this.launchCheck
  }

  private async checkAtLaunch(): Promise<void> {
    if (this.hasLiveConnection) return
    const kept = this.keptConnection()
    if (kept && !kept.letsSleep) return
    const record = await this.recordNow()
    if (!record || !this.letsSleep || this.hasLiveConnection) return
    this.rest = record.rest
  }

  /** Where the box rests, once the launch's question is answered (the first run's gate). */
  async restAtLaunch(): Promise<Rest | null> {
    await this.checkedAtLaunch()
    return this.letsSleep ? this.rest : null
  }

  /** Whether the box answers `/health` within 1.5 s with `ok`. */
  private async answersHealth(connection: GatewayConnection): Promise<boolean> {
    try {
      const answer = await this.http.send({
        url: connection.baseURL + '/health',
        method: 'GET',
        headers: connection.headers(),
        timeoutSeconds: Gateway.healthTimeout,
      })
      return isOk(answer) && field(answerJSON(answer), 'ok') === true
    } catch {
      return false
    }
  }

  /**
   * One command. A call that never reached the box (no connection, a moved
   * box) asks the broker once more and is sent once more; any other failure
   * is the caller's. A read that lets the box rest (`wakes` false) does not
   * wake a box the server lets sleep, nor make a new account's: while it
   * rests, it fails at once (`GatewayError.resting()`).
   */
  async command(
    method: string,
    args: JSONValue = {},
    options: { wakes?: boolean } = {},
  ): Promise<JSONValue> {
    const wakes = options.wakes ?? true
    if (!wakes) await this.holdWhileResting(false)
    try {
      return await this.send(method, args, wakes)
    } catch (error) {
      if (!GatewayError.neverArrived(error)) throw error
      // A read that found the box gone where it may sleep: asleep now, and not woken for it.
      if (!wakes) await this.holdWhileResting(true)
      this.invalidate()
      return await this.send(method, args, wakes)
    }
  }

  /**
   * A read that waits for the box, without waking it: what a screen reads
   * once and keeps nothing of. While the box rests, it waits until the box
   * is awake, then reads. Ended with the screen (`signal`).
   */
  async commandWhenAwake(
    method: string,
    args: JSONValue = {},
    signal?: AbortSignal,
  ): Promise<JSONValue> {
    for (;;) {
      try {
        return await this.command(method, args, { wakes: false })
      } catch (error) {
        if (!GatewayError.isResting(error)) throw error
        while (this.letsSleep && this.rest != null) {
          aborted(signal)
          await this.pause(1, signal)
        }
        aborted(signal)
      }
    }
  }

  /** Throws `resting` while the box rests where the server lets it: as known, or, with `ask`, as the record says now. */
  private async holdWhileResting(ask: boolean): Promise<void> {
    await this.checkedAtLaunch()
    if (!this.letsSleep) return
    if (this.rest == null && ask) {
      const record = await this.recordNow()
      if (record && this.letsSleep) this.rest = record.rest
    }
    if (this.rest != null) throw GatewayError.resting()
  }

  private async send(
    method: string,
    args: JSONValue,
    wakes: boolean,
  ): Promise<JSONValue> {
    const connection = await this.currentConnection(wakes)
    const answer = await this.http.send(connection.commandRequest(method, args))
    if (!isOk(answer)) {
      // A refusal the computer means (a 4xx: "Not now", "50 is the maximum", which the host answers with 409,
      // `statusForCommandError`) passes on its own sentence alone, the command kept apart (`method`), as the Electron
      // app's coordinator does (`gateway-client.ts`, `extractGatewayErrorMessage`; Gateway.swift's `send`): until 3
      // November 2026 the message began with the command ("Couldn't create Arlo: createAgent: Not now"). Anything else
      // (the 500 the host answers for every exception it throws, in its own words: "SQLITE_BUSY: database is locked";
      // an answer with no sentence) is the coordinator's machine line ("gateway createAgent failed: …", its
      // `http_5xx`), which plainWords hides. Each failure is noted with its command for a report.
      const parsed = answerJSON(answer)
      const sentence =
        text(field(parsed, 'error')) ?? text(field(parsed, 'message'))
      const detail = sentence ?? answer.text.slice(0, 300)
      note(`gateway ${method} ${answer.status}: ${detail}`)
      throw new GatewayError(
        answer.status < 500 && sentence !== undefined
          ? sentence
          : `gateway ${method} failed: ${detail}`,
        answer.status < 500,
        answer.status,
        method,
      )
    }
    // The box answered: awake, and the stream need not wait for the record to say so.
    this.rest = null
    return answerJSON(answer) ?? null
  }

  /**
   * The host's events until `signal` aborts, dialling again after 1, 2, 4, 8,
   * then every 10 s. A stream that was up and dropped makes the next dial
   * ask the box's `/health` first, and the broker only when that does not
   * answer. `onState` hears "connected" (true) and "down" (false).
   */
  async events(handlers: {
    onEvent: (event: GatewayEvent) => void
    onState?: (connected: boolean) => void
    onAsleep?: (asleep: boolean) => void
    signal: AbortSignal
  }): Promise<void> {
    const { signal } = handlers
    const onState = handlers.onState ?? (() => {})
    const onAsleep = handlers.onAsleep ?? (() => {})
    let failures = 0
    while (!signal.aborted) {
      // Resting where the server lets it, as the launch's question found: not dialled.
      if (await this.waitWhileAsleep(onAsleep, { ask: false, signal }))
        failures = 0
      if (signal.aborted) break
      let connected = false
      try {
        const connection = await this.currentConnection()
        const stream = await this.http.stream(
          connection.eventsRequest(),
          signal,
        )
        if (!isOk(stream))
          throw new GatewayError(`events answered ${stream.status}`, false)
        failures = 0
        connected = true
        this.streamConnected()
        onState(true)
        const parser = new EventStreamParser()
        for await (const chunk of stream.body) {
          for (const event of parser.feedBytes(chunk)) handlers.onEvent(event)
        }
      } catch {
        if (signal.aborted) {
          if (connected) this.streamDropped()
          break
        }
      }
      if (connected) this.streamDropped()
      onState(false)
      failures += 1
      // A box the server lets sleep, asleep: not dialled until it wakes for its work or something here needs it.
      if (await this.waitWhileAsleep(onAsleep, { signal })) {
        failures = 0
        continue
      }
      await this.pause(Gateway.reconnectDelay(failures), signal)
    }
  }
}

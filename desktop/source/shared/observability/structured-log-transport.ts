/**
 * Carries the engine's log entries to the server.
 *
 * Entries wait in a buffer and leave in batches, on the rounds of a polling
 * the caller provides and by the schedule in `log-ship-cadence.ts`. A batch
 * the server does not take is put back and tried again later. Whatever is
 * lost on the way (a failed try, an entry pushed out of a full buffer, one
 * grown too old, one the server said it dropped) is counted, and the counts
 * are reported to the server as entries of their own until it has taken
 * them.
 *
 * The transport reaches nothing by itself: the server's client, the polling,
 * the deadline of a shipment and the timer of the identity hold are all
 * handed to it.
 */
import type { DeadlinePolicy, ExpiryPolicy, PollingPolicy } from "../../internal/scheduling.js";
import { SandError, sandErrorTags } from "../errors/registry.js";
import { LOG_SHIP_MAX_BATCH_ENTRIES, LogShipSchedule, takeLogShipBatch, type LogShipResult } from "./log-ship-cadence.js";
import {
  BOX_LOG_EVENT,
  HOST_LOG_EVENT,
  TELEMETRY_DROPPED_EVENT,
  TELEMETRY_DROP_REASONS,
  TELEMETRY_DROP_UNIT_BY_REASON,
  TELEMETRY_SHIP_TIMEOUT_EVENT,
  type TelemetryDropReason,
} from "./telemetry-events.js";

/** How many entries may wait. Past this the oldest are pushed out. */
export const MAX_BUFFER_SIZE = 1_000;
/** How long one shipment may take. */
export const STRUCTURED_LOG_SUBMIT_DEADLINE_MS = 15_000;
/** An entry that has waited longer than this is no longer sent. */
export const STRUCTURED_LOG_REPLAY_MAX_AGE_MS = 17 * 60 * 60 * 1_000;
/** The code a failure carries when a shipment ran out of time. */
export const DEADLINE_EXPIRY_CODE = "deadline_exceeded";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

/** The levels by the numbers the server knows them under. */
export enum ClientLogLevel {
  UNSPECIFIED = 0,
  INFO = 1,
  DEBUG = 2,
  WARN = 3,
  ERROR = 4,
}

/** A log entry as it is sent. */
export interface StructuredLogEntry {
  readonly level: ClientLogLevel;
  readonly message: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly timestamp: bigint;
  readonly key: string;
}

/** A log entry as it waits. `onSettled` is told once how it ended. */
export interface BufferedStructuredLog {
  readonly level: StructuredLogLevel;
  readonly message: string;
  readonly metadata: Record<string, string>;
  readonly timestamp: number;
  readonly onSettled?: (settlement: "delivered" | "dropped") => void;
}

/** The losses counted for one reason, and how far that count has been reported to the server. */
interface DropCounter {
  observed: number;
  acknowledgedThrough: number;
}

export type DropCounters = Record<TelemetryDropReason, DropCounter>;

/** All a transport holds that is worth keeping across a restart. */
export interface StructuredLogCheckpoint {
  readonly counterId: string;
  readonly counters: DropCounters;
  readonly records: readonly BufferedStructuredLog[];
}

/** The server, as far as the transport needs it. */
export interface StructuredLogClient {
  submitLogs(
    request: { readonly logs: readonly StructuredLogEntry[] },
    options: { readonly signal: AbortSignal },
  ): Promise<{ readonly logsProcessed: number; readonly logsDropped: number }>;
}

export function isDeadlineExpiry(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return "code" in error && error.code === DEADLINE_EXPIRY_CODE;
}

/** A new name for a set of drop counters: 16 random bytes as hex. */
export function createDropCounterId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function untouchedCounter(): DropCounter {
  return { observed: 0, acknowledgedThrough: 0 };
}

export function emptyDropCounters(): DropCounters {
  return {
    ship_failed: untouchedCounter(),
    overflow_evicted: untouchedCounter(),
    replay_expired: untouchedCounter(),
    backend_dropped: untouchedCounter(),
    account_rotated: untouchedCounter(),
  };
}

/** A copy that shares nothing with the counters it was made from. */
export function cloneDropCounters(counters: DropCounters): DropCounters {
  return {
    ship_failed: { ...counters.ship_failed },
    overflow_evicted: { ...counters.overflow_evicted },
    replay_expired: { ...counters.replay_expired },
    backend_dropped: { ...counters.backend_dropped },
    account_rotated: { ...counters.account_rotated },
  };
}

/** A count the server may give: a whole number, not negative. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Whether the server's answer accounts for every entry of a shipment of `requestSize`: taken or dropped, and no more. */
export function isValidLogShipReceipt(
  response: { logsProcessed: unknown; logsDropped: unknown },
  requestSize: number,
): response is { logsProcessed: number; logsDropped: number } {
  const taken = response.logsProcessed;
  const dropped = response.logsDropped;
  return isCount(taken) && isCount(dropped) && taken + dropped === requestSize;
}

/** The labels that say something: one with no value, or an empty one, is left out. */
export function cleanStructuredLogMetadata(metadata: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(metadata)) {
    if (value !== undefined && value.length > 0) {
      kept[name] = value;
    }
  }
  return kept;
}

export function truncateStructuredLogValue(value: string, max: number): string {
  if (value.length > max) {
    return value.slice(0, max);
  }
  return value;
}

/** A level as its number. Anything that is not one of the three milder levels is an error. */
export function toClientLogLevel(level: StructuredLogLevel): ClientLogLevel {
  switch (level) {
    case "debug":
      return ClientLogLevel.DEBUG;
    case "info":
      return ClientLogLevel.INFO;
    case "warn":
      return ClientLogLevel.WARN;
    default:
      return ClientLogLevel.ERROR;
  }
}

export interface StructuredLogTransportOptions {
  /** Labels every entry carries, such as the platform and the version. An entry's own label of the same name wins. */
  readonly platformTags: Readonly<Record<string, string | undefined>>;
  /** The key every entry is sent under. */
  readonly key: string;
  /** A transport that is switched off drops every entry it is given, and polls only for a tick listener. */
  readonly disabled?: boolean;
  /** What an earlier transport held when it stopped. */
  readonly initialCheckpoint?: StructuredLogCheckpoint;
  /** Send nothing from the buffer until the identity labels are known, or `identityHoldExpiry` runs out. */
  readonly holdForIdentity?: boolean;
  readonly identityHoldExpiry?: ExpiryPolicy;
  readonly polling: PollingPolicy;
  readonly submitDeadline: DeadlinePolicy;
  createClient(): StructuredLogClient;
  /** On closing, keep what could not be sent instead of telling it that it was dropped. */
  readonly retainUndeliveredOnDispose?: boolean;
}

/** A loss not yet reported: the reason, and the count the report will say. */
interface UnreportedDrop {
  reason: TelemetryDropReason;
  through: number;
}

/** A waiting entry and its labels as objects of their own. */
function copyOf(log: BufferedStructuredLog): BufferedStructuredLog {
  return { ...log, metadata: { ...log.metadata } };
}

function isLogLine(log: BufferedStructuredLog): boolean {
  return log.message === HOST_LOG_EVENT || log.message === BOX_LOG_EVENT;
}

/** Whether the server took every entry of a shipment of `sent` and dropped none. */
function tookEverything(result: LogShipResult, sent: number): boolean {
  if (!result.delivered) {
    return false;
  }
  const receipt = result.receipt;
  return receipt !== undefined && receipt.logsProcessed === sent && receipt.logsDropped === 0;
}

/**
 * The count of what was lost, reason by reason, under the id the server
 * knows this run of counts by. A count only grows; what the server has
 * been told of it is kept beside it.
 */
class DropLedger {
  id: string;
  private counters: DropCounters;

  constructor(checkpoint: StructuredLogCheckpoint | undefined) {
    this.id = checkpoint?.counterId ?? createDropCounterId();
    this.counters = checkpoint ? cloneDropCounters(checkpoint.counters) : emptyDropCounters();
  }

  /** Adds to a reason's count, which stops at the largest whole number a count can hold. */
  add(reason: TelemetryDropReason, count: number): void {
    if (count <= 0) {
      return;
    }
    const counter = this.counters[reason];
    counter.observed += Math.min(count, Number.MAX_SAFE_INTEGER - counter.observed);
  }

  hasUnreported(): boolean {
    return TELEMETRY_DROP_REASONS.some((reason) => this.isUnreported(reason));
  }

  /** What is still to report, in the fixed order of the reasons. */
  unreported(): UnreportedDrop[] {
    return TELEMETRY_DROP_REASONS.filter((reason) => this.isUnreported(reason)).map((reason) => ({
      reason,
      through: this.counters[reason].observed,
    }));
  }

  /** The server has taken these reports. A count never goes back to an earlier report. */
  markReported(reported: readonly UnreportedDrop[]): void {
    for (const { reason, through } of reported) {
      const counter = this.counters[reason];
      counter.acknowledgedThrough = Math.max(counter.acknowledgedThrough, through);
    }
  }

  /** Starts over under a new id, all counts at zero. */
  reset(): void {
    this.id = createDropCounterId();
    this.counters = emptyDropCounters();
  }

  copyOfCounters(): DropCounters {
    return cloneDropCounters(this.counters);
  }

  private isUnreported(reason: TelemetryDropReason): boolean {
    const counter = this.counters[reason];
    return counter.observed > counter.acknowledgedThrough;
  }
}

export class StructuredLogTransport {
  private readonly platformTags: Record<string, string>;
  /** Labels that say which host this is. They are put on an entry when it is sent, not when it is queued. */
  private identityTags: Record<string, string> = {};
  private readonly schedule = new LogShipSchedule();
  private readonly drops: DropLedger;

  /** What waits to be sent, oldest first. */
  private waiting: BufferedStructuredLog[];
  /** The batch the server is being asked to take right now. */
  private inFlight: BufferedStructuredLog[] = [];

  /** Made at the first shipment, kept while shipments succeed, thrown away after one fails. */
  private client: StructuredLogClient | undefined;
  private polling: { dispose(): void } | undefined;
  private identityHold: { dispose(): void } | undefined;
  private heldForIdentity: boolean;
  private closed = false;

  /** Goes up each time pending is cleared: a shipment that started before then must not touch what came after. */
  private generation = 0;
  /** One per shipment the server has not answered yet, to call it off. */
  private readonly shipmentsInFlight = new Set<AbortController>();

  private onTick: (() => void) | undefined;
  private onFlushSettled: (() => void | Promise<void>) | undefined;

  /** The passes of the flush, one after another: each starts when the one before it has ended, however it ended. */
  private passes: Promise<boolean> = Promise.resolve(false);
  /** A full batch was waiting at some point and the buffer has not been seen empty by the eager drain since. */
  private eagerDrainWanted = false;
  private eagerDrainRunning = false;
  /** A shipment ran out of time and none has succeeded, or failed otherwise, since. */
  private inTimeoutRun = false;

  constructor(private readonly options: StructuredLogTransportOptions) {
    this.platformTags = cleanStructuredLogMetadata(options.platformTags);
    this.drops = new DropLedger(options.initialCheckpoint);
    // Of a checkpoint that holds more than the buffer does, the oldest entries are left behind.
    this.waiting = (options.initialCheckpoint?.records ?? []).slice(-MAX_BUFFER_SIZE).map(copyOf);
    this.heldForIdentity = options.holdForIdentity === true;
    if (this.heldForIdentity) {
      if (options.identityHoldExpiry === undefined) {
        throw new TypeError("identityHoldExpiry is required when holdForIdentity is true");
      }
      this.identityHold = options.identityHoldExpiry.arm("structured-log-host-identity", () => this.endIdentityHold());
    }
    this.startPollingIfNeeded();
  }

  /** Sets the labels that say which host this is, and ends the hold that waited for them. */
  setIdentityTags(tags: Readonly<Record<string, string | undefined>>): void {
    this.identityTags = cleanStructuredLogMetadata(tags);
    this.endIdentityHold();
  }

  /** `listener` is called at the start of every round of the polling. */
  setFlushTickListener(listener?: () => void): void {
    this.onTick = listener;
    if (listener !== undefined) {
      this.startPollingIfNeeded();
      return;
    }
    // A transport that is switched off polls only for its listener's sake.
    if (this.options.disabled) {
      this.polling?.dispose();
      this.polling = undefined;
    }
  }

  /** `listener` is called, and waited for, at the end of every pass of a flush. */
  setFlushSettledListener(listener?: () => void | Promise<void>): void {
    this.onFlushSettled = listener;
  }

  enqueue(
    level: StructuredLogLevel,
    message: string,
    metadata: Readonly<Record<string, string | undefined>>,
    onSettled?: BufferedStructuredLog["onSettled"],
  ): void {
    this.enqueueAt(level, message, metadata, Date.now(), onSettled);
  }

  /** Puts an entry in the buffer as of `timestamp`. A transport that is switched off or closed tells it at once that it was dropped. */
  enqueueAt(
    level: StructuredLogLevel,
    message: string,
    metadata: Readonly<Record<string, string | undefined>>,
    timestamp: number,
    onSettled?: BufferedStructuredLog["onSettled"],
  ): void {
    if (this.options.disabled || this.closed) {
      onSettled?.("dropped");
      return;
    }
    this.waiting.push({
      level,
      message,
      metadata: this.withPlatformTags(metadata),
      timestamp,
      ...(onSettled === undefined ? {} : { onSettled }),
    });
    this.pushOutOverflow();
    if (level === "error") {
      // An error should not sit out the interval.
      this.schedule.shipNext();
    }
    if (this.waiting.length >= LOG_SHIP_MAX_BATCH_ENTRIES) {
      this.eagerDrainWanted = true;
      this.startEagerDrain();
    }
  }

  /**
   * Sends one entry now, by itself, past the buffer, the hold and the
   * schedule, and says whether the server took it. A transport that is
   * switched off says yes without sending.
   */
  async shipConfirmed(level: StructuredLogLevel, message: string, metadata: Readonly<Record<string, string | undefined>>): Promise<boolean> {
    if (this.options.disabled) {
      return true;
    }
    if (this.closed) {
      return false;
    }
    const generation = this.generation;
    const entry = this.entryToSend(level, message, this.withPlatformTags(metadata), Date.now());
    const result = await this.ship([entry]);
    if (generation === this.generation) {
      this.countLossesOf(result);
    }
    return result.delivered;
  }

  /** Copies of everything not yet delivered: the batch in flight first, then what waits. */
  capturePending(): BufferedStructuredLog[] {
    return this.undelivered().map(copyOf);
  }

  captureCheckpoint(): StructuredLogCheckpoint {
    return { counterId: this.drops.id, counters: this.drops.copyOfCounters(), records: this.capturePending() };
  }

  /** Counts losses that happened outside the transport. */
  recordDropped(reason: TelemetryDropReason, count: number): void {
    this.drops.add(reason, count);
  }

  /**
   * Forgets everything pending: shipments in flight are called off, every
   * entry is told it was dropped, the counts start over under a new id and
   * the next shipment makes a new client. The promise ends when the pass
   * that was under way has ended.
   */
  clearPending(): Promise<void> {
    this.generation += 1;
    for (const shipment of this.shipmentsInFlight) {
      shipment.abort();
    }
    this.shipmentsInFlight.clear();
    this.tell(this.undelivered(), "dropped");
    this.inFlight = [];
    this.waiting = [];
    this.eagerDrainWanted = false;
    this.client = undefined;
    this.drops.reset();
    this.passes = this.passes.then(
      () => false,
      () => false,
    );
    return this.passes.then(() => undefined);
  }

  /** Sends until nothing is left or a pass gets nowhere, whatever the schedule says, and answers whether nothing is left. */
  async flushNow(): Promise<boolean> {
    if (this.closed) {
      return this.hasNothingLeft();
    }
    return await this.drain();
  }

  /**
   * Closes the transport: no more rounds, no hold, one last try to send
   * everything. What could not be sent is told it was dropped, unless the
   * transport was asked to keep it. A second call only answers whether
   * anything is left.
   */
  async dispose(): Promise<boolean> {
    if (this.closed) {
      return this.hasNothingLeft();
    }
    this.closed = true;
    this.polling?.dispose();
    this.polling = undefined;
    this.heldForIdentity = false;
    this.identityHold?.dispose();
    this.identityHold = undefined;
    const drained = await this.drain();
    if (!drained && this.options.retainUndeliveredOnDispose !== true) {
      const stranded = this.undelivered();
      this.inFlight = [];
      this.waiting = [];
      this.tell(stranded, "dropped");
    }
    return drained;
  }

  private undelivered(): BufferedStructuredLog[] {
    return [...this.inFlight, ...this.waiting];
  }

  private hasNothingLeft(): boolean {
    return this.inFlight.length + this.waiting.length === 0 && !this.drops.hasUnreported();
  }

  private withPlatformTags(metadata: Readonly<Record<string, string | undefined>>): Record<string, string> {
    return { ...this.platformTags, ...cleanStructuredLogMetadata(metadata) };
  }

  private entryToSend(level: StructuredLogLevel, message: string, metadata: Readonly<Record<string, string>>, timestamp: number): StructuredLogEntry {
    return {
      level: toClientLogLevel(level),
      message,
      metadata: { ...this.identityTags, ...metadata },
      timestamp: BigInt(timestamp),
      key: this.options.key,
    };
  }

  private tell(logs: readonly BufferedStructuredLog[], settlement: "delivered" | "dropped"): void {
    for (const log of logs) {
      log.onSettled?.(settlement);
    }
  }

  private startPollingIfNeeded(): void {
    if (this.closed || this.polling !== undefined) {
      return;
    }
    if (this.options.disabled && this.onTick === undefined) {
      return;
    }
    this.polling = this.options.polling.start(() => this.round());
  }

  /** One round of the polling: the listener first, then a flush if one is due. Neither may fail the polling. */
  private async round(): Promise<void> {
    try {
      this.onTick?.();
    } catch {
      // The listener's failure is its own.
    }
    try {
      await this.flushIfDue(false);
    } catch (error) {
      console.error("[structured-log-transport] flush tick failed:", error);
    }
  }

  private endIdentityHold(): void {
    if (!this.heldForIdentity) {
      return;
    }
    this.heldForIdentity = false;
    this.identityHold?.dispose();
    this.identityHold = undefined;
    void this.flushIfDue(true);
  }

  private async flushIfDue(eager: boolean): Promise<void> {
    const nothingToSend = this.waiting.length === 0 && !this.drops.hasUnreported();
    if (nothingToSend || !this.schedule.isDue(eager)) {
      return;
    }
    await this.flush();
    this.startEagerDrain();
  }

  /** Pass after pass until nothing is left, or a pass gets nowhere. */
  private async drain(): Promise<boolean> {
    while (!this.hasNothingLeft()) {
      const progressed = await this.flush();
      if (!progressed && !this.hasNothingLeft()) {
        return false;
      }
    }
    return true;
  }

  /** Whether the drain set off by a full batch may send now. */
  private mayDrainEagerly(): boolean {
    return !this.closed && this.eagerDrainWanted && !this.heldForIdentity && this.waiting.length > 0 && this.schedule.isDue(true);
  }

  /** Once a full batch waits, sending goes on without waiting for rounds, for as long as the schedule allows. */
  private startEagerDrain(): void {
    if (this.eagerDrainRunning || !this.mayDrainEagerly()) {
      return;
    }
    this.eagerDrainRunning = true;
    void this.drainEagerly().finally(() => {
      this.eagerDrainRunning = false;
      this.startEagerDrain();
    });
  }

  private async drainEagerly(): Promise<void> {
    while (this.mayDrainEagerly()) {
      await this.flush();
    }
    if (this.waiting.length === 0) {
      this.eagerDrainWanted = false;
    }
  }

  /** Queues one pass behind the passes already asked for, and answers what that pass will. */
  private flush(): Promise<boolean> {
    const pass = (): Promise<boolean> => this.flushOnce();
    this.passes = this.passes.then(pass, pass);
    return this.passes;
  }

  private async endOfPass(progressed: boolean): Promise<boolean> {
    await this.onFlushSettled?.();
    return progressed;
  }

  /**
   * One pass: a batch from the buffer, or, when nothing waits, the report of
   * what was lost. Answers whether it got anywhere.
   */
  private async flushOnce(): Promise<boolean> {
    if (this.heldForIdentity) {
      return false;
    }
    const generation = this.generation;
    if (this.waiting.length > 0) {
      this.dropTooOld();
    }
    if (this.waiting.length === 0) {
      const attempt = await this.reportDrops(generation);
      if (generation !== this.generation) {
        return this.endOfPass(true);
      }
      if (attempt !== undefined) {
        this.schedule.record(attempt.result);
      }
      return this.endOfPass(attempt?.acknowledged ?? false);
    }

    const { batch, remaining } = takeLogShipBatch(this.waiting);
    this.waiting = remaining;
    this.inFlight = batch;
    const result = await this.ship(batch.map((log) => this.entryToSend(log.level, log.message, log.metadata, log.timestamp)));
    if (generation !== this.generation) {
      // Pending was cleared meanwhile: the batch has been told it was dropped, and nothing of it is counted.
      this.inFlight = [];
      return this.endOfPass(true);
    }
    if (!result.delivered) {
      this.putBack(batch, result);
      return this.endOfPass(false);
    }
    this.inFlight = [];
    this.tell(batch, "delivered");
    this.countLossesOf(result);
    this.schedule.record(result);
    await this.reportDrops(generation);
    return this.endOfPass(true);
  }

  /** A batch the server did not take goes back in front of what was queued meanwhile, to be tried again. */
  private putBack(batch: readonly BufferedStructuredLog[], result: LogShipResult): void {
    this.waiting = [...batch, ...this.waiting];
    this.countLossesOf(result);
    this.pushOutOverflow();
    this.inFlight = [];
    this.schedule.record(result);
  }

  /** A failed shipment is one failed try; a delivered one loses what the server's receipt says it dropped. */
  private countLossesOf(result: LogShipResult): void {
    if (!result.delivered) {
      this.drops.add("ship_failed", 1);
      return;
    }
    this.drops.add("backend_dropped", result.receipt?.logsDropped ?? 0);
  }

  /**
   * Takes out of the buffer what has waited too long, counts it and tells it.
   * An entry whose time is not a number is neither too old nor young enough:
   * it leaves the buffer here without being counted or told.
   */
  private dropTooOld(): void {
    const now = Date.now();
    const tooOld: BufferedStructuredLog[] = [];
    const young: BufferedStructuredLog[] = [];
    for (const log of this.waiting) {
      const age = now - log.timestamp;
      if (age > STRUCTURED_LOG_REPLAY_MAX_AGE_MS) {
        tooOld.push(log);
      } else if (age <= STRUCTURED_LOG_REPLAY_MAX_AGE_MS) {
        young.push(log);
      }
    }
    this.waiting = young;
    this.drops.add("replay_expired", tooOld.length);
    this.tell(tooOld, "dropped");
  }

  /**
   * Brings the buffer back to its size. Lines of the host's and the box's
   * logs go first, oldest first; then the oldest of whatever is left.
   */
  private pushOutOverflow(): void {
    const excess = this.waiting.length - MAX_BUFFER_SIZE;
    if (excess <= 0) {
      return;
    }
    const pushedOut: BufferedStructuredLog[] = [];
    const kept: BufferedStructuredLog[] = [];
    for (const log of this.waiting) {
      if (pushedOut.length < excess && isLogLine(log)) {
        pushedOut.push(log);
      } else {
        kept.push(log);
      }
    }
    pushedOut.push(...kept.splice(0, excess - pushedOut.length));
    this.waiting = kept;
    this.drops.add("overflow_evicted", pushedOut.length);
    this.tell(pushedOut, "dropped");
  }

  /**
   * Sends one entry per reason with losses the server has not taken yet,
   * each with the count so far. Nothing comes back when there is nothing to
   * report. The counts are done with only when the server took every report
   * and dropped none.
   */
  private async reportDrops(generation: number): Promise<{ result: LogShipResult; acknowledged: boolean } | undefined> {
    const unreported = this.drops.unreported();
    if (unreported.length === 0) {
      return undefined;
    }
    const timestamp = Date.now();
    const reports = unreported.map(({ reason, through }) =>
      this.entryToSend(
        "warn",
        TELEMETRY_DROPPED_EVENT,
        { ...this.platformTags, reason, unit: TELEMETRY_DROP_UNIT_BY_REASON[reason], count: String(through), counter_id: this.drops.id },
        timestamp,
      ),
    );
    const result = await this.ship(reports);
    if (generation !== this.generation) {
      // Pending was cleared meanwhile: these counts are gone, and there is nothing to try again.
      return { result, acknowledged: true };
    }
    if (!tookEverything(result, reports.length)) {
      return { result, acknowledged: false };
    }
    this.drops.markReported(unreported);
    return { result, acknowledged: true };
  }

  /**
   * The first shipment of a run that ran out of time queues one warning
   * about it. The run ends with a shipment that succeeds or fails otherwise.
   */
  private noteTimeout(error: unknown, batchEntries: number): void {
    if (!isDeadlineExpiry(error)) {
      this.inTimeoutRun = false;
      return;
    }
    if (this.inTimeoutRun) {
      return;
    }
    this.inTimeoutRun = true;
    this.enqueue("warn", TELEMETRY_SHIP_TIMEOUT_EVENT, sandErrorTags(SandError.logShipTimeout({ batchEntries })));
  }

  /**
   * Asks the server to take `logs`, within the deadline. The server is told
   * to stop when the deadline says so and when pending is cleared. An answer
   * that does not account for every entry counts as delivered, without a
   * receipt.
   */
  private async ship(logs: readonly StructuredLogEntry[]): Promise<LogShipResult> {
    const shipment = new AbortController();
    this.shipmentsInFlight.add(shipment);
    const client = this.client ?? (this.client = this.options.createClient());
    try {
      const response = await this.options.submitDeadline.run((signal) =>
        client.submitLogs({ logs }, { signal: AbortSignal.any([signal, shipment.signal]) }),
      );
      this.inTimeoutRun = false;
      if (!isValidLogShipReceipt(response, logs.length)) {
        return { delivered: true };
      }
      return { delivered: true, receipt: { logsProcessed: response.logsProcessed, logsDropped: response.logsDropped } };
    } catch (error) {
      // The client that failed is not used again, unless a newer one has already taken its place.
      if (this.client === client) {
        this.client = undefined;
      }
      this.noteTimeout(error, logs.length);
      return { delivered: false, error };
    } finally {
      this.shipmentsInFlight.delete(shipment);
    }
  }
}

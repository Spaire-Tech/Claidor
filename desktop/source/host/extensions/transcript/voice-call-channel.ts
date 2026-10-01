/**
 * The voice channel (1 October 2026): a call the person places on the Mac
 * reaches their agent here as a channel, `voice:<call>`, the way the upstream app's
 * harness runs it (`shared/voice-call/main-loop-voice.ts` has its words).
 *
 * The Mac's call service drives it through one gateway method, `voiceCall`:
 *   - `open`: the call is up; its address is `voice:<callId>`.
 *   - `request`: the voice relays what the caller needs. The agent wakes on a
 *     hidden `[inbound]` message from the call, at once: a run in progress is
 *     interrupted and the message says it landed mid-turn. If the agent's turn
 *     sends nothing to the call, it is nudged once.
 *   - `outbox`: what the agent sent on the call since `after`, for the voice
 *     to say. A SendMessage on `voice:<callId>` lands here, not in the chat.
 *   - `ended`: the address closes; the call's record is written to
 *     `voice-calls/` in the agent's own files, and the agent is told the call
 *     ended, with one nudge if it owed the chat a word and sent none.
 *
 * The call in the chat (1 October 2026, the founder: "i want things to behave
 * the same way as it should behave when i text"): one line where the call
 * began, the way a call shows in Messages. When the call opens, one event
 * entry, `{type: "voice-call", status: "live"}`, goes into the agent's chat;
 * everything the call asks of the agent lands below it, as it would below a
 * text. When the call ends, the same entry is filled in with the duration and
 * what was said (`status: "ended"`, `seconds`, `lines`), and the window draws
 * it as "Voice chat · 01:49", opening the call as a chat between the person
 * and the agent (`__simeonVoiceEvent` in scripts/lib/router-renderer-patch.mjs).
 * A call that never connected leaves no line. The person is never written as
 * a peer: before this, the lines were agent-to-agent messages with a
 * `voice-call:` peer named for the person, which the window merged with the
 * agent's other exchanges and drew as an agent.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { WORK_CAME_BACK_NUDGE } from "../../../shared/voice-call/voice-call-prompt.js";
import {
  callEndedNudge,
  clampRelay,
  isVoiceAddress,
  isVoiceCallId,
  replyNudge,
  voiceAddress,
  voiceEndedWake,
  voiceRequestWake,
  VOICE_CALL_EVENT,
  VOICE_CALLS_FOLDER,
} from "../../../shared/voice-call/main-loop-voice.js";
import { removeEntry, updateEntry } from "./transcript-store.js";
import type { TranscriptManagerLike } from "./transcript-hub.js";

/** How long a closed call's outbox and state are kept, for a late read. */
const CLOSED_CALL_KEEP_MS = 10 * 60_000;
/** The most messages a call's outbox holds; older ones are dropped. */
const OUTBOX_LIMIT = 200;

interface VoiceOutboxMessage { readonly seq: number; readonly text: string; readonly atMs: number }
interface VoiceCallState {
  readonly agentId: string;
  readonly callId: string;
  readonly address: string;
  readonly openedAtMs: number;
  open: boolean;
  closedAtMs: number | null;
  nextSeq: number;
  readonly outbox: VoiceOutboxMessage[];
  /** Messages the agent sent on the call, ever. */
  sentOnCall: number;
  /** Requests the call relayed. */
  relayed: number;
  /** The id of the call's line in the chat, once written (null when it could not be). */
  receipt: Promise<string | null> | null;
}

export interface VoiceCallRecordInput {
  /** The name the person goes by (kept in the call's record file). */
  readonly personName?: unknown;
  readonly agentName?: unknown;
  readonly seconds?: unknown;
  readonly recap?: unknown;
  readonly transcript?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The call's lines from the Mac, the app's own nudges left out, at most 400. */
function transcriptOf(record: VoiceCallRecordInput): { speaker: "user" | "agent"; text: string }[] {
  if (!Array.isArray(record.transcript)) return [];
  return record.transcript
    .filter(isRecord)
    .map((line) => ({ speaker: line.speaker === "agent" ? "agent" as const : "user" as const, text: text(line.text).trim() }))
    .filter((line) => line.text.length > 0 && line.text !== WORK_CAME_BACK_NUDGE)
    .slice(0, 400);
}

export class VoiceCallChannel {
  readonly calls = new Map<string, VoiceCallState>();
  now: () => number = Date.now;

  constructor(readonly tm: TranscriptManagerLike) {}

  /** The open call on `address` for `agentId`, or null. */
  private callAt(agentId: string, address: string): VoiceCallState | null {
    const call = this.calls.get(address);
    return call != null && call.agentId === agentId ? call : null;
  }

  /**
   * A SendMessage on a `voice:` address. True when it was taken (the call is
   * open, or it is closed and the message is dropped, as the upstream app does);
   * false when the address is not a call this agent has.
   */
  deliver(agentId: string, address: string, outbound: unknown): boolean {
    if (!isVoiceAddress(address)) return false;
    const call = this.callAt(agentId, address);
    if (call == null) return false;
    if (!call.open) return true;
    // `buildChannelOutboundMessage`: {kind:"text", text} or {kind:"attachment", url, caption}.
    // The call carries words only; a file is said in writing, as its caption.
    const said = (isRecord(outbound) ? text(outbound.text) || text(outbound.caption) : "").trim();
    if (said.length === 0) return true;
    call.outbox.push({ seq: call.nextSeq++, text: clampRelay(said), atMs: this.now() });
    if (call.outbox.length > OUTBOX_LIMIT) call.outbox.splice(0, call.outbox.length - OUTBOX_LIMIT);
    call.sentOnCall += 1;
    return true;
  }

  /** The gateway's `voiceCall`. */
  async handle(raw: unknown): Promise<Record<string, unknown>> {
    const args = isRecord(raw) ? raw : {};
    const agentId = text(args.agentId);
    const callId = args.callId;
    if (agentId.length === 0 || !isVoiceCallId(callId)) throw new Error("voiceCall needs an agentId and a call id.");
    this.sweep();
    const address = voiceAddress(callId);
    switch (args.kind) {
      case "open": {
        const existing = this.calls.get(address);
        if (existing == null) {
          const call: VoiceCallState = { agentId, callId, address, openedAtMs: this.now(), open: true, closedAtMs: null, nextSeq: 1, outbox: [], sentOnCall: 0, relayed: 0, receipt: null };
          this.calls.set(address, call);
          call.receipt = this.appendReceipt(call).catch(() => null);
        } else if (existing.agentId !== agentId) throw new Error("That call belongs to another agent.");
        return { address };
      }
      case "request": {
        const call = this.requireOpen(agentId, address);
        call.relayed += 1;
        const quotes = Array.isArray(args.quotes) ? args.quotes.filter((line): line is string => typeof line === "string") : [];
        // After the call's line, so the work it asks for sits below it in the chat.
        void Promise.resolve(call.receipt).then(() => this.runRequest(call, text(args.request), quotes)).catch(() => {});
        return { accepted: true };
      }
      case "outbox": {
        const call = this.callAt(agentId, address);
        const after = typeof args.after === "number" && Number.isFinite(args.after) ? args.after : 0;
        return {
          messages: call == null ? [] : call.outbox.filter((message) => message.seq > after).map((message) => ({ seq: message.seq, text: message.text })),
          open: call?.open === true,
          working: this.tm.runLifecycle.runningAgentIds().has(agentId),
        };
      }
      case "ended": {
        const call = this.callAt(agentId, address);
        if (call == null || !call.open) return { closed: true };
        call.open = false;
        call.closedAtMs = this.now();
        const input: VoiceCallRecordInput = isRecord(args.record) ? args.record : {};
        const recordPath = this.writeRecord(call, input);
        const exchange = await this.settleReceipt(call, input).catch(() => 0);
        if (call.relayed > 0 || call.sentOnCall > 0) void this.runEnded(call).catch(() => {});
        return { closed: true, exchange, ...(recordPath == null ? {} : { record: recordPath }) };
      }
      default:
        throw new Error("Unknown voiceCall kind.");
    }
  }

  private requireOpen(agentId: string, address: string): VoiceCallState {
    const call = this.callAt(agentId, address);
    if (call == null || !call.open) throw new Error("That call is not open.");
    return call;
  }

  private sweep(): void {
    const now = this.now();
    for (const [address, call] of this.calls)
      if (!call.open && call.closedAtMs != null && now - call.closedAtMs > CLOSED_CALL_KEEP_MS) this.calls.delete(address);
  }

  /** The caller's request: at once, mid-turn when the agent was working. */
  private async runRequest(call: VoiceCallState, request: string, quotes: readonly string[]): Promise<void> {
    const tm = this.tm;
    if (!tm.execution.canExecute) return;
    const session = await tm.sessions.resolveBackgroundSession(call.agentId);
    if (tm.groupChat.isGroupSession(session) || tm.groupChat.isRemoteRoomSession(session)) return;
    const runner = tm.runnerRegistry.getRunner(session);
    const wasWorking = tm.runLifecycle.runningAgentIds().has(session.id);
    tm.runLifecycle.beginSessionRun(session);
    if (runner.interrupt("superseded by the person's voice call")) tm.backgroundWakes.dmPreemptedWakeAgentIds.add(session.id);
    await tm.runLifecycle.enqueueExclusiveRun(
      session.id,
      async () => {
        tm.turnRuntime.activeRequestPrompts.delete(session.id);
        tm.turnRuntime.activeRequestSources.set(session.id, "voice-call");
        try {
          const before = call.sentOnCall;
          const result = await runner.run(voiceRequestWake({ address: call.address, request, quotes, midTurn: wasWorking }), { hidden: true });
          if (!result.aborted && call.open && call.sentOnCall === before)
            await runner.run(replyNudge({ address: call.address }), { hidden: true });
          await tm.roster.emitAgentUpdate(session.id);
        } finally {
          tm.runLifecycle.endSessionRun(session);
        }
      },
      { lane: "user", source: "voice-call" },
    );
  }

  /** The call ended: after any run in progress, the agent settles what it owes the chat. */
  private async runEnded(call: VoiceCallState): Promise<void> {
    const tm = this.tm;
    if (!tm.execution.canExecute) return;
    const session = await tm.sessions.resolveBackgroundSession(call.agentId);
    if (tm.groupChat.isGroupSession(session) || tm.groupChat.isRemoteRoomSession(session)) return;
    const runner = tm.runnerRegistry.getRunner(session);
    tm.runLifecycle.beginSessionRun(session);
    await tm.runLifecycle.enqueueExclusiveRun(
      session.id,
      async () => {
        tm.turnRuntime.activeRequestPrompts.delete(session.id);
        tm.turnRuntime.activeRequestSources.set(session.id, "voice-call");
        try {
          const result = await runner.run(voiceEndedWake({ address: call.address }), { hidden: true });
          if (!result.aborted && result.sentMessageCount === 0) await runner.run(callEndedNudge(), { hidden: true });
          await tm.roster.emitAgentUpdate(session.id);
        } finally {
          tm.runLifecycle.endSessionRun(session);
        }
      },
      { lane: "user", source: "voice-call" },
    );
  }

  /** The agent's own chat, or null for a group or a shared room (a call is one to one). */
  private async chatOf(call: VoiceCallState): Promise<any | null> {
    const session = await this.tm.sessions.resolveBackgroundSession(call.agentId);
    if (session == null || this.tm.groupChat.isGroupSession(session) || this.tm.groupChat.isRemoteRoomSession(session)) return null;
    return session;
  }

  private isOnScreen(session: any): boolean {
    return session.id === this.tm.sessions.activeSession?.id && this.tm.sessions.inMemoryTranscriptAgentId === session.id;
  }

  /** The call's line, written where the call began. */
  private async appendReceipt(call: VoiceCallState): Promise<string | null> {
    const session = await this.chatOf(call);
    if (session == null) return null;
    const entry = { kind: "event", id: `event-${randomUUID()}`, event: { type: VOICE_CALL_EVENT, callId: call.callId, status: "live" }, timestampMs: call.openedAtMs };
    if (session.id === this.tm.sessions.activeSession?.id) this.tm.appendEntry(entry);
    else {
      session.db.appendTranscriptEntry(entry);
      void this.tm.roster.emitAgentUpdate(session.id);
    }
    return entry.id;
  }

  /**
   * The call ended: its line gets the duration and what was said, or goes
   * away when the call never connected. Returns how many lines it holds (at
   * least 1 when it stays), so the Mac adds nothing of its own.
   */
  private async settleReceipt(call: VoiceCallState, record: VoiceCallRecordInput): Promise<number> {
    const id = await (call.receipt ?? Promise.resolve(null));
    if (id == null) return 0;
    const session = await this.chatOf(call);
    if (session == null) return 0;
    const lines = transcriptOf(record);
    const reported = typeof record.seconds === "number" && Number.isFinite(record.seconds) ? record.seconds : null;
    if ((reported ?? 0) <= 0 && lines.length === 0 && call.relayed === 0) {
      session.db.deleteTranscriptEntry(id);
      if (this.isOnScreen(session) && removeEntry(id)) this.tm.roster.emit({ type: "removed", id });
      else void this.tm.roster.emitAgentUpdate(session.id);
      return 0;
    }
    const seconds = Math.max(0, Math.round(reported ?? ((call.closedAtMs ?? this.now()) - call.openedAtMs) / 1000));
    const apply = (entry: any): any =>
      entry.kind === "event" && entry.event?.type === VOICE_CALL_EVENT ? { ...entry, event: { ...entry.event, status: "ended", seconds, lines } } : entry;
    session.db.updateTranscriptEntry(id, apply);
    const updated = this.isOnScreen(session) ? updateEntry(id, apply) : null;
    if (updated != null) this.tm.roster.emit({ type: "updated", entry: updated });
    else void this.tm.roster.emitAgentUpdate(session.id);
    return Math.max(1, lines.length);
  }

  /** One JSON file per finished call, in `voice-calls/` under the agent's own files. */
  private writeRecord(call: VoiceCallState, record: VoiceCallRecordInput): string | null {
    try {
      const dir = join(this.tm.sessionStore.getAgentDir(call.agentId), VOICE_CALLS_FOLDER);
      mkdirSync(dir, { recursive: true });
      const startedAt = new Date(call.openedAtMs).toISOString();
      const transcript = transcriptOf(record);
      const body = {
        call: call.address,
        startedAt,
        endedAt: new Date(call.closedAtMs ?? this.now()).toISOString(),
        ...(typeof record.seconds === "number" && Number.isFinite(record.seconds) ? { seconds: Math.round(record.seconds) } : {}),
        ...(text(record.recap).trim().length > 0 ? { recap: text(record.recap).trim() } : {}),
        requests: call.relayed,
        transcript,
        sentOnCall: call.outbox.map((message) => message.text),
      };
      const path = join(dir, `${startedAt.replace(/[:.]/g, "-")}-${call.callId}.json`);
      writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
      return `${VOICE_CALLS_FOLDER}/${path.slice(dir.length + 1)}`;
    } catch {
      return null;
    }
  }
}

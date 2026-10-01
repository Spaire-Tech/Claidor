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
 * The call in the chat (2 October 2026, the founder: "the after chat is just a
 * chat opened in a panel like the convo between agents, this time its just
 * between us"): what was said is written into the agent's chat the way a
 * conversation with another agent is (`fromAgent` for the person's lines,
 * `toAgent` for the agent's), all with one peer, `voice-call:<call>:<seconds>`
 * named for the person. The window groups them into one line and opens them
 * in its read-only exchange panel (`__simeonVoiceEvent` in
 * scripts/lib/router-renderer-patch.mjs draws that line as "Voice chat · 02:30").
 */
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
  VOICE_CALLS_FOLDER,
} from "../../../shared/voice-call/main-loop-voice.js";
import { entryRaisesUserActivitySignal } from "../../../shared/transcript.js";
import { nextEntryId } from "./transcript-entry-ids.js";
import { getTranscript } from "./transcript-store.js";
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
}

/** The peer a call's lines are written with: `voice-call:<call id>:<seconds>`. */
export const VOICE_CALL_PEER_PREFIX = "voice-call:";
export function voiceCallPeerId(callId: string, seconds: number): string {
  return `${VOICE_CALL_PEER_PREFIX}${callId}:${Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))}`;
}

export interface VoiceCallRecordInput {
  /** The name the person goes by, for their side of the exchange. */
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
        if (existing == null) this.calls.set(address, { agentId, callId, address, openedAtMs: this.now(), open: true, closedAtMs: null, nextSeq: 1, outbox: [], sentOnCall: 0, relayed: 0 });
        else if (existing.agentId !== agentId) throw new Error("That call belongs to another agent.");
        return { address };
      }
      case "request": {
        const call = this.requireOpen(agentId, address);
        call.relayed += 1;
        const quotes = Array.isArray(args.quotes) ? args.quotes.filter((line): line is string => typeof line === "string") : [];
        void this.runRequest(call, text(args.request), quotes).catch(() => {});
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
        const exchange = await this.appendCallExchange(call, input).catch(() => 0);
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

  /**
   * What was said on the call, into the agent's chat as one exchange with the
   * person. Returns how many lines were written (0 when there was nothing).
   */
  private async appendCallExchange(call: VoiceCallState, record: VoiceCallRecordInput): Promise<number> {
    const lines = transcriptOf(record);
    if (lines.length === 0) return 0;
    const session = await this.tm.sessions.resolveBackgroundSession(call.agentId);
    if (session == null || this.tm.groupChat.isGroupSession(session) || this.tm.groupChat.isRemoteRoomSession(session)) return 0;
    const seconds = typeof record.seconds === "number" && Number.isFinite(record.seconds) ? record.seconds : ((call.closedAtMs ?? this.now()) - call.openedAtMs) / 1000;
    const person = text(record.personName).replace(/\s+/g, " ").trim().slice(0, 60);
    const peer = { id: voiceCallPeerId(call.callId, seconds), name: person.length > 0 ? person : "You" };
    const isActive = session.id === this.tm.sessions.activeSession?.id;
    const stamp = call.closedAtMs ?? this.now();
    let raisesActivity = false;
    lines.forEach((line, index) => {
      const entries = isActive ? getTranscript() : session.db.getTranscriptEntries();
      const timestampMs = stamp - (lines.length - index);
      const entry = line.speaker === "user"
        ? { kind: "message", id: nextEntryId(entries, "user-message"), role: "user", content: line.text, isStreaming: false, timestampMs, fromAgent: peer }
        : { kind: "message", id: nextEntryId(entries, "assistant-message"), role: "assistant", content: line.text, isStreaming: false, timestampMs, toAgent: { ...peer, kind: "agent" } };
      raisesActivity ||= entryRaisesUserActivitySignal(entry);
      if (isActive) this.tm.appendEntry(entry);
      else session.db.appendTranscriptEntry(entry);
    });
    if (!isActive) {
      if (raisesActivity) this.tm.sessionStore.markSessionActivity(session);
      void this.tm.roster.emitAgentUpdate(session.id);
    }
    return lines.length;
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

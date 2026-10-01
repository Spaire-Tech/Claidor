/**
 * The call as a channel into the agent, on the Mac (1 October 2026; until
 * then a "hand-off" that typed the task into the chat).
 *
 * The upstream app's way, which the founder asked for exactly: the voice the person
 * hears is the agent's own voice, a second agent that relays what the caller
 * needs over a `voice:<call>` channel. The person's agent wakes on it as an
 * `[inbound]` message (`host/extensions/transcript/voice-call-channel.ts`),
 * knows it is on a call, and answers with SendMessage on that address; what
 * it sends is read back here and given to the voice to say as its own.
 *
 *   - `open` when the call connects.
 *   - `sendTask` is the voice's `send_task`: the request, at most 2,000
 *     characters, and the caller's own words when the voice quotes them.
 *   - The outbox is read every `pollMs` while the call is up; new messages go
 *     to `onSaid`, and the roster's activity line to `onStatus`.
 *   - `recallTextMessages` is the voice's `recall_text_messages`: the latest
 *     texts between the person and the agent in their chat.
 *   - `end` closes the address and leaves the call's record with the agent.
 */
import {
  RELAY_SOFT_FAIL,
  VOICE_RELAY_MAX_CHARS,
} from "./main-loop-voice.js";
import {
  describeAgentActivity,
  recallTextMessagesAnswer,
  SEND_TASK_ACCEPTED,
  transcriptLinesFromEntries,
  workingLabel,
} from "./voice-call-prompt.js";

export interface CallChannelLegs {
  voiceCall(args: Record<string, unknown>): Promise<unknown>;
  listAgents(): Promise<unknown>;
  getAgentTranscriptTail(args: { readonly id: string; readonly limit: number }): Promise<unknown>;
}

export interface CallChannelRecord {
  readonly seconds: number;
  readonly recap: string | null;
  readonly transcript: readonly { readonly speaker: "user" | "agent"; readonly text: string }[];
}

export interface CallChannelOptions {
  readonly agentId: string;
  /** The call's id; its address is `voice:<callId>`. */
  readonly callId: string;
  readonly legs: CallChannelLegs;
  /** The banner's status line while the agent works, or null when it is idle. */
  readonly onStatus: (label: string | null) => void;
  /** What the agent sent on the call, oldest first, for the voice to say. */
  readonly onSaid: (texts: readonly string[]) => void;
  readonly log?: (line: string) => void;
  readonly schedule?: (run: () => void, ms: number) => () => void;
  readonly pollMs?: number;
}

export const CALL_CHANNEL_POLL_MS = 1_200;
export const RECALL_TAIL_LIMIT = 60;
/** How many texts `recall_text_messages` reads back: further than the call's own prompt carries. */
export const RECALL_TEXT_LINES = 20;
const MAX_POLL_FAILURES = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
function rosterRow(agents: unknown, agentId: string): Record<string, unknown> | null {
  const rows = Array.isArray(agents) ? agents : isRecord(agents) && Array.isArray(agents.agents) ? agents.agents : [];
  for (const row of rows) if (isRecord(row) && row.id === agentId) return row;
  return null;
}

export interface CallChannel {
  open(): Promise<boolean>;
  sendTask(parameters: unknown): Promise<string>;
  recallTextMessages(): Promise<string>;
  end(record: CallChannelRecord): Promise<void>;
  dispose(): void;
}

export function createCallChannel(options: CallChannelOptions): CallChannel {
  const schedule = options.schedule ?? ((run, ms) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer); });
  const pollMs = options.pollMs ?? CALL_CHANNEL_POLL_MS;
  const log = options.log ?? (() => {});
  const base = { agentId: options.agentId, callId: options.callId };
  let isOpen = false;
  let isDisposed = false;
  let after = 0;
  let failures = 0;
  let status: string | null = null;
  let lastTask: string | null = null;
  let cancelPoll: (() => void) | null = null;

  const setStatus = (label: string | null): void => { if (status !== label) { status = label; options.onStatus(label); } };
  const stop = (): void => { cancelPoll?.(); cancelPoll = null; };
  const plan = (): void => { stop(); if (isOpen && !isDisposed) cancelPoll = schedule(() => { void poll(); }, pollMs); };

  const poll = async (): Promise<void> => {
    if (!isOpen || isDisposed) return;
    try {
      const [outbox, agents] = await Promise.all([options.legs.voiceCall({ ...base, kind: "outbox", after }), options.legs.listAgents()]);
      failures = 0;
      if (!isOpen || isDisposed) return;
      const messages = isRecord(outbox) && Array.isArray(outbox.messages) ? outbox.messages.filter(isRecord) : [];
      const fresh: string[] = [];
      for (const message of messages) {
        const seq = typeof message.seq === "number" ? message.seq : 0;
        if (seq <= after) continue;
        after = seq;
        if (typeof message.text === "string" && message.text.trim().length > 0) fresh.push(message.text.trim());
      }
      const row = rosterRow(agents, options.agentId);
      setStatus(row?.isRunning === true ? describeAgentActivity(row.currentActivity) ?? (lastTask == null ? null : workingLabel(lastTask)) : null);
      if (fresh.length > 0) { log(`call channel: the agent said ${fresh.length} thing(s) on the call`); options.onSaid(fresh); }
    } catch (error) {
      failures += 1;
      log(`call channel: reading the call's outbox failed (${failures}): ${errorText(error)}`);
      if (failures >= MAX_POLL_FAILURES) { setStatus(null); return; }
    }
    plan();
  };

  return {
    async open() {
      try {
        await options.legs.voiceCall({ ...base, kind: "open" });
        isOpen = !isDisposed;
        log(`call channel: voice:${options.callId} open`);
        plan();
        return true;
      } catch (error) {
        log(`call channel: the call could not be opened on the agent: ${errorText(error)}`);
        return false;
      }
    },
    async sendTask(parameters) {
      const record = isRecord(parameters) ? parameters : {};
      const task = typeof record.task === "string" ? record.task.trim().slice(0, VOICE_RELAY_MAX_CHARS) : "";
      const quote = typeof record.quote === "string" ? record.quote.trim().slice(0, VOICE_RELAY_MAX_CHARS) : "";
      if (!isOpen || isDisposed) return RELAY_SOFT_FAIL;
      try {
        await options.legs.voiceCall({ ...base, kind: "request", request: task, ...(quote.length > 0 ? { quotes: [quote] } : {}) });
      } catch (error) {
        log(`call channel: the request did not reach the agent: ${errorText(error)}`);
        return RELAY_SOFT_FAIL;
      }
      if (task.length > 0) lastTask = task;
      setStatus(task.length > 0 ? workingLabel(task) : status);
      log(`call channel: relayed a ${task.length}-character request`);
      return SEND_TASK_ACCEPTED;
    },
    async recallTextMessages() {
      try {
        const page = await options.legs.getAgentTranscriptTail({ id: options.agentId, limit: RECALL_TAIL_LIMIT });
        const entries = isRecord(page) && Array.isArray(page.entries) ? page.entries : Array.isArray(page) ? page : [];
        return recallTextMessagesAnswer(transcriptLinesFromEntries(entries, RECALL_TEXT_LINES));
      } catch (error) {
        log(`call channel: reading the chat failed: ${errorText(error)}`);
        return "The text messages could not be read just now.";
      }
    },
    async end(record) {
      const wasOpen = isOpen;
      isOpen = false;
      stop();
      setStatus(null);
      if (!wasOpen) return;
      try {
        await options.legs.voiceCall({ ...base, kind: "ended", record });
        log(`call channel: voice:${options.callId} closed`);
      } catch (error) {
        log(`call channel: the call's end did not reach the agent: ${errorText(error)}`);
      }
    },
    dispose() { isDisposed = true; isOpen = false; stop(); },
  };
}

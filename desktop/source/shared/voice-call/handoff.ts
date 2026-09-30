/**
 * The call's two client tools, answered on the Mac (30 September 2026).
 *
 * `hand_to_agent {task}` puts the task into the agent's chat exactly as if
 * the person had typed it (the host's `sendPrompt`, the same door the
 * window's composer uses) and answers at once, so the voice can say "on it"
 * and the call goes on. Behind the call this watches the agent: the roster
 * row's `isRunning` and `currentActivity` give the banner its status line,
 * and when the turn ends the agent's own new messages are handed back
 * (`onDone`) for the voice to tell the person. `check_on_agent` answers
 * with what the agent is doing and what it has said.
 *
 * The coordinator's main-process leg carries the three calls; the main-port
 * client ignores event frames, so the turn's end is found by polling.
 */
import {
  agentMessageText,
  checkOnAgentAnswer,
  describeAgentActivity,
  HAND_OFF_ACCEPTED,
  HAND_OFF_EMPTY,
  handOffFailed,
  workingLabel,
} from "./voice-call-prompt.js";

export interface HandoffLegs {
  sendPrompt(args: { readonly prompt: string; readonly agentId: string; readonly clientNonce: string; readonly attachmentPaths: readonly string[]; readonly attachmentNames: readonly string[] }): Promise<unknown>;
  listAgents(): Promise<unknown>;
  getAgentTranscriptTail(args: { readonly id: string; readonly limit: number }): Promise<unknown>;
}

export interface HandoffOptions {
  readonly agentId: string;
  readonly legs: HandoffLegs;
  /** The status line while the agent works, or null when it is done. */
  readonly onStatus: (label: string | null) => void;
  /** The agent's turn ended; `replies` are its new messages, oldest first. */
  readonly onDone: (replies: readonly string[]) => void;
  readonly log?: (line: string) => void;
  readonly now?: () => number;
  readonly schedule?: (run: () => void, ms: number) => () => void;
  readonly newNonce?: () => string;
  /** How often the roster is read while work is pending. */
  readonly pollMs?: number;
  /** A turn never seen running counts as finished after this long. */
  readonly startGraceMs?: number;
  /** Past this, the watch gives up quietly; the reply still lands in the chat. */
  readonly maxWorkMs?: number;
}

export const HANDOFF_TAIL_LIMIT = 40;
export const HANDOFF_POLL_MS = 1_500;
export const HANDOFF_START_GRACE_MS = 8_000;
export const HANDOFF_MAX_WORK_MS = 20 * 60_000;
const MAX_POLL_FAILURES = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entriesOf(page: unknown): readonly unknown[] {
  if (Array.isArray(page)) return page;
  return isRecord(page) && Array.isArray(page.entries) ? page.entries : [];
}

function entryId(entry: unknown): string | null {
  return isRecord(entry) && typeof entry.id === "string" ? entry.id : null;
}

function rosterRow(agents: unknown, agentId: string): Record<string, unknown> | null {
  const rows = Array.isArray(agents) ? agents : isRecord(agents) && Array.isArray(agents.agents) ? agents.agents : [];
  for (const row of rows) if (isRecord(row) && row.id === agentId) return row;
  return null;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface AgentHandoff {
  handToAgent(parameters: unknown): Promise<string>;
  checkOnAgent(): Promise<string>;
  isWorking(): boolean;
  dispose(): void;
}

export function createAgentHandoff(options: HandoffOptions): AgentHandoff {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((run, ms) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer); });
  const newNonce = options.newNonce ?? (() => `voice-call-${globalThis.crypto.randomUUID()}`);
  const pollMs = options.pollMs ?? HANDOFF_POLL_MS;
  const startGraceMs = options.startGraceMs ?? HANDOFF_START_GRACE_MS;
  const maxWorkMs = options.maxWorkMs ?? HANDOFF_MAX_WORK_MS;
  const log = options.log ?? (() => {});

  interface Pending { readonly baseline: ReadonlySet<string>; readonly startedAtMs: number; hasSeenRunning: boolean; taskLabel: string; status: string | null; failures: number }
  let pending: Pending | null = null;
  let cancelPoll: (() => void) | null = null;
  let isDisposed = false;

  const readTail = async (): Promise<readonly unknown[]> => entriesOf(await options.legs.getAgentTranscriptTail({ id: options.agentId, limit: HANDOFF_TAIL_LIMIT }));
  const newReplies = (entries: readonly unknown[], baseline: ReadonlySet<string>): string[] => {
    const replies: string[] = [];
    for (const entry of entries) {
      const id = entryId(entry);
      if (id != null && baseline.has(id)) continue;
      const text = agentMessageText(entry);
      if (text != null) replies.push(text);
    }
    return replies;
  };
  const setStatus = (work: Pending, label: string | null): void => {
    if (work.status === label) return;
    work.status = label;
    options.onStatus(label);
  };
  const stopPolling = (): void => { cancelPoll?.(); cancelPoll = null; };
  const plan = (): void => { stopPolling(); if (!isDisposed && pending != null) cancelPoll = schedule(() => { void poll(); }, pollMs); };

  const finish = async (work: Pending): Promise<void> => {
    let replies: string[] = [];
    try { replies = newReplies(await readTail(), work.baseline); } catch (error) { log(`hand-off: reading the reply failed: ${errorText(error)}`); }
    if (pending !== work || isDisposed) return;
    pending = null;
    stopPolling();
    options.onStatus(null);
    log(`hand-off: the agent's turn ended with ${replies.length} message(s)`);
    options.onDone(replies);
  };

  const poll = async (): Promise<void> => {
    const work = pending;
    if (work == null || isDisposed) return;
    if (now() - work.startedAtMs > maxWorkMs) {
      log("hand-off: still working after the watch limit; the reply will land in the chat");
      pending = null; stopPolling(); options.onStatus(null);
      return;
    }
    let row: Record<string, unknown> | null;
    try { row = rosterRow(await options.legs.listAgents(), options.agentId); work.failures = 0; }
    catch (error) {
      work.failures += 1;
      log(`hand-off: reading the roster failed (${work.failures}): ${errorText(error)}`);
      if (work.failures >= MAX_POLL_FAILURES) { pending = null; stopPolling(); options.onStatus(null); return; }
      plan();
      return;
    }
    if (pending !== work || isDisposed) return;
    if (row?.isRunning === true) {
      work.hasSeenRunning = true;
      setStatus(work, describeAgentActivity(row.currentActivity) ?? work.taskLabel);
      plan();
      return;
    }
    if (work.hasSeenRunning || now() - work.startedAtMs >= startGraceMs) { await finish(work); return; }
    plan();
  };

  const baselineIds = async (): Promise<Set<string>> => {
    try { return new Set((await readTail()).map(entryId).filter((id): id is string => id != null)); }
    catch (error) { log(`hand-off: reading the chat before sending failed: ${errorText(error)}`); return new Set(); }
  };

  return {
    async handToAgent(parameters) {
      const task = isRecord(parameters) && typeof parameters.task === "string" ? parameters.task.trim() : "";
      if (task.length === 0) return HAND_OFF_EMPTY;
      if (isDisposed) return handOffFailed("the call has ended");
      const work: Pending = pending ?? { baseline: await baselineIds(), startedAtMs: now(), hasSeenRunning: false, taskLabel: workingLabel(task), status: null, failures: 0 };
      try {
        await options.legs.sendPrompt({ prompt: task, agentId: options.agentId, clientNonce: newNonce(), attachmentPaths: [], attachmentNames: [] });
      } catch (error) {
        log(`hand-off: sendPrompt failed: ${errorText(error)}`);
        return handOffFailed(errorText(error));
      }
      if (isDisposed) return HAND_OFF_ACCEPTED;
      work.taskLabel = workingLabel(task);
      if (pending == null) pending = work;
      setStatus(work, work.taskLabel);
      log(`hand-off: sent a ${task.length}-character task`);
      plan();
      return HAND_OFF_ACCEPTED;
    },
    async checkOnAgent() {
      const work = pending;
      try {
        const [agents, entries] = await Promise.all([options.legs.listAgents(), readTail()]);
        const row = rosterRow(agents, options.agentId);
        const isRunning = row?.isRunning === true;
        if (work != null) {
          return checkOnAgentAnswer({ isWorking: isRunning || !work.hasSeenRunning, activity: isRunning ? describeAgentActivity(row?.currentActivity) : null, replies: newReplies(entries, work.baseline), lastMessage: null });
        }
        let lastMessage: string | null = null;
        for (const entry of entries) lastMessage = agentMessageText(entry) ?? lastMessage;
        return checkOnAgentAnswer({ isWorking: isRunning, activity: isRunning ? describeAgentActivity(row?.currentActivity) : null, replies: [], lastMessage });
      } catch (error) {
        log(`hand-off: check failed: ${errorText(error)}`);
        return work != null ? "The agent is still working on it; its status could not be read just now." : "The agent's status could not be read just now.";
      }
    },
    isWorking: () => pending != null,
    dispose() { isDisposed = true; pending = null; stopPolling(); },
  };
}

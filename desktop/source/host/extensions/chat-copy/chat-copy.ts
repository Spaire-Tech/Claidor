import { createHash } from "node:crypto";
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";

/**
 * The copy of the agents and their chats on Simeon Labs' server (26 October
 * 2026, the founder: the computer is a worker, not where the chats live).
 * The apps read the list and the chats from here, so with the computer
 * asleep, being updated or out of reach they had nothing to show; they now
 * read the server's copy meanwhile (`server/simeon/desktop/chats.py`).
 *
 * What this sends, a moment after it changes (at most every
 * `CHAT_COPY_INTERVAL_MS`):
 *
 * - The list, whole, as the apps read it: without its inline pictures and
 *   without what each agent is doing at that moment. Only when it changed.
 * - Each chat's lines. The transcript's events come for the chat on screen
 *   only, so a chat is read again (`getAgentTranscriptTail`, its newest
 *   `CHAT_COPY_TAIL_LINES`) whenever the list says it moved: a new line, its
 *   time, or a turn ending (an answer that streamed is then whole). The
 *   events add what the list cannot say: a line changed in place, taken
 *   out, or a chat emptied. A line still streaming waits until it is whole;
 *   one sent before is not sent again unless it changed.
 * - At start, every chat whose newest line the server does not have yet,
 *   `CHAT_COPY_BACKFILL_LINES` back.
 *
 * Nothing waits on it: a copy refused or out of reach is tried again
 * later, longer apart each time, and the computer's own chats never
 * depend on it.
 */
export const CHAT_COPY_PATH = "/desktop/api/chats/copy";
export const CHAT_STATE_PATH = "/desktop/api/chats/state";
export const CHAT_COPY_INTERVAL_MS = 2_000;
export const CHAT_COPY_TAIL_LINES = 60;
export const CHAT_COPY_BACKFILL_LINES = 300;
/** A refused copy is tried again after this, doubling up to the longest. */
export const CHAT_COPY_RETRY_MS = 5_000;
export const CHAT_COPY_RETRY_MAX_MS = 5 * 60_000;
/** A line larger than this is not sent: the server keeps none larger. */
export const CHAT_COPY_LINE_MAX_BYTES = 256 * 1024;
/** One copy holds at most this many lines, and about this many bytes. */
export const CHAT_COPY_LINES_PER_COPY = 400;
export const CHAT_COPY_BYTES_PER_COPY = 3 * 1024 * 1024;
/** How many lines sent per chat are remembered, so an unchanged one is not sent again. */
const SENT_REMEMBERED = 600;
/** What a row says only of its moment: a list read later would show the agent as still working. */
const MOMENT_FIELDS = new Set(["isRunningTurn", "isRunning", "isComposingMessage", "currentActivity"]);

type Row = Record<string, unknown>;
type Line = Record<string, unknown> & { readonly id: string; readonly kind: string };

/** What the copy reads of the transcript (the transcript manager). */
export interface ChatCopyTranscript {
  listAgents(): Promise<readonly unknown[]> | readonly unknown[];
  listAgentsSync?(): readonly unknown[];
  subscribe?(listener: (event: unknown) => void): () => void;
  subscribeAgents?(listener: (payload: unknown) => void): () => void;
  subscribeAgentUpserted?(listener: (payload: unknown) => void): () => void;
  getAgentTranscriptTail(agentId: string, query: { readonly limit: number }): unknown;
}

export interface ChatCopyBody {
  agents?: Row[];
  lines: Array<{ agentId: string; entry: Line }>;
  removed: Array<{ agentId: string; id: string }>;
  cleared: string[];
}

export interface ChatCopyServer {
  /** Each chat's newest line the server holds (agent id → line id). */
  newest(): Promise<Record<string, string>>;
  copy(body: ChatCopyBody): Promise<void>;
}

function isRow(value: unknown): value is Row & { id: string } {
  return typeof value === "object" && value != null && typeof (value as Row).id === "string" && ((value as Row).id as string).length > 0;
}

function asLine(value: unknown): Line | null {
  if (typeof value !== "object" || value == null) return null;
  const line = value as Row;
  return typeof line.id === "string" && line.id.length > 0 && typeof line.kind === "string" ? (line as Line) : null;
}

/** The row as the apps read it from the copy: no inline picture, nothing of the moment. */
export function slimRow(row: Row): Row {
  const slim: Row = {};
  for (const [key, value] of Object.entries(row)) if (!MOMENT_FIELDS.has(key)) slim[key] = value;
  if (slim.avatarDataUrl != null) slim.avatarDataUrl = null;
  return slim;
}

/** What says a chat moved: its newest line, its time, and whether a turn runs. */
export function chatMark(row: Row): string {
  return JSON.stringify([row.lastMessageId ?? null, row.lastActivityAt ?? null, row.updatedAt ?? null, row.isRunning === true || row.isRunningTurn === true]);
}

function digest(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 20);
}

export interface ChatCopyOptions {
  readonly transcript: ChatCopyTranscript;
  readonly server: ChatCopyServer;
  readonly log?: (line: string) => void;
  readonly intervalMs?: number;
  readonly retryMs?: number;
  readonly retryMaxMs?: number;
}

export class ChatCopy {
  /** Lines to send, by chat, the newest copy of each. */
  private readonly lines = new Map<string, Map<string, Line>>();
  private readonly removed = new Map<string, Set<string>>();
  private readonly cleared = new Set<string>();
  /** Chats to read again, with how far back. */
  private readonly stale = new Map<string, number>();
  /** Each agent's mark as last seen (`chatMark`). */
  private readonly marks = new Map<string, string>();
  /** Each chat's lines sent, by a digest of what was sent. */
  private readonly sent = new Map<string, Map<string, string>>();
  private list: Row[] = [];
  private listKnown = false;
  private listSent: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> | null = null;
  private retryMs = 0;
  private stopped = false;
  private readonly unsubscribe: Array<() => void> = [];
  private readonly log: (line: string) => void;

  constructor(private readonly options: ChatCopyOptions) {
    this.log = options.log ?? logHostLine;
  }

  /** Listens, reads the list, and sends what the server is behind on. */
  async start(): Promise<void> {
    const { transcript } = this.options;
    this.listen(transcript.subscribe, (event) => this.onEvent(event));
    this.listen(transcript.subscribeAgents, (payload) => this.onAgents(payload));
    this.listen(transcript.subscribeAgentUpserted, (payload) => this.onUpserted(payload));
    let rows: readonly unknown[];
    try {
      rows = await transcript.listAgents();
    } catch (error) {
      this.log(`${HOST_LOG_PREFIX} chat-copy could not read the agents: ${clipForHostLog(error instanceof Error ? error.message : String(error))}`);
      return;
    }
    if (this.stopped) return;
    let newest: Record<string, string> | null = null;
    try {
      newest = await this.options.server.newest();
    } catch (error) {
      this.log(`${HOST_LOG_PREFIX} chat-copy state unread: ${clipForHostLog(error instanceof Error ? error.message : String(error))}`);
    }
    if (this.stopped) return;
    this.takeList(rows, { first: true });
    for (const row of this.list) {
      const last = row.lastMessageId;
      if (typeof last === "string" && last.length > 0 && newest?.[row.id as string] !== last) this.markStale(row.id as string, CHAT_COPY_BACKFILL_LINES);
    }
    this.log(`${HOST_LOG_PREFIX} chat-copy on: ${this.list.length} agent(s), ${this.stale.size} chat(s) to send`);
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    for (const off of this.unsubscribe.splice(0)) off();
  }

  /** Everything waiting, sent now (what a test awaits). */
  async flushNow(): Promise<void> {
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    if (this.sending != null) await this.sending;
    await this.flush();
  }

  private listen(subscribe: ((listener: (value: unknown) => void) => () => void) | undefined, listener: (value: unknown) => void): void {
    if (typeof subscribe !== "function") return;
    this.unsubscribe.push(subscribe.call(this.options.transcript, listener));
  }

  private onAgents(payload: unknown): void {
    const value = payload as { agents?: unknown; coverage?: { kind?: unknown } } | null;
    if (!Array.isArray(value?.agents)) return;
    // Only a whole list says who is gone.
    const coverage = value.coverage?.kind;
    if (coverage != null && coverage !== "complete-roster") return;
    this.takeList(value.agents, { first: false });
    this.schedule();
  }

  private onUpserted(payload: unknown): void {
    const agent = (payload as { agent?: unknown } | null)?.agent;
    if (!isRow(agent)) return;
    const cached = this.options.transcript.listAgentsSync?.();
    if (this.listKnown && Array.isArray(cached) && cached.some((row) => isRow(row) && row.id === agent.id)) {
      this.takeList(cached, { first: false });
    } else {
      const mark = chatMark(agent);
      if (this.marks.get(agent.id) !== mark) { this.marks.set(agent.id, mark); this.markStale(agent.id, CHAT_COPY_TAIL_LINES); }
    }
    this.schedule();
  }

  private onEvent(event: unknown): void {
    const value = event as { type?: unknown; agentId?: unknown; activeAgentId?: unknown; entry?: unknown; entries?: unknown; id?: unknown; entryId?: unknown } | null;
    if (value == null) return;
    switch (value.type) {
      case "appended":
      case "updated": {
        const line = asLine(value.entry);
        if (typeof value.agentId === "string" && line != null && line.isStreaming !== true) this.queueLine(value.agentId, line);
        break;
      }
      case "removed": {
        const id = typeof value.id === "string" ? value.id : typeof value.entryId === "string" ? value.entryId : null;
        if (typeof value.agentId === "string" && id != null) {
          this.lines.get(value.agentId)?.delete(id);
          this.sent.get(value.agentId)?.delete(id);
          const set = this.removed.get(value.agentId) ?? new Set<string>();
          set.add(id);
          this.removed.set(value.agentId, set);
        }
        break;
      }
      case "cleared":
        if (typeof value.agentId === "string") {
          this.lines.delete(value.agentId);
          this.removed.delete(value.agentId);
          this.sent.delete(value.agentId);
          this.cleared.add(value.agentId);
        }
        break;
      case "snapshot":
        if (typeof value.activeAgentId === "string" && Array.isArray(value.entries)) {
          for (const entry of value.entries) {
            const line = asLine(entry);
            if (line != null && line.isStreaming !== true) this.queueLine(value.activeAgentId, line);
          }
        }
        break;
      default:
        return;
    }
    this.schedule();
  }

  private takeList(rows: readonly unknown[], options: { readonly first: boolean }): void {
    const list = rows.filter(isRow);
    const ids = new Set(list.map((row) => row.id));
    for (const row of list) {
      const mark = chatMark(row);
      if (!options.first && this.marks.get(row.id) !== mark) this.markStale(row.id, CHAT_COPY_TAIL_LINES);
      this.marks.set(row.id, mark);
    }
    // An agent gone: the server takes its chat with it when the list arrives.
    for (const id of [...this.marks.keys()]) {
      if (ids.has(id)) continue;
      this.marks.delete(id);
      this.stale.delete(id);
      this.lines.delete(id);
      this.removed.delete(id);
      this.sent.delete(id);
    }
    this.list = list;
    this.listKnown = true;
  }

  private markStale(agentId: string, limit: number): void {
    this.stale.set(agentId, Math.max(this.stale.get(agentId) ?? 0, limit));
  }

  private queueLine(agentId: string, line: Line): void {
    const chat = this.lines.get(agentId) ?? new Map<string, Line>();
    chat.set(line.id, line);
    this.lines.set(agentId, chat);
  }

  private schedule(delayMs = this.options.intervalMs ?? CHAT_COPY_INTERVAL_MS): void {
    if (this.stopped || this.timer != null || this.sending != null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  private hasWork(): boolean {
    return this.lines.size > 0 || this.removed.size > 0 || this.cleared.size > 0 || this.stale.size > 0 || (this.listKnown && JSON.stringify(this.list.map(slimRow)) !== this.listSent);
  }

  private flush(): Promise<void> {
    if (this.sending != null) return this.sending;
    this.sending = this.send().finally(() => {
      this.sending = null;
      if (!this.stopped && this.hasWork()) this.schedule(this.retryMs > 0 ? this.retryMs : undefined);
    });
    return this.sending;
  }

  private readStale(): void {
    const stale = [...this.stale];
    this.stale.clear();
    for (const [agentId, limit] of stale) {
      let window: unknown;
      try {
        window = this.options.transcript.getAgentTranscriptTail(agentId, { limit });
      } catch (error) {
        this.log(`${HOST_LOG_PREFIX} chat-copy could not read ${agentId}: ${clipForHostLog(error instanceof Error ? error.message : String(error))}`);
        continue;
      }
      const entries = (window as { entries?: unknown } | null)?.entries;
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const line = asLine(entry);
        if (line != null && line.isStreaming !== true) this.queueLine(agentId, line);
      }
    }
  }

  private async send(): Promise<void> {
    if (this.stopped) return;
    this.readStale();
    // What is new since sent: a line sent before, unchanged, is left out.
    const lines: Array<{ agentId: string; entry: Line; size: number }> = [];
    const digests = new Map<Line, string>();
    let skipped = 0;
    for (const [agentId, chat] of this.lines) {
      for (const line of chat.values()) {
        const text = JSON.stringify(line);
        const size = Buffer.byteLength(text, "utf8");
        if (size > CHAT_COPY_LINE_MAX_BYTES) { skipped += 1; continue; }
        const mark = digest(text);
        if (this.sent.get(agentId)?.get(line.id) === mark) continue;
        lines.push({ agentId, entry: line, size });
        digests.set(line, mark);
      }
    }
    this.lines.clear();
    if (skipped > 0) this.log(`${HOST_LOG_PREFIX} chat-copy left out ${skipped} line(s) over ${CHAT_COPY_LINE_MAX_BYTES / 1024} KB`);
    const removed = [...this.removed].flatMap(([agentId, ids]) => [...ids].map((id) => ({ agentId, id })));
    this.removed.clear();
    const cleared = [...this.cleared];
    this.cleared.clear();
    const slim = this.listKnown ? this.list.map(slimRow) : null;
    const listJson = slim == null ? null : JSON.stringify(slim);
    const listChanged = listJson != null && listJson !== this.listSent;
    if (lines.length === 0 && removed.length === 0 && cleared.length === 0 && !listChanged) return;

    const batches: ChatCopyBody[] = [];
    let current: ChatCopyBody = { lines: [], removed, cleared, ...(listChanged && slim != null ? { agents: slim } : {}) };
    let bytes = 0;
    for (const line of lines) {
      if (current.lines.length >= CHAT_COPY_LINES_PER_COPY || (bytes + line.size > CHAT_COPY_BYTES_PER_COPY && current.lines.length > 0)) {
        batches.push(current);
        current = { lines: [], removed: [], cleared: [] };
        bytes = 0;
      }
      current.lines.push({ agentId: line.agentId, entry: line.entry });
      bytes += line.size;
    }
    batches.push(current);

    let sentLines = 0;
    for (const [index, batch] of batches.entries()) {
      try {
        await this.options.server.copy(batch);
      } catch (error) {
        // What was not sent waits for the next copy; anything newer queued meanwhile wins.
        for (const rest of batches.slice(index)) this.requeue(rest);
        this.retryMs = this.retryMs > 0 ? Math.min(this.retryMs * 2, this.options.retryMaxMs ?? CHAT_COPY_RETRY_MAX_MS) : this.options.retryMs ?? CHAT_COPY_RETRY_MS;
        this.log(`${HOST_LOG_PREFIX} chat-copy failed: ${clipForHostLog(error instanceof Error ? error.message : String(error))}; again in ${Math.round(this.retryMs / 1000)} s`);
        return;
      }
      if (batch.agents != null) this.listSent = listJson;
      for (const item of batch.lines) {
        const chat = this.sent.get(item.agentId) ?? new Map<string, string>();
        chat.delete(item.entry.id);
        chat.set(item.entry.id, digests.get(item.entry) ?? "");
        while (chat.size > SENT_REMEMBERED) chat.delete(chat.keys().next().value as string);
        this.sent.set(item.agentId, chat);
      }
      sentLines += batch.lines.length;
    }
    this.retryMs = 0;
    this.log(`${HOST_LOG_PREFIX} chat-copy sent${listChanged ? ` the list (${slim?.length ?? 0})` : ""} lines=${sentLines} removed=${removed.length} cleared=${cleared.length}`);
  }

  private requeue(batch: ChatCopyBody): void {
    for (const item of batch.lines) {
      const chat = this.lines.get(item.agentId);
      if (chat?.has(item.entry.id) === true) continue;
      this.queueLine(item.agentId, item.entry);
    }
    for (const item of batch.removed) {
      const set = this.removed.get(item.agentId) ?? new Set<string>();
      set.add(item.id);
      this.removed.set(item.agentId, set);
    }
    for (const agentId of batch.cleared) this.cleared.add(agentId);
  }
}

/** The server's two routes, with the box's own access token, in the apps' envelope (`{code, data}`). */
export function createChatCopyServer(deps: {
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): ChatCopyServer {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const backendUrl = deps.getBackendUrl();
    const token = await deps.getAccessToken({ backendUrl });
    if (token.length === 0) throw new Error(`no credential for ${backendUrl}`);
    const response = await fetchImpl(new URL(path, backendUrl).toString(), {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body == null ? {} : { "content-type": "application/json" }) },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 30_000),
    });
    type Answer = { code?: unknown; data?: unknown; message?: unknown };
    let body: Answer | null = null;
    try { body = (await response.json()) as Answer | null; } catch {}
    if (!response.ok || body?.code !== 0) throw new Error(`${path} answered ${response.status}${typeof body?.message === "string" ? ` ${body.message}` : ""}`);
    return body.data;
  };
  return {
    async newest() {
      const data = (await call(CHAT_STATE_PATH)) as { newest?: unknown } | null;
      const newest = data?.newest;
      return typeof newest === "object" && newest != null ? (newest as Record<string, string>) : {};
    },
    async copy(body) {
      await call(CHAT_COPY_PATH, { method: "POST", body: JSON.stringify(body) });
    },
  };
}

import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { NONCE_DIGEST_MISMATCH, PromptAcceptanceRejectedError } from "../transcript/prompt-acceptance-ledger.js";

/**
 * Messages written in an app while the computer was asleep or out of reach
 * (26 October 2026, the computer as a worker): the app hands them to Simeon
 * Labs' server (`POST /desktop/api/chats/send`), the server wakes the
 * computer, and this takes them (`GET /desktop/api/chats/inbox`) and hands
 * each to its agent as the app would have (`sendPrompt`, with the app's own
 * nonce), then tells the server they went (`…/inbox/ack`).
 *
 * - A message sent both ways (the app sends it again once the computer is
 *   back) lands once: the transcript's acceptance ledger knows the nonce.
 * - It looks at start, when the server says one is waiting (the notify
 *   bus's `chat-inbox`, and again a moment later: the row lands when the
 *   server's request ends), every 30 s while that stream is down, and every
 *   2 minutes anyway.
 * - In the order they were written; one that fails waits, with those after
 *   it, and is left out after 5 tries. One for an agent no longer here, or
 *   whose nonce went with other words, is left out at once.
 * - Its log lines carry counts and agent ids, never a message's words.
 * - Other kinds go to whoever takes them (`handle`): `channel`, what an
 *   agent's own bot heard while the cloud runner listened to it, goes to
 *   the channels runtime. A kind nothing here takes stays on the server.
 */
export const CHAT_INBOX_PATH = "/desktop/api/chats/inbox";
export const CHAT_INBOX_ACK_PATH = "/desktop/api/chats/inbox/ack";
export const CHAT_INBOX_TICK_MS = 5_000;
export const CHAT_INBOX_POLL_MS = 30_000;
export const CHAT_INBOX_SAFETY_POLL_MS = 120_000;
/** After the server says a message waits, it looks once more this much later: the message lands when the server's request ends. */
export const CHAT_INBOX_AGAIN_MS = 4_000;
export const CHAT_INBOX_RETRY_MS = 5_000;
export const CHAT_INBOX_RETRY_MAX_MS = 5 * 60_000;
export const CHAT_INBOX_MAX_TRIES = 5;

export interface WaitingMessage {
  readonly id: string;
  readonly agentId: string;
  readonly nonce: string;
  readonly kind: string;
  readonly message: Record<string, unknown>;
}

export interface ChatInboxServer {
  waiting(): Promise<readonly WaitingMessage[]>;
  ack(ids: readonly string[]): Promise<void>;
}

/** What the inbox needs of the transcript (the transcript manager). */
export interface ChatInboxTranscript {
  listAgents(): Promise<readonly unknown[]> | readonly unknown[];
  sendPrompt(prompt: string, options: Record<string, unknown>): Promise<void>;
}

export interface ChatInboxOptions {
  readonly transcript: ChatInboxTranscript;
  readonly server: ChatInboxServer;
  /** Whether a turn can run yet (`turn-execution`'s `isRunReady`): until then nothing is taken. */
  readonly isReady: () => boolean | Promise<boolean>;
  /** Whether the notify bus's stream is up: while it is, the server says when a message waits. */
  readonly isNotifyConnected: () => boolean;
  readonly log?: (line: string) => void;
  readonly now?: () => number;
  readonly tickMs?: number;
}

/** `sendPrompt`'s options for a waiting message, exactly as the app would have sent them (LiveBackend.sendArguments). */
export function promptOptions(waiting: WaitingMessage): Record<string, unknown> | null {
  const message = waiting.message;
  if (typeof message.prompt !== "string") return null;
  const options: Record<string, unknown> = {
    agentId: waiting.agentId,
    clientNonce: waiting.nonce,
    directAddressedAcceptance: true,
    awaitTurn: false,
    attachmentPaths: [],
    attachmentNames: [],
  };
  if (typeof message.richText === "string" && message.richText.length > 0) options.richText = message.richText;
  if (typeof message.replyToId === "string" && message.replyToId.length > 0) options.replyToId = message.replyToId;
  if (message.isFork === true) options.isFork = true;
  if (typeof message.composedAtMs === "number" && Number.isFinite(message.composedAtMs)) options.composedAtMs = message.composedAtMs;
  return options;
}

function agentIdOf(row: unknown): string | null {
  return typeof row === "object" && row != null && typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : null;
}

/** A refusal the same message will always meet: its nonce went with other words, or was refused before. */
function isFinalRefusal(error: unknown): boolean {
  return error instanceof PromptAcceptanceRejectedError || (typeof error === "object" && error != null && (error as { code?: unknown }).code === NONCE_DIGEST_MISMATCH);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ChatInbox {
  private readonly log: (line: string) => void;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private draining: Promise<void> | null = null;
  private drainAgain = false;
  /** A drain is owed: the server said a message waits, or the last one could not run yet. */
  private owed = false;
  private againAt = 0;
  private lastPollAt = 0;
  private backoffUntil = 0;
  private failures = 0;
  private readonly tries = new Map<string, number>();
  /** Handed to their agents, not yet confirmed to the server: told again, never handed again. */
  private readonly handed = new Set<string>();
  /** Who takes each kind besides `prompt` (`channel`: what an agent's bot heard, the channels runtime). */
  private readonly handlers = new Map<string, (message: WaitingMessage) => Promise<boolean> | boolean>();

  constructor(private readonly options: ChatInboxOptions) {
    this.log = options.log ?? logHostLine;
    this.now = options.now ?? Date.now;
  }

  /** Looks now, then on its timer; the first look is returned. */
  start(): Promise<void> {
    if (this.stopped || this.timer != null) return this.draining ?? Promise.resolve();
    this.owed = true;
    this.log(`${HOST_LOG_PREFIX} chat-inbox on`);
    this.timer = setInterval(() => { void this.tick(); }, this.options.tickMs ?? CHAT_INBOX_TICK_MS);
    this.timer.unref?.();
    return this.drainNow();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Another part of this computer takes a kind of waiting message (the
   * channels runtime takes `channel`): its handler answers false for one
   * it can't read, which is left out; a throw is a failure, tried again as
   * a message is. The waiting ones are looked at now.
   */
  handle(kind: string, handler: (message: WaitingMessage) => Promise<boolean> | boolean): () => void {
    this.handlers.set(kind, handler);
    this.owed = true;
    void this.drainNow();
    return () => { if (this.handlers.get(kind) === handler) this.handlers.delete(kind); };
  }

  /** The server says a message waits: taken now (the look returned), and looked for again a moment later. */
  onNotify(): Promise<void> {
    this.owed = true;
    this.againAt = this.now() + CHAT_INBOX_AGAIN_MS;
    this.backoffUntil = 0;
    return this.drainNow();
  }

  /** What the timer runs: a drain when one is owed or due. */
  async tick(): Promise<void> {
    if (this.stopped) return;
    const now = this.now();
    if (now < this.backoffUntil) return;
    if (this.againAt > 0 && now >= this.againAt) { this.againAt = 0; this.owed = true; }
    const since = now - this.lastPollAt;
    const due = this.owed || since >= CHAT_INBOX_SAFETY_POLL_MS || (!this.options.isNotifyConnected() && since >= CHAT_INBOX_POLL_MS);
    if (due) await this.drainNow();
  }

  drainNow(): Promise<void> {
    if (this.draining != null) { this.drainAgain = true; return this.draining; }
    this.draining = (async () => {
      try {
        do { this.drainAgain = false; await this.drainOnce(); } while (this.drainAgain && !this.stopped);
      } finally { this.draining = null; }
    })();
    return this.draining;
  }

  private async drainOnce(): Promise<void> {
    if (this.stopped || this.now() < this.backoffUntil) return;
    if (!(await this.options.isReady())) { this.owed = true; return; }
    this.owed = false;
    let waiting: readonly WaitingMessage[];
    try {
      waiting = await this.options.server.waiting();
    } catch (error) {
      this.failed(`not read: ${errorText(error)}`);
      return;
    }
    this.lastPollAt = this.now();
    if (waiting.length === 0) { this.failures = 0; return; }
    let known: Set<string>;
    try {
      // The agents on disk, not the list cached for the apps, which is empty until it is first read.
      known = new Set((await this.options.transcript.listAgents()).map(agentIdOf).filter((id): id is string => id != null));
    } catch (error) {
      this.failed(`agents not listed: ${errorText(error)}`);
      return;
    }
    // No agent at all is a list not read yet, not every message's agent gone: nothing is left out for it.
    if (known.size === 0) { this.failed("no agents listed yet"); return; }
    const done: string[] = [];
    const leftOut: string[] = [];
    let handedNow = 0;
    for (const message of waiting) {
      if (this.handed.has(message.id)) { done.push(message.id); continue; }
      // A kind no part of this computer takes (yet) stays for one that does.
      const handler = message.kind === "prompt" ? null : this.handlers.get(message.kind);
      if (message.kind !== "prompt" && handler == null) continue;
      const options = message.kind === "prompt" ? promptOptions(message) : null;
      const unreadable = message.kind === "prompt" ? options == null : false;
      if (unreadable || !known.has(message.agentId)) {
        leftOut.push(`agent=${message.agentId} (${unreadable ? "no words" : "no such agent"})`);
        done.push(message.id);
        continue;
      }
      try {
        if (handler != null) {
          if (!(await handler(message))) {
            leftOut.push(`agent=${message.agentId} (not a ${message.kind} message this computer reads)`);
            done.push(message.id);
            continue;
          }
        } else {
          await this.options.transcript.sendPrompt(message.message.prompt as string, options as Record<string, unknown>);
        }
      } catch (error) {
        if (isFinalRefusal(error)) {
          leftOut.push(`agent=${message.agentId} (${errorText(error)})`);
          done.push(message.id);
          continue;
        }
        const tries = (this.tries.get(message.id) ?? 0) + 1;
        this.tries.set(message.id, tries);
        if (tries >= CHAT_INBOX_MAX_TRIES) {
          leftOut.push(`agent=${message.agentId} (failed ${tries} times: ${errorText(error)})`);
          this.tries.delete(message.id);
          done.push(message.id);
          continue;
        }
        // The ones after it wait with it: messages reach a chat in the order they were written.
        this.failed(`agent=${message.agentId} not handed (try ${tries}): ${errorText(error)}`);
        break;
      }
      this.tries.delete(message.id);
      this.handed.add(message.id);
      done.push(message.id);
      handedNow += 1;
    }
    for (const line of leftOut) this.log(`${HOST_LOG_PREFIX} chat-inbox left out a message for ${line}`);
    if (handedNow > 0) this.log(`${HOST_LOG_PREFIX} chat-inbox handed ${handedNow} message(s) to their agents`);
    if (done.length === 0) return;
    try {
      await this.options.server.ack(done);
      for (const id of done) this.handed.delete(id);
      if (this.now() >= this.backoffUntil) this.failures = 0;
    } catch (error) {
      this.failed(`not confirmed: ${errorText(error)}`);
      return;
    }
    // A full page may have more behind it.
    if (waiting.length >= 50) this.drainAgain = true;
  }

  private failed(detail: string): void {
    this.failures += 1;
    const wait = Math.min(CHAT_INBOX_RETRY_MS * 2 ** (this.failures - 1), CHAT_INBOX_RETRY_MAX_MS);
    this.backoffUntil = this.now() + wait;
    this.owed = true;
    this.log(`${HOST_LOG_PREFIX} chat-inbox failed, ${detail}; again in ${Math.round(wait / 1000)} s`);
  }
}

export function createChatInboxServer(deps: {
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): ChatInboxServer {
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
    async waiting() {
      const data = (await call(CHAT_INBOX_PATH)) as { messages?: unknown } | null;
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      return messages.filter((item): item is WaitingMessage => {
        if (typeof item !== "object" || item == null) return false;
        const message = item as Record<string, unknown>;
        return typeof message.id === "string" && typeof message.agentId === "string" && typeof message.nonce === "string" && typeof message.kind === "string" && typeof message.message === "object" && message.message != null;
      });
    },
    async ack(ids) {
      await call(CHAT_INBOX_ACK_PATH, { method: "POST", body: JSON.stringify({ ids }) });
    },
  };
}

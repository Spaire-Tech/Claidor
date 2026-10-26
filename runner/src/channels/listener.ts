/**
 * What every bot listener shares (26 October 2026): an agent's own Discord
 * or Slack bot, listened to here so it hears its messages while the
 * person's computer sleeps. A listener only listens. The computer sends the
 * replies itself, with the same tokens. What a bot hears goes to the API,
 * which keeps it for the computer and wakes it (`holder.ts`).
 *
 * The shapes match the computer's own connectors
 * (`desktop/source/host/extensions/channels/`), so a message it heard
 * itself while both listened is known by the same id there and lands once.
 */

export type ChannelStatus = 'connecting' | 'connected' | 'error';

/**
 * What the computer shows beside a bot's state: one of its own sentence keys
 * (`desktop/source/shared/words/areas/previews.ts`, `channel.*`) and the values
 * that go in it. The computer says it in the person's language.
 */
export interface StatusDetail {
  key: string;
  args?: Record<string, string>;
}

/** What a bot heard, as the computer's channel runtime reads it (`ChannelInbound`). */
export interface InboundEnvelope {
  address: { platform: string; chat: string };
  sender: string;
  text: string;
  timestampMs: number;
  reaction?: { emoji: string } | null;
  /** Slack: the thread the message was in, which the reply goes to. */
  thread?: string;
}

export interface Heard {
  /** The platform's own id of what was heard (a message, a reaction), the same one the computer's connectors give. */
  messageId: string;
  envelope: InboundEnvelope;
}

export interface ListenerCallbacks {
  onStatus(status: ChannelStatus, detail?: StatusDetail | null): void;
  onHeard(heard: Heard): void;
  /** A log line, in English, never a token nor what was said. */
  log(line: string): void;
}

export interface Listener {
  start(): void;
  stop(): Promise<void>;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(text: string): void;
  onClose(code: number, reason: string): void;
  onError(error: unknown): void;
}

export interface ListenerSocket {
  send(text: string): void;
  close(code?: number, reason?: string): void;
  readonly isOpen: boolean;
}

export type OpenSocket = (url: string, handlers: SocketHandlers) => ListenerSocket;

export interface ListenerClock {
  /** Resolves after `ms`, or at once when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  every(ms: number, fn: () => void): { dispose(): void };
}

/** A JSON call to a platform's API; throws on a status that is not 2xx. */
export type JsonCall = <T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<T>;

export const RECONNECT_INITIAL_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 60_000;

/** Exponential backoff with a little jitter, capped (the computer's `reconnectDelayMs`). */
export const reconnectDelayMs = (attempt: number, random: () => number = Math.random): number => {
  const base = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_INITIAL_DELAY_MS * 2 ** Math.max(0, Math.min(attempt, 16)));
  return Math.round(base * (0.8 + random() * 0.4));
};

export const realClock: ListenerClock = {
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      function onAbort(): void {
        clearTimeout(timer);
        resolve();
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
  every: (ms, fn) => {
    const timer = setInterval(fn, ms);
    timer.unref?.();
    return { dispose: () => clearInterval(timer) };
  },
};

/** A WebSocket through Node's own (Node 22 and later). */
export const openSocket: OpenSocket = (url, handlers) => {
  const socket = new WebSocket(url);
  socket.addEventListener('open', () => handlers.onOpen());
  socket.addEventListener('message', (event) => {
    const data: unknown = event.data;
    handlers.onMessage(typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8'));
  });
  socket.addEventListener('close', (event) => handlers.onClose(event.code, event.reason));
  socket.addEventListener('error', (event) => handlers.onError(event));
  return {
    send: (text) => socket.send(text),
    close: (code, reason) => {
      try {
        socket.close(code, reason);
      } catch {
        socket.close();
      }
    },
    get isOpen() {
      return socket.readyState === WebSocket.OPEN;
    },
  };
};

/** A JSON call with a timeout; a status that is not 2xx throws with the status in its message. */
export const jsonCall: JsonCall = async <T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T> => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (raw ? JSON.parse(raw) : {}) as T;
};

/** A token's kind (`xapp-`, `xoxb-`, else nothing) and its length, for a log line: never the token (the computer's `describeToken`). */
export const describeToken = (token: string): string => `${token.match(/^[A-Za-z]+-/)?.[0] ?? ''}…(${token.length})`;

export const reasonText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

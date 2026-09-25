import type { ChannelOutboundMessage } from "../../../shared/channel-messaging.js";
import type { ChannelConnectionStatus } from "../session/channel-store.js";

/**
 * What every platform connector gives the runtime (25 September 2026):
 * a lifecycle, delivery to one chat, a typing signal while the agent
 * works on an inbound message, and two callbacks up — an inbound
 * envelope in the shape `BackgroundWakes.runInboundWake` reads
 * (`shared/channel-messaging.ts` `ChannelInboundEnvelope`, plus
 * `timestampMs`), and a status the channel store records.
 */
export interface ChannelInbound {
  readonly address: { readonly platform: string; readonly chat: string };
  readonly sender: string;
  readonly text: string;
  readonly timestampMs: number;
  readonly reaction?: { readonly emoji: string; readonly messageQuote?: string | null } | null;
}

export interface ConnectorCallbacks {
  onInbound(envelope: ChannelInbound): void;
  onStatus(status: ChannelConnectionStatus, detail?: string | null): void;
  log(event: string, fields?: Record<string, string | number | boolean | null | undefined>): void;
}

export interface ChannelConnector {
  readonly platform: string;
  start(): void;
  stop(): Promise<void>;
  deliver(chat: string, message: ChannelOutboundMessage): Promise<void>;
  setActivity(chat: string, isActive: boolean): void;
}

export const RECONNECT_INITIAL_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 60_000;

/** Exponential backoff with a little jitter, capped; attempt 0 waits the initial delay. */
export function reconnectDelayMs(attempt: number, initial = RECONNECT_INITIAL_DELAY_MS, max = RECONNECT_MAX_DELAY_MS, random: () => number = Math.random): number {
  const base = Math.min(max, initial * 2 ** Math.max(0, Math.min(attempt, 16)));
  return Math.round(base * (0.8 + random() * 0.4));
}

export interface ConnectorClock {
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  setInterval(fn: () => void, ms: number): { dispose(): void };
}

export const realConnectorClock: ConnectorClock = {
  sleep: (ms, signal) => new Promise<void>((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); resolve(); }
    signal?.addEventListener("abort", onAbort, { once: true });
  }),
  setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timer.unref?.(); return { dispose: () => clearInterval(timer) }; },
};

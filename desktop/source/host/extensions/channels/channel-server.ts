import { createHash } from "node:crypto";

import type { ChannelConnectionStatus } from "../session/channel-store.js";

/**
 * The agents' own bots handed to Simeon Labs' server (26 October 2026, the
 * computer as a worker; `server/simeon/desktop/channel_bots.py`): the cloud
 * runner listens to them there, so a bot hears its messages while this
 * computer sleeps, and what it hears comes back through the inbox
 * (`chat-copy/chat-inbox.ts`, kind `channel`). This computer keeps sending
 * the replies.
 *
 * `POST /desktop/api/channels/sync` takes the whole list, each bot with a
 * fingerprint of its tokens and the tokens themselves only when the server
 * does not hold them as they are; it answers whether it holds bots at all,
 * and each bot's state as the runner last reported it.
 */
export const CHANNELS_SYNC_PATH = "/desktop/api/channels/sync";

export interface SyncedChannel {
  readonly agentId: string;
  readonly platform: string;
  readonly fingerprint: string;
  readonly secrets?: Readonly<Record<string, string>>;
}

/** What the runner last said of a bot; `fresh` when it said so in the last three minutes. */
export interface ServerChannelState {
  readonly agentId: string;
  readonly platform: string;
  /** The server lacks these tokens: they are sent with the next sync. */
  readonly missing: boolean;
  readonly status: ChannelConnectionStatus | null;
  /** One of this computer's sentence keys (`say`) and its values. */
  readonly detail: { readonly key: string; readonly args?: Readonly<Record<string, string>> } | null;
  readonly fresh: boolean;
}

export interface ChannelServer {
  sync(channels: readonly SyncedChannel[]): Promise<{ held: boolean; channels: readonly ServerChannelState[] }>;
}

/** A mark of a bot's tokens that says whether they changed, without being them. */
export function secretsFingerprint(secrets: Readonly<Record<string, string>>): string {
  const sorted = Object.fromEntries(Object.entries(secrets).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32);
}

const STATUSES = new Set(["connecting", "connected", "error"]);

function stateOf(value: unknown): ServerChannelState | null {
  if (typeof value !== "object" || value == null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.agentId !== "string" || typeof row.platform !== "string") return null;
  const detail = typeof row.detail === "object" && row.detail != null && typeof (row.detail as { key?: unknown }).key === "string" ? (row.detail as ServerChannelState["detail"]) : null;
  return {
    agentId: row.agentId,
    platform: row.platform,
    missing: row.missing === true,
    status: typeof row.status === "string" && STATUSES.has(row.status) ? (row.status as ChannelConnectionStatus) : null,
    detail,
    fresh: row.fresh === true,
  };
}

export function createChannelServer(deps: {
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): ChannelServer {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return {
    async sync(channels) {
      const backendUrl = deps.getBackendUrl();
      const token = await deps.getAccessToken({ backendUrl });
      if (token.length === 0) throw new Error(`no credential for ${backendUrl}`);
      const response = await fetchImpl(new URL(CHANNELS_SYNC_PATH, backendUrl).toString(), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ channels }),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
      });
      type Answer = { code?: unknown; data?: { held?: unknown; channels?: unknown }; message?: unknown };
      let body: Answer | null = null;
      try { body = (await response.json()) as Answer | null; } catch {}
      if (!response.ok || body?.code !== 0) throw new Error(`${CHANNELS_SYNC_PATH} answered ${response.status}${typeof body?.message === "string" ? ` ${body.message}` : ""}`);
      const states = Array.isArray(body.data?.channels) ? body.data.channels.map(stateOf).filter((state): state is ServerChannelState => state != null) : [];
      return { held: body.data?.held === true, channels: states };
    },
  };
}

import { buildChannelOutboundMessage, type ChannelOutboundMessage } from "../../../shared/channel-messaging.js";
import { CHANNEL_TOKEN_FIELD, SLACK_BOT_TOKEN_FIELD } from "../../../shared/channel-credential.js";
import { DISCORD_PLATFORM, findConnectorManifest, isChannelsServed, parseChannelAddress, SLACK_PLATFORM } from "../../../shared/channels.js";
import { logHostLine } from "../../../shared/host-log.js";
import type { ChannelConnectionStatus } from "../session/channel-store.js";
import { createChannelLogger, errorSentence, type ChannelLogSink } from "./channel-log.js";
import { createChannelHttp, type ChannelHttp } from "./channel-http.js";
import { realConnectorClock, type ChannelConnector, type ChannelInbound, type ConnectorClock } from "./connector.js";
import { DiscordConnector } from "./discord-connector.js";
import { SlackConnector } from "./slack-connector.js";
import type { CreateChannelSocket } from "./socket.js";

/**
 * The module the transcript manager's channel hooks were waiting for (25
 * September 2026; docs/product/cursor-dependencies-map.md §2). It reads
 * every agent's stored channel credentials, keeps one connector per
 * (agent, platform), registers `setChannelDelivery`, `setChannelActivity`
 * and `setChannelConfigChanged` on the manager, and turns each inbound
 * message into `wakeForInbound(agentId, envelope)`. A credential written by
 * the Channels tab, the secret-request card or the agent's own
 * update_state is picked up on the manager's change hook and, as a
 * backstop, on a short poll; a row that disappears closes its connection.
 */
export const CHANNEL_RECONCILE_POLL_MS = 5_000;

export interface ChannelRuntimeTranscript {
  listAgentIds(): Promise<readonly string[]> | readonly string[];
  listChannelConfigs(agentId: string): readonly { platform: string; token: string; label: string; secrets?: Record<string, string> }[];
  setChannelDelivery(deliver: (agentId: string, addressToken: string, message: ChannelOutboundMessage) => Promise<void>): void;
  setChannelActivity(notify: (agentId: string, addressToken: string, isActive: boolean) => void): void;
  setChannelConfigChanged(onChanged: () => void): void;
  wakeForInbound(agentId: string, envelope: ChannelInbound): void;
  readonly sessionStore?: { writeChannelStatus?(agentId: string, platform: string, status: ChannelConnectionStatus, detail?: string | null): boolean };
}

export interface ChannelRuntimeOptions {
  readonly transcript: ChannelRuntimeTranscript;
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: ChannelLogSink;
  readonly pollMs?: number;
  readonly clock?: ConnectorClock;
  readonly http?: ChannelHttp;
  readonly createSocket?: CreateChannelSocket;
  readonly discord?: { readonly gatewayUrl?: string; readonly apiBase?: string };
  readonly slack?: { readonly apiBase?: string };
  readonly random?: () => number;
}

export interface ChannelRuntimeStatus { readonly agentId: string; readonly platform: string; readonly status: ChannelConnectionStatus; readonly detail: string | null }

interface Slot { readonly fingerprint: string; readonly connector: ChannelConnector | null; status: ChannelConnectionStatus; detail: string | null }

function slotKey(agentId: string, platform: string): string { return `${agentId}\u0000${platform}`; }

/** Which credential fields a platform's connection needs, in the order a person is asked for them. */
export function requiredCredentialFields(platform: string): readonly string[] {
  return platform === SLACK_PLATFORM ? [CHANNEL_TOKEN_FIELD, SLACK_BOT_TOKEN_FIELD] : [CHANNEL_TOKEN_FIELD];
}

export function missingCredentialSentence(platform: string, missing: readonly string[]): string {
  const name = findConnectorManifest(platform)?.displayName ?? platform;
  if (platform === SLACK_PLATFORM) {
    const which = missing.includes(CHANNEL_TOKEN_FIELD) ? "the app-level token (xapp-…)" : "the bot token (xoxb-…)";
    return `Waiting for ${which}: Slack needs both, paste it into the Channels tab or answer a secret-request for field "${missing[0]}".`;
  }
  return `Waiting for the ${name} ${missing.join(", ")}.`;
}

export function createChannelRuntime(options: ChannelRuntimeOptions) {
  const env = options.env ?? process.env;
  const sink = options.log ?? logHostLine;
  const clock = options.clock ?? realConnectorClock;
  const http = options.http ?? createChannelHttp();
  const slots = new Map<string, Slot>();
  let stopped = false;
  let poll: { dispose(): void } | null = null;
  let reconciling: Promise<void> | null = null;
  let reconcileAgain = false;

  const record = (agentId: string, platform: string, status: ChannelConnectionStatus, detail: string | null) => {
    const slot = slots.get(slotKey(agentId, platform));
    if (slot != null) { slot.status = status; slot.detail = detail; }
    try { options.transcript.sessionStore?.writeChannelStatus?.(agentId, platform, status, detail); } catch (error) { sink(`[claidor] channel=${platform} agent=${agentId} event=error detail="status not written: ${errorSentence(error)}"`); }
  };

  const build = (agentId: string, platform: string, secrets: Record<string, string>): ChannelConnector | null => {
    const log = createChannelLogger(platform, agentId, sink);
    const callbacks = {
      log,
      onStatus: (status: ChannelConnectionStatus, detail?: string | null) => record(agentId, platform, status, detail ?? null),
      onInbound: (envelope: ChannelInbound) => {
        try { options.transcript.wakeForInbound(agentId, envelope); }
        catch (error) { log("error", { detail: `wake failed: ${errorSentence(error)}` }); }
      },
    };
    const shared = { agentId, callbacks, http, clock, ...(options.createSocket == null ? {} : { createSocket: options.createSocket }), ...(options.random == null ? {} : { random: options.random }) };
    if (platform === DISCORD_PLATFORM) return new DiscordConnector({ ...shared, token: secrets[CHANNEL_TOKEN_FIELD] ?? "", ...(options.discord?.gatewayUrl == null ? {} : { gatewayUrl: options.discord.gatewayUrl }), ...(options.discord?.apiBase == null ? {} : { apiBase: options.discord.apiBase }) });
    if (platform === SLACK_PLATFORM) return new SlackConnector({ ...shared, appToken: secrets[CHANNEL_TOKEN_FIELD] ?? "", botToken: secrets[SLACK_BOT_TOKEN_FIELD] ?? "", ...(options.slack?.apiBase == null ? {} : { apiBase: options.slack.apiBase }) });
    return null;
  };

  async function reconcileOnce(): Promise<void> {
    const wanted = new Map<string, { agentId: string; platform: string; secrets: Record<string, string> }>();
    if (!stopped && isChannelsServed(env)) {
      let agentIds: readonly string[] = [];
      try { agentIds = await options.transcript.listAgentIds(); } catch (error) { sink(`[claidor] channel=runtime agent=- event=error detail="agents not listed: ${errorSentence(error)}"`); }
      for (const agentId of agentIds) {
        let configs: ReturnType<ChannelRuntimeTranscript["listChannelConfigs"]> = [];
        try { configs = options.transcript.listChannelConfigs(agentId); } catch (error) { sink(`[claidor] channel=runtime agent=${agentId} event=error detail="channels not listed: ${errorSentence(error)}"`); continue; }
        for (const config of configs) {
          if (findConnectorManifest(config.platform, env)?.availability !== "available") continue;
          const secrets: Record<string, string> = { ...(config.secrets ?? {}) };
          if (config.token.length > 0) secrets[CHANNEL_TOKEN_FIELD] = config.token;
          wanted.set(slotKey(agentId, config.platform), { agentId, platform: config.platform, secrets });
        }
      }
    }
    for (const [key, slot] of [...slots]) {
      const want = wanted.get(key);
      if (want != null && want.secrets != null && JSON.stringify(want.secrets) === slot.fingerprint) continue;
      slots.delete(key);
      if (slot.connector != null) {
        const [agentId, platform] = key.split("\u0000") as [string, string];
        sink(`[claidor] channel=${platform} agent=${agentId} event=stop reason=${want == null ? "removed" : "credential-changed"}`);
        await slot.connector.stop().catch(() => {});
      }
    }
    for (const [key, want] of wanted) {
      if (slots.has(key)) continue;
      const fingerprint = JSON.stringify(want.secrets);
      const missing = requiredCredentialFields(want.platform).filter((field) => !(want.secrets[field] ?? "").length);
      if (missing.length > 0) {
        slots.set(key, { fingerprint, connector: null, status: "pending", detail: null });
        record(want.agentId, want.platform, "pending", missingCredentialSentence(want.platform, missing));
        sink(`[claidor] channel=${want.platform} agent=${want.agentId} event=pending missing=${missing.join(",")}`);
        continue;
      }
      const connector = build(want.agentId, want.platform, want.secrets);
      if (connector == null) continue;
      slots.set(key, { fingerprint, connector, status: "connecting", detail: null });
      try { connector.start(); } catch (error) { record(want.agentId, want.platform, "error", errorSentence(error)); }
    }
  }

  function reconcile(): Promise<void> {
    if (reconciling != null) { reconcileAgain = true; return reconciling; }
    reconciling = (async () => {
      try {
        do { reconcileAgain = false; await reconcileOnce(); } while (reconcileAgain && !stopped);
      } finally { reconciling = null; }
    })();
    return reconciling;
  }

  const deliver = async (agentId: string, addressToken: string, message: ChannelOutboundMessage | { type: string }) => {
    const address = parseChannelAddress(addressToken);
    if (address == null) throw new Error(`"${addressToken}" is not a valid channel address (expected platform:chat).`);
    const name = findConnectorManifest(address.platform, env)?.displayName ?? address.platform;
    const slot = slots.get(slotKey(agentId, address.platform));
    if (slot?.connector == null) throw new Error(`No live ${name} connection for this agent${slot?.detail ? ` (${slot.detail})` : ""}.`);
    if (slot.status !== "connected") throw new Error(`No live ${name} connection for this agent yet (${slot.status}${slot.detail ? `: ${slot.detail}` : ""}).`);
    const outbound = "kind" in message ? message : buildChannelOutboundMessage(message as never);
    if (outbound == null) throw new Error("Nothing to deliver: the message has no text and no attachment.");
    try { await slot.connector.deliver(address.chat, outbound); }
    catch (error) { sink(`[claidor] channel=${address.platform} agent=${agentId} event=delivery-failed chat=${address.chat} detail=${JSON.stringify(errorSentence(error))}`); throw error; }
  };

  const activity = (agentId: string, addressToken: string, isActive: boolean) => {
    const address = parseChannelAddress(addressToken);
    if (address == null) return;
    slots.get(slotKey(agentId, address.platform))?.connector?.setActivity(address.chat, isActive);
  };

  return {
    start(): void {
      options.transcript.setChannelDelivery(deliver);
      options.transcript.setChannelActivity(activity);
      options.transcript.setChannelConfigChanged(() => { void reconcile(); });
      sink(`[claidor] channel=runtime agent=- event=start served=${isChannelsServed(env)} poll=${options.pollMs ?? CHANNEL_RECONCILE_POLL_MS}`);
      void reconcile();
      poll = clock.setInterval(() => { void reconcile(); }, options.pollMs ?? CHANNEL_RECONCILE_POLL_MS);
    },
    reconcile,
    async stop(): Promise<void> {
      stopped = true;
      poll?.dispose();
      poll = null;
      await reconcile();
      const closing = [...slots.values()].map((slot) => slot.connector?.stop().catch(() => {}));
      slots.clear();
      await Promise.all(closing);
    },
    statuses(): ChannelRuntimeStatus[] {
      return [...slots].map(([key, slot]) => { const [agentId, platform] = key.split("\u0000") as [string, string]; return { agentId, platform, status: slot.status, detail: slot.detail }; });
    },
    deliver,
  };
}

export type ChannelRuntime = ReturnType<typeof createChannelRuntime>;

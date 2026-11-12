import { buildChannelOutboundMessage, type ChannelOutboundMessage } from "../../../shared/channel-messaging.js";
import { CHANNEL_APP_FIELD, CHANNEL_APP_VALUE, CHANNEL_TOKEN_FIELD, isAppConnection, SLACK_BOT_TOKEN_FIELD } from "../../../shared/channel-credential.js";
import { DISCORD_PLATFORM, findConnectorManifest, isChannelsServed, parseChannelAddress, SLACK_PLATFORM } from "../../../shared/channels.js";
import { logHostLine } from "../../../shared/host-log.js";
import { say } from "../../../shared/say.js";
import { currentUserLanguage } from "../../../shared/user-language.js";
import type { ChannelConnectionStatus } from "../session/channel-store.js";
import { ENGLISH, type WordKey } from "../../../shared/words/en.js";
import { createChannelLogger, errorSentence, type ChannelLogSink } from "./channel-log.js";
import { createChannelHttp, type ChannelHttp } from "./channel-http.js";
import { AppSlackConnector } from "./app-slack-connector.js";
import { secretsFingerprint, type ChannelServer, type HostedChannel, type ServerChannelState, type SyncedChannel } from "./channel-server.js";
import { realConnectorClock, type ChannelConnector, type ChannelInbound, type ConnectorClock } from "./connector.js";
import { DiscordConnector } from "./discord-connector.js";
import { SlackConnector } from "./slack-connector.js";
import type { CreateChannelSocket } from "./socket.js";

/**
 * The module the transcript manager's channel hooks were waiting for (25
 * September 2026; docs/services-agents.md §2). It reads
 * every agent's stored channel credentials, keeps one connector per
 * (agent, platform), registers `setChannelDelivery`, `setChannelActivity`
 * and `setChannelConfigChanged` on the manager, and turns each inbound
 * message into `wakeForInbound(agentId, envelope)`. A credential written by
 * the Channels tab, the secret-request card or the agent's own
 * update_state is picked up on the manager's change hook and, as a
 * backstop, on a short poll; a row that disappears closes its connection.
 */
export const CHANNEL_RECONCILE_POLL_MS = 5_000;
/**
 * The bots are handed to Simeon Labs' server at least this often (26
 * October 2026, `channel-server.ts`): each time the list changes, and every
 * 30 s anyway to read what the cloud runner says of each one. A bot the
 * runner listens to, by its fresh word, is one this computer only replies
 * through; any other it listens to itself, as before.
 */
export const CHANNEL_SYNC_MS = 30_000;
/** The server's word on who listens holds this long without a new answer. */
export const CHANNEL_SERVER_WORD_MS = 3 * 60_000;
/** What was heard is known by its id this long (the newest ids): heard both here and by the runner, it lands once. */
export const CHANNEL_HEARD_REMEMBERED = 1_000;

export interface ChannelRuntimeTranscript {
  listAgentIds(): Promise<readonly string[]> | readonly string[];
  listChannelConfigs(agentId: string): readonly { platform: string; token: string; label: string; secrets?: Record<string, string> }[];
  setChannelDelivery(deliver: (agentId: string, addressToken: string, message: ChannelOutboundMessage) => Promise<void>): void;
  setChannelActivity(notify: (agentId: string, addressToken: string, isActive: boolean) => void): void;
  setChannelConfigChanged(onChanged: () => void): void;
  wakeForInbound(agentId: string, envelope: ChannelInbound): void;
  /** A connection taken off this computer's list (an agent's Slack disconnected elsewhere, 12 November 2026). */
  disconnectChannel?(agentId: string, platform: string): unknown;
  readonly sessionStore?: {
    writeChannelStatus?(agentId: string, platform: string, status: ChannelConnectionStatus, detail?: string | null): boolean;
    /** An agent's Slack through Simeon's own app listed here, with the workspace's name (no token: `CHANNEL_APP_FIELD`). */
    storeAppChannel?(agentId: string, platform: string, label: string): boolean;
  };
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
  /** Simeon Labs' server, to hand the bots to (none: this computer listens to every bot itself). */
  readonly server?: ChannelServer;
  readonly syncMs?: number;
  readonly now?: () => number;
}

/** A connection this computer's list asks for: its tokens (or the app's mark), its name, and whether it is through Simeon's own app. */
interface Wanted { readonly agentId: string; readonly platform: string; readonly secrets: Record<string, string>; readonly label: string; readonly app: boolean }

export interface ChannelRuntimeStatus { readonly agentId: string; readonly platform: string; readonly status: ChannelConnectionStatus; readonly detail: string | null; readonly listening: Mode }

/**
 * `here`: this computer holds the bot's connection. `server`: the cloud runner
 * does, and this computer only replies. `app`: Slack through Simeon's own app
 * (12 November 2026), heard and answered through Simeon Labs' server, with no
 * token here at all.
 */
type Mode = "here" | "server" | "app";

interface Slot { readonly fingerprint: string; readonly connector: ChannelConnector | null; readonly mode: Mode; status: ChannelConnectionStatus; detail: string | null }

/** A sentence the runner names by this computer's key, in the person's language; nothing for a key this computer doesn't have. */
function serverDetail(detail: ServerChannelState["detail"]): string | null {
  if (detail == null || !(detail.key in ENGLISH)) return null;
  return say(currentUserLanguage(), detail.key as WordKey, detail.args ?? {});
}

function slotKey(agentId: string, platform: string): string { return `${agentId}\u0000${platform}`; }

/** Which credential fields a platform's connection needs, in the order a person is asked for them; none for one through Simeon's own app. */
export function requiredCredentialFields(platform: string, secrets?: Readonly<Record<string, string>>): readonly string[] {
  if (isAppConnection(secrets)) return [];
  return platform === SLACK_PLATFORM ? [CHANNEL_TOKEN_FIELD, SLACK_BOT_TOKEN_FIELD] : [CHANNEL_TOKEN_FIELD];
}

/** A pending connection's status, in the person's language (`say`). */
export function missingCredentialSentence(platform: string, missing: readonly string[]): string {
  const language = currentUserLanguage();
  const name = findConnectorManifest(platform)?.displayName ?? platform;
  if (platform === SLACK_PLATFORM) {
    return say(language, missing.includes(CHANNEL_TOKEN_FIELD) ? "channel.waitingSlackAppToken" : "channel.waitingSlackBotToken", { field: missing[0] ?? "" });
  }
  return say(language, "channel.waitingFor", { name, fields: missing.join(", ") });
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
  const now = options.now ?? Date.now;
  /** The server's last answer: whether it holds bots, and what the runner said of each. */
  let synced: { at: number; digest: string; held: boolean; states: Map<string, ServerChannelState> } | null = null;
  /** The tokens the server holds as they are, by bot: not sent again. */
  const serverHas = new Map<string, string>();
  let syncFailing = false;
  let lastSyncTry = 0;
  const heard = new Set<string>();
  /** The agents that talk in Slack through Simeon's own app, by the server's last answer that named them (none from a server that never does). */
  let hosted: Map<string, HostedChannel> | null = null;
  /** Those listed here once: one that then goes from this computer's list was disconnected here, and the server is told. */
  const appSeen = new Set<string>();
  /** Disconnected here: the server is told until it no longer lists them, and they are not listed again meanwhile. */
  const appLeaving = new Set<string>();

  const record = (agentId: string, platform: string, status: ChannelConnectionStatus, detail: string | null) => {
    const slot = slots.get(slotKey(agentId, platform));
    if (slot != null) { slot.status = status; slot.detail = detail; }
    try { options.transcript.sessionStore?.writeChannelStatus?.(agentId, platform, status, detail); } catch (error) { sink(`[simeon] channel=${platform} agent=${agentId} event=error detail="status not written: ${errorSentence(error)}"`); }
  };

  /** Heard before, here or by the runner: true, and it is not handed to the agent again. */
  const heardBefore = (agentId: string, envelope: ChannelInbound): boolean => {
    if (envelope.messageId == null) return false;
    const key = `${envelope.address.platform}\u0000${agentId}\u0000${envelope.messageId}`;
    if (heard.has(key)) return true;
    heard.add(key);
    if (heard.size > CHANNEL_HEARD_REMEMBERED) heard.delete(heard.values().next().value as string);
    return false;
  };

  const wake = (agentId: string, envelope: ChannelInbound, log: ReturnType<typeof createChannelLogger>) => {
    if (heardBefore(agentId, envelope)) { log("inbound-duplicate", { chat: envelope.address.chat }); return; }
    try { options.transcript.wakeForInbound(agentId, envelope); }
    catch (error) { log("error", { detail: `wake failed: ${errorSentence(error)}` }); }
  };

  const build = (agentId: string, platform: string, secrets: Record<string, string>, mode: Mode): ChannelConnector | null => {
    const log = createChannelLogger(platform, agentId, sink);
    const callbacks = {
      log,
      // Listened to by the runner, the connector is never started: its state is the runner's (`applyServerState`).
      onStatus: (status: ChannelConnectionStatus, detail?: string | null) => { if (mode !== "server") record(agentId, platform, status, detail ?? null); },
      onInbound: (envelope: ChannelInbound) => wake(agentId, envelope, log),
    };
    if (mode === "app") {
      const send = options.server?.sendSlack;
      return platform === SLACK_PLATFORM && send != null ? new AppSlackConnector({ agentId, callbacks, send: (message) => send(message) }) : null;
    }
    const shared = { agentId, callbacks, http, clock, ...(options.createSocket == null ? {} : { createSocket: options.createSocket }), ...(options.random == null ? {} : { random: options.random }) };
    if (platform === DISCORD_PLATFORM) return new DiscordConnector({ ...shared, token: secrets[CHANNEL_TOKEN_FIELD] ?? "", ...(options.discord?.gatewayUrl == null ? {} : { gatewayUrl: options.discord.gatewayUrl }), ...(options.discord?.apiBase == null ? {} : { apiBase: options.discord.apiBase }) });
    if (platform === SLACK_PLATFORM) return new SlackConnector({ ...shared, appToken: secrets[CHANNEL_TOKEN_FIELD] ?? "", botToken: secrets[SLACK_BOT_TOKEN_FIELD] ?? "", ...(options.slack?.apiBase == null ? {} : { apiBase: options.slack.apiBase }) });
    return null;
  };

  /** The bots handed to the server when the list changed, or `syncMs` after the last time; the server's answer kept. */
  async function syncWithServer(complete: ReadonlyMap<string, { agentId: string; platform: string; secrets: Record<string, string> }>): Promise<void> {
    const server = options.server;
    if (server == null) return;
    // Tokens go only to a server that said it holds bots, and only those it does not hold as they are.
    const holds = synced?.held === true;
    const channels: SyncedChannel[] = [...complete].map(([key, want]) => {
      const fingerprint = secretsFingerprint(want.secrets);
      return { agentId: want.agentId, platform: want.platform, fingerprint, ...(holds && serverHas.get(key) !== fingerprint ? { secrets: want.secrets } : {}) };
    });
    const digest = JSON.stringify(channels.map((channel) => [channel.agentId, channel.platform, channel.fingerprint]).sort());
    const every = options.syncMs ?? CHANNEL_SYNC_MS;
    const due = synced == null || synced.digest !== digest || now() - synced.at >= every || channels.some((channel) => channel.secrets != null);
    // After a failure, not again for `every`.
    if (!due || (syncFailing && now() - lastSyncTry < every)) return;
    lastSyncTry = now();
    try {
      const answer = await server.sync(channels);
      const states = new Map(answer.channels.map((state) => [slotKey(state.agentId, state.platform), state]));
      serverHas.clear();
      for (const channel of channels) {
        const state = states.get(slotKey(channel.agentId, channel.platform));
        if (answer.held && state != null && !state.missing) serverHas.set(slotKey(channel.agentId, channel.platform), channel.fingerprint);
      }
      synced = { at: now(), digest, held: answer.held, states };
      if (answer.hosted != null) hosted = new Map(answer.hosted.map((row) => [slotKey(row.agentId, row.platform), row]));
      if (syncFailing) sink(`[simeon] channel=runtime agent=- event=server-sync detail="answered again"`);
      syncFailing = false;
    } catch (error) {
      // Kept as it was: the server's last word stands until it answers again; with none, this computer listens itself.
      if (!syncFailing) sink(`[simeon] channel=runtime agent=- event=error detail=${JSON.stringify(`server sync failed: ${errorSentence(error)}`)}`);
      syncFailing = true;
    }
  }

  /**
   * Who listens to a bot: the runner, when the server holds it and the
   * runner's word on it is fresh, as the server said in the last three
   * minutes; else this computer. A server that stopped answering leaves
   * every bot to this computer again.
   */
  const modeOf = (key: string): Mode => {
    const state = synced != null && synced.held && now() - synced.at <= CHANNEL_SERVER_WORD_MS ? synced.states.get(key) : undefined;
    return state != null && !state.missing && state.fresh ? "server" : "here";
  };

  /** How a wanted connection is held: through Simeon's own app, else by the runner or here. */
  const modeFor = (key: string, want: { app: boolean }): Mode => want.app ? "app" : modeOf(key);

  /**
   * This computer's list made the server's for the agents that talk in Slack
   * through Simeon's own app: one newly connected is listed here (its name
   * the workspace's), one this computer had and no longer has was
   * disconnected here and the server is told, and one the server no longer
   * names is taken off. Nothing changes without the server's word.
   */
  async function reconcileAppChannels(wanted: Map<string, Wanted>): Promise<void> {
    const server = options.server;
    if (hosted == null || server == null) return;
    for (const key of [...appLeaving]) if (!hosted.has(key)) appLeaving.delete(key);
    for (const [key, row] of hosted) {
      const local = wanted.get(key);
      if (local?.app) {
        appSeen.add(key);
        if (row.label.length > 0 && local.label !== row.label) options.transcript.sessionStore?.storeAppChannel?.(row.agentId, row.platform, row.label);
        continue;
      }
      if (appSeen.has(key) || appLeaving.has(key)) {
        // Gone from this computer's list after it was here: Disconnect in the Channels tab, or the agent's own.
        appSeen.delete(key);
        appLeaving.add(key);
        try {
          await server.disconnectSlack?.(row.agentId);
          sink(`[simeon] channel=${row.platform} agent=${row.agentId} event=app-disconnected`);
        } catch (error) {
          sink(`[simeon] channel=${row.platform} agent=${row.agentId} event=error detail=${JSON.stringify(`disconnect not told to the server: ${errorSentence(error)}`)}`);
        }
        continue;
      }
      if (options.transcript.sessionStore?.storeAppChannel?.(row.agentId, row.platform, row.label) === true) {
        appSeen.add(key);
        wanted.set(key, { agentId: row.agentId, platform: row.platform, secrets: { ...(local?.secrets ?? {}), [CHANNEL_APP_FIELD]: CHANNEL_APP_VALUE }, label: row.label, app: true });
        sink(`[simeon] channel=${row.platform} agent=${row.agentId} event=app-connected`);
      }
    }
    for (const [key, want] of [...wanted]) {
      if (!want.app || hosted.has(key)) continue;
      // The server no longer names it (disconnected in another app, or the workspace given to someone else).
      appSeen.delete(key);
      wanted.delete(key);
      try { options.transcript.disconnectChannel?.(want.agentId, want.platform); } catch (error) { sink(`[simeon] channel=${want.platform} agent=${want.agentId} event=error detail=${JSON.stringify(`not taken off: ${errorSentence(error)}`)}`); }
      sink(`[simeon] channel=${want.platform} agent=${want.agentId} event=app-removed`);
    }
  }

  /** The runner's word on a bot it listens to, shown as the bot's state. */
  const applyServerState = (key: string, agentId: string, platform: string): void => {
    const slot = slots.get(key);
    const state = synced?.states.get(key);
    if (slot == null || slot.mode !== "server" || state == null) return;
    const status = state.status ?? "connecting";
    const detail = serverDetail(state.detail);
    if (slot.status !== status || slot.detail !== detail) record(agentId, platform, status, detail);
  };

  async function reconcileOnce(): Promise<void> {
    const wanted = new Map<string, Wanted>();
    if (!stopped && isChannelsServed(env)) {
      let agentIds: readonly string[] = [];
      try { agentIds = await options.transcript.listAgentIds(); } catch (error) { sink(`[simeon] channel=runtime agent=- event=error detail="agents not listed: ${errorSentence(error)}"`); }
      for (const agentId of agentIds) {
        let configs: ReturnType<ChannelRuntimeTranscript["listChannelConfigs"]> = [];
        try { configs = options.transcript.listChannelConfigs(agentId); } catch (error) { sink(`[simeon] channel=runtime agent=${agentId} event=error detail="channels not listed: ${errorSentence(error)}"`); continue; }
        for (const config of configs) {
          if (findConnectorManifest(config.platform, env)?.availability !== "available") continue;
          const secrets: Record<string, string> = { ...(config.secrets ?? {}) };
          if (config.token.length > 0) secrets[CHANNEL_TOKEN_FIELD] = config.token;
          wanted.set(slotKey(agentId, config.platform), { agentId, platform: config.platform, secrets, label: config.label, app: isAppConnection(secrets) });
        }
      }
    }
    // A bot with its tokens goes to the server to be listened to; one through Simeon's own app holds no token to give.
    const complete = new Map([...wanted].filter(([, want]) => !want.app && requiredCredentialFields(want.platform).every((field) => (want.secrets[field] ?? "").length > 0)));
    if (!stopped) await syncWithServer(complete);
    if (!stopped) await reconcileAppChannels(wanted);
    for (const [key, slot] of [...slots]) {
      const want = wanted.get(key);
      if (want != null && want.secrets != null && JSON.stringify(want.secrets) === slot.fingerprint && (slot.connector == null || modeFor(key, want) === slot.mode)) continue;
      slots.delete(key);
      if (slot.connector != null) {
        const [agentId, platform] = key.split("\u0000") as [string, string];
        const reason = want == null ? "removed" : JSON.stringify(want.secrets) !== slot.fingerprint ? "credential-changed" : modeFor(key, want) === "server" ? "listened-by-server" : "listened-here";
        sink(`[simeon] channel=${platform} agent=${agentId} event=stop reason=${reason}`);
        await slot.connector.stop().catch(() => {});
      }
    }
    for (const [key, want] of wanted) {
      if (slots.has(key)) continue;
      const fingerprint = JSON.stringify(want.secrets);
      const missing = requiredCredentialFields(want.platform, want.secrets).filter((field) => !(want.secrets[field] ?? "").length);
      if (missing.length > 0) {
        slots.set(key, { fingerprint, connector: null, mode: "here", status: "pending", detail: null });
        record(want.agentId, want.platform, "pending", missingCredentialSentence(want.platform, missing));
        sink(`[simeon] channel=${want.platform} agent=${want.agentId} event=pending missing=${missing.join(",")}`);
        continue;
      }
      const mode = modeFor(key, want);
      const connector = build(want.agentId, want.platform, want.secrets, mode);
      if (connector == null) continue;
      slots.set(key, { fingerprint, connector, mode, status: "connecting", detail: null });
      if (mode === "app") sink(`[simeon] channel=${want.platform} agent=${want.agentId} event=connect via=app`);
      if (mode === "server") {
        // The runner listens; this connector only replies, so it is never started.
        sink(`[simeon] channel=${want.platform} agent=${want.agentId} event=listened-by-server`);
        record(want.agentId, want.platform, "connecting", null);
        continue;
      }
      try { connector.start(); } catch (error) { record(want.agentId, want.platform, "error", errorSentence(error)); }
    }
    for (const [key, want] of wanted) applyServerState(key, want.agentId, want.platform);
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
    // A bot the runner listens to replies over its REST API, which needs no live connection here.
    if (slot.mode === "here" && slot.status !== "connected") throw new Error(`No live ${name} connection for this agent yet (${slot.status}${slot.detail ? `: ${slot.detail}` : ""}).`);
    const outbound = "kind" in message ? message : buildChannelOutboundMessage(message as never);
    if (outbound == null) throw new Error("Nothing to deliver: the message has no text and no attachment.");
    try { await slot.connector.deliver(address.chat, outbound); }
    catch (error) { sink(`[simeon] channel=${address.platform} agent=${agentId} event=delivery-failed chat=${address.chat} detail=${JSON.stringify(errorSentence(error))}`); throw error; }
  };

  const activity = (agentId: string, addressToken: string, isActive: boolean) => {
    const address = parseChannelAddress(addressToken);
    if (address == null) return;
    slots.get(slotKey(agentId, address.platform))?.connector?.setActivity(address.chat, isActive);
  };

  /**
   * What a bot heard while the cloud runner listened to it, from the server's
   * inbox (`chat-copy/chat-inbox.ts`, kind `channel`): handed to the agent
   * as the bot's own connector hands it, once; a Slack reply goes to its
   * thread. False for something that is not a bot's message.
   */
  /** The agent's Slack through Simeon's own app, listed and opened at once (its name until the server's next word: "Slack"). */
  const openAppSlot = (agentId: string): Slot | undefined => {
    const key = slotKey(agentId, SLACK_PLATFORM);
    const label = hosted?.get(key)?.label ?? "";
    if (options.transcript.sessionStore?.storeAppChannel?.(agentId, SLACK_PLATFORM, label) !== true) return undefined;
    appSeen.add(key);
    const secrets = { [CHANNEL_APP_FIELD]: CHANNEL_APP_VALUE };
    const connector = build(agentId, SLACK_PLATFORM, secrets, "app");
    if (connector == null) return undefined;
    const previous = slots.get(key);
    if (previous?.connector != null) void previous.connector.stop().catch(() => {});
    const slot: Slot = { fingerprint: JSON.stringify(secrets), connector, mode: "app", status: "connecting", detail: null };
    slots.set(key, slot);
    sink(`[simeon] channel=${SLACK_PLATFORM} agent=${agentId} event=connect via=app`);
    connector.start();
    return slot;
  };

  const receiveFromServer = (agentId: string, envelope: unknown): boolean => {
    const value = envelope as Partial<ChannelInbound> | null;
    if (value == null || typeof value !== "object" || typeof value.address?.platform !== "string" || typeof value.address.chat !== "string" || typeof value.sender !== "string" || typeof value.text !== "string") return false;
    const inbound = value as ChannelInbound;
    const log = createChannelLogger(inbound.address.platform, agentId, sink);
    const key = slotKey(agentId, inbound.address.platform);
    let slot = slots.get(key);
    // Heard through Simeon's own Slack app before this computer listed the connection: listed now, so the answer has a way back.
    if ((value as { app?: unknown }).app === true && inbound.address.platform === SLACK_PLATFORM && !(slot?.connector instanceof AppSlackConnector)) slot = openAppSlot(agentId) ?? slot;
    if ((slot?.connector instanceof SlackConnector || slot?.connector instanceof AppSlackConnector) && inbound.reaction == null) slot.connector.noteThread(inbound.address.chat, inbound.thread);
    log("inbound", { chat: inbound.address.chat, via: (value as { app?: unknown }).app === true ? "app" : "server", chars: inbound.text.length });
    wake(agentId, inbound, log);
    return true;
  };

  return {
    start(): void {
      options.transcript.setChannelDelivery(deliver);
      options.transcript.setChannelActivity(activity);
      options.transcript.setChannelConfigChanged(() => { void reconcile(); });
      sink(`[simeon] channel=runtime agent=- event=start served=${isChannelsServed(env)} poll=${options.pollMs ?? CHANNEL_RECONCILE_POLL_MS}`);
      void reconcile();
      poll = clock.setInterval(() => { void reconcile(); }, options.pollMs ?? CHANNEL_RECONCILE_POLL_MS);
    },
    reconcile,
    /** The server asked now rather than at the next half minute (an app's Channels tab waiting for Connect Slack to finish), then the list made again. */
    async syncNow(): Promise<void> {
      if (synced != null) synced = { ...synced, at: 0 };
      lastSyncTry = 0;
      await reconcile();
    },
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
      return [...slots].map(([key, slot]) => { const [agentId, platform] = key.split("\u0000") as [string, string]; return { agentId, platform, status: slot.status, detail: slot.detail, listening: slot.mode }; });
    },
    deliver,
    receiveFromServer,
  };
}

export type ChannelRuntime = ReturnType<typeof createChannelRuntime>;

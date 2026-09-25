import type { ChannelOutboundMessage } from "../../../shared/channel-messaging.js";
import { DISCORD_PLATFORM } from "../../../shared/channels.js";
import { chunkText, createChannelHttp, readAttachmentFile, type ChannelHttp } from "./channel-http.js";
import { describeToken, errorSentence } from "./channel-log.js";
import { realConnectorClock, reconnectDelayMs, type ChannelConnector, type ConnectorCallbacks, type ConnectorClock } from "./connector.js";
import { createChannelSocket, socketText, SOCKET_OPEN, type ChannelSocket, type CreateChannelSocket } from "./socket.js";

/**
 * Discord over the Gateway (v10, JSON): HELLO → IDENTIFY (or RESUME),
 * heartbeats at the interval Discord names, MESSAGE_CREATE and
 * MESSAGE_REACTION_ADD become inbound envelopes, and delivery goes through
 * the REST API with the same bot token. Built 25 September 2026 against
 * the transcript manager's channel hooks (docs/product/channels-served.md).
 */
export const DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
export const DISCORD_API_BASE = "https://discord.com/api/v10";
export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_TYPING_INTERVAL_MS = 8_000;
// GUILDS | GUILD_MESSAGES | GUILD_MESSAGE_REACTIONS | DIRECT_MESSAGES | DIRECT_MESSAGE_REACTIONS | MESSAGE_CONTENT
export const DISCORD_INTENTS = (1 << 0) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 13) | (1 << 15);
/** Close codes after which Discord says not to reconnect; each has a sentence the status carries. */
export const DISCORD_FATAL_CLOSE_CODES: Readonly<Record<number, string>> = {
  4004: "Discord refused the bot token (authentication failed). Check the token in the Developer Portal and store it again.",
  4010: "Discord refused the shard (invalid shard).",
  4011: "Discord requires sharding for this bot; Simeon does not shard.",
  4012: "Discord refused the gateway version.",
  4013: "Discord refused the gateway intents (invalid intents).",
  4014: "Discord refused a privileged intent: turn on Message Content Intent under the bot's Privileged Gateway Intents in the Developer Portal, then reconnect.",
};

const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11 } as const;

export interface DiscordConnectorOptions {
  readonly agentId: string;
  readonly token: string;
  readonly callbacks: ConnectorCallbacks;
  readonly gatewayUrl?: string;
  readonly apiBase?: string;
  readonly createSocket?: CreateChannelSocket;
  readonly http?: ChannelHttp;
  readonly clock?: ConnectorClock;
  readonly random?: () => number;
}

interface DiscordAuthor { id?: string; username?: string; global_name?: string | null; bot?: boolean }

export function discordSenderName(author: DiscordAuthor | undefined, fallback: string): string {
  const name = author?.global_name ?? author?.username;
  return name != null && name.length > 0 ? name : fallback;
}

export function discordInboundText(message: { content?: string; attachments?: { url?: string; filename?: string }[] }): string {
  const lines = [message.content ?? ""];
  for (const attachment of message.attachments ?? []) if (attachment.url) lines.push(`[attachment${attachment.filename ? ` ${attachment.filename}` : ""}: ${attachment.url}]`);
  return lines.filter((line) => line.length > 0).join("\n");
}

export class DiscordConnector implements ChannelConnector {
  readonly platform = DISCORD_PLATFORM;
  private socket: ChannelSocket | null = null;
  private stopped = false;
  private abort = new AbortController();
  private attempt = 0;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private lastSeq: number | null = null;
  private selfId: string | null = null;
  private heartbeat: { dispose(): void } | null = null;
  private heartbeatAcked = true;
  private readonly typing = new Map<string, { dispose(): void }>();
  private readonly http: ChannelHttp;
  private readonly clock: ConnectorClock;
  private readonly createSocket: CreateChannelSocket;
  private connectLoop: Promise<void> | null = null;

  constructor(private readonly options: DiscordConnectorOptions) {
    this.http = options.http ?? createChannelHttp();
    this.clock = options.clock ?? realConnectorClock;
    this.createSocket = options.createSocket ?? createChannelSocket;
  }

  private get log() { return this.options.callbacks.log; }
  private get apiBase() { return (this.options.apiBase ?? DISCORD_API_BASE).replace(/\/$/, ""); }

  start(): void {
    if (this.connectLoop != null) return;
    this.options.callbacks.onStatus("connecting");
    this.connectLoop = this.runConnectLoop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.abort.abort();
    for (const timer of this.typing.values()) timer.dispose();
    this.typing.clear();
    this.closeSocket(1000, "stopping");
    await this.connectLoop?.catch(() => {});
  }

  private async runConnectLoop(): Promise<void> {
    while (!this.stopped) {
      const url = this.sessionId != null && this.resumeUrl != null ? this.resumeUrl : (this.options.gatewayUrl ?? DISCORD_GATEWAY_URL);
      this.log("connect", { url, token: describeToken(this.options.token), attempt: this.attempt, resume: this.sessionId != null });
      const closed = await this.connectOnce(url);
      if (this.stopped) break;
      const fatal = DISCORD_FATAL_CLOSE_CODES[closed.code];
      if (fatal != null) {
        this.log("error", { code: closed.code, detail: fatal });
        this.options.callbacks.onStatus("error", fatal);
        break;
      }
      this.log("disconnect", { code: closed.code, reason: closed.reason, attempt: this.attempt });
      this.options.callbacks.onStatus("connecting", `Reconnecting to Discord (${closed.reason || `close ${closed.code}`}).`);
      await this.clock.sleep(reconnectDelayMs(this.attempt, undefined, undefined, this.options.random), this.abort.signal);
      this.attempt += 1;
    }
  }

  private connectOnce(url: string): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (code: number, reason: string) => { if (settled) return; settled = true; this.stopHeartbeat(); this.socket = null; resolve({ code, reason }); };
      let socket: ChannelSocket;
      try { socket = this.createSocket(url); } catch (error) { settle(0, errorSentence(error)); return; }
      this.socket = socket;
      socket.on("open", () => { this.heartbeatAcked = true; });
      socket.on("message", (data) => {
        let payload: { op?: number; t?: string; s?: number | null; d?: unknown };
        try { payload = JSON.parse(socketText(data)) as typeof payload; } catch { return; }
        if (typeof payload.s === "number") this.lastSeq = payload.s;
        try { this.handlePayload(socket, payload); } catch (error) { this.log("error", { detail: errorSentence(error) }); }
      });
      socket.on("error", (error) => { this.log("error", { detail: errorSentence(error) }); });
      socket.on("close", (code, reason) => settle(code, socketText(reason)));
    });
  }

  private handlePayload(socket: ChannelSocket, payload: { op?: number; t?: string; d?: unknown }): void {
    switch (payload.op) {
      case OP.HELLO: {
        const interval = Number((payload.d as { heartbeat_interval?: unknown })?.heartbeat_interval);
        this.startHeartbeat(socket, Number.isFinite(interval) && interval > 0 ? interval : 41_250);
        if (this.sessionId != null) this.send(socket, { op: OP.RESUME, d: { token: this.options.token, session_id: this.sessionId, seq: this.lastSeq } });
        else this.send(socket, { op: OP.IDENTIFY, d: { token: this.options.token, intents: DISCORD_INTENTS, properties: { os: process.platform, browser: "simeon", device: "simeon" } } });
        return;
      }
      case OP.HEARTBEAT: this.send(socket, { op: OP.HEARTBEAT, d: this.lastSeq }); return;
      case OP.HEARTBEAT_ACK: this.heartbeatAcked = true; return;
      case OP.RECONNECT: this.log("disconnect", { reason: "Discord asked to reconnect" }); socket.close(4000, "reconnect requested"); return;
      case OP.INVALID_SESSION: {
        if (payload.d !== true) { this.sessionId = null; this.resumeUrl = null; this.lastSeq = null; }
        socket.close(4000, "invalid session");
        return;
      }
      case OP.DISPATCH: this.handleDispatch(payload.t ?? "", payload.d as Record<string, any>); return;
      default: return;
    }
  }

  private handleDispatch(event: string, data: Record<string, any>): void {
    if (event === "READY") {
      this.sessionId = typeof data.session_id === "string" ? data.session_id : null;
      this.resumeUrl = typeof data.resume_gateway_url === "string" ? `${data.resume_gateway_url}${data.resume_gateway_url.includes("?") ? "&" : "?"}v=10&encoding=json` : null;
      this.selfId = typeof data.user?.id === "string" ? data.user.id : null;
      this.attempt = 0;
      const name = discordSenderName(data.user, this.selfId ?? "bot");
      this.log("ready", { bot: name, botId: this.selfId, guilds: Array.isArray(data.guilds) ? data.guilds.length : null });
      this.options.callbacks.onStatus("connected", `Connected as ${name}.`);
      return;
    }
    if (event === "RESUMED") { this.attempt = 0; this.log("ready", { resumed: true }); this.options.callbacks.onStatus("connected"); return; }
    if (event === "MESSAGE_CREATE") {
      const author = data.author as DiscordAuthor | undefined;
      if (author?.bot === true || (this.selfId != null && author?.id === this.selfId)) return;
      const chat = typeof data.channel_id === "string" ? data.channel_id : null;
      if (chat == null) return;
      const text = discordInboundText(data);
      if (text.length === 0) return;
      const timestampMs = typeof data.timestamp === "string" ? Date.parse(data.timestamp) : NaN;
      const envelope = { address: { platform: DISCORD_PLATFORM, chat }, sender: discordSenderName(author, author?.id ?? "someone"), text, timestampMs: Number.isFinite(timestampMs) ? timestampMs : Date.now() };
      this.log("inbound", { chat, sender: envelope.sender, chars: text.length, guild: typeof data.guild_id === "string" ? data.guild_id : "dm" });
      this.options.callbacks.onInbound(envelope);
      return;
    }
    if (event === "MESSAGE_REACTION_ADD") {
      if (this.selfId == null || data.user_id === this.selfId) return;
      // Only a reaction to one of the bot's own messages wakes the agent (the brief's REACTIONS rule).
      if (typeof data.message_author_id !== "string" || data.message_author_id !== this.selfId) return;
      const chat = typeof data.channel_id === "string" ? data.channel_id : null;
      if (chat == null) return;
      const emoji = data.emoji?.name ?? "reaction";
      const sender = discordSenderName(data.member?.user, typeof data.user_id === "string" ? data.user_id : "someone");
      this.log("inbound", { chat, sender, reaction: emoji });
      this.options.callbacks.onInbound({ address: { platform: DISCORD_PLATFORM, chat }, sender, text: "", timestampMs: Date.now(), reaction: { emoji } });
    }
  }

  private send(socket: ChannelSocket, payload: unknown): void {
    if (socket.readyState !== SOCKET_OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  private startHeartbeat(socket: ChannelSocket, intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatAcked = true;
    this.heartbeat = this.clock.setInterval(() => {
      if (!this.heartbeatAcked) { this.log("disconnect", { reason: "heartbeat not acknowledged" }); socket.terminate(); return; }
      this.heartbeatAcked = false;
      this.send(socket, { op: OP.HEARTBEAT, d: this.lastSeq });
    }, intervalMs);
  }

  private stopHeartbeat(): void { this.heartbeat?.dispose(); this.heartbeat = null; }

  private closeSocket(code: number, reason: string): void {
    const socket = this.socket;
    if (socket == null) return;
    try { socket.close(code, reason); } catch {}
  }

  private authHeaders(): Record<string, string> { return { authorization: `Bot ${this.options.token}` }; }

  async deliver(chat: string, message: ChannelOutboundMessage): Promise<void> {
    const url = `${this.apiBase}/channels/${encodeURIComponent(chat)}/messages`;
    if (message.kind === "text") {
      for (const chunk of chunkText(message.text, DISCORD_MESSAGE_LIMIT)) {
        await this.http.json(url, { method: "POST", headers: { ...this.authHeaders(), "content-type": "application/json" }, body: JSON.stringify({ content: chunk }) });
      }
      this.log("delivery", { chat, kind: "text", chars: message.text.length });
      return;
    }
    const file = await readAttachmentFile(message.url);
    if (file == null) {
      const content = [message.caption, message.url].filter((part): part is string => part != null && part.length > 0).join("\n");
      await this.http.json(url, { method: "POST", headers: { ...this.authHeaders(), "content-type": "application/json" }, body: JSON.stringify({ content }) });
      this.log("delivery", { chat, kind: "link", url: message.url });
      return;
    }
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content: message.caption ?? "", attachments: [{ id: 0, filename: file.name }] }));
    form.append("files[0]", new Blob([file.bytes]), file.name);
    await this.http.json(url, { method: "POST", headers: this.authHeaders(), body: form });
    this.log("delivery", { chat, kind: "file", name: file.name, bytes: file.bytes.byteLength });
  }

  setActivity(chat: string, isActive: boolean): void {
    const current = this.typing.get(chat);
    if (!isActive) { current?.dispose(); this.typing.delete(chat); return; }
    if (current != null) return;
    const tick = () => { void this.http.raw(`${this.apiBase}/channels/${encodeURIComponent(chat)}/typing`, { method: "POST", headers: this.authHeaders() }).catch(() => {}); };
    tick();
    this.typing.set(chat, this.clock.setInterval(tick, DISCORD_TYPING_INTERVAL_MS));
  }
}

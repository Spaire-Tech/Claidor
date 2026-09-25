import type { ChannelOutboundMessage } from "../../../shared/channel-messaging.js";
import { SLACK_PLATFORM } from "../../../shared/channels.js";
import { chunkText, createChannelHttp, readAttachmentFile, type ChannelHttp } from "./channel-http.js";
import { describeToken, errorSentence } from "./channel-log.js";
import { realConnectorClock, reconnectDelayMs, type ChannelConnector, type ConnectorCallbacks, type ConnectorClock } from "./connector.js";
import { createChannelSocket, socketText, SOCKET_OPEN, type ChannelSocket, type CreateChannelSocket } from "./socket.js";

/**
 * Slack over Socket Mode: `apps.connections.open` with the app-level token
 * (xapp-…) names a WebSocket, every `events_api` envelope is acknowledged
 * by its envelope_id, `message` and `reaction_added` become inbound
 * envelopes, and delivery goes through the Web API with the bot token
 * (xoxb-…). Built 25 September 2026 against the transcript manager's
 * channel hooks (docs/product/channels-served.md).
 */
export const SLACK_API_BASE = "https://slack.com/api";
export const SLACK_MESSAGE_LIMIT = 4000;
export const SLACK_INBOUND_DEDUPE_SIZE = 200;
/** Slack's own reasons for `ok: false` on the two calls that open a connection, in a person's words. */
export const SLACK_AUTH_ERRORS: Readonly<Record<string, string>> = {
  invalid_auth: "Slack refused the token (invalid_auth). Check it in the app's settings and store it again.",
  not_authed: "Slack saw no token (not_authed).",
  account_inactive: "Slack says the token's account is inactive (account_inactive).",
  token_revoked: "Slack says the token was revoked (token_revoked); reinstall the app and store the new tokens.",
  missing_scope: "The app token lacks connections:write (missing_scope); add the scope under Socket Mode and store the token again.",
};
const SKIPPED_MESSAGE_SUBTYPES = new Set(["message_changed", "message_deleted", "channel_join", "channel_leave", "bot_message", "message_replied", "thread_broadcast", "channel_topic", "channel_purpose", "channel_name", "group_join", "group_leave"]);

export interface SlackConnectorOptions {
  readonly agentId: string;
  readonly appToken: string;
  readonly botToken: string;
  readonly callbacks: ConnectorCallbacks;
  readonly apiBase?: string;
  readonly createSocket?: CreateChannelSocket;
  readonly http?: ChannelHttp;
  readonly clock?: ConnectorClock;
  readonly random?: () => number;
}

export function unescapeSlackText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function slackInboundText(event: { text?: string; files?: { name?: string; url_private?: string; permalink?: string }[] }): string {
  const lines = [unescapeSlackText(event.text ?? "")];
  for (const file of event.files ?? []) { const url = file.permalink ?? file.url_private; if (url) lines.push(`[attachment${file.name ? ` ${file.name}` : ""}: ${url}]`); }
  return lines.filter((line) => line.length > 0).join("\n");
}

export function isInboundSlackMessage(event: { type?: string; subtype?: string; bot_id?: string; user?: string }, selfUserId: string | null): boolean {
  if (event.type !== "message" || event.bot_id != null) return false;
  if (event.subtype != null && event.subtype !== "file_share") return false;
  if (SKIPPED_MESSAGE_SUBTYPES.has(event.subtype ?? "")) return false;
  return !(selfUserId != null && event.user === selfUserId);
}

export class SlackConnector implements ChannelConnector {
  readonly platform = SLACK_PLATFORM;
  private socket: ChannelSocket | null = null;
  private stopped = false;
  private abort = new AbortController();
  private attempt = 0;
  private selfUserId: string | null = null;
  private readonly http: ChannelHttp;
  private readonly clock: ConnectorClock;
  private readonly createSocket: CreateChannelSocket;
  private readonly names = new Map<string, string>();
  private readonly threads = new Map<string, string>();
  private readonly seenEventIds: string[] = [];
  private connectLoop: Promise<void> | null = null;

  constructor(private readonly options: SlackConnectorOptions) {
    this.http = options.http ?? createChannelHttp();
    this.clock = options.clock ?? realConnectorClock;
    this.createSocket = options.createSocket ?? createChannelSocket;
  }

  private get log() { return this.options.callbacks.log; }
  private get apiBase() { return (this.options.apiBase ?? SLACK_API_BASE).replace(/\/$/, ""); }

  start(): void {
    if (this.connectLoop != null) return;
    this.options.callbacks.onStatus("connecting");
    this.connectLoop = this.runConnectLoop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.abort.abort();
    const socket = this.socket;
    if (socket != null) { try { socket.close(1000, "stopping"); } catch {} }
    await this.connectLoop?.catch(() => {});
  }

  private async api<T extends { ok?: boolean; error?: string }>(method: string, token: string, body: Record<string, unknown> | null, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.apiBase}/${method}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const reply = await this.http.json<T>(url.toString(), body == null
      ? { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" } }
      : { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
    if (reply.ok !== true) throw new Error(`Slack ${method}: ${reply.error ?? "not ok"}`);
    return reply;
  }

  private async runConnectLoop(): Promise<void> {
    while (!this.stopped) {
      this.log("connect", { appToken: describeToken(this.options.appToken), botToken: describeToken(this.options.botToken), attempt: this.attempt });
      let url: string;
      try {
        if (this.selfUserId == null) {
          const me = await this.api<{ ok: boolean; user_id?: string; user?: string; team?: string }>("auth.test", this.options.botToken, null);
          this.selfUserId = me.user_id ?? null;
          this.log("ready", { bot: me.user ?? null, botId: this.selfUserId, team: me.team ?? null });
        }
        const opened = await this.api<{ ok: boolean; url?: string }>("apps.connections.open", this.options.appToken, null);
        if (typeof opened.url !== "string" || opened.url.length === 0) throw new Error("Slack apps.connections.open: no url");
        url = opened.url;
      } catch (error) {
        const code = errorSentence(error).match(/Slack [a-z.]+: ([a-z_]+)/)?.[1];
        const fatal = code == null ? null : SLACK_AUTH_ERRORS[code];
        if (fatal != null) { this.log("error", { detail: fatal }); this.options.callbacks.onStatus("error", fatal); break; }
        this.log("error", { detail: errorSentence(error), attempt: this.attempt });
        this.options.callbacks.onStatus("connecting", `Reconnecting to Slack (${errorSentence(error)}).`);
        await this.clock.sleep(reconnectDelayMs(this.attempt, undefined, undefined, this.options.random), this.abort.signal);
        this.attempt += 1;
        continue;
      }
      const closed = await this.connectOnce(url);
      if (this.stopped) break;
      this.log("disconnect", { code: closed.code, reason: closed.reason, attempt: this.attempt });
      this.options.callbacks.onStatus("connecting", `Reconnecting to Slack (${closed.reason || `close ${closed.code}`}).`);
      if (closed.reason !== "refresh_requested") { await this.clock.sleep(reconnectDelayMs(this.attempt, undefined, undefined, this.options.random), this.abort.signal); this.attempt += 1; }
    }
  }

  private connectOnce(url: string): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      let settled = false;
      let closeReason = "";
      const settle = (code: number, reason: string) => { if (settled) return; settled = true; this.socket = null; resolve({ code, reason: closeReason || reason }); };
      let socket: ChannelSocket;
      try { socket = this.createSocket(url); } catch (error) { settle(0, errorSentence(error)); return; }
      this.socket = socket;
      socket.on("message", (data) => {
        let payload: Record<string, any>;
        try { payload = JSON.parse(socketText(data)) as Record<string, any>; } catch { return; }
        try {
          if (typeof payload.envelope_id === "string" && socket.readyState === SOCKET_OPEN) socket.send(JSON.stringify({ envelope_id: payload.envelope_id }));
          if (payload.type === "hello") { this.attempt = 0; this.log("ready", { connections: payload.num_connections ?? null }); this.options.callbacks.onStatus("connected", "Connected over Socket Mode."); return; }
          if (payload.type === "disconnect") { closeReason = typeof payload.reason === "string" ? payload.reason : "disconnect"; socket.close(1000, closeReason); return; }
          if (payload.type === "events_api") this.handleEvent(payload.payload?.event ?? {}, typeof payload.payload?.event_id === "string" ? payload.payload.event_id : null);
        } catch (error) { this.log("error", { detail: errorSentence(error) }); }
      });
      socket.on("error", (error) => { this.log("error", { detail: errorSentence(error) }); });
      socket.on("close", (code, reason) => settle(code, socketText(reason)));
    });
  }

  private isDuplicate(eventId: string | null): boolean {
    if (eventId == null) return false;
    if (this.seenEventIds.includes(eventId)) return true;
    this.seenEventIds.push(eventId);
    if (this.seenEventIds.length > SLACK_INBOUND_DEDUPE_SIZE) this.seenEventIds.shift();
    return false;
  }

  private handleEvent(event: Record<string, any>, eventId: string | null): void {
    if (this.isDuplicate(eventId)) return;
    if (event.type === "message") {
      if (!isInboundSlackMessage(event, this.selfUserId)) return;
      const chat = typeof event.channel === "string" ? event.channel : null;
      if (chat == null) return;
      const text = slackInboundText(event);
      if (text.length === 0) return;
      if (typeof event.thread_ts === "string") this.threads.set(chat, event.thread_ts); else this.threads.delete(chat);
      const ts = Number.parseFloat(typeof event.ts === "string" ? event.ts : "");
      const userId = typeof event.user === "string" ? event.user : "someone";
      void this.senderName(userId).then((sender) => {
        this.log("inbound", { chat, sender, chars: text.length, thread: typeof event.thread_ts === "string" });
        this.options.callbacks.onInbound({ address: { platform: SLACK_PLATFORM, chat }, sender, text, timestampMs: Number.isFinite(ts) ? Math.round(ts * 1000) : Date.now() });
      });
      return;
    }
    if (event.type === "reaction_added") {
      if (this.selfUserId == null || event.user === this.selfUserId || event.item_user !== this.selfUserId) return;
      const chat = typeof event.item?.channel === "string" ? event.item.channel : null;
      if (chat == null) return;
      const emoji = typeof event.reaction === "string" ? `:${event.reaction}:` : "reaction";
      const userId = typeof event.user === "string" ? event.user : "someone";
      void this.senderName(userId).then((sender) => {
        this.log("inbound", { chat, sender, reaction: emoji });
        this.options.callbacks.onInbound({ address: { platform: SLACK_PLATFORM, chat }, sender, text: "", timestampMs: Date.now(), reaction: { emoji } });
      });
    }
  }

  /** users.info once per user, cached; the id itself when the bot lacks users:read. */
  private async senderName(userId: string): Promise<string> {
    const cached = this.names.get(userId);
    if (cached != null) return cached;
    let name = userId;
    try {
      const reply = await this.api<{ ok: boolean; user?: { name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } } }>("users.info", this.options.botToken, null, { user: userId });
      const candidate = reply.user?.profile?.display_name || reply.user?.real_name || reply.user?.profile?.real_name || reply.user?.name;
      if (candidate) name = candidate;
    } catch {}
    this.names.set(userId, name);
    return name;
  }

  async deliver(chat: string, message: ChannelOutboundMessage): Promise<void> {
    const thread = this.threads.get(chat);
    const post = (text: string) => this.api("chat.postMessage", this.options.botToken, { channel: chat, text, ...(thread == null ? {} : { thread_ts: thread }) });
    if (message.kind === "text") {
      for (const chunk of chunkText(message.text, SLACK_MESSAGE_LIMIT)) await post(chunk);
      this.log("delivery", { chat, kind: "text", chars: message.text.length, thread: thread != null });
      return;
    }
    const file = await readAttachmentFile(message.url);
    if (file == null) {
      await post([message.caption, message.url].filter((part): part is string => part != null && part.length > 0).join("\n"));
      this.log("delivery", { chat, kind: "link", url: message.url });
      return;
    }
    const ticket = await this.api<{ ok: boolean; upload_url?: string; file_id?: string }>("files.getUploadURLExternal", this.options.botToken, null, { filename: file.name, length: String(file.bytes.byteLength) });
    if (typeof ticket.upload_url !== "string" || typeof ticket.file_id !== "string") throw new Error("Slack files.getUploadURLExternal: no upload url");
    const uploaded = await this.http.raw(ticket.upload_url, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file.bytes });
    if (uploaded.status < 200 || uploaded.status >= 300) throw new Error(`Slack upload: HTTP ${uploaded.status}`);
    await this.api("files.completeUploadExternal", this.options.botToken, { files: [{ id: ticket.file_id, title: file.name }], channel_id: chat, ...(message.caption == null ? {} : { initial_comment: message.caption }), ...(thread == null ? {} : { thread_ts: thread }) });
    this.log("delivery", { chat, kind: "file", name: file.name, bytes: file.bytes.byteLength });
  }

  /** Socket Mode carries no typing indicator for a bot; nothing to send. */
  setActivity(): void {}
}

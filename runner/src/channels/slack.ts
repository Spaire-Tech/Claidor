import {
  describeToken,
  realClock,
  reasonText,
  reconnectDelayMs,
  type JsonCall,
  type ListenerCallbacks,
  type Listener,
  type ListenerClock,
  type ListenerSocket,
  type OpenSocket,
  type StatusDetail,
} from './listener.js';

/**
 * A Slack bot heard over Socket Mode, as the computer's own connector hears
 * it (`desktop/source/host/extensions/channels/slack-connector.ts`):
 * `apps.connections.open` with the app-level token (xapp-…) names a
 * WebSocket, every envelope is acknowledged by its id, and `message` and
 * `reaction_added` become what the bot heard. The bot token (xoxb-…) only
 * says who the bot is (`auth.test`) and who wrote (`users.info`): the
 * computer sends the replies.
 */
export const SLACK_API_BASE = 'https://slack.com/api';
export const SLACK_INBOUND_DEDUPE_SIZE = 200;
/** Slack's own reasons for `ok: false` that no retry mends, with the computer's sentence for each. */
export const SLACK_AUTH_ERRORS: Readonly<Record<string, string>> = {
  invalid_auth: 'channel.slackInvalidAuth',
  not_authed: 'channel.slackNotAuthed',
  account_inactive: 'channel.slackAccountInactive',
  token_revoked: 'channel.slackTokenRevoked',
  missing_scope: 'channel.slackMissingScope',
};
const SKIPPED_MESSAGE_SUBTYPES = new Set([
  'message_changed', 'message_deleted', 'channel_join', 'channel_leave', 'bot_message', 'message_replied',
  'thread_broadcast', 'channel_topic', 'channel_purpose', 'channel_name', 'group_join', 'group_leave',
]);

export const unescapeSlackText = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const slackInboundText = (event: { text?: string; files?: { name?: string; url_private?: string; permalink?: string }[] }): string => {
  const lines = [unescapeSlackText(event.text ?? '')];
  for (const file of event.files ?? []) {
    const url = file.permalink ?? file.url_private;
    if (url) lines.push(`[attachment${file.name ? ` ${file.name}` : ''}: ${url}]`);
  }
  return lines.filter((line) => line.length > 0).join('\n');
};

export const isInboundSlackMessage = (event: { type?: string; subtype?: string; bot_id?: string; user?: string }, selfUserId: string | null): boolean => {
  if (event.type !== 'message' || event.bot_id != null) return false;
  if (event.subtype != null && event.subtype !== 'file_share') return false;
  if (SKIPPED_MESSAGE_SUBTYPES.has(event.subtype ?? '')) return false;
  return !(selfUserId != null && event.user === selfUserId);
};

/** A message's id and a reaction's, the same ones the computer's connector gives them. */
export const slackMessageId = (chat: string, ts: string): string => `${chat}:${ts}`;
export const slackReactionId = (chat: string, ts: string, userId: string, reaction: string): string => `react:${chat}:${ts}:${userId}:${reaction}`;

export interface SlackListenerOptions {
  appToken: string;
  botToken: string;
  callbacks: ListenerCallbacks;
  open: OpenSocket;
  call: JsonCall;
  apiBase?: string;
  clock?: ListenerClock;
  random?: () => number;
}

export class SlackListener implements Listener {
  private socket: ListenerSocket | null = null;
  private stopped = false;
  private readonly abort = new AbortController();
  private attempt = 0;
  private selfUserId: string | null = null;
  private readonly names = new Map<string, string>();
  private readonly seen: string[] = [];
  private loop: Promise<void> | null = null;
  private readonly clock: ListenerClock;

  constructor(private readonly options: SlackListenerOptions) {
    this.clock = options.clock ?? realClock;
  }

  private status(status: 'connecting' | 'connected' | 'error', detail?: StatusDetail | null): void {
    this.options.callbacks.onStatus(status, detail ?? null);
  }

  start(): void {
    if (this.loop != null) return;
    this.status('connecting');
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.abort.abort();
    this.socket?.close(1000, 'stopping');
    await this.loop?.catch(() => {});
  }

  private async api<T extends { ok?: boolean; error?: string }>(method: string, token: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${(this.options.apiBase ?? SLACK_API_BASE).replace(/\/$/, '')}/${method}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const reply = await this.options.call<T>(url.toString(), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (reply.ok !== true) throw new Error(`Slack ${method}: ${reply.error ?? 'not ok'}`);
    return reply;
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      this.options.callbacks.log(`slack connect appToken=${describeToken(this.options.appToken)} botToken=${describeToken(this.options.botToken)} attempt=${this.attempt}`);
      let url: string;
      try {
        if (this.selfUserId == null) {
          const me = await this.api<{ ok: boolean; user_id?: string }>('auth.test', this.options.botToken);
          this.selfUserId = me.user_id ?? null;
        }
        const opened = await this.api<{ ok: boolean; url?: string }>('apps.connections.open', this.options.appToken);
        if (typeof opened.url !== 'string' || opened.url.length === 0) throw new Error('Slack apps.connections.open: no url');
        url = opened.url;
      } catch (error) {
        const code = reasonText(error).match(/Slack [a-z.]+: ([a-z_]+)/)?.[1];
        const fatal = code == null ? undefined : SLACK_AUTH_ERRORS[code];
        if (fatal != null) {
          this.options.callbacks.log(`slack refused for good: ${code}`);
          this.status('error', { key: fatal });
          break;
        }
        this.options.callbacks.log(`slack error ${reasonText(error)} attempt=${this.attempt}`);
        this.status('connecting', { key: 'channel.reconnectingSlack', args: { why: reasonText(error) } });
        await this.clock.sleep(reconnectDelayMs(this.attempt, this.options.random), this.abort.signal);
        this.attempt += 1;
        continue;
      }
      const closed = await this.connectOnce(url);
      if (this.stopped) break;
      this.options.callbacks.log(`slack disconnect code=${closed.code} reason=${closed.reason} attempt=${this.attempt}`);
      this.status('connecting', { key: 'channel.reconnectingSlack', args: { why: closed.reason || `close ${closed.code}` } });
      if (closed.reason !== 'refresh_requested') {
        await this.clock.sleep(reconnectDelayMs(this.attempt, this.options.random), this.abort.signal);
        this.attempt += 1;
      }
    }
  }

  private connectOnce(url: string): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      let settled = false;
      let closeReason = '';
      const settle = (code: number, reason: string): void => {
        if (settled) return;
        settled = true;
        this.socket = null;
        resolve({ code, reason: closeReason || reason });
      };
      try {
        this.socket = this.options.open(url, {
          onOpen: () => {},
          onMessage: (text) => {
            let payload: Record<string, any>;
            try {
              payload = JSON.parse(text) as Record<string, any>;
            } catch {
              return;
            }
            try {
              if (typeof payload.envelope_id === 'string' && this.socket?.isOpen) this.socket.send(JSON.stringify({ envelope_id: payload.envelope_id }));
              if (payload.type === 'hello') {
                this.attempt = 0;
                this.status('connected', { key: 'channel.connectedSocketMode' });
                return;
              }
              if (payload.type === 'disconnect') {
                closeReason = typeof payload.reason === 'string' ? payload.reason : 'disconnect';
                this.socket?.close(1000, closeReason);
                return;
              }
              if (payload.type === 'events_api') this.handle(payload.payload?.event ?? {}, typeof payload.payload?.event_id === 'string' ? payload.payload.event_id : null);
            } catch (error) {
              this.options.callbacks.log(`slack error ${reasonText(error)}`);
            }
          },
          onClose: (code, reason) => settle(code, reason),
          onError: () => this.options.callbacks.log('slack socket error'),
        });
      } catch (error) {
        settle(0, reasonText(error));
      }
    });
  }

  private isDuplicate(eventId: string | null): boolean {
    if (eventId == null) return false;
    if (this.seen.includes(eventId)) return true;
    this.seen.push(eventId);
    if (this.seen.length > SLACK_INBOUND_DEDUPE_SIZE) this.seen.shift();
    return false;
  }

  private handle(event: Record<string, any>, eventId: string | null): void {
    if (this.isDuplicate(eventId)) return;
    if (event.type === 'message') {
      if (!isInboundSlackMessage(event, this.selfUserId)) return;
      const chat = typeof event.channel === 'string' ? event.channel : null;
      const ts = typeof event.ts === 'string' ? event.ts : null;
      if (chat == null || ts == null) return;
      const text = slackInboundText(event);
      if (text.length === 0) return;
      const thread = typeof event.thread_ts === 'string' ? event.thread_ts : undefined;
      const at = Number.parseFloat(ts);
      const userId = typeof event.user === 'string' ? event.user : 'someone';
      void this.senderName(userId).then((sender) => {
        this.options.callbacks.onHeard({
          messageId: slackMessageId(chat, ts),
          envelope: { address: { platform: 'slack', chat }, sender, text, timestampMs: Number.isFinite(at) ? Math.round(at * 1000) : Date.now(), ...(thread == null ? {} : { thread }) },
        });
      });
      return;
    }
    if (event.type === 'reaction_added') {
      if (this.selfUserId == null || event.user === this.selfUserId || event.item_user !== this.selfUserId) return;
      const chat = typeof event.item?.channel === 'string' ? event.item.channel : null;
      const ts = typeof event.item?.ts === 'string' ? event.item.ts : null;
      if (chat == null || ts == null) return;
      const reaction = typeof event.reaction === 'string' ? event.reaction : 'reaction';
      const userId = typeof event.user === 'string' ? event.user : 'someone';
      void this.senderName(userId).then((sender) => {
        this.options.callbacks.onHeard({
          messageId: slackReactionId(chat, ts, userId, reaction),
          envelope: { address: { platform: 'slack', chat }, sender, text: '', timestampMs: Date.now(), reaction: { emoji: `:${reaction}:` } },
        });
      });
    }
  }

  /** users.info once per person, kept; the id itself when the bot may not read people. */
  private async senderName(userId: string): Promise<string> {
    const kept = this.names.get(userId);
    if (kept != null) return kept;
    let name = userId;
    try {
      const reply = await this.api<{ ok: boolean; user?: { name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } } }>('users.info', this.options.botToken, { user: userId });
      const candidate = reply.user?.profile?.display_name || reply.user?.real_name || reply.user?.profile?.real_name || reply.user?.name;
      if (candidate) name = candidate;
    } catch {
      // The id stands for the name.
    }
    this.names.set(userId, name);
    return name;
  }
}

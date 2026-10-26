import {
  describeToken,
  realClock,
  reasonText,
  reconnectDelayMs,
  type ListenerCallbacks,
  type Listener,
  type ListenerClock,
  type ListenerSocket,
  type OpenSocket,
  type StatusDetail,
} from './listener.js';

/**
 * A Discord bot heard over the Gateway (v10, JSON), as the computer's own
 * connector hears it (`desktop/source/host/extensions/channels/discord-connector.ts`):
 * HELLO → IDENTIFY (or RESUME), heartbeats at the interval Discord names,
 * MESSAGE_CREATE and MESSAGE_REACTION_ADD become what the bot heard. It
 * sends nothing but those: the computer replies over the REST API.
 */
export const DISCORD_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
// GUILDS | GUILD_MESSAGES | GUILD_MESSAGE_REACTIONS | DIRECT_MESSAGES | DIRECT_MESSAGE_REACTIONS | MESSAGE_CONTENT
export const DISCORD_INTENTS = (1 << 0) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 13) | (1 << 15);
/** Close codes after which Discord says not to reconnect, with the computer's sentence for each. */
export const DISCORD_FATAL_CLOSE_CODES: Readonly<Record<number, string>> = {
  4004: 'channel.discordBadToken',
  4010: 'channel.discordInvalidShard',
  4011: 'channel.discordShardingRequired',
  4012: 'channel.discordGatewayVersion',
  4013: 'channel.discordInvalidIntents',
  4014: 'channel.discordPrivilegedIntent',
};

const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11 } as const;

interface DiscordAuthor {
  id?: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
}

export const discordSenderName = (author: DiscordAuthor | undefined, fallback: string): string => {
  const name = author?.global_name ?? author?.username;
  return name != null && name.length > 0 ? name : fallback;
};

export const discordInboundText = (message: { content?: string; attachments?: { url?: string; filename?: string }[] }): string => {
  const lines = [message.content ?? ''];
  for (const attachment of message.attachments ?? []) if (attachment.url) lines.push(`[attachment${attachment.filename ? ` ${attachment.filename}` : ''}: ${attachment.url}]`);
  return lines.filter((line) => line.length > 0).join('\n');
};

/** A reaction's id, the same one the computer's connector gives it. */
export const discordReactionId = (messageId: string, userId: string, emoji: string): string => `react:${messageId}:${userId}:${emoji}`;

export interface DiscordListenerOptions {
  token: string;
  callbacks: ListenerCallbacks;
  open: OpenSocket;
  gatewayUrl?: string;
  clock?: ListenerClock;
  random?: () => number;
}

export class DiscordListener implements Listener {
  private socket: ListenerSocket | null = null;
  private stopped = false;
  private readonly abort = new AbortController();
  private attempt = 0;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private lastSeq: number | null = null;
  private selfId: string | null = null;
  private heartbeat: { dispose(): void } | null = null;
  private heartbeatAcked = true;
  private loop: Promise<void> | null = null;
  private readonly clock: ListenerClock;

  constructor(private readonly options: DiscordListenerOptions) {
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

  private async run(): Promise<void> {
    while (!this.stopped) {
      const url = this.sessionId != null && this.resumeUrl != null ? this.resumeUrl : (this.options.gatewayUrl ?? DISCORD_GATEWAY_URL);
      this.options.callbacks.log(`discord connect token=${describeToken(this.options.token)} attempt=${this.attempt} resume=${this.sessionId != null}`);
      const closed = await this.connectOnce(url);
      if (this.stopped) break;
      const fatal = DISCORD_FATAL_CLOSE_CODES[closed.code];
      if (fatal != null) {
        this.options.callbacks.log(`discord closed for good code=${closed.code}`);
        this.status('error', { key: fatal });
        break;
      }
      this.options.callbacks.log(`discord disconnect code=${closed.code} attempt=${this.attempt}`);
      this.status('connecting', { key: 'channel.reconnectingDiscord', args: { why: closed.reason || `close ${closed.code}` } });
      await this.clock.sleep(reconnectDelayMs(this.attempt, this.options.random), this.abort.signal);
      this.attempt += 1;
    }
  }

  private connectOnce(url: string): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (code: number, reason: string): void => {
        if (settled) return;
        settled = true;
        this.stopHeartbeat();
        this.socket = null;
        resolve({ code, reason });
      };
      try {
        const socket = this.options.open(url, {
          onOpen: () => {
            this.heartbeatAcked = true;
          },
          onMessage: (text) => {
            let payload: { op?: number; t?: string; s?: number | null; d?: unknown };
            try {
              payload = JSON.parse(text) as typeof payload;
            } catch {
              return;
            }
            if (typeof payload.s === 'number') this.lastSeq = payload.s;
            try {
              this.handle(payload);
            } catch (error) {
              this.options.callbacks.log(`discord error ${reasonText(error)}`);
            }
          },
          onClose: (code, reason) => settle(code, reason),
          onError: () => this.options.callbacks.log('discord socket error'),
        });
        this.socket = socket;
      } catch (error) {
        settle(0, reasonText(error));
      }
    });
  }

  private send(payload: unknown): void {
    if (this.socket?.isOpen) this.socket.send(JSON.stringify(payload));
  }

  private handle(payload: { op?: number; t?: string; d?: unknown }): void {
    switch (payload.op) {
      case OP.HELLO: {
        const interval = Number((payload.d as { heartbeat_interval?: unknown } | undefined)?.heartbeat_interval);
        this.startHeartbeat(Number.isFinite(interval) && interval > 0 ? interval : 41_250);
        if (this.sessionId != null) this.send({ op: OP.RESUME, d: { token: this.options.token, session_id: this.sessionId, seq: this.lastSeq } });
        else this.send({ op: OP.IDENTIFY, d: { token: this.options.token, intents: DISCORD_INTENTS, properties: { os: 'linux', browser: 'simeon', device: 'simeon' } } });
        return;
      }
      case OP.HEARTBEAT:
        this.send({ op: OP.HEARTBEAT, d: this.lastSeq });
        return;
      case OP.HEARTBEAT_ACK:
        this.heartbeatAcked = true;
        return;
      case OP.RECONNECT:
        this.socket?.close(4000, 'reconnect requested');
        return;
      case OP.INVALID_SESSION:
        if (payload.d !== true) {
          this.sessionId = null;
          this.resumeUrl = null;
          this.lastSeq = null;
        }
        this.socket?.close(4000, 'invalid session');
        return;
      case OP.DISPATCH:
        this.dispatch(payload.t ?? '', (payload.d ?? {}) as Record<string, any>);
        return;
      default:
        return;
    }
  }

  private dispatch(event: string, data: Record<string, any>): void {
    if (event === 'READY') {
      this.sessionId = typeof data.session_id === 'string' ? data.session_id : null;
      this.resumeUrl =
        typeof data.resume_gateway_url === 'string' ? `${data.resume_gateway_url}${data.resume_gateway_url.includes('?') ? '&' : '?'}v=10&encoding=json` : null;
      this.selfId = typeof data.user?.id === 'string' ? data.user.id : null;
      this.attempt = 0;
      const name = discordSenderName(data.user, this.selfId ?? 'bot');
      this.options.callbacks.log(`discord ready guilds=${Array.isArray(data.guilds) ? data.guilds.length : '-'}`);
      this.status('connected', { key: 'channel.connectedAs', args: { name } });
      return;
    }
    if (event === 'RESUMED') {
      this.attempt = 0;
      this.status('connected');
      return;
    }
    if (event === 'MESSAGE_CREATE') {
      const author = data.author as DiscordAuthor | undefined;
      if (author?.bot === true || (this.selfId != null && author?.id === this.selfId)) return;
      const chat = typeof data.channel_id === 'string' ? data.channel_id : null;
      const id = typeof data.id === 'string' ? data.id : null;
      if (chat == null || id == null) return;
      const text = discordInboundText(data);
      if (text.length === 0) return;
      const timestampMs = typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : Number.NaN;
      this.options.callbacks.onHeard({
        messageId: id,
        envelope: { address: { platform: 'discord', chat }, sender: discordSenderName(author, author?.id ?? 'someone'), text, timestampMs: Number.isFinite(timestampMs) ? timestampMs : Date.now() },
      });
      return;
    }
    if (event === 'MESSAGE_REACTION_ADD') {
      if (this.selfId == null || data.user_id === this.selfId) return;
      // Only a reaction to one of the bot's own messages wakes the agent (the brief's REACTIONS rule).
      if (typeof data.message_author_id !== 'string' || data.message_author_id !== this.selfId) return;
      const chat = typeof data.channel_id === 'string' ? data.channel_id : null;
      if (chat == null || typeof data.message_id !== 'string') return;
      const emoji = typeof data.emoji?.name === 'string' ? data.emoji.name : 'reaction';
      const userId = typeof data.user_id === 'string' ? data.user_id : 'someone';
      this.options.callbacks.onHeard({
        messageId: discordReactionId(data.message_id, userId, emoji),
        envelope: { address: { platform: 'discord', chat }, sender: discordSenderName(data.member?.user, userId), text: '', timestampMs: Date.now(), reaction: { emoji } },
      });
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatAcked = true;
    this.heartbeat = this.clock.every(intervalMs, () => {
      if (!this.heartbeatAcked) {
        this.socket?.close(4000, 'heartbeat not acknowledged');
        return;
      }
      this.heartbeatAcked = false;
      this.send({ op: OP.HEARTBEAT, d: this.lastSeq });
    });
  }

  private stopHeartbeat(): void {
    this.heartbeat?.dispose();
    this.heartbeat = null;
  }
}

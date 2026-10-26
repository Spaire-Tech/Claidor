import { request } from '../api.js';
import { DiscordListener } from './discord.js';
import {
  jsonCall,
  openSocket,
  reasonText,
  realClock,
  type ChannelStatus,
  type Heard,
  type JsonCall,
  type Listener,
  type ListenerCallbacks,
  type ListenerClock,
  type OpenSocket,
  type StatusDetail,
} from './listener.js';
import { SlackListener } from './slack.js';

/**
 * The agents' own bots this runner listens to (26 October 2026, the
 * computer as a worker; `server/simeon/desktop/channel_bots.py`).
 *
 * Every `pollMs` it asks the API which bots to hold, telling it the ones it
 * holds and their fingerprints, so tokens come over the wire only for a bot
 * it does not hold as it is now. A bot no longer in the answer is let go; a
 * bot whose fingerprint changed is held again with its new tokens. What a
 * bot hears is reported at once, and each bot's state when it changes and
 * every `heartbeatMs` anyway: the computer trusts a state no older than
 * three minutes, and listens itself to a bot whose state is older.
 */
export const CHANNELS_POLL_MS = 15_000;
export const CHANNELS_HEARTBEAT_MS = 60_000;
/** What a bot heard waits here at most this many while the API can't be reached. */
export const HEARD_KEPT = 500;

export interface BotWire {
  id: string;
  platform: string;
  fingerprint: string;
  secrets?: Record<string, string>;
}

export interface StatusWire {
  id: string;
  status: ChannelStatus;
  detail: StatusDetail | null;
}

export interface HeardWire extends Heard {
  id: string;
}

export interface ChannelsApi {
  bots(have: { id: string; fingerprint: string }[]): Promise<BotWire[]>;
  report(body: { statuses: StatusWire[]; inbound: HeardWire[] }): Promise<void>;
}

export const createChannelsApi = (baseUrl: string, token: string): ChannelsApi => ({
  async bots(have) {
    const answer = (await request(baseUrl, { method: 'POST', path: '/maty/runner/channels', token, body: { have } })) as { bots?: unknown };
    return Array.isArray(answer.bots) ? (answer.bots as BotWire[]) : [];
  },
  async report(body) {
    await request(baseUrl, { method: 'POST', path: '/maty/runner/channels/report', token, body });
  },
});

export interface HolderOptions {
  api: ChannelsApi;
  log: (line: string) => void;
  open?: OpenSocket;
  call?: JsonCall;
  clock?: ListenerClock;
  pollMs?: number;
  heartbeatMs?: number;
  random?: () => number;
  /** Builds a bot's listener; the tests give their own. */
  listen?: (bot: BotWire & { secrets: Record<string, string> }, callbacks: ListenerCallbacks) => Listener | null;
}

interface Held {
  fingerprint: string;
  listener: Listener;
  status: StatusWire;
}

export class ChannelHolder {
  private readonly held = new Map<string, Held>();
  private readonly dirty = new Set<string>();
  private heard: HeardWire[] = [];
  private timers: { dispose(): void }[] = [];
  private polling: Promise<void> | null = null;
  private reporting: Promise<void> | null = null;
  private reportAgain = false;
  private stopped = false;
  private readonly clock: ListenerClock;

  constructor(private readonly options: HolderOptions) {
    this.clock = options.clock ?? realClock;
  }

  start(): void {
    this.options.log('channels: holding the agents\' bots');
    void this.pollNow();
    this.timers.push(this.clock.every(this.options.pollMs ?? CHANNELS_POLL_MS, () => void this.pollNow()));
    this.timers.push(
      this.clock.every(this.options.heartbeatMs ?? CHANNELS_HEARTBEAT_MS, () => {
        for (const id of this.held.keys()) this.dirty.add(id);
        void this.reportNow();
      }),
    );
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers) timer.dispose();
    this.timers = [];
    await Promise.all([...this.held.values()].map((bot) => bot.listener.stop().catch(() => {})));
    this.held.clear();
  }

  /** The bots held now, by id. */
  holding(): string[] {
    return [...this.held.keys()];
  }

  pollNow(): Promise<void> {
    if (this.polling != null) return this.polling;
    this.polling = this.pollOnce().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  private async pollOnce(): Promise<void> {
    if (this.stopped) return;
    let bots: BotWire[];
    try {
      bots = await this.options.api.bots([...this.held].map(([id, bot]) => ({ id, fingerprint: bot.fingerprint })));
    } catch (error) {
      this.options.log(`channels: the API did not answer: ${reasonText(error)}`);
      return;
    }
    const wanted = new Map(bots.map((bot) => [bot.id, bot]));
    for (const [id, bot] of [...this.held]) {
      const want = wanted.get(id);
      if (want != null && want.fingerprint === bot.fingerprint) continue;
      this.held.delete(id);
      this.dirty.delete(id);
      this.options.log(`channels: let go of ${id} (${want == null ? 'removed' : 'new tokens'})`);
      await bot.listener.stop().catch(() => {});
    }
    for (const bot of bots) {
      if (this.held.has(bot.id) || this.stopped) continue;
      // Held elsewhere as the API thinks, or sealed under another key: asked for again next time.
      if (bot.secrets == null) continue;
      const callbacks: ListenerCallbacks = {
        onStatus: (status, detail) => this.noteStatus(bot.id, status, detail ?? null),
        onHeard: (heard) => this.noteHeard(bot.id, heard),
        log: (line) => this.options.log(`channels: ${bot.id} ${line}`),
      };
      const listener = (this.options.listen ?? this.listener.bind(this))({ ...bot, secrets: bot.secrets }, callbacks);
      if (listener == null) continue;
      this.held.set(bot.id, { fingerprint: bot.fingerprint, listener, status: { id: bot.id, status: 'connecting', detail: null } });
      this.options.log(`channels: holding ${bot.id} (${bot.platform})`);
      listener.start();
    }
    void this.reportNow();
  }

  private listener(bot: BotWire & { secrets: Record<string, string> }, callbacks: ListenerCallbacks): Listener | null {
    const open = this.options.open ?? openSocket;
    const clock = this.clock;
    const random = this.options.random;
    if (bot.platform === 'discord' && bot.secrets.token) {
      return new DiscordListener({ token: bot.secrets.token, callbacks, open, clock, ...(random == null ? {} : { random }) });
    }
    if (bot.platform === 'slack' && bot.secrets.token && bot.secrets.botToken) {
      return new SlackListener({ appToken: bot.secrets.token, botToken: bot.secrets.botToken, callbacks, open, call: this.options.call ?? jsonCall, clock, ...(random == null ? {} : { random }) });
    }
    return null;
  }

  private noteStatus(id: string, status: ChannelStatus, detail: StatusDetail | null): void {
    const bot = this.held.get(id);
    if (bot == null) return;
    bot.status = { id, status, detail };
    this.dirty.add(id);
    void this.reportNow();
  }

  private noteHeard(id: string, heard: Heard): void {
    if (!this.held.has(id)) return;
    this.heard.push({ id, ...heard });
    if (this.heard.length > HEARD_KEPT) this.heard.splice(0, this.heard.length - HEARD_KEPT);
    void this.reportNow();
  }

  reportNow(): Promise<void> {
    if (this.reporting != null) {
      this.reportAgain = true;
      return this.reporting;
    }
    this.reporting = (async () => {
      try {
        do {
          this.reportAgain = false;
          await this.reportOnce();
        } while (this.reportAgain && !this.stopped);
      } finally {
        this.reporting = null;
      }
    })();
    return this.reporting;
  }

  private async reportOnce(): Promise<void> {
    const statuses = [...this.dirty].map((id) => this.held.get(id)?.status).filter((status): status is StatusWire => status != null);
    const inbound = this.heard.slice(0, 200);
    if (statuses.length === 0 && inbound.length === 0) return;
    try {
      await this.options.api.report({ statuses, inbound });
    } catch (error) {
      // Kept, and sent with the next report (a status change, a message, the heartbeat, the next poll).
      this.options.log(`channels: the report did not reach the API: ${reasonText(error)}`);
      return;
    }
    for (const status of statuses) {
      if (this.held.get(status.id)?.status === status) this.dirty.delete(status.id);
    }
    this.heard.splice(0, inbound.length);
    if (inbound.length > 0) this.options.log(`channels: reported ${inbound.length} heard`);
    if (this.heard.length > 0) this.reportAgain = true;
  }
}

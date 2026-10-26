import { describe, expect, it } from 'vitest';

import { DiscordListener, DISCORD_INTENTS } from './discord.js';
import { ChannelHolder, type BotWire, type ChannelsApi, type HeardWire, type StatusWire } from './holder.js';
import type { Heard, JsonCall, ListenerCallbacks, ListenerClock, OpenSocket, SocketHandlers, StatusDetail } from './listener.js';
import { SlackListener } from './slack.js';

/** Sockets opened, each with what was sent on it and a way to speak or close from the other end. */
const fakeSockets = () => {
  const opened: { url: string; sent: unknown[]; handlers: SocketHandlers; open: boolean; say(payload: unknown): void; drop(code: number, reason?: string): void }[] = [];
  const open: OpenSocket = (url, handlers) => {
    const socket = {
      url,
      sent: [] as unknown[],
      handlers,
      open: true,
      say: (payload: unknown) => handlers.onMessage(JSON.stringify(payload)),
      drop: (code: number, reason = '') => {
        socket.open = false;
        handlers.onClose(code, reason);
      },
    };
    opened.push(socket);
    queueMicrotask(() => handlers.onOpen());
    return {
      send: (text: string) => socket.sent.push(JSON.parse(text)),
      close: (code?: number, reason?: string) => socket.drop(code ?? 1000, reason ?? ''),
      get isOpen() {
        return socket.open;
      },
    };
  };
  return { opened, open };
};

/** A clock whose waits are over at once and whose timers fire by hand. */
const fakeClock = () => {
  const timers: { ms: number; fn: () => void; live: boolean }[] = [];
  const clock: ListenerClock = {
    sleep: async () => {},
    every: (ms, fn) => {
      const timer = { ms, fn, live: true };
      timers.push(timer);
      return { dispose: () => { timer.live = false; } };
    },
  };
  return { clock, fire: (ms: number) => timers.filter((timer) => timer.live && timer.ms === ms).forEach((timer) => timer.fn()) };
};

const recorder = () => {
  const statuses: [string, StatusDetail | null | undefined][] = [];
  const heard: Heard[] = [];
  const logs: string[] = [];
  const callbacks: ListenerCallbacks = { onStatus: (status, detail) => statuses.push([status, detail]), onHeard: (item) => heard.push(item), log: (line) => logs.push(line) };
  return { statuses, heard, logs, callbacks };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the Discord listener', () => {
  it('identifies, hears people (not bots, not itself), and reports who it is', async () => {
    const { opened, open } = fakeSockets();
    const { statuses, heard, logs, callbacks } = recorder();
    const listener = new DiscordListener({ token: 'discord-secret-token', callbacks, open, clock: fakeClock().clock });
    listener.start();
    await settle();
    const socket = opened[0]!;
    socket.say({ op: 10, d: { heartbeat_interval: 41_250 } });
    expect(socket.sent).toEqual([{ op: 2, d: { token: 'discord-secret-token', intents: DISCORD_INTENTS, properties: { os: 'linux', browser: 'simeon', device: 'simeon' } } }]);
    socket.say({ op: 0, t: 'READY', s: 1, d: { session_id: 's1', resume_gateway_url: 'wss://resume.test', user: { id: 'bot1', username: 'theo' }, guilds: [] } });
    expect(statuses.at(-1)).toEqual(['connected', { key: 'channel.connectedAs', args: { name: 'theo' } }]);
    socket.say({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: 'm1', channel_id: 'c1', author: { id: 'u1', global_name: 'Iris' }, content: 'Hi Theo', timestamp: '2026-10-26T10:00:00.000Z' } });
    socket.say({ op: 0, t: 'MESSAGE_CREATE', s: 3, d: { id: 'm2', channel_id: 'c1', author: { id: 'b2', bot: true }, content: 'A bot' } });
    socket.say({ op: 0, t: 'MESSAGE_CREATE', s: 4, d: { id: 'm3', channel_id: 'c1', author: { id: 'bot1' }, content: 'Itself' } });
    socket.say({ op: 0, t: 'MESSAGE_REACTION_ADD', s: 5, d: { message_id: 'm9', message_author_id: 'bot1', user_id: 'u1', channel_id: 'c1', emoji: { name: '👍' }, member: { user: { username: 'iris' } } } });
    expect(heard).toEqual([
      { messageId: 'm1', envelope: { address: { platform: 'discord', chat: 'c1' }, sender: 'Iris', text: 'Hi Theo', timestampMs: Date.parse('2026-10-26T10:00:00.000Z') } },
      { messageId: 'react:m9:u1:👍', envelope: expect.objectContaining({ address: { platform: 'discord', chat: 'c1' }, sender: 'iris', text: '', reaction: { emoji: '👍' } }) },
    ]);
    expect(logs.join('\n')).not.toContain('discord-secret-token');
    // A dropped connection resumes the session.
    socket.drop(1006, 'gone');
    await settle();
    expect(statuses.at(-1)).toEqual(['connecting', { key: 'channel.reconnectingDiscord', args: { why: 'gone' } }]);
    const again = opened[1]!;
    expect(again.url).toBe('wss://resume.test?v=10&encoding=json');
    again.say({ op: 10, d: { heartbeat_interval: 41_250 } });
    expect(again.sent).toEqual([{ op: 6, d: { token: 'discord-secret-token', session_id: 's1', seq: 5 } }]);
    await listener.stop();
  });

  it('stops for good on a close Discord says not to retry, with the reason', async () => {
    const { opened, open } = fakeSockets();
    const { statuses, callbacks } = recorder();
    const listener = new DiscordListener({ token: 't', callbacks, open, clock: fakeClock().clock });
    listener.start();
    await settle();
    opened[0]!.drop(4014, 'Disallowed intent(s)');
    await settle();
    expect(statuses.at(-1)).toEqual(['error', { key: 'channel.discordPrivilegedIntent' }]);
    expect(opened).toHaveLength(1);
    await listener.stop();
  });
});

describe('the Slack listener', () => {
  const slackApi = (answers: Record<string, unknown>) => {
    const asked: string[] = [];
    const call: JsonCall = async <T>(url: string) => {
      const method = new URL(url).pathname.split('/').pop() ?? '';
      asked.push(method);
      return (answers[method] ?? { ok: false, error: 'unknown_method' }) as T;
    };
    return { asked, call };
  };

  it('opens Socket Mode, acknowledges each envelope, hears people once, with their thread', async () => {
    const { opened, open } = fakeSockets();
    const { statuses, heard, callbacks } = recorder();
    const { asked, call } = slackApi({
      'auth.test': { ok: true, user_id: 'UBOT' },
      'apps.connections.open': { ok: true, url: 'wss://slack.test/socket' },
      'users.info': { ok: true, user: { profile: { display_name: 'Iris' } } },
    });
    const listener = new SlackListener({ appToken: 'xapp-secret', botToken: 'xoxb-secret', callbacks, open, call, clock: fakeClock().clock });
    listener.start();
    await settle();
    const socket = opened[0]!;
    expect(socket.url).toBe('wss://slack.test/socket');
    socket.say({ type: 'hello' });
    expect(statuses.at(-1)).toEqual(['connected', { key: 'channel.connectedSocketMode' }]);
    const event = { type: 'events_api', envelope_id: 'e1', payload: { event_id: 'Ev1', event: { type: 'message', channel: 'C1', user: 'U1', text: 'Hi &amp; hello', ts: '1750000000.000100', thread_ts: '1749999999.000000' } } };
    socket.say(event);
    socket.say({ ...event, envelope_id: 'e2' });
    socket.say({ type: 'events_api', envelope_id: 'e3', payload: { event_id: 'Ev2', event: { type: 'message', channel: 'C1', user: 'UBOT', text: 'Itself', ts: '1750000001.0' } } });
    await settle();
    expect(socket.sent).toEqual([{ envelope_id: 'e1' }, { envelope_id: 'e2' }, { envelope_id: 'e3' }]);
    expect(heard).toEqual([
      { messageId: 'C1:1750000000.000100', envelope: { address: { platform: 'slack', chat: 'C1' }, sender: 'Iris', text: 'Hi & hello', timestampMs: 1_750_000_000_000, thread: '1749999999.000000' } },
    ]);
    expect(asked).toEqual(['auth.test', 'apps.connections.open', 'users.info']);
    await listener.stop();
  });

  it('stops for good on a refused token, with the reason, and opens no socket', async () => {
    const { opened, open } = fakeSockets();
    const { statuses, callbacks } = recorder();
    const { call } = slackApi({ 'auth.test': { ok: false, error: 'invalid_auth' } });
    const listener = new SlackListener({ appToken: 'xapp', botToken: 'xoxb', callbacks, open, call, clock: fakeClock().clock });
    listener.start();
    await settle();
    expect(statuses.at(-1)).toEqual(['error', { key: 'channel.slackInvalidAuth' }]);
    expect(opened).toHaveLength(0);
    await listener.stop();
  });
});

describe('the holder', () => {
  const fakeApi = () => {
    const state = { bots: [] as BotWire[], haves: [] as { id: string; fingerprint: string }[][], reports: [] as { statuses: StatusWire[]; inbound: HeardWire[] }[], refuse: 0 };
    const api: ChannelsApi = {
      bots: async (have) => {
        state.haves.push(have);
        return state.bots.map((bot) => (have.some((held) => held.id === bot.id && held.fingerprint === bot.fingerprint) ? { ...bot, secrets: undefined } : bot));
      },
      report: async (body) => {
        if (state.refuse > 0) {
          state.refuse -= 1;
          throw new Error('POST /maty/runner/channels/report answered 503');
        }
        state.reports.push(structuredClone(body));
      },
    };
    return { state, api };
  };

  it('holds what the API names, reports what it hears, and lets go of what it no longer names', async () => {
    const { state, api } = fakeApi();
    const { clock, fire } = fakeClock();
    const started: { bot: BotWire; callbacks: ListenerCallbacks; stopped: boolean }[] = [];
    const logs: string[] = [];
    const holder = new ChannelHolder({
      api,
      clock,
      log: (line) => logs.push(line),
      pollMs: 15_000,
      heartbeatMs: 60_000,
      listen: (bot, callbacks) => {
        const entry = { bot, callbacks, stopped: false };
        started.push(entry);
        return { start: () => callbacks.onStatus('connected', { key: 'channel.connectedAs', args: { name: 'theo' } }), stop: async () => { entry.stopped = true; } };
      },
    });
    state.bots = [{ id: 'b1', platform: 'discord', fingerprint: 'f1', secrets: { token: 'discord-secret' } }];
    holder.start();
    await settle();
    await holder.reportNow();
    expect(state.haves[0]).toEqual([]);
    expect(started.map((entry) => entry.bot.secrets)).toEqual([{ token: 'discord-secret' }]);
    expect(state.reports.flatMap((report) => report.statuses)).toEqual([{ id: 'b1', status: 'connected', detail: { key: 'channel.connectedAs', args: { name: 'theo' } } }]);

    // What it hears goes at once; a report the API refused goes again with the next.
    state.refuse = 1;
    started[0]!.callbacks.onHeard({ messageId: 'm1', envelope: { address: { platform: 'discord', chat: 'c1' }, sender: 'Iris', text: 'Hi', timestampMs: 1 } });
    await settle();
    expect(state.refuse).toBe(0);
    expect(state.reports.flatMap((report) => report.inbound)).toEqual([]);
    fire(60_000);
    await holder.reportNow();
    expect(state.reports.flatMap((report) => report.inbound).map((item) => [item.id, item.messageId])).toEqual([['b1', 'm1']]);
    expect(state.reports.at(-1)!.statuses.map((status) => status.id)).toEqual(['b1'], 'the heartbeat says the state again');

    // Held as it is: asked with what it holds, no tokens again, nothing restarted.
    await holder.pollNow();
    expect(state.haves.at(-1)).toEqual([{ id: 'b1', fingerprint: 'f1' }]);
    expect(started).toHaveLength(1);
    // No longer named: let go.
    state.bots = [];
    await holder.pollNow();
    expect(started[0]!.stopped).toBe(true);
    expect(holder.holding()).toEqual([]);
    expect(logs.join('\n')).not.toContain('discord-secret');
    await holder.stop();
  });

  it('holds a bot again with its new tokens', async () => {
    const { state, api } = fakeApi();
    const started: { secrets: Record<string, string>; stopped: boolean }[] = [];
    const holder = new ChannelHolder({
      api,
      clock: fakeClock().clock,
      log: () => {},
      listen: (bot) => {
        const entry = { secrets: bot.secrets, stopped: false };
        started.push(entry);
        return { start: () => {}, stop: async () => { entry.stopped = true; } };
      },
    });
    state.bots = [{ id: 'b1', platform: 'slack', fingerprint: 'f1', secrets: { token: 'xapp-1', botToken: 'xoxb-1' } }];
    await holder.pollNow();
    state.bots = [{ id: 'b1', platform: 'slack', fingerprint: 'f2', secrets: { token: 'xapp-2', botToken: 'xoxb-2' } }];
    await holder.pollNow();
    expect(started.map((entry) => [entry.secrets.token, entry.stopped])).toEqual([['xapp-1', true], ['xapp-2', false]]);
    await holder.stop();
  });
});

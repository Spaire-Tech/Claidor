/**
 * An agent's own bots handed to Simeon Labs' server (26 October 2026,
 * docs/services-agents.md §4): the cloud runner listens to them there, and
 * this computer only replies to a bot the runner's fresh word says it
 * holds. Measured against the in-process Discord and Slack fakes of
 * channels-runtime.test.mjs and a server that answers as
 * `server/simeon/desktop/channel_bots.py` does: tokens leave only for a
 * server that holds bots, and only once; a bot the runner holds is let go
 * here and still replies; with the server silent, or the runner's word
 * stale, this computer listens again; what the runner heard wakes the agent
 * once, even heard here too, and a Slack reply goes to its thread.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { WebSocketServer } from "ws";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const immediateClock = { sleep: () => Promise.resolve(), setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timer.unref?.(); return { dispose: () => clearInterval(timer) }; } };

function waitFor(predicate, { timeoutMs = 5000, label = "condition" } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => { const value = predicate(); if (value) return resolve(value); if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${label}`)); setTimeout(tick, 10); };
    tick();
  });
}

async function readBody(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }

/** A Discord gateway and REST API in one process: HELLO, IDENTIFY, READY, then whatever the test pushes. */
async function fakeDiscord({ token }) {
  const rest = { requests: [] };
  const sockets = new Set();
  let identified = null;
  const http = createServer(async (req, res) => {
    const body = await readBody(req);
    rest.requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, contentType: req.headers["content-type"] ?? "", body });
    if (req.url === "/channels/C429/messages" && rest.requests.filter((r) => r.url === "/channels/C429/messages").length === 1) { res.writeHead(429, { "content-type": "application/json" }); res.end(JSON.stringify({ retry_after: 0.01, global: false })); return; }
    res.writeHead(req.url.endsWith("/typing") ? 204 : 200, { "content-type": "application/json" });
    res.end(req.url.endsWith("/typing") ? "" : JSON.stringify({ id: `m${rest.requests.length}` }));
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const wss = new WebSocketServer({ server: http, path: "/gateway" });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 45_000 } }));
    socket.on("message", (raw) => {
      const payload = JSON.parse(raw.toString());
      if (payload.op === 2) {
        identified = payload.d;
        if (payload.d.token !== token) { socket.close(4004, "Authentication failed."); return; }
        socket.send(JSON.stringify({ op: 0, t: "READY", s: 1, d: { session_id: "sess-1", resume_gateway_url: `ws://127.0.0.1:${http.address().port}/gateway`, user: { id: "BOT1", username: "simeon" }, guilds: [{ id: "G1" }] } }));
      }
    });
  });
  const port = http.address().port;
  return {
    apiBase: `http://127.0.0.1:${port}`,
    gatewayUrl: `ws://127.0.0.1:${port}/gateway`,
    rest,
    get identified() { return identified; },
    get connections() { return sockets.size; },
    dispatch(t, d, s = 2) { for (const socket of sockets) socket.send(JSON.stringify({ op: 0, t, s, d })); },
    async close() { for (const socket of sockets) socket.terminate(); wss.close(); await new Promise((resolve) => http.close(resolve)); },
  };
}

/** Slack's Web API and a Socket Mode endpoint in one process. */
async function fakeSlack({ appToken, botToken }) {
  const api = { calls: [] };
  const sockets = new Set();
  const acks = [];
  const http = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const body = await readBody(req);
    const call = { method: url.pathname.slice(1), auth: req.headers.authorization, query: Object.fromEntries(url.searchParams), json: body.length > 0 && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(body.toString()) : null, bytes: body };
    api.calls.push(call);
    const reply = (value, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    switch (call.method) {
      case "apps.connections.open": return reply(call.auth === `Bearer ${appToken}` ? { ok: true, url: `ws://127.0.0.1:${http.address().port}/socket?ticket=1` } : { ok: false, error: "invalid_auth" });
      case "auth.test": return reply(call.auth === `Bearer ${botToken}` ? { ok: true, user_id: "UBOT", user: "simeon", team: "T1" } : { ok: false, error: "invalid_auth" });
      case "users.info": return reply({ ok: true, user: { name: "bass", real_name: "Bass Fall", profile: { display_name: "Bass" } } });
      case "chat.postMessage": return reply({ ok: true, ts: "1700000000.000100" });
      case "files.getUploadURLExternal": return reply({ ok: true, upload_url: `http://127.0.0.1:${http.address().port}/upload`, file_id: "F1" });
      case "upload": return reply({ ok: true });
      case "files.completeUploadExternal": return reply({ ok: true });
      default: return reply({ ok: false, error: "unknown_method" }, 404);
    }
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const wss = new WebSocketServer({ server: http, path: "/socket" });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("message", (raw) => { const payload = JSON.parse(raw.toString()); if (payload.envelope_id) acks.push(payload.envelope_id); });
    socket.send(JSON.stringify({ type: "hello", num_connections: 1 }));
  });
  let envelopeSeq = 0;
  return {
    apiBase: `http://127.0.0.1:${http.address().port}`,
    api, acks,
    get connections() { return sockets.size; },
    event(event, eventId = `Ev${(envelopeSeq += 1)}`) { const envelope = { envelope_id: `env-${envelopeSeq}`, type: "events_api", accepts_response_payload: false, payload: { type: "event_callback", event_id: eventId, event } }; for (const socket of sockets) socket.send(JSON.stringify(envelope)); return envelope.envelope_id; },
    disconnect(reason) { for (const socket of sockets) socket.send(JSON.stringify({ type: "disconnect", reason })); },
    async close() { for (const socket of sockets) socket.terminate(); wss.close(); await new Promise((resolve) => http.close(resolve)); },
  };
}

function fakeTranscript(configsByAgent) {
  const hooks = {};
  const wakes = [];
  const statuses = [];
  return {
    hooks, wakes, statuses,
    transcript: {
      listAgentIds: async () => Object.keys(configsByAgent),
      listChannelConfigs: (agentId) => configsByAgent[agentId] ?? [],
      setChannelDelivery: (fn) => { hooks.deliver = fn; },
      setChannelActivity: (fn) => { hooks.activity = fn; },
      setChannelConfigChanged: (fn) => { hooks.changed = fn; },
      wakeForInbound: (agentId, envelope) => { wakes.push({ agentId, envelope }); },
      sessionStore: { writeChannelStatus: (agentId, platform, status, detail) => { statuses.push({ agentId, platform, status, detail: detail ?? null }); return true; } },
    },
  };
}


/** The server: what it was sent, and what it answers (a function of the call's number), or a refusal. */
function fakeServer(answer) {
  const calls = [];
  return {
    calls,
    answer,
    async sync(channels) {
      calls.push(structuredClone(channels));
      const reply = this.answer(calls.length, channels);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

const state = (more = {}) => ({ agentId: "a1", platform: "discord", missing: false, status: null, detail: null, fresh: false, ...more });

test("a bot the runner listens to is let go here and still replies; tokens go once, and only to a server that holds bots", async () => {
  const discord = await fakeDiscord({ token: "DTOKEN.abc" });
  const lines = [];
  const fake = fakeTranscript({ a1: [{ platform: "discord", token: "DTOKEN.abc", label: "Discord", secrets: { token: "DTOKEN.abc" } }] });
  let runnerWord = state();
  const server = fakeServer((n) => ({ held: true, channels: [n === 1 ? state({ missing: true }) : runnerWord] }));
  let clock = 1_000_000;
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-server");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: (line) => lines.push(line), clock: immediateClock, pollMs: 3_600_000, server, syncMs: 30_000, now: () => clock, discord: { gatewayUrl: discord.gatewayUrl, apiBase: discord.apiBase } });
  try {
    runtime.start();
    await waitFor(() => discord.connections === 1, { label: "listened to here while the server lacks the tokens" });
    assert.deepEqual(server.calls[0], [{ agentId: "a1", platform: "discord", fingerprint: server.calls[0][0].fingerprint }], "no token to a server that has not said it holds bots");
    await runtime.reconcile();
    assert.deepEqual(server.calls[1][0].secrets, { token: "DTOKEN.abc" }, "sent once the server says it holds bots and lacks them");
    assert.equal(server.calls[1][0].fingerprint, server.calls[0][0].fingerprint);
    assert.equal(discord.connections, 1, "the runner's word is not fresh yet: still listened to here");

    // The runner listens: let go here, its state shown in the person's words.
    runnerWord = state({ status: "connected", detail: { key: "channel.connectedAs", args: { name: "simeon" } }, fresh: true });
    clock += 30_000;
    await runtime.reconcile();
    await waitFor(() => discord.connections === 0, { label: "let go here" });
    assert.equal(server.calls[2][0].secrets, undefined, "the tokens are not sent again");
    assert.deepEqual(fake.statuses.at(-1), { agentId: "a1", platform: "discord", status: "connected", detail: "Connected as simeon." });
    assert.deepEqual(runtime.statuses().map((status) => status.listening), ["server"]);
    assert.ok(lines.some((line) => /channel=discord agent=a1 event=stop reason=listened-by-server/.test(line)), lines.join("\n"));
    // Replies still go, over the REST API, with no connection here.
    await fake.hooks.deliver("a1", "discord:C1", { type: "text", content: "On it" });
    assert.equal(discord.rest.requests.filter((request) => request.url === "/channels/C1/messages").length, 1);

    // The server falls silent: its word holds three minutes, then this computer listens again.
    server.answer = () => new Error("/desktop/api/channels/sync answered 503");
    clock += 60_000;
    await runtime.reconcile();
    assert.equal(discord.connections, 0);
    clock += 3 * 60_000;
    await runtime.reconcile();
    await waitFor(() => discord.connections === 1, { label: "listened to here again" });
    assert.ok(!lines.join("\n").includes("DTOKEN.abc"), "never a token in the log");
  } finally {
    await runtime.stop();
    await discord.close();
    await dispose();
  }
});

test("what the runner heard wakes the agent once, even heard here too; a Slack reply goes to its thread", async () => {
  const slack = await fakeSlack({ appToken: "xapp-1", botToken: "xoxb-1" });
  const fake = fakeTranscript({ a2: [{ platform: "slack", token: "xapp-1", label: "Slack", secrets: { token: "xapp-1", botToken: "xoxb-1" } }] });
  const server = fakeServer(() => ({ held: true, channels: [state({ agentId: "a2", platform: "slack", status: "connected", fresh: true })] }));
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-server-slack");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: () => {}, clock: immediateClock, pollMs: 3_600_000, server, slack: { apiBase: slack.apiBase } });
  try {
    runtime.start();
    await runtime.reconcile();
    await runtime.reconcile();
    assert.deepEqual(runtime.statuses().map((status) => status.listening), ["server"]);
    assert.equal(slack.connections, 0, "the runner listens; no socket here");
    const heard = { address: { platform: "slack", chat: "C7" }, sender: "Bass", text: "Ship it?", timestampMs: 1, messageId: "C7:17.1", thread: "17.0" };
    assert.equal(runtime.receiveFromServer("a2", heard), true);
    assert.equal(runtime.receiveFromServer("a2", heard), true);
    assert.equal(fake.wakes.length, 1, "heard twice, woken once");
    assert.deepEqual(fake.wakes[0], { agentId: "a2", envelope: heard });
    assert.equal(runtime.receiveFromServer("a2", { address: { platform: "slack" } }), false, "not a bot's message");
    await fake.hooks.deliver("a2", "slack:C7", { type: "text", content: "Shipping" });
    const posted = slack.api.calls.find((call) => call.method === "chat.postMessage");
    assert.deepEqual(posted.json, { channel: "C7", text: "Shipping", thread_ts: "17.0" });
  } finally {
    await runtime.stop();
    await slack.close();
    await dispose();
  }
});

test("a server that holds no bots gets no token; the extension takes the inbox's bot messages, and listens itself with chat-copy off", async () => {
  const discord = await fakeDiscord({ token: "DTOKEN.abc" });
  const fake = fakeTranscript({ a1: [{ platform: "discord", token: "DTOKEN.abc", label: "Discord", secrets: { token: "DTOKEN.abc" } }] });
  const server = fakeServer(() => ({ held: false, channels: [] }));
  let clock = 0;
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-server-off");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: () => {}, clock: immediateClock, pollMs: 3_600_000, server, syncMs: 30_000, now: () => clock, discord: { gatewayUrl: discord.gatewayUrl, apiBase: discord.apiBase } });
  try {
    runtime.start();
    for (let i = 0; i < 3; i += 1) { clock += 30_000; await runtime.reconcile(); }
    await waitFor(() => discord.connections === 1, { label: "listened to here" });
    assert.ok(server.calls.length >= 3);
    assert.ok(server.calls.every((call) => call.every((channel) => channel.secrets === undefined)), "no token ever left");
  } finally {
    await runtime.stop();
    await discord.close();
    await dispose();
  }
  const extension = await src("host/extensions/channels/extension.ts");
  assert.match(extension, /chatCopy\.isEnabled\(\) && isChannelsOnServerEnabled\(\)/);
  assert.match(extension, /onInboxKind\("channel", \(waiting\) => runtime\.receiveFromServer\(waiting\.agentId, waiting\.message\)\)/);
  const loaded = await load("source/host/extensions/channels/extension.ts", "channels-extension-switch");
  try {
    assert.equal(loaded.module.isChannelsOnServerEnabled({}), true);
    for (const value of ["0", "off", "false", "no"]) assert.equal(loaded.module.isChannelsOnServerEnabled({ SAND_CHANNELS_ON_SERVER: value }), false, value);
  } finally { await loaded.dispose(); }
});

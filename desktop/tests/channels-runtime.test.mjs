/**
 * Messaging channels are served (25 September 2026, docs/product/channels-served.md;
 * design-audit-ledger.md cluster `cloud-agents-channels`, F-055, F-057, F-081).
 *
 * The transcript manager had every channel hook (`setChannelDelivery`,
 * `setChannelActivity`, `setChannelConfigChanged`, `wakeForInbound`) and
 * nothing registered against them. `host/extensions/channels/` is that
 * module: one connector per (agent, platform) built from the secret store,
 * Discord over the Gateway and Slack over Socket Mode, delivery through
 * their REST APIs. This test drives it against in-process fakes of both
 * platforms; nothing here reaches the network and no live key is used.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
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

test("Discord: connect with the stored token, an inbound DM wakes the agent with the envelope the transcript reads, delivery is a REST POST, typing while active, a 429 is retried", async () => {
  const discord = await fakeDiscord({ token: "DTOKEN.abc" });
  const lines = [];
  const configs = { a1: [{ platform: "discord", token: "DTOKEN.abc", label: "Discord", secrets: { token: "DTOKEN.abc" } }] };
  const fake = fakeTranscript(configs);
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-discord");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: (line) => lines.push(line), clock: immediateClock, pollMs: 50, discord: { gatewayUrl: discord.gatewayUrl, apiBase: discord.apiBase } });
  try {
    runtime.start();
    assert.equal(typeof fake.hooks.deliver, "function", "setChannelDelivery registered");
    assert.equal(typeof fake.hooks.activity, "function", "setChannelActivity registered");
    assert.equal(typeof fake.hooks.changed, "function", "setChannelConfigChanged registered");
    await waitFor(() => fake.statuses.some((s) => s.status === "connected"), { label: "Discord connected" });
    assert.deepEqual(discord.identified.intents, (1 << 0) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 13) | (1 << 15), "guild, DM, reaction and message-content intents");
    assert.equal(discord.identified.properties.browser, "simeon");
    assert.match(lines.find((l) => l.includes("event=connect")), /^\[claidor\] channel=discord agent=a1 event=connect url=ws:\/\/127\.0\.0\.1:\d+\/gateway token=…\(10\) attempt=0 resume=false$/);
    assert.ok(lines.some((l) => /channel=discord agent=a1 event=ready bot=simeon botId=BOT1 guilds=1/.test(l)), "ready line");
    assert.deepEqual(fake.statuses.at(-1), { agentId: "a1", platform: "discord", status: "connected", detail: "Connected as simeon." });

    // The bot's own message and another bot's are ignored; a person's DM wakes the agent.
    discord.dispatch("MESSAGE_CREATE", { id: "m0", channel_id: "C1", author: { id: "BOT1", username: "simeon" }, content: "echo of myself", timestamp: "2026-09-25T10:00:00.000Z" });
    discord.dispatch("MESSAGE_CREATE", { id: "m0b", channel_id: "C1", author: { id: "OTHERBOT", username: "other", bot: true }, content: "bot noise", timestamp: "2026-09-25T10:00:00.000Z" });
    discord.dispatch("MESSAGE_CREATE", { id: "m1", channel_id: "C1", author: { id: "U1", username: "bass", global_name: "Bass" }, content: "hey simeon, what's the plan?", attachments: [{ url: "https://cdn.discordapp.com/a.png", filename: "a.png" }], timestamp: "2026-09-25T10:00:01.000Z" });
    await waitFor(() => fake.wakes.length === 1, { label: "one inbound wake" });
    assert.deepEqual(fake.wakes[0], { agentId: "a1", envelope: { address: { platform: "discord", chat: "C1" }, sender: "Bass", text: "hey simeon, what's the plan?\n[attachment a.png: https://cdn.discordapp.com/a.png]", timestampMs: Date.parse("2026-09-25T10:00:01.000Z") } });
    assert.ok(lines.some((l) => /channel=discord agent=a1 event=inbound chat=C1 sender=Bass chars=\d+ guild=dm/.test(l)), "inbound line");

    // A reaction to the bot's own message wakes too; one to someone else's does not.
    discord.dispatch("MESSAGE_REACTION_ADD", { user_id: "U1", channel_id: "C1", message_id: "m9", message_author_id: "U2", emoji: { name: "👀" } });
    discord.dispatch("MESSAGE_REACTION_ADD", { user_id: "U1", channel_id: "C1", message_id: "m2", message_author_id: "BOT1", member: { user: { username: "bass", global_name: "Bass" } }, emoji: { name: "❤️" } });
    await waitFor(() => fake.wakes.length === 2, { label: "reaction wake" });
    assert.equal(fake.wakes[1].envelope.reaction.emoji, "❤️");
    assert.equal(fake.wakes[1].envelope.sender, "Bass");

    // Delivery: the transcript's outbound shape, one POST per message, and the humanized failure regex on an unknown platform.
    await fake.hooks.deliver("a1", "discord:C1", { kind: "text", text: "On it — two things first." });
    const post = discord.rest.requests.find((r) => r.url === "/channels/C1/messages");
    assert.equal(post.method, "POST");
    assert.equal(post.auth, "Bot DTOKEN.abc");
    assert.deepEqual(JSON.parse(post.body.toString()), { content: "On it — two things first." });
    assert.ok(lines.some((l) => /channel=discord agent=a1 event=delivery chat=C1 kind=text chars=25/.test(l)), "delivery line");
    await fake.hooks.deliver("a1", "discord:C1", { type: "text", content: "raw shape too" });
    assert.deepEqual(JSON.parse(discord.rest.requests.filter((r) => r.url === "/channels/C1/messages").at(-1).body.toString()), { content: "raw shape too" });
    await fake.hooks.deliver("a1", "discord:C1", { kind: "attachment", url: "https://example.com/report.pdf", caption: "The report" });
    assert.deepEqual(JSON.parse(discord.rest.requests.filter((r) => r.url === "/channels/C1/messages").at(-1).body.toString()), { content: "The report\nhttps://example.com/report.pdf" });
    const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-channel-file-"));
    const filePath = path.join(dir, "chart.png");
    await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await fake.hooks.deliver("a1", "discord:C1", { kind: "attachment", url: pathToFileURL(filePath).href, caption: null });
    const upload = discord.rest.requests.filter((r) => r.url === "/channels/C1/messages").at(-1);
    assert.match(upload.contentType, /^multipart\/form-data/);
    assert.match(upload.body.toString("latin1"), /name="files\[0\]"; filename="chart.png"/);
    assert.match(upload.body.toString("latin1"), /"filename":"chart.png"/);
    await rm(dir, { recursive: true, force: true });
    await fake.hooks.deliver("a1", "discord:C429", { kind: "text", text: "rate limited once" });
    assert.equal(discord.rest.requests.filter((r) => r.url === "/channels/C429/messages").length, 2, "the 429 was retried once after retry_after");
    await assert.rejects(fake.hooks.deliver("a1", "slack:C1", { kind: "text", text: "x" }), /No live Slack connection for this agent/);
    await assert.rejects(fake.hooks.deliver("a1", "nonsense", { kind: "text", text: "x" }), /not a valid channel address/);

    fake.hooks.activity("a1", "discord:C1", true);
    await waitFor(() => discord.rest.requests.some((r) => r.url === "/channels/C1/typing"), { label: "typing" });
    fake.hooks.activity("a1", "discord:C1", false);

    // The row disappears (disconnect from the tab or update_state): the connector closes on the change hook.
    configs.a1 = [];
    fake.hooks.changed();
    await waitFor(() => discord.connections === 0, { label: "gateway socket closed" });
    assert.ok(lines.some((l) => l === "[claidor] channel=discord agent=a1 event=stop reason=removed"), "stop line");
    await assert.rejects(fake.hooks.deliver("a1", "discord:C1", { kind: "text", text: "x" }), /No live Discord connection for this agent/);
  } finally {
    await runtime.stop();
    await discord.close();
    await dispose();
  }
});

test("Discord: a refused token is a terminal error with Discord's sentence, not a reconnect loop", async () => {
  const discord = await fakeDiscord({ token: "GOOD" });
  const fake = fakeTranscript({ a1: [{ platform: "discord", token: "BAD", label: "Discord", secrets: { token: "BAD" } }] });
  const lines = [];
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-discord-refused");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: (line) => lines.push(line), clock: immediateClock, pollMs: 50, discord: { gatewayUrl: discord.gatewayUrl, apiBase: discord.apiBase } });
  try {
    runtime.start();
    await waitFor(() => fake.statuses.some((s) => s.status === "error"), { label: "error status" });
    assert.match(fake.statuses.at(-1).detail, /Discord refused the bot token \(authentication failed\)/);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(lines.filter((l) => l.includes("event=connect")).length, 1, "no reconnect after a fatal close");
  } finally {
    await runtime.stop();
    await discord.close();
    await dispose();
  }
});

test("Slack: Socket Mode with the app token, the bot token for the Web API, the envelope acked, an inbound message wakes the agent, delivery posts chat.postMessage in the thread, both tokens required", async () => {
  const slack = await fakeSlack({ appToken: "xapp-1-A", botToken: "xoxb-1-B" });
  const lines = [];
  const configs = { a2: [{ platform: "slack", token: "xapp-1-A", label: "Slack", secrets: { token: "xapp-1-A" } }] };
  const fake = fakeTranscript(configs);
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-slack");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: (line) => lines.push(line), clock: immediateClock, pollMs: 50, slack: { apiBase: slack.apiBase } });
  try {
    runtime.start();
    await waitFor(() => fake.statuses.some((s) => s.status === "pending"), { label: "pending on the bot token" });
    assert.match(fake.statuses.at(-1).detail, /Waiting for the bot token \(xoxb-…\): Slack needs both/);
    assert.equal(slack.connections, 0, "no socket without the bot token");
    await assert.rejects(fake.hooks.deliver("a2", "slack:C7", { kind: "text", text: "x" }), /No live Slack connection for this agent \(Waiting for the bot token/);

    configs.a2 = [{ platform: "slack", token: "xapp-1-A", label: "Slack", secrets: { token: "xapp-1-A", botToken: "xoxb-1-B" } }];
    fake.hooks.changed();
    await waitFor(() => fake.statuses.some((s) => s.status === "connected"), { label: "Slack connected" });
    assert.equal(slack.api.calls.find((c) => c.method === "auth.test").auth, "Bearer xoxb-1-B");
    assert.equal(slack.api.calls.find((c) => c.method === "apps.connections.open").auth, "Bearer xapp-1-A");
    assert.ok(lines.some((l) => /channel=slack agent=a2 event=ready bot=simeon botId=UBOT team=T1/.test(l)), "ready line");

    slack.event({ type: "message", channel: "C7", user: "UBOT", text: "my own echo", ts: "1700000000.000001" });
    slack.event({ type: "message", channel: "C7", user: "U1", text: "edited", subtype: "message_changed", ts: "1700000000.000002" });
    slack.event({ type: "message", channel: "C7", bot_id: "B9", text: "another bot", ts: "1700000000.000003" });
    const envelopeId = slack.event({ type: "message", channel: "C7", user: "U1", text: "can you &amp; the team ship &lt;this&gt; today?", ts: "1700000001.000100", thread_ts: "1700000000.000100", channel_type: "channel" });
    await waitFor(() => fake.wakes.length === 1, { label: "one inbound wake" });
    assert.deepEqual(fake.wakes[0], { agentId: "a2", envelope: { address: { platform: "slack", chat: "C7" }, sender: "Bass", text: "can you & the team ship <this> today?", timestampMs: 1700000001000 } });
    await waitFor(() => slack.acks.includes(envelopeId), { label: "envelope acked" });
    slack.event({ type: "message", channel: "C7", user: "U1", text: "a redelivery", ts: "1700000001.000200", thread_ts: "1700000000.000100" }, "Ev99");
    slack.event({ type: "message", channel: "C7", user: "U1", text: "a redelivery", ts: "1700000001.000200", thread_ts: "1700000000.000100" }, "Ev99");
    await waitFor(() => fake.wakes.length === 2, { label: "the redelivered event wakes once" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(fake.wakes.length, 2, "duplicate event_id dropped");

    slack.event({ type: "reaction_added", user: "U1", reaction: "white_check_mark", item: { type: "message", channel: "C7", ts: "1700000002.000100" }, item_user: "UBOT" });
    slack.event({ type: "reaction_added", user: "U1", reaction: "eyes", item: { type: "message", channel: "C7", ts: "1700000002.000200" }, item_user: "U2" });
    await waitFor(() => fake.wakes.length === 3, { label: "reaction wake" });
    assert.deepEqual(fake.wakes[2].envelope.reaction, { emoji: ":white_check_mark:" });

    await fake.hooks.deliver("a2", "slack:C7", { kind: "text", text: "Yes — shipping by 5." });
    const post = slack.api.calls.filter((c) => c.method === "chat.postMessage").at(-1);
    assert.equal(post.auth, "Bearer xoxb-1-B");
    assert.deepEqual(post.json, { channel: "C7", text: "Yes — shipping by 5.", thread_ts: "1700000000.000100" }, "replies in the thread the last inbound came from");
    assert.ok(lines.some((l) => /channel=slack agent=a2 event=delivery chat=C7 kind=text chars=20 thread=true/.test(l)), "delivery line");
    const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-channel-slack-file-"));
    const filePath = path.join(dir, "notes.txt");
    await writeFile(filePath, "hello");
    await fake.hooks.deliver("a2", "slack:C7", { kind: "attachment", url: pathToFileURL(filePath).href, caption: "Notes" });
    await rm(dir, { recursive: true, force: true });
    const ticket = slack.api.calls.find((c) => c.method === "files.getUploadURLExternal");
    assert.deepEqual(ticket.query, { filename: "notes.txt", length: "5" });
    assert.equal(slack.api.calls.find((c) => c.method === "upload").bytes.toString(), "hello");
    assert.deepEqual(slack.api.calls.find((c) => c.method === "files.completeUploadExternal").json, { files: [{ id: "F1", title: "notes.txt" }], channel_id: "C7", initial_comment: "Notes", thread_ts: "1700000000.000100" });

    // Slack's refresh_requested: the socket is reopened at once.
    const connectsBefore = lines.filter((l) => l.includes("channel=slack") && l.includes("event=connect")).length;
    slack.disconnect("refresh_requested");
    await waitFor(() => lines.filter((l) => l.includes("channel=slack") && l.includes("event=connect")).length > connectsBefore, { label: "reconnect after refresh_requested" });
    await waitFor(() => slack.connections === 1, { label: "socket back" });
  } finally {
    await runtime.stop();
    await slack.close();
    await dispose();
  }
});

test("Slack: invalid_auth on the app token is terminal with Slack's sentence", async () => {
  const slack = await fakeSlack({ appToken: "xapp-good", botToken: "xoxb-good" });
  const fake = fakeTranscript({ a3: [{ platform: "slack", token: "xapp-bad", label: "Slack", secrets: { token: "xapp-bad", botToken: "xoxb-good" } }] });
  const lines = [];
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-slack-refused");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: (line) => lines.push(line), clock: immediateClock, pollMs: 50, slack: { apiBase: slack.apiBase } });
  try {
    runtime.start();
    await waitFor(() => fake.statuses.some((s) => s.status === "error"), { label: "error status" });
    assert.match(fake.statuses.at(-1).detail, /Slack refused the token \(invalid_auth\)/);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(lines.filter((l) => l.includes("channel=slack") && l.includes("event=connect")).length, 1);
  } finally {
    await runtime.stop();
    await slack.close();
    await dispose();
  }
});

test("SAND_CHANNELS_SERVED=0 keeps every connector closed and the manifests coming soon", async () => {
  const discord = await fakeDiscord({ token: "T" });
  const fake = fakeTranscript({ a1: [{ platform: "discord", token: "T", label: "Discord", secrets: { token: "T" } }] });
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-off");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: { SAND_CHANNELS_SERVED: "0" }, log: () => {}, clock: immediateClock, pollMs: 50, discord: { gatewayUrl: discord.gatewayUrl, apiBase: discord.apiBase } });
  try {
    runtime.start();
    await runtime.reconcile();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(discord.connections, 0);
    assert.deepEqual(runtime.statuses(), []);
  } finally {
    await runtime.stop();
    await discord.close();
    await dispose();
  }
  const channels = await load("source/shared/channels.ts", "channels-manifests");
  try {
    assert.deepEqual(channels.module.connectorManifests({}).map((m) => [m.platform, m.availability]), [["discord", "available"], ["slack", "available"]]);
    assert.deepEqual(channels.module.connectorManifests({ SAND_CHANNELS_SERVED: "0" }).map((m) => [m.platform, m.availability]), [["discord", "coming-soon"], ["slack", "coming-soon"]]);
    assert.equal(channels.module.findConnectorManifest("slack", { SAND_CHANNELS_SERVED: "0" }).availability, "coming-soon");
    assert.match(channels.module.findConnectorManifest("slack", {}).connectGuide, /field "botToken"/);
  } finally { await channels.dispose(); }
});

test("the Channels tab's one field carries Slack's two tokens; the store and the manager split them", async () => {
  const { module, dispose } = await load("source/shared/channel-credential.ts", "channel-credential");
  try {
    assert.deepEqual(module.splitChannelCredential("discord", "  MTIz.abc.def "), [["token", "MTIz.abc.def"]]);
    assert.deepEqual(module.splitChannelCredential("slack", "xoxb-bot xapp-app"), [["botToken", "xoxb-bot"], ["token", "xapp-app"]]);
    assert.deepEqual(module.splitChannelCredential("slack", "xapp-app,\nxoxb-bot"), [["token", "xapp-app"], ["botToken", "xoxb-bot"]]);
    assert.deepEqual(module.splitChannelCredential("slack", "xoxb-only"), [["botToken", "xoxb-only"]]);
    assert.deepEqual(module.splitChannelCredential("slack", "unfamiliar"), [["token", "unfamiliar"]]);
    assert.deepEqual(module.splitChannelCredential("slack", "   "), []);
  } finally { await dispose(); }
  const manager = await src("host/extensions/transcript/transcript-manager.ts");
  assert.match(manager, /const fields = splitChannelCredential\(platform, token\);/);
  assert.match(manager, /if \(stored\) this\.channelConfigChanged\?\.\(\);/, "the tab's connect wakes the runtime");
  assert.match(manager, /const removed = this\.sessionStore\.disconnectChannel\(agentId, platform\);\n\s*this\.channelConfigChanged\?\.\(\);/, "and so does its disconnect");
  const session = await src("host/extensions/session/agent-session.ts");
  assert.match(session, /listChannelConfigs\(agentId: string\): Array<\{ platform: string; token: string; label: string; secrets: Record<string, string> \}>/);
  assert.match(session, /writeChannelStatus\(agentId: string, platform: string, status:/);
});

test("the channel store keeps the runtime's status beside the label, never a credential, and the brief reads it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-channel-store-"));
  const { module, dispose } = await load("source/host/extensions/session/channel-store.ts", "channel-store");
  try {
    const store = new module.FileChannelStore(path.join(dir, "channels"));
    assert.equal(store.writeStatus("slack", "connected"), false, "no row, nothing written");
    store.writeMetadata("slack", "");
    assert.deepEqual(store.listConnections(), [{ platform: "slack", label: "Slack", status: "configured", detail: null }]);
    assert.equal(store.writeStatus("slack", "error", "Slack refused the token (invalid_auth). Check it."), true);
    assert.deepEqual(store.listConnections(), [{ platform: "slack", label: "Slack", status: "error", detail: "Slack refused the token (invalid_auth). Check it." }]);
    store.writeMetadata("slack", "Work Slack");
    assert.deepEqual(store.listConnections(), [{ platform: "slack", label: "Work Slack", status: "error", detail: "Slack refused the token (invalid_auth). Check it." }], "a label write keeps the status");
    assert.equal(store.writeStatus("slack", "connected", null), true);
    assert.deepEqual(JSON.parse(await readFile(store.configPath("slack"), "utf8")), { label: "Work Slack", status: "connected" });
    assert.doesNotMatch(await readFile(store.configPath("slack"), "utf8"), /xoxb|xapp|token/i);
  } finally { await dispose(); await rm(dir, { recursive: true, force: true }); }
  const messaging = await load("source/shared/channel-messaging.ts", "channel-messaging");
  try {
    const prompt = messaging.module.renderChannelsSystemPrompt(messaging.module.CONNECTOR_MANIFESTS ?? (await load("source/shared/channels.ts", "m2")).module.CONNECTOR_MANIFESTS, [{ platform: "slack", label: "Work Slack", status: "error", detail: "Slack refused the token (invalid_auth)." }], "/home/box/sand-data/agents/a1/channels");
    assert.match(prompt, /- Slack "Work Slack" \[error\] \(Slack refused the token \(invalid_auth\)\.\)\. Address people on it as slack:<chat id>/);
    assert.match(prompt, /- Discord: Message in Discord servers and DMs through a bot the user owns\./);
    assert.match(prompt, /Two tokens are needed/);
    assert.doesNotMatch(prompt, /Coming soon \(not connectable yet\)/);
  } finally { await messaging.dispose(); }
});

test("the extension is in the host's table, the brief and the SendMessage tool offer channels, the secret ack says the connector links", async () => {
  const ids = await src("host/extensions/extension-ids.generated.ts");
  assert.match(ids, /Channels: "channels"/);
  const registry = await src("host/extensions/registry.ts");
  assert.match(registry, /HostExtensions\.Channels\]/);
  const production = await src("host/host-production-extensions.ts");
  assert.match(production, /\[HostExtensions\.Channels\]: bind\(channelsExtension\)/);
  const extension = await src("host/extensions/channels/extension.ts");
  assert.match(extension, /dependencies: \[HostExtensions\.Transcript\]/);
  const connector = await src("electron-main/box/local-docker-host-connector.ts");
  assert.match(connector, /"SAND_CHANNELS_SERVED"\] as const/, "the Mac forwards the switch into the box");
  const schema = await load("source/host/runner/tools/send-message-schema.ts", "send-message-schema-channels");
  try {
    assert.match(schema.module.describeSendMessageTypes({}), /secret-request to ask the user for a credential/);
    assert.doesNotMatch(schema.module.describeSendMessageTypes({}), /messaging channels are coming soon/);
    assert.deepEqual(schema.module.refineSendMessage({ type: "secret-request", secret: { label: "Slack app token", connector: "slack", field: "token" } }, {}), []);
    const parsed = schema.module.sendMessageParameters.safeParse({ type: "text", content: "Hi", channel: "slack:C1" });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.channel, "slack:C1", "a channel the model set is kept");
  } finally { await schema.dispose(); }
  const ack = await load("source/host/runner/tools/sand-secret-request.ts", "secret-ack");
  try {
    assert.match(ack.module.buildSecretProvidedAck({ label: "Slack app token", target: { kind: "channel-credential" } }, {}), /links within a few seconds/);
    assert.match(ack.module.buildSecretProvidedAck({ label: "Slack app token", target: { kind: "channel-credential" } }, { SAND_CHANNELS_SERVED: "0" }), /messaging channels are coming soon in Simeon/);
  } finally { await ack.dispose(); }
});

/**
 * The person's iPhone hears what the Mac hears (8 October 2026, the founder:
 * "i want the app ready. mobile ios... plus other stuff, like notification
 * etc."). The host in the box runs the Mac's decision over the agents list
 * and posts each notification to `POST /desktop/push`
 * (`host/extensions/notifications/`, `server/simeon/desktop/push.py`).
 *
 * Offline, this holds:
 * - each transition is one POST, with the Mac's title and body, the agent id
 *   and the kind, the box's bearer, at `/desktop/push` on the backend;
 * - the baseline (the agents as the host found them) never fires, nor does an
 *   agent with notifications off or a hidden one;
 * - the same agent's same news at most once in 30 s;
 * - a server that fails, refuses, hangs or cannot be reached is one log line
 *   and never a throw;
 * - only the host in the person's computer (`SAND_HOST_IN_BOX=1`) pushes.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const push = await loadModule("source/host/extensions/notifications/mobile-push-notifier.ts", "phone-push");
const { notificationsExtension } = await loadModule("source/host/extensions/notifications/extension.ts", "phone-push-extension");

const settle = async () => { for (let index = 0; index < 10; index++) await new Promise((resolve) => setImmediate(resolve)); };

function agent(overrides = {}) {
  return { id: "a1", name: "Ada", isRunning: false, awaitingUserResponse: null, notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false, lastMessageId: "m0", lastMessagePreview: null, ...overrides };
}

function recordingFetch(answer = () => new Response(JSON.stringify({ queued: 1 }), { status: 202 })) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return answer(url, init); };
  return { calls, fetchImpl };
}

async function withEnv(env, run) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return await run(); }
  finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

function startExtension() {
  const listeners = new Set();
  const stops = [];
  const tokens = [];
  const api = notificationsExtension.start({
    deps: { auth: { getAccessToken: async (options) => { tokens.push(options.backendUrl); return "box-token"; } } },
    host: { events: { subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } } },
    onStop: (teardown) => stops.push(teardown)
  });
  return { api, listeners, tokens, emit: (event) => { for (const listener of listeners) listener(event); }, stop: () => { for (const teardown of stops) teardown(); } };
}

test("each transition is one POST to /desktop/push with the Mac's words, the agent and the kind", async () => {
  const realFetch = globalThis.fetch;
  const realInfo = console.info;
  const { calls, fetchImpl } = recordingFetch();
  const lines = [];
  globalThis.fetch = fetchImpl;
  console.info = (line) => lines.push(line);
  try {
    await withEnv({ SAND_HOST_IN_BOX: "1", SAND_BACKEND_URL: "https://api.simeonlabs.test/", SIMEON_API_BASE_URL: undefined }, async () => {
      const host = startExtension();
      assert.equal(host.listeners.size, 1);
      host.emit({ kind: "notification-baseline", agents: [agent({ isRunning: true }), agent({ id: "b2", name: "Bo", isRunning: true, lastMessageId: "n0" })] });
      host.emit({ kind: "notification-agents", event: { agents: [agent({ lastMessageId: "m1", lastMessagePreview: "Booked the 9:40\nto Lisbon." }), agent({ id: "b2", name: "Bo", isRunning: true, lastMessageId: "n0" })] }, presence: { windowFocusedAtMs: Date.now() } });
      host.emit({ kind: "notification-agent-upserted", event: { agent: agent({ id: "b2", name: "Bo", isRunning: false, lastMessageId: "n0", awaitingUserResponse: { reason: "Which card should I use?" } }) }, presence: {} });
      await settle();

      assert.equal(calls.length, 2);
      assert.deepEqual(calls.map((call) => call.body), [
        { agent_id: "a1", kind: "agent-done", title: "Ada", body: "Booked the 9:40 to Lisbon." },
        { agent_id: "b2", kind: "agent-needs-input", title: "Bo needs you", body: "Which card should I use?" }
      ]);
      for (const call of calls) {
        assert.equal(call.url, "https://api.simeonlabs.test/desktop/push");
        assert.equal(call.init.method, "POST");
        assert.equal(call.init.headers.authorization, "Bearer box-token");
        assert.equal(call.init.headers["content-type"], "application/json");
        assert.ok(call.init.signal instanceof AbortSignal, "every post has a deadline");
      }
      assert.deepEqual(host.tokens, ["https://api.simeonlabs.test/", "https://api.simeonlabs.test/"]);
      assert.deepEqual(lines, [
        '[simeon] phone push posted agent=a1 kind=agent-done status=202 {"queued":1}',
        '[simeon] phone push posted agent=b2 kind=agent-needs-input status=202 {"queued":1}'
      ]);

      // A deleted agent is forgotten; stopping unsubscribes.
      host.emit({ kind: "notification-agent-forgotten", agentId: "a1" });
      host.stop();
      assert.equal(host.listeners.size, 0);
    });
  } finally {
    globalThis.fetch = realFetch;
    console.info = realInfo;
  }
});

test("only the host in the person's computer pushes", async () => {
  for (const value of [undefined, "0", "true"]) {
    await withEnv({ SAND_HOST_IN_BOX: value }, () => {
      const host = startExtension();
      assert.deepEqual(host.api, {});
      assert.equal(host.listeners.size, 0, String(value));
    });
  }
  assert.equal(push.isSandPhonePushEnabled({ SAND_HOST_IN_BOX: "1" }), true);
  assert.equal(push.isSandPhonePushEnabled({}), false);
});

test("the baseline never fires, nor an agent with notifications off or a hidden one", async () => {
  const sent = [];
  const notifier = new push.SandMobilePushNotifier({ send: async (body) => { sent.push(body); } });
  // The host restarts with one agent already done and one already waiting.
  const waiting = agent({ id: "w", name: "Wren", awaitingUserResponse: { reason: "Approve?" } });
  notifier.seedBaseline([agent({ lastMessageId: "m9", lastMessagePreview: "Old news" }), waiting]);
  notifier.handleAgentsEvent({ agents: [agent({ lastMessageId: "m9", lastMessagePreview: "Old news" }), waiting] });
  notifier.handleAgentUpsertedEvent({ agent: waiting });
  // A new agent's first sighting is its baseline too.
  notifier.handleAgentUpsertedEvent({ agent: agent({ id: "new", awaitingUserResponse: { reason: "Hello?" } }) });
  // Notifications off, and hidden, finish a turn.
  notifier.seedBaseline([agent({ id: "off", isRunning: true, notifyOnUpdatesEnabled: false }), agent({ id: "hid", isRunning: true, isHiddenFromSidebar: true })]);
  notifier.handleAgentUpsertedEvent({ agent: agent({ id: "off", notifyOnUpdatesEnabled: false, lastMessageId: "x1" }) });
  notifier.handleAgentUpsertedEvent({ agent: agent({ id: "hid", isHiddenFromSidebar: true, lastMessageId: "x2" }) });
  await settle();
  assert.deepEqual(sent, []);
});

test("an upsert before the baseline waits for it", async () => {
  const sent = [];
  const notifier = new push.SandMobilePushNotifier({ send: async (body) => { sent.push(body); } });
  notifier.handleAgentUpsertedEvent({ agent: agent({ isRunning: true }) });
  notifier.seedBaseline([agent({ isRunning: true })]);
  notifier.handleAgentUpsertedEvent({ agent: agent({ lastMessageId: "m1", lastMessagePreview: "Done." }) });
  await settle();
  assert.deepEqual(sent, [{ agent_id: "a1", kind: "agent-done", title: "Ada", body: "Done." }]);
});

test("the same agent's same news at most once in 30 seconds", async () => {
  let now = 1_000_000;
  const sent = [];
  const notifier = new push.SandMobilePushNotifier({ send: async (body) => { sent.push(body); }, now: () => now });
  notifier.seedBaseline([agent({ isRunning: true }), agent({ id: "b2", name: "Bo", isRunning: true })]);
  const finish = (id, messageId) => {
    notifier.handleAgentUpsertedEvent({ agent: agent({ id, isRunning: true, lastMessageId: `${messageId}-run` }) });
    notifier.handleAgentUpsertedEvent({ agent: agent({ id, isRunning: false, lastMessageId: messageId, lastMessagePreview: messageId }) });
  };
  finish("a1", "m1");
  now += 10_000;
  finish("a1", "m2"); // ten seconds later: dropped
  finish("b2", "n1"); // another agent: its own news
  notifier.handleAgentUpsertedEvent({ agent: agent({ isRunning: false, lastMessageId: "m2", awaitingUserResponse: { reason: "Pick one" } }) }); // another kind
  now += push.SAND_PHONE_PUSH_THROTTLE_MS;
  finish("a1", "m3");
  await settle();
  assert.deepEqual(sent.map((body) => `${body.agent_id}:${body.kind}:${body.body}`), ["a1:agent-done:m1", "b2:agent-done:n1", "a1:agent-needs-input:Pick one", "a1:agent-done:m3"]);
});

test("a failing, refusing, hanging or unreachable server is one log line, never a throw", async () => {
  const lines = [];
  const body = { agent_id: "a1", kind: "agent-done", title: "Ada", body: "Done." };
  const sender = (fetchImpl, extra = {}) => push.createSandMobilePushSender({ getBackendUrl: () => "https://api.simeonlabs.test", getAccessToken: async () => "t", fetchImpl, log: (line) => lines.push(line), ...extra });

  await sender(async () => { throw new TypeError("fetch failed"); })(body);
  await sender(async () => new Response("boom", { status: 500 }))(body);
  await sender(async () => new Response(JSON.stringify({ detail: "nope" }), { status: 401 }))(body);
  // A server that never answers. (`AbortSignal.timeout`'s timer does not hold the event loop open, so this does.)
  await sender((url, init) => new Promise((resolve, reject) => {
    const holdOpen = setTimeout(() => {}, 5_000);
    init.signal.addEventListener("abort", () => { clearTimeout(holdOpen); reject(init.signal.reason); });
  }), { timeoutMs: 20 })(body);
  await sender(async () => new Response("{}"), { getAccessToken: async () => { throw new Error("Waiting for a model credential."); } })(body);
  await sender(async () => new Response(JSON.stringify({ sent: 0 }), { status: 200 }))(body);

  assert.equal(lines.length, 6);
  assert.match(lines[0], /^\[simeon\] phone push failed agent=a1 kind=agent-done error=TypeError: fetch failed$/);
  assert.match(lines[1], /^\[simeon\] phone push failed agent=a1 kind=agent-done status=500 boom$/);
  assert.match(lines[2], /^\[simeon\] phone push failed agent=a1 kind=agent-done status=401 /);
  assert.match(lines[3], /^\[simeon\] phone push failed agent=a1 kind=agent-done error=TimeoutError/);
  assert.match(lines[4], /^\[simeon\] phone push failed agent=a1 kind=agent-done error=Error: Waiting for a model credential\.$/);
  assert.equal(lines[5], '[simeon] phone push posted agent=a1 kind=agent-done status=200 {"sent":0}');

  // A send that rejects outright is swallowed too: the turn that raised the event goes on.
  const notifier = new push.SandMobilePushNotifier({ send: async () => { throw new Error("boom"); } });
  notifier.seedBaseline([agent({ isRunning: true })]);
  assert.doesNotThrow(() => notifier.handleAgentsEvent({ agents: [agent({ lastMessageId: "m1" })] }));
  await settle();
});

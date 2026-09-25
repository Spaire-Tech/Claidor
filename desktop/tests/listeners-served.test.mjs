/**
 * Event listeners, served (25 September 2026): the app's own relay
 * client, fire consumer and connect reads, run offline against an
 * in-process HTTP server that answers the shapes Simeon Labs' server
 * answers (`server/polar/sand/listeners_relay.py`; the fixtures below are
 * shared by hand with `server/tests/sand/test_listeners.py`).
 *
 * `listeners-coming-soon.test.mjs` measures the `SAND_LISTENER_RELAY_SERVED=0`
 * path; this file measures the default.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** A manual polling policy: the test drives every tick. */
function manualPolling() {
  const ticks = [];
  return { policy: { name: "manual", start(tick) { ticks.push(tick); return { dispose() { ticks.splice(ticks.indexOf(tick), 1); } }; } }, tick: async () => { for (const tick of [...ticks]) await tick(); }, count: () => ticks.length };
}

// The server's answers, the bodies `polar/sand/listeners_relay.py` writes.
const SUBSCRIPTIONS_ANSWER = {
  slack: { status: "ok", teams: [{ teamId: "T123", teamName: "Simeon Labs", channels: [{ input: "#eng", channelId: "C_ENG", isBotMember: true }, { input: "#ops", channelId: "C_OPS", isBotMember: false }], unresolvedChannels: ["#nowhere"] }], unresolvedChannels: ["#nowhere"] },
  github: { status: "ok", repos: [{ repo: "simeon-labs/app", isSubscribed: true }, { repo: "simeon-labs/other", isSubscribed: false, detail: "Give Simeon's GitHub App access to simeon-labs/other (GitHub → Settings → Applications → Simeon → Repository access)." }] },
};
const SLACK_WIRE_EVENT = { id: "6d9b1c2e-0d1e-4c1a-9f2a-000000000001", source: "slack", kind: "message", channelName: "#eng", channelId: "C_ENG", senderSlackUserId: "U_ALICE", text: "<@U_BOT> ship it", isMention: true, isSelf: false, ts: "1.0", threadTs: "0.9", timestampMs: 1_790_000_000_000 };
const GITHUB_WIRE_EVENT = { id: "6d9b1c2e-0d1e-4c1a-9f2a-000000000002", source: "github", repo: "simeon-labs/app", kind: "pr-opened", title: "Add listeners", actor: "alice", url: "https://github.com/simeon-labs/app/pull/7", detail: "#7", prOwner: "alice", branch: "feature", timestampMs: 1_790_000_000_000 };
const FIRE = { id: "f68f38c6-07df-4039-a7d1-63ed0147bfce", sandAgentId: "agent-1", automationId: "auto-1", timestampMs: 1_790_000_000_000, definitionRevision: "abc123", event: { source: "slack", channel: "#eng", channelId: "C_ENG", sender: "@U_ALICE", text: "<@U_BOT> ship it", isMention: true, ts: "1.0", threadTs: "0.9", timestampMs: 1_790_000_000_000 } };

function startRelayServer(state) {
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      state.calls.push({ path: request.url, body, authorization: request.headers.authorization });
      const answer = (status, payload) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(payload)); };
      if (request.headers.authorization !== "Bearer box-token") return answer(401, { code: 40100, message: "Sign in to the app first." });
      switch (request.url) {
        case "/sand/listener-subscriptions": return answer(200, SUBSCRIPTIONS_ANSWER);
        case "/sand/listener-events/poll": {
          for (const id of body.ackIds ?? []) state.relay = state.relay.filter((event) => event.id !== id);
          return answer(200, { events: state.relay });
        }
        case "/sand/automation-events/poll": {
          for (const id of body.ackRunUuids ?? []) state.fires = state.fires.filter((fire) => fire.id !== id || fire.status !== "completed");
          return answer(200, { events: state.fires.map(({ status, ...fire }) => fire), nextPollAfterMs: 15000 });
        }
        case "/sand/automation-runs/complete": {
          const fire = state.fires.find((candidate) => candidate.id === body.runUuid);
          if (fire == null) return answer(404, { error: "no such run" });
          fire.status = "completed";
          state.completions.push(body);
          return answer(200, {});
        }
        default: return answer(404, { error: "unknown" });
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) })));
}

test("the relay client registers what it listens for, reads the statuses, and acks each event it delivered", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const state = { calls: [], relay: [SLACK_WIRE_EVENT, GITHUB_WIRE_EVENT], fires: [], completions: [] };
  const server = await startRelayServer(state);
  const { module, dispose } = await load("source/host/extensions/automations/backend-relay-source.ts", "relay-source");
  try {
    const polling = manualPolling();
    const relay = module.createBackendRelaySources({ getAccessToken: async () => "box-token", getBackendUrl: () => server.url, polling: polling.policy, isNotifyConnected: () => false, isNotifySafetyPollEnabled: () => true });
    const slackEvents = [], githubEvents = [];
    relay.slack.setListeners([{ type: "slack", channel: "#eng", match: { kind: "mention" } }, { type: "slack", channel: "#ops", match: { kind: "message" } }, { type: "slack", channel: "#nowhere", match: { kind: "message" } }]);
    relay.github.setListeners([{ type: "github", repo: "simeon-labs/app", events: ["pr-opened"] }, { type: "github", repo: "simeon-labs/other", events: ["pr-merged"] }]);
    await relay.slack.start((event) => { slackEvents.push(event); return true; });
    await relay.github.start((event) => { githubEvents.push(event); return true; });
    assert.equal(polling.count(), 1, "one poll loop for both sources");
    await polling.tick();
    const registration = state.calls.find((call) => call.path === "/sand/listener-subscriptions");
    assert.deepEqual(registration.body, { slackChannels: ["#eng", "#nowhere", "#ops"], githubRepos: ["simeon-labs/app", "simeon-labs/other"], githubKinds: ["pr-merged", "pr-opened"] });
    assert.equal(registration.authorization, "Bearer box-token");
    assert.equal(relay.slack.getStatus().state, "listening");
    assert.match(relay.slack.getStatus().detail, /Invite @Simeon to #ops in Slack/);
    assert.match(relay.slack.getStatus().detail, /Couldn't find #nowhere/);
    assert.equal(relay.github.getStatus().state, "listening");
    assert.match(relay.github.getStatus().detail, /Give Simeon's GitHub App access to simeon-labs\/other/);
    assert.deepEqual(slackEvents, [{ source: "slack", channel: "#eng", sender: "@U_ALICE", text: "<@U_BOT> ship it", isMention: true, ts: "1.0", threadTs: "0.9", timestampMs: 1_790_000_000_000 }]);
    assert.deepEqual(githubEvents, [{ source: "github", repo: "simeon-labs/app", kind: "pr-opened", title: "Add listeners", actor: "alice", url: "https://github.com/simeon-labs/app/pull/7", detail: "#7", prOwner: "alice", branch: "feature", timestampMs: 1_790_000_000_000 }]);
    await polling.tick();
    const polls = state.calls.filter((call) => call.path === "/sand/listener-events/poll");
    assert.deepEqual(polls[0].body, { ackIds: [] });
    assert.deepEqual(polls[1].body, { ackIds: [SLACK_WIRE_EVENT.id, GITHUB_WIRE_EVENT.id] }, "the second poll acks both");
    assert.deepEqual(state.relay, [], "the server dropped the acked events");
    assert.equal(slackEvents.length + githubEvents.length, 2, "nothing was delivered twice");
    await relay.slack.stop();
    await relay.github.stop();
    assert.equal(polling.count(), 0);
  } finally {
    await server.close();
    await dispose();
  }
});

test("the fire consumer polls a fire, runs it for its event, completes it and acks the completion", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const state = { calls: [], relay: [], fires: [{ ...FIRE, status: "pending" }], completions: [] };
  const server = await startRelayServer(state);
  const { module, dispose } = await load("source/host/extensions/automations/sand-automation-fire-consumer.ts", "fire-consumer");
  const sync = await load("source/host/extensions/automations/sand-automation-cloud-sync.ts", "cloud-sync-hash");
  try {
    const automation = { id: "local-1", name: "Mentions", prompt: "Answer the mention.", isEnabled: true, trigger: { type: "slack", channel: "#eng", match: { kind: "mention" } }, runs: [] };
    const definition = sync.module.sandCloudDefinition({ agentId: "agent-1", automation });
    state.fires[0].automationId = definition.automationId;
    state.fires[0].definitionRevision = definition.hash;
    const fired = [];
    const consumer = new module.SandAutomationFireConsumer({
      getAccessToken: async () => "box-token", getBackendUrl: () => server.url, getTimeZone: () => undefined, getBoxUptimeMs: () => 1000, isReady: () => true,
      listAutomations: async () => [{ agentId: "agent-1", automation }],
      fire: async () => { throw new Error("a cron fire was not expected"); },
      fireForEvent: async (args) => { fired.push(args); return "ok"; },
      isNotifyConnected: () => false, isNotifySafetyPollEnabled: () => true,
    });
    consumer.start();
    await consumer.tick();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(fired.length, 1);
    assert.equal(fired[0].runUuid, FIRE.id);
    assert.deepEqual(fired[0].event, { source: "slack", channel: "#eng", sender: "@U_ALICE", text: "<@U_BOT> ship it", isMention: true, ts: "1.0", threadTs: "0.9", timestampMs: 1_790_000_000_000 });
    assert.deepEqual(state.completions, [{ runUuid: FIRE.id, status: "succeeded" }]);
    await consumer.tick();
    const polls = state.calls.filter((call) => call.path === "/sand/automation-events/poll");
    assert.deepEqual(polls.at(-1).body, { ackRunUuids: [FIRE.id] }, "the completion is acked on the next poll");
    assert.deepEqual(state.fires, [], "the server retired the acked fire");
  } finally {
    await server.close();
    await dispose();
    await sync.dispose();
  }
});

test("a fire whose definition revision is stale is refused, not run", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const state = { calls: [], relay: [], fires: [{ ...FIRE, status: "pending", definitionRevision: "stale" }], completions: [] };
  const server = await startRelayServer(state);
  const { module, dispose } = await load("source/host/extensions/automations/sand-automation-fire-consumer.ts", "fire-consumer-stale");
  const sync = await load("source/host/extensions/automations/sand-automation-cloud-sync.ts", "cloud-sync-hash-stale");
  try {
    const automation = { id: "local-1", name: "Mentions", prompt: "x", isEnabled: true, trigger: { type: "slack", channel: "#eng", match: { kind: "mention" } }, runs: [] };
    state.fires[0].automationId = sync.module.sandCloudDefinition({ agentId: "agent-1", automation }).automationId;
    const dropped = [];
    const consumer = new module.SandAutomationFireConsumer({
      getAccessToken: async () => "box-token", getBackendUrl: () => server.url, getTimeZone: () => undefined, getBoxUptimeMs: () => 0, isReady: () => true,
      listAutomations: async () => [{ agentId: "agent-1", automation }],
      fire: async () => "ok", fireForEvent: async () => { throw new Error("must not run"); },
      telemetry: { reportAutomationFireDropped: (value) => dropped.push(value), reportAgentError: () => {} },
    });
    consumer.start();
    await consumer.tick();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(dropped[0].reason, "definition_changed");
    assert.deepEqual(state.completions, [{ runUuid: FIRE.id, status: "failed", errorMessage: "Automation definition changed on the Sand box" }]);
  } finally {
    await server.close();
    await dispose();
    await sync.dispose();
  }
});

test("connect opens the install pages on Simeon Labs' server, and the reads take the served answers", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const { module, dispose } = await load("source/host/extensions/automations/listener-integrations.ts", "listener-reads-served");
  try {
    const lines = [];
    const dashboard = { getSlackUserSettings: async () => ({ hasSlackAuth: true, canShow: true }), getScmConnectionStatus: async () => ({ connected: false }), getSlackInstallUrl: async () => ({ url: "https://api.simeonlabs.com/sand/slack/install" }) };
    const reads = module.createListenerIntegrationReads({ dashboard: () => dashboard, getBackendUrl: () => "https://api.simeonlabs.com", transcript: { listAllAutomationDefinitions: async () => [], getAgentChannels: async () => [] }, sourceStatuses: () => new Map(), log: (line) => lines.push(line) });
    assert.equal(await reads.getConnectUrl("slack"), "https://api.simeonlabs.com/sand/slack/install");
    assert.equal(await reads.getConnectUrl("github"), "https://api.simeonlabs.com/sand/github/install");
    assert.equal(await reads.isPlatformConnected("slack"), true);
    assert.equal(await reads.isPlatformConnected("github"), false);
    const integrations = (await reads.getIntegrations()).integrations;
    assert.deepEqual(integrations.map(({ platform, isConnected }) => ({ platform, isConnected })), [{ platform: "slack", isConnected: true }, { platform: "github", isConnected: false }]);
    assert.match(lines.join("\n"), /slack connect opens https:\/\/api\.simeonlabs\.com\/sand\/slack\/install/);
    const failing = module.createListenerIntegrationReads({ dashboard: () => ({ ...dashboard, getSlackInstallUrl: async () => { throw new Error("unavailable"); } }), getBackendUrl: () => "https://api.simeonlabs.com", transcript: { listAllAutomationDefinitions: async () => [], getAgentChannels: async () => [] }, sourceStatuses: () => new Map(), log: () => {} });
    assert.equal(await failing.getConnectUrl("slack"), "https://api.simeonlabs.com/sand/slack/install", "the install page on our host is the fallback");
    assert.equal(module.listenerConnectUrl("github", undefined), null);
  } finally {
    await dispose();
  }
});

test("the brief's served listener text names Simeon's Slack app and @Simeon, never Cursor", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const { module, dispose } = await load("source/host/automations/automation.ts", "automation-prompt-served");
  try {
    const prompt = module.renderAutomationsSystemPrompt([], "/home/box/agent-data/automations", "Africa/Dakar");
    assert.match(prompt, /Trigger shapes/);
    assert.match(prompt, /Simeon's Slack app is actually in/);
    assert.match(prompt, /invite @Simeon to that exact channel in Slack \(type \/invite @Simeon in the channel\)/);
    assert.ok(!/@Cursor|Cursor Slack app|Claidor account|cursor\.com/.test(prompt), "no Cursor word reaches the agent");
    assert.ok(!prompt.includes("coming soon"));
  } finally {
    await dispose();
  }
});

test("the extension wires the backend URL into the connect reads, the notify bus gate is on, and the relay switch defaults to served", async () => {
  const extension = await src("host/extensions/automations/extension.ts");
  assert.match(extension, /createListenerIntegrationReads\(\{[^\n]*getBackendUrl: \(\) => getConfiguredBackendUrl\(\)/);
  const gates = await src("shared/node/experiments/simeon-gate-defaults.ts");
  assert.match(gates, /sand_notify_bus: true/);
  const { module, dispose } = await load("source/shared/listener-availability.ts", "listener-availability");
  try {
    assert.equal(module.isListenerRelayServed({}), true);
    assert.equal(module.isListenerRelayServed({ SAND_LISTENER_RELAY_SERVED: "0" }), false);
    assert.equal(module.isListenerRelayServed({ SAND_LISTENER_RELAY_SERVED: "1" }), true);
  } finally {
    await dispose();
  }
});

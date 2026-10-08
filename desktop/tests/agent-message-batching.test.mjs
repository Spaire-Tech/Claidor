/**
 * Agent messages that arrive together wake their agent once (8 October 2026).
 * The founder's staffing log: the Chief of Staff, at 161k tokens a call, took
 * a separate turn for each teammate's reply, as the upstream app did.
 *
 * Offline, this holds:
 * - queued messages are run as one turn, a priority message and a new
 *   agent's staffing brief keeping a turn of their own;
 * - the one-turn prompt names every sender and carries every message;
 * - a reply in a back-and-forth (hop 2 and on) waits for the others before
 *   it wakes, while a message from a turn the person started, and a priority
 *   message, wake at once.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function bundle(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const messaging = await bundle("source/host/extensions/transcript/agent-to-agent-messaging.ts", "agent-batching");
const prompts = await bundle("source/host/agents/agent-messaging.ts", "agent-batching-prompts");

const maya = { from: { id: "maya", name: "Maya" }, text: "I need Bass to ask me directly.", timestampMs: 1 };
const nina = { from: { id: "nina", name: "Nina" }, text: "I can set my avatar once Bass asks.", timestampMs: 2 };
const leo = { from: { id: "leo", name: "Leo" }, text: "Avatar set.", timestampMs: 3 };

test("queued messages run as one turn; a priority message and a staffing brief keep their own", () => {
  const { groupAgentInboundTurns } = messaging.module;
  assert.deepEqual(groupAgentInboundTurns([maya, nina, leo], false), [[maya, nina, leo]]);
  assert.deepEqual(groupAgentInboundTurns([maya, nina, leo], true), [[maya], [nina, leo]]);
  const urgent = { ...leo, priority: true };
  assert.deepEqual(groupAgentInboundTurns([urgent, maya, nina], false), [[urgent], [maya, nina]]);
  assert.deepEqual(groupAgentInboundTurns([], false), []);
});

test("the one-turn prompt names every sender and carries every message", () => {
  const prompt = prompts.module.buildAgentInboundBatchWakePrompt([maya, nina, { ...maya, text: "Please have him send it here." }]);
  assert.match(prompt, /^\[agent\] 3 messages just arrived from your user's other agents: Maya \(id: maya\), Nina \(id: nina\)\./);
  assert.match(prompt, /not the user typing here/);
  assert.match(prompt, /Maya: I need Bass to ask me directly\./);
  assert.match(prompt, /Nina: I can set my avatar once Bass asks\./);
  assert.match(prompt, /Maya: Please have him send it here\./);
  assert.match(prompt, /no need to reply just to acknowledge it/);
  // A single message keeps the prompt it always had.
  assert.match(prompts.module.buildAgentInboundWakePrompt(maya), /^\[agent\] A message just arrived from another of your user's agents: Maya \(id: maya\)\./);
});

function wakeHarness({ introductionPending = false } = {}) {
  const runs = [];
  let pending = introductionPending;
  const session = {
    id: "coo",
    db: {
      getIntroductionPending: () => pending,
      setIntroductionPending: (value) => { pending = value; },
    },
  };
  const tm = {
    execution: { canExecute: true },
    sessions: { resolveBackgroundSession: async () => session, isAgentGone: () => false },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    runnerRegistry: { getRunner: () => ({ run: async (prompt, options) => { runs.push({ prompt, options }); return { aborted: false }; } }) },
    runLifecycle: { beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => run() },
    turnRuntime: { activeRequestPrompts: new Map(), activeRequestSources: new Map() },
    backgroundWakes: { dmPreemptedWakeAgentIds: new Set() },
    roster: { emitAgentUpdate: async () => {} },
    requestContextUserFullName: () => "Bass F",
  };
  const instance = new messaging.module.AgentToAgentMessaging(tm);
  instance.appendAgentInboundEntries = () => {};
  return { instance, runs };
}

test("three replies queued together wake the agent for one turn", async () => {
  const { instance, runs } = wakeHarness();
  await instance.runAgentInboundWake("coo", [maya, nina, leo]);
  assert.equal(runs.length, 1);
  assert.match(runs[0].prompt, /3 messages just arrived/);
  assert.equal(runs[0].options.callReason, "agent_wake");
  assert.equal(runs[0].options.hidden, true);
});

test("a new agent's brief still runs first and alone, the rest after it in one turn", async () => {
  const { instance, runs } = wakeHarness({ introductionPending: true });
  await instance.runAgentInboundWake("coo", [maya, nina, leo]);
  assert.equal(runs.length, 2);
  assert.match(runs[0].prompt, /^\[first run\] You were just created/);
  assert.match(runs[0].prompt, /A message just arrived from another of your user's agents: Maya/);
  assert.match(runs[1].prompt, /2 messages just arrived from your user's other agents: Nina \(id: nina\), Leo \(id: leo\)/);
});

function sendHarness() {
  const tm = {
    sessions: { isAgentGone: () => false, liveSessions: new Map() },
    groupChat: { isRemoteRoomAgentId: () => false },
    sessionStore: { listAgents: async () => [{ id: "coo", name: "Simeon" }, { id: "maya", name: "Maya" }, { id: "nina", name: "Nina" }] },
    productAnalytics: { trackEvent() {} },
    execution: { canExecute: false },
    // A priority message steers a running recipient; nothing runs here.
    runLifecycle: { runScheduler: null },
  };
  const instance = new messaging.module.AgentToAgentMessaging(tm);
  instance.appendAgentOutboundEntry = () => {};
  const revived = [];
  instance.reviveForAgentInbound = async (id) => { revived.push(id); };
  return { instance, revived };
}

test("replies in a back-and-forth wait and wake once; a message from the person's turn and a priority one wake at once", async () => {
  assert.equal(messaging.module.AGENT_REPLY_SETTLE_MS, 15_000);
  const { instance, revived } = sendHarness();
  instance.agentReplySettleMs = 30;
  // From a turn the person started (hop 1): at once.
  await instance.sendToAgent("coo", "maya", "Please set a blue avatar.");
  assert.deepEqual(revived, ["maya"]);
  revived.length = 0;
  // Maya's and Nina's replies, each sent from a turn a message woke (hop 2).
  instance.agentWakeHops.set("maya", 1);
  instance.agentWakeHops.set("nina", 1);
  await instance.sendToAgent("maya", "coo", "Bass needs to ask me directly.");
  await instance.sendToAgent("nina", "coo", "Same for me.");
  assert.deepEqual(revived, [], "replies wait for each other");
  assert.equal(instance.pendingAgentInbound.get("coo").length, 2);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(revived, ["coo"], "one wake for both");
  // A priority reply does not wait.
  revived.length = 0;
  await instance.sendToAgent("maya", "coo", "Stop: Bass changed his mind.", [], true);
  assert.deepEqual(revived, ["coo"]);
});

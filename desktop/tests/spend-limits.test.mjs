/**
 * Hard limits on the work nobody asked for (2 October 2026).
 *
 * - A routine's run is held to SAND_ROUTINE_MAX_STEPS (200) model calls, not
 *   the asked turn's 5,000.
 * - Agents may pass SAND_AGENT_MESSAGE_MAX_HOPS (6) messages in a row, each
 *   waking the next; the seventh is refused and the agent is told to bring
 *   the person in. A message sent from a turn nobody's message woke starts
 *   again at 1.
 * - A routine runs at most once every 15 minutes on the Mac, whatever its
 *   schedule (the server holds the same gap: tests/sand/test_listeners.py).
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

test("a routine run gets 200 calls; the first message keeps 5,000; a nudge keeps 40", async () => {
  const loaded = await bundle("source/host/extensions/inference/provider-session.ts", "budget");
  try {
    const { createModelCallBudget, spendModelCall } = loaded.module;
    const env = {};
    const routine = createModelCallBudget({ hidden: true, fullStepBudget: true, callReason: "routine" }, env);
    assert.equal(routine.limit, 200);
    assert.equal(createModelCallBudget({ hidden: true, fullStepBudget: true, callReason: "first_message" }, env).limit, 5000);
    assert.equal(createModelCallBudget({ hidden: true, callReason: "nudge" }, env).limit, 40);
    assert.equal(createModelCallBudget({}, env).limit, 5000);
    assert.equal(createModelCallBudget({ hidden: true, fullStepBudget: true, callReason: "routine" }, { SAND_ROUTINE_MAX_STEPS: "50" }).limit, 50);
    assert.throws(() => spendModelCall({ ...routine, used: 200 }), /routine run reached its budget of 200 model calls \(SAND_ROUTINE_MAX_STEPS\)/);
  } finally {
    await loaded.dispose();
  }
});

function messagingHarness(module) {
  const sent = [];
  const tm = {
    sessions: { isAgentGone: () => false, liveSessions: new Map() },
    groupChat: { isRemoteRoomAgentId: () => false },
    sessionStore: { listAgents: async () => [{ id: "coo", name: "Simeon" }, { id: "writer", name: "Ada" }] },
    productAnalytics: { trackEvent: (name) => sent.push(name) },
    execution: { canExecute: false },
  };
  return { messaging: new module.AgentToAgentMessaging(tm), sent };
}

test("agents may pass six messages in a row; the seventh is refused and says to bring the person in", async () => {
  const loaded = await bundle("source/host/extensions/transcript/agent-to-agent-messaging.ts", "hops");
  try {
    const { messaging, sent } = messagingHarness(loaded.module);
    // From a turn the person started: hop 1.
    assert.match(await messaging.sendToAgent("coo", "writer", "Draft the memo."), /^Sent to Ada/);
    assert.equal(messaging.pendingAgentInbound.get("writer").at(-1).hop, 1);
    // From a turn the fifth message woke: the sixth goes.
    messaging.agentWakeHops.set("writer", 5);
    assert.match(await messaging.sendToAgent("writer", "coo", "Here it is."), /^Sent to Simeon/);
    assert.equal(messaging.pendingAgentInbound.get("coo").at(-1).hop, 6);
    // From a turn the sixth woke: refused, nothing queued, nothing counted.
    messaging.agentWakeHops.set("coo", 6);
    const before = sent.length;
    const refusal = await messaging.sendToAgent("coo", "writer", "One more round?");
    assert.match(refusal, /^Not sent: agents have passed 6 messages in a row/);
    assert.match(refusal, /tell them with SendMessage/);
    assert.equal(messaging.pendingAgentInbound.get("writer").length, 1);
    assert.equal(sent.length, before);
    // Once that turn is over, a message from the person's next turn starts again.
    messaging.agentWakeHops.delete("coo");
    assert.match(await messaging.sendToAgent("coo", "writer", "New task."), /^Sent to Ada/);
    assert.equal(messaging.pendingAgentInbound.get("writer").at(-1).hop, 1);
  } finally {
    await loaded.dispose();
  }
});

test("a routine due every minute runs at most once every 15 minutes on the Mac", async () => {
  const loaded = await bundle("source/host/extensions/automations/sand-trigger-hub.ts", "trigger-hub");
  try {
    const { SandTriggerHub, ROUTINE_MIN_INTERVAL_MS } = loaded.module;
    assert.equal(ROUTINE_MIN_INTERVAL_MS, 15 * 60_000);
    const now = Date.now();
    const fired = [];
    const automation = { id: "tick", isEnabled: true, trigger: { type: "cron", schedule: "* * * * *" }, createdAt: now - 3_600_000, lastRunAt: now - 5 * 60_000 };
    const hub = new SandTriggerHub({ polling: { start: () => ({ dispose() {} }) }, sources: [], listAutomations: async () => [{ agentId: "a", automation }], fire: async () => undefined, fireCron: async (agentId, routine) => { fired.push(routine.id); }, isReady: () => true });
    await hub.reconcileNow();
    assert.deepEqual(fired, [], "five minutes after its last run: not yet");
    automation.lastRunAt = now - 16 * 60_000;
    await hub.reconcileNow();
    assert.deepEqual(fired, ["tick"], "sixteen minutes after: it runs");
    await hub.reconcileNow();
    assert.deepEqual(fired, ["tick"], "and not again straight after its local fire");
  } finally {
    await loaded.dispose();
  }
});

test("old tool screenshots leave the wire five at a time, so the history between drops stays the same; the person's pictures stay", async () => {
  const loaded = await bundle("source/host/extensions/inference/provider-session.ts", "screenshots");
  try {
    const { toCoreMessages, SIMEON_KEPT_TOOL_IMAGES, SIMEON_TOOL_IMAGE_DROP_BATCH } = loaded.module;
    assert.equal(SIMEON_KEPT_TOOL_IMAGES, 3);
    assert.equal(SIMEON_TOOL_IMAGE_DROP_BATCH, 5);
    const history = (steps) => {
      const messages = [{ role: "user", content: [{ type: "text", text: "Look at this" }, { type: "image", image: "PERSON", mimeType: "image/png" }] }];
      for (let step = 1; step <= steps; step += 1) {
        messages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: `c${step}`, toolName: "Computer", args: { action: "click" } }] });
        messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: `c${step}`, toolName: "Computer", result: undefined, experimental_content: [{ type: "text", text: `step ${step}` }, { type: "image", data: `SHOT${step}`, mimeType: "image/webp" }] }] });
      }
      return messages;
    };
    const shots = (steps) => toCoreMessages(history(steps)).flatMap((message) => Array.isArray(message.content) ? message.content.filter((part) => part.type === "image").map((part) => part.image) : []);
    assert.deepEqual(shots(7), ["PERSON", "SHOT1", "SHOT2", "SHOT3", "SHOT4", "SHOT5", "SHOT6", "SHOT7"]);
    assert.deepEqual(shots(8), ["PERSON", "SHOT6", "SHOT7", "SHOT8"]);
    assert.deepEqual(shots(12), ["PERSON", "SHOT6", "SHOT7", "SHOT8", "SHOT9", "SHOT10", "SHOT11", "SHOT12"]);
    assert.deepEqual(shots(13), ["PERSON", "SHOT11", "SHOT12", "SHOT13"]);
    // Between two drops, each request starts with the previous one unchanged.
    for (let steps = 8; steps <= 11; steps += 1) {
      const before = JSON.stringify(toCoreMessages(history(steps)));
      const after = JSON.stringify(toCoreMessages(history(steps + 1)));
      assert.ok(after.startsWith(before.slice(0, -1)), `step ${steps + 1} keeps step ${steps}'s history`);
    }
    // The loop's own copy is untouched.
    const loop = history(13);
    toCoreMessages(loop);
    assert.equal(loop[2].content[0].experimental_content[1].data, "SHOT1");
  } finally {
    await loaded.dispose();
  }
});

test("a routine runs unattended at most 24 times in 24 hours", async () => {
  const loaded = await bundle("source/host/extensions/transcript/automation-run-path.ts", "daily-cap");
  try {
    const { takeRoutineRunSlot, ROUTINE_MAX_RUNS_PER_DAY } = loaded.module;
    assert.equal(ROUTINE_MAX_RUNS_PER_DAY, 24);
    const times = [];
    const start = 1_800_000_000_000;
    const quarter = 15 * 60_000;
    let ran = 0;
    for (let slot = 0; slot < 96; slot += 1) if (takeRoutineRunSlot(times, start + slot * quarter, 24)) ran += 1;
    assert.equal(ran, 24, "a 15-minute routine gets its first 24 runs of the day");
    assert.equal(takeRoutineRunSlot(times, start + 24 * 60 * 60_000 - 1, 24), false);
    assert.equal(takeRoutineRunSlot(times, start + 24 * 60 * 60_000, 24), true, "the oldest run turned a day old: one more");
  } finally {
    await loaded.dispose();
  }
});

test("the second answer cut off by the output ceiling ends the turn", async () => {
  const loaded = await bundle("tests/fixtures/prompt-cache-key-entry.ts", "cut-off");
  const previousFetch = globalThis.fetch;
  const previousDataRoot = process.env.SAND_DATA_ROOT;
  const previousBackend = process.env.SAND_BACKEND_URL;
  const lines = [];
  try {
    process.env.SAND_DATA_ROOT = os.tmpdir();
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    const cutOff = () => {
      const events = [
        { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-6-sol" } },
        { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
        { type: "response.output_text.delta", delta: "a very long" },
        { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 7, output_tokens: 32_000 } } },
      ];
      return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    globalThis.fetch = async () => cutOff();
    const { createProviderPromptSession, setSimeonCredentialSource, createContext, setModelCallLog } = loaded.module;
    setSimeonCredentialSource({ getAccessToken: async () => "simeon_da_token" });
    setModelCallLog((line) => lines.push(line));
    const session = createProviderPromptSession("simeon");
    const state = [{ role: "system", content: "You are Simeon." }, { role: "user", content: "write it all" }];
    for (let call = 0; call < 2; call += 1) {
      const result = session.getExecutor(state).stream(createContext(), `inv-${call}`);
      for await (const _ of result.fullStream) { /* drain */ }
      await result.response;
      await result.extendedUsage.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(lines.filter((line) => line.includes("model-output-limit")).length, 2);
    assert.throws(() => session.getExecutor(state).stream(createContext(), "inv-3"), /This turn stopped: 2 answers ran past the 32,000-token limit/);
  } finally {
    globalThis.fetch = previousFetch;
    loaded.module.setModelCallLog(null);
    if (previousDataRoot === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = previousDataRoot;
    if (previousBackend === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previousBackend;
    await loaded.dispose();
  }
});

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

test("the wire keeps the latest three tool screenshots and every picture the person attached", async () => {
  const loaded = await bundle("source/host/extensions/inference/provider-session.ts", "screenshots");
  try {
    const { toCoreMessages, SIMEON_KEPT_TOOL_IMAGES } = loaded.module;
    assert.equal(SIMEON_KEPT_TOOL_IMAGES, 3);
    const messages = [{ role: "user", content: [{ type: "text", text: "Look at this" }, { type: "image", image: "PERSON", mimeType: "image/png" }] }];
    for (let step = 1; step <= 5; step += 1) {
      messages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: `c${step}`, toolName: "Computer", args: { action: "click" } }] });
      messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: `c${step}`, toolName: "Computer", result: undefined, experimental_content: [{ type: "text", text: `step ${step}` }, { type: "image", data: `SHOT${step}`, mimeType: "image/webp" }] }] });
    }
    const wire = toCoreMessages(messages);
    const images = wire.flatMap((message) => Array.isArray(message.content) ? message.content.filter((part) => part.type === "image").map((part) => part.image) : []);
    assert.deepEqual(images, ["PERSON", "SHOT3", "SHOT4", "SHOT5"]);
    const dropped = wire.filter((message) => message.role === "user" && Array.isArray(message.content) && /Not shown again/.test(message.content[0]?.text ?? ""));
    assert.equal(dropped.length, 2);
    // The loop's own copy is untouched.
    assert.equal(messages[2].content[0].experimental_content[1].data, "SHOT1");
  } finally {
    await loaded.dispose();
  }
});

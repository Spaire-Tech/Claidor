import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// 23 September 2026. On a Mac, "hi" to a fresh agent made one model call
// every 3–4 seconds until the proxy's hourly budget refused, every call a
// SendMessage the model wrote correctly, and nothing reached the chat
// (docs/product/handoff-2026-09-23-ai-does-not-answer.md). The earlier
// offline test drove the tool through the executor with a stub in place of
// the InteractionHandler. This one drives the real Agent — the step loop,
// the InteractionHandler, the forwarding listener, the redaction wrapper,
// the turn recorder — built the way a product turn builds it
// (host/runner/turn-agent-composition.ts), in the production runner
// context (whose logger is silent), against a fake Responses server. Two
// things are measured: that a SendMessage lands and the turn ends, and
// what the model and the host log see when delivery throws.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  // The bundle sits inside the tree so the UMD packages it leaves external
  // resolve from node_modules; `/.tmp*/` is ignored by git.
  const bundleDir = path.join(repoRoot, `.tmp-agent-loop-${randomBytes(4).toString("hex")}`);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "caisra-agent-loop-"));
  const output = path.join(bundleDir, "agent-loop.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/claidor-agent-loop-entry.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    external: ["jsonc-parser"],
    banner: { js: 'import { createRequire as __agentLoopRequire } from "node:module"; const require = __agentLoopRequire(import.meta.url);' },
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return {
    module,
    dataDir,
    dispose: async () => {
      await rm(bundleDir, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function sse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function functionCallStream(n, name, args) {
  const item = { type: "function_call", id: `fc_${n}`, call_id: `call_${n}`, name, arguments: "" };
  const text = JSON.stringify(args);
  return sse([
    { type: "response.created", response: { id: `resp_${n}`, created_at: 1_700_000_001, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item },
    ...[text.slice(0, 12), text.slice(12)].map((delta) => ({ type: "response.function_call_arguments.delta", item_id: item.id, output_index: 0, delta })),
    { type: "response.output_item.done", output_index: 0, item: { ...item, arguments: text, status: "completed" } },
    { type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 4 } } },
  ]);
}

function textStream(n, text) {
  return sse([
    { type: "response.created", response: { id: `resp_${n}`, created_at: 1_700_000_000, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: `msg_${n}` } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
}

function withTimeout(promise, label, ms = 20_000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} hung`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const GREETING = "Hey, I'm New Agent. What would you like to tackle first?";

// One product turn: the real Agent on the real tool session, with the real
// SendMessage tool, its delivery going through the real transport. `ingest`
// stands for the transcript manager's handleAgentUpdate.
async function runTurn(loaded, { ingest, firstCallArgs = { type: "text", content: GREETING } }) {
  const { module: m, dataDir } = loaded;
  const requests = [];
  const hostLog = [];
  m.setHostLogSink((line) => hostLog.push(line));
  m.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_loop" });
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(init?.body ?? "{}"));
    // Step one: the model greets through SendMessage. Then it writes text
    // and the loop ends, if it was told the message landed or not.
    return requests.length === 1
      ? functionCallStream(1, "SendMessage", firstCallArgs)
      : textStream(requests.length, "done");
  };
  const updates = [];
  const transport = m.createSandTransport((update) => { updates.push(update); return ingest(update); });
  const tool = m.createSendMessageTool({
    getIngestAttachment: () => undefined,
    onSendMessage: (message, timestampMs) => {
      transport.onUpdate({ type: "send-message", message, timestampMs });
      return transport.lastSentMessageId();
    },
  });
  const ctx = m.createProductionRunnerContext();
  const runContext = await m.createTurnAgentRunContext({
    context: ctx,
    conversationId: "agent-1",
    requestId: "req-1",
    inference: { resolvePrivacyMode: () => m.PrivacyMode.NO_STORAGE, createSession: () => { throw new Error("not used"); } },
    onRequestId: () => {},
    isSubagentRunner: false,
    isSilenceAllowed: false,
    canUseSelfSummary: () => true,
    cancelThisRun: () => {},
    emittedConnectorCards: new Set(),
  });
  const config = m.createSandAgentStaticConfig({
    modelId: "gpt-5.6-terra",
    agentTokenLimit: 200_000,
    conversationId: "agent-1",
    isBoxScopedSubagent: false,
    isSubagentRunner: false,
    isSharedRoomRunner: false,
    sandSendMessageDeliveryOwed: false,
    systemPromptGenerator: () => m.DEFAULT_SAND_SYSTEM_PROMPT,
    toolsGenerator: () => m.ToolSetHandle.fromTools([tool]),
  });
  const requestContextExecutor = new m.SandRequestContextExecutor(
    { resolve: () => ({ osVersion: "test", shell: "sh", timeZone: "UTC", transcriptsFolder: dataDir }), resolveRules: async () => undefined },
    false,
    false,
  );
  const resourceAccessor = new m.CombinedResourceAccessor(
    { get: (resource) => { throw new Error(`the harness binds no ${String(resource.symbol)}`); } },
    [m.resourceEntry(m.requestContextExecutorResource, requestContextExecutor)],
  );
  const agent = m.createTurnAgentForRun({
    config,
    toolSession: runContext.toolSession,
    emitUpdate: (update) => transport.onUpdate(update),
    interactionObservers: {},
    privacyMode: runContext.privacyMode,
    resourceAccessor,
    blobStore: new m.InMemoryBlobStore(),
    summarizationSession: runContext.summarizationSession,
  });
  const action = new m.ConversationAction({
    action: { case: "userMessageAction", value: new m.UserMessageAction({ userMessage: new m.UserMessage({ text: "hi", messageId: "u1" }) }) },
  });
  const start = m.createTurnAgentStreamStart({
    agent: { agent },
    baseState: new m.ConversationStateStructure({}),
    action,
    privacyMode: runContext.privacyMode,
    mcpTools: [],
  });
  const [runCtx] = ctx.withCancel();
  const finalState = await withTimeout(start.startStream(runCtx, undefined, async () => {}), "the turn");
  return { requests, hostLog, updates, finalState };
}

function toolOutputs(request) {
  return request.input.filter((item) => item.type === "function_call_output").map((item) => JSON.parse(item.output));
}

const env = { previous: {} };
function pin(dataDir) {
  for (const key of ["SAND_DATA_ROOT", "SAND_BACKEND_URL"]) env.previous[key] = process.env[key];
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.claidor.com";
}
function unpin() {
  for (const [key, value] of Object.entries(env.previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

function captureConsole() {
  const lines = [];
  const previous = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(previous)) console[level] = (...args) => lines.push(args.map(String).join(" "));
  return { lines, restore: () => { for (const [level, fn] of Object.entries(previous)) console[level] = fn; } };
}

test("the real Agent loop delivers a SendMessage the model calls and ends the turn", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const console_ = captureConsole();
  try {
    pin(loaded.dataDir);
    const written = [];
    const turn = await runTurn(loaded, { ingest: (update) => { if (update.type === "send-message") { written.push(update.message); return `t1s${written.length}`; } return undefined; } });
    assert.equal(turn.requests.length, 2, "one call to greet, one to finish");
    assert.deepEqual(written, [{ type: "text", content: GREETING }]);
    assert.deepEqual(toolOutputs(turn.requests[1]), ["Message sent to user. (id: t1s1)"]);
    assert.ok(turn.hostLog.some((line) => line.startsWith("[claidor] model=") && line.includes("tools=SendMessage(")), turn.hostLog.join("\n"));
    assert.ok(turn.hostLog.includes("[claidor] send-message written id=t1s1 type=text"), turn.hostLog.join("\n"));
    assert.ok(turn.hostLog.some((line) => /^\[claidor\] tool=sendMessageToolCall id=call_1 result=success /.test(line)), turn.hostLog.join("\n"));
  } finally {
    console_.restore();
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("when delivery throws, the model is told 'Failed to send the message to the user', the loop's logger says nothing, and the host log names the reason", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const console_ = captureConsole();
  try {
    pin(loaded.dataDir);
    const turn = await runTurn(loaded, { ingest: (update) => { if (update.type === "send-message") throw new Error("the transcript hop broke"); return undefined; } });
    assert.equal(turn.requests.length, 2);
    assert.deepEqual(toolOutputs(turn.requests[1]), ["Failed to send the message to the user: the transcript hop broke"]);
    // The loop logs the failure as nal.tool_call.failure — into the silent
    // logger of the production runner context. Nothing of it reaches stdout.
    assert.equal(console_.lines.filter((line) => line.includes("nal.")).length, 0, console_.lines.join("\n"));
    // The host log, which does reach /tmp/sand-host.log, carries the sentence twice: at the hop and at the tool.
    assert.ok(turn.hostLog.some((line) => line.startsWith("[claidor] send-message not written type=text error=Error: the transcript hop broke")), turn.hostLog.join("\n"));
    assert.ok(turn.hostLog.some((line) => line.startsWith("[claidor] tool=sendMessageToolCall id=call_1 result=error detail=the transcript hop broke")), turn.hostLog.join("\n"));
  } finally {
    console_.restore();
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

// The call the box log showed on 23 September, thirty times in a row: the
// greeting with a blank widget riding on it.
test("the greeting GPT-5.6 actually sends — a text with every other field padded — lands as text", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const console_ = captureConsole();
  try {
    pin(loaded.dataDir);
    const written = [];
    const turn = await runTurn(loaded, {
      ingest: (update) => { if (update.type === "send-message") { written.push(update.message); return `t1s${written.length}`; } return undefined; },
      firstCallArgs: { type: "text", content: GREETING, url: "", images: [], alt: "", reply_to: "", channel: "", widget: { prompt: "x", helpText: "x", options: [{ label: "x", value: "x", description: "x", style: "default" }], allowCustom: false, dismissOnMoveOn: false }, bcId: "", secret: { label: "x", description: "x", connector: "x", field: "x" } },
    });
    assert.equal(turn.requests.length, 2);
    assert.deepEqual(written, [{ type: "text", content: GREETING }]);
    assert.deepEqual(toolOutputs(turn.requests[1]), ["Message sent to user. (id: t1s1)"]);
    assert.ok(turn.hostLog.some((line) => /^\[claidor\] tool=sendMessageToolCall id=call_1 result=success /.test(line)), turn.hostLog.join("\n"));
  } finally {
    console_.restore();
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

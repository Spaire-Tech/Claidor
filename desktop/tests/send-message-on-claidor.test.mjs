import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The real SendMessage tool — the agent's only voice — driven through the
// host's real tool loop on the claidor executor against a fake Responses
// server. 23 September 2026: on a Mac, turns ran for fifty minutes and
// nothing reached the person. This is the offline half of finding out why:
// does a SendMessage the model actually calls land, and what schema does
// the model see for it?

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-send-message-"));
  const output = path.join(temporary, "send-message.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claidor-host-loop-entry.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function sse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function functionCallStream(name, args) {
  const item = { type: "function_call", id: "fc_1", call_id: "call_1", name, arguments: "" };
  const text = JSON.stringify(args);
  return sse([
    { type: "response.created", response: { id: "resp_call", created_at: 1_700_000_001, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item },
    ...[text.slice(0, 12), text.slice(12)].map((delta) => ({ type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 0, delta })),
    { type: "response.output_item.done", output_index: 0, item: { ...item, arguments: text, status: "completed" } },
    { type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 4 } } },
  ]);
}

function textStream(text) {
  return sse([
    { type: "response.created", response: { id: "resp_text", created_at: 1_700_000_000, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
}

function withTimeout(promise, label, ms = 4_000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} hung`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The interaction handler the real turn supplies: SendMessage runs its
// delivery closure through executeToolCall. This one just runs it.
const toolErrors = [];
const interactionHandler = new Proxy({
  emitPartialToolCall() {},
  async executeToolCall(ctx, _initial, _id, run) { return await run(ctx); },
  async emitToolCallError(_ctx, id, errored) { toolErrors.push({ id, errored }); },
  invocationId: "inv-1",
}, { get(target, property) { return property in target ? target[property] : async () => undefined; } });

async function runStep(executor, ctx, tool) {
  const result = executor.executeToolStream(ctx, undefined, interactionHandler, [tool], {}, async () => {}, undefined, undefined);
  const chunks = [];
  let streamError;
  await withTimeout((async () => { try { for await (const chunk of result.fullStream) chunks.push(chunk); } catch (error) { streamError = error; } })(), "stream");
  const response = await withTimeout(result.response, "response");
  executor.appendMessages(response.messages);
  return { chunks, response, streamError };
}

const env = { previous: {} };
function pin(module, dataDir) {
  for (const key of ["SAND_DATA_ROOT", "SAND_BACKEND_URL"]) env.previous[key] = process.env[key];
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.claidor.com";
  module.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_send" });
}
function unpin() {
  for (const [key, value] of Object.entries(env.previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

test("a SendMessage the model calls lands, and the model is told it landed", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const requests = [];
  const sent = [];
  try {
    pin(loaded.module, loaded.dataDir);
    globalThis.fetch = async (input, init) => {
      requests.push(JSON.parse(init?.body ?? "{}"));
      return requests.length === 1
        ? functionCallStream("SendMessage", { type: "text", content: "Hey — good to meet you. What would you like help with first?" })
        : textStream("done");
    };
    const tool = loaded.module.createSendMessageTool({
      getIngestAttachment: () => undefined,
      onSendMessage: (message, timestampMs) => { sent.push({ message, timestampMs }); return "m-1"; },
    });
    assert.equal(tool.name, "SendMessage");
    const state = [
      { role: "system", content: "You are the real system prompt. Nothing reaches the user unless it's inside a SendMessage." },
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ];
    const executor = new loaded.module.SimplePromptToolExecutor(loaded.module.createProviderPromptSession("claidor").getExecutor(state));
    const ctx = loaded.module.createContext();

    const first = await runStep(executor, ctx, tool);
    assert.deepEqual(toolErrors, [], JSON.stringify(toolErrors).slice(0, 2000));
    assert.equal(first.streamError, undefined);
    assert.equal(first.response.error, undefined, String(first.response.error));
    assert.deepEqual(sent.map((entry) => entry.message), [{ type: "text", content: "Hey — good to meet you. What would you like help with first?" }]);
    const toolResult = first.response.messages.find((message) => message.role === "tool")?.content[0];
    assert.ok(toolResult, "the loop appended a tool result");
    assert.equal(toolResult.toolName, "SendMessage");
    assert.match(String(toolResult.result), /Message sent to user/);
    assert.doesNotMatch(String(toolResult.result), /Failed/);

    // The schema the model sees for SendMessage on the wire.
    const wireTool = requests[0].tools.find((entry) => entry.name === "SendMessage");
    assert.ok(wireTool, "SendMessage is offered to the model");
    assert.equal(wireTool.parameters.type, "object");
    assert.ok(Array.isArray(wireTool.parameters.properties.type.enum));
    assert.equal(JSON.stringify(wireTool.parameters).includes("$ref"), false, "no $ref in the wire schema");
    // The blank-field preprocessing must not hide the widget's shape from the model.
    assert.equal(wireTool.parameters.properties.widget.properties.prompt.type, "string");
    assert.deepEqual(wireTool.parameters.properties.widget.required, ["prompt", "options"]);
    assert.equal(wireTool.parameters.properties.secret.properties.connector.type, "string");
    assert.equal(wireTool.parameters.properties.images.items.properties.url.type, "string");

    const second = await runStep(executor, ctx, tool);
    assert.equal(second.response.error, undefined);
    // The second request carries the call and its result the way the Responses wire expects.
    const items = requests[1].input.map((item) => item.type ?? item.role);
    assert.ok(items.includes("function_call") && items.includes("function_call_output"), items.join(","));
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

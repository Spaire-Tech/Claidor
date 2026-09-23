import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// Phase 3, measured offline: the host's own tool loop
// (packages/agent/tool-stream-executor.ts, the code every real turn runs)
// driving the claidor executor against a fake Responses server. No Mac, no
// box, no key. What this proves is the executor contract; what it cannot
// prove is a live model's behaviour, and it does not pretend to.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-host-loop-"));
  const output = path.join(temporary, "host-loop.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claidor-host-loop-entry.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function sse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
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

function functionCallStream(name, args) {
  const item = { type: "function_call", id: "fc_1", call_id: "call_1", name, arguments: "" };
  return sse([
    { type: "response.created", response: { id: "resp_call", created_at: 1_700_000_001, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item },
    { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 0, delta: JSON.stringify(args) },
    { type: "response.output_item.done", output_index: 0, item: { ...item, arguments: JSON.stringify(args), status: "completed" } },
    { type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 4 } } },
  ]);
}

function withTimeout(promise, label, ms = 4_000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} hung`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// One step of the real loop: the model stream, tool-call collection, tool
// execution and the tool-result message, exactly as a turn does it.
async function runStep(executor, ctx, tool) {
  const result = executor.executeToolStream(ctx, undefined, { invocationId: "inv-1" }, [tool], {}, async () => {}, undefined, undefined);
  const chunks = [];
  let streamError;
  await withTimeout((async () => { try { for await (const chunk of result.fullStream) chunks.push(chunk.type); } catch (error) { streamError = error; } })(), "stream");
  const response = await withTimeout(result.response, "response");
  executor.appendMessages(response.messages);
  return { chunks, response, streamError };
}

function shellTool(module, render) {
  const executed = [];
  const tool = module.createZodAgentTool("SHELL", {
    name: "run_shell",
    descriptionGenerator: () => "Run a shell command",
    parameters: module.z.object({ command: module.z.string().describe("the command") }),
    execute: async (_ctx, _handler, argsStream) => {
      let text = "";
      for await (const chunk of argsStream) text += chunk;
      executed.push(JSON.parse(text));
      return { toJson: () => ({ exitCode: 0, stdout: "a.txt" }) };
    },
    render: async () => render(),
    serializeError: (error) => String(error),
  });
  return { tool, executed };
}

function initialState() {
  return [
    { role: "system", content: "You are the real system prompt." },
    { role: "user", content: [{ type: "text", text: "list files" }] },
  ];
}

const env = { previous: {} };
function pin(module, dataDir) {
  for (const key of ["SAND_DATA_ROOT", "SAND_BACKEND_URL"]) env.previous[key] = process.env[key];
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.claidor.com";
  module.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_loop" });
}
function unpin() {
  for (const [key, value] of Object.entries(env.previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

function inputItems(request) {
  return request.body.input.map((item) => ("role" in item ? { role: item.role, content: item.content } : item));
}

test("the host's tool loop completes a two-step turn on the claidor provider", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    pin(loaded.module, loaded.dataDir);
    globalThis.fetch = async (input, init) => {
      requests.push({ url: typeof input === "string" ? input : input.url, headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? "{}") });
      return requests.length === 1 ? functionCallStream("run_shell", { command: "ls" }) : textStream("done");
    };
    const { tool, executed } = shellTool(loaded.module, () => ({ content: [{ type: "text", text: "a.txt" }] }));
    const executor = new loaded.module.SimplePromptToolExecutor(loaded.module.createProviderPromptSession("claidor").getExecutor(initialState()));
    const ctx = loaded.module.createContext();

    const first = await runStep(executor, ctx, tool);
    assert.equal(first.streamError, undefined);
    assert.equal(first.response.error, undefined);
    assert.ok(first.chunks.includes("tool-call-streaming-start"));
    assert.ok(first.chunks.includes("tool-call-delta"));
    assert.ok(first.chunks.includes("tool-call"));
    assert.deepEqual(executed, [{ command: "ls" }]);
    assert.deepEqual(first.response.messages.map((message) => message.role), ["assistant", "tool"]);
    const toolResult = first.response.messages[1].content[0];
    assert.equal(toolResult.type, "tool-result");
    assert.equal(toolResult.toolCallId, "call_1");
    assert.equal(toolResult.result, "a.txt");

    const second = await runStep(executor, ctx, tool);
    assert.equal(second.streamError, undefined);
    assert.equal(second.response.error, undefined);
    assert.ok(second.chunks.includes("text-delta"));
    assert.deepEqual(second.response.messages.map((message) => message.role), ["assistant"]);
    assert.equal(second.response.messages[0].content[0].text, "done");

    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.url, "https://api.claidor.com/desktop/api/proxy/v1/responses");
      assert.equal(request.headers.get("authorization"), "Bearer claidor_da_loop");
      assert.equal(request.body.model, "gpt-5.6-terra");
      // The loop runs at Grok Bot's effort (high), on every step.
      assert.deepEqual(request.body.reasoning, { effort: "high" });
      // The host wraps tool schemas with the AI SDK's jsonSchema(); the wire
      // must see the bare schema, not the wrapper.
      assert.deepEqual(request.body.tools[0].parameters, { type: "object", properties: { command: { type: "string", description: "the command" } }, required: ["command"] });
      assert.notEqual(request.body.tools[0].strict, true);
      assert.equal(request.body.tools[0].name, "run_shell");
      // The state's own system prompt is the only one; the router prompt stays
      // on the connector-only path.
      const systemItems = inputItems(request).filter((item) => item.role === "developer" || item.role === "system");
      assert.equal(systemItems.length, 1);
      assert.equal(systemItems[0].content, "You are the real system prompt.");
      assert.equal(request.body.instructions, undefined);
    }
    const items = inputItems(requests[1]);
    const call = items.find((item) => item.type === "function_call");
    const output = items.find((item) => item.type === "function_call_output");
    assert.deepEqual(call, { type: "function_call", call_id: "call_1", name: "run_shell", arguments: JSON.stringify({ command: "ls" }) });
    assert.equal(output.call_id, "call_1");
    assert.equal(JSON.parse(output.output), "a.txt");
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("an image in a tool result reaches the model instead of being dropped", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    pin(loaded.module, loaded.dataDir);
    globalThis.fetch = async (input, init) => {
      requests.push({ body: JSON.parse(init?.body ?? "{}") });
      return requests.length === 1 ? functionCallStream("run_shell", { command: "screencapture" }) : textStream("I see a desktop.");
    };
    const png = Buffer.from("not-really-a-png").toString("base64");
    const { tool } = shellTool(loaded.module, () => ({ content: [{ type: "image", data: png, mimeType: "image/png" }] }));
    const executor = new loaded.module.SimplePromptToolExecutor(loaded.module.createProviderPromptSession("claidor").getExecutor(initialState()));
    const ctx = loaded.module.createContext();

    const first = await runStep(executor, ctx, tool);
    assert.equal(first.response.error, undefined);
    // The loop's own tool-result carries no text for an image-only result.
    assert.equal(first.response.messages[1].content[0].result, undefined);
    const second = await runStep(executor, ctx, tool);
    assert.equal(second.response.error, undefined);
    assert.equal(second.response.messages[0].content[0].text, "I see a desktop.");

    const items = inputItems(requests[1]);
    const output = items.find((item) => item.type === "function_call_output");
    assert.equal(typeof output.output, "string");
    assert.ok(output.output.length > 0);
    const image = items.flatMap((item) => (Array.isArray(item.content) ? item.content : [])).find((part) => part.type === "input_image");
    assert.equal(image.image_url, `data:image/png;base64,${png}`);
    assert.equal(items.indexOf(items.find((item) => item.role === "user" && Array.isArray(item.content) && item.content.some((part) => part.type === "input_image"))) > items.indexOf(output), true);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("a proxy refusal ends the step with the provider's sentence instead of hanging the turn", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  try {
    pin(loaded.module, loaded.dataDir);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "desktop access token expired", type: "invalid_request_error" } }), { status: 401, headers: { "content-type": "application/json" } });
    const { tool, executed } = shellTool(loaded.module, () => ({ content: [{ type: "text", text: "" }] }));
    const executor = new loaded.module.SimplePromptToolExecutor(loaded.module.createProviderPromptSession("claidor").getExecutor(initialState()));

    const step = await runStep(executor, loaded.module.createContext(), tool);
    assert.match(String(step.streamError?.message), /expired/);
    assert.match(String(step.response.error?.message), /expired/);
    assert.deepEqual(executed, []);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("toCoreMessages strips the Cursor wire dialect the AI SDK refuses", async () => {
  const loaded = await loadHarness();
  try {
    const { toCoreMessages } = loaded.module;
    const converted = toCoreMessages([
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "hi" }, { type: "image", image: new Uint8Array([1, 2, 3]), mimeType: "image/png" }, { type: "cursor-only", weird: true }] },
      { role: "assistant", id: "m1", content: [{ type: "reasoning", text: "thinking", signature: "sig", providerOptions: { cursor: { modelName: "x" } } }, { type: "redacted-reasoning", data: "…" }, { type: "tool-call", toolCallId: "c1", toolName: "t", args: { a: 1 } }] },
      { role: "tool", id: "c1", content: [{ type: "tool-result", toolCallId: "c1", toolName: "t", result: undefined, experimental_content: [] }], providerOptions: { cursor: { highLevelToolCallResult: { isError: undefined } } } },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c2", toolName: "t", result: { hits: 3 } }] },
    ]);
    assert.deepEqual(converted, [
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "hi" }, { type: "image", image: new Uint8Array([1, 2, 3]), mimeType: "image/png" }] },
      { role: "assistant", content: [{ type: "reasoning", text: "thinking" }, { type: "tool-call", toolCallId: "c1", toolName: "t", args: { a: 1 } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "t", result: "(no output)" }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c2", toolName: "t", result: { hits: 3 } }] },
    ]);
    assert.equal(JSON.stringify(converted).includes("undefined"), false);
  } finally {
    await loaded.dispose();
  }
});

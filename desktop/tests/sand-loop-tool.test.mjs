/**
 * Grok Bot's Sand-shaped box tools on the loop (25 September 2026).
 *
 * The founder's app, asked to open Render in the browser: "The browser
 * handoff hit a desktop error … tool3.serializeError is not a function".
 * The computerUse child's Computer tool (`sand-computer-tool.ts`) is built
 * as `execute(args, meta)` over a Zod schema and went into the toolset as
 * it was; the loop (`packages/agent/tools/core.ts`) calls
 * `execute(ctx, interactionHandler, argsStream, meta)` and, on a throw,
 * `serializeError`, which the tool did not have. Same for Screenshot, the
 * browser tools and CloudAgent (no schema at all, so never on the wire).
 *
 * Offline, through the host's real tool loop against a fake Responses
 * server, the way `claidor-host-loop.test.mjs` drives it: (1) a Computer
 * call reaches the box dependency with the parsed actions and its
 * screenshot reaches the model as an image; (2) a box that refuses the call
 * is an error result the model reads, not a crash; (3) the tool goes on
 * the wire with a JSON schema; (4) a browser tool's schema and image do
 * the same; (5) CloudAgent carries its action schema.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  // Inside the tree, so the packages the bundle leaves external resolve from
  // node_modules (`/.tmp*/` is ignored by git), as the computer-child test does.
  const temporary = await mkdtemp(path.join(repoRoot, ".tmp-sand-loop-tool-"));
  const output = path.join(temporary, "sand-loop-tool.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/sand-loop-tool-entry.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function sse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function textStream(text) {
  return sse([
    { type: "response.created", response: { id: "resp_text", created_at: 1_700_000_000, model: "gpt-5.6-luna" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
}

function functionCallStream(name, args) {
  const item = { type: "function_call", id: "fc_1", call_id: "call_1", name, arguments: "" };
  return sse([
    { type: "response.created", response: { id: "resp_call", created_at: 1_700_000_001, model: "gpt-5.6-luna" } },
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

// The loop's interaction handler, reduced to what a tool call touches: the
// card bracket (`executeToolCall`), the partial and error emissions, and
// the abort signal. The cards are kept so the test can read them.
function interactionHandler() {
  const cards = [];
  return {
    invocationId: "inv-1",
    cards,
    emitPartialToolCall: async () => {},
    emitToolCallError: async (_ctx, callId, toolCall) => { cards.push({ callId, phase: "error", toolCall }); },
    markToolCallForArgPreservation: () => {},
    getAbortSignal: () => new AbortController().signal,
    async executeToolCall(ctx, toolCall, callId, run, merge) {
      cards.push({ callId, phase: "start", toolCall });
      const result = await run(ctx);
      cards.push({ callId, phase: "done", toolCall: merge(result) });
      return result;
    },
  };
}

async function runStep(executor, ctx, handler, tool) {
  const result = executor.executeToolStream(ctx, undefined, handler, [tool], {}, async () => {}, undefined, undefined);
  const chunks = [];
  let streamError;
  await withTimeout((async () => { try { for await (const chunk of result.fullStream) chunks.push(chunk.type); } catch (error) { streamError = error; } })(), "stream");
  const response = await withTimeout(result.response, "response");
  executor.appendMessages(response.messages);
  return { chunks, response, streamError };
}

function initialState() {
  return [
    { role: "system", content: "You are Simeon running as the computerUse subagent." },
    { role: "user", content: [{ type: "text", text: "open render.com" }] },
  ];
}

function inputItems(request) {
  return request.body.input.map((item) => ("role" in item ? { role: item.role, content: item.content } : item));
}

const env = { previous: {} };
function pin(module, dataDir) {
  for (const key of ["SAND_DATA_ROOT", "SAND_BACKEND_URL"]) env.previous[key] = process.env[key];
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
  module.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_loop" });
}
function unpin() {
  for (const [key, value] of Object.entries(env.previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

// The box side of the Computer tool: what `createHostComputerToolDependencies`
// projects, reduced to a recorder that answers a screenshot.
function computerDependencies(execute) {
  const calls = [];
  return {
    calls,
    dependencies: {
      resourceAccessor: { get: () => undefined },
      execute: async (context, args) => { calls.push({ context, args }); return execute(args); },
      getPersistImage: () => undefined,
    },
  };
}

const WEBP = Buffer.from("not-really-a-webp").toString("base64");

test("a Computer call runs through the real loop: parsed actions reach the box, the screenshot reaches the model", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    pin(loaded.module, loaded.dataDir);
    globalThis.fetch = async (input, init) => {
      requests.push({ url: typeof input === "string" ? input : input.url, body: JSON.parse(init?.body ?? "{}") });
      return requests.length === 1
        ? functionCallStream("Computer", { action: "click", x: 120, y: 340, description: "the Sign in button" })
        : textStream("Clicked Sign in.");
    };
    const box = computerDependencies(() => ({ result: { case: "success", value: { screenshot: WEBP, cursorPosition: { x: 120, y: 340 } } } }));
    const tool = loaded.module.createTurnComputerToolFactory({ dependencies: box.dependencies })();
    assert.equal(tool.name, "Computer");
    assert.equal(tool.toolIdentifier, "OPENAI_COMPUTER_USE");
    assert.equal(typeof tool.serializeError, "function");

    const executor = new loaded.module.SimplePromptToolExecutor(loaded.module.createProviderPromptSession("claidor").getExecutor(initialState()));
    const ctx = loaded.module.createContext();
    const handler = interactionHandler();

    const first = await runStep(executor, ctx, handler, tool);
    assert.equal(first.streamError, undefined);
    assert.equal(first.response.error, undefined);
    assert.ok(first.chunks.includes("tool-call"));
    // The box got the click and the trailing screenshot Grok Bot appends,
    // under the loop's own tool-call id.
    assert.equal(box.calls.length, 1);
    assert.equal(box.calls[0].args.toolCallId, "call_1");
    assert.deepEqual(box.calls[0].args.actions.map((action) => action.action.case), ["click", "screenshot"]);
    assert.deepEqual(box.calls[0].args.actions[0].action.value.coordinate, { x: 120, y: 340 });
    assert.equal(box.calls[0].args.description, "the Sign in button");
    // The card started and completed in the transcript.
    assert.deepEqual(handler.cards.map((card) => card.phase), ["start", "done"]);
    assert.equal(handler.cards[1].toolCall.tool.value.result.result.case, "success");

    const second = await runStep(executor, ctx, handler, tool);
    assert.equal(second.streamError, undefined);
    assert.equal(second.response.messages[0].content[0].text, "Clicked Sign in.");

    // On the wire: the tool carried a JSON schema (not the Zod object), and
    // the model read the screenshot as an image after the text result.
    assert.equal(requests[0].body.tools[0].name, "Computer");
    const schema = requests[0].body.tools[0].parameters;
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.properties.action.enum, ["screenshot", "click", "move", "drag", "type", "key", "scroll", "wait"]);
    assert.ok(Array.isArray(schema.required) && schema.required.includes("action"));
    assert.equal(schema._def, undefined);
    const items = inputItems(requests[1]);
    const output = items.find((item) => item.type === "function_call_output");
    assert.equal(output.call_id, "call_1");
    assert.match(String(output.output), /Computer action ran on the box desktop/);
    assert.match(String(output.output), /Cursor is at \(120, 340\)/);
    const image = items.flatMap((item) => (Array.isArray(item.content) ? item.content : [])).find((part) => part.type === "input_image");
    assert.equal(image.image_url, `data:image/webp;base64,${WEBP}`);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("a box that refuses the Computer call is an error result the model reads, not a crash", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    pin(loaded.module, loaded.dataDir);
    globalThis.fetch = async (input, init) => {
      requests.push({ body: JSON.parse(init?.body ?? "{}") });
      return requests.length === 1 ? functionCallStream("Computer", { action: "screenshot" }) : textStream("The box has no desktop.");
    };
    const box = computerDependencies(() => { throw new Error("the box exec daemon answers no Computer case"); });
    const tool = loaded.module.createTurnComputerToolFactory({ dependencies: box.dependencies })();
    const executor = new loaded.module.SimplePromptToolExecutor(loaded.module.createProviderPromptSession("claidor").getExecutor(initialState()));
    const handler = interactionHandler();

    const first = await runStep(executor, loaded.module.createContext(), handler, tool);
    assert.equal(first.streamError, undefined, String(first.streamError));
    assert.equal(first.response.error, undefined);
    assert.equal(box.calls.length, 1);
    assert.deepEqual(handler.cards.map((card) => card.phase), ["start", "done"]);
    assert.equal(handler.cards[1].toolCall.tool.value.result.result.case, "error");

    const second = await runStep(executor, loaded.module.createContext(), handler, tool);
    assert.equal(second.streamError, undefined);
    const items = inputItems(requests[1]);
    const output = items.find((item) => item.type === "function_call_output");
    assert.match(String(output.output), /the box exec daemon answers no Computer case/);
    assert.doesNotMatch(String(output.output), /serializeError/);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("a throw the loop catches is answered by serializeError with the communicate-update error card", async () => {
  const loaded = await loadHarness();
  try {
    const box = computerDependencies(() => ({ result: { case: "success", value: {} } }));
    const tool = loaded.module.createTurnScreenshotToolFactory({ dependencies: box.dependencies })();
    assert.equal(tool.name, "Screenshot");
    const card = tool.serializeError(new Error("aborted by the person"));
    assert.equal(card.tool.case, "communicateUpdateToolCall");
    assert.equal(card.tool.value.result.result.case, "error");
    assert.equal(card.tool.value.result.result.value.error, "aborted by the person");
    // And the loop's own catch renders that card's result as an error the model reads.
    const outcome = await loaded.module.executeToolResultOrError(
      { ...tool, execute: async () => { throw new TypeError("ctx is not arguments"); } },
      loaded.module.createContext(),
      interactionHandler(),
      (async function* () { yield "{}"; })(),
      { toolCallId: "call_9" },
    );
    assert.ok(outcome.error instanceof TypeError);
    const rendered = await loaded.module.renderToolResultOrError(loaded.module.createContext(), tool, outcome, {});
    assert.equal(rendered.isError, true);
    assert.match(rendered.content[0].text, /ctx is not arguments/);
  } finally {
    await loaded.dispose();
  }
});

test("a browser tool carries its required keys and enum as the schema and its screenshot as an image", async () => {
  const loaded = await loadHarness();
  try {
    const calls = [];
    const definition = {
      id: "BROWSER_TABS",
      name: "browser_tabs",
      description: "List, create, close, or select a browser tab.",
      op: "tabs",
      schema: { required: ["action"], enum: { action: ["list", "new", "close", "select"] } },
      async execute(context, args, metadata) { calls.push({ context, args, metadata }); return { text: "2 tabs", imageB64: "UE5H" }; },
      render(output) { return { kind: "image", text: output.text, imageB64: output.imageB64 }; },
    };
    const schema = loaded.module.browserToolParameters(definition.schema);
    assert.equal(schema.safeParse({ action: "list" }).success, true);
    assert.equal(schema.safeParse({ action: "reload" }).success, false);
    assert.equal(schema.safeParse({}).success, false);
    assert.equal(schema.safeParse({ action: "select", index: 1 }).success, true);

    const tool = loaded.module.adaptBrowserTool(definition);
    assert.equal(tool.parameters.jsonSchema.properties.action.enum.length, 4);
    assert.deepEqual(tool.parameters.jsonSchema.required, ["action"]);
    const ctx = loaded.module.createContext();
    const outcome = await loaded.module.executeToolResultOrError(tool, ctx, interactionHandler(), (async function* () { yield JSON.stringify({ action: "select", index: 1 }); })(), { toolCallId: "call_3", stateHandler: { tag: "state" } });
    assert.equal(outcome.error, undefined);
    assert.deepEqual(calls[0].args, { action: "select", index: 1 });
    assert.equal(calls[0].metadata.toolCallId, "call_3");
    assert.deepEqual(calls[0].metadata.stateHandler, { tag: "state" });
    assert.equal(typeof calls[0].context.signal, "object");
    const rendered = await loaded.module.renderToolResultOrError(ctx, tool, outcome, {});
    assert.deepEqual(rendered.content, [{ type: "text", text: "2 tabs" }, { type: "image", data: "UE5H", mimeType: "image/png" }]);
  } finally {
    await loaded.dispose();
  }
});

test("CloudAgent goes on the wire with its action schema and runs on the loop's context", async () => {
  const loaded = await loadHarness();
  try {
    const seen = [];
    const api = { launch: async (args) => { seen.push(args); return { bcId: "bc_1", url: "https://app.simeonlabs.com/agents/bc_1" }; }, list: async () => [], listModels: async () => [], get: async () => null };
    const tool = loaded.module.createTurnCloudAgentToolFactory({ dependencies: { api, launchedIds: new Set(), agentDir: "/tmp/agent", writeBoxFile: async () => {} } })();
    assert.equal(tool.name, "CloudAgent");
    assert.equal(typeof tool.serializeError, "function");
    const schema = tool.parameters.jsonSchema;
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.required, ["action"]);
    assert.ok(schema.properties.action.enum.includes("launch") && schema.properties.action.enum.includes("list_artifacts"));
    assert.equal(loaded.module.cloudAgentToolParameters.safeParse({ action: "list", scope: "all" }).success, true);
    assert.equal(loaded.module.cloudAgentToolParameters.safeParse({ action: "fly" }).success, false);
    const ctx = loaded.module.createContext();
    const outcome = await loaded.module.executeToolResultOrError(tool, ctx, interactionHandler(), (async function* () { yield JSON.stringify({ action: "list", scope: "all" }); })(), { toolCallId: "call_5" });
    assert.equal(outcome.error, undefined);
    const rendered = await loaded.module.renderToolResultOrError(ctx, tool, outcome, {});
    assert.equal(rendered.isError, false);
    assert.equal(typeof rendered.content[0].text, "string");
  } finally {
    await loaded.dispose();
  }
});

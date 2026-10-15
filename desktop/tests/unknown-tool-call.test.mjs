/**
 * A tool the model made up (15 October 2026). On a cloud computer, while the
 * agent waited on a browser helper, Claude called `CheckSubagent`, a tool
 * no one offers: the AI SDK refused the call (`NoSuchToolError`) before the
 * agent's loop saw it, and the whole run failed ("[sand][turn] agent run
 * failed … Model tried to call unavailable tool 'CheckSubagent'"). The loop
 * already answers such a call ("Tool not found: …. Available tools: …",
 * `executeDeferredToolCall`), so the agent can carry on with a tool it has;
 * the call now reaches it. Offline, with the proxy stubbed, on Claude's wire
 * and on GPT's:
 *
 * - the loop's step: the made-up call comes back as a tool call, no error,
 *   and the request still offers only the real tools;
 * - the loop answers it with the tools it has, and runs none;
 * - a connector call the AI SDK runs itself (`runRoutedProviderText`): the
 *   made-up tool answers that it does not exist, and the model goes on.
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
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const sse = (events) => new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

function claudeToolUse(name, input) {
  return sse([
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], usage: { input_tokens: 40, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name, input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 30 } },
    { type: "message_stop" },
  ]);
}

function responsesFunctionCall(name, args) {
  const item = { type: "function_call", id: "fc_1", call_id: "call_1", name, arguments: "" };
  return sse([
    { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-6-sol" } },
    { type: "response.output_item.added", output_index: 0, item },
    { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 0, delta: JSON.stringify(args) },
    { type: "response.output_item.done", output_index: 0, item: { ...item, arguments: JSON.stringify(args), status: "completed" } },
    { type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 4 } } },
  ]);
}

function responsesText(text) {
  return sse([
    { type: "response.created", response: { id: "resp_2", created_at: 1_700_000_001, model: "gpt-6-sol" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_2" } },
    { type: "response.output_text.delta", delta: text },
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
}

const OFFERED = [
  { name: "SendMessage", description: "Send a message", inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
  { name: "AwaitShell", description: "Sleep", inputSchema: { type: "object", properties: { block_until_ms: { type: "number" } } } },
];

async function withProxy(handler, run) {
  const loaded = await bundle("tests/fixtures/claude-path-entry.ts", "unknown-tool");
  const previous = { fetch: globalThis.fetch, dataRoot: process.env.SAND_DATA_ROOT, backend: process.env.SAND_BACKEND_URL, model: process.env.SAND_SIMEON_MODEL };
  const requests = [];
  const lines = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    delete process.env.SAND_SIMEON_MODEL;
    globalThis.fetch = async (input, init) => {
      const request = { url: typeof input === "string" ? input : input.url, body: init?.body == null ? undefined : JSON.parse(init.body) };
      requests.push(request);
      return handler(request, requests.length);
    };
    loaded.module.setSimeonCredentialSource({ getAccessToken: async () => "simeon_da_token" });
    loaded.module.setModelCallLog((line) => lines.push(line));
    await run(loaded.module, requests, lines);
  } finally {
    loaded.module.setModelCallLog(null);
    loaded.module.setSimeonModelRolesForTest({});
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [["SAND_DATA_ROOT", previous.dataRoot], ["SAND_BACKEND_URL", previous.backend], ["SAND_SIMEON_MODEL", previous.model]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await loaded.dispose();
  }
}

async function drain(result) {
  const parts = [];
  for await (const part of result.fullStream) parts.push(part);
  return { parts, response: await result.response };
}

test("Claude calling a tool no one offers gives the loop a tool call, not a failed run", async () => {
  await withProxy(async () => claudeToolUse("CheckSubagent", { subagent_id: "subagent-1" }), async (api, requests, lines) => {
    api.setSimeonModelRolesForTest({ primary: "claude-sonnet-5-5", cheap: "claude-haiku-5-5" });
    const session = api.createProviderPromptSession("simeon");
    assert.equal(session.getModelId(), "claude-sonnet-5-5");
    const { parts, response } = await drain(session.getExecutor([{ role: "system", content: "You are Simeon." }, { role: "user", content: "is the helper done?" }]).stream(undefined, "inv-1", OFFERED));

    assert.deepEqual(parts.filter((part) => part.type === "error"), [], "no error part");
    const call = parts.find((part) => part.type === "tool-call");
    assert.ok(call, parts.map((part) => part.type).join(","));
    assert.equal(call.toolName, "CheckSubagent");
    assert.equal(call.toolCallId, "toolu_1");
    assert.deepEqual(call.args, { subagent_id: "subagent-1" }, "the arguments as the model wrote them");
    const assistant = response.messages.find((message) => message.role === "assistant");
    assert.ok(assistant.content.some((part) => part.type === "tool-call" && part.toolName === "CheckSubagent"), "the call stays in the conversation, for the loop's answer to follow");
    // Only the real tools are offered.
    assert.deepEqual(requests[0].body.tools.map((tool) => tool.name), ["SendMessage", "AwaitShell"]);
    assert.equal(lines.filter((line) => line.includes("model-error")).length, 0, lines.join("\n"));
    assert.ok(lines.some((line) => line.includes("tools=CheckSubagent(")), "the step's log line names the call");
  });
});

test("the same on GPT's wire", async () => {
  await withProxy(async () => responsesFunctionCall("check_subagent", {}), async (api, requests) => {
    api.setSimeonModelRolesForTest({});
    const session = api.createProviderPromptSession("simeon", { modelId: "gpt-6-sol" });
    const { parts } = await drain(session.getExecutor([{ role: "user", content: "hi" }]).stream(undefined, "inv-2", OFFERED));
    assert.deepEqual(parts.filter((part) => part.type === "error"), []);
    assert.equal(parts.find((part) => part.type === "tool-call")?.toolName, "check_subagent");
    assert.deepEqual(requests[0].body.tools.map((tool) => tool.name), ["SendMessage", "AwaitShell"]);
  });
});

test("the loop answers a made-up tool with the tools it has, and runs none", async () => {
  const loaded = await bundle("source/packages/agent/tool-stream-executor.ts", "tool-stream-executor");
  const context = await bundle("source/packages/context/core.ts", "context-core");
  try {
    let ran = 0;
    const real = { name: "SendMessage", execute: async () => { ran += 1; return "sent"; } };
    const answer = await loaded.module.executeDeferredToolCall(context.module.createContext(), { toolCallId: "toolu_1", toolName: "CheckSubagent", args: {} }, { SendMessage: real, AwaitShell: real }, undefined, {}, undefined, {}, undefined, Promise.resolve({}));
    assert.equal(ran, 0);
    assert.deepEqual(answer, {
      role: "tool",
      id: "toolu_1",
      content: [{ type: "tool-result", toolName: "CheckSubagent", toolCallId: "toolu_1", result: "Tool not found: CheckSubagent. Available tools: SendMessage, AwaitShell" }],
    });
  } finally {
    await loaded.dispose();
    await context.dispose();
  }
});

test("a connector call the SDK runs itself: the made-up tool says it does not exist, and the model goes on", async () => {
  await withProxy(async (_request, count) => count === 1 ? responsesFunctionCall("gmail_find", { query: "invoices" }) : responsesText("3 invoices"), async (api, requests) => {
    api.setSimeonModelRolesForTest({});
    const executed = [];
    const text = await api.runRoutedProviderText("simeon", [{ role: "user", content: "any invoices?" }], {
      tools: [{ name: "gmail_search", description: "Search mail", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }],
      executeTool: async (definition, args) => { executed.push(definition.name); return { hits: 3, args }; },
    });
    assert.equal(text, "3 invoices");
    assert.deepEqual(executed, [], "no real tool ran in its place");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].body.tools.map((tool) => tool.name), ["gmail_search"]);
    const second = JSON.stringify(requests[1].body.input);
    assert.match(second, /Tool not found: gmail_find\. Available tools: gmail_search/);
  });
});

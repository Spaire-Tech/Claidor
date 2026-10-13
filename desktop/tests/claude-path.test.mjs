/**
 * Claude behind one server setting (13 October 2026).
 *
 * The server says which models hold the primary, cheap and fallback roles
 * (`ModelPolicy`, server/simeon/desktop/pricing.py); the engine reads them
 * from `/desktop/api/models/available` and follows them. Offline, with the
 * proxy stubbed:
 *
 * - the roles are read off the server's answer, and the defaults hold until then;
 * - the host's GPT-6 Sol default follows the primary role, so a turn moves
 *   to Claude without a new bundle, and an environment setting still wins;
 * - a Claude call goes out on the Messages wire with the bearer, the
 *   thinking-binding beta, the effort, adaptive thinking that drops stale
 *   blocks, and two cache breakpoints, and comes back metered as fresh,
 *   cached and written tokens;
 * - a thinking block's signature reaches the loop and goes back on the next
 *   call; a reasoning part without one does not;
 * - a Claude failure before any output runs the step on GPT-6 Sol, once; a
 *   failure after output does not.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-path-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claude-path-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const sse = (events) => new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

// Claude 5.5's stream with thinking omitted, as platform.claude.com documents
// it: the block opens, one empty thinking delta, its signature, then text.
function claudeStream({ text = "bonjour", signature = "sig-1", toolUse, errorAfterText = false } = {}) {
  const events = [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], usage: { input_tokens: 40, output_tokens: 1, cache_creation_input_tokens: 1_200, cache_read_input_tokens: 9_000 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature } },
    { type: "content_block_stop", index: 0 },
  ];
  if (toolUse !== undefined) {
    events.push(
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: toolUse.id, name: toolUse.name, input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify(toolUse.input) } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 30 } },
    );
  } else {
    events.push(
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text } },
    );
    if (errorAfterText) {
      events.push({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
      return sse(events);
    }
    events.push(
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 25 } },
    );
  }
  events.push({ type: "message_stop" });
  return sse(events);
}

function responsesStream(text) {
  return sse([
    { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-6-sol" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
}

const CLAUDE_ROLES = { primary: "claude-sonnet-5-5", cheap: "claude-haiku-5-5", fallback: "gpt-6-sol" };

async function withProxy(handler, run) {
  const loaded = await load();
  const previous = { fetch: globalThis.fetch, dataRoot: process.env.SAND_DATA_ROOT, backend: process.env.SAND_BACKEND_URL, model: process.env.SAND_SIMEON_MODEL };
  const requests = [];
  const lines = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    delete process.env.SAND_SIMEON_MODEL;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const request = { url, headers: new Headers(init?.headers), body: init?.body == null ? undefined : JSON.parse(init.body) };
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
  await result.response;
  return { parts, usage: await result.extendedUsage };
}

test("the roles are read off the server's model list, and the defaults hold until then", async () => {
  await withProxy(async (request) => {
    assert.equal(request.url, "https://api.simeonlabs.com/desktop/api/models/available");
    assert.equal(request.headers.get("authorization"), "Bearer simeon_da_token");
    return Response.json({ code: 0, data: [
      { modelId: "gemini-2.5-flash", role: "video", transportApi: "gemini-generate-content" },
      { modelId: "claude-sonnet-5-5", role: "primary", provider: "anthropic", transportApi: "anthropic-messages" },
      { modelId: "claude-haiku-5-5", role: "cheap", provider: "anthropic", transportApi: "anthropic-messages" },
      { modelId: "gpt-6-sol", role: "fallback", provider: "openai", transportApi: "openai-responses" },
    ] });
  }, async (api, requests, lines) => {
    assert.equal(api.configuredSimeonModel(), "gpt-6-sol");
    assert.equal(api.configuredSimeonCheapModel(), "gpt-6-luna");
    assert.equal(api.configuredSimeonFallbackModel(), undefined);

    const roles = await api.refreshSimeonModelRoles({ getAccessToken: async () => "simeon_da_token" });
    assert.deepEqual(roles, CLAUDE_ROLES);
    assert.equal(requests.length, 1);
    assert.equal(api.configuredSimeonModel(), "claude-sonnet-5-5");
    assert.equal(api.configuredSimeonCheapModel(), "claude-haiku-5-5");
    assert.equal(api.configuredSimeonFallbackModel(), "gpt-6-sol");
    assert.ok(lines.includes("[simeon] model-roles primary=claude-sonnet-5-5 cheap=claude-haiku-5-5 fallback=gpt-6-sol"), lines.join("\n"));
  });

  // A failed read keeps what was read before.
  await withProxy(async () => new Response("down", { status: 503 }), async (api, _requests, lines) => {
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    assert.equal(await api.refreshSimeonModelRoles({ getAccessToken: async () => "simeon_da_token" }), undefined);
    assert.equal(api.configuredSimeonModel(), "claude-sonnet-5-5");
    assert.ok(lines.some((line) => line === "[simeon] model-roles unread status=503"), lines.join("\n"));
  });

  const { module: api, dispose } = await load();
  try {
    assert.equal(api.parseSimeonModelRoles({ code: 0, data: "nope" }), undefined);
    assert.deepEqual(api.parseSimeonModelRoles({ data: [
      { modelId: "x-video", role: "primary", transportApi: "gemini-generate-content" },
      { modelId: "closed", role: "cheap", transportApi: "openai-responses", accessible: false },
      { modelId: " gpt-6-sol ", role: "primary" },
    ] }), { primary: "gpt-6-sol" });
  } finally {
    await dispose();
  }
});

test("a turn follows the primary role; the cheap and helper sessions follow theirs; the environment still wins", async () => {
  const { module: api, dispose } = await load();
  const previous = process.env.SAND_SIMEON_MODEL;
  try {
    delete process.env.SAND_SIMEON_MODEL;
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    // The host names GPT-6 Sol on every turn (DEFAULT_SAND_MODEL).
    assert.equal(api.simeonModelForSession({ modelId: "gpt-6-sol" }), "claude-sonnet-5-5");
    assert.equal(api.simeonModelForSession({ modelId: "gpt-6-sol", isComputerUseSubagent: true }), "claude-sonnet-5-5");
    assert.equal(api.simeonModelForSession({ isSummarizationSession: true, modelId: "gemini-2.5-flash" }), "claude-haiku-5-5");
    assert.equal(api.simeonModelForSession({ cheap: true }), "claude-haiku-5-5");
    // The upstream app's own ids are still not ours to call.
    assert.equal(api.simeonModelForSession({ modelId: "claude-opus-4-8", isComputerUseSubagent: true }), "claude-sonnet-5-5");
    assert.equal(api.isConfiguredSimeonModelId("claude-opus-4-8"), false);
    assert.equal(api.isConfiguredSimeonModelId("gpt-6-sol"), true);
    assert.equal(api.simeonWireFor("claude-haiku-5-5"), "anthropic");
    assert.equal(api.simeonWireFor("gpt-6-sol"), "openai");

    process.env.SAND_SIMEON_MODEL = "gpt-6-sol";
    assert.equal(api.simeonModelForSession({ modelId: "gpt-6-sol" }), "gpt-6-sol");
  } finally {
    api.setSimeonModelRolesForTest({});
    if (previous === undefined) delete process.env.SAND_SIMEON_MODEL; else process.env.SAND_SIMEON_MODEL = previous;
    await dispose();
  }
});

test("a Claude call carries effort, thinking that survives a rewritten prompt, cache breakpoints, and is metered three ways", async () => {
  await withProxy(async () => claudeStream(), async (api, requests, lines) => {
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    const session = api.createProviderPromptSession("simeon", { modelId: "gpt-6-sol" });
    assert.equal(session.getModelId(), "claude-sonnet-5-5");
    const { parts, usage } = await drain(session.getExecutor([{ role: "system", content: "You are Simeon." }, { role: "user", content: "hi" }]).stream(undefined, "inv-1"));

    assert.equal(requests.length, 1);
    const [sent] = requests;
    assert.equal(sent.url, "https://api.simeonlabs.com/desktop/api/proxy/v1/messages");
    assert.equal(sent.headers.get("authorization"), "Bearer simeon_da_token");
    assert.equal(sent.headers.get("x-api-key"), null, "the provider's placeholder key never leaves");
    assert.match(sent.headers.get("anthropic-beta") ?? "", /thinking-binding-controls-2026-08-01/);
    assert.equal(sent.headers.get("x-simeon-call-reason"), "chat");
    assert.equal(sent.body.model, "claude-sonnet-5-5");
    assert.equal(sent.body.stream, true);
    assert.equal(sent.body.max_tokens, 32_000);
    assert.deepEqual(sent.body.output_config, { effort: "high" });
    assert.deepEqual(sent.body.thinking, { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
    assert.deepEqual(sent.body.cache_control, { type: "ephemeral" });
    assert.deepEqual(sent.body.system, [{ type: "text", text: "You are Simeon.", cache_control: { type: "ephemeral" } }]);
    for (const knob of ["temperature", "top_p", "top_k", "prompt_cache_key", "reasoning"]) assert.equal(knob in sent.body, false, knob);

    // The signature reaches the loop on a reasoning part it can pin it to.
    const reasoning = parts.findIndex((part) => part.type === "reasoning");
    const signature = parts.findIndex((part) => part.type === "reasoning-signature");
    assert.ok(reasoning >= 0 && signature > reasoning, parts.map((part) => part.type).join(","));
    assert.equal(parts[signature].signature, "sig-1");
    assert.equal(parts.filter((part) => part.type === "text-delta").map((part) => part.textDelta).join(""), "bonjour");

    // 40 fresh, 9,000 read and 1,200 written: the server meters each at its own price.
    assert.deepEqual({ ...usage, maxTokens: undefined }, { inputTokens: 40, outputTokens: 25, cacheReadTokens: 9_000, cacheWriteTokens: 1_200, maxTokens: undefined });
    const line = lines.find((one) => one.startsWith("[simeon] model=claude-sonnet-5-5"));
    assert.ok(line, lines.join("\n"));
    assert.match(line, / effort=high input=10240 cached=9000 output=25 /);
    assert.match(line, / written=1200$/);
  });
});

test("the cheap role runs on Haiku at low effort", async () => {
  await withProxy(async () => claudeStream({ text: "Title" }), async (api, requests) => {
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    const text = await api.runRoutedProviderText("simeon", [{ role: "user", content: "name this chat" }], { cheap: true });
    assert.equal(text, "Title");
    assert.equal(requests[0].body.model, "claude-haiku-5-5");
    assert.deepEqual(requests[0].body.output_config, { effort: "low" });
    assert.equal(requests[0].headers.get("x-simeon-call-reason"), "cheap");
  });
});

test("a thinking block goes back as it came; one without a signature, and a late system message, do not go as such", async () => {
  await withProxy(async () => claudeStream({ text: "done" }), async (api, requests) => {
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    const session = api.createProviderPromptSession("simeon", { modelId: "gpt-6-sol" });
    const history = [
      { role: "system", content: "You are Simeon." },
      { role: "user", content: "read a" },
      { role: "assistant", content: [
        { type: "reasoning", text: "", signature: "sig-1" },
        { type: "reasoning", text: "a GPT summary with no signature" },
        { type: "redacted-reasoning", data: "opaque" },
        { type: "tool-call", toolCallId: "toolu_1", toolName: "Read", args: { path: "a" } },
      ] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_1", toolName: "Read", result: "contents of a" }] },
      { role: "system", content: "Reminder: answer briefly." },
    ];
    await drain(session.getExecutor(history).stream(undefined, "inv-2"));
    const { messages, system } = requests[0].body;
    assert.equal(system.length, 1, "one system prompt, first");
    const assistant = messages.find((message) => message.role === "assistant");
    assert.deepEqual(assistant.content.map((block) => block.type), ["thinking", "redacted_thinking", "tool_use"]);
    assert.equal(assistant.content[0].signature, "sig-1");
    assert.equal(assistant.content[0].thinking, "");
    assert.equal(assistant.content[1].data, "opaque");
    const last = messages.at(-1);
    assert.equal(last.role, "user");
    assert.equal(last.content[0].type, "tool_result");
    assert.ok(last.content.some((block) => block.type === "text" && block.text === "Reminder: answer briefly."), JSON.stringify(last.content));
  });
});

test("Claude failing before it says anything hands the step to GPT-6 Sol, once", async () => {
  // The server stopped offering the model (the policy moved): a 400 the
  // fallback answers at once, without the SDK's own retries.
  await withProxy(async (request) => request.url.endsWith("/messages")
    ? Response.json({ type: "error", error: { type: "invalid_request_error", message: "This model is not offered by the desktop app." } }, { status: 400 })
    : responsesStream("from sol"), async (api, requests, lines) => {
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    const text = await api.runRoutedProviderText("simeon", [{ role: "user", content: "hi" }], {});
    assert.equal(text, "from sol");
    assert.deepEqual(requests.map((request) => new URL(request.url).pathname), ["/desktop/api/proxy/v1/messages", "/desktop/api/proxy/v1/responses"]);
    assert.equal(requests[1].body.model, "gpt-6-sol");
    assert.ok(lines.some((line) => line.startsWith("[simeon] model-fallback from=claude-haiku-5-5 to=gpt-6-sol") || line.startsWith("[simeon] model-fallback from=claude-sonnet-5-5 to=gpt-6-sol")), lines.join("\n"));
  });

  // Overloaded halfway through an answer: the person has read its start, so
  // the error stands and nothing is asked twice.
  await withProxy(async () => claudeStream({ text: "half", errorAfterText: true }), async (api, requests, lines) => {
    api.setSimeonModelRolesForTest(CLAUDE_ROLES);
    await assert.rejects(api.runRoutedProviderText("simeon", [{ role: "user", content: "hi" }], {}));
    assert.equal(requests.length, 1);
    assert.ok(!lines.some((line) => line.includes("model-fallback")), lines.join("\n"));
  });
});

test("what counts as Claude's provider failing", async () => {
  const { module: api, dispose } = await load();
  try {
    const status = (statusCode) => Object.assign(new Error(`status ${statusCode}`), { statusCode });
    for (const failing of [status(529), status(429), status(500), status(503), { lastError: status(529) }, new Error("Overloaded"), new TypeError("fetch failed")]) {
      assert.equal(api.isClaudeProviderFailure(failing), true, String(failing?.message ?? failing));
    }
    for (const ours of [status(400), status(401), status(402), status(413), new Error("messages.1.content.0: Invalid `signature` in `thinking` block")]) {
      assert.equal(api.isClaudeProviderFailure(ours), false, ours.message);
    }
    assert.equal(api.claudeEffortFor("none"), "low");
    assert.equal(api.claudeEffortFor("xhigh"), "xhigh");
    assert.equal(api.claudeEffortFor("bogus"), "high");
    // A body the rewrite cannot read goes out as it came.
    assert.equal(api.withClaudeRequestOptions("not json", "high"), "not json");
    const rewritten = JSON.parse(api.withClaudeRequestOptions(JSON.stringify({ model: "claude-haiku-5-5", system: [{ type: "text", text: "a" }, { type: "text", text: "b" }], temperature: 0, messages: [] }), "low"));
    assert.deepEqual(rewritten.system, [{ type: "text", text: "a" }, { type: "text", text: "b", cache_control: { type: "ephemeral" } }]);
    assert.equal("temperature" in rewritten, false);
  } finally {
    await dispose();
  }
});

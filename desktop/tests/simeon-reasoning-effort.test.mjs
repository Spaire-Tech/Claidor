import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// Reasoning effort follows the role. The upstream app ran its agent loop at high
// (SAND_DEFAULT_MODEL_SELECTION, effort high); since 2 October 2026 the loop
// starts at medium and climbs to high once a turn keeps working, the turns
// that only react (a nudge, a background wake) run at low, and the cheap
// roles — summarization, memory, the computer and browser subagents — stay
// at low (SAND_COMPUTER_USE_MODEL_SELECTION, effort low). Read off the wire,
// not off the helper alone: the fake Responses server records the body.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-effort-"));
  const output = path.join(temporary, "effort.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/simeon-host-loop-entry.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function textStream(text, model) {
  const events = [
    { type: "response.created", response: { id: "resp_text", created_at: 1_700_000_000, model } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ];
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const ENV_KEYS = ["SAND_DATA_ROOT", "SAND_BACKEND_URL", "SAND_SIMEON_REASONING_EFFORT", "SAND_SIMEON_CHEAP_REASONING_EFFORT"];
function pin(module, dataDir) {
  const previous = {};
  for (const key of ENV_KEYS) { previous[key] = process.env[key]; delete process.env[key]; }
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
  module.setSimeonCredentialSource({ getAccessToken: async () => "simeon_da_effort" });
  return () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

async function collect(executor) {
  const result = executor.stream({}, "inv-effort");
  for await (const _part of result.fullStream) { /* drain */ }
  await result.response;
}

test("effort follows the role: medium on the loop, low on the cheap sessions", async () => {
  const loaded = await loadHarness();
  const unpin = pin(loaded.module, loaded.dataDir);
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      requests.push(body);
      return textStream("ok", body.model);
    };
    const state = [{ role: "system", content: "You are the real system prompt." }, { role: "user", content: [{ type: "text", text: "hello" }] }];
    await collect(loaded.module.createProviderPromptSession("simeon").getExecutor(state));
    await collect(loaded.module.createProviderPromptSession("simeon", { cheap: true, isSummarizationSession: true }).getExecutor(state));
    await collect(loaded.module.createProviderPromptSession("simeon", { isComputerUseSubagent: true }).getExecutor(state));
    await collect(loaded.module.createProviderPromptSession("simeon", { isBrowserUseSubagent: true }).getExecutor(state));

    assert.deepEqual(requests.map((body) => [body.model, body.reasoning?.effort]), [
      ["gpt-6-sol", "medium"],
      ["gpt-6-luna", "low"],
      ["gpt-6-luna", "low"],
      ["gpt-6-luna", "low"],
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("the text helper carries the effort too, and the environment can override both", async () => {
  const loaded = await loadHarness();
  const unpin = pin(loaded.module, loaded.dataDir);
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      requests.push(body);
      return textStream("ok", body.model);
    };
    const messages = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
    await loaded.module.runRoutedProviderText("simeon", messages);
    await loaded.module.runRoutedProviderText("simeon", messages, { cheap: true });
    process.env.SAND_SIMEON_REASONING_EFFORT = "medium";
    process.env.SAND_SIMEON_CHEAP_REASONING_EFFORT = "MINIMAL";
    await loaded.module.runRoutedProviderText("simeon", messages);
    await loaded.module.runRoutedProviderText("simeon", messages, { cheap: true });
    process.env.SAND_SIMEON_REASONING_EFFORT = "turbo";
    await loaded.module.runRoutedProviderText("simeon", messages);

    assert.deepEqual(requests.map((body) => body.reasoning?.effort), ["medium", "low", "medium", "low", "medium"]);
    assert.equal(loaded.module.DEFAULT_SIMEON_REASONING_EFFORT, "medium");
    assert.equal(loaded.module.DEFAULT_SIMEON_CHEAP_REASONING_EFFORT, "low");
    assert.equal(loaded.module.simeonReasoningEffortForSession({ modelId: "gpt-6-luna" }, {}), "medium", "a model name is not a role; effort follows the role flags");
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("GPT-6 reaches OpenAI as a reasoning model under its real name, and falls back to the model it replaced on a server that does not offer it yet", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-gpt6-"));
  const output = path.join(temporary, "provider.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/extensions/inference/provider-session.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const loaded = { module: await import(`${pathToFileURL(output).href}?${Date.now()}`), dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
  try {
    const { sdkModelIdFor, withRealModelName, isModelNotOfferedError, LEGACY_SIMEON_MODELS, DEFAULT_SIMEON_MODEL, DEFAULT_SIMEON_CHEAP_MODEL } = loaded.module;
    assert.equal(DEFAULT_SIMEON_MODEL, "gpt-6-sol");
    assert.equal(DEFAULT_SIMEON_CHEAP_MODEL, "gpt-6-luna");
    assert.equal(sdkModelIdFor("gpt-6-sol"), "gpt-5-as:gpt-6-sol", "the SDK only treats o… and gpt-5… as reasoning models");
    assert.equal(sdkModelIdFor("gpt-5.6-terra"), "gpt-5.6-terra");
    assert.equal(sdkModelIdFor("claude-sonnet-5"), "claude-sonnet-5");
    assert.equal(JSON.parse(withRealModelName(JSON.stringify({ model: "gpt-5-as:gpt-6-sol", reasoning: { effort: "high" } }))).model, "gpt-6-sol");
    assert.equal(withRealModelName('{"model":"gpt-6-luna"}'), '{"model":"gpt-6-luna"}');
    assert.deepEqual(LEGACY_SIMEON_MODELS, { "gpt-6-sol": "gpt-5.6-terra", "gpt-6-luna": "gpt-5.6-luna" });
    assert.equal(isModelNotOfferedError(new Error("This model is not offered by the desktop app.")), true);
    assert.equal(isModelNotOfferedError(Object.assign(new Error("Bad Request"), { responseBody: '{"error":{"message":"This model is not offered by the desktop app."}}' })), true);
    assert.equal(isModelNotOfferedError(new Error("rate limit exceeded")), false);
  } finally {
    await loaded.dispose();
  }
});

test("a turn climbs from medium to high as it keeps working; an unnamed hidden turn stays low; a level in the environment holds", async () => {
  const loaded = await loadHarness();
  const unpin = pin(loaded.module, loaded.dataDir);
  const previousFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      requests.push(body);
      return textStream("ok", body.model);
    };
    const state = [{ role: "system", content: "You are the real system prompt." }, { role: "user", content: [{ type: "text", text: "hello" }] }];
    const steps = async (options, count) => { const session = loaded.module.createProviderPromptSession("simeon", options); for (let i = 0; i < count; i += 1) await collect(session.getExecutor(state)); };

    await steps(undefined, 6);
    assert.deepEqual(requests.splice(0).map((body) => body.reasoning?.effort), ["medium", "medium", "medium", "medium", "high", "high"]);
    await steps({ hidden: true }, 6);
    assert.deepEqual(requests.splice(0).map((body) => body.reasoning?.effort), ["low", "low", "low", "low", "low", "low"]);
    await steps({ hidden: true, callReason: "nudge" }, 5);
    assert.deepEqual(requests.splice(0).map((body) => body.reasoning?.effort), ["medium", "medium", "medium", "medium", "high"], "a reply nudge delivers what the person reads");
    await steps({ hidden: true, fullStepBudget: true, callReason: "routine" }, 5);
    assert.deepEqual(requests.splice(0).map((body) => body.reasoning?.effort), ["medium", "medium", "medium", "medium", "high"]);
    await steps({ isComputerUseSubagent: true }, 6);
    assert.deepEqual(requests.splice(0).map((body) => body.reasoning?.effort), ["low", "low", "low", "low", "low", "low"]);
    process.env.SAND_SIMEON_REASONING_EFFORT = "high";
    await steps({ hidden: true }, 2);
    await steps(undefined, 6);
    assert.deepEqual(requests.splice(0).map((body) => body.reasoning?.effort), ["high", "high", "high", "high", "high", "high", "high", "high"]);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

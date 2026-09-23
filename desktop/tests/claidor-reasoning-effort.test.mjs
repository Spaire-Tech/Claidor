import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// Reasoning effort follows the role, as Grok Bot sets it: the agent loop at
// high (SAND_DEFAULT_MODEL_SELECTION, effort high) and the cheap roles —
// summarization, memory, the computer and browser subagents — at low
// (SAND_COMPUTER_USE_MODEL_SELECTION, effort low). Read off the wire, not
// off the helper alone: the fake Responses server records the body.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-effort-"));
  const output = path.join(temporary, "effort.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claidor-host-loop-entry.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
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

const ENV_KEYS = ["SAND_DATA_ROOT", "SAND_BACKEND_URL", "SAND_CLAIDOR_REASONING_EFFORT", "SAND_CLAIDOR_CHEAP_REASONING_EFFORT"];
function pin(module, dataDir) {
  const previous = {};
  for (const key of ENV_KEYS) { previous[key] = process.env[key]; delete process.env[key]; }
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
  module.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_effort" });
  return () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

async function collect(executor) {
  const result = executor.stream({}, "inv-effort");
  for await (const _part of result.fullStream) { /* drain */ }
  await result.response;
}

test("effort follows the role: high on the loop, low on the cheap sessions", async () => {
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
    await collect(loaded.module.createProviderPromptSession("claidor").getExecutor(state));
    await collect(loaded.module.createProviderPromptSession("claidor", { cheap: true, isSummarizationSession: true }).getExecutor(state));
    await collect(loaded.module.createProviderPromptSession("claidor", { isComputerUseSubagent: true }).getExecutor(state));
    await collect(loaded.module.createProviderPromptSession("claidor", { isBrowserUseSubagent: true }).getExecutor(state));

    assert.deepEqual(requests.map((body) => [body.model, body.reasoning?.effort]), [
      ["gpt-5.6-terra", "high"],
      ["gpt-5.6-luna", "low"],
      ["gpt-5.6-luna", "low"],
      ["gpt-5.6-luna", "low"],
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
    await loaded.module.runRoutedProviderText("claidor", messages);
    await loaded.module.runRoutedProviderText("claidor", messages, { cheap: true });
    process.env.SAND_CLAIDOR_REASONING_EFFORT = "medium";
    process.env.SAND_CLAIDOR_CHEAP_REASONING_EFFORT = "MINIMAL";
    await loaded.module.runRoutedProviderText("claidor", messages);
    await loaded.module.runRoutedProviderText("claidor", messages, { cheap: true });
    process.env.SAND_CLAIDOR_REASONING_EFFORT = "turbo";
    await loaded.module.runRoutedProviderText("claidor", messages);

    assert.deepEqual(requests.map((body) => body.reasoning?.effort), ["high", "low", "medium", "minimal", "high"]);
    assert.equal(loaded.module.DEFAULT_CLAIDOR_REASONING_EFFORT, "high");
    assert.equal(loaded.module.DEFAULT_CLAIDOR_CHEAP_REASONING_EFFORT, "low");
    assert.equal(loaded.module.claidorReasoningEffortForSession({ modelId: "gpt-5.6-luna" }, {}), "high", "a model name is not a role; effort follows the role flags");
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

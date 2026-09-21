import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The model call is stubbed so the test measures the router around it: what the
// router does when every remote (box) call fails.
const PROVIDER_STUB = `
export const routedCalls = [];
export async function runRoutedProviderText(provider, messages, options) {
  routedCalls.push({ provider, messages, tools: options?.tools });
  options?.onTextDelta?.("answer", "answer");
  return "answer";
}
`;

async function loadRouter() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-routed-turn-"));
  const stubPath = path.join(temporary, "provider-session-stub.mjs");
  await writeFile(stubPath, PROVIDER_STUB);
  const output = path.join(temporary, "inference-router.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/inference-router.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    plugins: [{
      name: "stub-provider-session",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /inference\/provider-session\.js$/ }, () => ({ path: stubPath }));
      },
    }],
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

async function waitFor(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for the routed turn to settle");
}

test("a routed turn completes when every box call fails", async () => {
  const loaded = await loadRouter();
  const previous = process.env.SAND_INFERENCE_PROVIDER;
  try {
    const events = [];
    const remoteCalls = [];
    const dataDir = path.join(loaded.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "openrouter" }));
    process.env.SAND_INFERENCE_PROVIDER = "openrouter";
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      env: { SAND_CLAIDOR_FULL_AGENT: "off", SAND_INFERENCE_PROVIDER: "openrouter" },
      postEvent: (family, payload) => events.push({ family, payload }),
      dispatchRemote: async (method) => { remoteCalls.push(method); throw new Error(`box unreachable (${method})`); },
    });

    const result = await router.dispatch("sendPrompt", { agentId: "agent-1", prompt: "hello", clientNonce: "nonce-1" });
    assert.equal(result.handled, true);
    assert.equal(result.value.provider, "claidor");

    await waitFor(() => events.some((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message"));

    const stored = JSON.parse(await readFile(path.join(dataDir, "inference-router-transcript.json"), "utf8"));
    const entries = stored.agents["agent-1"];
    assert.equal(entries.length, 2);
    assert.equal(entries[0].role, "user");
    assert.equal(entries[0].content, "hello");
    assert.equal(entries[0].id, "t0u");
    assert.equal(entries[1].role, "assistant");
    assert.equal(entries[1].content, "answer");
    assert.doesNotMatch(entries[1].content, /Router error/);

    assert.ok(remoteCalls.includes("getAgentTranscriptTail"));
    assert.ok(remoteCalls.includes("listRoutedMcpTools"));
    // The remote transcript was unreachable, so its turn numbering was not available;
    // the turn was numbered from the local store alone.
    assert.ok(events.some((event) => event.family === "transcript" && event.payload.entry?.id === "t0u"));
  } finally {
    if (previous === undefined) delete process.env.SAND_INFERENCE_PROVIDER;
    else process.env.SAND_INFERENCE_PROVIDER = previous;
    await loaded.dispose();
  }
});

test("choosing a hello card continues on Mac Claidor without a host runner turn", async () => {
  const loaded = await loadRouter();
  try {
    const events = [];
    const remoteCalls = [];
    const dataDir = path.join(loaded.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "claidor" }));
    await writeFile(path.join(dataDir, "inference-router-transcript.json"), JSON.stringify({
      schemaVersion: 2,
      agents: {
        "agent-1": [{
          provider: "claidor",
          role: "assistant",
          content: "",
          message: { type: "widget", widget: { prompt: "What first?", options: [{ label: "Research", value: "research" }] } },
          id: "t0s1",
          timestampMs: 1,
        }],
      },
    }));
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      env: {},
      postEvent: (family, payload) => events.push({ family, payload }),
      dispatchRemote: async (method, args) => {
        remoteCalls.push({ method, args });
        if (method === "respondToWidget") return { accepted: true };
        throw new Error(`box unreachable (${method})`);
      },
    });

    const result = await router.dispatch("respondToWidget", { agentId: "agent-1", entryId: "t0s1", value: "research" });
    assert.equal(result.handled, true);
    assert.deepEqual(result.value, { accepted: true });
    assert.ok(remoteCalls.some((call) => call.method === "respondToWidget" && call.args.skipTurn === true && call.args.value === "research"));
    assert.equal(remoteCalls.some((call) => call.method === "sendPrompt"), false);

    await waitFor(() => events.some((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message" && event.payload.entry?.message?.content === "answer"));
    assert.equal(events.some((event) => event.family === "transcript" && event.payload.type === "appended" && event.payload.entry?.role === "user"), false);
    const stamped = events.find((event) => event.family === "transcript" && event.payload.type === "updated" && event.payload.entry?.id === "t0s1");
    assert.equal(stamped.payload.entry.respondedValue, "research");

    const stored = JSON.parse(await readFile(path.join(dataDir, "inference-router-transcript.json"), "utf8"));
    const hidden = stored.agents["agent-1"].find((entry) => entry.hidden === true);
    assert.equal(hidden.role, "user");
    assert.equal(hidden.content, "research");

    const tail = await router.dispatch("getAgentTranscriptTail", { id: "agent-1" });
    assert.equal(tail.value.entries.some((entry) => entry.role === "user" && entry.content === "research"), false);
    assert.ok(tail.value.entries.some((entry) => entry.id === "t0s1" && entry.respondedValue === "research"));
  } finally {
    await loaded.dispose();
  }
});

test("a leftover hung Docker host cannot swallow a card tap", async () => {
  const loaded = await loadRouter();
  try {
    const events = [];
    const dataDir = path.join(loaded.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "claidor" }));
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      env: {},
      postEvent: (family, payload) => events.push({ family, payload }),
      dispatchRemote: () => new Promise(() => {}),
    });
    const started = Date.now();
    const result = await router.dispatch("respondToWidget", { agentId: "agent-1", entryId: "t0s1", value: "research" });
    assert.equal(result.handled, true);
    assert.deepEqual(result.value, { accepted: true });
    assert.ok(Date.now() - started < 1_500, "card admission must not wait on leftover Docker");
    await waitFor(() => events.some((event) => event.family === "transcript" && event.payload.entry?.kind === "send-message"));
  } finally {
    await loaded.dispose();
  }
});

test("the transcript tail still answers from local history when the box is down", async () => {
  const loaded = await loadRouter();
  const previous = process.env.SAND_INFERENCE_PROVIDER;
  try {
    const dataDir = path.join(loaded.dataDir, "data");
    await mkdir(dataDir, { recursive: true });
    process.env.SAND_INFERENCE_PROVIDER = "codex";
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({ version: 1, inferenceProvider: "codex" }));
    await writeFile(path.join(dataDir, "inference-router-transcript.json"), JSON.stringify({
      schemaVersion: 2,
      agents: { "agent-1": [{ provider: "codex", role: "user", content: "earlier", id: "t0u", timestampMs: 1 }] },
    }));
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      env: { SAND_CLAIDOR_FULL_AGENT: "off", SAND_INFERENCE_PROVIDER: "codex" },
      postEvent: () => {},
      dispatchRemote: async () => { throw new Error("box unreachable"); },
    });
    const result = await router.dispatch("getAgentTranscriptTail", { id: "agent-1" });
    assert.equal(result.handled, true);
    assert.equal(result.value.entries.length, 1);
    assert.equal(result.value.entries[0].id, "t0u");
    assert.equal(result.value.entries[0].content, "earlier");
  } finally {
    if (previous === undefined) delete process.env.SAND_INFERENCE_PROVIDER;
    else process.env.SAND_INFERENCE_PROVIDER = previous;
    await loaded.dispose();
  }
});

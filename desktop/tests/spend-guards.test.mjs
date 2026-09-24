import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The spend guards, added 22 September 2026 after one unattended first-run
// turn made 481 model calls in fifty minutes with nothing on screen
// (docs/product/spend-guards.md). Each guard is read off the code that
// enforces it, not off a helper alone.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function textStream(text, model) {
  const events = [
    { type: "response.created", response: { id: "resp_text", created_at: 1_700_000_000, model } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 60_000, output_tokens: 130, input_tokens_details: { cached_tokens: 59_000 }, output_tokens_details: { reasoning_tokens: 90 } } } },
  ];
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const ENV_KEYS = ["SAND_DATA_ROOT", "SAND_BACKEND_URL", "SAND_AGENT_MAX_STEPS", "SAND_HIDDEN_TURN_MAX_STEPS", "SAND_KEEP_BOX_RUNNING_ON_QUIT"];
function pin(module, dataDir) {
  const previous = {};
  for (const key of ENV_KEYS) { previous[key] = process.env[key]; delete process.env[key]; }
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
  module.setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_guard" });
  return () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

async function drain(executor) {
  const result = executor.stream({}, "inv-guard");
  for await (const _part of result.fullStream) { /* drain */ }
  await result.response;
  return result;
}

test("step caps: Grok Bot's 5,000 for an asked turn, 40 for a hidden one, both overridable", async () => {
  const loaded = await loadModule("tests/fixtures/claidor-host-loop-entry.ts", "step-caps");
  try {
    const { module } = loaded;
    assert.equal(module.SAND_AGENT_MAX_STEPS, 5_000);
    assert.equal(module.SAND_HIDDEN_TURN_MAX_STEPS, 40);
    assert.equal(module.resolveSandAgentStepCap({}, {}), 5_000);
    assert.equal(module.resolveSandAgentStepCap({ hidden: true }, {}), 40);
    assert.equal(module.resolveSandAgentStepCap({ hidden: true }, { SAND_HIDDEN_TURN_MAX_STEPS: "12" }), 12);
    assert.equal(module.resolveSandAgentStepCap({ hidden: false }, { SAND_AGENT_MAX_STEPS: "300" }), 300);
    assert.equal(module.resolveSandAgentStepCap({ hidden: true }, { SAND_AGENT_MAX_STEPS: "20" }), 20, "a hidden turn never exceeds the asked cap");
    assert.equal(module.resolveSandAgentStepCap({ hidden: true }, { SAND_HIDDEN_TURN_MAX_STEPS: "nope" }), 40);
    assert.match(module.stepBudgetExceededMessage(40, true), /without being asked.*40 model calls/);
  } finally {
    await loaded.dispose();
  }
});

test("a hidden session refuses its 41st model call; an asked session keeps going", async () => {
  const loaded = await loadModule("tests/fixtures/claidor-host-loop-entry.ts", "budget");
  const unpin = pin(loaded.module, loaded.dataDir);
  const previousFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (input, init) => { calls += 1; return textStream("ok", JSON.parse(init?.body ?? "{}").model); };
    const state = [{ role: "system", content: "brief" }, { role: "user", content: [{ type: "text", text: "hi" }] }];
    process.env.SAND_HIDDEN_TURN_MAX_STEPS = "3";
    const hidden = loaded.module.createProviderPromptSession("claidor", { hidden: true });
    // The turn shell asks for a fresh executor per step; the budget is the session's.
    for (let step = 0; step < 3; step += 1) await drain(hidden.getExecutor(state));
    assert.throws(() => hidden.getExecutor(state).stream({}, "inv-4"), /without being asked and reached its budget of 3 model calls/);
    assert.equal(calls, 3);

    const asked = loaded.module.createProviderPromptSession("claidor", {});
    for (let step = 0; step < 5; step += 1) await drain(asked.getExecutor(state));
    assert.equal(calls, 8);
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("every model call writes one line with its tokens, and cached tokens are counted", async () => {
  const loaded = await loadModule("tests/fixtures/claidor-host-loop-entry.ts", "call-log");
  const unpin = pin(loaded.module, loaded.dataDir);
  const previousFetch = globalThis.fetch;
  const lines = [];
  try {
    loaded.module.setModelCallLog((line) => lines.push(line));
    globalThis.fetch = async (input, init) => textStream("ok", JSON.parse(init?.body ?? "{}").model);
    const state = [{ role: "system", content: "brief" }, { role: "user", content: [{ type: "text", text: "hi" }] }];
    const result = await drain(loaded.module.createProviderPromptSession("claidor", {}).getExecutor(state));
    const usage = await result.extendedUsage;
    assert.equal(usage.cacheReadTokens, 59_000);
    assert.equal(usage.inputTokens, 1_000, "input is what was not cached");
    assert.equal(usage.outputTokens, 130);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[claidor\] model=gpt-5\.6-terra effort=high input=60000 cached=59000 output=130 reasoning=90 ms=\d+ tools=- offered=-$/);
    assert.equal(loaded.module.summarizeToolCalls([{ toolName: "SendMessage", args: { text: "hello there" } }, { toolName: "run_shell", args: { command: "ls" } }]), 'SendMessage({"text":"hello there"}) run_shell({"command":"ls"})');
  } finally {
    loaded.module.setModelCallLog(null);
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

test("the intro greets and stops: no assignment, no tools, until the person replies", async () => {
  const loaded = await loadModule("tests/fixtures/claidor-host-loop-entry.ts", "intro-prompt");
  try {
    const prompt = loaded.module.SAND_ONBOARDING_KICKSTART_PROMPT;
    assert.match(prompt, /Do not start any assignment yet/);
    assert.match(prompt, /Do not run commands, browse, open files or use the computer on this turn/);
    assert.match(prompt, /Work begins when they answer/);
    assert.doesNotMatch(prompt, /begin the assignment immediately/);
    assert.match(loaded.module.INTRODUCTION_UNDELIVERED_DETAIL, /will not try again on its own/);
  } finally {
    await loaded.dispose();
  }
});

test("the intro runs once: the lifecycle stops owing it after one attempt, delivered or not", async () => {
  const source = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts"), "utf8");
  const kickstart = source.slice(source.indexOf("async kickstartAgent("), source.indexOf("async requestDiskSaverAudit("));
  assert.match(kickstart, /\} else if \(!result\.aborted\) \{\s*\n[\s\S]*?session\.db\.setIntroductionPending\(false\);\s*\n\s*if \(!delivered\)/);
  assert.doesNotMatch(kickstart, /else if \(!result\.aborted && delivered\)/);
  assert.match(kickstart, /INTRODUCTION_UNDELIVERED_DETAIL/);
});

test("the token file survives a burst of concurrent connects", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "token-file");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "caisra-token-"));
  try {
    const settingsPath = path.join(dataDir, "settings.json");
    const writes = [];
    for (let index = 0; index < 25; index += 1) {
      writes.push(loaded.module.persistInferenceCredential(settingsPath, { accessToken: `token-${index}`, backendUrl: "https://api.simeonlabs.com", expiresAtMs: 1_800_000_000_000 + index }));
    }
    const targets = await Promise.all(writes);
    assert.equal(new Set(targets).size, 1);
    const written = JSON.parse(await readFile(targets[0], "utf8"));
    assert.equal(written.accessToken, "token-24", "the last write wins, and none of the others threw");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("quitting stops a local Docker box unless the person asked to keep it", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "stop-on-quit");
  try {
    const { module } = loaded;
    assert.equal(module.shouldStopLocalDockerBoxOnQuit("local-docker", {}), true);
    assert.equal(module.shouldStopLocalDockerBoxOnQuit("remote", {}), false);
    assert.equal(module.shouldStopLocalDockerBoxOnQuit("local-docker", { SAND_KEEP_BOX_RUNNING_ON_QUIT: "1" }), false);

    const lines = [];
    let stops = 0;
    assert.equal(await module.stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: {}, stop: async () => { stops += 1; }, log: (line) => lines.push(line) }), "stopped");
    assert.equal(stops, 1);
    assert.equal(await module.stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: { SAND_KEEP_BOX_RUNNING_ON_QUIT: "yes" }, stop: async () => { stops += 1; }, log: (line) => lines.push(line) }), "kept");
    assert.equal(stops, 1);
    assert.equal(await module.stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: {}, stop: async () => { throw new Error("daemon gone"); }, log: (line) => lines.push(line) }), "failed");
    assert.equal(await module.stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: {}, stop: () => new Promise(() => {}), log: (line) => lines.push(line), timeoutMs: 20 }), "timed-out");
    assert.ok(lines.some((line) => line.includes("stopped on quit")));
    assert.ok(lines.some((line) => line.includes("kept running on quit")));
    assert.ok(lines.some((line) => line.includes("daemon gone")));
  } finally {
    await loaded.dispose();
  }
});

test("the narration prints the failure's sentence, not only its type", async () => {
  const provider = await readFile(path.join(repoRoot, "source/electron-main/coordinator/production-provider.ts"), "utf8");
  assert.match(provider, /detail=\$\{report\.causeDetail\}/);
  const client = await readFile(path.join(repoRoot, "source/node-agent-coordinator/gateway/gateway-client.ts"), "utf8");
  assert.equal((client.match(/causeDetail: error instanceof Error \? error\.message : String\(error\)/g) ?? []).length, 2);
});

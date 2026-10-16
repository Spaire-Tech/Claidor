/**
 * A sleep taken while a helper runs ends when the helper does (15 October
 * 2026). In the founder's Apple sign-in the agent slept AwaitShell's whole
 * 45 s and then 40 s with no task id while its browser helper had already
 * finished: a helper's result is queued for the end of the turn, and only a
 * new user message ended such a sleep. 85 of the sign-in's 177 s.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function loadModule(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function helpers({ running }) {
  const listeners = new Set();
  return {
    signal: {
      hasRunningHelpers: () => running,
      onHelperSettled(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    },
    settle() { running = false; for (const listener of [...listeners]) listener(); },
    listening: () => listeners.size,
  };
}

async function sleep(awaitTool, context, blockUntilMs) {
  const tool = awaitTool;
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify({ block_until_ms: blockUntilMs }); })();
  const started = Date.now();
  const output = await tool.execute(context.createContext(), handler, argsStream, { toolCallId: "call-1" });
  const rendered = JSON.stringify(await tool.render(context.createContext(), output));
  return { rendered, elapsedMs: Date.now() - started };
}

test("a sleep taken while a helper runs ends when the helper finishes, and says to end the turn", async () => {
  const awaitModule = await loadModule("source/packages/agent/tools/core/await.ts", "await-helper-settle");
  const context = await loadModule("source/packages/context/core.ts", "context-helper-settle");
  const fake = helpers({ running: true });
  const tool = awaitModule.createAwaitTool({}, { toolName: "AwaitShell", enableSubagentAwaiting: false, enableJobCompletionNotifications: true, helperSettledSignal: fake.signal });
  setTimeout(() => fake.settle(), 60);
  const { rendered, elapsedMs } = await sleep(tool, context, 45_000);
  assert.ok(elapsedMs < 5_000, `released after ${elapsedMs} ms, not the full 45 s`);
  assert.match(rendered, /Sleep released early after \d+ms: a subagent you started has finished\. End your turn now/);
  assert.equal(fake.listening(), 0, "the sleep stops listening once it ends");
});

test("a sleep with no helper running keeps its full length", async () => {
  const awaitModule = await loadModule("source/packages/agent/tools/core/await.ts", "await-plain-sleep");
  const context = await loadModule("source/packages/context/core.ts", "context-plain-sleep");
  const fake = helpers({ running: false });
  const tool = awaitModule.createAwaitTool({}, { toolName: "AwaitShell", enableSubagentAwaiting: false, enableJobCompletionNotifications: true, helperSettledSignal: fake.signal });
  const { rendered, elapsedMs } = await sleep(tool, context, 150);
  assert.ok(elapsedMs >= 140, `slept ${elapsedMs} ms`);
  assert.match(rendered, /Slept briefly\./);
  assert.equal(fake.listening(), 0, "no listener is left behind");
});

test("a helper's own AwaitShell never ends on a sibling settling; only the main agent's is given the helpers", async () => {
  const awaitModule = await loadModule("source/packages/agent/tools/core/await.ts", "await-helper-scope");
  const context = await loadModule("source/packages/context/core.ts", "context-await-scope");
  const fake = helpers({ running: true });
  const options = { toolName: "AwaitShell", enableSubagentAwaiting: false, enableJobCompletionNotifications: true, helperSettledSignal: fake.signal };
  const forHelper = awaitModule.withoutHelperSettledSignal(options);
  assert.equal("helperSettledSignal" in forHelper, false);
  assert.equal(forHelper.toolName, "AwaitShell", "everything else is kept");
  assert.equal(options.helperSettledSignal, fake.signal, "the agent's own options are untouched");
  // A helper sleeping 300 ms while a sibling settles at 30 ms: it sleeps on.
  setTimeout(() => fake.settle(), 30);
  const helperSleep = await sleep(awaitModule.createAwaitTool({}, forHelper), context, 300);
  assert.ok(helperSleep.elapsedMs >= 280, `the helper slept ${helperSleep.elapsedMs} ms`);
  assert.match(helperSleep.rendered, /Slept briefly\./);
  const toolset = await src("host/runner/tools/turn-toolset.ts");
  assert.match(toolset, /scope\?\.forSubagent === true \? withoutHelperSettledSignal\(input\.options\) : input\.options,/);
  assert.match(toolset, /const boxAwait = scoped\(factories\.boxAwait\?\.\(\{ forSubagent: host\.isSubagentRunner \}\)\);/);
  assert.equal((toolset.match(/factories\.boxAwait\?\.\(/g) ?? []).length, 1, "the one place AwaitShell is built for a turn");
});

test("the agent's AwaitShell is given its runner's helpers, and the runtime tells listeners on every settle", async () => {
  const composition = await src("host/host-runner-composition.ts");
  const boxAwait = composition.slice(composition.indexOf("createBoxAwaitToolInputs:"), composition.indexOf("createExternalReadToolInputs:"));
  assert.match(boxAwait, /helperSettledSignal:\s*\{/);
  assert.match(boxAwait, /hasRunningSubagents\?\.\(\)/);
  assert.match(boxAwait, /onSubagentSettled\?\.\(listener\)/);
  const runtime = await src("host/runner/subagent-runtime.ts");
  assert.match(runtime, /logLifecycle\("settled", subagentAgentId, record\.status\);\s*emitSubagentsChanged\(\);\s*for \(const listener of \[\.\.\.settledListeners\]\)/);
  assert.match(runtime, /onSubagentSettled\(listener: \(\) => void\): \(\) => void \{/);
  const runner = await src("host/runner/sand-agent-runner.ts");
  assert.match(runner, /onSubagentSettled\(listener: \(\) => void\): \(\) => void \{\s*return this\.subagents\.onSubagentSettled\(listener\);/);
});

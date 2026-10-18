/**
 * A background subagent leaves a record in the host log (24 September 2026).
 * The founder's test: "open Render in your browser" came back as "the task
 * finished without producing any text output", and the box's
 * /tmp/sand-host.log had no line saying a subagent had run at all — the
 * runtime's lifecycle line goes through the loop's logger, which the box
 * silences. Now the dispatch, the settle and the result the parent will
 * read each write a `[simeon] subagent=` line.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", packages: "external" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("dispatch, settle and the result reach the host log, an empty result included", async () => {
  const runtime = await load("source/host/runner/subagent-runtime.ts", "subagent-runtime");
  // The host log's default sink is console.info (the stdout channel that
  // reaches /tmp/sand-host.log); the bundle carries its own copy of the
  // module, so the lines are read off console.info itself.
  const lines = [];
  const info = console.info;
  console.info = (line) => { lines.push(String(line)); };
  try {
    const completions = [];
    const subagents = runtime.module.createSubagentRuntime({
      getConversationId: () => "agent-1",
      resolveBoxId: () => "box",
      emitAsyncTasksChanged: () => {},
      computerUse: { freeWindow: () => {} },
      now: () => 1_000,
    });
    subagents.setBackgroundSubagentHandler((completion) => completions.push(completion));
    subagents.dispatchBackgroundSubagent({ subagentAgentId: "sub-empty", subagentType: "computerUse", toolCallId: "call-1", prompt: "Open Render in the browser and report the page", run: async () => ({ text: "   ", aborted: false }) });
    subagents.dispatchBackgroundSubagent({ subagentAgentId: "sub-text", subagentType: "computerUse", toolCallId: "call-2", prompt: "Read the dashboard", run: async () => ({ text: "Render shows three services.", aborted: false }) });
    subagents.dispatchBackgroundSubagent({ subagentAgentId: "sub-error", subagentType: "computerUse", toolCallId: "call-3", prompt: "Click", run: async () => { throw new Error("box unreachable"); } });
    await subagents.drainBackgroundSubagents();

    assert.equal(completions.length, 3);
    assert.equal(completions.find((c) => c.subagentAgentId === "sub-empty").result, "(the task finished without producing any text output)");
    const subagentLines = lines.filter((line) => line.startsWith("[simeon] subagent="));
    assert.ok(subagentLines.some((line) => line.startsWith('[simeon] subagent=dispatched id=sub-empty type=computerUse title="Open Render in the browser and report the page"')), subagentLines.join("\n"));
    assert.ok(subagentLines.some((line) => line.startsWith("[simeon] subagent=settled id=sub-empty type=computerUse status=done")), subagentLines.join("\n"));
    assert.ok(subagentLines.some((line) => line === '[simeon] subagent=result id=sub-empty chars=53 text="(the task finished without producing any text output)"'), subagentLines.join("\n"));
    assert.ok(subagentLines.some((line) => line === '[simeon] subagent=result id=sub-text chars=28 text="Render shows three services."'), subagentLines.join("\n"));
    assert.ok(subagentLines.some((line) => line.startsWith("[simeon] subagent=settled id=sub-error type=computerUse status=error")), subagentLines.join("\n"));
    assert.ok(subagentLines.some((line) => line === '[simeon] subagent=result id=sub-error chars=15 text="box unreachable"'), subagentLines.join("\n"));
  } finally {
    console.info = info;
    await runtime.dispose();
  }
});

test("a stopped helper stuck in a step is ended for it after the grace period: the screen is freed, the agent told once (18 October 2026)", async (t) => {
  // Rhea's browser helper hung after one failed click; StopSubagent only
  // interrupted it, the interrupt is heard between steps, and the screen
  // stayed taken: three helpers sent after it were refused.
  const runtime = await load("source/host/runner/subagent-runtime.ts", "subagent-runtime-stop");
  t.after(runtime.dispose);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const freed = [];
  const completions = [];
  const subagents = runtime.module.createSubagentRuntime({
    getConversationId: () => "agent-1",
    resolveBoxId: () => "box",
    emitAsyncTasksChanged: () => {},
    computerUse: { freeWindow: (id) => freed.push(id) },
    now: () => 1_000,
  });
  subagents.setBackgroundSubagentHandler((completion) => completions.push(completion));
  let release;
  const stuck = new Promise((resolve) => { release = resolve; });
  const interrupts = [];
  subagents.sessions.set("sub-stuck", { interrupt: (reason) => interrupts.push(reason), getResolvedOutline: async () => [], getObservedToolCallCount: () => 1, getActivitySnapshot: () => ["[failed] browser_click: Clicking Add to cart didn't work"] });
  subagents.dispatchBackgroundSubagent({ subagentAgentId: "sub-stuck", subagentType: "browserUse", toolCallId: "call-1", prompt: "Add the deli set to the cart", run: () => stuck });
  assert.equal(subagents.abortSubagent("sub-stuck"), "ok");
  assert.deepEqual(interrupts, ["Stopped by the parent agent."]);
  assert.deepEqual(freed, [], "not before the grace period: it may still end on its own");
  assert.equal(subagents.isRunning("sub-stuck"), true);
  t.mock.timers.tick(runtime.module.SUBAGENT_STOP_GRACE_MS);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  assert.deepEqual(freed, ["sub-stuck"], "the screen is free for the next helper");
  assert.equal(subagents.isRunning("sub-stuck"), false);
  assert.equal(subagents.listSubagents().find((one) => one.subagentId === "sub-stuck").status, "aborted");
  // Its stuck step ending later settles nothing twice.
  release({ text: "late", aborted: false });
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  assert.deepEqual(freed, ["sub-stuck"]);
  assert.ok(completions.length <= 1, JSON.stringify(completions));
});

test("a stopped helper that ends its own turn in time is settled by it, not again by the timer", async (t) => {
  const runtime = await load("source/host/runner/subagent-runtime.ts", "subagent-runtime-stop-clean");
  t.after(runtime.dispose);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const freed = [];
  const subagents = runtime.module.createSubagentRuntime({ getConversationId: () => "agent-1", resolveBoxId: () => "box", emitAsyncTasksChanged: () => {}, computerUse: { freeWindow: (id) => freed.push(id) }, now: () => 1_000 });
  let finish;
  subagents.sessions.set("sub-ok", { interrupt: () => finish({ text: "", aborted: true }), getResolvedOutline: async () => [], getObservedToolCallCount: () => 0, getActivitySnapshot: () => [] });
  subagents.dispatchBackgroundSubagent({ subagentAgentId: "sub-ok", subagentType: "browserUse", toolCallId: "call-2", prompt: "Read the page", run: () => new Promise((resolve) => { finish = resolve; }) });
  subagents.abortSubagent("sub-ok");
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  assert.deepEqual(freed, ["sub-ok"]);
  t.mock.timers.tick(runtime.module.SUBAGENT_STOP_GRACE_MS);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  assert.deepEqual(freed, ["sub-ok"], "settled once");
});

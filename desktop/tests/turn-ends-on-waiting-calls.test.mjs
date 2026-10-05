import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// 5 October 2026: a step that only launched a background subagent or handed
// the box to the person ends the turn, like a final SendMessage does. Before,
// the loop asked the model once more and paid for an answer of nothing.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-turn-shape-"));
  const outfile = path.join(dir, "turn-shape.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/turn-shape.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const call = (toolName, toolCallId, args) => ({ role: "assistant", content: [{ type: "tool-call", toolName, toolCallId, args }] });
// The loop marks a failed tool on the message's upstream metadata (`highLevelToolCallResult.isError`).
const result = (toolCallId, isError = false) => ({ role: "tool", content: [{ type: "tool-result", toolCallId, result: "ok" }], ...(isError ? { providerOptions: { simeon: { highLevelToolCallResult: { isError: true } } } } : {}) });
const finalSend = (args) => args?.final === true;

test("a delivered background launch or box handoff ends the turn; a foreground launch or an errored one does not", async () => {
  const { module, dispose } = await loadModule();
  try {
    const { stepEndsTurn, waitingToolCallEndsTurn } = module;
    assert.ok(waitingToolCallEndsTurn("Task", { run_in_background: true }));
    assert.ok(waitingToolCallEndsTurn("Subagent", JSON.stringify({ run_in_background: true })));
    assert.ok(!waitingToolCallEndsTurn("Task", { run_in_background: false }));
    assert.ok(waitingToolCallEndsTurn("request_box_help", { instruction: "Sign in" }));
    assert.ok(!waitingToolCallEndsTurn("browser_click", {}));

    assert.ok(stepEndsTurn([call("Task", "a", { run_in_background: true }), result("a")], finalSend));
    assert.ok(stepEndsTurn([call("request_box_help", "b", { instruction: "Sign in" }), result("b")], finalSend));
    // A non-final SendMessage beside the launch: the model still has the floor.
    assert.ok(!stepEndsTurn([call("SendMessage", "s", { final: false }), result("s"), call("Task", "a", { run_in_background: true }), result("a")], finalSend));
    // A final SendMessage beside it ends the turn, as before.
    assert.ok(stepEndsTurn([call("SendMessage", "s", { final: true }), result("s"), call("Task", "a", { run_in_background: true }), result("a")], finalSend));
    assert.ok(!stepEndsTurn([call("Task", "a", { run_in_background: false }), result("a")], finalSend), "a foreground subagent returns its answer to the model");
    assert.ok(!stepEndsTurn([call("Task", "a", { run_in_background: true }), result("a", true)], finalSend), "a failed launch is the model's to handle");
    assert.ok(!stepEndsTurn([call("Task", "a", { run_in_background: true })], finalSend), "not answered yet");
    assert.ok(!stepEndsTurn([call("browser_click", "c", {}), result("c")], finalSend));
  } finally {
    await dispose();
  }
});

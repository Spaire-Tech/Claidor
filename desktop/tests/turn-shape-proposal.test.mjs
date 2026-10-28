/**
 * The closing nudge reruns a hidden turn when a turn ended on tool calls the
 * person never heard about. A proposal card is something they see, and
 * ProposeConnector itself tells the agent to end its turn there; until
 * 3 October 2026 the nudge counted it as silence and ran two more paid calls
 * after every connector proposal (the LinkedIn log of 2 October).
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-turn-shape-"));
  const outfile = path.join(dir, "turn-shape.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/turn-shape.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  return { module: await import(pathToFileURL(outfile).href), dispose: () => rm(dir, { recursive: true, force: true }) };
}

const call = (id, toolName, args = {}) => ({ type: "tool-call", toolCallId: id, toolName, args });
const result = (id, toolName) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName, result: "ok" }] });

function turn(lastTool) {
  return [
    { role: "user", content: "connect me to linkedin" },
    { role: "assistant", content: [call("c1", "SendMessage", { type: "text", content: "I'll check the LinkedIn connection option." })] },
    result("c1", "SendMessage"),
    { role: "assistant", content: [call("c2", "SearchPlugins", { query: "LinkedIn" })] },
    result("c2", "SearchPlugins"),
    { role: "assistant", content: [call("c3", lastTool, { plugin_id: "linkedin" })] },
    result("c3", lastTool),
  ];
}

test("a turn that ends on a proposal card is not silent: no closing nudge", async () => {
  const { module, dispose } = await load();
  try {
    assert.equal(module.turnEndedOnSilentToolCalls(turn("ProposeConnector")), false);
  } finally {
    await dispose();
  }
});

test("a turn that ends on a tool the person never hears about still is", async () => {
  const { module, dispose } = await load();
  try {
    assert.equal(module.turnEndedOnSilentToolCalls(turn("GetPlugin")), true);
  } finally {
    await dispose();
  }
});

// Iris, 28 October 2026: "Checking now", her mail tools, then nothing the
// person saw, every call answered. A turn ending in plain words was not
// counted as silent, so no closing nudge ran.
function iris(...tail) {
  return [
    { role: "user", content: "anything from the bank?" },
    { role: "assistant", content: [call("c1", "SendMessage", { type: "text", content: "Checking your mail now." })] },
    result("c1", "SendMessage"),
    { role: "assistant", content: [call("c2", "gmail_search", { query: "bank" })] },
    result("c2", "gmail_search"),
    ...tail,
  ];
}
const failed = (id) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "SendMessage", result: "error" }], providerOptions: { simeon: { highLevelToolCallResult: { isError: true } } } });

test("a turn that ends in plain words after its opening message is silent: the closing nudge runs", async () => {
  const { module, dispose } = await load();
  try {
    assert.equal(module.turnEndedOnSilentToolCalls(iris({ role: "assistant", content: [{ type: "text", text: "Two emails from the bank: a statement and a card renewal." }] })), true);
    assert.equal(module.turnEndedOnSilentToolCalls(iris({ role: "assistant", content: "Two emails from the bank." })), true);
  } finally {
    await dispose();
  }
});

test("a turn whose last SendMessage failed is silent", async () => {
  const { module, dispose } = await load();
  try {
    assert.equal(module.turnEndedOnSilentToolCalls(iris({ role: "assistant", content: [call("c3", "SendMessage", { type: "text", content: "Two emails." })] }, failed("c3"))), true);
  } finally {
    await dispose();
  }
});

test("a turn that sent its answer is not silent, whatever words follow", async () => {
  const { module, dispose } = await load();
  try {
    const answered = [{ role: "assistant", content: [call("c3", "SendMessage", { type: "text", content: "Two emails from the bank." })] }, result("c3", "SendMessage")];
    assert.equal(module.turnEndedOnSilentToolCalls(iris(...answered)), false);
    assert.equal(module.turnEndedOnSilentToolCalls(iris(...answered, { role: "assistant", content: [{ type: "text", text: "Done." }] })), false);
    assert.equal(module.turnEndedOnSilentToolCalls(iris(...answered, { role: "assistant", content: [{ type: "text", text: "  " }] })), false);
  } finally {
    await dispose();
  }
});

test("a turn with no opening message is left to the reply nudge", async () => {
  const { module, dispose } = await load();
  try {
    assert.equal(module.turnEndedOnSilentToolCalls([{ role: "user", content: "hi" }, { role: "assistant", content: "Hello!" }]), false);
  } finally {
    await dispose();
  }
});

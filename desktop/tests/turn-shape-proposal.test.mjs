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

// The shape helpers with the host's own `sendMessageEndsTurn`, as `turn-settle.ts` passes it.
async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-turn-shape-"));
  const outfile = path.join(dir, "turn-shape.mjs");
  await build({
    stdin: { contents: 'export * from "./turn-shape.ts"; export { sendMessageEndsTurn } from "./tools/send-message-schema.ts";', resolveDir: path.join(repoRoot, "source/host/runner"), loader: "ts" },
    outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent",
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const module = await import(pathToFileURL(outfile).href);
  return { module, silent: (messages) => module.turnEndedOnSilentToolCalls(messages, module.sendMessageEndsTurn), dispose: () => rm(dir, { recursive: true, force: true }) };
}

const call = (id, toolName, args = {}) => ({ type: "tool-call", toolCallId: id, toolName, args });
const result = (id, toolName) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName, result: "ok" }] });
const say = (id, content, extra = {}) => call(id, "SendMessage", { type: "text", content, ...extra });
const words = (text) => ({ role: "assistant", content: [{ type: "text", text }] });

function turn(lastTool) {
  return [
    { role: "user", content: "connect me to linkedin" },
    { role: "assistant", content: [say("c1", "I'll check the LinkedIn connection option.")] },
    result("c1", "SendMessage"),
    { role: "assistant", content: [call("c2", "SearchPlugins", { query: "LinkedIn" })] },
    result("c2", "SearchPlugins"),
    { role: "assistant", content: [call("c3", lastTool, { plugin_id: "linkedin" })] },
    result("c3", lastTool),
  ];
}

test("a turn that ends on a proposal card is not silent: no closing nudge", async () => {
  const { silent, dispose } = await load();
  try {
    assert.equal(silent(turn("ProposeConnector")), false);
  } finally {
    await dispose();
  }
});

test("a turn that ends on a tool the person never hears about still is", async () => {
  const { silent, dispose } = await load();
  try {
    assert.equal(silent(turn("GetPlugin")), true);
  } finally {
    await dispose();
  }
});

// Iris, 28 October 2026, morning: "Checking now", her mail tools, then nothing
// the person saw, every call answered. A turn ending in plain words was not
// counted as silent, so no closing nudge ran.
function iris(...tail) {
  return [
    { role: "user", content: "anything from the bank?" },
    { role: "assistant", content: [say("c1", "Checking your mail now.")] },
    result("c1", "SendMessage"),
    { role: "assistant", content: [call("c2", "gmail_search", { query: "bank" })] },
    result("c2", "gmail_search"),
    ...tail,
  ];
}
const failed = (id) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "SendMessage", result: "error" }], providerOptions: { simeon: { highLevelToolCallResult: { isError: true } } } });

test("a turn that ends in plain words after its opening message and work is silent: the closing nudge runs", async () => {
  const { silent, dispose } = await load();
  try {
    assert.equal(silent(iris(words("Two emails from the bank: a statement and a card renewal."))), true);
    assert.equal(silent(iris({ role: "assistant", content: "Two emails from the bank." })), true);
  } finally {
    await dispose();
  }
});

test("an opening message marked as more to come, then plain words, is silent", async () => {
  const { silent, dispose } = await load();
  try {
    const turn = [
      { role: "user", content: "what did the bank say?" },
      { role: "assistant", content: [say("c1", "One moment.", { final: false })] },
      result("c1", "SendMessage"),
      words("The bank says your card renews in November."),
    ];
    assert.equal(silent(turn), true);
  } finally {
    await dispose();
  }
});

test("a turn whose last SendMessage failed is silent", async () => {
  const { silent, dispose } = await load();
  try {
    assert.equal(silent(iris({ role: "assistant", content: [say("c3", "Two emails.", { final: true })] }, failed("c3"))), true);
  } finally {
    await dispose();
  }
});

test("a turn that sent its answer is not silent, whatever words follow", async () => {
  const { silent, dispose } = await load();
  try {
    const answered = [{ role: "assistant", content: [say("c3", "Two emails from the bank.")] }, result("c3", "SendMessage")];
    assert.equal(silent(iris(...answered)), false);
    assert.equal(silent(iris(...answered, words("Done."))), false);
    assert.equal(silent(iris(...answered, words("  "))), false);
  } finally {
    await dispose();
  }
});

// Iris, 28 October 2026, 8:53: she answered in two bubbles, ended in words,
// and the closing nudge (since #445) told her the person had seen only her
// opening message; she sent the answer a third time.
test("an answer sent first, then plain words, is not silent: no repeat", async () => {
  const { silent, dispose } = await load();
  try {
    const question = { role: "user", content: "so it should match the application?" };
    // The answer marked as the end of the turn.
    assert.equal(silent([question, { role: "assistant", content: [say("c1", "Yes, it should match."), say("c2", "The dates line up.", { final: true })] }, result("c1", "SendMessage"), result("c2", "SendMessage"), words("I answered.")]), false);
    // Unmarked, with nothing done after it.
    assert.equal(silent([question, { role: "assistant", content: [say("c1", "Yes, it should match.")] }, result("c1", "SendMessage"), words("That covers it.")]), false);
    // Marked final, then a tool that keeps something for later, then words.
    assert.equal(silent([question, { role: "assistant", content: [say("c1", "Yes, it should match.", { final: true })] }, result("c1", "SendMessage"), { role: "assistant", content: [call("c2", "memory_write", { content: "x" })] }, result("c2", "memory_write"), words("Saved.")]), false);
  } finally {
    await dispose();
  }
});

test("a turn with no opening message is left to the reply nudge", async () => {
  const { silent, dispose } = await load();
  try {
    assert.equal(silent([{ role: "user", content: "hi" }, { role: "assistant", content: "Hello!" }]), false);
  } finally {
    await dispose();
  }
});

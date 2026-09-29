/**
 * One run, one copy of a text message (26 September 2026). The founder's
 * box log after a Notion sign-in: one hidden resume run, two model calls,
 * each a SendMessage of "Notion is connected and ready…" (t38s6, t38s7).
 * Offline: the guard refuses the identical second text in the same run,
 * lets it through in another run, and ignores non-text messages; the
 * composition consults it before the message is emitted.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-repeat-send-"));
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/repeat-send-guard.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const READY = { type: "text", content: "Notion is connected and ready. I can search your workspace, read pages and databases, and update content you authorize. What should we do with it first?" };

test("the same text twice in one run is sent once; another run or another text is sent", async () => {
  const { module, dispose } = await load();
  try {
    const guard = module.createRepeatSendGuard();
    assert.equal(guard.repeatOf("run-1", READY, 1_000), null);
    guard.noteSent("run-1", READY, 1_000, "t38s6");
    // The resume run's second step: refused, and the model gets the first id.
    assert.equal(guard.repeatOf("run-1", { ...READY, content: `  ${READY.content}\n` }, 4_000), "t38s6");
    // A different text in the same run goes out.
    assert.equal(guard.repeatOf("run-1", { type: "text", content: "Here's the page." }, 5_000), null);
    // The same text in a later run goes out.
    assert.equal(guard.repeatOf("run-2", READY, 60_000), null);
    // Not text (a widget, a card), or text with images: never held back.
    guard.noteSent("run-3", { type: "widget", widget: {} }, 70_000, "t40s0");
    assert.equal(guard.repeatOf("run-3", { type: "widget", widget: {} }, 71_000), null);
    guard.noteSent("run-3", { ...READY, images: [{ url: "file:///a.png" }] }, 72_000, "t40s1");
    assert.equal(guard.repeatOf("run-3", { ...READY, images: [{ url: "file:///a.png" }] }, 73_000), null);
  } finally {
    await dispose();
  }
});

test("a run without an ack token is held to two minutes", async () => {
  const { module, dispose } = await load();
  try {
    const guard = module.createRepeatSendGuard();
    guard.noteSent(undefined, READY, 0, "t1s0");
    assert.equal(guard.repeatOf(undefined, READY, module.REPEAT_SEND_UNKEYED_WINDOW_MS - 1), "t1s0");
    assert.equal(guard.repeatOf(undefined, READY, module.REPEAT_SEND_UNKEYED_WINDOW_MS), null);
    // A keyed run never matches an unkeyed one.
    assert.equal(guard.repeatOf("run-9", READY, 10), null);
  } finally {
    await dispose();
  }
});

test("the composition asks the guard before emitting and records what it sent", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  const block = composition.slice(composition.indexOf("createSendMessageToolInputs: turn => ({"), composition.indexOf("createSendToAgentToolInputs: () => ({"));
  const ask = block.indexOf("repeatSendGuard.repeatOf(turn.ackToken, message, timestampMs)");
  const emit = block.indexOf("turn.emitUpdate?.({");
  const note = block.indexOf("repeatSendGuard.noteSent(turn.ackToken, message, timestampMs, messageId)");
  assert.ok(ask > 0 && emit > ask && note > emit, "guard, then emit, then record");
  assert.match(block, /send-message repeat not sent id=/);
});

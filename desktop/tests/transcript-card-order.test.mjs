import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// Cards (widgets, connectors, Allow) were hoisted to the top of the chat
// because the inference router concatenated host entries before local entries
// without interleaving by timestamp, and the renderer draws array order.
// stampTranscriptReply now sorts entries by timestampMs so the renderer
// always sees chronological order regardless of source ordering.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadStamp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-header-card-"));
  const outfile = path.join(dir, "stamp.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/permission-scope-stamp.ts")],
    outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent",
  });
  const module = await import(`${outfile}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const scope = { slot: "auth0|bass", revision: 1_700_000_000_000 };

test("entries from two sources are sorted by timestampMs so cards are not hoisted to top", async () => {
  const { module, dispose } = await loadStamp();
  try {
    // Simulate the inference-router concat: remote (host) entries first, then
    // local entries, without interleaving. The widget card at t=200 should end
    // up between the two text messages, not at the top.
    const remote = [
      { kind: "send-message", id: "t1s0", message: { type: "text", content: "Hello" }, timestampMs: 100 },
      { kind: "send-message", id: "t1s1", message: { type: "widget", widget: { prompt: "Deploy?", options: [{ label: "Yes" }] } }, timestampMs: 200 },
    ];
    const local = [
      { kind: "message", id: "t1u", role: "user", content: "hi", timestampMs: 150 },
      { kind: "send-message", id: "t1s2", message: { type: "text", content: "Done." }, timestampMs: 300 },
    ];
    const concat = [...remote, ...local];
    // Before the fix, the renderer would draw: Hello, Deploy?, hi, Done.
    // After the fix: Hello, hi, Deploy?, Done.
    const reply = { entries: concat, threadCounts: {} };
    const stamped = module.stampTranscriptReply("getAgentTranscriptTail", reply, scope, { sortByTimestamp: true });
    const ids = stamped.entries.map((e) => e.id);
    assert.deepEqual(ids, ["t1s0", "t1u", "t1s1", "t1s2"], "entries sorted chronologically by timestampMs");
    // The non-entry fields survive.
    assert.deepEqual(stamped.threadCounts, {});
  } finally {
    await dispose();
  }
});

test("already-sorted entries are returned by reference (no-op fast path)", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const entries = [
      { kind: "message", id: "t0u", role: "user", content: "hi", timestampMs: 10 },
      { kind: "send-message", id: "t0s0", message: { type: "text", content: "Hey" }, timestampMs: 20 },
    ];
    const reply = { entries };
    const stamped = module.stampTranscriptReply("openAgentTail", reply, scope, { sortByTimestamp: true });
    // No permission cards, no reordering — original reference should be kept.
    assert.equal(stamped, reply, "no-op returns original reference");
  } finally {
    await dispose();
  }
});

test("sorting works even without a permission scope (scope is null)", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const entries = [
      { kind: "send-message", id: "s1", message: { type: "connector", connector: "github", variant: "connect" }, timestampMs: 300 },
      { kind: "message", id: "u0", role: "user", content: "connect github", timestampMs: 100 },
      { kind: "send-message", id: "s0", message: { type: "text", content: "Sure" }, timestampMs: 200 },
    ];
    const reply = { entries };
    const result = module.stampTranscriptReply("getAgentTranscriptWindow", reply, null, { sortByTimestamp: true });
    assert.deepEqual(result.entries.map((e) => e.id), ["u0", "s0", "s1"]);
  } finally {
    await dispose();
  }
});

test("permission cards are stamped AND sorted in one pass", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const permCard = {
      kind: "send-message", id: "tbs0",
      message: { type: "local-tool-permission", ask: { requestId: "r1", action: "shell", target: "ls", status: "pending" } },
      timestampMs: 300,
    };
    const entries = [
      permCard,
      { kind: "message", id: "t0u", role: "user", content: "run ls", timestampMs: 100 },
      { kind: "send-message", id: "t0s0", message: { type: "text", content: "OK" }, timestampMs: 200 },
    ];
    const reply = { entries };
    const result = module.stampTranscriptReply("getAgentTranscriptTail", reply, scope, { sortByTimestamp: true });
    // Sorted chronologically.
    assert.deepEqual(result.entries.map((e) => e.id), ["t0u", "t0s0", "tbs0"]);
    // Permission card is stamped.
    const card = result.entries.find((e) => e.id === "tbs0");
    assert.equal(card.permissionScope, "auth0|bass");
    assert.equal(card.permissionScopeRevision, scope.revision);
  } finally {
    await dispose();
  }
});

test("entries without timestampMs sort to the beginning and keep their relative order", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const entries = [
      { kind: "send-message", id: "s1", message: { type: "text", content: "B" }, timestampMs: 200 },
      { kind: "message", id: "u0", role: "user", content: "A" },
      { kind: "send-message", id: "s0", message: { type: "text", content: "C" }, timestampMs: 100 },
    ];
    const reply = { entries };
    const result = module.stampTranscriptReply("getAgentTranscriptTail", reply, null, { sortByTimestamp: true });
    // u0 has no timestamp (→ 0), s0 is 100, s1 is 200.
    assert.deepEqual(result.entries.map((e) => e.id), ["u0", "s0", "s1"]);
  } finally {
    await dispose();
  }
});

test("non-TRANSCRIPT_REPLY_METHODS are passed through unchanged", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const entries = [
      { kind: "send-message", id: "s1", message: { type: "text", content: "B" }, timestampMs: 200 },
      { kind: "send-message", id: "s0", message: { type: "text", content: "A" }, timestampMs: 100 },
    ];
    const reply = { entries };
    const result = module.stampTranscriptReply("listAgents", reply, scope);
    assert.equal(result, reply, "non-transcript methods are untouched");
  } finally {
    await dispose();
  }
});

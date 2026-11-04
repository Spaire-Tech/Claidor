/**
 * Simeon's "Your turn on the computer" card on the founder's Mac
 * (4 November 2026): Skip and I'm done did nothing, only Take over worked.
 * A hand-off is kept in the engine's memory only; after the computer started
 * again (a new engine) the card's line still had no answer, so the apps
 * showed it waiting, and `handBackForeverBox` found no hand-off to end and
 * said nothing. Now the card's line is answered anyway and the agent told,
 * as a hand-off's end does.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function fakeApi(handlers) {
  return new Proxy({}, { get: (_target, name) => handlers[name] ?? (() => undefined) });
}

async function gatewayApi({ pending = null, open = null }) {
  const module = await load("source/host/host-gateway-api.ts", "gateway-api-handback");
  const calls = [];
  const session = fakeApi({
    pendingHandoff: () => pending,
    endHandoff: async (id, trigger) => { calls.push(["endHandoff", id, trigger]); },
  });
  const manager = fakeApi({
    newestOpenBoxRequestId: async (id) => { calls.push(["newestOpenBoxRequestId", id]); return open; },
    resolveBoxRequestEntry: async (id, requestId, resolution) => { calls.push(["resolve", id, requestId, resolution]); },
    emitForeverBoxStatus: async (id) => { calls.push(["status", id]); },
    resumeAfterBoxHandoff: async (id, trigger) => { calls.push(["resume", id, trigger]); },
  });
  const extensions = { api: (id) => id === "session" ? session : id === "transcript" ? manager : fakeApi({}) };
  const api = module.createHostGatewayApi({ extensions, hostEvents: { emit() {} }, decorateForeverBoxStatus: (s) => s, getHealth: () => ({ isBusy: false }), kickstartIfPending: async () => false, requestDiskSaverAudit: async () => false, releaseAgentBox: async () => {}, handleDesktopMcpAuthCompletion: async () => {}, forgetLocalToolPermission() {} });
  return { api, calls };
}

test("a live hand-off ends as before", async () => {
  const { api, calls } = await gatewayApi({ pending: { requestId: "r1", instruction: "Sign in" } });
  await api.handBackForeverBox({ id: "a1", trigger: "dismissed" });
  assert.deepEqual(calls, [["endHandoff", "a1", "dismissed"]]);
});

test("a card the computer forgot: Skip answers it Skipped and tells the agent; I'm done answers it Done", async () => {
  const skipped = await gatewayApi({ open: "r9" });
  await skipped.api.handBackForeverBox({ id: "a1", trigger: "dismissed" });
  assert.deepEqual(skipped.calls, [
    ["newestOpenBoxRequestId", "a1"],
    ["resolve", "a1", "r9", "dismissed"],
    ["status", "a1"],
    ["resume", "a1", "dismissed"],
  ]);
  const done = await gatewayApi({ open: "r9" });
  await done.api.handBackForeverBox({ id: "a1" });
  assert.deepEqual(done.calls.slice(1), [
    ["resolve", "a1", "r9", "completed"],
    ["status", "a1"],
    ["resume", "a1", "button"],
  ]);
});

test("nothing waiting and nothing to end: nothing happens", async () => {
  const { api, calls } = await gatewayApi({ open: null });
  await api.handBackForeverBox({ id: "a1", trigger: "button" });
  assert.deepEqual(calls, [["newestOpenBoxRequestId", "a1"]]);
});

test("the latest unanswered card is the one read from the chat", async () => {
  const module = await load("source/host/extensions/transcript/box-request-entries.ts", "box-request-entries");
  const entries = [
    { id: "1", kind: "send-message", boxRequestId: "old", boxResolution: "completed" },
    { id: "2", kind: "send-message", boxRequestId: "r9" },
    { id: "3", kind: "send-message", text: "Hello" },
  ];
  const session = { id: "a1", db: { getTranscriptEntries: () => entries } };
  const tm = { sessions: { isAgentGone: () => false, activeSession: session, liveSessions: new Map() } };
  const boxRequests = new module.BoxRequestEntries(tm);
  assert.equal(await boxRequests.newestOpenBoxRequestId("a1"), "r9");
  entries[1].boxResolution = "dismissed";
  assert.equal(await boxRequests.newestOpenBoxRequestId("a1"), null);
});

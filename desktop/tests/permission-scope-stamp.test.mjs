import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadStamp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-permission-scope-"));
  const outfile = path.join(dir, "stamp.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/permission-scope-stamp.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${outfile}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const card = (extra = {}) => ({
  kind: "send-message",
  id: "tbs0",
  message: { type: "local-tool-permission", ask: { requestId: "r1", action: "shell", target: "ls", status: "pending" } },
  timestampMs: 5,
  ...extra,
});
const scope = { slot: "auth0|bass", revision: 1_700_000_000_000 };

test("a permission card gets the account slot and the sign-in revision, once", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const stamped = module.stampPermissionScope(card(), scope);
    assert.equal(stamped.permissionScope, "auth0|bass");
    assert.equal(stamped.permissionScopeRevision, scope.revision);
    // Already stamped rows keep what they carry.
    const kept = module.stampPermissionScope(card({ permissionScope: "other", permissionScopeRevision: 3 }), scope);
    assert.equal(kept.permissionScope, "other");
    // Other rows are returned as they are.
    const text = { kind: "send-message", id: "t0s0", message: { type: "text", content: "hi" } };
    assert.equal(module.stampPermissionScope(text, scope), text);
    const user = { kind: "message", role: "user", id: "t0u", content: "hi" };
    assert.equal(module.stampPermissionScope(user, scope), user);
  } finally {
    await dispose();
  }
});

test("transcript events and read replies are stamped, and left alone without a scope", async () => {
  const { module, dispose } = await loadStamp();
  try {
    const appended = { type: "appended", agentId: "a", entry: card() };
    assert.equal(module.carriesPermissionCard(appended), true);
    assert.equal(module.stampTranscriptEvent(appended, scope).entry.permissionScope, "auth0|bass");
    assert.equal(module.stampTranscriptEvent(appended, null), appended);
    const snapshot = { type: "snapshot", activeAgentId: "a", entries: [{ kind: "message", role: "user", id: "t0u", content: "x" }, card()] };
    const stampedSnapshot = module.stampTranscriptEvent(snapshot, scope);
    assert.equal(stampedSnapshot.entries[1].permissionScopeRevision, scope.revision);
    assert.equal(stampedSnapshot.entries[0], snapshot.entries[0]);
    const textOnly = { type: "appended", agentId: "a", entry: { kind: "send-message", id: "t0s0", message: { type: "text", content: "hi" } } };
    assert.equal(module.carriesPermissionCard(textOnly), false);
    assert.equal(module.stampTranscriptEvent(textOnly, scope), textOnly);

    for (const method of module.TRANSCRIPT_REPLY_METHODS) {
      const reply = { entries: [card()], threadCounts: {} };
      assert.equal(module.carriesPermissionCard(reply), true);
      const stamped = module.stampTranscriptReply(method, reply, scope);
      assert.equal(stamped.entries[0].permissionScope, "auth0|bass");
      assert.deepEqual(stamped.threadCounts, {});
    }
    const other = { entries: [card()] };
    assert.equal(module.stampTranscriptReply("listAgents", other, scope), other);
    assert.equal(module.stampTranscriptReply("openAgentTail", other, null), other);
  } finally {
    await dispose();
  }
});

test("the coordinator stamps on the way through, and the desktop answers with the renderer's slot", async () => {
  const main = await readFile(path.join(repoRoot, "source/node-agent-coordinator/main.ts"), "utf8");
  const executors = await readFile(path.join(repoRoot, "source/electron-main/coordinator/coordinator-executors.ts"), "utf8");
  const provider = await readFile(path.join(repoRoot, "source/electron-main/coordinator/production-provider.ts"), "utf8");
  const renderer = await readFile(path.join(repoRoot, "frontend/src/production/ProductionRenderer.tsx"), "utf8");
  assert.match(main, /const permissionScopeRevision = Date\.now\(\)/);
  assert.match(main, /command<\{ slot\?: unknown \} \| null>\(commands, "getTranscriptAccountSlot", \{\}\)/);
  assert.match(main, /server\.postEvent\(family, stampTranscriptEvent\(event\.payload, permissionScope\(\)\)\)/);
  assert.match(main, /stampTranscriptReply\(method, outcome\.value, permissionScope\(\), \{ sortByTimestamp: !routesClaidorThroughHost\(\) \}\)/);
  assert.match(executors, /async getTranscriptAccountSlot\(\)/);
  // The same slot rule the renderer applies to its dock.
  assert.match(renderer, /account\.authId \?\? account\.email \?\? "account"/);
  assert.match(provider, /status\.authId \?\? status\.email \?\? "account"/);
});

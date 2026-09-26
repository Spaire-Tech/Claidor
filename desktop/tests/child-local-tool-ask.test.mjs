/**
 * A Task child's local-tool asks land on the agent's Allow surface (ledger
 * F-017, 26 September 2026), the way Grok Bot's runner had it: a child
 * inherited `getAgentId: () => session.id`, so its `getConversationId()`
 * was the agent's and only its transcript id was its own.
 *
 * Offline: the controller refuses a scope whose agent has no surface and
 * asks for one whose agent does; the composition gives every identity's
 * toolset the agent's id; and the reconstruction as first shipped
 * (`ce9fc2d8`) is the reference quoted in the comment.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadController() {
  const temporary = await mkdtemp(path.join(repoRoot, ".tmp-child-local-tool-ask-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/extensions/local-tool-permission/local-tool-permission-controller.ts")],
    outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent",
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the toolset scopes every identity's local tools to the agent's id", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  const lazy = composition.slice(composition.indexOf("const lazyToolHost = () => createProductionTurnToolsetHost({"));
  const body = lazy.slice(0, lazy.indexOf("});"));
  assert.match(body, /getConversationId: \(\) => session\.id,/);
  assert.doesNotMatch(body, /getConversationId: \(\) => identity\.conversationId,/);
  // The child keeps its own record: its transcript and state are its own.
  assert.match(composition, /conversationId: agentId,\n\s*transcriptId: agentId,/);
  // The one surface there is, keyed by the agent's session id.
  assert.match(composition, /if \(event\?\.request\?\.agentId !== session\.id\) return;/);
  const toolset = await readFile(path.join(repoRoot, "source/host/runner/tools/turn-toolset.ts"), "utf8");
  assert.match(toolset, /const agentId = host\.getConversationId\(\);/);
  assert.equal((toolset.match(/host\.getConversationId\(\)/g) ?? []).length, 1, "the toolset reads the id only for the local-tool scope");
});

test("an ask scoped to the agent reaches its surface; one scoped to a child id is refused", async () => {
  const loaded = await loadController();
  try {
    const { SandLocalToolPermissionController } = loaded.module;
    const created = [];
    const controller = new SandLocalToolPermissionController({
      getPermission: () => "ask",
      setPermission: () => {},
      // The one surface there is: the agent's chat.
      canAsk: (agentId) => agentId === "agent-1",
      hasLiveComputer: () => true,
      randomId: () => `ask-${created.length + 1}`,
    });
    controller.subscribe((event) => { if (event.type === "created") created.push(event.request); });
    const request = { action: "run-command", target: "ls ~/Documents" };
    // Scoped to a child's own id (the shape before this fix): refused.
    const refused = await controller.authorize({ agentId: "child-7", toolCallId: "call-1", action: "run-command" }, request);
    assert.equal(refused.allowed, false);
    assert.match(refused.reason, /nowhere to ask for it/);
    assert.equal(created.length, 0);
    // Scoped to the agent (Grok Bot's shape): the Allow card is raised in
    // the agent's chat, and Allow lets the child's command run.
    const decision = controller.authorize({ agentId: "agent-1", toolCallId: "call-2", action: "run-command" }, request);
    assert.equal(created.length, 1);
    assert.equal(created[0].agentId, "agent-1");
    controller.resolveRequest(created[0].id, "allow-once");
    assert.deepEqual(await decision, { allowed: true, approvalId: created[0].id });
  } finally {
    await loaded.dispose();
  }
});

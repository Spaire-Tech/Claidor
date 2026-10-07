/**
 * What a subagent starts from (7 October 2026). The founder's September
 * inbox log: an executor the agent dispatched for one email search opened
 * with the agent's whole conversation, every earlier Gmail result included,
 * and paid for it on each of its steps. The child runner is bound to the
 * agent's store (memory, blobs), and its conversation state fell through
 * to that store until it had saved a checkpoint of its own.
 *
 * Offline, this builds the real runner and binds it to a store holding a
 * conversation: a subagent starts empty and then keeps its own checkpoint;
 * the agent itself still reads the store.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  // Inside the repo, so the external packages resolve from node_modules.
  const dir = path.join(repoRoot, `.tmp-subagent-state-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({
    stdin: {
      contents: [
        'export { SandAgentRunner } from "./source/host/runner/sand-agent-runner.ts";',
        'export { ConversationStateStructure } from "./source/packages/proto/generated/agent/v1/agent_pb.js";',
      ].join("\n"),
      resolveDir: repoRoot,
      loader: "ts",
    },
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    packages: "external",
  });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function storeWithConversation(module) {
  const structure = new module.ConversationStateStructure({
    turns: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
  });
  return { getConversationStateStructure: () => structure };
}

test("a subagent bound to the agent's store starts with none of the agent's turns", async () => {
  const { module, dispose } = await load();
  try {
    const store = storeWithConversation(module);
    const child = new module.SandAgentRunner({ conversationId: "subagent-1", isSubagent: true, subagentType: "executor" });
    child.setAgentStore(store);
    assert.equal(child.getAgentConversationStateStructure().turns.length, 0);

    // After its first checkpoint the child reads its own state, not the store's.
    child.setAgentConversationStateStructure(new module.ConversationStateStructure({ turns: [new Uint8Array([9])] }));
    assert.equal(child.getAgentConversationStateStructure().turns.length, 1);

    // A reset puts it back to empty, not to the agent's conversation.
    child.reset();
    assert.equal(child.getAgentConversationStateStructure().turns.length, 0);
  } finally {
    await dispose();
  }
});

test("the agent itself still reads its conversation from the store", async () => {
  const { module, dispose } = await load();
  try {
    const agent = new module.SandAgentRunner({ conversationId: "agent-1" });
    agent.setAgentStore(storeWithConversation(module));
    assert.equal(agent.getAgentConversationStateStructure().turns.length, 2);
  } finally {
    await dispose();
  }
});

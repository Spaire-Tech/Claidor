import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("Grok Bot tools are the product tools, not the Settings Router", async () => {
  const loaded = await load("source/shared/grok-bot-tools.ts", "grok-bot-tools");
  try {
    const { GROK_BOT_TOOL_NAMES, CAISRA_PRODUCT_SYSTEM_PROMPT, buildCaisraProductSystemPrompt, sendMessageFromToolArgs, executeGrokBotTool } = loaded.module;
    assert.deepEqual([...GROK_BOT_TOOL_NAMES], ["SendMessage", "CreateAgent", "UpdateAgent", "SearchPlugins", "GetPlugin", "InstallPlugin"]);
    assert.match(CAISRA_PRODUCT_SYSTEM_PROMPT, /There is no Settings Router, no Claude Code/);
    assert.match(CAISRA_PRODUCT_SYSTEM_PROMPT, /question widget/);
    assert.match(CAISRA_PRODUCT_SYSTEM_PROMPT, /em dash/);
    assert.match(CAISRA_PRODUCT_SYSTEM_PROMPT, /not a corporate help desk/);
    assert.match(CAISRA_PRODUCT_SYSTEM_PROMPT, /Never open with a widget/);
    assert.match(CAISRA_PRODUCT_SYSTEM_PROMPT, /Never call CreateAgent until they have said what it is for/);
    const identified = buildCaisraProductSystemPrompt({ agentId: "agent-9", name: "Caisra", description: "helps with the week" });
    assert.match(identified, /Your agent_id is agent-9/);
    assert.match(identified, /Title: Caisra/);
    assert.deepEqual(sendMessageFromToolArgs({ type: "text", content: "Hey" }), { type: "text", content: "Hey" });
    assert.equal(sendMessageFromToolArgs({ type: "widget" }).error, "widget is required when type is widget");
    const calls = [];
    const created = await executeGrokBotTool("CreateAgent", { name: "Research", description: "reads the week" }, {
      agentId: "main",
      dispatchRemote: async (method, args) => {
        calls.push({ method, args });
        return { agent: { id: "agent-2", name: args.name } };
      },
      emitSendMessage: async () => "t0s0",
    });
    assert.match(created, /Created agent "Research" \(id: agent-2\)/);
    assert.equal(calls[0].method, "createAgent");
    assert.equal(calls[0].args.origin, "agent");
    const refused = await executeGrokBotTool("CreateAgent", { name: "Research" }, {
      agentId: "main",
      dispatchRemote: async (method, args) => {
        calls.push({ method, args });
        return { agent: { id: "agent-2", name: args.name } };
      },
      emitSendMessage: async () => "t0s0",
    });
    assert.match(refused, /Ask them first/);
    assert.equal(calls.length, 1);
    const renamed = await executeGrokBotTool("UpdateAgent", { agent_id: "agent-2", name: "Ben" }, {
      agentId: "main",
      dispatchRemote: async (method, args) => {
        calls.push({ method, args });
        if (method === "listAgents") return [{ id: "agent-2", name: "Research", description: "reads the week" }];
        return { id: "agent-2", name: args.profile.name };
      },
      emitSendMessage: async () => "t0s0",
    });
    assert.match(renamed, /Updated agent "Ben" \(id: agent-2\)/);
    const selfRename = await executeGrokBotTool("UpdateAgent", { name: "Ben" }, {
      agentId: "agent-2",
      dispatchRemote: async (method, args) => {
        calls.push({ method, args });
        if (method === "listAgents") return [{ id: "agent-2", name: "Research", description: "reads the week" }];
        return { id: "agent-2", name: args.profile.name };
      },
      emitSendMessage: async () => "t0s0",
    });
    assert.match(selfRename, /Updated agent "Ben" \(id: agent-2\)/);
  } finally {
    await loaded.dispose();
  }
});

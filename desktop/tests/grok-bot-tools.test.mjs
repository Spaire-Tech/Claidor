import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

test("Mac product tools and prompt are Grok Bot's, not a Caisra overlay", async () => {
  const loadedTools = await load("source/shared/grok-bot-tools.ts", "grok-bot-tools");
  const loadedPrompt = await load("source/host/runner/system-prompt.ts", "system-prompt");
  try {
    const { GROK_BOT_TOOL_NAMES, GROK_BOT_TOOLS, sendMessageFromToolArgs, executeGrokBotTool } = loadedTools.module;
    const { DEFAULT_SAND_SYSTEM_PROMPT, buildSandProductSystemPrompt } = loadedPrompt.module;
    assert.deepEqual([...GROK_BOT_TOOL_NAMES], ["SendMessage", "CreateAgent", "UpdateAgent", "SearchPlugins", "GetPlugin", "InstallPlugin"]);
    assert.match(DEFAULT_SAND_SYSTEM_PROMPT, /Your default is to act, not to ask/);
    assert.match(DEFAULT_SAND_SYSTEM_PROMPT, /Don't ask a go-ahead for something they already asked for/);
    assert.match(DEFAULT_SAND_SYSTEM_PROMPT, /A connect card is the user's own tap, so it needs no extra confirm/);
    assert.match(DEFAULT_SAND_SYSTEM_PROMPT, /once the user agrees, install it/);
    assert.match(DEFAULT_SAND_SYSTEM_PROMPT, /not a corporate help desk/);
    assert.doesNotMatch(DEFAULT_SAND_SYSTEM_PROMPT, /There is no Settings Router, no Claude Code/);
    assert.doesNotMatch(DEFAULT_SAND_SYSTEM_PROMPT, /Never open with a widget/);
    const identified = buildSandProductSystemPrompt({ name: "Yale", description: "helps with the week" });
    assert.match(identified, /Your agent name is "Yale"/);
    assert.match(identified, /Title: Yale/);
    assert.match(identified, /Description: helps with the week/);
    assert.match(identified, /Don't ask a go-ahead for something they already asked for/);
    const sendMessage = GROK_BOT_TOOLS.find(tool => tool.name === "SendMessage");
    assert.match(sendMessage.description, /ask rarely: by default decide and proceed/);
    const install = GROK_BOT_TOOLS.find(tool => tool.name === "InstallPlugin");
    assert.match(install.description, /confirm with a question widget first/);
    assert.match(install.description, /connect card is shown to the user automatically/);
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
    assert.equal(calls[0].args.isKickstartRequested, undefined);
    const unnamed = await executeGrokBotTool("CreateAgent", { name: "Research" }, {
      agentId: "main",
      dispatchRemote: async (method, args) => {
        calls.push({ method, args });
        return { agent: { id: "agent-3", name: args.name } };
      },
      emitSendMessage: async () => "t0s0",
    });
    assert.match(unnamed, /Created agent "Research" \(id: agent-3\)/);
    assert.equal(calls[1].args.description, "");
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
    await loadedTools.dispose();
    await loadedPrompt.dispose();
  }
});

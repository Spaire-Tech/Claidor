import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const { GROK_BOT_LOCAL_TOOL_NAMES, GROK_BOT_TOOL_NAMES, GROK_BOT_TOOLS, sendMessageFromToolArgs, executeGrokBotTool } = loadedTools.module;
    const { DEFAULT_SAND_SYSTEM_PROMPT, buildSandProductSystemPrompt } = loadedPrompt.module;
    assert.deepEqual([...GROK_BOT_LOCAL_TOOL_NAMES], ["SendMessage", "CreateAgent", "UpdateAgent", "SearchPlugins", "GetPlugin", "InstallPlugin", "ExternalShell", "ExternalRead"]);
    for (const name of ["Shell", "Read", "Computer", "Screenshot", "CopyToBox", "CopyFromBox", "Task", "WebSearch", "WebFetch", "SendToAgent", "GenerateImage", "browser_navigate", "browser_snapshot"]) {
      assert.ok(GROK_BOT_TOOL_NAMES.includes(name), `product turns include Grok Bot ${name}`);
      assert.ok(GROK_BOT_TOOLS.some(tool => tool.name === name), `GROK_BOT_TOOLS includes ${name}`);
    }
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
    assert.match(DEFAULT_SAND_SYSTEM_PROMPT, /ExternalShell and ExternalRead are the USER's computer/);
    const gatewayClient = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "gateway", "gateway-client.ts"), "utf8");
    assert.match(gatewayClient, /SAND_ENABLE_SLIM_AVATARS/);
    assert.match(gatewayClient, /if \(this\.slimAvatarsEnabled\) headers\[GATEWAY_SLIM_AVATARS_HEADER\] = "1"/);
    assert.doesNotMatch(gatewayClient, /SAND_DISABLE_SLIM_AVATARS/);
    const sendMessage = GROK_BOT_TOOLS.find(tool => tool.name === "SendMessage");
    assert.match(sendMessage.description, /ask rarely: by default decide and proceed/);
    const install = GROK_BOT_TOOLS.find(tool => tool.name === "InstallPlugin");
    assert.match(install.description, /confirm with a question widget first/);
    assert.match(install.description, /connect card is shown to the user automatically/);
    const shell = GROK_BOT_TOOLS.find(tool => tool.name === "ExternalShell");
    assert.match(shell.description, /you DO have the ability to run commands directly on the USER's system/);
    assert.match(shell.description, /do not claim you cannot access their machine/);
    assert.deepEqual(shell.inputSchema.required, ["command"]);
    assert.ok(shell.inputSchema.properties.working_directory);
    assert.ok(shell.inputSchema.properties.block_until_ms);
    const read = GROK_BOT_TOOLS.find(tool => tool.name === "ExternalRead");
    assert.match(read.description, /the user's computer/);
    assert.match(read.description, /Do not claim you cannot read their files/);
    assert.deepEqual(read.inputSchema.required, ["path"]);
    assert.ok(read.inputSchema.properties.offset);
    assert.ok(read.inputSchema.properties.limit);
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
    const shellRuns = [];
    const listed = await executeGrokBotTool("ExternalShell", { command: "du -sh ~", working_directory: "/Users/bass" }, {
      agentId: "main",
      dispatchRemote: async () => { throw new Error("should not dispatch"); },
      emitSendMessage: async () => "t0s0",
      runExternalShell: async input => {
        shellRuns.push(input);
        return "exit_code: 0\n\n12G\t/Users/bass";
      },
    });
    assert.equal(listed, "exit_code: 0\n\n12G\t/Users/bass");
    assert.deepEqual(shellRuns, [{ command: "du -sh ~", workingDirectory: "/Users/bass" }]);
    const readRuns = [];
    const file = await executeGrokBotTool("ExternalRead", { path: "/Users/bass/note.txt", offset: 1, limit: 20 }, {
      agentId: "main",
      dispatchRemote: async () => { throw new Error("should not dispatch"); },
      emitSendMessage: async () => "t0s0",
      readExternalFile: async input => {
        readRuns.push(input);
        return "     1|hello";
      },
    });
    assert.equal(file, "     1|hello");
    assert.deepEqual(readRuns, [{ path: "/Users/bass/note.txt", offset: 1, limit: 20 }]);
    const workspace = await mkdtemp(path.join(os.tmpdir(), "caisra-laptop-"));
    try {
      const notePath = path.join(workspace, "note.txt");
      await writeFile(notePath, "alpha\nbeta\ngamma\n");
      const liveRead = await executeGrokBotTool("ExternalRead", { path: notePath, offset: 2, limit: 1 }, {
        agentId: "main",
        dispatchRemote: async () => { throw new Error("should not dispatch"); },
        emitSendMessage: async () => "t0s0",
      });
      assert.match(liveRead, /2\|beta/);
      const liveShell = await executeGrokBotTool("ExternalShell", { command: "pwd", working_directory: workspace, block_until_ms: 5_000 }, {
        agentId: "main",
        dispatchRemote: async () => { throw new Error("should not dispatch"); },
        emitSendMessage: async () => "t0s0",
      });
      assert.match(liveShell, /exit_code: 0/);
      assert.match(liveShell, new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  } finally {
    await loadedTools.dispose();
    await loadedPrompt.dispose();
  }
});

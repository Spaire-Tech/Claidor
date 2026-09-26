/**
 * The founder's Notion thread (26 September 2026): the first write failed,
 * the agent said the connector was "adding its own Notion prefix twice" and
 * retried with a guessed shorter name. Grok Bot's CallMcpTool builds `name: "<server>-<tool>"` beside
 * `toolName: "<tool>"` (`buildMcpArgs`), and discovery sent `name` to
 * the server. It sends `toolName` now.
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
  const dir = path.join(repoRoot, `.tmp-connector-call-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/connector-call-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("a CallMcpTool call reaches the server under the server's own tool name", async () => {
  const { module, dispose } = await load();
  try {
    const sent = [];
    const core = {
      lastAccountDisplayConfig: () => ({ servers: [{ id: "900001", name: "Notion", serverIdentifier: "notion", accounts: [{ serverIdentifier: "notion" }], config: { url: "https://mcp.notion.com/mcp" } }] }),
      settingsStore: () => ({ getMcpDisabledToolsByServerId: () => ({}), getRawMcpCustomInstructionByServerId: () => undefined, getRawMcpCustomInstruction: () => undefined }),
      backendMcpExec: { executeTool: async (args) => { sent.push(args); return { result: { case: "success", value: { content: [] } } }; } },
      definitionSource: { getServerUrlForIdentifier: async () => "https://mcp.notion.com/mcp", getStdioServerConfigs: async () => ({}) },
    };
    const discovery = module.createMcpToolsDiscovery(core);
    // The shape Grok Bot's buildMcpArgs produces for server "notion", tool
    // "notion-create-pages".
    await discovery.executeTool(undefined, { name: "notion-notion-create-pages", toolName: "notion-create-pages", providerIdentifier: "notion", serverIdentifier: "notion", args: {}, toolCallId: "call-1" }, { agentId: "agent-1" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].toolName, "notion-create-pages");
    assert.equal(sent[0].serverIdentifier, "notion");
    // A caller that sets only `name` still reaches the server.
    await discovery.executeTool(undefined, { name: "notion-search", providerIdentifier: "notion", args: {}, toolCallId: "call-2" }, { agentId: "agent-1" });
    assert.equal(sent[1].toolName, "notion-search");
  } finally {
    await dispose();
  }
});

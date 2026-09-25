/**
 * The computerUse child, after the audit of 24 September 2026
 * (docs/product/computer-use-child-audit-2026-09-24.md). The founder's box
 * log: a child on Luna made seven calls, every one Shell printing a
 * sentence to itself, and ended with no text. Two things were found:
 * `isBoxScopedSubagent` was hard-coded false for every identity, and the
 * reconstruction's own subagent prompt (`buildSandSubagentSystemPrompt`)
 * had no caller, so the child read the 58,000-character agent brief.
 *
 * Offline, this measures: (1) the production toolset host built the way
 * the composition builds it for a computerUse child yields Computer and
 * none of the agent's own tools; (2) the child's assembled prompt is the
 * subagent prompt with the Computer section and none of the agent's brief;
 * (3) the composition's source no longer hard-codes the flag.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  // Inside the tree, so the UMD package the bundle leaves external resolves
  // from node_modules (`/.tmp*/` is ignored by git), as the loop test does.
  const dir = path.join(repoRoot, `.tmp-computer-child-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/computer-use-child-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const MODES = { hostShell: "shadow", boxShell: "shadow", mcp: "shadow", computer: "shadow", automationWrite: "off", cloudAgent: "shadow", subagentLaunch: "shadow" };

// The provider the composition builds (createTurnToolsetFactoryProvider),
// reduced to the factories this measurement is about: the computer tool on
// the box, and two of the agent's own tools a box-scoped child must not see.
function provider(calls) {
  const deps = { resourceAccessor: { get: () => undefined }, execute: async () => { throw new Error("not called"); }, getPersistImage: () => undefined };
  return {
    createComputerToolInputs: () => { calls.push("computer"); return { dependencies: deps }; },
    createScreenshotToolInputs: () => { calls.push("screenshot"); return { dependencies: deps }; },
    createWebSearchToolInputs: () => { calls.push("webSearch"); return { dependencies: { search: async () => ({ results: [] }) } }; },
  };
}

function toolNames(module, identity) {
  const calls = [];
  // No subagentConfigs: the Task tool needs the model info the real turn
  // carries, and it is not what this measures.
  const turn = { autoReviewModes: MODES };
  const props = { resourceAccessor: { get: () => undefined } };
  const host = module.createProductionTurnToolsetHost({
    turn,
    props,
    factoryProvider: provider(calls),
    isSubagentRunner: identity.isSubagentRunner,
    isSharedRoomRunner: false,
    isBoxScopedSubagent: identity.isSubagentRunner && (identity.isComputerUseSubagent || identity.isBrowserUseSubagent),
    isComputerUseSubagent: identity.isComputerUseSubagent,
    isBrowserUseSubagent: identity.isBrowserUseSubagent,
    isSystemPromptOverridden: false,
    remoteBoxHasDesktop: true,
    getConversationId: () => "agent-1",
    getRemoteBoxAvailable: () => true,
    cloudAgentsDisabledByTeam: () => false,
    spotlightEnabled: () => false,
  });
  const handle = module.buildTurnTools(host, turn, props);
  return { names: handle.getAllTools().map((tool) => tool.name).sort(), calls };
}

test("a computerUse child's toolset carries Computer and none of the agent's own tools", async () => {
  const { module, dispose } = await load();
  try {
    const child = toolNames(module, { isSubagentRunner: true, isComputerUseSubagent: true, isBrowserUseSubagent: false });
    assert.ok(child.names.includes("Computer"), `the child is offered Computer: ${child.names.join(",")}`);
    assert.ok(!child.names.includes("WebSearch"), `a box-scoped child has no WebSearch: ${child.names.join(",")}`);
    assert.ok(!child.names.includes("Screenshot"), "Screenshot is the agent's read-only tool, not the child's");
    assert.ok(!child.names.includes("Task"), "a child dispatches nothing");
    const agent = toolNames(module, { isSubagentRunner: false, isComputerUseSubagent: false, isBrowserUseSubagent: false });
    assert.ok(!agent.names.includes("Computer"), `the agent drives the desktop through a child, not Computer: ${agent.names.join(",")}`);
    assert.ok(agent.names.includes("WebSearch"), "the agent keeps its own tools");
  } finally {
    await dispose();
  }
});

test("a computerUse child's prompt is the subagent prompt with the Computer section, not the agent's brief", async () => {
  const { module, dispose } = await load();
  try {
    const base = module.buildSandSubagentSystemPrompt({ subagentType: "computerUse" });
    const deps = (identity) => ({
      basePrompt: identity.isSubagentRunner ? base : module.DEFAULT_SAND_SYSTEM_PROMPT,
      isSubagentRunner: identity.isSubagentRunner,
      isSharedRoomRunner: false,
      isSystemPromptOverridden: false,
      agentProfileProvider: () => ({ name: "Simeon", description: "chief of staff", filePath: "/home/box/.sand/agents/a1/profile.json", settingsFilePath: "/home/box/.sand/agents/a1/settings.json" }),
      agentStore: () => null,
      compactionEpoch: () => 0,
      memoryStore: () => null,
      memorySnapshots: () => null,
      userMemory: () => null,
      projectMemory: () => null,
      isBoxScopedSubagent: () => identity.isSubagentRunner,
      requestContext: { resolve: () => ({ timeZone: "Africa/Dakar" }) },
      automationStore: () => null,
      workflowStore: () => null,
      channelStore: () => null,
      connectorManifests: [],
      sendToAgentImpl: {},
      agentManagement: {},
      agentDirectory: () => [{ id: "a2", name: "Research", description: "reads the law" }],
      agentGroups: () => [],
      mcpManagement: () => null,
      mcpCustomInstructionsSection: () => null,
      mcpDiscoveryStatusSection: () => null,
      remoteBoxSection: () => (identity.isSubagentRunner ? "## Your box\nYou drive this agent's own desktop on the box" : "## Your box\nAlongside the user's computer you have the box"),
      computerSection: () => (identity.isSubagentRunner ? "## Computer\nYou drive this box's desktop with the Computer tool" : null),
    });
    const child = module.createSystemPromptAssembly(deps({ isSubagentRunner: true })).getSystemPrompt();
    const agent = module.createSystemPromptAssembly(deps({ isSubagentRunner: false })).getSystemPrompt();
    assert.match(child, /^You are Simeon running as the computerUse subagent\./, child.slice(0, 200));
    assert.match(child, /end your turn with a concise final answer in plain text/);
    assert.match(child, /## Computer\nYou drive this box's desktop with the Computer tool/);
    assert.doesNotMatch(child, /Reply first\. On any turn a person opened/, "the agent's turn rhythm is not the child's");
    assert.doesNotMatch(child, /Use the Task tool to hand a self-contained chunk of work/, "a child delegates nothing");
    assert.doesNotMatch(child, /Africa\/Dakar/, "a box-scoped child has no time-zone section");
    assert.doesNotMatch(child, /Research/, "a child gets no roster");
    assert.ok(child.length < 8_000, `the child's prompt is small: ${child.length} chars`);
    assert.match(agent, /Reply first\. On any turn a person opened/);
    assert.match(agent, /Africa\/Dakar/);
    assert.ok(agent.length > 50_000, `the agent's brief is the big one: ${agent.length} chars`);
  } finally {
    await dispose();
  }
});

test("the composition computes the box-scoped flag and gives a child the subagent prompt", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.doesNotMatch(composition, /isBoxScopedSubagent: false/, "no identity is hard-coded outside the box");
  assert.doesNotMatch(composition, /isBoxScopedSubagent: \(\) => false/);
  assert.equal((composition.match(/isBoxScopedSubagent: isBoxScopedTurn,/g) ?? []).length, 2, "the toolset host and the static config both take the computed flag");
  assert.match(composition, /isBoxScopedSubagent: \(\) => isBoxScopedIdentity\(promptIdentity\),/);
  assert.match(composition, /const isBoxScopedIdentity = \(promptIdentity: PromptIdentity\): boolean =>\n\s*promptIdentity\.isSubagentRunner && \(promptIdentity\.isComputerUseSubagent \|\| promptIdentity\.isBrowserUseSubagent\);/);
  assert.match(composition, /basePrompt: promptIdentity\.isSubagentRunner\n\s*\? buildSandSubagentSystemPrompt\(/);
  assert.match(composition, /boxScoped=\$\{isBoxScopedTurn\}/, "the prompt log line says whether the shell is box-scoped");
});

/**
 * The executor child's toolset (6 October 2026). The founder's box log: a
 * Job Search agent handed "find 4-6 real marketing openings" to an executor
 * child, which spent 1,235 reasoning tokens and answered "I can't verify
 * live listings from the information available", never having searched.
 * It could not: `buildTurnTools` returned an empty toolset for every child
 * that was not a computer or browser child, while the Task tool's
 * description promised the executor "your full work toolset (Shell, box
 * tools, web, MCP tools, CloudAgent)".
 *
 * Offline, this measures the production toolset host built the way the
 * composition builds it: an executor child gets the work tools and none of
 * the parent-only ones; a video child still gets nothing.
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
  const dir = path.join(repoRoot, `.tmp-executor-child-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/computer-use-child-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const MODES = { hostShell: "shadow", boxShell: "shadow", mcp: "shadow", computer: "shadow", automationWrite: "off", cloudAgent: "shadow", subagentLaunch: "shadow" };

// The provider the composition builds, reduced to the work tools this
// measurement is about and one parent-only tool a child must not see.
function provider() {
  const deps = { resourceAccessor: { get: () => undefined }, execute: async () => { throw new Error("not called"); }, getPersistImage: () => undefined };
  return {
    createComputerToolInputs: () => ({ dependencies: deps }),
    createScreenshotToolInputs: () => ({ dependencies: deps }),
    createWebSearchToolInputs: () => ({ dependencies: { search: async () => ({ results: [] }) } }),
    createWebFetchToolInputs: () => ({ dependencies: { fetch: async () => ({ content: "" }) } }),
  };
}

function toolNames(module, identity) {
  const turn = { autoReviewModes: MODES };
  const props = { resourceAccessor: { get: () => undefined } };
  const host = module.createProductionTurnToolsetHost({
    turn,
    props,
    factoryProvider: provider(),
    isSubagentRunner: identity.isSubagentRunner,
    isSharedRoomRunner: false,
    isBoxScopedSubagent: identity.isSubagentRunner && (identity.isComputerUseSubagent || identity.isBrowserUseSubagent),
    isComputerUseSubagent: identity.isComputerUseSubagent,
    isBrowserUseSubagent: identity.isBrowserUseSubagent,
    ...(identity.isVideoSubagent === undefined ? {} : { isVideoSubagent: identity.isVideoSubagent }),
    isSystemPromptOverridden: false,
    remoteBoxHasDesktop: true,
    getConversationId: () => "agent-1",
    getRemoteBoxAvailable: () => true,
    cloudAgentsDisabledByTeam: () => false,
    spotlightEnabled: () => false,
  });
  return module.buildTurnTools(host, turn, props).getAllTools().map((tool) => tool.name).sort();
}

const CHILD = { isSubagentRunner: true, isComputerUseSubagent: false, isBrowserUseSubagent: false };

test("an executor child is offered the web tools and none of the parent-only ones", async () => {
  const { module, dispose } = await load();
  try {
    const executor = toolNames(module, CHILD);
    assert.ok(executor.includes("WebSearch"), `the executor can search: ${executor.join(",")}`);
    assert.ok(executor.includes("WebFetch"), `the executor can read a page: ${executor.join(",")}`);
    for (const parentOnly of ["Task", "SendMessage", "SendToAgent", "CreateAgent", "Screenshot", "Computer"]) {
      assert.ok(!executor.includes(parentOnly), `${parentOnly} is not a child's tool: ${executor.join(",")}`);
    }
    const agent = toolNames(module, { isSubagentRunner: false, isComputerUseSubagent: false, isBrowserUseSubagent: false });
    assert.ok(agent.includes("WebSearch") && agent.includes("WebFetch"), "the agent keeps its own tools");
  } finally {
    await dispose();
  }
});

test("a video child still gets no tools", async () => {
  const { module, dispose } = await load();
  try {
    assert.deepEqual(toolNames(module, { ...CHILD, isVideoSubagent: true }), []);
  } finally {
    await dispose();
  }
});

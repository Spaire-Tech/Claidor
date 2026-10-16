/**
 * The tools the prompt names for a running helper (15 October 2026). The
 * prompt's "The box desktop" section tells the agent to "look in with
 * CheckSubagent", redirect a stuck helper with MessageSubagent and abort a
 * wedged one with StopSubagent. The founder's box log listed the agent's
 * tools without any of the three: `buildTurnTools` took them from a provider
 * hook nothing supplied, or from the loop's build props, which never carry
 * the host's dependencies. Claude, told to, called CheckSubagent anyway, and
 * the AI SDK failed the run (`unknown-tool-call.test.mjs`).
 *
 * Offline, with the production toolset host:
 * - the main agent is offered the three when the composition's provider
 *   hands over the runner's controller, and a helper is not;
 * - without that hook (the old composition) none is offered;
 * - CheckSubagent reads the runner's running helpers;
 * - the composition's provider supplies the hook from its dependencies.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = ["CheckSubagent", "MessageSubagent", "StopSubagent"];

async function load() {
  const dir = path.join(repoRoot, `.tmp-subagent-tools-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const bundle = async (entry, name) => {
    const outfile = path.join(dir, `${name}.mjs`);
    await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
    return import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  };
  const module = await bundle("tests/fixtures/computer-use-child-entry.ts", "entry");
  const context = await bundle("source/packages/context/core.ts", "context");
  const loop = await bundle("source/packages/agent/tool-stream-executor.ts", "loop");
  return { module, context, loop, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const MODES = { hostShell: "shadow", boxShell: "shadow", mcp: "shadow", computer: "shadow", automationWrite: "off", cloudAgent: "shadow", subagentLaunch: "shadow" };

function controller() {
  const helper = { subagentId: "agent-helper-1", subagentType: "browserUse", title: "Open the Apple sign-in", elapsedMs: 42_000, toolCallCount: 3, recentActivity: ["navigate https://appleid.apple.com", "click Sign in"], transcriptPath: null };
  const steered = [];
  return {
    steered,
    listRunningSubagents: () => [helper],
    getRunningSubagent: (id) => (id === helper.subagentId ? helper : undefined),
    steerSubagent: (id, message) => { steered.push([id, message]); return id === helper.subagentId ? "ok" : "not-running"; },
    abortSubagent: (id) => (id === helper.subagentId ? "ok" : "not-running"),
  };
}

function tools(module, { child, hook }) {
  const turn = { autoReviewModes: MODES, ...(child ? {} : { subagentConfigs: [] }) };
  // The Task tool's name reads the parent's model info (`task-tool-name.ts`).
  const props = { resourceAccessor: { get: () => undefined }, parentModelInfo: {} };
  const fake = controller();
  const host = module.createProductionTurnToolsetHost({
    turn,
    props,
    factoryProvider: hook ? { createSubagentManagementToolInputs: () => ({ controller: fake }) } : {},
    isSubagentRunner: child,
    isSharedRoomRunner: false,
    isBoxScopedSubagent: false,
    isComputerUseSubagent: false,
    isBrowserUseSubagent: false,
    isSystemPromptOverridden: false,
    remoteBoxHasDesktop: true,
    getConversationId: () => "agent-1",
    getRemoteBoxAvailable: () => true,
    cloudAgentsDisabledByTeam: () => false,
    spotlightEnabled: () => false,
  });
  return { all: module.buildTurnTools(host, turn, props).getAllTools(), fake };
}

test("the main agent is offered CheckSubagent, MessageSubagent and StopSubagent; a helper is not", async () => {
  const { module, dispose } = await load();
  try {
    const agent = tools(module, { child: false, hook: true }).all.map((tool) => tool.name);
    for (const name of NAMES) assert.ok(agent.includes(name), `${name} offered: ${agent.join(",")}`);
    const helper = tools(module, { child: true, hook: true }).all.map((tool) => tool.name);
    for (const name of NAMES) assert.ok(!helper.includes(name), `${name} is the parent's: ${helper.join(",")}`);
    // The old composition: no hook, and the loop's props carry no host dependencies.
    const before = tools(module, { child: false, hook: false }).all.map((tool) => tool.name);
    for (const name of NAMES) assert.ok(!before.includes(name), `${name} was never offered without the hook`);
  } finally {
    await dispose();
  }
});

test("CheckSubagent reads the running helpers; MessageSubagent reaches the one named", async () => {
  const { module, context, loop, dispose } = await load();
  try {
    const { all, fake } = tools(module, { child: false, hook: true });
    const byName = Object.fromEntries(all.map((tool) => [tool.name, tool]));
    // The loop's own path for a finished tool call (as in unknown-tool-call.test.mjs).
    // The two things the loop's interaction handler does for a plain tool: no abort, and run it.
    const handler = { getAbortSignal: () => undefined, executeToolCall: async (_ctx, _initial, _id, work) => work() };
    const run = async (name, args, id) => {
      const answer = await loop.executeDeferredToolCall(context.createContext(), { toolCallId: id, toolName: name, args }, byName, handler, {}, undefined, {}, undefined, Promise.resolve(args));
      return answer.content[0].result;
    };
    const text = (output) => (typeof output === "string" ? output : JSON.stringify(output));
    const listed = text(await run("CheckSubagent", {}, "call-1"));
    assert.match(listed, /1 subagent\(s\) running:/);
    assert.match(listed, /agent-helper-1 \[browserUse\] "Open the Apple sign-in" — running for 42s, 3 tool call\(s\)/);
    const detailed = text(await run("CheckSubagent", { subagent_id: "agent-helper-1" }, "call-2"));
    assert.match(detailed, /click Sign in/);
    const missing = text(await run("CheckSubagent", { subagent_id: "agent-gone" }, "call-3"));
    assert.match(missing, /No subagent "agent-gone" is currently running\..*Currently running: agent-helper-1\./);
    const sent = text(await run("MessageSubagent", { subagent_id: "agent-helper-1", message: "The person just signed in." }, "call-4"));
    assert.match(sent, /Message delivered to subagent agent-helper-1/);
    assert.deepEqual(fake.steered, [["agent-helper-1", "The person just signed in."]]);
  } finally {
    await dispose();
  }
});

test("the composition hands the runner's controller to the toolset", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /\.\.\.\(dependencies\.subagentManagement === undefined\n\s*\? \{\}\n\s*: \{\n\s*createSubagentManagementToolInputs: \(\): TurnSubagentManagementToolFactoryInput => \(\{\n\s*controller: dependencies\.subagentManagement as SubagentManagementController<unknown>,/);
  assert.match(composition, /const subagentManagement = createRunnerSubagentManagement\(builtRunner\);/);
  // And the prompt still names them, so the two agree.
  const glue = await readFile(path.join(repoRoot, "source/host/runner/prompt-collector-glue.ts"), "utf8");
  for (const name of NAMES) assert.ok(glue.includes(name), `the prompt names ${name}`);
});

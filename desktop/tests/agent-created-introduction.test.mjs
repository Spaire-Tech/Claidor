/**
 * An agent that another agent creates for the person introduces itself, the
 * way one the person creates does (1 October 2026, the founder: "when the
 * agent creates another agent for me, the new agent dont send me a message to
 * sort of onboard me"). The creating agent's brief, an inbound agent message,
 * no longer cancels the greeting; the person's own message, or a message the
 * agent already sent them, still does.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const lifecycleModule = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle");

function fakeHost(entries) {
  let pending = true;
  const prompts = [];
  const session = {
    id: "agent-new",
    db: {
      getIntroductionPending: () => pending,
      setIntroductionPending: (value) => { pending = value; },
      getTranscriptEntries: () => entries,
      getAgentPurpose: () => null,
    },
  };
  const runner = { run: async (prompt) => { prompts.push(prompt); return { aborted: false, sentMessageCount: 2 }; } };
  const tm = {
    sessions: { activeSession: null, resolveBackgroundSession: async () => session },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    execution: { canExecute: true, isRunReady: async () => true },
    runLifecycle: { inFlightRunCounts: new Map(), lastRequestIdBySession: new Map(), beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => { await run(); } },
    runnerRegistry: { getRunner: () => runner },
    turnRuntime: { activeRequestSources: new Map() },
    automationRuntime: { ensureHiddenTurnReply: async () => true },
    upgradeResume: { markAgentResumePending() {} },
    trayErrors: { pushError() {} },
    roster: { emitAgentUpdate: async () => {} },
    telemetry: { reportAgentError() {} },
  };
  return { lifecycle: new lifecycleModule.AgentLifecycle(tm), prompts, pending: () => pending };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const brief = { kind: "message", id: "u1", role: "user", content: "Bass wants you to track the budget.", fromAgent: { id: "agent-simeon", name: "Simeon" } };

test("a new agent briefed by the agent that created it still introduces itself to the person", async () => {
  const host = fakeHost([brief]);
  await host.lifecycle.kickstartCreatedAgent("agent-new");
  await settle();
  assert.equal(host.prompts.length, 1, "the first turn ran");
  assert.match(host.prompts[0], /^\[first run\] This is your very first turn\./);
  assert.equal(host.pending(), false, "and it runs once");
});

test("the person's own first message, or a message the agent already sent them, means no introduction is owed", async () => {
  for (const entries of [
    [{ kind: "message", id: "u1", role: "user", content: "Track my budget." }],
    [brief, { kind: "send-message", id: "s1", message: { type: "text", content: "Hi Bass, I'm Ledger." } }],
  ]) {
    const host = fakeHost(entries);
    assert.equal(await host.lifecycle.kickstartAgent("agent-new", true), false);
    await settle();
    assert.equal(host.prompts.length, 0);
    assert.equal(host.pending(), false);
  }
});

test("CreateAgent starts the new agent's introduction, and tells the creating agent so", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  const create = composition.slice(composition.indexOf("const agentManagement = {"), composition.indexOf("update: async (", composition.indexOf("const agentManagement = {")));
  assert.match(create, /"createBackgroundAgent"[\s\S]*void Promise\.resolve\(method\(transcript, "kickstartCreatedAgent"\)\?\.\(agent\.id\)\)\.catch\(\(\) => \{\}\);/);
  const manager = await readFile(path.join(repoRoot, "source/host/extensions/transcript/transcript-manager.ts"), "utf8");
  assert.match(manager, /\["kickstartCreatedAgent", "agentLifecycle"\]/);
  const tools = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-agent-management-tools.ts"), "utf8");
  assert.match(tools, /It introduces itself to the user in its own chat now, so there is no need to ask it to\./);
});

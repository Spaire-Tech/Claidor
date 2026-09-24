/**
 * The production system prompt reads the session's own stores. Found in the
 * 24 September 2026 audit: `createSystemPromptAssembly` in
 * host-runner-composition.ts was handed `() => null` for the memory, user
 * memory, project memory, automations, workflows and channels stores, and
 * `() => []` for the agent directory, while `bindSessionOwnedRunner` handed
 * the real stores to the runner, which only kept them. So whatever an agent
 * remembered, scheduled or was told about its teammates, its prompt said
 * nothing of it.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the production composition hands the prompt the session's stores and the live roster", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  const start = composition.indexOf("const createPromptAssemblyFor = (");
  const assembly = composition.slice(start, composition.indexOf("const runnerOptions: Record<string, unknown> = {", start));
  assert.ok(assembly.length > 0);
  for (const dep of ["memoryStore", "memorySnapshots", "userMemory", "projectMemory", "automationStore", "workflowStore", "channelStore"]) {
    assert.doesNotMatch(assembly, new RegExp(`${dep}: \\(\\) => null`), `${dep} is no longer null`);
  }
  assert.match(assembly, /memoryStore: \(\) => \(session\.memory \?\? null\)/);
  assert.match(assembly, /memorySnapshots: \(\) => \(session\.db \?\? null\)/);
  assert.match(assembly, /userMemory: \(\) => \(runnerOptions\.userMemory \?\? null\)/);
  assert.match(assembly, /projectMemory: \(\) => \(runnerOptions\.projectMemory \?\? null\)/);
  assert.match(assembly, /automationStore: \(\) => \(session\.automations \?\? null\)/);
  assert.match(assembly, /workflowStore: \(\) => \(session\.workflows \?\? null\)/);
  assert.match(assembly, /channelStore: \(\) => \(session\.channels \?\? null\)/);
  assert.match(assembly, /agentDirectory: listAgentDirectory,\n\s*agentGroups: listAgentGroups,/);
  assert.match(assembly, /compactionEpoch: readCompactionEpoch,/);
  assert.doesNotMatch(composition, /compactionEpoch: \(\) => 0/, "the epoch follows the summaries, so the frozen memory section thaws on compaction");
  assert.match(composition, /agentDirectory: listAgentDirectory,\n\s*agentGroups: listAgentGroups,\n\s*agentManagement,/, "the runner reads the same roster functions");
});

test("with real stores the prompt carries the memory, the automations and the roster", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt-assembly.ts", "prompt-assembly");
  try {
    let epoch = 0;
    let snapshot;
    const memory = { recall: () => ({ profile: [{ content: "The founder is called Bass.", createdAt: 1, kind: "profile" }], recent: [] }), getLocation: () => "/home/box/.sand/agents/a1/memory" };
    const assembly = module.createSystemPromptAssembly({
      basePrompt: "You are Simeon.",
      isSubagentRunner: false,
      isSharedRoomRunner: false,
      isSystemPromptOverridden: false,
      agentProfileProvider: () => ({ name: "Simeon", description: "chief of staff", filePath: "/home/box/.sand/agents/a1/profile.json", settingsFilePath: "/home/box/.sand/agents/a1/settings.json" }),
      agentStore: () => null,
      compactionEpoch: () => epoch,
      memoryStore: () => memory,
      memorySnapshots: () => ({ getMemoryPromptSnapshot: () => snapshot, setMemoryPromptSnapshot: (value) => { snapshot = value; } }),
      userMemory: () => null,
      projectMemory: () => null,
      isBoxScopedSubagent: () => false,
      requestContext: { resolve: () => ({ timeZone: "Africa/Dakar" }) },
      automationStore: () => ({ getLocation: () => "/home/box/.sand/agents/a1/automations", list: () => [], listDefinitions: () => [] }),
      workflowStore: () => ({ getLocation: () => "/home/box/.sand/agents/a1/workflows" }),
      channelStore: () => ({ getLocation: () => "/home/box/.sand/agents/a1/channels", listConnections: () => [] }),
      connectorManifests: [],
      sendToAgentImpl: {},
      agentManagement: {},
      agentDirectory: () => [{ id: "a2", name: "Research", description: "reads the law" }],
      agentGroups: () => [],
      agentsRootDir: () => "/home/box/.sand/agents",
      mcpManagement: () => null,
      mcpCustomInstructionsSection: () => null,
      mcpDiscoveryStatusSection: () => null,
      remoteBoxSection: () => "",
      computerSection: () => null,
    });
    const prompt = assembly.getSystemPrompt();
    assert.match(prompt, /The founder is called Bass\./, "the agent's memory is in the prompt");
    assert.match(prompt, /Research/, "the roster is in the prompt");
    assert.match(prompt, /Africa\/Dakar/, "the time zone is in the prompt");
    assert.ok(snapshot != null && snapshot.compactionEpoch === 0, "the memory section is frozen at epoch 0");
    memory.recall = () => ({ profile: [{ content: "The founder is called Bass.", createdAt: 1, kind: "profile" }, { content: "Bass prefers French.", createdAt: 2, kind: "profile" }], recent: [] });
    assert.doesNotMatch(assembly.getSystemPrompt(), /prefers French/, "a new fact waits for a compaction");
    epoch = 1;
    assert.match(assembly.getSystemPrompt(), /prefers French/, "after a compaction the memory section is rendered again");
  } finally {
    await dispose();
  }
});

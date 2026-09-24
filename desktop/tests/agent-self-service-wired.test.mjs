/**
 * Two things the founder's first evening with Simeon found (24 September 2026):
 * "Name yourself Simeon" failed with `deps.readProfile is not a function`, and
 * "open Render in your browser" failed with `No subagent types are available`.
 * Both were the production composition handing the real code less than it
 * required: the memory extension's agent state got no profile/settings deps,
 * and the Task tool got an empty list of subagent types.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("an agent can rename itself: updateProfile reads the profile and writes through the deps", async () => {
  const { module, dispose } = await load("source/host/extensions/memory/agent-state.ts", "agent-state");
  const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-agent-state-"));
  try {
    const writes = [];
    const settings = [];
    const state = module.createSandAgentState({
      agentId: "a1", agentDir: dir, sandRoot: dir,
      memory: { addMemory: () => ({ ok: true }), removeMemoryByContent: () => true },
      membership: { read: () => new Set(), join: () => true, leave: () => true },
      channels: { remove: () => false },
      automations: { upsert: () => null, update: () => null, setEnabled: () => null, remove: () => false, get: () => null },
      workflows: { create: () => null, update: () => null, remove: () => false },
      readProfile: () => ({ name: "New Agent", description: "helps", title: "", avatarShape: "", avatarColor: "" }),
      writeProfile: (profile) => writes.push(profile),
      writeSettings: (update) => settings.push(update),
    });
    const result = await state.updateProfile({ name: "Simeon" });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].name, "Simeon");
    assert.equal(writes[0].description, "helps", "an omitted field keeps its current value");
    const blank = await state.updateProfile({ name: "   " });
    assert.equal(blank.ok, false);
    await state.updateSettings({ hiddenFromSidebar: true });
    assert.deepEqual(settings, [{ hiddenFromSidebar: true }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

test("the production composition supplies readProfile, writeProfile and writeSettings, and builds the subagent types per run", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  const createAgentState = composition.slice(composition.indexOf('method(memory, "createAgentState")'), composition.indexOf('method(memory, "createAgentState")') + 2200);
  assert.match(createAgentState, /readProfile: \(\) => \{/);
  assert.match(createAgentState, /readSandProfileFile\(getSandProfilePath\(agentDir\)\)/);
  assert.match(createAgentState, /writeProfile: \(profile: Record<string, string>\) => \{/);
  assert.match(createAgentState, /method\(transcript, "updateAgent"\)\?\.\(session\.id, \{/);
  assert.match(createAgentState, /writeSettings: \(settings: Record<string, boolean>\) => \{/);
  assert.match(createAgentState, /method\(transcript, "setAgentNotifyOnUpdates"\)/);
  assert.match(createAgentState, /method\(transcript, "setAgentHiddenFromSidebar"\)/);

  assert.doesNotMatch(composition, /subagentConfigs: \[\],/, "the Task tool is no longer built with no types");
  assert.match(composition, /const resolveSubagentConfigs = \(\): readonly TaskSubagentModelConfig\[\] => \{/);
  assert.match(composition, /configs\.push\(createSandComputerUseSubagentConfig\(\{ browserUseOffered \}\)\)/);
  assert.match(composition, /if \(browserUseOffered\) configs\.push\(createSandBrowserUseSubagentConfig\(\)\)/);
  assert.match(composition, /isMultitaskEnabled"\)\?\.\(\) === true\) configs\.push\(createSandExecutorSubagentConfig\(\)\)/);
  assert.match(composition, /\.\.\.baseTurn,\n\s*subagentConfigs: resolveSubagentConfigs\(\),/);
});

test("the computer-use type resolves by name and is the default when nothing else is offered", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-computer-use-subagent.ts", "computer-use-config");
  try {
    const config = module.createSandComputerUseSubagentConfig({ browserUseOffered: false });
    assert.equal(config.subagent_type.type.case, "custom");
    assert.equal(config.subagent_type.type.value.name, "computerUse");
    assert.equal(module.isComputerUseSubagentType("computer-use"), true);
  } finally {
    await dispose();
  }
});

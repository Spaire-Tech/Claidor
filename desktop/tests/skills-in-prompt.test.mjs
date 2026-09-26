/**
 * The agent's skills reach the loop (26 September 2026; ledger F-050,
 * F-183). Offline: the session's workflow store, holding a skill (no
 * trigger, enabled), a routine (a trigger) and a disabled skill, yields
 * one `AgentSkill` with the file's path and description; an absent or
 * failing store yields none; and the production composition supplies the
 * resolver to the turn agent beside the request context.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-skills-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/workflow-agent-skills.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const workflow = (over) => ({ id: "w", name: "Weekly digest", description: "How to write the digest.", body: "# Digest", trigger: null, source: "workflow", sourceRef: null, isEnabledForAgent: true, createdAt: 1, filePath: "/home/box/sand-data/workflows/weekly-digest/SKILL.md", ...over });

test("the workflow library's skills become AgentSkill rows for the loop", async () => {
  const loaded = await load();
  try {
    const store = { list: () => [
      workflow({}),
      workflow({ id: "r", name: "Morning run", trigger: { schedule: "0 9 * * *", isEnabled: true }, filePath: "/home/box/sand-data/workflows/morning-run/SKILL.md" }),
      workflow({ id: "d", name: "Off", isEnabledForAgent: false, filePath: "/home/box/sand-data/workflows/off/SKILL.md" }),
      workflow({ id: "n", name: "No model", disableModelInvocation: true, filePath: "/home/box/sand-data/workflows/no-model/SKILL.md" }),
    ] };
    const skills = loaded.module.agentSkillsFromWorkflowStore(store);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].fullPath, "/home/box/sand-data/workflows/weekly-digest/SKILL.md");
    assert.equal(skills[0].description, "How to write the digest.");
    assert.equal(typeof skills[0].toJson, "function", "a proto message, as the request context carries it");
    assert.deepEqual(loaded.module.agentSkillsFromWorkflowStore(undefined), []);
    assert.deepEqual(loaded.module.agentSkillsFromWorkflowStore({ list: () => { throw new Error("db closed"); } }), []);
  } finally {
    await loaded.dispose();
  }
});

test("the production composition supplies the resolver to the turn agent", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /requestContext: turnRequestContext,\n(?:\s*\/\/.*\n)*\s*resolveAgentSkills: \(\) => agentSkillsFromWorkflowStore\(session\.workflows\),\n\s*includeTranscripts: !isSharedRoomTurn,/);
  const adapter = await readFile(path.join(repoRoot, "source/host/runner/agent-adapters.ts"), "utf8");
  assert.match(adapter, /agentSkills: this\.resolveAgentSkills\?\.\(\) \?\? \[\]/);
});

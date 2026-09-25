/**
 * Memory from conversation is wired on the production path (25 September
 * 2026, design-audit-ledger.md, cluster `memory`).
 *
 * At HEAD before this: the production shell adapter's host carried no
 * memoryStore, episodeProgress or isMemorableExchange, so turn-settle's
 * shouldRemember was false on every turn and nothing was ever remembered
 * from conversation (F-019, F-059, F-060); the settle's executor was the
 * agent's own Terra/high session (F-066); the memory extension had no
 * createUserMemory/createProjectMemory, so the user's and the projects'
 * shared memory shards were written and never read (F-062); a deleted
 * memory was looked up by the wrong key (F-063); the coordinator's method
 * table had no memory rows (F-064); the frozen memory prompt snapshot did
 * not thaw when memory changed (F-067); the state tool wrote notes with a
 * prefix the ranking did not recognise (F-068); setActiveAgent was handed an
 * object where a string is expected (F-069); the extraction prompt had no
 * rule about secrets (F-071); and the prompt limits were hardcoded beside
 * their constants (F-074).
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the production shell carries the turn's memory store, episode progress and the memorable predicate, on a cheap hidden session", async () => {
  const adapter = await src("host/runner/production-turn-run-shell-adapter.ts");
  for (const dep of ["memoryStore", "episodeProgress", "isMemorableExchange"]) {
    assert.match(adapter, new RegExp(`readonly ${dep}\\?: TurnRunShellHost\\["${dep}"\\];`), `${dep} is an input`);
    assert.match(adapter, new RegExp(`\\.\\.\\.\\(input\\.${dep} === undefined \\? \\{\\} : \\{ ${dep}: input\\.${dep} \\}\\),`), `${dep} reaches the host`);
  }
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /memoryStore: \(\) => \(session\.memory \?\? undefined\)/, "the agent's shell gets the session's memory");
  assert.match(composition, /episodeProgress: \(\) => session\.db as/, "and the db as episode progress");
  assert.match(composition, /isMemorableExchange,\n/, "and the predicate");
  assert.match(composition, /\.\.\.\(identity\.isSubagentRunner\n\s*\? \{\}\n\s*: \{\n\s*memoryStore:/, "a child's shell does not remember into the agent's memory");
  assert.match(composition, /modelId: SAND_SUMMARIZATION_MODEL_ID,\n\s*isSummarizationSession: true,\n\s*skipLabeling: true,\n[^\n]*\n\s*hidden: true,/, "the settle's executor is the cheap model on a hidden budget");
  assert.doesNotMatch(composition, /getExecutor: \(\) => owner\.runContext\.toolSession\.getExecutor\(\)/, "not the agent's own Terra/high session");
  assert.match(composition, /setOnChange\?\.\(\(\) => \{\n\s*\(session\.db as \{ clearMemoryPromptSnapshot\?/, "a memory change thaws the frozen prompt snapshot");
  const turnMemory = await src("host/runner/turn-memory.ts");
  assert.match(turnMemory, /memory extraction added=\$\{applied\.added\.length\} removed=\$\{applied\.removed\.length\}/, "the outcome reaches the box log");
  assert.match(turnMemory, /memory extraction failed/);
});

test("the memory extension serves user and project memory, and the shards are read back with provenance", async () => {
  const extension = await src("host/extensions/memory/extension.ts");
  assert.match(extension, /createUserMemory:\(options:\{agentId:string;resolveAgentName/);
  assert.match(extension, /createProjectMemory:\(options:\{agentDir:string;agentId:string;resolveAgentName/);
  const { module, dispose } = await load("source/host/extensions/memory/shared-memory.ts", "shared-memory");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-shared-memory-"));
  try {
    const names = { a1: "Simeon", a2: "Muse" };
    const resolve = (id) => names[id] ?? null;
    const user = module.createUserMemoryReader({ sandRoot: root, agentId: "a1", resolveAgentName: resolve });
    assert.deepEqual(user.recall({ profileLimit: 50, recentLimit: 15 }), { profile: [], recent: [] }, "no shards, no facts");
    await mkdir(path.join(root, "user-memory", "agents", "a2"), { recursive: true });
    const { FileMemoryStore } = await load("source/host/extensions/memory/memory-service.ts", "memory-service").then((r) => r.module);
    const immediate = { name: "t", wrap: (fn) => Object.assign(fn, { dispose() {} }) };
    const a2 = new FileMemoryStore(path.join(root, "user-memory", "agents", "a2"), immediate);
    assert.ok(a2.addMemory("The founder is called Bass.", 1_000, "profile"));
    assert.ok(a2.addMemory("They are in Dakar this week.", 2_000, "log"));
    const recalled = user.recall({ profileLimit: 50, recentLimit: 15 });
    assert.deepEqual(recalled.profile.map((r) => [r.content, r.via]), [["The founder is called Bass.", "Muse"]], "a fact from another agent's shard, credited to it");
    assert.deepEqual(recalled.recent.map((r) => r.content), ["They are in Dakar this week."]);
    assert.equal(user.getOwnShardLocation(), path.join(root, "user-memory", "agents", "a1"));

    const agentDir = path.join(root, "agents", "a1");
    await mkdir(path.join(root, "projects", "launch", "memory", "agents"), { recursive: true });
    await writeFile(path.join(root, "projects", "launch", "project.md"), "---\nname: Launch week\n---\nShip it.\n");
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(agentDir, "projects.json"), JSON.stringify({ projects: ["launch", "ghost"] }));
    const p = new FileMemoryStore(path.join(root, "projects", "launch", "memory", "agents", "a2"), immediate);
    assert.ok(p.addMemory("The launch date is 1 October.", 3_000, "log"));
    const project = module.createProjectMemoryReader({ sandRoot: root, agentDir, agentId: "a1", resolveAgentName: resolve });
    const blocks = project.recall({ profileLimit: 25, recentLimit: 10 }, 3);
    assert.deepEqual(blocks.injected.map((b) => [b.slug, b.name, b.recall.recent.map((r) => `${r.content} via ${r.via}`)]), [
      ["launch", "Launch week", ["The launch date is 1 October. via Muse"]],
      ["ghost", "ghost", []],
    ], "each joined project is a block, named from project.md, the slug when there is none");
    assert.deepEqual(blocks.alsoMemberOf, []);
    assert.equal(project.getLocation(), path.join(root, "projects"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("the small ones: delete key, coordinator rows, one note prefix, the active agent id, the secrets rule, the constants", async () => {
  const manager = await src("host/extensions/transcript/transcript-manager.ts");
  assert.match(manager, /this\.memory\.remove\(\{ agentId, id: memoryId \}\)/, "deleteAgentMemory looks the memory up by id (F-063)");
  const table = await src("shared/rpc/coordinator.ts");
  for (const row of ["getAgentMemories", "deleteAgentMemory", "clearAgentMemories"]) assert.match(table, new RegExp(`^  ${row}: \\{ args: "object", reply: "`, "m"), `${row} is in the method table (F-064)`);
  const families = await src("node-agent-coordinator/gateway/gateway-event-families.ts");
  assert.match(families, /memory: "memory"/, "the memory SSE family is known");
  const state = await src("host/extensions/memory/agent-state.ts");
  assert.doesNotMatch(state, /MEMORY_NOTE_PREFIX = /, "the state tool no longer defines its own note prefix (F-068)");
  assert.match(state, /import \{ MEMORY_NOTE_PREFIX, normalizeMemoryContent \} from "\.\.\/\.\.\/runner\/sand-memory\.js"/);
  const lifecycle = await src("host/extensions/transcript/run-lifecycle.ts");
  assert.match(lifecycle, /this\.tm\.memory\.setActiveAgent\(session\.id\);/, "setActiveAgent gets the id (F-069)");
  const { module, dispose } = await load("source/host/runner/sand-memory.ts", "sand-memory");
  try {
    assert.match(module.buildExtractionSystemPrompt(), /Never record a secret: no password, API key, token, credential/, "F-071");
    assert.equal(module.memoryImportance(`${module.MEMORY_NOTE_PREFIX}small thing`), 0.5, "a note written by the state tool now ranks as a note");
  } finally {
    await dispose();
  }
  const assembly = await src("host/runner/system-prompt-assembly.ts");
  assert.match(assembly, /userMemory\.recall\(\{ profileLimit: MEMORY_USER_PROFILE_PROMPT_LIMIT, recentLimit: MEMORY_USER_RECENT_PROMPT_LIMIT \}\)/, "F-074");
  assert.match(assembly, /projectMemory\.recall\(\{ profileLimit: MEMORY_PROJECT_PROFILE_PROMPT_LIMIT, recentLimit: MEMORY_PROJECT_RECENT_PROMPT_LIMIT \}, MEMORY_PROJECT_INJECTED_CAP\)/);
});

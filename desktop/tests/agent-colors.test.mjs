/**
 * New agents get colours of their own (7 October 2026). The founder's
 * staffing log: Simeon hired Leo, Nina and Ava in one step. None got a colour
 * stored, so the window drew each in the colour its id hashes to (the upstream app's
 * own fallback), and all three hashed to the same slot, Ocean, the blue
 * Simeon is stored with. Asked to tell them apart, Simeon messaged each to
 * draw its own picture: two refused, one generated an image, one wrote a
 * shell script, and every reply woke Simeon on his whole conversation again.
 *
 * Offline, this holds:
 * - the fallback is the window's hash, and the log's three ids all land on
 *   Ocean while the hash itself is even over random ids;
 * - the assignment order names every palette once, Ocean last;
 * - a pick takes the colour fewest agents are drawn in, an agent without a
 *   colour counting as its id's;
 * - three agents minted at once (as CreateAgent ×3 in one step) get three
 *   different colours, and a colour the caller gives is kept;
 * - UpdateAgent sets a teammate's colour by its label and refuses an
 *   unknown one without calling update.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const colors = await loadModule("source/shared/agents/agent-colors.ts", "agent-colors");
const marks = await loadModule("source/shared/voice-call/agent-mark.ts", "agent-mark");

// The log's agents (7 October 2026).
const SIMEON = "f460489b-0fd9-4769-a1a1-1e7ad7543474";
const MAYA = "ea755f3d-1aa9-4a87-bafc-8e9b7c72162e";
const LEO = "fb84feb6-984a-4ccf-9c70-ecfd802e308e";
const NINA = "9d3d294f-0c58-4c10-afc4-c81a140a2bd6";
const AVA = "d36b4b67-0861-4535-aa44-5ca380b41eea";

test("an agent without a colour is drawn in its id's, and the log's three hires all hashed to Ocean", async () => {
  for (const id of [LEO, NINA, AVA]) assert.equal(colors.windowFallbackColor(id), "blue");
  assert.equal(colors.windowFallbackColor(MAYA), "red");
  assert.equal(colors.drawnAgentColor(LEO, ""), "blue");
  assert.equal(colors.drawnAgentColor(LEO, "teal"), "blue", "an unknown colour falls back to the id's");
  assert.equal(colors.drawnAgentColor(LEO, "mint"), "mint");
  // The hash is even: about a tenth of ids per slot, only the first ten palettes.
  const { randomUUID } = await import("node:crypto");
  const counts = new Map();
  for (let index = 0; index < 20000; index++) {
    const color = colors.windowFallbackColor(randomUUID());
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), marks.AGENT_MARK_PALETTES.slice(0, 10).map((palette) => palette.id).sort());
  for (const count of counts.values()) assert.ok(count > 1700 && count < 2300, `about 2,000 each: ${count}`);
  // The window's own resolver: a stored palette id, else the id's hash over
  // the palettes in order (the patch keeps all of them in the picker list).
  const patch = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(patch, /const AGENT_COLOR_RESOLVER = "function Cee\(n\)\{return PQ\.find\(t=>t\.id===n\.avatarColor\)\?\.id\?\?sle\(n\.id\)\}";/);
  assert.match(patch, /const PALETTE_PICKER_AFTER = "const nnt=PQ\.slice\(\)";/);
});

test("the assignment order names every palette once, with Ocean last", () => {
  const ids = marks.AGENT_MARK_PALETTES.map((palette) => palette.id);
  assert.deepEqual([...colors.AGENT_COLOR_ASSIGNMENT_ORDER].sort(), [...ids].sort());
  assert.equal(new Set(colors.AGENT_COLOR_ASSIGNMENT_ORDER).size, ids.length);
  assert.deepEqual(colors.AGENT_COLOR_ASSIGNMENT_ORDER.slice(0, 4), ["red", "green", "yellow", "violet"]);
  assert.equal(colors.AGENT_COLOR_ASSIGNMENT_ORDER.at(-1), "blue");
});

test("a pick takes the colour fewest agents are drawn in", () => {
  // Simeon stored blue, Maya hashed to Ember: the first free colour is Moss.
  const team = [{ id: SIMEON, color: "blue" }, { id: MAYA, color: "" }];
  assert.equal(colors.pickAgentColor(team), "green");
  assert.equal(colors.pickAgentColor([...team, { id: "a", color: "green" }]), "yellow");
  assert.equal(colors.pickAgentColor([...team, { id: "a", color: "green" }, { id: "b", color: "yellow" }]), "violet");
  assert.equal(colors.pickAgentColor([]), "red");
  // Every palette taken once: the first in the order.
  assert.equal(colors.pickAgentColor(colors.AGENT_COLOR_ASSIGNMENT_ORDER.map((color, index) => ({ id: `x${index}`, color }))), "red");
  // Every palette but Mint taken twice: Mint.
  const twice = colors.AGENT_COLOR_ASSIGNMENT_ORDER.flatMap((color, index) => (color === "mint" ? [{ id: `m${index}`, color }] : [{ id: `a${index}`, color }, { id: `b${index}`, color }]));
  assert.equal(colors.pickAgentColor(twice), "mint");
});

test("colour names are the labels the window shows, any case; ids and unknown names are refused", () => {
  assert.equal(colors.agentColorIdFromName("Ember"), "red");
  assert.equal(colors.agentColorIdFromName(" moss "), "green");
  assert.equal(colors.agentColorIdFromName("OCEAN"), "blue");
  assert.equal(colors.agentColorIdFromName("yellow"), null, "an id is not a name: yellow is drawn as Dusk");
  assert.equal(colors.agentColorIdFromName("teal"), null);
  assert.equal(colors.agentColorIdFromName(""), null);
  assert.deepEqual([...colors.AGENT_COLOR_LABELS], marks.AGENT_MARK_PALETTES.map((palette) => palette.label));
});

test("three agents minted at once get three colours, and a given colour is kept", async () => {
  const lifecycleModule = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-colors");
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-agent-colors-"));
  try {
    const writeProfile = async (id, profile) => {
      await mkdir(path.join(root, id), { recursive: true });
      await writeFile(path.join(root, id, "profile.json"), JSON.stringify(profile));
    };
    // Simeon stored blue (the Chief of Staff); Maya with none, drawn in Ember by her id.
    await writeProfile(SIMEON, { name: "Simeon", description: "", avatarColor: "blue" });
    await writeProfile(MAYA, { name: "Maya", description: "" });
    let next = 0;
    const tm = {
      sessionStore: {
        listAgentRecordIds: async () => (await import("node:fs/promises")).readdir(root),
        getAgentDir: (id) => path.join(root, id),
        // As the store does: the profile is on disk once the session exists,
        // after a pause, so concurrent mints would overlap without the queue.
        createSession: async (profile) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          const id = `agent-${next++}`;
          await writeProfile(id, profile);
          return { id, db: { setIntroductionPending() {} } };
        },
      },
    };
    const lifecycle = new lifecycleModule.AgentLifecycle(tm);
    const minted = await Promise.all(["Leo", "Nina", "Ava"].map((name) => lifecycle.mintAgentSession({ name, description: "" }, "user", {})));
    const stored = await Promise.all(minted.map(async (session) => JSON.parse(await readFile(path.join(root, session.id, "profile.json"), "utf8")).avatarColor));
    assert.deepEqual(stored, ["green", "yellow", "violet"]);
    const chosen = await lifecycle.mintAgentSession({ name: "Pia", description: "", avatarColor: "mint" }, "user", {});
    assert.equal(JSON.parse(await readFile(path.join(root, chosen.id, "profile.json"), "utf8")).avatarColor, "mint");
    // A mint that fails does not stop the next one.
    const failing = new lifecycleModule.AgentLifecycle({ sessionStore: { ...tm.sessionStore, createSession: async () => { throw new Error("disk full"); } } });
    await assert.rejects(failing.mintAgentSession({ name: "X", description: "" }, "user", {}), /disk full/);
    failing.tm.sessionStore.createSession = tm.sessionStore.createSession;
    const after = await failing.mintAgentSession({ name: "Y", description: "" }, "user", {});
    assert.ok(after.id.startsWith("agent-"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("UpdateAgent sets a teammate's colour by its label and refuses an unknown one", async () => {
  const tools = await loadModule("source/host/runner/tools/sand-agent-management-tools.ts", "agent-management-colors");
  const context = await loadModule("source/packages/context/core.ts", "context-core-colors");
  const updates = [];
  const tool = tools.createUpdateAgentTool({
    create: async () => ({ id: "x", name: "x" }),
    update: async (id, patch) => { updates.push([id, patch]); return { id, name: "Leo" }; },
  });
  const run = async (args) => {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    return JSON.stringify(await tool.execute(context.createContext(), handler, argsStream, { toolCallId: "call-1" }));
  };
  assert.match(await run({ agent_id: "leo", color: "Ember" }), /Updated agent \\"Leo\\"/);
  assert.deepEqual(updates, [["leo", { avatarColor: "red" }]]);
  updates.length = 0;
  assert.match(await run({ agent_id: "leo", color: "orange" }), /Unknown colour \\"orange\\". Use one of: Dusk, Sage, Lagoon, Ember/);
  assert.deepEqual(updates, []);
  assert.match(await run({ agent_id: "leo" }), /Nothing to update: provide a new name, description and\/or colour/);
});

test("the composition passes a colour through to the profile", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /\.\.\.\(patch\.avatarColor === undefined \? \{\} : \{ avatarColor: patch\.avatarColor \}\)/);
});

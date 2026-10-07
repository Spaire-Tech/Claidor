/**
 * New agents get colours of their own (7 October 2026). The founder's
 * staffing log: Simeon hired Leo, Nina and Ava in one step and all three
 * came out in the default blue, like Simeon and Maya. Asked to tell them
 * apart, Simeon messaged each to draw its own picture: two refused, one
 * generated an image, one wrote a shell script, and every reply woke Simeon
 * on his whole conversation again.
 *
 * Offline, this holds:
 * - the assignment order names every palette once, the default last;
 * - a pick takes the colour fewest agents have, an unknown colour counting
 *   as the default it is drawn in;
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

test("the assignment order names every palette once, with the default last", () => {
  const ids = marks.AGENT_MARK_PALETTES.map((palette) => palette.id);
  assert.deepEqual([...colors.AGENT_COLOR_ASSIGNMENT_ORDER].sort(), [...ids].sort());
  assert.equal(new Set(colors.AGENT_COLOR_ASSIGNMENT_ORDER).size, ids.length);
  assert.equal(colors.AGENT_COLOR_ASSIGNMENT_ORDER.at(-1), marks.DEFAULT_AGENT_MARK_COLOR);
});

test("a pick takes the colour fewest agents are drawn in", () => {
  // Simeon and Maya, made before agents had colours: both drawn in blue.
  assert.equal(colors.pickAgentColor(["", ""]), "red");
  assert.equal(colors.pickAgentColor(["", "", "red"]), "green");
  assert.equal(colors.pickAgentColor(["", "", "red", "green"]), "magenta");
  // An unknown colour is drawn in the default and counts as it.
  assert.equal(colors.pickAgentColor(["teal"]), "red");
  assert.equal(colors.drawnAgentColor("teal"), "blue");
  // Every palette taken once: the default is taken too, so the first in the order.
  assert.equal(colors.pickAgentColor(colors.AGENT_COLOR_ASSIGNMENT_ORDER), "red");
  // Every palette but Moss taken twice: Moss.
  const twice = colors.AGENT_COLOR_ASSIGNMENT_ORDER.flatMap((id) => (id === "green" ? [id] : [id, id]));
  assert.equal(colors.pickAgentColor(twice), "green");
  assert.equal(colors.pickAgentColor([]), "red");
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
    // Simeon and Maya, with no colour stored.
    await writeProfile("simeon", { name: "Simeon", description: "" });
    await writeProfile("maya", { name: "Maya", description: "" });
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
    assert.deepEqual(stored, ["red", "green", "magenta"]);
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

/**
 * The app-window demo (`npm run demo`): a founder's team. Simeon's
 * conversation (Thursday's launch, as the website's phone still tells it)
 * plays by itself; the rest is already written; nobody types.
 * Its scripted backend answers in the host's own shapes, so the pinned window
 * draws it, and the bridge bundles for the browser.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

// The message types the pinned renderer's send-message switch draws (PAe / jEn in the 0.18.0 chunk).
const RENDERED_TYPES = new Set(["text", "attachment", "widget", "cloud-agent", "secret-request", "email-draft", "slack-draft", "permission-request", "auto-review-approval", "local-tool-permission", "connector", "connectors", "listener-connect"]);
const until = async (check, ms = 2000) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 5)); } };

test("eight agents and their group, every conversation a well-formed transcript window", async (t) => {
  const backendModule = await loadModule("demo/backend.ts", "demo-backend");
  const rpc = await loadModule("source/shared/rpc/coordinator.ts", "demo-rpc");
  t.after(async () => { await backendModule.dispose(); await rpc.dispose(); });
  const backend = backendModule.module.createDemoBackend({ pushCoordinatorEvent: () => {}, pushMainEvent: () => {} });
  const roster = (await backend.coordinator("listAgents", {})).value;
  assert.deepEqual(roster.map((agent) => agent.name).sort(), ["Iris", "Launch squad", "Mila", "Scout", "Simeon", "Theo"]);
  const group = roster.find((agent) => agent.isGroup);
  assert.equal(group.name, "Launch squad");
  assert.deepEqual(group.memberIds, ["simeon", "scout", "iris"]);
  for (const agent of roster) {
    assert.ok(agent.lastEntry == null || agent.lastEntry.kind === "text", `${agent.name}'s sidebar preview is a text preview`);
    const window = await backend.coordinator("getAgentTranscriptWindow", { id: agent.id });
    assert.notEqual(rpc.module.parseCoordinatorTranscriptWindowResponse(window.value), null, `${agent.name}'s window is well formed`);
    for (const entry of window.value.entries) {
      if (entry.kind === "send-message") assert.ok(RENDERED_TYPES.has(entry.message.type), `${entry.message.type} is drawn by the window`);
    }
  }
  // In the group, each agent's message names its author the way group-chat-glue does.
  const groupEntries = (await backend.coordinator("getAgentTranscriptWindow", { id: group.id })).value.entries;
  const authors = groupEntries.filter((e) => e.kind === "send-message").map((e) => e.author?.name);
  assert.deepEqual([...new Set(authors)].sort(), ["Iris", "Scout", "Simeon"]);
  // Nothing is waiting to be answered before Simeon asks: the written conversations hold no questions.
  for (const agent of roster) {
    const entries = (await backend.coordinator("getAgentTranscriptWindow", { id: agent.id })).value.entries;
    assert.ok(!entries.some((e) => e.message?.type === "widget"), `${agent.name} asks nothing before the story starts`);
  }
});

test("Simeon's conversation plays through on its own, the same thread the website's phone still shows", async (t) => {
  const { module, dispose } = await loadModule("demo/backend.ts", "demo-backend-story");
  t.after(dispose);
  const events = [];
  const backend = module.createDemoBackend({ pushCoordinatorEvent: (family, payload) => events.push({ family, payload }), pushMainEvent: () => {}, timeScale: 0.01 });
  const appended = () => events.filter((e) => e.family === "transcript" && e.payload.type === "appended" && e.payload.agentId === "simeon").map((e) => e.payload.entry);
  backend.onServing();
  backend.onServing();
  await until(() => appended().some((e) => e.id === "m2a"));
  const said = appended().map((e) => e.kind === "event" ? `${e.event.type}: ${e.event.action} ${e.event.automationName}` : e.toAgent ? `to ${e.toAgent.name}` : e.fromAgent ? `from ${e.fromAgent.name}` : e.role === "user" ? `you: ${e.content}` : e.message?.type === "text" ? e.message.content : e.message?.type);
  assert.deepEqual(said, [
    "you: Morning. Where are we on Thursday's launch?",
    "Thursday is on track: 12 of 15 launch tickets are done in **Linear**, and the review is Thursday at 2 pm.",
    "to Scout", "from Scout", "to Iris", "from Iris",
    "Scout pulled three customer quotes and Iris closed the last two tickets. The review doc is ready.",
    "attachment",
    "you: Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.",
    // The window's own line, "Created routine · Monday launch check", as the phone shows it (6 October 2026).
    "automation-changed: created Monday launch check",
    "Done. The agenda went out from **Gmail**.",
  ], "the whole story, once, in order, with no question to answer");
  const summaries = events.filter((e) => e.family === "outline" && e.payload.item.status === "completed").map((e) => e.payload.item.summary);
  for (const line of ["Checked Linear", "Messages from Scout", "Messages from Iris", "Created routine Monday launch check"]) assert.ok(summaries.includes(line), line);
  const reacted = events.find((e) => e.family === "transcript" && e.payload.type === "updated" && e.payload.entry.id === "m2u");
  assert.deepEqual(reacted?.payload.entry.reactions, [{ emoji: "\u{1F44D}", by: "simeon" }], "Simeon gives your reply a thumbs up");
});

test("nobody types: a send is refused", async (t) => {
  const { module, dispose } = await loadModule("demo/backend.ts", "demo-backend-send");
  t.after(dispose);
  const backend = module.createDemoBackend({ pushCoordinatorEvent: () => {}, pushMainEvent: () => {} });
  assert.deepEqual((await backend.coordinator("sendPrompt", { agentId: "simeon", prompt: "hello" })).value, { accepted: false });
});

test("the in-page bridge bundles for the browser, and leaves the composer and the side doors inert", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-demo-bridge-"));
  t.after(() => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const result = await build({
    entryPoints: [path.join(repoRoot, "demo/bridge.ts")], bundle: true, format: "iife", platform: "browser", target: "es2022",
    outfile: path.join(temporary, "demo-bridge.js"), define: { "process.platform": '"darwin"', "process.env": "{}" }, logLevel: "silent", metafile: true,
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some((input) => input.endsWith("electron-preload/preload.ts")), "the app's own preload bridge is what the page gets");
  assert.ok(inputs.some((input) => input.endsWith("node-agent-coordinator/renderer-port-server.ts")), "the app's own coordinator port server answers it");
  assert.ok(!inputs.some((input) => input.startsWith("node:")), "nothing Node-only reaches the page");
  const bridge = await readFile(path.join(repoRoot, "demo/bridge.ts"), "utf8");
  for (const selector of [".sand-agents-sidebar__account button", ".sand-agents-sidebar__plugins", ".sand-agents-sidebar__new", ".sand-prompt-attach", ".sand-chat-header__computer"]) {
    assert.ok(bridge.includes(`"${selector}"`), `${selector} is inert in the demo`);
  }
  assert.match(bridge, /const COMPOSER = "\.sand-prompt-shell";/);
  assert.match(bridge, /shell\.setAttribute\("inert", ""\)/, "the composer takes no focus or input");
  assert.match(bridge, /event\.key\.length === 1/, "typing anywhere is stopped, since the window forwards it to the composer");
  const backend = await readFile(path.join(repoRoot, "demo/backend.ts"), "utf8");
  // The demo follows the system appearance; ?theme=light or ?theme=dark forces one.
  assert.match(backend, /get\("theme"\)/);
  assert.match(backend, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
});

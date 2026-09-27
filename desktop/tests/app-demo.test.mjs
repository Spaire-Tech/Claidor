/**
 * The app-window demo (`npm run demo`): its scripted backend answers in the
 * host's own shapes, so the pinned window draws its conversations, and the
 * bridge bundles for the browser.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

// The message types the pinned renderer's send-message switch draws
// (PAe / jEn in the 0.18.0 chunk).
const RENDERED_TYPES = new Set(["text", "attachment", "widget", "cursor-agent", "secret-request", "email-draft", "slack-draft", "permission-request", "auto-review-approval", "local-tool-permission", "connector", "connectors", "listener-connect"]);

test("the demo backend serves the cast, and every conversation parses as a transcript window", async (t) => {
  const backendModule = await loadModule("demo/backend.ts", "demo-backend");
  const rpc = await loadModule("source/shared/rpc/coordinator.ts", "demo-rpc");
  t.after(async () => { await backendModule.dispose(); await rpc.dispose(); });
  const events = [];
  const backend = backendModule.module.createDemoBackend({ pushCoordinatorEvent: (family, payload) => events.push({ family, payload }), pushMainEvent: () => {} });

  const roster = await backend.coordinator("listAgents", {});
  assert.equal(roster.status, "ok");
  assert.deepEqual(roster.value.map((agent) => agent.name).sort(), ["Ledger", "Scout", "Simeon", "Yodo"]);
  for (const agent of roster.value) {
    assert.equal(agent.avatarShape, "cloud");
    assert.ok(agent.lastEntry == null || agent.lastEntry.kind === "text", `${agent.name}'s sidebar preview is a text preview`);
    const window = await backend.coordinator("getAgentTranscriptWindow", { id: agent.id });
    assert.notEqual(rpc.module.parseCoordinatorTranscriptWindowResponse(window.value), null, `${agent.name}'s window is well formed`);
    for (const entry of window.value.entries) {
      if (entry.kind === "send-message") assert.ok(RENDERED_TYPES.has(entry.message.type), `${entry.message.type} is drawn by the window`);
    }
  }
});

test("a message typed to an agent is echoed, then answered", async (t) => {
  const { module, dispose } = await loadModule("demo/backend.ts", "demo-backend-send");
  t.after(dispose);
  const events = [];
  const backend = module.createDemoBackend({ pushCoordinatorEvent: (family, payload) => events.push({ family, payload }), pushMainEvent: () => {} });
  const sent = await backend.coordinator("sendPrompt", { agentId: "scout", prompt: "Any quieter options?", clientNonce: "n1" });
  assert.deepEqual(sent.value, { accepted: true });
  const echo = events.find((e) => e.family === "transcript" && e.payload.type === "appended");
  assert.equal(echo.payload.agentId, "scout");
  assert.equal(echo.payload.entry.role, "user");
  assert.equal(echo.payload.entry.clientNonce, "n1");
  assert.equal(echo.payload.ordered.replicaKey, "transcript:scout");
  await new Promise((resolve) => setTimeout(resolve, 2300));
  const reply = events.filter((e) => e.family === "transcript" && e.payload.type === "appended").at(-1);
  assert.equal(reply.payload.entry.kind, "send-message");
});

test("answering Simeon's question records the answer on the card", async (t) => {
  const { module, dispose } = await loadModule("demo/backend.ts", "demo-backend-widget");
  t.after(dispose);
  const events = [];
  const backend = module.createDemoBackend({ pushCoordinatorEvent: (family, payload) => events.push({ family, payload }), pushMainEvent: () => {} });
  const answered = await backend.coordinator("respondToWidget", { agentId: "simeon", entryId: "t0s1", value: "no" });
  assert.deepEqual(answered.value, { accepted: true });
  const updated = events.find((e) => e.family === "transcript" && e.payload.type === "updated");
  assert.equal(updated.payload.entry.respondedValue, "no");
});

test("the in-page bridge bundles for the browser", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-demo-bridge-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const result = await build({
    entryPoints: [path.join(repoRoot, "demo/bridge.ts")], bundle: true, format: "iife", platform: "browser", target: "es2022",
    outfile: path.join(temporary, "demo-bridge.js"), define: { "process.platform": '"darwin"', "process.env": "{}" }, logLevel: "silent", metafile: true,
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some((input) => input.endsWith("electron-preload/preload.ts")), "the app's own preload bridge is what the page gets");
  assert.ok(inputs.some((input) => input.endsWith("node-agent-coordinator/renderer-port-server.ts")), "the app's own coordinator port server answers it");
  assert.ok(!inputs.some((input) => input.startsWith("node:")), "nothing Node-only reaches the page");
});

test("the demo leaves the account menu, Connect apps, the New and attach buttons and the computer inert, and opens dark on ?theme=dark", async () => {
  const { readFile } = await import("node:fs/promises");
  const bridge = await readFile(path.join(repoRoot, "demo/bridge.ts"), "utf8");
  for (const selector of [".sand-agents-sidebar__account button", ".sand-agents-sidebar__plugins", ".sand-agents-sidebar__new", ".sand-prompt-attach", ".sand-chat-header__computer"]) {
    assert.ok(bridge.includes(`"${selector}"`), `${selector} is inert in the demo`);
  }
  assert.match(bridge, /for \(const type of \["pointerdown", "mousedown", "click", "keydown"\] as const\)/);
  const backend = await readFile(path.join(repoRoot, "demo/backend.ts"), "utf8");
  assert.match(backend, /get\("theme"\) === "dark"/);
});

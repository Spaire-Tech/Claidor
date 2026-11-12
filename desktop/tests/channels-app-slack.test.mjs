/**
 * An agent's Slack through Simeon's own Slack app (12 November 2026,
 * docs/services-agents.md §4): the server names the agents that talk in
 * Slack (`hosted` in the channels sync), this computer lists each with the
 * workspace's name and the app's mark (no token), what the agent heard comes
 * through the inbox, and its answers go back through the server, in the
 * thread they belong to. Disconnect here is told to the server; one the
 * server no longer names is taken off here. Measured against a stand-in
 * transcript and a stand-in server: nothing reaches Slack or Simeon Labs.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const immediateClock = { sleep: () => Promise.resolve(), setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timer.unref?.(); return { dispose: () => clearInterval(timer) }; } };

/** The agents' channel lists as the session store keeps them, with the app's mark written as `storeAppChannel` writes it. */
function fakeTranscript(configsByAgent = {}) {
  const hooks = {};
  const wakes = [];
  const statuses = [];
  const stored = [];
  const removed = [];
  const configs = structuredClone(configsByAgent);
  return {
    hooks, wakes, statuses, stored, removed, configs,
    transcript: {
      listAgentIds: async () => [...new Set(["a1", "a2", ...Object.keys(configs)])],
      listChannelConfigs: (agentId) => configs[agentId] ?? [],
      setChannelDelivery: (fn) => { hooks.deliver = fn; },
      setChannelActivity: (fn) => { hooks.activity = fn; },
      setChannelConfigChanged: (fn) => { hooks.changed = fn; },
      wakeForInbound: (agentId, envelope) => { wakes.push({ agentId, envelope }); },
      disconnectChannel: (agentId, platform) => { removed.push({ agentId, platform }); configs[agentId] = (configs[agentId] ?? []).filter((row) => row.platform !== platform); return true; },
      sessionStore: {
        writeChannelStatus: (agentId, platform, status, detail) => { statuses.push({ agentId, platform, status, detail: detail ?? null }); return true; },
        storeAppChannel: (agentId, platform, label) => {
          stored.push({ agentId, platform, label });
          const rows = (configs[agentId] ?? []).filter((row) => row.platform !== platform);
          rows.push({ platform, token: "", label: label || "Slack", secrets: { app: "simeon" } });
          configs[agentId] = rows;
          return true;
        },
      },
    },
  };
}

/** The server: its `hosted` list (changeable), every sync, send and disconnect written down. */
function fakeServer(hosted) {
  const server = {
    hosted,
    syncs: 0,
    sent: [],
    disconnected: [],
    async sync() { server.syncs += 1; return { held: false, channels: [], hosted: structuredClone(server.hosted) }; },
    async sendSlack(message) { server.sent.push(structuredClone(message)); },
    async disconnectSlack(agentId) { server.disconnected.push(agentId); server.hosted = server.hosted.filter((row) => row.agentId !== agentId); },
  };
  return server;
}

const workspace = (agentId = "a1") => ({ agentId, platform: "slack", label: "Simeon Labs" });

test("an agent the server names is listed here with the workspace's name, no token, and answers through the server in its thread", async () => {
  const fake = fakeTranscript();
  const server = fakeServer([workspace()]);
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-app");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: () => {}, clock: immediateClock, pollMs: 3_600_000, server });
  try {
    runtime.start();
    await runtime.reconcile();
    await runtime.reconcile();
    assert.deepEqual(fake.stored, [{ agentId: "a1", platform: "slack", label: "Simeon Labs" }], "listed once, with the workspace's name");
    assert.deepEqual(runtime.statuses(), [{ agentId: "a1", platform: "slack", status: "connected", detail: null, listening: "app" }]);
    assert.deepEqual(fake.statuses.at(-1), { agentId: "a1", platform: "slack", status: "connected", detail: null });

    const heard = { address: { platform: "slack", chat: "C1" }, sender: "Alice", text: "Theo, the deck?", timestampMs: 1, messageId: "C1:1.0", thread: "1.0", app: true };
    assert.equal(runtime.receiveFromServer("a1", heard), true);
    assert.equal(fake.wakes.length, 1);
    await fake.hooks.deliver("a1", "slack:C1", { type: "text", content: "On it." });
    assert.deepEqual(server.sent, [{ agentId: "a1", chat: "C1", thread: "1.0", text: "On it." }]);

    // A long answer goes as several messages, each in the thread.
    await fake.hooks.deliver("a1", "slack:C1", { type: "text", content: "x".repeat(4001) });
    assert.equal(server.sent.length, 3);
    assert.ok(server.sent.slice(1).every((message) => message.thread === "1.0" && message.text.length <= 4000));
  } finally {
    await runtime.stop();
    await dispose();
  }
});

test("a file on the computer is sent through the server, an address as its words", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-app-slack-file-"));
  const file = path.join(dir, "plan.pdf");
  await writeFile(file, "%PDF-1.4");
  const fake = fakeTranscript();
  const server = fakeServer([workspace()]);
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-app-file");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: () => {}, clock: immediateClock, pollMs: 3_600_000, server });
  try {
    runtime.start();
    await runtime.reconcile();
    await runtime.reconcile();
    await fake.hooks.deliver("a1", "slack:D1", { type: "attachment", url: pathToFileURL(file).href, alt: "The plan" });
    assert.deepEqual(server.sent.at(-1), { agentId: "a1", chat: "D1", file: { name: "plan.pdf", data: Buffer.from("%PDF-1.4").toString("base64") }, caption: "The plan" });
    await fake.hooks.deliver("a1", "slack:D1", { type: "attachment", url: "https://example.com/a.png", alt: "Look" });
    assert.deepEqual(server.sent.at(-1), { agentId: "a1", chat: "D1", text: "Look\nhttps://example.com/a.png" });
  } finally {
    await runtime.stop();
    await dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Disconnect here tells the server once and does not list it again; one the server no longer names is taken off here", async () => {
  const fake = fakeTranscript();
  const server = fakeServer([workspace("a1"), workspace("a2")]);
  const lines = [];
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-app-disconnect");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: (line) => lines.push(line), clock: immediateClock, pollMs: 3_600_000, server });
  try {
    runtime.start();
    await runtime.reconcile();
    await runtime.reconcile();
    assert.deepEqual(fake.stored.map((row) => row.agentId).sort(), ["a1", "a2"]);

    // Disconnect in a1's Channels tab: its row goes here; the server still names it until told.
    fake.configs.a1 = [];
    await runtime.syncNow();
    assert.deepEqual(server.disconnected, ["a1"]);
    await runtime.syncNow();
    assert.deepEqual(server.disconnected, ["a1"], "told once");
    assert.equal(fake.stored.filter((row) => row.agentId === "a1").length, 1, "not listed again");
    assert.ok(lines.some((line) => line.includes("agent=a1 event=app-disconnected")));

    // Disconnected elsewhere: the server no longer names a2, so it is taken off here.
    server.hosted = [];
    await runtime.syncNow();
    assert.deepEqual(fake.removed, [{ agentId: "a2", platform: "slack" }]);
    assert.deepEqual(runtime.statuses(), []);
  } finally {
    await runtime.stop();
    await dispose();
  }
});

test("a message heard through the app before this computer listed the agent is answered all the same; an older server leaves the list as it is", async () => {
  const fake = fakeTranscript();
  const server = fakeServer([workspace()]);
  // A server from before 12 November 2026 names no such agent: `hosted` is absent.
  server.sync = async () => { server.syncs += 1; return { held: false, channels: [] }; };
  const { module, dispose } = await load("source/host/extensions/channels/channel-runtime.ts", "channel-runtime-app-early");
  const runtime = module.createChannelRuntime({ transcript: fake.transcript, env: {}, log: () => {}, clock: immediateClock, pollMs: 3_600_000, server });
  try {
    runtime.start();
    await runtime.reconcile();
    assert.deepEqual(fake.stored, [], "nothing listed from a server that names no one");
    const heard = { address: { platform: "slack", chat: "D9" }, sender: "Alice", text: "hi", timestampMs: 1, messageId: "D9:3.0", app: true };
    assert.equal(runtime.receiveFromServer("a1", heard), true);
    assert.deepEqual(fake.stored, [{ agentId: "a1", platform: "slack", label: "" }]);
    await fake.hooks.deliver("a1", "slack:D9", { type: "text", content: "Hello" });
    assert.deepEqual(server.sent, [{ agentId: "a1", chat: "D9", text: "Hello" }]);
    // The list made again keeps it: the app's mark is a connection like any other.
    await runtime.reconcile();
    assert.deepEqual(runtime.statuses().map((status) => [status.agentId, status.listening]), [["a1", "app"]]);
    assert.deepEqual(fake.removed, []);
  } finally {
    await runtime.stop();
    await dispose();
  }
});

/**
 * The agents and their chats copied to Simeon Labs' server (26 October 2026,
 * docs/services-core.md, "What the apps keep"): the chat-copy host extension.
 *
 * Measured against a transcript in memory and a server that records what it
 * is sent: at start the list and every chat the server is behind on; a chat
 * read again when the list says it moved; a line not sent twice; a streaming
 * line held until it is whole; lines changed in place, taken out and chats
 * emptied; an agent gone; a refused copy sent again; a line too large left
 * out; the list without pictures or the moment. And the client against an
 * HTTP server answering the apps' envelope, the registration, the off switch.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const line = (id, content, at, more = {}) => ({ kind: "message", id, role: "user", content, timestampMs: at, ...more });

/** A transcript in memory: its list, each chat's lines, and the events it sends. */
function fakeTranscript(agents, chats) {
  const listeners = { event: new Set(), agents: new Set(), upserted: new Set() };
  const on = (set) => (listener) => { set.add(listener); return () => set.delete(listener); };
  const state = { agents, chats, tails: [] };
  return {
    state,
    listAgents: async () => state.agents,
    listAgentsSync: () => state.agents,
    subscribe: on(listeners.event),
    subscribeAgents: on(listeners.agents),
    subscribeAgentUpserted: on(listeners.upserted),
    getAgentTranscriptTail(agentId, { limit }) { state.tails.push([agentId, limit]); return { entries: (state.chats[agentId] ?? []).slice(-limit) }; },
    emit: (event) => { for (const listener of listeners.event) listener(event); },
    emitAgents: (payload) => { for (const listener of listeners.agents) listener(payload); },
    emitUpserted: (agent) => { for (const listener of listeners.upserted) listener({ agent }); },
  };
}

/** The server: what it holds of each chat's newest line, and every copy it was sent. */
function fakeServer(newest = {}) {
  const copies = [];
  const server = { copies, refuse: 0, async newest() { return newest; }, async copy(body) { if (server.refuse > 0) { server.refuse -= 1; throw new Error("/desktop/api/chats/copy answered 503"); } copies.push(structuredClone(body)); } };
  return server;
}

const sentLines = (server) => server.copies.flatMap((copy) => copy.lines.map((item) => `${item.agentId}:${item.entry.id}`));

test("at start the list goes, and each chat the server is behind on, never one it has", async () => {
  const { module, dispose } = await load("source/host/extensions/chat-copy/chat-copy.ts", "chat-copy-start");
  try {
    const transcript = fakeTranscript(
      [
        { id: "theo", name: "Theo", lastMessageId: "u2", avatarDataUrl: "data:image/png;base64,AAAA", avatarShape: "clay-07", isRunning: true, currentActivity: { label: "Searching" } },
        { id: "iris", name: "Iris", lastMessageId: "i1" },
        { id: "noa", name: "Noa" },
      ],
      { theo: [line("u1", "Book it", 1_000), line("u2", "Thanks", 2_000)], iris: [line("i1", "Hi", 1_000)] },
    );
    const server = fakeServer({ iris: "i1" });
    const logs = [];
    const copy = new module.ChatCopy({ transcript, server, log: (text) => logs.push(text), intervalMs: 5 });
    await copy.start();
    await copy.flushNow();
    copy.stop();
    assert.deepEqual(transcript.state.tails, [["theo", module.CHAT_COPY_BACKFILL_LINES]], "only the chat the server is behind on is read");
    assert.deepEqual(sentLines(server), ["theo:u1", "theo:u2"]);
    const list = server.copies.find((copy) => copy.agents != null).agents;
    assert.deepEqual(list.map((row) => row.id), ["theo", "iris", "noa"]);
    assert.equal(list[0].avatarDataUrl, null, "no inline picture");
    assert.equal(list[0].avatarShape, "clay-07");
    assert.ok(!("isRunning" in list[0]) && !("currentActivity" in list[0]), "nothing of the moment");
    assert.ok(logs.some((text) => /chat-copy on: 3 agent\(s\), 1 chat\(s\) to send/.test(text)), logs.join("\n"));
    assert.ok(logs.some((text) => /chat-copy sent the list \(3\) lines=2/.test(text)), logs.join("\n"));
    assert.ok(!logs.some((text) => text.includes("Book it")), "a chat's words never reach the log");
  } finally { await dispose(); }
});

test("a chat the list says moved is read again; a line goes once; a streaming one waits until whole", async () => {
  const { module, dispose } = await load("source/host/extensions/chat-copy/chat-copy.ts", "chat-copy-moves");
  try {
    const theo = { id: "theo", name: "Theo", lastMessageId: "u1" };
    const transcript = fakeTranscript([theo], { theo: [line("u1", "Book it", 1_000)] });
    const server = fakeServer({});
    const copy = new module.ChatCopy({ transcript, server, intervalMs: 5 });
    await copy.start();
    await copy.flushNow();
    assert.deepEqual(sentLines(server), ["theo:u1"]);

    // An answer starts streaming: the list says Theo moved and is running.
    transcript.state.chats.theo = [line("u1", "Book it", 1_000), line("a1", "On i", 2_000, { role: "assistant", isStreaming: true })];
    transcript.state.agents = [{ ...theo, lastMessageId: "a1", isRunning: true }];
    transcript.emitUpserted(transcript.state.agents[0]);
    await copy.flushNow();
    assert.deepEqual(sentLines(server), ["theo:u1"], "u1 unchanged is not sent again; a1 still streams");

    // The turn ends: the whole answer goes.
    transcript.state.chats.theo = [line("u1", "Book it", 1_000), line("a1", "On it, booked.", 2_000, { role: "assistant" })];
    transcript.state.agents = [{ ...theo, lastMessageId: "a1", isRunning: false }];
    transcript.emitUpserted(transcript.state.agents[0]);
    await copy.flushNow();
    copy.stop();
    assert.deepEqual(sentLines(server), ["theo:u1", "theo:a1"]);
    assert.equal(server.copies.at(-1).lines[0].entry.content, "On it, booked.");
  } finally { await dispose(); }
});

test("a line changed in place, a line taken out, a chat emptied and an agent gone all reach the server", async () => {
  const { module, dispose } = await load("source/host/extensions/chat-copy/chat-copy.ts", "chat-copy-events");
  try {
    const transcript = fakeTranscript([{ id: "theo", lastMessageId: "u2" }, { id: "noa" }, { id: "iris" }], { theo: [line("u1", "One", 1_000), line("u2", "Two", 2_000)] });
    const server = fakeServer({ theo: "u2" });
    const copy = new module.ChatCopy({ transcript, server, intervalMs: 5 });
    await copy.start();
    await copy.flushNow();
    server.copies.length = 0;

    transcript.emit({ type: "updated", agentId: "theo", entry: line("u1", "One, answered", 1_000, { respondedValue: "yes" }) });
    transcript.emit({ type: "removed", agentId: "theo", id: "u2" });
    transcript.emit({ type: "cleared", agentId: "noa" });
    transcript.emit({ type: "appended", agentId: "theo", entry: line("s1", "Half", 3_000, { isStreaming: true }) });
    await copy.flushNow();
    assert.deepEqual(sentLines(server), ["theo:u1"]);
    assert.deepEqual(server.copies[0].removed, [{ agentId: "theo", id: "u2" }]);
    assert.deepEqual(server.copies[0].cleared, ["noa"]);

    // A whole list without Iris: the server is told, and a partial list is not taken as whole.
    transcript.emitAgents({ agents: [{ id: "theo", lastMessageId: "u1" }], coverage: { kind: "visible-window" } });
    transcript.emitAgents({ agents: [{ id: "theo", lastMessageId: "u2" }, { id: "noa" }], coverage: { kind: "complete-roster" } });
    await copy.flushNow();
    copy.stop();
    assert.deepEqual(server.copies.at(-1).agents.map((row) => row.id), ["theo", "noa"]);
  } finally { await dispose(); }
});

test("a refused copy waits and goes again; a line too large is left out", async () => {
  const { module, dispose } = await load("source/host/extensions/chat-copy/chat-copy.ts", "chat-copy-retry");
  try {
    const big = "x".repeat(module.CHAT_COPY_LINE_MAX_BYTES + 10);
    const transcript = fakeTranscript([{ id: "theo", lastMessageId: "b1" }], { theo: [line("u1", "Small", 1_000), line("b1", big, 2_000)] });
    const server = fakeServer({});
    server.refuse = 1;
    const logs = [];
    const copy = new module.ChatCopy({ transcript, server, log: (text) => logs.push(text), intervalMs: 5, retryMs: 10, retryMaxMs: 20 });
    await copy.start();
    await copy.flushNow();
    assert.equal(server.copies.length, 0);
    assert.ok(logs.some((text) => /chat-copy failed: \/desktop\/api\/chats\/copy answered 503; again in 0 s/.test(text)), logs.join("\n"));
    for (let i = 0; i < 100 && server.copies.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    copy.stop();
    assert.deepEqual(sentLines(server), ["theo:u1"], "sent again by itself, the large line left out");
    assert.ok(server.copies[0].agents != null, "the list too");
    assert.ok(logs.some((text) => /chat-copy left out 1 line\(s\) over 256 KB/.test(text)), logs.join("\n"));
  } finally { await dispose(); }
});

test("the client sends the box's token and reads the apps' envelope", async () => {
  const { module, dispose } = await load("source/host/extensions/chat-copy/chat-copy.ts", "chat-copy-client");
  const seen = [];
  let answerCopy = { status: 200, body: { code: 0, data: { lines: 1 } } };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body.length > 0 ? JSON.parse(body) : null });
      const answer = req.url === "/desktop/api/chats/state" ? { status: 200, body: { code: 0, data: { newest: { theo: "u2" }, agents: 1 } } } : answerCopy;
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const backendUrl = `http://127.0.0.1:${server.address().port}`;
    const client = module.createChatCopyServer({ getBackendUrl: () => backendUrl, getAccessToken: async () => "box-token" });
    assert.deepEqual(await client.newest(), { theo: "u2" });
    await client.copy({ lines: [{ agentId: "theo", entry: line("u3", "Hi", 3_000) }], removed: [], cleared: [] });
    assert.deepEqual(seen.map((request) => [request.method, request.url, request.auth]), [["GET", "/desktop/api/chats/state", "Bearer box-token"], ["POST", "/desktop/api/chats/copy", "Bearer box-token"]]);
    assert.equal(seen[1].body.lines[0].entry.id, "u3");
    answerCopy = { status: 200, body: { code: 40001, message: "Refused." } };
    await assert.rejects(client.copy({ lines: [], removed: [], cleared: [] }), /answered 200 Refused\./);
    answerCopy = { status: 404, body: { detail: "Not Found" } };
    await assert.rejects(client.copy({ lines: [], removed: [], cleared: [] }), /answered 404/);
  } finally {
    server.close();
    await dispose();
  }
});

test("the extension is registered after the transcript, and SAND_CHAT_COPY=0 switches it off", async () => {
  const ids = await src("host/extensions/extension-ids.generated.ts");
  assert.match(ids, /ChatCopy: "chat-copy"/);
  const registry = await src("host/extensions/registry.ts");
  assert.match(registry, /HostExtensions\.Transcript,.*HostExtensions\.ChatCopy[,\]]/);
  const production = await src("host/host-production-extensions.ts");
  assert.match(production, /\[HostExtensions\.ChatCopy\]: bind\(chatCopyExtension\)/);
  const { module, dispose } = await load("source/host/extensions/chat-copy/extension.ts", "chat-copy-extension");
  try {
    assert.equal(module.isChatCopyEnabled({}), true);
    for (const value of ["0", "off", "false", "no", " OFF "]) assert.equal(module.isChatCopyEnabled({ SAND_CHAT_COPY: value }), false, value);
    assert.deepEqual(module.chatCopyExtension.dependencies, ["auth", "transcript"]);
  } finally { await dispose(); }
});

/**
 * Messages written in an app while the computer was away, waiting on Simeon
 * Labs' server (26 October 2026, docs/services-core.md, "Messages while the
 * computer is away"): the inbox in the chat-copy host extension.
 *
 * Measured against a transcript in memory and a server that holds the
 * waiting messages: each handed to its agent as the app would have sent it
 * (the same words and nonce, so a message sent both ways lands once), in
 * the order written; one that fails waits with the ones after it and is
 * left out after five tries; one for an agent gone, or whose nonce went with
 * other words, left out at once; nothing taken before a turn can run; the
 * server's word, the stream down and the safety look; a confirmation that
 * fails sent again without handing anything twice. And the client against
 * an HTTP server, and the extension hearing the notify bus.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The inbox, the extension and the acceptance ledger in one bundle: an error the ledger throws is the class the inbox knows. */
async function load(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  const host = path.join(repoRoot, "source/host/extensions");
  await build({
    stdin: {
      contents: [
        `export * from ${JSON.stringify(path.join(host, "chat-copy/chat-inbox.ts"))};`,
        `export { chatCopyExtension } from ${JSON.stringify(path.join(host, "chat-copy/extension.ts"))};`,
        `export { PromptAcceptanceRejectedError, PromptAcceptanceDigestMismatchError, sendInputDigest } from ${JSON.stringify(path.join(host, "transcript/prompt-acceptance-ledger.ts"))};`,
      ].join("\n"),
      resolveDir: repoRoot,
      loader: "ts",
    },
    outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const waiting = (id, agentId, prompt, more = {}) => ({ id, agentId, nonce: `ios-${id}`, kind: "prompt", message: { prompt, ...more } });

/** A transcript in memory: its agents on disk, and each message handed to it. */
function fakeTranscript(agentIds) {
  const state = { agentIds, sent: [], fail: new Map() };
  return {
    state,
    listAgents: async () => state.agentIds.map((id) => ({ id })),
    async sendPrompt(prompt, options) {
      const failure = state.fail.get(options.clientNonce);
      if (failure != null) throw typeof failure === "function" ? failure() : failure;
      state.sent.push({ prompt, options });
    },
  };
}

/** The server: the messages waiting, and every confirmation. */
function fakeServer(messages) {
  const server = {
    messages: [...messages], acks: [], reads: 0, refuseAck: 0,
    async waiting() { server.reads += 1; return server.messages.map((message) => structuredClone(message)); },
    async ack(ids) {
      if (server.refuseAck > 0) { server.refuseAck -= 1; throw new Error("/desktop/api/chats/inbox/ack answered 503"); }
      server.acks.push([...ids]);
      server.messages = server.messages.filter((message) => !ids.includes(message.id));
    },
  };
  return server;
}

function inboxOf(module, { transcript, server, ready = () => true, connected = () => true, clock = { now: 0 }, logs = [] }) {
  return new module.ChatInbox({ transcript, server, isReady: ready, isNotifyConnected: connected, log: (text) => logs.push(text), now: () => clock.now, tickMs: 3_600_000 });
}

test("a waiting message reaches its agent as the app would have sent it, and the server is told", async () => {
  const { module, dispose } = await load("chat-inbox-shape");
  try {
    const transcript = fakeTranscript(["theo"]);
    const server = fakeServer([waiting("m1", "theo", "  Book the table \n", { richText: "{\"type\":\"doc\"}", replyToId: "e7", isFork: true, composedAtMs: 1_750_000_000_000 })]);
    const logs = [];
    const inbox = inboxOf(module, { transcript, server, logs });
    await inbox.drainNow();
    assert.deepEqual(transcript.state.sent, [{
      prompt: "  Book the table \n",
      options: { agentId: "theo", clientNonce: "ios-m1", directAddressedAcceptance: true, awaitTurn: false, attachmentPaths: [], attachmentNames: [], richText: "{\"type\":\"doc\"}", replyToId: "e7", isFork: true, composedAtMs: 1_750_000_000_000 },
    }]);
    assert.deepEqual(server.acks, [["m1"]]);
    assert.ok(logs.some((text) => /chat-inbox handed 1 message\(s\) to their agents/.test(text)), logs.join("\n"));
    assert.ok(!logs.some((text) => text.includes("Book the table")), "never a message's words in the log");

    // Sent both ways, it is one message to the acceptance ledger: the app's `sendPrompt` (LiveBackend.sendArguments
    // through host-gateway-api.ts) and the inbox's give the same digest, so the second lands as a duplicate.
    const app = { agentId: "theo", prompt: "  Book the table \n", attachmentPaths: [], attachmentNames: [], clientNonce: "ios-m1", directAddressedAcceptance: true, replyToId: "e7", isFork: true, richText: "{\"type\":\"doc\"}", composedAtMs: 1_750_000_000_000 };
    const gateway = { agentId: app.agentId, attachmentPaths: app.attachmentPaths ?? [], attachmentNames: app.attachmentNames ?? [], richText: app.richText, replyToId: app.replyToId, isFork: app.isFork };
    const digest = (prompt, options) => module.sendInputDigest({ agentId: options.agentId, prompt, richText: options.richText, replyToId: options.replyToId, isFork: options.isFork, attachmentPaths: options.attachmentPaths, attachmentNames: options.attachmentNames });
    assert.equal(digest(transcript.state.sent[0].prompt, transcript.state.sent[0].options), digest(app.prompt, gateway));
    // A plain message: no reply, no document, no time.
    const plain = module.promptOptions(waiting("m2", "theo", "Hi"));
    assert.equal(digest("Hi", plain), digest("Hi", { agentId: "theo", attachmentPaths: [], attachmentNames: [], richText: undefined, replyToId: undefined, isFork: undefined }));
  } finally { await dispose(); }
});

test("in the order written; one that fails waits with the ones after it, and is left out after five tries", async () => {
  const { module, dispose } = await load("chat-inbox-order");
  try {
    const transcript = fakeTranscript(["theo", "iris"]);
    transcript.state.fail.set("ios-a", () => new Error("The runner is not attached yet."));
    const server = fakeServer([waiting("a", "theo", "First"), waiting("b", "iris", "Second")]);
    const clock = { now: 1_000 };
    const logs = [];
    const inbox = inboxOf(module, { transcript, server, clock, logs });
    await inbox.drainNow();
    assert.deepEqual(transcript.state.sent, [], "the second waits behind the first");
    assert.deepEqual(server.acks, []);
    assert.ok(logs.some((text) => /chat-inbox failed, agent=theo not handed \(try 1\): The runner is not attached yet\.; again in 5 s/.test(text)), logs.join("\n"));
    // Not again before the wait is over.
    await inbox.drainNow();
    assert.equal(server.reads, 1);
    for (let tries = 2; tries <= 5; tries += 1) {
      clock.now += 10 * 60_000;
      await inbox.drainNow();
    }
    assert.deepEqual(transcript.state.sent.map((sent) => sent.prompt), ["Second"]);
    assert.deepEqual(server.acks, [["a", "b"]]);
    assert.ok(logs.some((text) => /chat-inbox left out a message for agent=theo \(failed 5 times: The runner is not attached yet\.\)/.test(text)), logs.join("\n"));
  } finally { await dispose(); }
});

test("one for an agent gone, or whose nonce went with other words, is left out at once; one refused before too", async () => {
  const { module, dispose } = await load("chat-inbox-final");
  try {
    const transcript = fakeTranscript(["theo"]);
    transcript.state.fail.set("ios-b", () => new module.PromptAcceptanceDigestMismatchError("ios-b"));
    transcript.state.fail.set("ios-c", () => new module.PromptAcceptanceRejectedError("send rejected: SAND_AGENT_CAP (replaying the nonce's original outcome)"));
    const server = fakeServer([waiting("a", "ghost", "To no one"), waiting("b", "theo", "Other words"), waiting("c", "theo", "Refused"), waiting("d", "theo", "Fine"), { id: "e", agentId: "theo", nonce: "x", kind: "channel", message: {} }]);
    const logs = [];
    const inbox = inboxOf(module, { transcript, server, logs });
    await inbox.drainNow();
    assert.deepEqual(transcript.state.sent.map((sent) => sent.prompt), ["Fine"]);
    assert.deepEqual(server.acks, [["a", "b", "c", "d"]], "a kind this computer doesn't know stays for one that does");
    assert.ok(logs.some((text) => /left out a message for agent=ghost \(no such agent\)/.test(text)), logs.join("\n"));
    assert.ok(logs.some((text) => /left out a message for agent=theo \(NONCE_DIGEST_MISMATCH/.test(text)), logs.join("\n"));
    assert.ok(logs.some((text) => /left out a message for agent=theo \(send rejected: SAND_AGENT_CAP/.test(text)), logs.join("\n"));
  } finally { await dispose(); }
});

test("nothing is taken before a turn can run, nor while no agent is listed yet", async () => {
  const { module, dispose } = await load("chat-inbox-ready");
  try {
    const transcript = fakeTranscript([]);
    const server = fakeServer([waiting("a", "theo", "Hi")]);
    let ready = false;
    const clock = { now: 1_000 };
    const inbox = inboxOf(module, { transcript, server, ready: () => ready, clock });
    await inbox.drainNow();
    assert.equal(server.reads, 0, "not even read before a turn can run");
    ready = true;
    await inbox.drainNow();
    assert.equal(server.reads, 1);
    assert.deepEqual(server.acks, [], "an empty list is one not read yet: nothing is left out");
    transcript.state.agentIds = ["theo"];
    clock.now += 60_000;
    await inbox.tick();
    assert.deepEqual(transcript.state.sent.map((sent) => sent.prompt), ["Hi"]);
    assert.deepEqual(server.acks, [["a"]]);
  } finally { await dispose(); }
});

test("the server's word starts a look, and another a moment later; with the stream down, one every 30 s", async () => {
  const { module, dispose } = await load("chat-inbox-timing");
  try {
    const transcript = fakeTranscript(["theo"]);
    const server = fakeServer([]);
    let connected = true;
    const clock = { now: 100_000 };
    const inbox = inboxOf(module, { transcript, server, connected: () => connected, clock });
    // Its timer is an hour here: the test moves the clock and ticks by hand.
    await inbox.start();
    const reads = () => server.reads;
    assert.equal(reads(), 1, "one look at start");
    // The stream up: nothing until the server says, or the safety look.
    clock.now += 60_000;
    await inbox.tick();
    assert.equal(reads(), 1);
    // The server's word, then once more a moment later (the message lands when its request ends).
    await inbox.onNotify();
    assert.equal(reads(), 2);
    server.messages.push(waiting("late", "theo", "Landed late"));
    clock.now += 1_000;
    await inbox.tick();
    assert.equal(reads(), 2, "not before the moment");
    clock.now += module.CHAT_INBOX_AGAIN_MS;
    await inbox.tick();
    assert.equal(reads(), 3);
    assert.deepEqual(transcript.state.sent.map((sent) => sent.prompt), ["Landed late"]);
    // The safety look.
    clock.now += module.CHAT_INBOX_SAFETY_POLL_MS;
    await inbox.tick();
    assert.equal(reads(), 4);
    // The stream down: every 30 s.
    connected = false;
    clock.now += module.CHAT_INBOX_POLL_MS - 1;
    await inbox.tick();
    assert.equal(reads(), 4);
    clock.now += 1;
    await inbox.tick();
    assert.equal(reads(), 5);
    inbox.stop();
    clock.now += module.CHAT_INBOX_SAFETY_POLL_MS;
    await inbox.tick();
    assert.equal(reads(), 5, "stopped, it no longer looks");
  } finally { await dispose(); }
});

test("a confirmation that fails is sent again, and the message is not handed twice", async () => {
  const { module, dispose } = await load("chat-inbox-ack");
  try {
    const transcript = fakeTranscript(["theo"]);
    const server = fakeServer([waiting("a", "theo", "Once")]);
    server.refuseAck = 1;
    const clock = { now: 1_000 };
    const logs = [];
    const inbox = inboxOf(module, { transcript, server, clock, logs });
    await inbox.drainNow();
    assert.ok(logs.some((text) => /chat-inbox failed, not confirmed: \/desktop\/api\/chats\/inbox\/ack answered 503; again in 5 s/.test(text)), logs.join("\n"));
    clock.now += 6_000;
    await inbox.tick();
    assert.equal(transcript.state.sent.length, 1, "handed once");
    assert.deepEqual(server.acks, [["a"]]);
  } finally { await dispose(); }
});

test("the client sends the box's token and reads the apps' envelope; the extension hears the notify bus", async () => {
  const { module, dispose } = await load("chat-inbox-client");
  const seen = [];
  const held = [waiting("m1", "theo", "Hi"), { id: "bad" }];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body.length > 0 ? JSON.parse(body) : null });
      const answer = req.url === "/desktop/api/chats/inbox" ? { code: 0, data: { messages: held } } : { code: 0, data: { removed: 1 } };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const backendUrl = `http://127.0.0.1:${server.address().port}`;
    const client = module.createChatInboxServer({ getBackendUrl: () => backendUrl, getAccessToken: async () => "box-token" });
    assert.deepEqual(await client.waiting(), [held[0]], "a malformed one is not taken");
    await client.ack(["m1"]);
    assert.deepEqual(seen.map((request) => [request.method, request.url, request.auth]), [["GET", "/desktop/api/chats/inbox", "Bearer box-token"], ["POST", "/desktop/api/chats/inbox/ack", "Bearer box-token"]]);
    assert.deepEqual(seen[1].body, { ids: ["m1"] });

    // The extension: it looks at start, and when the notify bus says `chat-inbox`.
    const transcript = fakeTranscript(["theo"]);
    const inboxServer = fakeServer([]);
    const handlers = new Map();
    const stops = [];
    const api = module.chatCopyExtension.start({
      deps: {
        auth: { getAccessToken: async () => "box-token" },
        transcript: { ...transcript, getAgentTranscriptTail: () => ({ entries: [] }) },
        "turn-execution": { isRunReady: async () => true },
        "notify-bus": { isConnected: () => true, onNotify: (topic, handler) => { handlers.set(topic, handler); return () => handlers.delete(topic); } },
      },
      host: { log: () => {}, whenBackgroundWorkReady: Promise.resolve() },
      onStop: (stop) => stops.push(stop),
      env: {},
      log: () => {},
      backendUrl,
      server: { newest: async () => ({}), copy: async () => {} },
      inboxServer,
      inboxTickMs: 3_600_000,
    });
    await api.whenStarted;
    await api.drainInboxNow();
    assert.ok(inboxServer.reads >= 1, "a look at start");
    assert.ok(handlers.has("chat-inbox"));
    inboxServer.messages.push(waiting("n1", "theo", "From the phone"));
    handlers.get("chat-inbox")();
    await api.drainInboxNow();
    assert.deepEqual(transcript.state.sent.map((sent) => sent.prompt), ["From the phone"]);
    for (const stop of stops) await stop();
    assert.ok(!handlers.has("chat-inbox"), "stopped, it stops listening");
  } finally {
    server.close();
    await dispose();
  }
});

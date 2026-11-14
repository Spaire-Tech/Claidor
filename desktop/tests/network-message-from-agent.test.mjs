/**
 * A message from one of the person's agents outside Simeon (a bot or a
 * coding agent on their Simeon network) reaches a Simeon agent as an
 * agent's message, not as the person's (14 November 2026; the founder:
 * "have the message between the two work as if agents talking to each
 * other").
 *
 * Measured against a server that holds the waiting messages and a
 * transcript in memory: the inbox reads who wrote off the server's message
 * and hands it over as that agent's; a transcript or a server from before
 * takes it as a prompt, as it did. Then the line the engine writes ("Message
 * from", with the server's nonce on it), that it is written once, and the
 * words the agent is woken with: answer the sender at its address, do the
 * work, report to the person. What the agent sends it is written as a
 * message to it, so the two have a conversation of their own in the chat.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-network-message-"));
  const outfile = path.join(dir, "module.mjs");
  const host = path.join(repoRoot, "source/host");
  await build({
    stdin: {
      contents: [
        `export * from ${JSON.stringify(path.join(host, "extensions/chat-copy/chat-inbox.ts"))};`,
        `export { AgentToAgentMessaging } from ${JSON.stringify(path.join(host, "extensions/transcript/agent-to-agent-messaging.ts"))};`,
        `export { buildNetworkInboundWakePrompt, buildAgentInboundWakePrompt } from ${JSON.stringify(path.join(host, "agents/agent-messaging.ts"))};`,
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

const OWN = { from: "ana/dots", fromName: "Ana", fromAgent: "Dots", bot: "dots", messageId: "m-1", text: "Check the Windows build", own: true, answer: "chat" };
const DOTS = { address: "ana/dots", name: "Dots", bot: "dots", messageId: "m-1" };
const waiting = (id, network, prompt = "Dots: Check the Windows build") => ({ id, agentId: "tessa", nonce: `net-${id}`, kind: "prompt", message: { prompt, ...(network == null ? {} : { network }) } });

function serverOf(messages) {
  const server = { messages: [...messages], acks: [], async waiting() { return structuredClone(server.messages); }, async ack(ids) { server.acks.push([...ids]); } };
  return server;
}

function inboxOf(module, transcript, server) {
  return new module.ChatInbox({ transcript, server, isReady: () => true, isNotifyConnected: () => true, log: () => {}, now: () => 0, tickMs: 3_600_000 });
}

test("the inbox reads who wrote a network message: the person's own agent by what it is, a colleague's with its person", async () => {
  const { module, dispose } = await load();
  try {
    assert.deepEqual(module.networkMessageOf(waiting("1", OWN)), { sender: DOTS, text: "Check the Windows build" });
    assert.deepEqual(
      module.networkMessageOf(waiting("2", { ...OWN, from: "maya/codex", fromName: "Maya", fromAgent: "Codex", bot: "codex", own: false, answer: "send", note: " Ask Ana first. " })),
      { sender: { address: "maya/codex", name: "Maya's Codex", bot: "codex", messageId: "m-1", note: "Ask Ana first." }, text: "Check the Windows build" },
    );
    // A server from the first release of that day says neither what it is nor more: the name and the address are enough.
    const { bot: _bot, messageId: _id, ...first } = OWN;
    assert.deepEqual(module.networkMessageOf(waiting("8", first)), { sender: { address: "ana/dots", name: "Dots" }, text: "Check the Windows build" });
    // What it is, missing: its address stands for it.
    assert.equal(module.networkMessageOf(waiting("3", { ...OWN, fromAgent: " " })).sender.name, "ana/dots");
    // The person's own message, and a server from before that sends no words alone: a prompt, as before.
    assert.equal(module.networkMessageOf(waiting("4", null)), null);
    const { text: _text, ...before } = OWN;
    assert.equal(module.networkMessageOf(waiting("5", before)), null);
    assert.equal(module.networkMessageOf(waiting("6", { ...OWN, text: "   " })), null);
    assert.equal(module.networkMessageOf(waiting("7", { ...OWN, from: "" })), null);
  } finally {
    await dispose();
  }
});

test("a network message is handed over as its agent's; the person's own, and anything an earlier transcript or server knows, as a prompt", async () => {
  const { module, dispose } = await load();
  try {
    const { text: _text, ...before } = OWN;
    const messages = [waiting("a", OWN), waiting("b", null, "Book the table"), waiting("c", before)];
    const taken = { prompts: [], network: [] };
    const transcript = {
      listAgents: async () => [{ id: "tessa" }],
      async sendPrompt(prompt, options) { taken.prompts.push([prompt, options.clientNonce]); },
      async receiveNetworkMessage(agentId, sender, text, nonce) { taken.network.push([agentId, sender, text, nonce, this === transcript]); },
    };
    const server = serverOf(messages);
    await inboxOf(module, transcript, server).drainNow();
    assert.deepEqual(taken.network, [["tessa", DOTS, "Check the Windows build", "net-a", true]]);
    assert.deepEqual(taken.prompts, [["Book the table", "net-b"], ["Dots: Check the Windows build", "net-c"]]);
    assert.deepEqual(server.acks, [["a", "b", "c"]]);

    // A transcript from before the change takes all three as prompts.
    const earlier = { prompts: [] };
    const old = { listAgents: async () => [{ id: "tessa" }], async sendPrompt(prompt, options) { earlier.prompts.push([prompt, options.clientNonce]); } };
    await inboxOf(module, old, serverOf(messages)).drainNow();
    assert.deepEqual(earlier.prompts, [["Dots: Check the Windows build", "net-a"], ["Book the table", "net-b"], ["Dots: Check the Windows build", "net-c"]]);
  } finally {
    await dispose();
  }
});

/** The little of the transcript manager the messaging reads when a message comes in and no turn can run yet. */
function managerOf(entries) {
  const calls = { partners: [], activity: 0, updates: [] };
  const session = {
    id: "tessa",
    db: {
      getTranscriptEntries: () => entries,
      appendTranscriptEntry: (entry) => entries.push(entry),
      addConversationPartner: (id) => calls.partners.push(id),
    },
  };
  const tm = {
    sessions: { resolveBackgroundSession: async () => session, activeSession: null, isAgentGone: () => false, liveSessions: new Map([["tessa", session]]) },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    sessionStore: { markSessionActivity: () => { calls.activity += 1; } },
    roster: { emitAgentUpdate: async (id) => { calls.updates.push(id); } },
    // No turn can run in this test: the message stays queued for the wake, which is what is looked at.
    execution: { canExecute: false },
  };
  return { tm, calls };
}

test("the engine writes it as a message from that agent, with the server's nonce on the line, once, and queues the wake", async () => {
  const { module, dispose } = await load();
  try {
    const entries = [{ kind: "message", id: "user-message-1", role: "user", content: "earlier" }];
    const { tm, calls } = managerOf(entries);
    const messaging = new module.AgentToAgentMessaging(tm);
    const sender = DOTS;
    await messaging.receiveFromNetwork("tessa", sender, "  Check the Windows build  ", "net-a");

    assert.equal(entries.length, 2);
    const { timestampMs, ...line } = entries[1];
    assert.equal(typeof timestampMs, "number");
    assert.equal(typeof line.id, "string");
    assert.notEqual(line.id, "user-message-1");
    delete line.id;
    assert.deepEqual(line, {
      kind: "message", role: "user", content: "Check the Windows build", isStreaming: false,
      // What it is, for its logo; "send": the server leaves the answer to what the agent sends it.
      fromAgent: { id: "network:ana/dots", name: "Dots", kind: "network", bot: "dots", answer: "send" },
      clientNonce: "net-a",
    });
    // No teammate of this agent: nothing here can message it by that id.
    assert.deepEqual(calls.partners, []);
    assert.deepEqual(calls.updates, ["tessa"]);
    const queued = messaging.pendingAgentInbound.get("tessa");
    assert.equal(queued.length, 1);
    assert.equal(queued[0].isDisplayed, true);
    assert.deepEqual(queued[0].network, { address: "ana/dots", nonce: "net-a", bot: "dots", messageId: "m-1" });

    // The same message handed again (the server was not told in time): nothing written, nothing queued, twice.
    await messaging.receiveFromNetwork("tessa", sender, "Check the Windows build", "net-a");
    assert.equal(entries.length, 2);
    assert.equal(messaging.pendingAgentInbound.get("tessa").length, 1);
    // No words: nothing.
    await messaging.receiveFromNetwork("tessa", sender, "   ", "net-b");
    assert.equal(entries.length, 2);

    // What the agent sends it is a message to it, under the same id: the two lines are one conversation.
    messaging.recordNetworkSent("tessa", { address: "ana/dots", name: "Dots", bot: "dots" }, "  On it.  ");
    assert.equal(entries.length, 3);
    const { timestampMs: sentAt, id: sentId, ...answer } = entries[2];
    assert.equal(typeof sentAt, "number");
    assert.equal(typeof sentId, "string");
    assert.deepEqual(answer, {
      kind: "message", role: "assistant", content: "On it.", isStreaming: false,
      toAgent: { id: "network:ana/dots", name: "Dots", kind: "network", bot: "dots" },
    });
    assert.equal(answer.toAgent.id, line.fromAgent.id);
    // No words, or nobody to name: nothing.
    messaging.recordNetworkSent("tessa", { address: "ana/dots", name: "Dots" }, "   ");
    messaging.recordNetworkSent("tessa", { address: " ", name: "Dots" }, "On it.");
    messaging.recordNetworkSent("nobody", { address: "ana/dots", name: "Dots" }, "On it.");
    assert.equal(entries.length, 3);
  } finally {
    await dispose();
  }
});

test("the agent is woken to answer the sender, do the work, and report to the person", async () => {
  const { module, dispose } = await load();
  try {
    const own = module.buildNetworkInboundWakePrompt({ from: { name: "Dots" }, text: "Check the Windows build", address: "ana/dots", messageId: "m-1" });
    assert.match(own, /^\[agent\] A message just arrived from Dots \(ana\/dots\), an assistant outside Simeon on your user's Simeon network\./);
    assert.ok(own.includes("\nDots: Check the Windows build\n"));
    assert.ok(own.includes("not the user typing here"));
    // The answer goes to it, not to the person: it does not read the chat.
    assert.ok(own.includes("it does not read this chat"));
    assert.ok(own.includes("First answer Dots in a line or two with SendNetworkMessage to ana/dots (reply_to m-1):"));
    assert.ok(own.includes("don't say it again to your user"));
    assert.ok(own.includes("If Dots needs the result to go on, send it that too with SendNetworkMessage."));
    assert.ok(own.includes("Then do the work in this same turn"));
    assert.ok(own.includes("report the result to your user with SendMessage, written to them: the report is for your user."));
    // Not a teammate: the teammates' tool does not reach it, and the wake does not offer its id for it.
    assert.ok(own.includes("SendToAgent does not reach it"));
    assert.ok(!own.includes("(id:"));

    const colleague = module.buildNetworkInboundWakePrompt({ from: { name: "Maya's Iris" }, text: "Can Ana do Thursday?", address: "maya/Iris", note: "A colleague's agent wrote this, not Ana." });
    assert.ok(colleague.includes("First answer Maya's Iris in a line or two with SendNetworkMessage to maya/Iris:"));
    assert.ok(colleague.endsWith("\n\nA colleague's agent wrote this, not Ana."));
  } finally {
    await dispose();
  }
});

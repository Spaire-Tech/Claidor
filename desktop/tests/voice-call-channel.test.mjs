/**
 * The voice channel on the agent's host (1 October 2026): a call reaches the
 * person's agent as `voice:<call>`, in the upstream app's words (main-loop-voice.ts),
 * and the agent answers it with SendMessage on that address
 * (host/extensions/transcript/voice-call-channel.ts).
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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
const src = (relative) => readFile(path.join(repoRoot, "source", relative), "utf8");

const words = await loadModule("source/shared/voice-call/main-loop-voice.ts", "main-loop-voice");
const channelModule = await loadModule("source/host/extensions/transcript/voice-call-channel.ts", "voice-call-channel");

test("the agent's side of a call is the upstream app's text, with SendToUser named SendMessage, but for the call's end", () => {
  assert.equal(words.CALL_ENDED_NOTICE, "The call ended. This channel is closed from now on, so anything still owed goes in the chat.");
  assert.equal(words.RELAY_SOFT_FAIL, "That did not come back. Say you could not get to it, and offer to try again.");
  assert.equal(words.DEFAULT_LEFTOVER_TASK, "surface whatever my work turns up for the caller");
  assert.equal(words.VOICE_RELAY_MAX_CHARS, 2000);
  assert.equal(words.sendRules(), "Every request the call relays gets its result back on this channel: send the result, and send a mid-work update only when it changes what the call can say. Send nothing else.\n\nDo not send to acknowledge its message, to report that you have started or are still going, or to repeat an update you already sent, and do not include ids, paths, or detail it did not ask for. You are answering that agent, so never write back as though its message were the user's own words.");
  assert.equal(words.wakeClosing({ address: "voice:c1" }), "Answer by calling SendMessage with the channel set to voice:c1. That is the only route back to the call: text you write as your reply, or a SendMessage without that channel, never reaches it and the caller keeps waiting. Lead with the result in a sentence or two of plain text, and keep working the rest of your task.");
  assert.equal(words.replyNudge({ address: "voice:c1" }), "Your last turn sent nothing, so the call is still waiting on its result. Deliver it now by actually invoking SendMessage with the channel set to voice:c1: a real tool call, not text you write. Text you write as your reply, and a SendMessage without that channel, never reach the call. That one goes to the chat instead, and the caller waits on regardless. Lead with the result in a sentence or two of plain text. If the result is not ready, send one line on that channel saying what you are doing and that it will take a moment, then keep working and send the result when you have it.");
  // The call's end, ours since 6 November 2026: "On the call I gave you the roster", when nothing of it was said.
  assert.equal(words.callEndedClosing(), "The call is over. Anything you sent on that closed address is not in this chat. If work is still going, a follow-up is owed, or the call's work has a result, call SendMessage with no channel: one short message covering those, then keep working them. Say you told the user something on the call only if the call's words show it was said; anything else is new to them, so give it as new (if they asked you to text it, this is that text). Text you write as your reply never reaches the user. If nothing was owed, send nothing. Do not call SendMessage with that closed address.");
  assert.equal(words.callEndedNudge(), "Your last turn sent nothing to this chat. If work is still going, a follow-up is owed, or the call's work has a result, deliver it now by actually invoking SendMessage with no channel: a real tool call, not text you write. Say you told the user something on the call only if the call's words show it was said; anything else is new to them, so give it as new (if they asked you to text it, this is that text). If nothing was owed, send nothing. Do not call SendMessage with that closed address.");
  assert.doesNotMatch(words.callEndedClosing() + words.callEndedNudge() + words.voiceChannelSection(), /already delivered a result on the call|any result you already sent on the call/);
  assert.match(words.voiceChannelSection(), /When the call ends you get a message on the same channel with what was said on it, and its address closes with it\..*What you send the call is said only if the call is still on when its voice gets to it: the user may hang up first\./s);
  assert.match(words.voiceCallsSection(), /^## Voice calls\n\nA call the user places is run by a second agent that talks to them, and it reaches you as a channel like any other connected one: an \[inbound\] message from a voice:<call> address\./);
  assert.match(words.voiceCallsSection(), /Every finished call is written to voice-calls\/ under your own files as one JSON file per call\. Read or grep that folder with Shell when the user refers back to a call\. It is the only record; the chat shows just a duration receipt\./);
  assert.match(words.voiceChannelSection(), /^## The voice channel\n\nWhile a call is open, SendMessage with the channel set to the call's voice:<call> address is how you answer it/);
  assert.match(words.midTurn(), /^The call reached you while you were working, so the message below landed mid-turn rather than as new work\.\n\nContinue, adjust, or stop what you are doing as the request warrants\./);
});

test("a relayed request wakes the agent with the call's ask, the caller's own words, the channel's rules and how to answer", () => {
  const wake = words.voiceRequestWake({ address: "voice:c1", request: "Move Friday's review to Monday", quotes: ["make it ten o'clock"], midTurn: true });
  assert.match(wake, /^The call reached you while you were working/);
  assert.match(wake, /\[inbound\] From voice:c1:\nMove Friday's review to Monday\n\nThe user's own words:\n> make it ten o'clock/);
  assert.match(wake, /## The voice channel/);
  assert.match(wake, /Answer by calling SendMessage with the channel set to voice:c1\./);
  assert.match(words.voiceRequestWake({ address: "voice:c1", request: " ", midTurn: false }), /^\[inbound\] From voice:c1:\nsurface whatever my work turns up for the caller/);
  assert.equal(words.clampRelay("x".repeat(2500)).length, 2000);
  assert.equal(words.voiceEndedWake({ address: "voice:c1" }).split("\n").slice(0, 2).join("\n"), "[inbound] From voice:c1:\nThe call ended. This channel is closed from now on, so anything still owed goes in the chat.");
  assert.match(words.voiceEndedWake({ address: "voice:c1" }), /\n\nThe call's words were not recorded, so do not tell the user what was said on it\.\n\nThe call is over\./);
  const heard = Array.from({ length: 45 }, (_, index) => ({ speaker: index % 2 === 0 ? "user" : "agent", text: `line ${index}` }));
  const facts = words.callEndedFacts({ heard, unsaid: ["Iris (main inbox), Marcus (Prime email)", "  "] });
  assert.match(facts, /^What was said on the call\. The user heard this and nothing else:\n\(earlier lines left out\)\n- The call's voice: line 5\n- User: line 6\n/);
  assert.equal(facts.split("\n").filter((line) => line.startsWith("- User: ") || line.startsWith("- The call's voice: ")).length, 40);
  assert.match(facts, /\n\nYou sent these to the call, but it ended before they were said, so the user has not heard them:\n- Iris \(main inbox\), Marcus \(Prime email\)$/);
  assert.equal(words.callEndedFacts({ heard: [{ speaker: "user", text: "x".repeat(500) }], unsaid: [] }).split("\n")[1].length, "- User: ".length + 400);
  assert.equal(words.isVoiceAddress("voice:c1"), true);
  assert.equal(words.isVoiceAddress("slack:C1"), false);
  assert.equal(words.isVoiceCallId("../etc"), false);
});

function fakeHost({ dir, sends = [], running = false }) {
  const prompts = [];
  const lanes = [];
  const failures = [];
  let interrupted = 0;
  // One run at a time for the agent, as the host's queue: the call's end waits for the request in progress.
  let queue = Promise.resolve();
  const written = [];
  const removed = [];
  const db = {
    getTranscriptEntries: () => written,
    appendTranscriptEntry: (entry) => { written.push(entry); },
    updateTranscriptEntry: (id, update) => { const index = written.findIndex((entry) => entry.id === id); if (index >= 0) written[index] = update(written[index]); },
    deleteTranscriptEntry: (id) => { const index = written.findIndex((entry) => entry.id === id); if (index >= 0) { written.splice(index, 1); removed.push(id); } return index >= 0; },
  };
  const tm = {
    execution: { canExecute: true },
    sessions: { resolveBackgroundSession: async (id) => ({ id, db }), activeSession: null, inMemoryTranscriptAgentId: null },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    runnerRegistry: { getRunner: () => runner },
    runLifecycle: {
      runningAgentIds: () => new Set(running ? ["a1"] : []),
      beginSessionRun() {},
      endSessionRun() {},
      enqueueExclusiveRun: (_id, run, options) => {
        lanes.push(options);
        const next = queue.then(run);
        queue = next.catch(() => {});
        return next;
      },
    },
    backgroundWakes: { dmPreemptedWakeAgentIds: new Set(), queueChannelDeliveryFailure: (agentId, failure) => failures.push({ agentId, ...failure }) },
    turnRuntime: { activeRequestPrompts: new Map(), activeRequestSources: new Map() },
    roster: { emitAgentUpdate: async () => {}, emit() {} },
    sessionStore: { getAgentDir: () => dir, markSessionActivity() {} },
  };
  const runner = {
    interrupt: () => { interrupted += 1; return running; },
    run: async (prompt) => {
      prompts.push(prompt);
      const send = sends.shift();
      if (send?.wait != null) await send.wait;
      let sent = 0;
      if (send?.call != null) { channel.deliver("a1", send.call, { kind: "text", text: send.text }); sent += 1; }
      if (send?.chat === true) sent += 1;
      return { aborted: false, sentMessageCount: sent };
    },
  };
  const channel = new channelModule.VoiceCallChannel(tm);
  return { channel, prompts, lanes, failures, interruptions: () => interrupted, tm, written, removed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("the call opens, relays mid-turn, carries the agent's answer back, nudges once when nothing came, then closes with its record", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-voice-agent-"));
  try {
    const host = fakeHost({ dir, running: true, sends: [{ call: "voice:call-0001", text: "Moved it to Monday at ten." }, {}, {}, {}] });
    assert.deepEqual(await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "open" }), { address: "voice:call-0001" });
    await assert.rejects(() => host.channel.handle({ agentId: "a1", callId: "../x", kind: "open" }), /call id/);
    await settle();
    // The call's line goes into the chat where the call began, before anything it asks for.
    assert.equal(host.written.length, 1);
    assert.equal(host.written[0].kind, "event");
    assert.match(host.written[0].id, /^event-/);
    assert.deepEqual(host.written[0].event, { type: "voice-call", callId: "call-0001", status: "live" });

    assert.deepEqual(await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "request", request: "Move Friday's review to Monday", quotes: ["ten o'clock"] }), { accepted: true });
    await settle();
    assert.equal(host.interruptions(), 1, "a run in progress is interrupted for the caller");
    assert.match(host.prompts[0], /^The call reached you while you were working/);
    assert.match(host.prompts[0], /\[inbound\] From voice:call-0001:\nMove Friday's review to Monday/);
    assert.deepEqual(host.lanes[0], { lane: "user", source: "voice-call" });
    assert.equal(host.prompts.length, 1, "an answer on the call needs no nudge");
    const outbox = await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "outbox", after: 0 });
    assert.deepEqual(outbox.messages, [{ seq: 1, text: "Moved it to Monday at ten." }]);
    assert.deepEqual((await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "outbox", after: 1 })).messages, []);

    await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "request", request: "And tell Dana" });
    await settle();
    assert.equal(host.prompts.length, 3);
    assert.match(host.prompts[2], /^Your last turn sent nothing, so the call is still waiting on its result\./, "a turn that sent nothing to the call is nudged once");

    assert.equal(host.channel.deliver("a1", "voice:someone-else", { kind: "text", text: "x" }), false, "an address that is not this agent's call is not taken");
    const ended = await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "ended", record: { seconds: 61, recap: "Bass, you moved the review.", personName: "Bass", transcript: [{ speaker: "user", text: "Move it" }, { speaker: "user", text: "(Your work just came back.)" }, { speaker: "user", text: "(Your work just came back. Tell me what it found.)" }, { speaker: "agent", text: "On it." }] } });
    await settle();
    assert.equal(ended.closed, true);
    // The same line is filled in with the duration and what was said, the app's nudge left out (today's words and an older app's).
    assert.equal(ended.exchange, 2);
    assert.equal(host.written.length, 1, "one line for the whole call");
    assert.deepEqual(host.written[0].event, { type: "voice-call", callId: "call-0001", status: "ended", seconds: 61, lines: [{ speaker: "user", text: "Move it" }, { speaker: "agent", text: "On it." }] });
    // The person is never written as a peer, so nothing can draw them as an agent.
    assert.equal(host.written.some((entry) => entry.fromAgent != null || entry.toAgent != null), false);
    assert.match(host.prompts[3], /^\[inbound\] From voice:call-0001:\nThe call ended\. This channel is closed from now on/);
    assert.match(host.prompts[4], /^Your last turn sent nothing to this chat\./, "the call-ended turn that sent nothing is nudged once");
    assert.match(host.prompts[3], /\n\nWhat was said on the call\. The user heard this and nothing else:\n- User: Move it\n- The call's voice: On it\.\n\nThe call is over\./, "the call's end says what was said, the app's nudges left out");
    assert.equal(host.channel.deliver("a1", "voice:call-0001", { kind: "text", text: "late" }), true, "a send on the closed address is dropped");
    assert.deepEqual(host.failures, [{ agentId: "a1", addressToken: "voice:call-0001", reason: words.CALL_ALREADY_ENDED }], "after the call's end was settled, the agent is told the send went nowhere");
    assert.deepEqual((await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "outbox", after: 1 })).messages, []);
    await assert.rejects(() => host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "request", request: "more" }), /not open/);

    const files = await readdir(path.join(dir, "voice-calls"));
    assert.equal(files.length, 1);
    assert.match(files[0], /-call-0001\.json$/);
    assert.equal(ended.record, `voice-calls/${files[0]}`);
    const record = JSON.parse(await readFile(path.join(dir, "voice-calls", files[0]), "utf8"));
    assert.equal(record.call, "voice:call-0001");
    assert.equal(record.seconds, 61);
    assert.equal(record.recap, "Bass, you moved the review.");
    assert.equal(record.requests, 2);
    assert.deepEqual(record.transcript, [{ speaker: "user", text: "Move it" }, { speaker: "agent", text: "On it." }]);
    assert.deepEqual(record.sentOnCall, ["Moved it to Monday at ten."]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// 5 November 2026, Simeon's chat: the person asked for the roster, said "You can just text it to me" and hung up;
// the answer came after, went to the closed call, and the chat said "On the call I gave you the roster".
test("an answer sent after the hang-up is told to the agent as never said, with what the call did say", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-voice-agent-"));
  try {
    let finish;
    const working = new Promise((resolve) => { finish = resolve; });
    const roster = "Iris (main inbox), Marcus (Prime email), Nora (finances)";
    const host = fakeHost({ dir, sends: [{ wait: working, call: "voice:call-0004", text: roster }, { chat: true }] });
    await host.channel.handle({ agentId: "a1", callId: "call-0004", kind: "open" });
    await settle();
    await host.channel.handle({ agentId: "a1", callId: "call-0004", kind: "request", request: "What is the user's current roster of agents?" });
    await settle();
    assert.deepEqual((await host.channel.handle({ agentId: "a1", callId: "call-0004", kind: "outbox", after: 0 })).messages, []);
    const transcript = [
      { speaker: "user", text: "So what is my current roster for my agents?" },
      { speaker: "agent", text: "I'm getting that information for you now, Bass." },
      { speaker: "user", text: "Okay. I'm gonna hang up now. You can just text it to me." },
      { speaker: "agent", text: "Okay, Bass. I'll text you the agent roster." },
    ];
    await host.channel.handle({ agentId: "a1", callId: "call-0004", kind: "ended", record: { seconds: 81, transcript } });
    await settle();
    assert.equal(host.prompts.length, 1, "the call's end waits for the request still at work");
    finish();
    await settle();
    assert.equal(host.prompts.length, 2, "no nudge to answer a call that has ended");
    const ended = host.prompts[1];
    assert.match(ended, /^\[inbound\] From voice:call-0004:\nThe call ended\./);
    assert.match(ended, /What was said on the call\. The user heard this and nothing else:\n- User: So what is my current roster for my agents\?\n- The call's voice: I'm getting that information for you now, Bass\.\n- User: Okay\. I'm gonna hang up now\. You can just text it to me\.\n- The call's voice: Okay, Bass\. I'll text you the agent roster\./);
    assert.match(ended, new RegExp(`You sent these to the call, but it ended before they were said, so the user has not heard them:\\n- ${roster.replace(/[()]/g, "\\$&")}\\n`));
    assert.match(ended, /Say you told the user something on the call only if the call's words show it was said; anything else is new to them, so give it as new \(if they asked you to text it, this is that text\)\./);
    assert.deepEqual(host.failures, [], "told in the call's end, not again as a failed send");
    const files = await readdir(path.join(dir, "voice-calls"));
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, "voice-calls", files[0]), "utf8")).sentOnCall, [], "the record holds only what reached the call");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("what the voice never read before the hang-up is never said; what it read is left to the call's words", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-voice-agent-"));
  try {
    const host = fakeHost({ dir, sends: [{ call: "voice:call-0005", text: "Tessa found no message from Apple." }, { call: "voice:call-0005", text: "The build is still Removed." }, { chat: true }] });
    await host.channel.handle({ agentId: "a1", callId: "call-0005", kind: "open" });
    await settle();
    await host.channel.handle({ agentId: "a1", callId: "call-0005", kind: "request", request: "Check Tessa's messages about Apple" });
    await settle();
    assert.deepEqual((await host.channel.handle({ agentId: "a1", callId: "call-0005", kind: "outbox", after: 0 })).messages, [{ seq: 1, text: "Tessa found no message from Apple." }]);
    await host.channel.handle({ agentId: "a1", callId: "call-0005", kind: "request", request: "And the build?" });
    await settle();
    // No transcript from this app: nothing can be claimed as said.
    await host.channel.handle({ agentId: "a1", callId: "call-0005", kind: "ended", record: { seconds: 30 } });
    await settle();
    const ended = host.prompts.at(-1);
    assert.match(ended, /The call's words were not recorded, so do not tell the user what was said on it\.\n\nYou sent these to the call, but it ended before they were said, so the user has not heard them:\n- The build is still Removed\.\n\nThe call is over\./);
    assert.doesNotMatch(ended, /- Tessa found no message from Apple\./, "read by the voice: whether it was said is the call's words' to show");
    // Read after the hang-up, a message can't be said: the voice's late read changes nothing.
    assert.deepEqual((await host.channel.handle({ agentId: "a1", callId: "call-0005", kind: "outbox", after: 1 })).messages, [{ seq: 2, text: "The build is still Removed." }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a call that never connected leaves no line in the chat", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-voice-agent-"));
  try {
    const host = fakeHost({ dir });
    await host.channel.handle({ agentId: "a1", callId: "call-0003", kind: "open" });
    await settle();
    assert.equal(host.written.length, 1, "the line is up while the call connects");
    const ended = await host.channel.handle({ agentId: "a1", callId: "call-0003", kind: "ended", record: { seconds: 0, transcript: [] } });
    assert.equal(ended.exchange, 0);
    assert.equal(host.written.length, 0);
    assert.equal(host.removed.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a call where nothing was asked ends without waking the agent", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-voice-agent-"));
  try {
    const host = fakeHost({ dir });
    await host.channel.handle({ agentId: "a1", callId: "call-0002", kind: "open" });
    await host.channel.handle({ agentId: "a1", callId: "call-0002", kind: "ended", record: {} });
    await settle();
    assert.equal(host.prompts.length, 0);
    assert.equal((await readdir(path.join(dir, "voice-calls"))).length, 1, "the record is still kept");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the host carries the channel: the system prompt section, SendMessage keeps voice: addresses, and call messages stay out of the chat", async () => {
  const assembly = await src("host/runner/system-prompt-assembly.ts");
  assert.match(assembly, /add\(getWorkflowsSection\(\)\); if \(!deps\.isSubagentRunner\) add\(voiceCallsSection\(\)\);/);
  const schema = await src("host/runner/tools/send-message-schema.ts");
  assert.match(schema, /if \(!isAnyChannelAvailable\(\) && !isVoiceAddress\(stripped\.channel\)\) delete stripped\.channel;/);
  const turn = await src("host/extensions/transcript/turn-runtime.ts");
  assert.match(turn, /if \(isVoiceAddress\(incoming\.channel\)\) return undefined;/);
  const wakes = await src("host/extensions/transcript/background-wakes.ts");
  assert.match(wakes, /if \(isVoiceAddress\(addressToken\)\) \{\n\s+if \(!this\.tm\.voiceCalls\.deliver\(agentId, addressToken, outbound\)\)/);
  const gateway = await src("host/gateway-protocol.ts");
  assert.match(gateway, /voiceCall: \(api: GatewayApi, body: string\) => api\.voiceCall\(parseCommandArgs\(body\)\)/);
  const serde = await src("host/extensions/session/agent-db-serde.ts");
  assert.match(serde, /"voice-call"/);
});

test("a call's line reads \"Voice chat · 01:49\", and the sidebar's preview says the same", async () => {
  assert.equal(words.VOICE_CALL_EVENT, "voice-call");
  assert.equal(words.voiceCallDuration(109), "01:49");
  assert.equal(words.voiceCallDuration(3723), "1:02:03");
  assert.equal(words.voiceCallLineText({ type: "voice-call", status: "ended", seconds: 109 }), "Voice chat · 01:49");
  assert.equal(words.voiceCallLineText({ type: "voice-call", status: "live" }), "Voice chat");
  assert.equal(words.voiceCallLineText({ type: "name-changed", to: "x" }), null);
  const projection = await loadModule("source/host/extensions/session/session-projection.ts", "session-projection");
  const before = { kind: "send-message", id: "m1", message: { type: "text", content: "Done." } };
  const call = { kind: "event", id: "event-1", event: { type: "voice-call", callId: "c1", status: "ended", seconds: 109, lines: [] } };
  assert.deepEqual(projection.getLastEntryFromTranscript([before, call]), { kind: "text", text: "Voice chat · 01:49" });
  assert.deepEqual(projection.getLastEntryFromTranscript([call, before]), { kind: "text", text: "Done." }, "a message after the call is the preview");
  assert.deepEqual(projection.getLastEntryFromTranscript([before, { kind: "event", id: "e2", event: { type: "name-changed", to: "Ada" } }]), { kind: "text", text: "Done." }, "other events stay out of the preview");
});

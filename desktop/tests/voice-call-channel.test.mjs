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

test("the agent's side of a call is the upstream app's text, with SendToUser named SendMessage", () => {
  assert.equal(words.CALL_ENDED_NOTICE, "The call ended. This channel is closed from now on, so anything still owed goes in the chat.");
  assert.equal(words.RELAY_SOFT_FAIL, "That did not come back. Say you could not get to it, and offer to try again.");
  assert.equal(words.DEFAULT_LEFTOVER_TASK, "surface whatever my work turns up for the caller");
  assert.equal(words.VOICE_RELAY_MAX_CHARS, 2000);
  assert.equal(words.sendRules(), "Every request the call relays gets its result back on this channel: send the result, and send a mid-work update only when it changes what the call can say. Send nothing else.\n\nDo not send to acknowledge its message, to report that you have started or are still going, or to repeat an update you already sent, and do not include ids, paths, or detail it did not ask for. You are answering that agent, so never write back as though its message were the user's own words.");
  assert.equal(words.wakeClosing({ address: "voice:c1" }), "Answer by calling SendMessage with the channel set to voice:c1. That is the only route back to the call: text you write as your reply, or a SendMessage without that channel, never reaches it and the caller keeps waiting. Lead with the result in a sentence or two of plain text, and keep working the rest of your task.");
  assert.equal(words.replyNudge({ address: "voice:c1" }), "Your last turn sent nothing, so the call is still waiting on its result. Deliver it now by actually invoking SendMessage with the channel set to voice:c1: a real tool call, not text you write. Text you write as your reply, and a SendMessage without that channel, never reach the call. That one goes to the chat instead, and the caller waits on regardless. Lead with the result in a sentence or two of plain text.");
  assert.equal(words.callEndedClosing(), "The call is over. Anything you already sent on that closed address is not in this chat. If work is still going, a follow-up is owed, or you already delivered a result on the call, call SendMessage with no channel: one short message covering those, then keep working them. Text you write as your reply never reaches the user. If nothing was owed, send nothing. Do not call SendMessage with that closed address.");
  assert.equal(words.callEndedNudge(), "Your last turn sent nothing to this chat. If work is still going, a follow-up is owed, or you already delivered a result on the call, deliver it now by actually invoking SendMessage with no channel: a real tool call, not text you write. If nothing was owed, send nothing. Do not call SendMessage with that closed address.");
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
  assert.equal(words.isVoiceAddress("voice:c1"), true);
  assert.equal(words.isVoiceAddress("slack:C1"), false);
  assert.equal(words.isVoiceCallId("../etc"), false);
});

function fakeHost({ dir, sends = [], running = false }) {
  const prompts = [];
  const lanes = [];
  let interrupted = 0;
  const tm = {
    execution: { canExecute: true },
    sessions: { resolveBackgroundSession: async (id) => ({ id }) },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    runnerRegistry: { getRunner: () => runner },
    runLifecycle: { runningAgentIds: () => new Set(running ? ["a1"] : []), beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run, options) => { lanes.push(options); await run(); } },
    backgroundWakes: { dmPreemptedWakeAgentIds: new Set() },
    turnRuntime: { activeRequestPrompts: new Map(), activeRequestSources: new Map() },
    roster: { emitAgentUpdate: async () => {} },
    sessionStore: { getAgentDir: () => dir },
  };
  const runner = {
    interrupt: () => { interrupted += 1; return running; },
    run: async (prompt) => {
      prompts.push(prompt);
      const send = sends.shift();
      let sent = 0;
      if (send?.call != null) { channel.deliver("a1", send.call, { kind: "text", text: send.text }); sent += 1; }
      if (send?.chat === true) sent += 1;
      return { aborted: false, sentMessageCount: sent };
    },
  };
  const channel = new channelModule.VoiceCallChannel(tm);
  return { channel, prompts, lanes, interruptions: () => interrupted, tm };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("the call opens, relays mid-turn, carries the agent's answer back, nudges once when nothing came, then closes with its record", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-voice-agent-"));
  try {
    const host = fakeHost({ dir, running: true, sends: [{ call: "voice:call-0001", text: "Moved it to Monday at ten." }, {}, {}, {}] });
    assert.deepEqual(await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "open" }), { address: "voice:call-0001" });
    await assert.rejects(() => host.channel.handle({ agentId: "a1", callId: "../x", kind: "open" }), /call id/);

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
    const ended = await host.channel.handle({ agentId: "a1", callId: "call-0001", kind: "ended", record: { seconds: 61, recap: "Bass, you moved the review.", transcript: [{ speaker: "user", text: "Move it" }, { speaker: "agent", text: "On it." }] } });
    await settle();
    assert.equal(ended.closed, true);
    assert.match(host.prompts[3], /^\[inbound\] From voice:call-0001:\nThe call ended\. This channel is closed from now on/);
    assert.match(host.prompts[4], /^Your last turn sent nothing to this chat\./, "the call-ended turn that sent nothing is nudged once");
    assert.equal(host.channel.deliver("a1", "voice:call-0001", { kind: "text", text: "late" }), true, "a send on the closed address is dropped");
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
  assert.match(assembly, /add\(getChannelsSection\(\)\); if \(!deps\.isSubagentRunner\) add\(voiceCallsSection\(\)\);/);
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

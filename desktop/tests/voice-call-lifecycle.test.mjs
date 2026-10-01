/**
 * Voice calls (30 September 2026): the call's lifecycle (call-state.ts), the
 * call as a channel into the agent, answered on the Mac with a fake coordinator (handoff.ts),
 * and the main-process service that opens the banner, starts the call and
 * writes its record (voice-call-service.ts).
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const state = await loadModule("source/shared/voice-call/call-state.ts", "call-state");
const handoff = await loadModule("source/shared/voice-call/handoff.ts", "handoff");
const service = await loadModule("source/electron-main/voice/voice-call-service.ts", "voice-call-service");
const api = await loadModule("source/electron-main/voice/voice-call-api.ts", "voice-call-api");
const simeonApi = await loadModule("source/shared/node/cursor-backend/simeon-api.ts", "simeon-api");

const run = (events, from = state.initialCallState()) => events.reduce(state.reduceCall, from);

test("a call rings twice and waits for its token, then connects, talks, works and ends", () => {
  let s = state.initialCallState();
  assert.deepEqual(state.bannerView(s, 0), { state: "ringing", status: "Calling…", hasWave: false, bar: "none" });
  s = run([{ type: "rings-done" }], s);
  assert.equal(state.shouldStartSession(s), false, "no token yet");
  s = run([{ type: "setup-ready" }], s);
  assert.equal(state.shouldStartSession(s), true);
  s = run([{ type: "connecting" }], s);
  assert.equal(state.bannerView(s, 0).status, "Calling…");
  s = run([{ type: "connected", conversationId: "conv_1", atMs: 1_000 }, { type: "mode", mode: "speaking" }], s);
  assert.deepEqual(state.bannerView(s, 13_500), { state: "speaking", status: "0:12", hasWave: true, bar: "call" });
  s = run([{ type: "work", label: "Sending the agenda…" }], s);
  assert.deepEqual(state.bannerView(s, 20_000), { state: "working", status: "Sending the agenda…", hasWave: false, bar: "call" });
  s = run([{ type: "work", label: null }, { type: "mode", mode: "listening" }], s);
  assert.equal(state.bannerView(s, 20_000).state, "listening");
  s = run([{ type: "disconnected", reason: "agent", atMs: 169_000 }], s);
  assert.deepEqual(state.bannerView(s, 999_999), { state: "ended", status: "Call ended · 2:48", hasWave: false, bar: "after" });
  assert.equal(state.callSeconds(s, 999_999), 168);
  assert.equal(run([{ type: "connected", conversationId: "x", atMs: 0 }, { type: "work", label: "late" }], s), s, "an ended call does not change");
});

test("a call that cannot start fails with a sentence; hanging up while ringing is not a failure", () => {
  const refused = run([{ type: "setup-failed", message: "Calls aren't switched on yet" }]);
  assert.deepEqual(state.bannerView(refused, 0), { state: "failed", status: "Calls aren't switched on yet", hasWave: false, bar: "close" });
  const dropped = run([{ type: "rings-done" }, { type: "setup-ready" }, { type: "connecting" }, { type: "disconnected", reason: "error", atMs: 5 }]);
  assert.equal(state.bannerView(dropped, 0).status, "Couldn't connect");
  const cancelled = run([{ type: "hang-up", atMs: 5 }]);
  assert.deepEqual(state.bannerView(cancelled, 0), { state: "ended", status: "Call ended", hasWave: false, bar: "after" });
  const live = run([{ type: "connected", conversationId: "c", atMs: 0 }, { type: "error", message: "blip" }]);
  assert.equal(live.phase, "live", "an SDK error while talking does not end the call");
  assert.equal(run([{ type: "mute", isMuted: true }]).isMuted, true);
});

function fakeLegs({ tail = [], roster = [] } = {}) {
  const calls = [];
  const legs = {
    tail: [...tail],
    roster: [...roster],
    outbox: [],
    voiceFails: false,
    voiceCall: async (args) => {
      calls.push(["voiceCall", args]);
      if (legs.voiceFails) throw new Error("box asleep");
      if (args.kind === "outbox") return { messages: legs.outbox.filter((message) => message.seq > args.after), open: true };
      return args.kind === "open" ? { address: `voice:${args.callId}` } : args.kind === "request" ? { accepted: true } : { closed: true };
    },
    listAgents: async () => legs.roster,
    getAgentTranscriptTail: async (args) => { calls.push(["tail", args]); return { entries: legs.tail }; },
    appendSendMessage: async (args) => { calls.push(["append", args]); return { id: "s9" }; },
    updateAgent: async (args) => { calls.push(["update", args]); return {}; },
  };
  return { legs, calls };
}

function manualScheduler() {
  const queue = [];
  return { schedule: (run) => { queue.push(run); return () => { const index = queue.indexOf(run); if (index >= 0) queue.splice(index, 1); }; }, async step() { const run = queue.shift(); run?.(); await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); }, get size() { return queue.length; } };
}

test("the call is a channel into the agent: send_task relays the request, and what the agent sends on the call comes back to the voice", async () => {
  const { legs, calls } = fakeLegs({ tail: [{ kind: "message", id: "u0", role: "user", content: "Morning" }, { kind: "send-message", id: "s0", message: { type: "text", content: "Morning, Bass." } }], roster: [{ id: "a1", isRunning: false }] });
  const statuses = [];
  const said = [];
  const scheduler = manualScheduler();
  const channel = handoff.createCallChannel({ agentId: "a1", callId: "call-1234", legs, onStatus: (label) => statuses.push(label), onSaid: (texts) => said.push(texts), schedule: scheduler.schedule });
  assert.equal(await channel.sendTask({ task: "Book it" }), "That did not come back. Say you could not get to it, and offer to try again.", "nothing relays before the call's channel is open");
  assert.equal(await channel.open(), true);
  assert.deepEqual(calls.find(([name, args]) => name === "voiceCall" && args.kind === "open")[1], { agentId: "a1", callId: "call-1234", kind: "open" });
  assert.equal(await channel.sendTask({ task: "Send the agenda to Dana", quote: "tell her it's final" }), "Sent. Say you're on it, in a few words, and carry on with them. What it turns up comes back to you here.");
  assert.deepEqual(calls.find(([name, args]) => name === "voiceCall" && args.kind === "request")[1], { agentId: "a1", callId: "call-1234", kind: "request", request: "Send the agenda to Dana", quotes: ["tell her it's final"] });
  assert.deepEqual(statuses, ["Sending the agenda to Dana…"]);
  const long = "x".repeat(2_500);
  await channel.sendTask({ task: long });
  assert.equal(calls.filter(([name, args]) => name === "voiceCall" && args.kind === "request").at(-1)[1].request.length, 2_000, "a relayed request is at most 2,000 characters");
  legs.roster = [{ id: "a1", isRunning: true, currentActivity: { kind: "tool", tool: "CallMcpTool", detail: "gmail", callId: "c" } }];
  await scheduler.step();
  assert.equal(statuses.at(-1), "Using Gmail…");
  assert.deepEqual(said, []);
  legs.outbox.push({ seq: 1, text: "Sent it to Dana." }, { seq: 2, text: "She's in at ten." });
  legs.roster = [{ id: "a1", isRunning: false }];
  await scheduler.step();
  assert.deepEqual(said, [["Sent it to Dana.", "She's in at ten."]]);
  assert.equal(statuses.at(-1), null);
  await scheduler.step();
  assert.deepEqual(said, [["Sent it to Dana.", "She's in at ten."]], "a message is said once");
  assert.equal(await channel.recallTextMessages(), "Your latest text messages, oldest first:\nThem: Morning\nYou: Morning, Bass.");
  await channel.end({ seconds: 42, recap: "You asked me to send the agenda.", transcript: [{ speaker: "user", text: "Send it" }] });
  assert.deepEqual(calls.find(([name, args]) => name === "voiceCall" && args.kind === "ended")[1], { agentId: "a1", callId: "call-1234", kind: "ended", record: { seconds: 42, recap: "You asked me to send the agenda.", transcript: [{ speaker: "user", text: "Send it" }] } });
  assert.equal(scheduler.size, 0, "the outbox is not read after the call ends");
  assert.equal(await channel.sendTask({ task: "One more" }), "That did not come back. Say you could not get to it, and offer to try again.");
});

test("a request that does not reach the agent gets the upstream app's soft fail; an empty chat says so", async () => {
  const { legs } = fakeLegs({ roster: [{ id: "a1", isRunning: false }] });
  const scheduler = manualScheduler();
  const channel = handoff.createCallChannel({ agentId: "a1", callId: "call-5678", legs, onStatus: () => {}, onSaid: () => {}, schedule: scheduler.schedule });
  await channel.open();
  legs.voiceFails = true;
  assert.equal(await channel.sendTask({ task: "do it" }), "That did not come back. Say you could not get to it, and offer to try again.");
  assert.equal(await channel.recallTextMessages(), "There are no text messages between you yet.");
  channel.dispose();
});

function fakeWindow() {
  const events = [];
  const window = { opened: 0, focused: 0, closed: 0, reloaded: 0, isOpenNow: false, heights: [], events,
    open() { this.opened += 1; this.isOpenNow = true; }, focus() { this.focused += 1; }, reload() { this.reloaded += 1; }, close() { this.closed += 1; this.isOpenNow = false; },
    isOpen() { return this.isOpenNow; }, send(event) { events.push(event); }, setContentHeight(height) { this.heights.push(height); } };
  return window;
}

function memoryStore() { const map = new Map(); return { map, get: (id) => map.get(id) ?? null, set: (id, voice) => { if (voice == null) map.delete(id); else map.set(id, voice); } }; }

test("one call at a time: a second start brings the banner forward; the call's setup and token come from the agent", async () => {
  const { legs, calls } = fakeLegs({ roster: [{ id: "a1", name: "Ada", title: "Chief of staff", description: "Runs my week.", avatarColor: "red", avatarDataUrl: null, voiceId: "L0Dsvb3SLTyegXwtm47J" }], tail: [{ kind: "message", id: "m", role: "user", content: "Hi Ada" }] });
  const window = fakeWindow();
  const voices = memoryStore();
  const calls2 = [];
  const voiceApi = { startCall: async () => ({ token: "tok", conversationId: null, agentId: "el" }), endCall: async (id, seconds) => { calls2.push(["end", id, seconds]); return { seconds, summary: "Talked about the week.", transcript: [{ speaker: "user", text: "Book it" }] }; }, listVoices: async () => [] };
  const svc = service.createVoiceCallService({ legs, api: () => voiceApi, window, voiceStore: voices, previews: { urlFor: async () => null }, focusAgentChat: () => {}, isEnabled: () => true, log: () => {}, random: () => 0, now: () => 50_000, wait: async () => {}, newCallId: () => "call-abcdef", schedule: manualScheduler().schedule });
  assert.deepEqual(svc.start("a1"), { status: "started", agentId: "a1" });
  assert.deepEqual(svc.start("a2"), { status: "focused", agentId: "a1" });
  assert.equal(window.opened, 1);
  assert.equal(window.focused, 1);
  assert.deepEqual(await svc.handlePanel("getSetup", {}), { agentId: "a1", name: "Ada", color: "red", avatarDataUrl: null });
  const connected = await svc.handlePanel("connect", {});
  assert.equal(connected.ok, true);
  assert.equal(connected.token, "tok");
  assert.equal(connected.overrides.tts.voiceId, "L0Dsvb3SLTyegXwtm47J");
  assert.match(connected.overrides.agent.prompt.prompt, /You are Ada, Chief of staff/);
  assert.match(connected.overrides.agent.prompt.prompt, /Them: Hi Ada/);
  assert.deepEqual(calls.find(([name, args]) => name === "voiceCall" && args.kind === "open")[1], { agentId: "a1", callId: "call-abcdef", kind: "open" }, "the call's channel opens as it connects");
  assert.match(await svc.handlePanel("sendTask", { task: "Book it" }), /^Sent\./);
  assert.equal(calls.filter(([name, args]) => name === "voiceCall" && args.kind === "request").length, 1);
  await svc.handlePanel("connected", { conversationId: "conv_7" });
  await svc.handlePanel("resize", { height: 129 });
  assert.deepEqual(window.heights, [129]);
  await svc.handlePanel("callEnded", { conversationId: "conv_7", seconds: 168 });
  await svc.settled();
  assert.deepEqual(calls2, [["end", "conv_7", 168]]);
  const record = calls.find(([name]) => name === "append")[1];
  assert.deepEqual(record, { agentId: "a1", message: { type: "text", content: "Voice call · 2:48\n\nTalked about the week." } });
  assert.deepEqual(calls.find(([name, args]) => name === "voiceCall" && args.kind === "ended")[1].record, { seconds: 168, recap: "Talked about the week.", transcript: [{ speaker: "user", text: "Book it" }] }, "the call's record goes to the agent as its channel closes");
  svc.windowClosed();
  window.isOpenNow = false;
  assert.equal(svc.isCallActive(), false);
});

test("a refused call reads politely; a call that never connected leaves no record; switched off means no call", async () => {
  const { legs, calls } = fakeLegs({ roster: [{ id: "a1", name: "Ada" }] });
  const window = fakeWindow();
  const refusing = { startCall: async () => { throw new simeonApi.SimeonApiError("Voice calls are not switched on on this server.", 503); }, endCall: async () => { throw new Error("never"); }, listVoices: async () => [] };
  const svc = service.createVoiceCallService({ legs, api: () => refusing, window, voiceStore: memoryStore(), previews: { urlFor: async () => null }, focusAgentChat: () => {}, isEnabled: () => true, log: () => {} });
  svc.start("a1");
  assert.deepEqual(await svc.handlePanel("connect", {}), { ok: false, message: "Calls aren't switched on yet" });
  await svc.handlePanel("callEnded", { conversationId: null, seconds: 0 });
  await svc.settled();
  assert.equal(calls.some(([name]) => name === "append"), false);
  assert.equal(service.connectFailureMessage(new simeonApi.SimeonApiError("no credit", 402)), "Out of credit for calls");
  const off = service.createVoiceCallService({ legs, api: () => refusing, window: fakeWindow(), voiceStore: memoryStore(), previews: { urlFor: async () => null }, focusAgentChat: () => {}, isEnabled: () => false, log: () => {} });
  assert.throws(() => off.start("a1"), /switched off on this Mac/);
  assert.equal(off.menuItem(), null);
});

test("the voice picker saves the agent's voice through updateAgent, keeps a Mac copy, and the menu names the open agent", async () => {
  const { legs, calls } = fakeLegs({ roster: [{ id: "a1", name: "Ada", description: "d", title: "t" }] });
  const voices = memoryStore();
  let menuChanges = 0;
  const svc = service.createVoiceCallService({ legs, api: () => ({ listVoices: async () => api.parseVoiceOptions([{ id: "v1", name: "Alexandra", description: "Warm", labels: { accent: "american" }, preview_url: "https://x/y.mp3" }, { id: "", name: "bad" }]) }), window: fakeWindow(), voiceStore: voices, previews: { urlFor: async (voice) => `sand-media://attachment/${voice.id}` }, focusAgentChat: () => {}, isEnabled: () => true, log: () => {}, onMenuChanged: () => { menuChanges += 1; } });
  assert.deepEqual(await svc.getAgentVoice("a1"), { voiceId: "cjVigY5qzO86Huf0OWal", isDefault: true });
  assert.deepEqual(await svc.setAgentVoice("a1", "v1"), { voiceId: "v1", isDefault: false });
  assert.deepEqual(calls.find(([name]) => name === "update")[1], { id: "a1", profile: { name: "Ada", description: "d", title: "t", voiceId: "v1" } });
  assert.equal(voices.map.get("a1"), "v1");
  assert.deepEqual(await svc.getAgentVoice("a1"), { voiceId: "v1", isDefault: false }, "an old host without voiceId falls back to the Mac's copy");
  await assert.rejects(() => svc.setAgentVoice("a1", "../../etc"), /not a voice id/);
  assert.deepEqual(await svc.listVoices(), [{ id: "v1", name: "Alexandra", description: "Warm", labels: { accent: "american" }, hasPreview: true }]);
  assert.equal(await svc.voicePreviewUrl("v1"), "sand-media://attachment/v1");
  assert.deepEqual({ ...svc.menuItem(), start: undefined }, { label: "Call Agent", enabled: false, start: undefined });
  svc.noteSelectedAgent("a1", "Ada");
  assert.equal(svc.menuItem().label, "Call Ada");
  assert.equal(menuChanges, 1);
  svc.noteSelectedAgent("a1", "Ada");
  assert.equal(menuChanges, 1, "the same agent again changes nothing");
});

test("the server's answers are read defensively", () => {
  assert.deepEqual(api.parseVoiceCallTicket({ token: "t", conversation_id: null, agent_id: "a" }), { token: "t", conversationId: null, agentId: "a" });
  assert.throws(() => api.parseVoiceCallTicket({}), /no call token/);
  assert.deepEqual(api.parseVoiceCallEnding({ seconds: 170, summary: " ok ", transcript: [{ speaker: "agent", text: " Hi " }, { speaker: "x", text: "Yo" }, { text: "" }, "bad"] }, 168), { seconds: 170, summary: "ok", transcript: [{ speaker: "agent", text: "Hi" }, { speaker: "user", text: "Yo" }] });
  assert.deepEqual(api.parseVoiceCallEnding(null, 168), { seconds: 168, summary: null, transcript: [] });
  assert.equal(api.CONVERSATION_ID_PATTERN.test("conv_01abc"), true);
  assert.equal(api.CONVERSATION_ID_PATTERN.test("../x"), false);
});

test("the voice doors are called on the proxy prefix, GET for the list, with the bearer", async () => {
  const requests = [];
  const client = api.createVoiceCallApi({ getAccessToken: async () => "tok", backendUrl: "https://api.simeonlabs.com", fetch: async (url, init) => { requests.push({ url: String(url), method: init.method, body: init.body, auth: new Headers(init.headers).get("authorization") }); return new Response(JSON.stringify(String(url).endsWith("voices") ? [] : String(url).endsWith("/end") ? { seconds: 3, summary: null } : { token: "t" }), { status: 200 }); } });
  await client.startCall();
  await client.endCall("conv_1", 2.2);
  await client.listVoices();
  assert.deepEqual(requests.map(({ url, method, body }) => [url, method, body ?? null]), [
    ["https://api.simeonlabs.com/desktop/api/proxy/v1/voice/calls", "POST", "{}"],
    ["https://api.simeonlabs.com/desktop/api/proxy/v1/voice/calls/conv_1/end", "POST", "{\"seconds\":3}"],
    ["https://api.simeonlabs.com/desktop/api/proxy/v1/voice/voices", "GET", null],
  ]);
  assert.ok(requests.every(({ auth }) => auth === "Bearer tok"));
});

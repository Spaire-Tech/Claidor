/**
 * Voice calls (30 September 2026): the call's lifecycle (call-state.ts), the
 * two client tools answered on the Mac with a fake coordinator (handoff.ts),
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
    sendPrompt: async (args) => { calls.push(["sendPrompt", args]); },
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

test("hand_to_agent sends the task as a typed message, answers at once, and hands the agent's reply back when its turn ends", async () => {
  const { legs, calls } = fakeLegs({ tail: [{ kind: "send-message", id: "old", message: { type: "text", content: "Earlier." } }], roster: [{ id: "a1", isRunning: false }] });
  const statuses = [];
  const done = [];
  let clock = 0;
  const scheduler = manualScheduler();
  const watch = handoff.createAgentHandoff({ agentId: "a1", legs, onStatus: (label) => statuses.push(label), onDone: (replies) => done.push(replies), now: () => clock, schedule: scheduler.schedule, newNonce: () => "n1" });
  assert.equal(await watch.handToAgent({ task: "" }), "No task was given. Ask the person what they want done.");
  assert.equal(await watch.handToAgent({ task: "Send the agenda to Dana" }), "Accepted. The agent is working on it.");
  assert.deepEqual(calls.find(([name]) => name === "sendPrompt")[1], { prompt: "Send the agenda to Dana", agentId: "a1", clientNonce: "n1", attachmentPaths: [], attachmentNames: [] });
  assert.deepEqual(statuses, ["Sending the agenda to Dana…"]);
  assert.equal(watch.isWorking(), true);
  legs.roster = [{ id: "a1", isRunning: true, currentActivity: { kind: "tool", tool: "CallMcpTool", detail: "gmail", callId: "c" } }];
  await scheduler.step();
  assert.equal(statuses.at(-1), "Using Gmail…");
  assert.match(await watch.checkOnAgent(), /still working on it: using gmail/);
  legs.roster = [{ id: "a1", isRunning: false }];
  legs.tail.push({ kind: "message", id: "u1", role: "user", content: "Send the agenda to Dana" }, { kind: "send-message", id: "new", message: { type: "text", content: "Sent it to Dana." } });
  await scheduler.step();
  assert.deepEqual(done, [["Sent it to Dana."]]);
  assert.equal(statuses.at(-1), null);
  assert.equal(watch.isWorking(), false);
  assert.match(await watch.checkOnAgent(), /Its last message was: Sent it to Dana\./);
  watch.dispose();
});

test("a turn never seen running counts as finished after the grace period; a failed send says so", async () => {
  const { legs } = fakeLegs({ roster: [{ id: "a1", isRunning: false }] });
  let clock = 0;
  const done = [];
  const scheduler = manualScheduler();
  const watch = handoff.createAgentHandoff({ agentId: "a1", legs, onStatus: () => {}, onDone: (replies) => done.push(replies), now: () => clock, schedule: scheduler.schedule, startGraceMs: 5_000 });
  await watch.handToAgent({ task: "check the weather" });
  await scheduler.step();
  assert.equal(done.length, 0);
  clock = 6_000;
  await scheduler.step();
  assert.deepEqual(done, [[]]);
  const failing = handoff.createAgentHandoff({ agentId: "a1", legs: { ...legs, sendPrompt: async () => { throw new Error("box asleep"); } }, onStatus: () => {}, onDone: () => {}, schedule: scheduler.schedule });
  assert.match(await failing.handToAgent({ task: "do it" }), /did not go through \(box asleep\)/);
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
  const voiceApi = { startCall: async () => ({ token: "tok", conversationId: null, agentId: "el" }), endCall: async (id, seconds) => { calls2.push(["end", id, seconds]); return { seconds, summary: "Talked about the week." }; }, listVoices: async () => [] };
  const svc = service.createVoiceCallService({ legs, api: () => voiceApi, window, voiceStore: voices, previews: { urlFor: async () => null }, focusAgentChat: () => {}, isEnabled: () => true, log: () => {}, random: () => 0, now: () => 50_000, wait: async () => {} });
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
  assert.match(connected.overrides.agent.prompt.prompt, /Person: Hi Ada/);
  assert.equal(await svc.handlePanel("handToAgent", { task: "Book it" }), "Accepted. The agent is working on it.");
  assert.equal(calls.filter(([name]) => name === "sendPrompt").length, 1);
  await svc.handlePanel("connected", { conversationId: "conv_7" });
  await svc.handlePanel("resize", { height: 129 });
  assert.deepEqual(window.heights, [129]);
  await svc.handlePanel("callEnded", { conversationId: "conv_7", seconds: 168 });
  await svc.settled();
  assert.deepEqual(calls2, [["end", "conv_7", 168]]);
  const record = calls.find(([name]) => name === "append")[1];
  assert.deepEqual(record, { agentId: "a1", message: { type: "text", content: "Voice call · 2:48\n\nTalked about the week." } });
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
  assert.deepEqual(api.parseVoiceCallEnding({ seconds: 170, summary: " ok " }, 168), { seconds: 170, summary: "ok" });
  assert.deepEqual(api.parseVoiceCallEnding(null, 168), { seconds: 168, summary: null });
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

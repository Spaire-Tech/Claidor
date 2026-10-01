/**
 * Voice calls (30 September 2026): the agent's voice in its profile (with a
 * fallback for profiles written before), the renderer patch's two anchors,
 * the banner's mark, the menu, the preloads, the edge and the package layout.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

test("an agent's voice round-trips through its profile, and a profile without one reads as empty", async () => {
  const profile = await loadModule("source/host/agents/agent-profile.ts", "agent-profile");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-profile-"));
  try {
    const file = path.join(dir, "profile.json");
    profile.writeSandProfileFile(file, { name: "Ada", description: "d", title: "t", avatarShape: "", avatarColor: "red", voiceId: " v1 " });
    assert.equal(JSON.parse(await readFile(file, "utf8")).voiceId, "v1");
    assert.equal(profile.readSandProfileFile(file).voiceId, "v1");
    await writeFile(file, JSON.stringify({ name: "Old", description: "", title: "", avatarShape: "", avatarColor: "" }));
    assert.equal(profile.readSandProfileFile(file).voiceId, "");
  } finally { await rm(dir, { recursive: true, force: true }); }
  const session = await readFile(path.join(repoRoot, "source/host/extensions/session/agent-session.ts"), "utf8");
  assert.match(session, /voiceId: profile\.voiceId\?\.trim\(\) \?\? current\?\.voiceId \?\? ""/, "an update without a voice keeps the stored one");
  const summaries = await readFile(path.join(repoRoot, "source/host/extensions/session/session-summaries.ts"), "utf8");
  assert.match(summaries, /voiceId:orNull\(profile\?\.voiceId\)/, "the roster row carries the voice");
  const lifecycle = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts"), "utf8");
  assert.match(lifecycle, /typeof profile\.voiceId === "string"/);
});

test("the voice-call anchors apply exactly once, and a second pass refuses", async () => {
  const { VOICE_CALL_REPLACEMENTS, patchOriginalVoiceCall, patchOriginalVoiceCallStylesheet, VOICE_CALL_MARKER } = await import(patchModule);
  assert.deepEqual(VOICE_CALL_REPLACEMENTS.map(([label]) => label), ["voice-call-components", "call-record-card", "voice-chat-event", "voice-chat-event-text", "name-sheet-at-root", "voice-picker-under-character-color", "call-button-beside-agent-name"]);
  const chunk = VOICE_CALL_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOriginalVoiceCall(chunk);
  assert.match(patched, /function __simeonCallButton\(n\)\{/);
  assert.match(patched, /function __simeonVoicePicker\(n\)\{/);
  assert.match(patched, /p\.jsx\(__simeonCallButton,\{agentId:t\.id,agentName:t\.name\},"simeon-call"\)/);
  assert.match(patched, /children:\[v,E,p\.jsx\(__simeonVoicePicker,\{agentId:t\.id\},"simeon-voice"\)\]/);
  // The call record is drawn as the card once the message is complete; any other message as before.
  assert.match(patched, /\(!h&&__simeonCallRecordParse\(r\)!=null\?p\.jsx\(__simeonCallRecord,\{content:r\}\):p\.jsx\(JPn,/);
  // The name sheet is mounted once, at the window's root.
  assert.match(patched, /p\.jsx\(Yzn,\{children:p\.jsx\(\$zn,\{\}\)\}\),p\.jsx\(__simeonNameSheet,\{\},"simeon-name-sheet"\)\]/);
  assert.match(patched, /What should your agents call you\?/);
  assert.throws(() => patchOriginalVoiceCall(patched), /anchor is missing or ambiguous/);
  const css = patchOriginalVoiceCallStylesheet(".x{}");
  assert.match(css, /\.simeon-call-record\{display:grid;width:340px;max-width:100%\}/);
  assert.match(css, /\.simeon-name-sheet\{position:fixed;inset:0/);
  assert.ok(css.includes(VOICE_CALL_MARKER));
  assert.match(css, /\.simeon-call-button\{position:absolute;left:100%;top:56px/);
  assert.throws(() => patchOriginalVoiceCallStylesheet(css), /already present/);
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(source, /patchOriginalVoiceCall\(patchOriginalChatLayout\(/);
  assert.match(source, /\.\.\.VOICE_CALL_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT\]\.map/);
  assert.match(source, /"voice-call-button", "voice-picker"\]/);
});

test("the pinned 0.18.0 renderer carries each voice-call anchor once, and the patched chunk parses", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { VOICE_CALL_REPLACEMENTS, patchOriginalVoiceCall } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  for (const [label, before] of VOICE_CALL_REPLACEMENTS) {
    let total = 0;
    for (const name of names) total += (await readFile(path.join(assets, name), "utf8")).split(before).length - 1;
    assert.equal(total, 1, `${label} occurs once in the renderer`);
  }
  const chunk = await readFile(path.join(assets, "index-UbX-y3il.js"), "utf8");
  const { parse } = await import("acorn");
  assert.doesNotThrow(() => parse(patchOriginalVoiceCall(chunk), { ecmaVersion: "latest", sourceType: "module" }));
});

test("the banner's mark uses the window's twelve palettes", async () => {
  const { AGENT_PALETTES } = await import(patchModule);
  const mark = await loadModule("source/shared/voice-call/agent-mark.ts", "agent-mark");
  assert.deepEqual(mark.AGENT_MARK_PALETTES.map((p) => ({ ...p })), AGENT_PALETTES.map((p) => ({ ...p })));
  assert.equal(mark.agentPalette("nope").id, "blue");
  const svg = mark.agentMarkSvg("call-a1");
  assert.equal(svg.includes("MARKID"), false);
  assert.match(svg, /url\(&quot;#simeon-call-a1-ink&quot;\)/);
});

test("Agent › Call <name> appears only when calls are on", async () => {
  const menu = await loadModule("source/electron-main/application-menu.ts", "application-menu");
  const base = { applyWindowShortcut: () => {}, canUseDevTools: () => false, emitOpenAbout: () => {}, emitOpenFeedback: () => {}, platform: "darwin" };
  const electron = { appName: "Simeon", openExternal: async () => {} };
  assert.equal(menu.buildApplicationMenuTemplate(base, electron).some((item) => item.label === "Agent"), false);
  let started = 0;
  const template = menu.buildApplicationMenuTemplate({ ...base, voiceCall: { label: "Call Ada", enabled: true, start: () => { started += 1; } } }, electron);
  const agent = template.find((item) => item.label === "Agent");
  assert.equal(template.indexOf(agent), template.findIndex((item) => item.label === "View") + 1);
  assert.equal(agent.submenu[0].label, "Call Ada");
  agent.submenu[0].click();
  assert.equal(started, 1);
});

test("the preloads and the edge carry the voice methods; the banner window sits top right with room for its shadow", async () => {
  const main = await loadModule("source/electron-preload/preload.ts", "preload");
  const invoked = [];
  const mainEdge = new Proxy({ subscribe: () => () => {} }, { get: (target, name) => target[name] ?? ((args) => { invoked.push([name, args]); return Promise.resolve(null); }) });
  const desktop = main.createDesktopPreloadBridge({ ipc: { invoke: async () => null, sendSync: () => null, send: () => {}, on: () => {}, off: () => {} }, webFrame: { getZoomFactor: () => 1 }, mainEdge, initialState: { experimentSnapshot: null, themeState: null, egressTunnelEnabled: false, webauthnProxyEnabled: false, egressTunnelStatus: null }, env: {} });
  await desktop.voiceCall.start("a1", "Ada");
  await desktop.voiceCall.setAgentVoice("a1", "v1");
  assert.deepEqual(invoked, [["startVoiceCall", { agentId: "a1", agentName: "Ada" }], ["setAgentVoice", { agentId: "a1", voiceId: "v1" }]]);

  const panel = await loadModule("source/electron-preload/preload-voice-call.ts", "preload-voice-call");
  const sent = [];
  const bridge = panel.createVoiceCallBridge({ invoke: async (channel, payload) => { sent.push([channel, payload]); }, on: () => {}, off: () => {} });
  await bridge.sendTask({ task: "x" });
  assert.deepEqual(sent, [["simeon-voice-call:invoke", { method: "sendTask", args: { task: "x" } }]]);

  const edge = await loadModule("source/electron-main/main-edge.ts", "main-edge");
  const rpc = await loadModule("source/shared/rpc/main.ts", "rpc-main");
  const handlers = edge.createMainEdgeHandlers({ voiceCalls: { isEnabled: () => true, isCallActive: () => false, start: (id, name) => ({ status: "started", agentId: id, name }) } });
  for (const name of Object.keys(rpc.MAIN_METHOD_TABLE)) assert.equal(typeof handlers[name], "function", `${name} has a handler`);
  assert.deepEqual(handlers.getVoiceCallAvailability({}), { enabled: true, inCall: false });
  assert.deepEqual(handlers.startVoiceCall({ agentId: "a1", agentName: "Ada" }), { status: "started", agentId: "a1", name: "Ada" });
  const coordinatorMain = await loadModule("source/shared/rpc/coordinator-main.ts", "coordinator-main");
  for (const name of ["voiceCall", "getAgentTranscriptTail", "updateAgent", "appendSendMessage"]) assert.equal(coordinatorMain.isCoordinatorMainMethod(name), true);

  const windowModule = await loadModule("source/electron-main/voice/voice-call-window.ts", "voice-call-window");
  assert.deepEqual(windowModule.bannerWindowBounds({ x: 0, y: 25, width: 1512, height: 920 }, 66), { x: 1108, y: 27, width: 416, height: 122 });
  // Hidden until the call channel ships to every cloud computer: off unless switched on.
  assert.equal(windowModule.voiceCallsEnabled({}), false);
  assert.equal(windowModule.voiceCallsEnabled({ SIMEON_VOICE_CALLS: "off" }), false);
  assert.equal(windowModule.voiceCallsEnabled({ SIMEON_VOICE_CALLS: "1" }), true);
  assert.equal(windowModule.voiceCallsEnabled({ SIMEON_VOICE_CALLS: " On " }), true);
  assert.deepEqual(windowModule.voiceCallResourcePaths("/App/Contents/Resources/app.asar/dist/electron-main"), { preload: "/App/Contents/Resources/app.asar/dist/electron-preload/preload-voice-call.cjs", page: "/App/Contents/Resources/app.asar/dist/voice-call/index.html" });
});

test("the package builds and ships the banner page and its preload", async () => {
  const clean = await readFile(path.join(repoRoot, "scripts/lib/clean-build.mjs"), "utf8");
  assert.match(clean, /"dist\/electron-preload\/preload-voice-call\.cjs",\n  "dist\/voice-call",/);
  assert.match(clean, /bundlePreloadSource\("source\/electron-preload\/runtime\/voice-call\.ts"/);
  assert.match(clean, /await bundleVoiceCallPage\(path\.join\(outputRoot, "dist\/voice-call"\)\);/);
  const verify = await readFile(path.join(repoRoot, "scripts/verify.mjs"), "utf8");
  for (const file of ["/dist/electron-preload/preload-voice-call.cjs", "/dist/voice-call/index.html", "/dist/voice-call/banner.js"]) assert.ok(verify.includes(`"${file}"`), file);
  const { preloadEntrySource } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/simeon-entries.mjs")).href);
  assert.match(preloadEntrySource("preload-voice-call"), /installVoiceCallPreloadEntrypoint\(loadVoiceCallPreloadElectron\(electron\)/);
  const page = await readFile(path.join(repoRoot, "source/voice-call/index.html"), "utf8");
  assert.match(page, /connect-src 'self' https:\/\/api\.elevenlabs\.io wss:\/\/api\.elevenlabs\.io https:\/\/\*\.elevenlabs\.io wss:\/\/\*\.elevenlabs\.io https:\/\/livekit\.rtc\.elevenlabs\.io wss:\/\/livekit\.rtc\.elevenlabs\.io/);
  assert.match(page, /media-src 'self' blob: mediastream:/);
});

test("a call record reads back as the card: its length, and the recap when there is one", async () => {
  const { VOICE_CALL_COMPONENTS_SOURCE } = await import(patchModule);
  const parse = new Function(`${VOICE_CALL_COMPONENTS_SOURCE};return __simeonCallRecordParse;`)();
  const prompt = await loadModule("source/shared/voice-call/voice-call-prompt.ts", "call-record");
  assert.deepEqual(parse(prompt.callRecordText(168, "Bass, you asked me to book a table.")), { duration: "2:48", recap: "Bass, you asked me to book a table." });
  assert.deepEqual(parse(prompt.callRecordText(43, null)), { duration: "0:43", recap: null });
  assert.deepEqual(parse(prompt.callRecordText(3723, "Line one.\n\nLine two.")), { duration: "1:02:03", recap: "Line one.\n\nLine two." });
  assert.equal(parse("Voice call · soon"), null);
  assert.equal(parse("We talked about the voice call · 0:43"), null);
  assert.equal(parse(42), null);
});

test("a call written as an exchange is drawn as the window's own event line, Voice chat · 02:30, opening the exchange panel", async () => {
  const { VOICE_CALL_COMPONENTS_SOURCE } = await import(patchModule);
  const opened = [];
  const p = { jsx: (type, props) => ({ type, props }) };
  const { call, event } = new Function("p", "r1", "fre", "X4e", `${VOICE_CALL_COMPONENTS_SOURCE};return { call: __simeonVoiceCall, event: __simeonVoiceEvent };`)(p, () => ({ openAgentExchange: (...args) => opened.push(args) }), "fre", "X4e");
  assert.deepEqual(call({ kind: "thread", messageCount: 6, peers: [{ id: "voice-call:call-1:150", name: "Bass" }] }), { peerId: "voice-call:call-1:150", name: "Bass", duration: "02:30" });
  assert.equal(call({ kind: "single", direction: "inbound", peer: { id: "voice-call:call-1:3723", name: "Bass" } }).duration, "1:02:03");
  assert.equal(call({ kind: "single", direction: "outbound", peer: { id: "agent-2", name: "Dawn" } }), null, "another agent keeps its Messaged line");
  assert.equal(call({ kind: "fanout", peers: [{ id: "voice-call:call-1:3", name: "Bass" }, { id: "agent-2", name: "Dawn" }] }), null);
  const line = event({ call: call({ kind: "thread", peers: [{ id: "voice-call:call-1:150", name: "Bass" }] }) });
  assert.equal(line.type, "fre");
  assert.equal(line.props.className, "sand-system-event");
  assert.equal(line.props.children.type, "X4e");
  assert.equal(line.props.children.props.children, "Voice chat · 02:30");
  line.props.children.props.onClick({ stopPropagation() {} });
  assert.deepEqual(opened, [["voice-call:call-1:150", "Bass"]]);
});

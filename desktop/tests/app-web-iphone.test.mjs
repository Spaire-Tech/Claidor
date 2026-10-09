/**
 * Simeon on the iPhone (8 October 2026, `mobile/`): the web window in the
 * app's WKWebView. The app signs in itself and injects the pair; the page
 * uses it without the cookie trade, sends every refreshed pair back, and
 * says the session is over instead of going to the website's login. In a
 * browser tab (no `window.ReactNativeWebView`) nothing of this applies, and
 * the tests below hold the browser to what it did before.
 *
 * Also here: the composer's files on the web (staged in the page, uploaded
 * to the box when the message goes, as the Mac uploads its staged copies),
 * which the iPhone's + needs.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", alias: { "node:crypto": path.join(repoRoot, "web/shims/node-crypto.ts") } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function envelope(exp) {
  const claims = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `simeon_da_h.${claims}.s`;
}

/** `window.ReactNativeWebView` as react-native-webview defines it: a postMessage taking one string. */
function fakeWebView() {
  const posted = [];
  return { posted, view: { postMessage: (data) => { assert.equal(typeof data, "string", "the app's web view takes strings only"); posted.push(JSON.parse(data)); } } };
}

function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
    calls.push({ key, headers: init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init.headers ?? {}), body: init.body, credentials: init.credentials });
    const answer = answers.get(key) ?? { status: 404, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

test("the page finds the app's web view only when react-native-webview put one there", async (t) => {
  const { module, dispose } = await loadModule("web/api.ts", "web-api-native-shell");
  t.after(dispose);
  const { nativeShellOf } = module;
  assert.equal(nativeShellOf({}), null, "a browser tab has none");
  assert.equal(nativeShellOf({ ReactNativeWebView: {} }), null, "a web view without postMessage is not one");
  const { view, posted } = fakeWebView();
  const shell = nativeShellOf({ ReactNativeWebView: view });
  shell.postMessage({ type: "simeon.ready" });
  assert.deepEqual(posted, [{ type: "simeon.ready" }], "messages travel as JSON strings");
  const broken = nativeShellOf({ ReactNativeWebView: { postMessage: () => { throw new Error("gone"); } } });
  assert.doesNotThrow(() => broken.postMessage({ type: "simeon.ready" }), "an app going away never breaks the page");
});

test("the injected pair: read as the app wrote it, refreshed pairs go back to the app, a dropped pair is not posted", async (t) => {
  const { module, dispose } = await loadModule("web/api.ts", "web-api-native-store");
  t.after(dispose);
  const { NATIVE_TOKENS_GLOBAL, nativeShellOf, nativeTokenStore, parseWebTokens } = module;
  assert.equal(NATIVE_TOKENS_GLOBAL, "__simeonNativeTokens", "the name mobile/src/core/tokens.ts injects under");
  const now = 1_000_000;
  const exp = Math.floor(now / 1000) + 3600;
  // The app keeps what /auth/poll gave it; the expiry is read off the envelope.
  assert.deepEqual(parseWebTokens({ accessToken: envelope(exp), refreshToken: "simeon_dr_one" }, now), { accessToken: envelope(exp), refreshToken: "simeon_dr_one", expiresAtMs: exp * 1000 });
  assert.equal(parseWebTokens({ accessToken: "", refreshToken: "r" }, now), null);
  assert.equal(parseWebTokens("simeon_da_x", now), null);
  assert.equal(parseWebTokens(null, now), null);

  const { view, posted } = fakeWebView();
  const scope = { ReactNativeWebView: view, [NATIVE_TOKENS_GLOBAL]: { accessToken: envelope(exp), refreshToken: "simeon_dr_one", expiresAtMs: exp * 1000 } };
  const store = nativeTokenStore(nativeShellOf(scope), scope, () => now);
  assert.equal(store.read().refreshToken, "simeon_dr_one");
  const next = { accessToken: envelope(exp + 3600), refreshToken: "simeon_dr_two", expiresAtMs: (exp + 3600) * 1000 };
  store.write(next);
  assert.deepEqual(posted, [{ type: "simeon.tokens", tokens: next }]);
  assert.equal(store.read().refreshToken, "simeon_dr_two", "a reload in the same page reads the new pair too");
  store.write(null);
  assert.equal(posted.length, 1, "a dropped pair is said with signed-out, not with tokens");
  assert.equal(store.read(), null);
});

test("inside the app: no cookie trade, the pair refreshes and goes back, a spent one and a 401 say expired, sign-out leaves the server to the app", async (t) => {
  const { module, dispose } = await loadModule("web/api.ts", "web-api-native-session");
  t.after(dispose);
  const { SimeonApi, NATIVE_TOKENS_GLOBAL, nativeShellOf, nativeTokenStore } = module;
  let now = 1_000_000;
  const exp = Math.floor(now / 1000) + 3600;
  const answers = new Map();
  const { calls, fetchImpl } = fakeFetch(answers);
  const { view, posted } = fakeWebView();
  const scope = { ReactNativeWebView: view, [NATIVE_TOKENS_GLOBAL]: { accessToken: envelope(exp), refreshToken: "simeon_dr_one" } };
  const native = nativeShellOf(scope);
  const api = new SimeonApi({ base: "https://api.test", store: nativeTokenStore(native, scope, () => now), fetch: fetchImpl, now: () => now, clientVersion: "0.0.0-test", native });
  assert.equal(api.isSignedIn(), true, "signed in from the injected pair, before any request");

  // The cookie trade is not tried at all: the web view has no cookie, and a
  // session made here would be one the app cannot end.
  answers.set("POST /auth/web-session", { status: 200, body: { accessToken: envelope(exp), refreshToken: "simeon_dr_cookie" } });
  assert.equal(await api.signInFromCookie(), false);
  assert.equal(calls.length, 0);

  answers.set("GET /desktop/api/user/profile", { status: 200, body: { code: 0, data: { email: "bass@simeonlabs.com" } } });
  await api.data("user/profile");
  assert.equal(calls.at(-1).headers.authorization, `Bearer ${envelope(exp)}`);

  // Near the hour: the page refreshes, as in a tab, and the app hears the new pair.
  now = (exp - 200) * 1000;
  answers.set("POST /oauth/token", { status: 200, body: { access_token: envelope(exp + 3600), refresh_token: "simeon_dr_two" } });
  await api.data("user/profile");
  assert.deepEqual(posted.at(-1), { type: "simeon.tokens", tokens: { accessToken: envelope(exp + 3600), refreshToken: "simeon_dr_two", expiresAtMs: (exp + 3600) * 1000 } });

  // The server ends the session: the app is told, to show its sign-in.
  now = (exp + 3600 - 100) * 1000;
  answers.set("POST /oauth/token", { status: 200, body: { shouldLogout: true, error: "invalid_grant" } });
  await assert.rejects(() => api.data("user/profile"), /Sign in/);
  assert.deepEqual(posted.at(-1), { type: "simeon.signed-out", reason: "expired" });
  assert.equal(api.isSignedIn(), false);

  // A 401 on a call says the same.
  api.setTokens({ accessToken: envelope(exp + 7200), refreshToken: "simeon_dr_three", expiresAtMs: (exp + 7200) * 1000 });
  answers.set("GET /desktop/api/user/profile", { status: 401, body: { detail: "nope" } });
  await assert.rejects(() => api.data("user/profile"));
  assert.deepEqual(posted.at(-1), { type: "simeon.signed-out", reason: "expired" });

  // Signing out: the app takes the phone off the notification list with the
  // live pair first, then ends the session; the page ends nothing itself.
  api.setTokens({ accessToken: envelope(exp + 7200), refreshToken: "simeon_dr_four", expiresAtMs: (exp + 7200) * 1000 });
  const before = calls.length;
  await api.signOut();
  assert.equal(calls.length, before, "no auth/logout from the page");
  assert.deepEqual(posted.at(-1), { type: "simeon.signed-out", reason: "logout" });
  assert.equal(api.isSignedIn(), false);
});

test("in a browser tab nothing changes: the cookie trade, the server's logout, no messages", async (t) => {
  const { module, dispose } = await loadModule("web/api.ts", "web-api-browser");
  t.after(dispose);
  const { SimeonApi, sessionTokenStore } = module;
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  const answers = new Map();
  const { calls, fetchImpl } = fakeFetch(answers);
  const api = new SimeonApi({ base: "https://api.test", store: sessionTokenStore(storage), fetch: fetchImpl, now: () => 1_000_000, clientVersion: "0.0.0-test" });
  answers.set("POST /auth/web-session", { status: 200, body: { accessToken: envelope(5000), refreshToken: "simeon_dr_one" } });
  assert.equal(await api.signInFromCookie(), true);
  assert.equal(calls.at(-1).credentials, "include");
  answers.set("POST /desktop/api/auth/logout", { status: 200, body: { code: 0, data: {} } });
  await api.signOut();
  assert.equal(calls.at(-1).key, "POST /desktop/api/auth/logout", "the tab ends its own session, as before");
  assert.equal(map.get("simeon.web.tokens"), undefined);
});

test("links and sign-ins the window opens: a started connected-app sign-in is told apart from a plain link", async (t) => {
  const { module, dispose } = await loadModule("web/backend.ts", "web-backend-links");
  t.after(dispose);
  const { createWebBackend } = module;
  const authorizationUrl = "https://vendor.test/authorize?state=s1&redirect_uri=https%3A%2F%2Fapi.test%2Fdesktop%2Fmcp-oauth%2Fcallback";
  const gateway = { start() {}, close() {}, isLive: () => true, forceReconnect: async () => {}, dispatch: async () => ({ status: "ok", value: null }), onServing() {}, async main(method, args) { if (args?.action === "authenticateServer") return { status: "started", serverName: "Notion", authorizationUrl }; return null; } };
  const signIns = [], links = [];
  const api = { isSignedIn: () => true, data: async () => ({}), connect: async () => ({}), signInFromCookie: async () => false, signOut: async () => {} };
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), key: () => null, length: 0 };
  const backend = createWebBackend({ api, gateway, storage, matchDark: () => false, pushCoordinatorEvent() {}, pushMainEvent() {}, pushIpcEvent() {}, goSignIn() {}, openSignIn: (url) => signIns.push(url), openLink: (url) => links.push(url) });
  // The window's Connect: the box starts the sign-in, the window opens it (`openExternal`).
  await backend.ipc("sand:mcp-auth", { serverId: "900005" });
  await backend.main("openExternal", { url: authorizationUrl });
  await backend.main("openExternal", { url: "https://simeonlabs.com/help" });
  await backend.main("openExternal", { url: "javascript:alert(1)" });
  assert.deepEqual(signIns, [authorizationUrl], "the vendor's page is a sign-in");
  assert.deepEqual(links, ["https://simeonlabs.com/help"], "anything else is a link; only http(s) leaves the page");
  // The same address opened again is a link: the sign-in was spent.
  await backend.main("openExternal", { url: authorizationUrl });
  assert.equal(links.at(-1), authorizationUrl);
});

test("the composer's files on the web: kept in the page, uploaded to the box when the message goes, refused like the Mac refuses", async (t) => {
  const { module, dispose } = await loadModule("web/backend.ts", "web-backend-attachments");
  t.after(dispose);
  const { createWebBackend, bytesToBase64, WEB_STAGED_PREFIX } = module;
  const uploads = [];
  let failNext = false;
  const gateway = { start() {}, close() {}, isLive: () => true, forceReconnect: async () => {}, dispatch: async () => ({ status: "ok", value: null }), onServing() {}, async main(method, args) {
    assert.equal(method, "uploadAttachment", "the host's own upload, as the Mac's commit uses (`attachments.ts`)");
    if (failNext) { failNext = false; throw new Error("box away"); }
    uploads.push({ filename: args.filename, bytes: Buffer.from(args.bytesBase64, "base64") });
    return { path: `/home/box/attachments/${args.filename}` };
  } };
  const api = { isSignedIn: () => true, data: async () => ({}), connect: async () => ({}), signInFromCookie: async () => false, signOut: async () => {} };
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), key: () => null, length: 0 };
  const backend = createWebBackend({ api, gateway, storage, matchDark: () => false, pushCoordinatorEvent() {}, pushMainEvent() {}, pushIpcEvent() {}, goSignIn() {} });
  const photo = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const staged = await backend.main("stageAttachmentBytes", { filename: "photo.png", bytes: photo });
  assert.equal(staged.ok, true);
  assert.ok(staged.path.startsWith(WEB_STAGED_PREFIX));
  assert.equal(uploads.length, 0, "nothing leaves the page until the message is sent");
  const note = await backend.main("stageAttachmentBytes", { filename: "note.txt", bytes: Array.from(Buffer.from("hello")) });
  assert.deepEqual(await backend.main("commitStagedAttachments", { paths: [staged.path, note.path], filenames: ["photo.png", "note.txt"] }), ["/home/box/attachments/photo.png", "/home/box/attachments/note.txt"]);
  assert.deepEqual([...uploads[0].bytes], [...photo], "the bytes arrive whole");
  assert.equal(uploads[1].bytes.toString(), "hello");
  assert.equal(await backend.main("commitStagedAttachments", { paths: [staged.path], filenames: ["photo.png"] }), null, "a sent file is gone from the page");

  assert.deepEqual(await backend.main("stageAttachmentBytes", { filename: "a/b.png", bytes: photo }), { ok: false, reason: "failed" });
  assert.deepEqual(await backend.main("stageAttachmentBytes", { filename: "empty.png", bytes: new Uint8Array(0) }), { ok: false, reason: "empty" });
  assert.deepEqual(await backend.main("stageAttachmentBytes", { filename: "big.png", bytes: new Uint8Array(25 * 1024 * 1024 + 1) }), { ok: false, reason: "too-large" });
  const again = await backend.main("stageAttachmentBytes", { filename: "photo.png", bytes: photo });
  failNext = true;
  assert.equal(await backend.main("commitStagedAttachments", { paths: [again.path], filenames: ["photo.png"] }), null, "a failed upload keeps the message, as on a Mac");
  await backend.main("discardStagedAttachment", { path: again.path });
  assert.equal(await backend.main("commitStagedAttachments", { paths: [again.path], filenames: ["photo.png"] }), null, "a discarded file is gone");

  // Large files encode in slices.
  const large = new Uint8Array(200_000).map((_, i) => i % 251);
  assert.equal(bytesToBase64(large), Buffer.from(large).toString("base64"));
});

test("the bridge in the app: the agent a notification names opens through the Mac's own event, links and sign-ins go to the app", async () => {
  const bridge = await readFile(path.join(repoRoot, "web/bridge.ts"), "utf8");
  assert.match(bridge, /const FOCUS_AGENT_CHANNEL = "sand-rpc:main:e:focus-agent";/, "the event the Mac's notification click pushes (`production-binding-providers.ts`, `openAgent`)");
  assert.match(bridge, /emit\(FOCUS_AGENT_CHANNEL, \{\}, \{ id: agentId \}\)/, "in the Mac's payload shape, `{ id }`");
  assert.match(bridge, /Reflect\.set\(window, "__simeonNative", \{ openAgent \}\)/);
  assert.match(bridge, /if \(native != null\) Reflect\.set\(window, "__simeonNative"/, "only inside the app");
  assert.match(bridge, /type: NATIVE_MESSAGE\.signedOut, reason \}/, "no session: the app's sign-in, not the website's login");
  assert.match(bridge, /purpose: "sign-in"/);
  assert.match(bridge, /purpose: "link"/);
  assert.match(bridge, /channel === "sand:mcp-auth-event"\) native\?\.postMessage\(\{ type: NATIVE_MESSAGE\.mcpAuth \}\)/);
  const notifications = await readFile(path.join(repoRoot, "source/electron-main/production-binding-providers.ts"), "utf8");
  assert.match(notifications, /openAgent: \(agentId\) => context\.requireMainEdge\(\)\.emit\("focus-agent", \{ id: agentId \}\)/, "the Mac's side of the same event");
});

test("the window is up when it reports the chat it shows: the pinned window reports every selection, and the preload sends it on the channel the bridge reads", async () => {
  const bridge = await readFile(path.join(repoRoot, "web/bridge.ts"), "utf8");
  assert.match(bridge, /if \(channel === "sand:sentry-conversation"\) windowShows\(payload\)/);
  const preload = await readFile(path.join(repoRoot, "source/electron-preload/preload.ts"), "utf8");
  assert.match(preload, /noteSentryConversation: "sand:sentry-conversation"/);
  // The window the website and the web app serve (one folder, named after its content).
  const hosted = path.join(repoRoot, "../sites/simeonlabs.com/public/app");
  const [digest] = (await readdir(hosted, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== "assets").map((entry) => entry.name);
  const assets = path.join(hosted, digest, "assets");
  const scripts = (await readdir(assets)).filter((name) => /^index-.*\.js$/.test(name));
  const sources = await Promise.all(scripts.map((name) => readFile(path.join(assets, name), "utf8")));
  assert.ok(sources.some((source) => /selection\.snapshots,\w+=>\{[^}]*noteSentryConversation\?\.\(\{agentId:\w+\}\)/.test(source)), "the pinned window reports its selected agent on every change");
  assert.ok(sources.some((source) => source.includes('"focus-agent":Be=>c.ingestFocusAgent(Be)') || /"focus-agent":\w+=>\w+\.ingestFocusAgent\(\w+\)/.test(source)), "and answers focus-agent by opening the agent");
});

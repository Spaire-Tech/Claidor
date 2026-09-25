/**
 * The box outlives the app for routines (25 September 2026). The founder:
 * "SAND_KEEP_BOX_RUNNING_ON_QUIT=1 should be the intended behavior for
 * routines. The Mac can be awake while the app itself is closed. The
 * routine should still execute. The spend concern should be handled by
 * the routine/box lifecycle."
 *
 * Two things had to change. Quitting Simeon stopped the local Docker box
 * unconditionally (the spend brake of 23 September); now it is kept when an
 * enabled routine exists and stopped when none does. And with the app gone
 * nothing rewrote the box's one-hour access token (the Mac did, every five
 * minutes), so the Mac now mints the box's own renewal credential
 * (POST /desktop/api/box/renewal-credential), writes it into the token
 * file, and the box's auth service trades it for a fresh token at
 * /sand-box/inference-credential when the file goes stale.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("quit keeps the box for an enabled routine and stops it otherwise; the two flags force either way", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "local-docker-quit");
  try {
    const { shouldStopLocalDockerBoxOnQuit, stopLocalDockerBoxOnQuit, localBoxHasEnabledRoutine } = module;
    assert.equal(shouldStopLocalDockerBoxOnQuit("local-docker", {}, false), true, "no routine: the brake of before");
    assert.equal(shouldStopLocalDockerBoxOnQuit("local-docker", {}, true), false, "a routine: the box stays up");
    assert.equal(shouldStopLocalDockerBoxOnQuit("local-docker", { SAND_STOP_BOX_ON_QUIT: "1" }, true), true);
    assert.equal(shouldStopLocalDockerBoxOnQuit("local-docker", { SAND_KEEP_BOX_RUNNING_ON_QUIT: "1" }, false), false);
    assert.equal(shouldStopLocalDockerBoxOnQuit("remote", {}, false), false);

    const lines = [];
    let stops = 0;
    const stop = async () => { stops += 1; };
    assert.equal(await stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: {}, stop, log: (line) => lines.push(line), hasEnabledRoutine: async () => true }), "kept");
    assert.equal(stops, 0);
    assert.ok(lines.some((line) => line.includes("kept running on quit for an enabled routine")));
    assert.equal(await stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: {}, stop, log: (line) => lines.push(line), hasEnabledRoutine: async () => false }), "stopped");
    assert.equal(stops, 1);
    assert.equal(await stopLocalDockerBoxOnQuit({ boxRuntime: "local-docker", env: {}, stop, log: (line) => lines.push(line), hasEnabledRoutine: async () => { throw new Error("box gone"); } }), "stopped", "a box that cannot be asked is stopped");
    assert.ok(lines.some((line) => line.includes("could not ask the box for its routines (box gone)")));

    const settingsDir = await mkdtemp(path.join(os.tmpdir(), "caisra-quit-settings-"));
    try {
      const calls = [];
      const fetchImpl = async (url, init) => { calls.push({ url, auth: init.headers.authorization }); return { ok: true, status: 200, json: async () => [{ id: "a", isEnabled: false }, { id: "b", isEnabled: true }] }; };
      assert.equal(await localBoxHasEnabledRoutine(path.join(settingsDir, "settings.json"), fetchImpl), true);
      assert.equal(calls[0].url, "http://127.0.0.1:1340/api/listAllAutomations");
      assert.match(calls[0].auth, /^Bearer .{32,}$/, "the box's own gateway token");
      assert.equal(await localBoxHasEnabledRoutine(path.join(settingsDir, "settings.json"), async () => ({ ok: true, status: 200, json: async () => [{ id: "a", isEnabled: false }] })), false);
      await assert.rejects(() => localBoxHasEnabledRoutine(path.join(settingsDir, "settings.json"), async () => ({ ok: false, status: 503 })), /answered 503/);
    } finally {
      await rm(settingsDir, { recursive: true, force: true });
    }
    const services = await readFile(path.join(repoRoot, "source/electron-main/main-production-services.ts"), "utf8");
    assert.match(services, /hasEnabledRoutine: \(\) => localBoxHasEnabledRoutine\(settingsPath\)/, "the quit flush asks the box");
  } finally {
    await dispose();
  }
});

test("the Mac writes the box's renewal credential into the token file, on connect and on every rewrite", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "local-docker-renewal");
  const settingsDir = await mkdtemp(path.join(os.tmpdir(), "caisra-renewal-settings-"));
  try {
    const settingsPath = path.join(settingsDir, "settings.json");
    const filePath = path.join(settingsDir, "local-docker-credential", "inference.json");
    module.rememberBoxRenewalCredential(undefined);
    await module.persistInferenceCredential(settingsPath, { accessToken: "tok-1", backendUrl: "https://api.simeonlabs.com/", expiresAtMs: 5 });
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { accessToken: "tok-1", expiresAtMs: 5 }, "without a credential the file is what it was");
    module.rememberBoxRenewalCredential("claidor_db_box");
    const persisted = [];
    await module.refreshInferenceCredentialFile(async () => ({ accessToken: "tok-2", backendUrl: "https://api.simeonlabs.com/", expiresAtMs: 6 }), settingsPath, async (_path, credential) => { persisted.push(credential); });
    assert.deepEqual(persisted, [{ accessToken: "tok-2", backendUrl: "https://api.simeonlabs.com/", expiresAtMs: 6, renewalCredential: "claidor_db_box" }], "the keep-fresh rewrite carries it");
    await module.persistInferenceCredential(settingsPath, persisted[0]);
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { accessToken: "tok-2", expiresAtMs: 6, renewalCredential: "claidor_db_box" });
    const source = await readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
    assert.match(source, /if \(boxRenewalCredential == null && remote\.issueBoxRenewalCredential != null\)/, "minted once per app run at connect");
    const connector = await readFile(path.join(repoRoot, "source/electron-main/box/box-host-connector.ts"), "utf8");
    assert.match(connector, /BOX_RENEWAL_CREDENTIAL_PATH = "\/desktop\/api\/box\/renewal-credential"/);
    // Both production call sites pass a descriptor fast path; until 25
    // September the fast-path object dropped this method, so nothing was
    // ever minted and the local box renewed nothing once the app was gone.
    const { module: hostConnector, dispose: disposeHost } = await load("source/electron-main/box/box-host-connector.ts", "box-host-connector");
    try {
      const fastPath = { store: { read: () => undefined, write: () => {}, clear: () => {} }, getAccountScope: () => "acct" };
      const built = hostConnector.createRemoteHostConnector({ getAccessToken: async () => "" }, {}, undefined, fastPath);
      assert.equal(typeof built.issueBoxRenewalCredential, "function", "the fast-path connector still mints the box's renewal credential");
    } finally {
      await disposeHost();
    }
  } finally {
    module.rememberBoxRenewalCredential(undefined);
    await rm(settingsDir, { recursive: true, force: true });
    await dispose();
  }
});

test("the box renews with the file's credential when the file is stale, and uses the file while it is fresh", async () => {
  const { module, dispose } = await load("source/host/extensions/auth/auth-service.ts", "host-auth-service");
  try {
    const renewals = [];
    const renewCredential = async (backendUrl, credential) => { renewals.push({ backendUrl, credential }); return { accessToken: "box-token", expiresAtMs: Date.now() + 3_600_000 }; };
    // The renewer waits between cycles on this clock; nothing fires it, so
    // each service below runs exactly one cycle at start.
    const clock = { now: () => Date.now(), monotonicNow: () => Date.now(), schedule: () => ({ dispose() {} }) };
    const retry = { name: "test", schedule: () => ({ elapsed: Promise.resolve(), dispose() {} }), runWithRetry: async (work) => work(0, new AbortController().signal) };
    const service = async (file) => {
      const built = module.createHostAuthService({ retry, clock, log: () => {}, env: { SAND_DEV_INFERENCE_TOKEN_FILE: "/run/grok-bot/inference.json", SAND_BACKEND_URL: "https://api.simeonlabs.com" }, readDevCredential: async () => file, renewCredential });
      // The first cycle runs at start; wait for it to settle, as the host does before its first call.
      for (let i = 0; i < 50 && built.getLastRenewalEvent() == null; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      return built;
    };

    const fresh = await service({ accessToken: "mac-token", expiresAtMs: Date.now() + 3_600_000, renewalCredential: "claidor_db_box" });
    try {
      assert.equal(await fresh.getAccessToken(), "mac-token", "a fresh file is the token, as before");
      assert.deepEqual(renewals, [], "and nothing is renewed while the Mac keeps the file fresh");
    } finally { fresh.dispose(); }

    const stale = await service({ accessToken: "mac-token", expiresAtMs: Date.now() - 1, renewalCredential: "claidor_db_box" });
    try {
      assert.equal(await stale.getAccessToken(), "box-token", "a stale file is traded for a token with the box's own credential");
      assert.deepEqual(renewals, [{ backendUrl: "https://api.simeonlabs.com/", credential: "claidor_db_box" }]);
    } finally { stale.dispose(); }

    const plain = await service({ accessToken: "mac-token", expiresAtMs: Date.now() - 1 });
    try {
      await assert.rejects(() => plain.getAccessToken(), /Waiting for a model credential/, "a stale file with no credential waits, as before");
      assert.equal(renewals.length, 1, "and renews nothing");
    } finally { plain.dispose(); }
  } finally {
    await dispose();
  }
});

test("the token file reader carries the credential through", async () => {
  const { module, dispose } = await load("source/host/extensions/auth/credential-renewer.ts", "credential-renewer");
  try {
    const read = (raw) => module.readDevInferenceCredentialFile({ path: "/x", readFileImpl: async () => raw });
    assert.deepEqual(await read(JSON.stringify({ accessToken: "t", expiresAtMs: 5, renewalCredential: "claidor_db_x" })), { accessToken: "t", expiresAtMs: 5, renewalCredential: "claidor_db_x" });
    assert.deepEqual(await read(JSON.stringify({ accessToken: "t", expiresAtMs: 5 })), { accessToken: "t", expiresAtMs: 5 });
    assert.deepEqual(await read(JSON.stringify({ accessToken: "t", expiresAtMs: 5, renewalCredential: "" })), { accessToken: "t", expiresAtMs: 5 }, "an empty credential is none");
  } finally {
    await dispose();
  }
});

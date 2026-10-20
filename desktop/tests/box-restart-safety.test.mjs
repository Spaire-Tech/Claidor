/**
 * What a cloud computer does in the first minutes after it starts
 * (15 October 2026). A new box asks for its first credential before the
 * server has saved it; it must keep asking every few seconds, not back off
 * for minutes. Its backup must wait for that credential instead of failing
 * on every file (23,227 failures in one box's first minute). And a connector
 * sign-in started before a restart must still finish after it.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A fresh copy of the modules each call: what a restarted host loads. */
async function load() {
  const temporary = await mkdtemp(path.join(repoRoot, ".tmp-box-restart-safety-"));
  const outfile = path.join(temporary, "entry.mjs");
  try {
    await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/box-restart-safety-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", packages: "external", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}-${Math.random()}`);
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test("a new box keeps asking for its first credential at the base delay, then backs off as before", async () => {
  const { SandInferenceCredentialRenewer, FIRST_CREDENTIAL_FAST_RETRIES } = await load();
  const attempts = [];
  let calls = 0;
  let renewer;
  const failuresBeforeSuccess = 3;
  await new Promise((resolve) => {
    renewer = new SandInferenceCredentialRenewer({
      getCredential: () => "simeon_db_x",
      renew: async () => {
        calls += 1;
        // Refused while the server has not saved the credential, then fine,
        // then refused again (a server outage later in the box's life).
        if (calls <= failuresBeforeSuccess || calls > failuresBeforeSuccess + 1) throw new Error("HTTP 401");
        return { accessToken: "token", expiresAtMs: Date.now() + 60 * 60_000 };
      },
      setCredential: () => {},
      retry: {
        name: "test",
        schedule(attempt) {
          attempts.push(attempt);
          if (attempts.length === failuresBeforeSuccess + 2) { renewer.close(); resolve(); }
          return { elapsed: Promise.resolve(), dispose() {} };
        },
        runWithRetry: async () => { throw new Error("unused"); },
      },
      clock: { now: Date.now, monotonicNow: Date.now, schedule: (_ms, callback) => { const timer = setTimeout(callback, 0); return { dispose: () => clearTimeout(timer) }; } },
    });
    renewer.start();
  });
  assert.ok(FIRST_CREDENTIAL_FAST_RETRIES >= 12);
  // Before the first credential: always the base delay.
  assert.deepEqual(attempts.slice(0, failuresBeforeSuccess), [1, 1, 1]);
});

test("a credential made good again is used at once, not after the backoff it was waiting out", async () => {
  // 20 October 2026: a sign-out revoked the box's credential and the box backed off, up to five minutes a try; the next
  // sign-in made the same credential good again (`revive_box_credential`), and the first model call asks for it at once.
  const { SandInferenceCredentialRenewer } = await load();
  let good = false;
  let calls = 0;
  let backingOff;
  const backoff = new Promise((resolve) => { backingOff = resolve; });
  const renewer = new SandInferenceCredentialRenewer({
    getCredential: () => "simeon_db_x",
    renew: async () => {
      calls += 1;
      if (!good) throw new Error("HTTP 401");
      return { accessToken: "token", expiresAtMs: Date.now() + 60 * 60_000 };
    },
    setCredential: () => {},
    retry: {
      name: "test",
      // Minutes, in effect: it ends only when cut short.
      schedule(_attempt, signal) {
        backingOff();
        return { elapsed: new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })), dispose() {} };
      },
      runWithRetry: async () => { throw new Error("unused"); },
    },
    clock: { now: Date.now, monotonicNow: Date.now, schedule: () => ({ dispose() {} }) },
  });
  renewer.start();
  await backoff;
  good = true;
  assert.equal(await renewer.requestImmediateRenewal(), true);
  assert.equal(calls, 2);
  renewer.close();
});

test("the backup waits for the box's credential instead of failing on every file", async () => {
  const { createBoxStoreSyncService } = await load();
  const root = await mkdtemp(path.join(os.tmpdir(), "box-store-wait-"));
  const before = process.env.SAND_DATA_ROOT;
  process.env.SAND_DATA_ROOT = root;
  try {
    let token = null;
    const logs = [];
    const asked = [];
    const policy = { name: "p", wrap: (fn) => Object.assign((...args) => fn(...args), { dispose() {} }) };
    const service = createBoxStoreSyncService({
      env: { SAND_BOX_STORE_SYNC: "1", SAND_BOX_STORE_ID: "8b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e" },
      auth: {
        getAccessToken: async () => { asked.push("token"); if (token == null) throw new Error("Waiting for a model credential."); return token; },
        getMachineId: async () => "machine",
        peekAccessToken: () => token,
      },
      sourceMap: { getOrCreateBoxStore: async () => ({ sourceId: "8b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e" }) },
      clock: { now: Date.now, monotonicNow: Date.now, schedule: () => ({ dispose() {} }) },
      polling: { name: "poll", start: () => ({ dispose() {} }) },
      storeDbDebounce: policy,
      chromeSessionDebounce: policy,
      chromeStageRetry: { name: "r", schedule: () => ({ elapsed: Promise.resolve(), dispose() {} }), runWithRetry: (work) => work(1, new AbortController().signal) },
      manifestRetry: { name: "r", schedule: () => ({ elapsed: Promise.resolve(), dispose() {} }), runWithRetry: (work) => work(1, new AbortController().signal) },
      isIdle: () => true,
      log: (message) => logs.push(message),
      telemetry: { reportBoxStoreSyncCycle() {}, reportChromeSessionStage() {}, reportBoxStoreManifestConflict() {}, reportBoxStoreDbCapture() {} },
    });
    await service.runCycle();
    assert.equal(asked.length, 0, "nothing is sent without a credential");
    assert.deepEqual(logs, ["waiting for the box's credential before the first backup"]);
    const flush = await service.api.snapshotBoxStoreNow({ includeIdleOnly: true });
    assert.equal(flush.ok, false);
    assert.equal(flush.reason, "waiting-for-credential");
    await service.runCycle();
    assert.equal(logs.length, 1, "said once, not once per cycle");
  } finally {
    if (before === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = before;
    await rm(root, { recursive: true, force: true });
  }
});

test("a connector sign-in started before a restart still finishes after it", async () => {
  const first = await load();
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-pending-"));
  const file = path.join(dir, "mcp-pending-sign-ins.json");
  const pending = { pluginId: "stripe", mcpUrl: "https://mcp.stripe.com", tokenEndpoint: "https://x/token", clientId: "c", verifier: "v", redirectUri: "https://app.simeonlabs.com/app/connected.html", state: "state-1" };
  first.persistPendingSignInsAt(file);
  first.rememberVendorMcpPendingAuth(pending);

  // The host restarts: a fresh copy of the module, its memory empty.
  const second = await load();
  second.persistPendingSignInsAt(file);
  assert.deepEqual(second.takeVendorMcpPendingAuth("state-1"), pending);
  // Taken once: a second finish for the same state finds nothing.
  assert.equal(second.takeVendorMcpPendingAuth("state-1"), undefined);
  // Older than 15 minutes: not finished.
  first.rememberVendorMcpPendingAuth({ ...pending, state: "state-2" }, Date.now() - 16 * 60_000);
  const third = await load();
  third.persistPendingSignInsAt(file);
  assert.equal(third.takeVendorMcpPendingAuth("state-2"), undefined);
  assert.match(third.PENDING_SIGN_IN_LOST_MESSAGE, /connect the app again/);
  await rm(dir, { recursive: true, force: true });
});

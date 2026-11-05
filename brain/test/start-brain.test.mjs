// The brain's start script (brain/start-brain.mjs): its settings, the
// engine's settings, where the engine comes from, and the order the agents
// are brought in. Run with `npm test` (or `node --test`) in brain/.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BROUGHT_IN_MARKER,
  BrainStartError,
  COPY_IN_ARG,
  HYDRATION_HANDOFF_FILE,
  bootstrap,
  bringIn,
  bundleArchiveUrl,
  engineEnv,
  retryDelayMs,
  settingsFromEnv,
} from "../start-brain.mjs";

const BOOT = {
  userId: "user-1",
  gatewayToken: "gateway-secret",
  credential: "credential-secret",
  backendUrl: "https://api.simeonlabs.com",
  computerStoreSource: "11111111-1111-4111-8111-111111111111",
  brainStoreSource: "22222222-2222-4222-8222-222222222222",
  hostBundleUrl: "https://bundles.example/host",
};

function settings(extra = {}) {
  return settingsFromEnv({ SIMEON_BRAIN_USER: "founder@example.com", SIMEON_BRAIN_TOKEN: "brain-secret", ...extra });
}

test("its settings: the two it needs, named when missing and never shown", () => {
  assert.throws(() => settingsFromEnv({ SIMEON_BRAIN_TOKEN: "x" }), /SIMEON_BRAIN_USER/);
  assert.throws(() => settingsFromEnv({ SIMEON_BRAIN_USER: "a@b.c" }), /SIMEON_BRAIN_TOKEN/);
  assert.throws(() => settings({ SIMEON_API_URL: "http://api.example.com" }), /https/);
  const ready = settings({ SIMEON_API_URL: "https://api.example.com/", PORT: "4000" });
  assert.equal(ready.apiUrl, "https://api.example.com");
  assert.equal(ready.port, "4000");
  assert.equal(ready.dataRoot, "/home/box/sand-data");
  assert.equal(settings({ SIMEON_API_URL: "http://127.0.0.1:41400" }).apiUrl, "http://127.0.0.1:41400");
});

test("the engine's settings: the brain role, the door, its own store, nothing that copies or restores", () => {
  const env = engineEnv(settings(), BOOT, {
    PATH: "/usr/bin",
    SIMEON_BRAIN_TOKEN: "brain-secret",
    SIMEON_BOX_STORE_RESTORE: "always",
    SAND_BOX_STORE_COPY_IN: "1",
    SAND_HOST_IN_BOX: "1",
  });
  assert.equal(env.SIMEON_ENGINE_ROLE, "brain");
  assert.equal(env.SIMEON_HANDS_URL, "https://api.simeonlabs.com/sand-box/brain/hands");
  assert.deepEqual(JSON.parse(env.SIMEON_HANDS_HEADERS), {
    "x-simeon-brain-token": "brain-secret",
    "x-simeon-brain-user": "user-1",
  });
  assert.equal(env.SAND_GATEWAY_TOKEN, "gateway-secret");
  assert.equal(env.SAND_INFERENCE_RENEWAL_CREDENTIAL, "credential-secret");
  assert.equal(env.SAND_BOX_STORE_ID, BOOT.brainStoreSource, "backs up to its own store, never the computer's");
  assert.equal(env.SAND_BOX_STORE_SYNC, "1");
  assert.equal(env.SAND_USE_EXISTING_BOX_EXEC_DAEMON, "1", "never starts hands of its own");
  assert.equal(env.SAND_PACKAGED, "1");
  assert.equal(env.SAND_HOST_PORT, "10000");
  assert.equal(env.PATH, "/usr/bin");
  for (const gone of ["SIMEON_BRAIN_TOKEN", "SIMEON_BOX_STORE_RESTORE", "SAND_BOX_STORE_COPY_IN", "SAND_HOST_IN_BOX"]) {
    assert.equal(env[gone], undefined, gone);
  }
});

test("the bootstrap: the brain's token sent, a refusal said with its reason", async () => {
  const seen = [];
  const answer = (status, body) => async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const boot = await bootstrap(settings(), answer(200, BOOT));
  assert.equal(boot.userId, "user-1");
  assert.equal(seen[0].url, "https://api.simeonlabs.com/sand-box/brain/bootstrap");
  assert.equal(seen[0].init.headers["x-simeon-brain-token"], "brain-secret");
  assert.deepEqual(JSON.parse(seen[0].init.body), { email: "founder@example.com" });
  await assert.rejects(
    bootstrap(settings(), answer(409, { error: "no_computer", message: "open Simeon on a device first" })),
    (error) => error instanceof BrainStartError && error.status === 409 && /no_computer/.test(error.message) && !/brain-secret/.test(error.message),
  );
  await assert.rejects(bootstrap(settings(), answer(200, { ...BOOT, credential: "" })), /no credential/);
});

test("the engine's bundle: a .tgz as it is, or the newest in a published folder", async () => {
  assert.equal(await bundleArchiveUrl("https://b.example/one.tgz"), "https://b.example/one.tgz");
  const folder = async (url) => {
    assert.equal(url, "https://b.example/host/sand-host-bundle-latest.version");
    return new Response("abc123def456\n");
  };
  assert.equal(await bundleArchiveUrl("https://b.example/host/", folder), "https://b.example/host/sand-host-bundle-abc123def456.tgz");
  await assert.rejects(bundleArchiveUrl("https://b.example/host", async () => new Response("", { status: 404 })), /404/);
});

function disk() {
  return settings({ SAND_DATA_ROOT: mkdtempSync(path.join(tmpdir(), "brain-disk-")), SIMEON_BRAIN_HOST_DIR: "/opt/engine" });
}

function copies(codes) {
  const asked = [];
  const run = async (command, args, options) => {
    assert.equal(args.at(-1), COPY_IN_ARG);
    assert.equal(options.env.SAND_BOX_STORE_COPY_IN, "1");
    assert.equal(options.env.SIMEON_ENGINE_ROLE, "brain", "the copy keeps only the agents' folder");
    asked.push(options.env.SAND_BOX_STORE_ID);
    return codes.shift();
  };
  return { asked, run };
}

test("a new brain brings the agents in from the computer's backup, once", async () => {
  const where = disk();
  const { asked, run } = copies([0, 10]);
  assert.equal(await bringIn(where, BOOT, { run, base: {} }), "computer");
  assert.deepEqual(asked, [BOOT.brainStoreSource, BOOT.computerStoreSource]);
  assert.match(readFileSync(path.join(where.dataRoot, BROUGHT_IN_MARKER), "utf8"), /"from":"computer"/);
  const again = copies([]);
  assert.equal(await bringIn(where, BOOT, { run: again.run, base: {} }), "kept");
  assert.deepEqual(again.asked, [], "a later start keeps the disk as it is");
});

test("a new disk brings the agents back from the brain's own backup, not the computer's older one", async () => {
  const { asked, run } = copies([10]);
  assert.equal(await bringIn(disk(), BOOT, { run, base: {} }), "brain");
  assert.deepEqual(asked, [BOOT.brainStoreSource]);
});

test("no backup anywhere is a fresh start; a failed copy never starts on an empty disk", async () => {
  assert.equal(await bringIn(disk(), BOOT, { run: copies([0, 0]).run, base: {} }), "nothing");
  const where = disk();
  await assert.rejects(bringIn(where, BOOT, { run: copies([0, 1]).run, base: {} }), /computer's backup failed \(exit 1\)/);
  assert.equal(existsSync(path.join(where.dataRoot, BROUGHT_IN_MARKER)), false, "tried again at the next start");
});

test("the hand-off left by a copy from an older backup is cleared for the brain's new store", async () => {
  const where = disk();
  const run = async () => {
    writeFileSync(path.join(where.dataRoot, HYDRATION_HANDOFF_FILE), "{}");
    return 10;
  };
  await bringIn(where, BOOT, { run, base: {} });
  assert.equal(existsSync(path.join(where.dataRoot, HYDRATION_HANDOFF_FILE)), false);
});

test("a refusal is tried again slowly, a dropped connection soon", () => {
  assert.equal(retryDelayMs(new BrainStartError("x", { status: 409 }), 0), 60_000);
  assert.equal(retryDelayMs(new Error("network"), 0), 5_000);
  assert.equal(retryDelayMs(new Error("network"), 10), 80_000);
  assert.ok(retryDelayMs(new BrainStartError("x", { status: 401 }), 10) <= 5 * 60_000);
});

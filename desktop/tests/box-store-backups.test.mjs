/**
 * Backups of the cloud computer, the upstream app's way (14 October 2026;
 * `server/simeon/sand/box_store.py`, `source/host/box/box-store-restore.ts`).
 *
 * Offline: the restore the server asks for runs the copy helper once per
 * container, keeps an agents' folder already in use when told "fresh", fails
 * closed (the host stops before it starts anything) and, after three
 * failures, starts with backups paused so the backup is kept; the presigned
 * URLs are taken from the bucket the server names and no other.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let loaded;
async function load() {
  if (loaded !== undefined) return loaded;
  const temporary = await mkdtemp(path.join(repoRoot, ".tmp-box-store-backups-"));
  const outfile = path.join(temporary, "entry.mjs");
  try {
    await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/box-store-backups-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", packages: "external", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
    loaded = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  return loaded;
}

async function sandRoot() {
  return mkdtemp(path.join(os.tmpdir(), "box-store-restore-"));
}

function harness(root, env, exitCodes) {
  const runs = [];
  const logs = [];
  return {
    runs,
    logs,
    deps: {
      env,
      sandRoot: root,
      runCopyIn: async (childEnv) => { runs.push(childEnv); return exitCodes.shift() ?? 0; },
      log: (message) => logs.push(message),
    },
  };
}

test("no restore asked: nothing runs", async () => {
  const { restoreBoxStoreFromEnv } = await load();
  const root = await sandRoot();
  const { deps, runs } = harness(root, {}, []);
  assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "off" });
  assert.equal(runs.length, 0);
});

test("restore runs the copy helper once per container, switched on for its run only", async () => {
  const { restoreBoxStoreFromEnv, BOX_STORE_RESTORE_MARKER } = await load();
  const root = await sandRoot();
  const env = { SAND_BOX_STORE_RESTORE: "always", SAND_BOX_STORE_RESTORE_ID: "abc" };
  const { deps, runs } = harness(root, env, [10]);
  assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "restored", exitCode: 10 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].SAND_BOX_STORE_COPY_IN, "1");
  assert.equal(env.SAND_BOX_STORE_COPY_IN, undefined, "the container's own environment is left alone");
  const marker = JSON.parse(await readFile(path.join(root, BOX_STORE_RESTORE_MARKER), "utf8"));
  assert.deepEqual(marker, { restoreId: "abc", state: "done", attempts: 1 });
  // The host restarted in the same container: not again.
  assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "done-before" });
  assert.equal(runs.length, 1);
  // A new container (a new id): again.
  env.SAND_BOX_STORE_RESTORE_ID = "def";
  assert.equal((await restoreBoxStoreFromEnv(deps)).kind, "restored");
  assert.equal(runs.length, 2);
});

test("fresh keeps an agents' folder already in use and fills an empty one", async () => {
  const { restoreBoxStoreFromEnv } = await load();
  const root = await sandRoot();
  await mkdir(path.join(root, "agents", "agent-1"), { recursive: true });
  const { deps, runs } = harness(root, { SAND_BOX_STORE_RESTORE: "fresh", SAND_BOX_STORE_RESTORE_ID: "a1" }, [10]);
  assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "kept-local" });
  assert.equal(runs.length, 0);

  const empty = await sandRoot();
  const second = harness(empty, { SAND_BOX_STORE_RESTORE: "fresh", SAND_BOX_STORE_RESTORE_ID: "a2" }, [0]);
  assert.deepEqual(await restoreBoxStoreFromEnv(second.deps), { kind: "restored", exitCode: 0 });
  assert.equal(second.runs.length, 1);
});

test("a failed copy fails closed, then after three the host starts with backups paused", async () => {
  const { restoreBoxStoreFromEnv, BOX_STORE_RESTORE_MAX_ATTEMPTS } = await load();
  const root = await sandRoot();
  const env = { SAND_BOX_STORE_RESTORE: "fresh", SAND_BOX_STORE_RESTORE_ID: "x", SAND_BOX_STORE_SYNC: "1" };
  const { deps, runs } = harness(root, env, [1, 1, 1]);
  for (let attempt = 1; attempt <= BOX_STORE_RESTORE_MAX_ATTEMPTS; attempt += 1) {
    assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "failed", attempts: attempt });
    assert.equal(env.SAND_BOX_STORE_SYNC, "1");
  }
  assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "gave-up", attempts: 3 });
  assert.equal(runs.length, 3);
  // Its empty folders never replace the backup it could not read.
  assert.equal(env.SAND_BOX_STORE_SYNC, "0");
});

test("a copy helper that cannot start counts as a failure", async () => {
  const { restoreBoxStoreFromEnv, spawnBoxCopyIn } = await load();
  await assert.rejects(spawnBoxCopyIn({}, path.join(os.tmpdir(), "no-such-host-main.cjs")));
  const root = await sandRoot();
  const { deps } = harness(root, { SAND_BOX_STORE_RESTORE: "always", SAND_BOX_STORE_RESTORE_ID: "y" }, []);
  deps.runCopyIn = () => Promise.reject(new Error("spawn failed"));
  assert.deepEqual(await restoreBoxStoreFromEnv(deps), { kind: "failed", attempts: 1 });
});

test("spawnBoxCopyIn runs the entry with --box-copy-in and returns its exit code", async () => {
  const { spawnBoxCopyIn } = await load();
  const dir = await mkdtemp(path.join(os.tmpdir(), "copy-in-entry-"));
  const entry = path.join(dir, "host-main.cjs");
  await writeFile(entry, "console.log('[box-copy-in] result outcome=' + (process.argv.includes('--box-copy-in') && process.env.SAND_BOX_STORE_COPY_IN === '1' ? 'hydrated' : 'wrong')); process.exit(10);\n");
  const logPath = path.join(dir, "copy-in.log");
  assert.equal(await spawnBoxCopyIn({ ...process.env, SAND_BOX_STORE_COPY_IN: "1" }, entry, logPath), 10);
  assert.match(await readFile(logPath, "utf8"), /result outcome=hydrated/);
});

test("the host stops before it starts anything when the restore failed", async () => {
  const { main } = await load();
  const calls = [];
  let exitCode;
  const deps = {
    executeBoxCopyInFromEnv: async () => 0,
    restoreBoxStore: async () => ({ kind: "failed", attempts: 1 }),
    installProcessCrashGuards: () => ({ setReporter() {} }),
    installInvariantReporter() {},
    pinHostDiagnosticsReporter() {},
    acquireHostLock: async () => ({ lock: { release: () => calls.push("release") }, outcome: "acquired" }),
    getSandRootDir: () => os.tmpdir(),
    createHost: () => { calls.push("createHost"); throw new Error("must not start"); },
    resolveGatewayServerConfig: () => ({ host: "127.0.0.1" }),
    gatewayScheme: () => "http",
    startGatewayServer: async () => { throw new Error("must not start"); },
    writeGatewayDiscovery: async () => {},
    clearGatewayDiscovery: async () => {},
    log: { log() {}, error() {} },
  };
  await main(deps, { argv: ["node", "host-main.cjs"], pid: 1, on() {}, exit: (code) => { exitCode = code; } });
  assert.equal(exitCode, 1);
  assert.deepEqual(calls, ["release"]);
});

test("presigned URLs: the upstream's bucket and the one the server names, nothing else", async () => {
  const { agentStoreBucketHosts, createAgentStorePresignedUrlValidatorForBackend } = await load();
  const env = { SAND_AGENT_STORE_BUCKET_HOSTS: "simeon-backups.s3.us-west-2.amazonaws.com, evil.example.com" };
  assert.deepEqual(agentStoreBucketHosts(env), [
    "agent-stores.s3.us-east-1.amazonaws.com",
    "agent-stores.s3.amazonaws.com",
    "simeon-backups.s3.us-west-2.amazonaws.com",
  ]);
  const before = process.env.SAND_AGENT_STORE_BUCKET_HOSTS;
  process.env.SAND_AGENT_STORE_BUCKET_HOSTS = env.SAND_AGENT_STORE_BUCKET_HOSTS;
  try {
    const validate = createAgentStorePresignedUrlValidatorForBackend("https://api.simeonlabs.com");
    validate(new URL("https://simeon-backups.s3.us-west-2.amazonaws.com/box-stores/u/store-x/manifest.json?X-Amz-Signature=a"));
    assert.throws(() => validate(new URL("https://evil.example.com/x")));
    assert.throws(() => validate(new URL("https://other-bucket.s3.us-west-2.amazonaws.com/x")));
  } finally {
    if (before === undefined) delete process.env.SAND_AGENT_STORE_BUCKET_HOSTS; else process.env.SAND_AGENT_STORE_BUCKET_HOSTS = before;
  }
});

test("the packaging audit's catalog names every part of the host's start, restore included", async () => {
  const { runtimeCatalogDrift } = await import(pathToFileURL(path.join(repoRoot, "scripts/audit-runtime-composition.mjs")).href);
  assert.deepEqual(await runtimeCatalogDrift(), []);
});

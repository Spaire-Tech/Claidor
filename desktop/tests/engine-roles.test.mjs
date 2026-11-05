/**
 * The engine's roles (docs/agents-on-the-server/README.md, step 1a part 2).
 * On a computer whose agents run on the brain (`SIMEON_ENGINE_ROLE=hands`),
 * the engine is only the keeper of the computer's files: its backup leaves
 * the agents' folder out, so a computer with no agents never clears them from
 * the backup, and nothing else runs, so nothing is answered twice.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  // Built beside the engine's packages, so the ones it leaves out resolve.
  await mkdir(path.join(repoRoot, "node_modules/.cache"), { recursive: true });
  const dir = await mkdtemp(path.join(repoRoot, "node_modules/.cache/simeon-engine-roles-"));
  const outfile = path.join(dir, "engine-roles.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/engine-roles-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent",
    external: ["electron", "tree-sitter", "tree-sitter-bash", "web-tree-sitter", "node-gyp-build", "node-addon-api", "piscina"],
    alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const module = await load();

test("the role is read from SIMEON_ENGINE_ROLE; anything else is the whole engine, said so", () => {
  assert.equal(module.engineRoleFromEnv({}), "all");
  assert.equal(module.engineRoleFromEnv({ SIMEON_ENGINE_ROLE: " Hands " }), "hands");
  assert.equal(module.engineRoleFromEnv({ SIMEON_ENGINE_ROLE: "brain" }), "brain");
  assert.equal(module.engineRoleFromEnv({ SIMEON_ENGINE_ROLE: "hand" }), "all");
  assert.equal(module.describeEngineRole({ SIMEON_ENGINE_ROLE: "hands" }), "[sand-host] engine role: hands");
  assert.match(module.describeEngineRole({ SIMEON_ENGINE_ROLE: "hand" }), /engine role: all \(SIMEON_ENGINE_ROLE not understood/);
});

const categories = module.buildBoxStoreCategories({ sandRoot: "/home/box/sand-data", chromeStageRetry: {}, reportChromeSessionStage() {}, env: {} });
const names = (list) => list.map((category) => category.name);

test("each role backs up only the folders on its own disk", () => {
  assert.ok(names(categories).includes("sand-data"));
  const hands = module.boxStoreCategoriesForRole(categories, "hands");
  assert.ok(!names(hands).includes("sand-data"), "the computer never backs up the agents' folder");
  assert.ok(hands.every((category) => category.containsAgentStoreDbs !== true));
  for (const name of ["workspace", "cli-config", "chrome-profile"]) assert.ok(names(hands).includes(name), `the computer keeps ${name}`);
  assert.deepEqual(names(module.boxStoreCategoriesForRole(categories, "brain")), ["sand-data"]);
  assert.deepEqual(names(module.boxStoreCategoriesForRole(categories, "all")), names(categories));
});

test("on the computer, the backup never sweeps nor clears the agents' databases", async () => {
  const touched = [];
  const stub = (label) => new Proxy({}, { get: (_target, name) => (...args) => { touched.push(`${label}.${String(name)}`); return undefined; } });
  const capture = new module.StoreDbCapture({
    deps: { categories: module.boxStoreCategoriesForRole(categories, "hands"), objectStoreProvider: stub("objectStore"), resolveStoreId: async () => "store-x" },
    now: Date.now,
    log: (line) => touched.push(`log:${line}`),
    manifestStore: stub("manifest"),
    transfer: stub("transfer"),
    maxObjectBytes: 1, uploadConcurrency: 1, largeObjectThreshold: 1,
    ensureWriterLock: async () => true,
    isStopped: () => false,
  });
  assert.equal(await capture.pruneMissingAgentStoreDbs("store-x"), 0);
  const sweep = await capture.runAgentStoreDbsSweep("store-x", false);
  assert.equal(sweep.agentCount, 0);
  assert.equal(sweep.complete, true);
  assert.deepEqual(touched, [], "neither the backup's record nor its storage was touched");
});

function keeper() {
  const calls = [];
  const lines = [];
  const backup = {
    api: {
      isEnabled: true,
      snapshotBoxStoreNow: async (args) => { calls.push(["snapshot", args]); return { ok: true, manifestEntries: 3 }; },
      getBoxStoreStatus: () => { calls.push(["status"]); return { lastCycle: null }; },
    },
    start: () => calls.push(["start"]),
    dispose: () => calls.push(["dispose"]),
  };
  const host = module.createHandsKeeperHost({
    log: (line) => lines.push(line), now: () => 1000, createBackup: () => backup,
    writeReferencePages: async () => { calls.push(["reference pages"]); return ["/home/box/reference/a.md", "/home/box/reference/b.md"]; },
  });
  return { host, calls, lines };
}

test("the keeper starts the backup and answers the server's calls, never busy", async () => {
  const { host, calls, lines } = keeper();
  await host.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [["start"], ["reference pages"]]);
  assert.match(lines.join("\n"), /\[hands-keeper\] on: the agents run on the brain/);
  assert.ok(lines.includes("[hands-keeper] reference pages written: 2"), "the agents' reference pages are written on the computer");
  assert.deepEqual(host.getHealth(), { isBusy: false, busyOnlyAwaitingApproval: false, activeAgentId: null, lastBusyAtMs: 1000 });
  const api = host.getApi();
  assert.deepEqual(await api.snapshotBoxStoreNow({ includeIdleOnly: true }), { ok: true, manifestEntries: 3 });
  assert.deepEqual(api.getBoxStoreStatus(), { lastCycle: null });
  assert.equal((await api.getHostStatus()).role, "hands");
  assert.equal(api.sendPrompt, undefined, "no agent runs here");
  await host.dispose();
  assert.deepEqual(calls.at(-1), ["dispose"]);
});

test("the engine's start makes the keeper, not the whole engine, when the role is hands", async () => {
  const saved = { role: process.env.SIMEON_ENGINE_ROLE, existing: process.env.SAND_USE_EXISTING_BOX_EXEC_DAEMON };
  const lines = [];
  const ports = new Proxy({ log: { log: (line) => lines.push(line), error() {} } }, {
    get: (target, name) => name in target ? target[name] : () => { throw new Error(`the whole engine was asked for ${String(name)}`); },
  });
  try {
    process.env.SAND_USE_EXISTING_BOX_EXEC_DAEMON = "1";
    process.env.SIMEON_ENGINE_ROLE = "hands";
    const host = module.createProductionHostMainDependencies(ports).createHost();
    assert.equal((await host.getApi().getHostStatus()).role, "hands");
    assert.ok(lines.includes("[sand-host] engine role: hands"));
  } finally {
    for (const [name, value] of [["SIMEON_ENGINE_ROLE", saved.role], ["SAND_USE_EXISTING_BOX_EXEC_DAEMON", saved.existing]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

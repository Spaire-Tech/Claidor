/**
 * The brain, the engine off the computer (docs/agents-on-the-server/README.md,
 * step 1a part 3):
 * - at its first start it brings in the agents' folder alone from the
 *   backup; the computer's files and Chrome's sign-ins stay on the computer;
 * - the Computer tab's state comes from the server, which knows whether the
 *   computer sleeps; the engine on the computer always says running.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  await mkdir(path.join(repoRoot, "node_modules/.cache"), { recursive: true });
  const dir = await mkdtemp(path.join(repoRoot, "node_modules/.cache/simeon-brain-role-"));
  const outfile = path.join(dir, "brain-role.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/brain-role-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent",
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

test("only the brain narrows what it brings in, to the agents' folder", () => {
  const keep = module.copyInKeepsRelPath({ SIMEON_ENGINE_ROLE: "brain" });
  assert.equal(keep("home/box/sand-data/agents/a1/store.db"), true);
  assert.equal(keep("workspace/report.pdf"), false);
  assert.equal(keep("home/box/chrome-profile/Default/Cookies"), false);
  assert.equal(keep("home/box/sand-data-old/x"), false);
  assert.equal(module.copyInKeepsRelPath({}), undefined, "the engine on the computer brings in every file, as before");
  assert.equal(module.copyInKeepsRelPath({ SIMEON_ENGINE_ROLE: "hands" }), undefined);
});

async function restoreWith(keepRelPath) {
  const target = await mkdtemp(path.join(repoRoot, "node_modules/.cache/simeon-brain-restore-"));
  const entry = { sha256: "0".repeat(64), size: 1, mtimeMs: 0 };
  const manifest = new Map([
    ["home/box/sand-data/agents/a1/store.db", entry],
    ["workspace/report.pdf", entry],
    ["home/box/chrome-profile/Default/Cookies", entry],
  ]);
  let downloaded = null;
  const lines = [];
  const sync = {
    readManifestStrict: async () => manifest,
    readManifestStrictDetailed: async () => ({ present: true, manifest, fullyHydrated: true }),
    download: async (_dir, options) => {
      downloaded = [...options.manifest.keys()];
      return { manifestEntries: downloaded.length, files: downloaded.length, bytes: 0, verified: downloaded.length, failures: [] };
    },
  };
  try {
    await module.runBoxCopyIn({ sync, targetDir: target, log: (line) => lines.push(line), ...(keepRelPath ? { keepRelPath } : {}) });
  } finally {
    await rm(target, { recursive: true, force: true });
  }
  return { downloaded, lines };
}

test("the brain's restore downloads the agents' folder and nothing else", async () => {
  const brain = await restoreWith(module.copyInKeepsRelPath({ SIMEON_ENGINE_ROLE: "brain" }));
  assert.deepEqual(brain.downloaded, ["home/box/sand-data/agents/a1/store.db"]);
  assert.ok(brain.lines.includes("bringing in 1 of the backup's 3 files (this engine's own folders)"));
  const computer = await restoreWith(undefined);
  assert.equal(computer.downloaded.length, 3, "the computer's restore is unchanged");
});

const route = { baseUrl: "https://api.example.com/sand-box/brain/hands", headers: { "x-simeon-brain-token": "t", "x-simeon-brain-user": "u1" } };

function fetchAnswering(answer) {
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url, method: init.method, headers: init.headers });
    if (answer instanceof Error) throw answer;
    return { ok: answer.status === 200, json: async () => answer.body };
  };
  return { asked, fetchImpl };
}

test("the brain reads the computer's state from the server, in the apps' words", async () => {
  for (const [body, expected] of [[{ state: "running" }, "running"], [{ state: "hibernated" }, "hibernated"], [{ state: "absent" }, "absent"], [{ state: "melted" }, "running"]]) {
    const { asked, fetchImpl } = fetchAnswering({ status: 200, body });
    assert.equal(await module.readBoxRunStateThroughRoute(route, fetchImpl), expected);
    assert.deepEqual(asked, [{ url: "https://api.example.com/sand-box/brain/hands/state", method: "GET", headers: route.headers }]);
  }
});

test("when the server can't say, the state is running, as the engine on the computer says", async () => {
  assert.equal(await module.readBoxRunStateThroughRoute(route, fetchAnswering({ status: 502, body: {} }).fetchImpl), "running");
  assert.equal(await module.readBoxRunStateThroughRoute(route, fetchAnswering(new Error("offline")).fetchImpl), "running");
});

test("the computer link uses that state when it is given one, and is running otherwise", async () => {
  const operations = {};
  assert.equal(await module.createSandBox({ operations }).runState(), "running");
  assert.equal(await module.createSandBox({ operations, readRunState: async () => "hibernated" }).runState(), "hibernated");
});

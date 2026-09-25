/**
 * The coordinator, the gateway and the box (25 September 2026,
 * design-audit-ledger.md clusters `unserved-transports` and `hatch-residue`).
 *
 * Grok Bot's Mac-and-box plumbing was built for Cursor's cloud and the
 * reconstruction pointed it at Simeon Labs' server without the "is this
 * served?" switch each path needs: the Statsig bootstrap asked every five
 * minutes, the local-exec credential every thirty seconds, the update feed
 * defaulted to Cursor's, the box image was a floating tag with no digest
 * hook. And the hatch-era coordinator plumbing (a local reaction store, a
 * timestamp re-sort, a best-effort permission stamp) still ran on the host
 * path.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("nothing asks Cursor's server on a timer: no Statsig bootstrap, no local-exec credential, no update feed", async () => {
  const experiments = await src("shared/node/experiments/cursor-experiments.ts");
  assert.match(experiments, /this\.refreshSnapshot\(\); if \(!isConnectServed\(this\.options\.env\)\) return; this\.pollHandle = this\.refreshPoll\.start/);
  assert.match(experiments, /private async runRefresh\(trigger: Trigger\): Promise<void> \{ if \(!isConnectServed\(this\.options\.env\)\) \{ this\.refreshSnapshot\(\); return; \}/);
  const docker = await src("electron-main/box/local-docker-host-connector.ts");
  assert.match(docker, /issueLocalExecDaemonCredential: async \(\) => settings\.getBoxRuntime\(\) === "local-docker" \? undefined : await remote\.issueLocalExecDaemonCredential!\(\)/);
  assert.match(await src("node-agent-coordinator/local-exec/supervisor.ts"), /if \(credential == null\) \{ credentialHandedOff = true; return; \}/);
  const { module, dispose } = await load("source/electron-main/update/update-feed.ts", "update-feed");
  try {
    assert.equal(module.DEFAULT_UPDATE_BASE_URL, undefined, "no feed unless SAND_UPDATE_FEED_BASE_URL names one");
  } finally {
    await dispose();
  }
  assert.match(await src("electron-main/update/sand-update-service.ts"), /if \(feedBaseUrl == null \|\| feedBaseUrl\.length === 0\) return null;/);
});

test("the box image can be pinned by digest, and the reference is what the container is created with and checked against", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "local-docker-image");
  try {
    assert.equal(module.localDockerBoxImageReference({}), module.LOCAL_DOCKER_BOX_IMAGE);
    const digest = "a".repeat(64);
    assert.equal(module.localDockerBoxImageReference({ SAND_BOX_IMAGE_DIGEST: `sha256:${digest}` }), `${module.LOCAL_DOCKER_BOX_IMAGE}@sha256:${digest}`);
    assert.equal(module.localDockerBoxImageReference({ SAND_BOX_IMAGE_DIGEST: "not-a-digest" }), module.LOCAL_DOCKER_BOX_IMAGE, "a malformed digest is ignored, not run");
  } finally {
    await dispose();
  }
  const docker = await src("electron-main/box/local-docker-host-connector.ts");
  assert.match(docker, /inspected\.image !== localDockerBoxImageReference\(\)/);
  assert.match(docker, /\.\.\.authMounts,\n\s*localDockerBoxImageReference\(\),/);
});

test("the hatch's plumbing is off the host path: no local reaction, no re-sort, and a card waits for its scope in order", async () => {
  const router = await src("node-agent-coordinator/inference-router.ts");
  assert.match(router, /if \(method === "reactToMessage" && handledLocally\(provider\)\) \{/);
  const { module, dispose } = await load("source/node-agent-coordinator/permission-scope-stamp.ts", "permission-stamp");
  try {
    const entries = [{ id: "t2u", timestampMs: 5, permissionRequest: {} }, { id: "t1u", timestampMs: 9 }];
    const reply = module.stampTranscriptReply("getAgentThread", { entries }, { slot: "s", revision: 1 });
    assert.deepEqual(reply.entries.map((entry) => entry.id), ["t2u", "t1u"], "the host's order is kept");
    const sorted = module.stampTranscriptReply("getAgentThread", { entries }, { slot: "s", revision: 1 }, { sortByTimestamp: true });
    assert.deepEqual(sorted.entries.map((entry) => entry.id), ["t2u", "t1u"], "a sort is only asked for on the hatch");
  } finally {
    await dispose();
  }
  const main = await src("node-agent-coordinator/main.ts");
  assert.match(main, /let transcriptPostChain: Promise<void> = Promise\.resolve\(\);/);
  assert.match(main, /if \(permissionScope\(\) == null\) await fetchPermissionScopeSlot\(\);\n\s*server\.postEvent\(family, stampTranscriptEvent\(event\.payload, permissionScope\(\)\)\);/);
  assert.match(main, /\{ sortByTimestamp: !routesClaidorThroughHost\(\) \}/);
  assert.equal((await src("shared/deep-link.ts")).includes('SAND_HTTPS_DEEP_LINK_ORIGIN = "https://app.simeonlabs.com"'), true);
  for (const [file, gone] of [["electron-main/coordinator/coordinator-port-ipc-guard.ts", "Sand app window"], ["electron-main/main-edge.ts", "Sand app window"], ["shared/node/cursor-backend/claidor-api.ts", "Claidor answered"], ["shared/node/cursor-backend/claidor-api.ts", "Claidor refused"]]) {
    assert.ok(!(await src(file)).includes(gone), `${file} no longer says ${gone}`);
  }
});

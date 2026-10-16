import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import { buildHostBundle, HOST_COMPANIONS, LATEST_VERSION_FILE, staleAppReason } from "../scripts/lib/host-bundle-publish.mjs";

// The bundle the cloud computers mount, in the upstream app's layout (29 September 2026).
function members(tarGz) {
  const tar = gunzipSync(tarGz);
  const found = [];
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const name = tar.subarray(offset, offset + 100).toString("utf8").replace(/\0.*$/s, "");
    if (name === "") break;
    const size = Number.parseInt(tar.subarray(offset + 124, offset + 136).toString("ascii"), 8);
    const mtime = Number.parseInt(tar.subarray(offset + 136, offset + 148).toString("ascii"), 8);
    found.push({ name, mtime, bytes: tar.subarray(offset + 512, offset + 512 + size).toString() });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return found;
}

const companions = Object.fromEntries(HOST_COMPANIONS.map((name) => [name, Buffer.from(`worker ${name}`)]));

test("the bundle is the upstream app's layout, the same bytes every time, with the files the server reads", () => {
  const input = { version: "afb1dedebc53", hostBytes: Buffer.from("host"), boxExecDaemonBytes: Buffer.from("daemon"), companions };
  const first = buildHostBundle(input);
  assert.equal(first.tarballName, "sand-host-bundle-afb1dedebc53.tgz");
  assert.equal(first.versionName, LATEST_VERSION_FILE);
  assert.equal(first.versionBody, "afb1dedebc53\n");
  assert.ok(buildHostBundle(input).tarball.equals(first.tarball));
  assert.deepEqual(members(first.tarball), [
    { name: "host/host-main.cjs", mtime: 0, bytes: "host" },
    { name: "host/agent-isolation/agent-store-worker.cjs", mtime: 0, bytes: "worker agent-isolation/agent-store-worker.cjs" },
    { name: "host/agent-isolation/transcript-mirror-worker.cjs", mtime: 0, bytes: "worker agent-isolation/transcript-mirror-worker.cjs" },
    { name: "host/extensions/box-store-sync/box-store-vacuum-worker.cjs", mtime: 0, bytes: "worker extensions/box-store-sync/box-store-vacuum-worker.cjs" },
    { name: "host/extensions/content-search/search-index-worker.cjs", mtime: 0, bytes: "worker extensions/content-search/search-index-worker.cjs" },
    { name: "box-exec-daemon/main.cjs", mtime: 0, bytes: "daemon" },
  ]);
});

// 16 October 2026: on Simeon's own image (E2B) the host's folder held
// host-main.cjs alone, and every agent turn failed for want of its worker.
test("the host's own files travel with it, and a bundle without one is refused", () => {
  const files = { version: "abcdef12", hostBytes: Buffer.from("h"), boxExecDaemonBytes: Buffer.from("d") };
  assert.throws(() => buildHostBundle(files), /host's own files must be present: agent-isolation\/agent-store-worker.cjs/);
  const { [HOST_COMPANIONS[0]]: _dropped, ...withoutOne } = companions;
  assert.throws(() => buildHostBundle({ ...files, companions: withoutOne }), /agent-store-worker/);
  assert.throws(() => buildHostBundle({ ...files, companions: { ...companions, [HOST_COMPANIONS[3]]: Buffer.alloc(0) } }), /search-index-worker/);
});

test("the host's own files are the ones the host looks for beside host-main.cjs", async () => {
  const { readFile } = await import("node:fs/promises");
  const looked = [
    ["source/host/agent-isolation/agent-worker-pool.ts", ["agent-isolation", "agent-store-worker.cjs"]],
    ["source/host/agent-isolation/transcript-mirror-offload.ts", ["agent-isolation", "transcript-mirror-worker.cjs"]],
    ["source/host/extensions/box-store-sync/store-db-snapshot-upload.ts", ["extensions/box-store-sync/box-store-vacuum-worker.cjs"]],
    ["source/host/extensions/content-search/search-index-service.ts", ["extensions", "content-search", "search-index-worker.cjs"]],
  ];
  for (const [file, parts] of looked) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const part of parts) assert.ok(text.includes(`"${part}"`), `${file} looks for ${part}`);
    assert.ok(HOST_COMPANIONS.includes(parts.join("/")), `${parts.join("/")} is in HOST_COMPANIONS`);
  }
});

test("a version that is not a commit id, or a missing file, is refused", () => {
  const files = { hostBytes: Buffer.from("h"), boxExecDaemonBytes: Buffer.from("d"), companions };
  assert.throws(() => buildHostBundle({ version: "latest", ...files }), /commit id/);
  assert.throws(() => buildHostBundle({ version: "../x", ...files }), /commit id/);
  assert.throws(() => buildHostBundle({ version: "abcdef12", hostBytes: Buffer.alloc(0), boxExecDaemonBytes: Buffer.from("d"), companions }), /both be present/);
});

test("only an app built from the current engine sources is published (13 October 2026: an old app went out under a new name)", () => {
  const current = "ccc179cc749f0c4d2e3f4a5b6c7d8e9f0a1b2c3d";
  assert.equal(staleAppReason(`${current}\n`, current), null);
  assert.match(staleAppReason("", current), /run `npm run package` first/);
  assert.match(staleAppReason("804bb90b5ff6aaaabbbbccccddddeeeeffff0000", current), /built from 804bb90b5ff6, not the current engine sources ccc179cc749f/);
});

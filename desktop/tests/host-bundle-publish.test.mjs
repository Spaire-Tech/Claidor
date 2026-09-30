import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import { buildHostBundle, LATEST_VERSION_FILE } from "../scripts/lib/host-bundle-publish.mjs";

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

test("the bundle is the upstream app's layout, the same bytes every time, with the two files the server reads", () => {
  const input = { version: "afb1dedebc53", hostBytes: Buffer.from("host"), boxExecDaemonBytes: Buffer.from("daemon") };
  const first = buildHostBundle(input);
  assert.equal(first.tarballName, "sand-host-bundle-afb1dedebc53.tgz");
  assert.equal(first.versionName, LATEST_VERSION_FILE);
  assert.equal(first.versionBody, "afb1dedebc53\n");
  assert.ok(buildHostBundle(input).tarball.equals(first.tarball));
  assert.deepEqual(members(first.tarball), [
    { name: "host/host-main.cjs", mtime: 0, bytes: "host" },
    { name: "box-exec-daemon/main.cjs", mtime: 0, bytes: "daemon" },
  ]);
});

test("a version that is not a commit id, or a missing file, is refused", () => {
  const files = { hostBytes: Buffer.from("h"), boxExecDaemonBytes: Buffer.from("d") };
  assert.throws(() => buildHostBundle({ version: "latest", ...files }), /commit id/);
  assert.throws(() => buildHostBundle({ version: "../x", ...files }), /commit id/);
  assert.throws(() => buildHostBundle({ version: "abcdef12", hostBytes: Buffer.alloc(0), boxExecDaemonBytes: Buffer.from("d") }), /both be present/);
});

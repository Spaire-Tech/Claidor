// The cloud computer's host program, published in Grok Bot's layout
// (29 September 2026): `<base>/sand-host-bundle-latest.version` holds a
// commit id and `<base>/sand-host-bundle-<id>.tgz` is the bundle
// (`source/host/extensions/host-upgrade/host-bundle-source.ts`). Simeon Labs'
// server follows that pointer (`server/polar/sand/box_hosts.py`) and mounts
// the bundle into each cloud computer, which is replaced when it is idle.
//
// The two files come out of the packaged app's `app.asar`, the same bytes
// the Mac's own Docker box mounts (`stageCurrentHostBundle` in
// local-docker-host-connector.ts reads `dist/host/host-main.cjs` and
// `dist/box-exec-daemon/main.cjs` beside it), so the cloud and the Mac always
// run one program. The tar is written here, byte for byte the same on any
// machine: no owner, no modification time, no macOS extended attributes.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export const HOST_BUNDLE_PREFIX = "sand-host-bundle";
export const LATEST_VERSION_FILE = "sand-host-bundle-latest.version";
/** Grok Bot's rule for a version (`SHORT_GIT_SHA_REGEX`). */
export const VERSION_PATTERN = /^[0-9a-f]{7,40}$/;
export const BUNDLE_MEMBERS = Object.freeze({
  host: "host/host-main.cjs",
  boxExecDaemon: "box-exec-daemon/main.cjs",
});
export const ASAR_MEMBERS = Object.freeze({
  host: "dist/host/host-main.cjs",
  boxExecDaemon: "dist/box-exec-daemon/main.cjs",
});

function octal(value, width) {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

function header(name, size) {
  const block = Buffer.alloc(512, 0);
  if (Buffer.byteLength(name) > 100) throw new Error(`tar name too long: ${name}`);
  block.write(name, 0, "utf8");
  block.write(octal(0o644, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(0, 12), 136, "ascii");
  block.write("        ", 148, "ascii");
  block.write("0", 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(octal(sum, 7) + " ", 148, "ascii");
  return block;
}

/** A gzipped ustar archive of `entries` ([name, bytes] pairs), in order. */
export function deterministicTarGz(entries) {
  const parts = [];
  for (const [name, bytes] of entries) {
    parts.push(header(name, bytes.length), bytes);
    const pad = (512 - (bytes.length % 512)) % 512;
    if (pad > 0) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The two publishable files for one version. */
export function buildHostBundle({ version, hostBytes, boxExecDaemonBytes }) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`version must be a commit id (7-40 lowercase hex), got ${JSON.stringify(version)}`);
  }
  if (hostBytes.length === 0 || boxExecDaemonBytes.length === 0) {
    throw new Error("the host and the exec daemon must both be present");
  }
  const tarball = deterministicTarGz([
    [BUNDLE_MEMBERS.host, hostBytes],
    [BUNDLE_MEMBERS.boxExecDaemon, boxExecDaemonBytes],
  ]);
  return {
    tarballName: `${HOST_BUNDLE_PREFIX}-${version}.tgz`,
    tarball,
    versionName: LATEST_VERSION_FILE,
    versionBody: `${version}\n`,
    hostSha256: sha256(hostBytes),
  };
}

// The cloud computer's host program, published in the upstream app's layout
// (29 September 2026): `<base>/sand-host-bundle-latest.version` holds a
// commit id and `<base>/sand-host-bundle-<id>.tgz` is the bundle
// (`source/host/extensions/host-upgrade/host-bundle-source.ts`). Simeon Labs'
// server follows that pointer (`server/simeon/sand/box_hosts.py`) and mounts
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
/** the upstream app's rule for a version (`SHORT_GIT_SHA_REGEX`). */
export const VERSION_PATTERN = /^[0-9a-f]{7,40}$/;
export const BUNDLE_MEMBERS = Object.freeze({
  host: "host/host-main.cjs",
  boxExecDaemon: "box-exec-daemon/main.cjs",
});
export const ASAR_MEMBERS = Object.freeze({
  host: "dist/host/host-main.cjs",
  boxExecDaemon: "dist/box-exec-daemon/main.cjs",
});
/**
 * The files the host loads from its own folder, beside host-main.cjs (16
 * October 2026), as `host/<path>` in the bundle and `dist/host/<path>` in
 * the app. A Docker box mounts host-main.cjs over an image whose folder
 * already holds them; Simeon's own image (box/, E2B) has none, and every
 * agent turn there failed with "Cannot find module
 * '/home/box/sand-host/agent-isolation/agent-store-worker.cjs'". The server
 * (`server/simeon/sand/box_hosts.py`, HOST_COMPANIONS) writes these into an
 * E2B computer and makes none from a bundle without them.
 */
export const HOST_COMPANIONS = Object.freeze([
  "agent-isolation/agent-store-worker.cjs",
  "agent-isolation/transcript-mirror-worker.cjs",
  "extensions/box-store-sync/box-store-vacuum-worker.cjs",
  "extensions/content-search/search-index-worker.cjs",
]);

/**
 * What a packaged app was built from, written beside it (`<app>.source`) by
 * `npm run package` once it succeeds: the last commit that touched the
 * engine's sources. On 13 October 2026 a test failed, so packaging stopped
 * before it built anything, and the publish took the app left from the build
 * before and uploaded it under the new commit: the cloud computers ran the
 * old engine under a new name, without the day's apps.
 */
export const SOURCE_STAMP_SUFFIX = ".source";
/** Where the engine's sources are, for the stamp (relative to desktop/). */
export const ENGINE_SOURCE_PATHS = Object.freeze(["source", "scripts", "package.json"]);

/** Why a packaged app must not be published as `current`, or null when it may. */
export function staleAppReason(stamp, current) {
  const built = typeof stamp === "string" ? stamp.trim() : "";
  if (built === "") return "The packaged app has no record of what it was built from: run `npm run package` first (it stops, building nothing, when a test fails).";
  if (built !== current) return `The packaged app was built from ${built.slice(0, 12)}, not the current engine sources ${current.slice(0, 12)}: run \`npm run package\` again (it stops, building nothing, when a test fails).`;
  return null;
}

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

/**
 * The two publishable files for one version. `companions` maps each of
 * HOST_COMPANIONS to its bytes; all of them are required.
 */
export function buildHostBundle({ version, hostBytes, boxExecDaemonBytes, companions }) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`version must be a commit id (7-40 lowercase hex), got ${JSON.stringify(version)}`);
  }
  if (hostBytes.length === 0 || boxExecDaemonBytes.length === 0) {
    throw new Error("the host and the exec daemon must both be present");
  }
  const missing = HOST_COMPANIONS.filter((name) => !(companions?.[name]?.length > 0));
  if (missing.length > 0) {
    throw new Error(`the host's own files must be present: ${missing.join(", ")}`);
  }
  const tarball = deterministicTarGz([
    [BUNDLE_MEMBERS.host, hostBytes],
    ...HOST_COMPANIONS.map((name) => [`host/${name}`, companions[name]]),
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

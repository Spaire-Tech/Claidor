#!/usr/bin/env node
// `npm run publish:host-bundle` (29 September 2026): after `npm run package`,
// publishes the packaged app's host program for the cloud computers, in
// Grok Bot's layout (scripts/lib/host-bundle-publish.mjs). The server picks
// it up within ten minutes, with no restart, and each cloud computer moves to
// it the next time it is idle.
//
//   SIMEON_HOST_BUNDLE_S3=s3://bucket/prefix npm run publish:host-bundle
//
// Uploads with the `aws` command line when SIMEON_HOST_BUNDLE_S3 is set: the
// bundle first, the pointer last, so the pointer never names a file that is
// not there yet. Without it, the two files are written to dist/host-bundle/
// and the upload is left to the person. The version is the commit the app was
// built from; a source tree with uncommitted changes is refused
// (`--allow-dirty` overrides, for a test build only).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractFile } from "@electron/asar";

import { ASAR_MEMBERS, buildHostBundle } from "./lib/host-bundle-publish.mjs";
import { resolvePackagedAppArtifacts } from "./lib/packaged-app.mjs";
import { capture, run } from "./lib/process.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const allowDirty = args.includes("--allow-dirty");
const appPath = args.find((arg) => arg.endsWith(".app")) ?? path.join(desktopRoot, "dist", "Simeon.app");

// `capture` answers the command's output, trimmed.
const status = await capture("git", ["status", "--porcelain", "--", "source", "scripts", "package.json"], { cwd: desktopRoot });
if (status !== "" && !allowDirty) {
  throw new Error(`Uncommitted changes in desktop/ would not match the version published:\n${status}\nCommit them, or pass --allow-dirty for a test build.`);
}
const version = await capture("git", ["rev-parse", "--short=12", "HEAD"], { cwd: desktopRoot });

const { asarPath } = resolvePackagedAppArtifacts(appPath);
const bundle = buildHostBundle({
  version,
  hostBytes: extractFile(asarPath, ASAR_MEMBERS.host),
  boxExecDaemonBytes: extractFile(asarPath, ASAR_MEMBERS.boxExecDaemon),
});

const out = path.join(desktopRoot, "dist", "host-bundle");
await mkdir(out, { recursive: true });
const tarballPath = path.join(out, bundle.tarballName);
const versionPath = path.join(out, bundle.versionName);
await writeFile(tarballPath, bundle.tarball);
await writeFile(versionPath, bundle.versionBody);
console.log(`host bundle ${version}: host sha256 ${bundle.hostSha256}`);
console.log(`  ${tarballPath}`);
console.log(`  ${versionPath}`);

const target = process.env.SIMEON_HOST_BUNDLE_S3?.trim().replace(/\/+$/, "");
if (!target) {
  console.log("SIMEON_HOST_BUNDLE_S3 is not set: upload both files to the bundle folder, the .tgz first.");
} else {
  if (!target.startsWith("s3://")) throw new Error(`SIMEON_HOST_BUNDLE_S3 must be an s3:// address, got ${target}`);
  await run("aws", ["s3", "cp", tarballPath, `${target}/${bundle.tarballName}`, "--content-type", "application/gzip"]);
  await run("aws", ["s3", "cp", versionPath, `${target}/${bundle.versionName}`, "--content-type", "text/plain", "--cache-control", "no-cache"]);
  console.log(`published ${version} to ${target}`);
}

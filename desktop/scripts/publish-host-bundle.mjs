#!/usr/bin/env node
// `npm run publish:host-bundle` (29 September 2026): after `npm run package`,
// publishes the packaged app's host program for the cloud computers, in
// The upstream app's layout (scripts/lib/host-bundle-publish.mjs). The server picks
// it up within ten minutes, with no restart, and each cloud computer moves to
// it the next time it is idle.
//
//   SIMEON_HOST_BUNDLE_S3=s3://bucket/prefix npm run publish:host-bundle
//
// A new engine can go to a few accounts first (13 November 2026; the
// accounts are the server's SIMEON_BOX_ENGINE_TRIAL_USERS):
//
//   npm run publish:host-bundle -- --trial             this engine, to those accounts only
//   npm run publish:host-bundle -- --promote           the engine on trial, to everyone
//   npm run publish:host-bundle -- --back-to <commit>  everyone back on an engine published earlier
//
// `--promote` and `--back-to` build and upload nothing: they move the
// pointers, so they take a few seconds and need no packaged app.
//
// Uploads with the `aws` command line when SIMEON_HOST_BUNDLE_S3 is set: the
// bundle first, the pointer last, so the pointer never names a file that is
// not there yet. Without it, the files are written to dist/host-bundle/
// and the upload is left to the person. The version is the commit the app was
// built from; a source tree with uncommitted changes is refused
// (`--allow-dirty` overrides, for a test build only).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractFile } from "@electron/asar";

import {
  ASAR_MEMBERS,
  ENGINE_SOURCE_PATHS,
  HOST_BUNDLE_PREFIX,
  HOST_COMPANIONS,
  LATEST_VERSION_FILE,
  SOURCE_STAMP_SUFFIX,
  TRIAL_VERSION_FILE,
  buildHostBundle,
  publishPlan,
  staleAppReason,
  versionIn,
} from "./lib/host-bundle-publish.mjs";
import { resolvePackagedAppArtifacts } from "./lib/packaged-app.mjs";
import { capture, run } from "./lib/process.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const plan = publishPlan(args);
// Where the files are written before they are uploaded (the tests name a folder of their own).
const out = process.env.SIMEON_HOST_BUNDLE_OUT?.trim() || path.join(desktopRoot, "dist", "host-bundle");
const target = process.env.SIMEON_HOST_BUNDLE_S3?.trim().replace(/\/+$/, "");
if (target && !target.startsWith("s3://")) throw new Error(`SIMEON_HOST_BUNDLE_S3 must be an s3:// address, got ${target}`);

/** The commit a pointer in the folder names now; null when it is not there or names none. */
async function pointed(name) {
  try {
    return versionIn(await capture("aws", ["s3", "cp", `${target}/${name}`, "-"]));
  } catch {
    return null;
  }
}

/** Writes each pointer, locally and in the folder, naming `version`. */
async function point(names, version) {
  await mkdir(out, { recursive: true });
  for (const name of names) {
    const file = path.join(out, name);
    await writeFile(file, `${version}\n`);
    if (target) await run("aws", ["s3", "cp", file, `${target}/${name}`, "--content-type", "text/plain", "--cache-control", "no-cache"]);
  }
}

function sayHowToGoBack(before, version) {
  if (before !== null && before !== version) console.log(`To put everyone back on the engine before it: npm run publish:host-bundle -- --back-to ${before}`);
}

if (plan.action === "promote" || plan.action === "back") {
  if (!target) throw new Error("SIMEON_HOST_BUNDLE_S3 is not set: it names the folder whose pointers are moved.");
  const before = await pointed(LATEST_VERSION_FILE);
  const version = plan.action === "back" ? plan.version : await pointed(TRIAL_VERSION_FILE);
  if (version === null) throw new Error("No engine is on trial: publish one with `npm run publish:host-bundle -- --trial` first.");
  // The engine must be in the folder: a pointer never names a file that is not there.
  try {
    await capture("aws", ["s3", "ls", `${target}/${HOST_BUNDLE_PREFIX}-${version}.tgz`]);
  } catch {
    throw new Error(`No engine ${version} is published in ${target}: nothing was changed.`);
  }
  if (plan.action === "promote" && before === version) {
    console.log(`Everyone already has ${version}: nothing was changed.`);
  } else {
    await point(plan.pointers, version);
    console.log(plan.action === "promote" ? `Everyone now gets ${version}, the engine that was on trial.` : `Everyone, the trial accounts too, is back on ${version}.`);
    console.log("The server reads the pointer every ten minutes; each cloud computer moves when it is next idle.");
    sayHowToGoBack(before, version);
  }
} else {
  const appPath = args.find((arg) => arg.endsWith(".app")) ?? path.join(desktopRoot, "dist", "Simeon.app");

  // `capture` answers the command's output, trimmed.
  const status = await capture("git", ["status", "--porcelain", "--", "source", "scripts", "package.json"], { cwd: desktopRoot });
  if (status !== "" && !plan.allowDirty) {
    throw new Error(`Uncommitted changes in desktop/ would not match the version published:\n${status}\nCommit them, or pass --allow-dirty for a test build.`);
  }
  const version = await capture("git", ["rev-parse", "--short=12", "HEAD"], { cwd: desktopRoot });

  const { asarPath } = resolvePackagedAppArtifacts(appPath);
  // The app must be the one built from these sources, not one left from an earlier build (`staleAppReason`).
  const sourceCommit = await capture("git", ["log", "-1", "--format=%H", "--", ...ENGINE_SOURCE_PATHS], { cwd: desktopRoot });
  const stamp = await readFile(`${path.resolve(appPath)}${SOURCE_STAMP_SUFFIX}`, "utf8").catch(() => "");
  const stale = staleAppReason(stamp, sourceCommit);
  if (stale !== null && !plan.allowDirty) throw new Error(stale);
  const bundle = buildHostBundle({
    version,
    hostBytes: extractFile(asarPath, ASAR_MEMBERS.host),
    boxExecDaemonBytes: extractFile(asarPath, ASAR_MEMBERS.boxExecDaemon),
    // The host's workers, from its folder in the app (HOST_COMPANIONS).
    companions: Object.fromEntries(HOST_COMPANIONS.map((name) => [name, extractFile(asarPath, `dist/host/${name}`)])),
  });

  await mkdir(out, { recursive: true });
  const tarballPath = path.join(out, bundle.tarballName);
  await writeFile(tarballPath, bundle.tarball);
  console.log(`host bundle ${version}: host sha256 ${bundle.hostSha256}`);
  console.log(`  ${tarballPath}`);

  if (!target) {
    await point(plan.pointers, version);
    for (const name of plan.pointers) console.log(`  ${path.join(out, name)}`);
    console.log("SIMEON_HOST_BUNDLE_S3 is not set: upload these files to the bundle folder, the .tgz first.");
  } else {
    const before = await pointed(LATEST_VERSION_FILE);
    await run("aws", ["s3", "cp", tarballPath, `${target}/${bundle.tarballName}`, "--content-type", "application/gzip"]);
    await point(plan.pointers, version);
    if (plan.action === "trial") {
      console.log(`published ${version} to ${target} for the trial accounts only; everyone else keeps ${before ?? "the engine they have"}.`);
      console.log("Once it has run well there, give it to everyone: npm run publish:host-bundle -- --promote");
    } else {
      console.log(`published ${version} to ${target}`);
      sayHowToGoBack(before, version);
    }
  }
}

/**
 * A signed, notarized Mac release of Simeon (5 October 2026).
 *
 *   npm run package:own-shell          → dist/Simeon.app, ad-hoc signed
 *   npm run release:macos              → dist/release/<version>/
 *       Simeon-<version>-darwin-arm64.dmg   the download
 *       Simeon-<version>-darwin-arm64.zip   the update
 *       feed.json, release.json
 *
 * Steps, each one checked:
 *   1. sign every binary inside dist/Simeon.app with the Developer ID
 *      Application certificate, hardened runtime, our entitlements
 *      (`@electron/osx-sign`, inside out), and `codesign --verify`;
 *   2. zip the app and send the zip to Apple (`notarytool submit --wait`,
 *      the credentials stored once under a keychain profile), staple the
 *      ticket to the app, then `spctl --assess` as Gatekeeper will on
 *      another Mac;
 *   3. zip the stapled app again for the updater (Squirrel.Mac wants the
 *      .app at the zip root);
 *   4. a disk image with the app and an Applications link, signed,
 *      notarized and stapled too;
 *   5. feed.json and release.json with the files' sha256 and sizes.
 *
 * Settings (environment):
 *   SIMEON_TEAM_ID         the Apple team id the certificate carries
 *   SIMEON_SIGN_IDENTITY   the full certificate name, when several match
 *   SIMEON_NOTARY_PROFILE  the notarytool keychain profile (simeon-notary)
 *   SIMEON_RELEASE_BASE_URL where the files will be served from
 *                          (https://simeonlabs.com/releases)
 *
 * Nothing here runs anywhere but macOS; the helpers it is built from are
 * tested on Linux (`tests/release-macos.test.mjs`).
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { sign as osxSign } from "@electron/osx-sign";

import { outputApp, outputDir, repoRoot, simeonVersion } from "./lib/config.mjs";
import { capture, run } from "./lib/process.mjs";
import {
  DEFAULT_NOTARY_PROFILE,
  DEFAULT_RELEASE_BASE_URL,
  chooseSigningIdentity,
  codesignDmgArguments,
  dittoZipArguments,
  entitlementsPlist,
  hdiutilCreateArguments,
  isHelperBinary,
  notarytoolSubmitArguments,
  readNotarizationResult,
  releaseFileNames,
  releaseRecord,
  spctlAssessArguments,
  squirrelFeed,
  staplerArguments,
} from "./lib/release-macos.mjs";
import { SYSTEM_TOOLS } from "./lib/system-tools.mjs";

const XCRUN = "/usr/bin/xcrun";
const SPCTL = "/usr/sbin/spctl";
const SECURITY = "/usr/bin/security";

async function fileDigest(filePath) {
  const bytes = await readFile(filePath);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength };
}

async function notarize(filePath, { profile, log }) {
  log(`sending ${path.basename(filePath)} to Apple (notarytool, profile ${profile})`);
  const stdout = await capture(XCRUN, notarytoolSubmitArguments(filePath, { profile }));
  const result = readNotarizationResult(stdout);
  log(`Apple accepted ${path.basename(filePath)} (submission ${result.id})`);
  return result;
}

export async function releaseMacos({
  appPath = outputApp,
  version = simeonVersion,
  arch = process.arch,
  env = process.env,
  log = (line) => console.log(`[release] ${line}`),
} = {}) {
  if (process.platform !== "darwin") throw new Error("A Mac release is signed and notarized on macOS.");
  await stat(appPath).catch(() => { throw new Error(`No app at ${appPath}; run npm run package:own-shell first.`); });

  const profile = env.SIMEON_NOTARY_PROFILE?.trim() || DEFAULT_NOTARY_PROFILE;
  const baseUrl = env.SIMEON_RELEASE_BASE_URL?.trim() || DEFAULT_RELEASE_BASE_URL;
  const teamId = env.SIMEON_TEAM_ID?.trim() || undefined;
  const identity = env.SIMEON_SIGN_IDENTITY?.trim() || chooseSigningIdentity(await capture(SECURITY, ["find-identity", "-v", "-p", "codesigning"]), { teamId });
  log(`signing as "${identity}"`);

  const releaseDir = path.join(outputDir, "release", version);
  const work = path.join(releaseDir, ".work");
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const appEntitlements = path.join(work, "app.entitlements");
  const helperEntitlements = path.join(work, "helper.entitlements");
  await writeFile(appEntitlements, entitlementsPlist());
  await writeFile(helperEntitlements, entitlementsPlist({ helper: true }));

  // 1. Sign, inside out, hardened runtime.
  await run(SYSTEM_TOOLS.xattr, ["-cr", appPath]).catch(() => {});
  await osxSign({
    app: appPath,
    identity,
    platform: "darwin",
    optionsForFile: (filePath) => ({
      hardenedRuntime: true,
      entitlements: isHelperBinary(filePath) ? helperEntitlements : appEntitlements,
    }),
  });
  await run(SYSTEM_TOOLS.codesign, ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  log("signature verified");

  // 2. Notarize the app, staple, assess.
  const names = releaseFileNames(version, arch);
  const notaryZip = path.join(work, "notarize.zip");
  await run(SYSTEM_TOOLS.ditto, dittoZipArguments(appPath, notaryZip));
  const appNotarization = await notarize(notaryZip, { profile, log });
  await run(XCRUN, staplerArguments(appPath));
  await run(SPCTL, spctlAssessArguments(appPath));
  log("Gatekeeper accepts the app");

  // 3. The update zip, from the stapled app.
  const zipPath = path.join(releaseDir, names.zip);
  await run(SYSTEM_TOOLS.ditto, dittoZipArguments(appPath, zipPath));

  // 4. The disk image.
  const staging = path.join(work, "dmg");
  await mkdir(staging, { recursive: true });
  await cp(appPath, path.join(staging, path.basename(appPath)), { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true });
  await symlink("/Applications", path.join(staging, "Applications"));
  const dmgPath = path.join(releaseDir, names.dmg);
  await run(SYSTEM_TOOLS.hdiutil, hdiutilCreateArguments(staging, dmgPath));
  await run(SYSTEM_TOOLS.codesign, codesignDmgArguments(dmgPath, identity));
  const dmgNotarization = await notarize(dmgPath, { profile, log });
  await run(XCRUN, staplerArguments(dmgPath));

  // 5. The records.
  const pubDate = new Date().toISOString();
  const record = releaseRecord({
    version, arch, pubDate, baseUrl,
    dmg: await fileDigest(dmgPath),
    zip: await fileDigest(zipPath),
    notarization: { app: appNotarization.id, dmg: dmgNotarization.id },
  });
  await writeFile(path.join(releaseDir, "release.json"), `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "feed.json"), `${JSON.stringify(squirrelFeed({ version, zipUrl: record.zip.url, pubDate }), null, 2)}\n`);
  await rm(work, { recursive: true, force: true });
  log(`release ${version} in ${path.relative(repoRoot, releaseDir)}: ${names.dmg} (${record.dmg.size} bytes), ${names.zip} (${record.zip.size} bytes)`);
  return { releaseDir, record };
}

const invokedDirectly = process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(repoRoot, "scripts", "release-macos.mjs");
if (invokedDirectly) await releaseMacos();

/**
 * Verify a bundle packaged on Simeon's own Electron shell
 * (`scripts/package-simeon-shell.mjs`; Track D, piece 1).
 *
 *   npm run verify:own-shell                  → dist/Simeon.app
 *   node scripts/verify-own-shell.mjs --app /path/to/Simeon.app
 *
 * What is checked, against the bundle itself and its package record:
 *   - the shell is a stock Electron 42.1.0: the framework's own plist says
 *     so, and no plist in the bundle names the upstream's maker or app;
 *   - the identity: bundle id, name, executable, the four helpers, the
 *     `simeon` URL scheme and no other, LSEnvironment, the Dock icon;
 *   - the asar: every runtime entry the app opens by path, the patch record,
 *     the pinned window exactly as recorded, no source maps, the build
 *     manifest's hashes;
 *   - the unpacked payload: the add-ons the manifest names, built for this
 *     Electron on this platform, and the signer when the record says so;
 *   - the signature (`codesign --verify --deep --strict`).
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { extractFile, listPackage, statFile } from "@electron/asar";

import { outputApp, packagedEnvironment, repoRoot, simeonBundleId, simeonName, simeonUrlScheme, sourceAppDir } from "./lib/config.mjs";
import { ELECTRON_VERSION } from "./lib/electron-runtime.mjs";
import { verifyChecksumPinnedRendererPackage } from "./lib/macos-package-verification.mjs";
import { OWN_SHELL_BUILD_MANIFEST, OWN_SHELL_RECORD, isUnpackedPath, ownShellBundlePaths, verifyOwnShellUnpackedPayload } from "./lib/own-shell.mjs";
import { PREVIOUS_IDENTITY } from "./lib/macos-plist-identity.mjs";
import { capture, run } from "./lib/process.mjs";
import { SYSTEM_TOOLS } from "./lib/system-tools.mjs";
import { APP_ICON_ICNS } from "./make-app-icon.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Every file the app opens by path inside the asar (`production-ipc-contract.ts`, the workers, the daemons). */
export const REQUIRED_ASAR_ENTRIES = Object.freeze([
  "package.json",
  "dist/electron-main/main.cjs",
  "dist/electron-dev-controls/main.cjs",
  "dist/electron-preload/preload.cjs",
  "dist/electron-preload/preload-dev-controls.cjs",
  "dist/electron-preload/preload-webview.cjs",
  "dist/electron-preload/preload-vnc.cjs",
  "dist/electron-preload/preload-voice-call.cjs",
  "dist/voice-call/index.html",
  "dist/voice-call/banner.css",
  "dist/voice-call/banner.js",
  "dist/node-agent-coordinator/main.cjs",
  "dist/host/host-main.cjs",
  "dist/host/agent-isolation/agent-store-worker.cjs",
  "dist/host/agent-isolation/transcript-mirror-worker.cjs",
  "dist/host/extensions/box-store-sync/box-store-vacuum-worker.cjs",
  "dist/host/extensions/content-search/search-index-worker.cjs",
  "dist/local-exec-daemon/main.cjs",
  "dist/box-exec-daemon/main.cjs",
  "dist/renderer/index.html",
  "dist/renderer-router-extension.json",
  "dist/renderer-artifact-provenance.json",
  "dist/simeon-build.json",
  "dist/host-production-bindings.json",
  "dist/electron-main-production-bindings.json",
]);

/** What the plists must not say, anywhere a person or macOS reads them. */
export function plistNamesPreviousMaker(text) {
  return PREVIOUS_IDENTITY.test(text) || /cursor\.(com|sh)|anysphere/i.test(text);
}

async function readPlistJson(file) {
  return JSON.parse(await capture(SYSTEM_TOOLS.plutil, ["-convert", "json", "-o", "-", file]));
}

export async function verifyOwnShellAsar({ asarPath, unpackedRoot, rendererRoot }) {
  // Files only: listPackage also names directories.
  const listing = new Set(listPackage(asarPath).map((entry) => entry.replace(/^\/+/, "")).filter((entry) => {
    try { return typeof statFile(asarPath, entry).size === "number"; } catch { return false; }
  }));
  for (const required of REQUIRED_ASAR_ENTRIES) if (!listing.has(required)) throw new Error(`app.asar is missing ${required}`);
  const maps = [...listing].filter((entry) => entry.startsWith("dist/renderer/") && entry.endsWith(".map"));
  if (maps.length > 0) throw new Error(`The window ships source maps: ${maps.join(", ")}`);
  for (const forbidden of ["dist/recovered-source/", "dist/deps/better-sqlite3/", "dist/reconstruction-build.json", "dist/runtime-composition-audit.json"]) {
    if ([...listing].some((entry) => entry === forbidden || entry.startsWith(forbidden))) throw new Error(`app.asar carries ${forbidden}, which an own-shell build never stages`);
  }
  const packageJson = JSON.parse(extractFile(asarPath, "package.json").toString("utf8"));
  if (packageJson.main !== "dist/electron-main/main.cjs" || typeof packageJson.productName !== "string" || !packageJson.productName.startsWith("Simeon")) throw new Error("app.asar's package.json is not Simeon's own");
  const buildManifest = JSON.parse(extractFile(asarPath, OWN_SHELL_BUILD_MANIFEST).toString("utf8"));
  if (buildManifest.schemaVersion !== 1 || buildManifest.electron !== ELECTRON_VERSION) throw new Error(`${OWN_SHELL_BUILD_MANIFEST} is not an own-shell build manifest for Electron ${ELECTRON_VERSION}`);
  const modes = Object.fromEntries(buildManifest.runtimeComposition.map((runtime) => [runtime.runtime, runtime.mode]));
  for (const runtime of ["electron-main", "host", "node-agent-coordinator", "primary-preload", "box-exec-daemon", "local-exec-daemon"]) {
    if (modes[runtime] !== "clean-source") throw new Error(`${runtime} is ${modes[runtime] ?? "missing"} in the build manifest, not clean-source`);
  }
  if (modes["electron-shell"] !== "electron-release" || modes["electron-runtime-dependencies"] !== "simeon-build") throw new Error("The build manifest does not record a stock Electron shell with our own add-ons");
  if (modes.renderer !== "checksum-pinned-artifact-runtime") throw new Error(`The window is ${modes.renderer}; this path ships the pinned window until Track D piece 2`);
  const manifestPaths = new Set(buildManifest.outputs.map((output) => output.path));
  for (const output of buildManifest.outputs) {
    const bytes = isUnpackedPath(output.path) ? await readFile(path.join(unpackedRoot, output.path)) : extractFile(asarPath, output.path);
    if (bytes.byteLength !== output.bytes || sha256(bytes) !== output.sha256) throw new Error(`Packaged output differs from the build manifest: ${output.path}`);
  }
  for (const entry of listing) {
    if (entry.startsWith("dist/") && entry !== OWN_SHELL_BUILD_MANIFEST && !manifestPaths.has(entry) && !isUnpackedPath(entry)) throw new Error(`app.asar carries ${entry}, which the build manifest does not list`);
  }
  for (const relative of ["dist/electron-main/main.cjs", "dist/host/host-main.cjs", "dist/node-agent-coordinator/main.cjs"]) {
    if (!extractFile(asarPath, relative).toString("utf8").includes("// Deterministic clean-source")) throw new Error(`Runtime did not come from clean source: ${relative}`);
  }
  const renderer = await verifyChecksumPinnedRendererPackage({ archivePath: asarPath, sourceRendererRoot: rendererRoot, buildManifestPath: OWN_SHELL_BUILD_MANIFEST });
  if (renderer.extension == null) throw new Error("The window carries no patch record; the brand pass did not run");
  return { entries: listing.size, packageJson: { productName: packageJson.productName, version: packageJson.version }, renderer: { fileCount: renderer.fileCount, patched: renderer.extension.sha256 } };
}

export async function verifyOwnShellMacIdentity({ appPath, record }) {
  const paths = ownShellBundlePaths(appPath, "darwin");
  const info = await readPlistJson(paths.infoPlist);
  const expectedName = record.app.name;
  const checks = {
    CFBundleIdentifier: record.app.bundleId,
    CFBundleName: expectedName,
    CFBundleDisplayName: expectedName,
    CFBundleExecutable: expectedName,
    CFBundleShortVersionString: record.app.version,
    CFBundleVersion: record.app.version,
  };
  for (const [key, expected] of Object.entries(checks)) {
    if (info[key] !== expected) throw new Error(`Info.plist ${key} is ${JSON.stringify(info[key])}, expected ${JSON.stringify(expected)}`);
  }
  const schemes = (info.CFBundleURLTypes ?? []).flatMap((type) => type.CFBundleURLSchemes ?? []);
  if (!schemes.includes(simeonUrlScheme) || schemes.includes("sand")) throw new Error(`Info.plist URL schemes are ${JSON.stringify(schemes)}`);
  for (const [key, value] of Object.entries(packagedEnvironment)) {
    if (info.LSEnvironment?.[key] !== value) throw new Error(`LSEnvironment.${key} is ${JSON.stringify(info.LSEnvironment?.[key])}, expected ${JSON.stringify(value)}`);
  }
  if (typeof info.NSMicrophoneUsageDescription !== "string" || !info.NSMicrophoneUsageDescription.startsWith("Simeon")) throw new Error("Info.plist has no microphone prompt in Simeon's words");
  await stat(path.join(paths.contents, "MacOS", expectedName));

  const framework = path.join(paths.frameworks, "Electron Framework.framework");
  const frameworkInfo = await readPlistJson(path.join(framework, "Resources", "Info.plist"));
  if (frameworkInfo.CFBundleShortVersionString !== ELECTRON_VERSION && frameworkInfo.CFBundleVersion !== ELECTRON_VERSION) {
    throw new Error(`The shell's Electron Framework is ${frameworkInfo.CFBundleShortVersionString ?? frameworkInfo.CFBundleVersion}, not ${ELECTRON_VERSION}`);
  }
  const helpers = (await readdir(paths.frameworks)).filter((name) => / Helper.*\.app$/.test(name));
  if (helpers.length < 4) throw new Error(`Expected the four Electron helpers, found ${JSON.stringify(helpers)}`);
  const plists = [paths.infoPlist, ...helpers.map((helper) => path.join(paths.frameworks, helper, "Contents", "Info.plist"))];
  for (const helper of helpers) {
    if (!helper.startsWith(`${expectedName} Helper`)) throw new Error(`Helper bundle is not Simeon's: ${helper}`);
    const helperExecutable = helper.slice(0, -".app".length);
    await stat(path.join(paths.frameworks, helper, "Contents", "MacOS", helperExecutable));
    const helperInfo = await readPlistJson(plists[plists.length - helpers.length + helpers.indexOf(helper)]);
    if (!String(helperInfo.CFBundleIdentifier).startsWith(record.app.bundleId)) throw new Error(`${helper} carries bundle id ${helperInfo.CFBundleIdentifier}`);
  }
  for (const plist of plists) {
    const text = await capture(SYSTEM_TOOLS.plutil, ["-convert", "xml1", "-o", "-", plist]);
    if (plistNamesPreviousMaker(text)) throw new Error(`${path.relative(appPath, plist)} still names the upstream's maker or app`);
  }
  const dockIcon = await readFile(APP_ICON_ICNS);
  const icns = (await readdir(paths.resources)).filter((name) => name.endsWith(".icns"));
  if (icns.length === 0) throw new Error("The bundle carries no .icns icon");
  for (const name of icns) {
    if (sha256(await readFile(path.join(paths.resources, name))) !== sha256(dockIcon)) throw new Error(`Dock icon ${name} is not brand/Simeon.icns`);
  }
  if (info.CFBundleIconName != null) {
    // The packager writes CFBundleIconName only for an Icon Composer icon, which we do not use.
    throw new Error("Info.plist names an asset catalogue icon; the Dock would not read icon.icns");
  }
  await run(SYSTEM_TOOLS.codesign, ["--verify", "--deep", "--strict", appPath]);
  return { helpers, electron: frameworkInfo.CFBundleShortVersionString ?? frameworkInfo.CFBundleVersion, plists: plists.length };
}

export async function verifyOwnShellPackage({ appPath, platform = process.platform === "darwin" ? "darwin" : "linux", arch = process.arch, rendererRoot = path.join(sourceAppDir, "dist", "renderer"), log = () => {} } = {}) {
  const paths = ownShellBundlePaths(appPath, platform);
  const record = JSON.parse(await readFile(paths.record, "utf8"));
  if (record.schemaVersion !== 1 || record.electron?.version !== ELECTRON_VERSION) throw new Error(`${OWN_SHELL_RECORD} is not a Simeon own-shell record for Electron ${ELECTRON_VERSION}`);
  if (record.electron.platform !== platform || record.electron.arch !== arch) throw new Error(`The record says ${record.electron.platform}-${record.electron.arch}, this check is for ${platform}-${arch}`);
  const asarBytes = await readFile(paths.asar);
  if (sha256(asarBytes) !== record.asar.sha256) throw new Error("app.asar differs from the package record");
  const asar = await verifyOwnShellAsar({ asarPath: paths.asar, unpackedRoot: paths.unpacked, rendererRoot });
  const payload = await verifyOwnShellUnpackedPayload({ unpackedRoot: paths.unpacked, platform, arch, signerExpected: record.signer?.present === true });
  let identity = null;
  if (platform === "darwin") identity = await verifyOwnShellMacIdentity({ appPath, record });
  log(`verified ${appPath}: asar ${asar.entries} entries, window ${asar.renderer.fileCount} files, add-ons ${payload.nodeFiles.length}, signer ${payload.signerPresent ? "present" : "absent"}${identity ? `, Electron ${identity.electron}, ${identity.helpers.length} helpers` : ""}`);
  return { record, asar, payload, helpers: identity?.helpers ?? null, electron: identity?.electron ?? record.electron.version };
}

function readAppArgument(argv) {
  const index = argv.indexOf("--app");
  if (index === -1) return outputApp;
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error("Usage: node scripts/verify-own-shell.mjs [--app /absolute/path/to/App.app]");
  return path.resolve(value);
}

const invokedDirectly = process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(repoRoot, "scripts", "verify-own-shell.mjs");
if (invokedDirectly) {
  const result = await verifyOwnShellPackage({ appPath: readAppArgument(process.argv.slice(2)), log: (line) => console.log(`[own-shell] ${line}`) });
  console.log(`Verified ${simeonName} ${result.record.app.version} on Electron ${result.electron} (${simeonBundleId}).`);
}

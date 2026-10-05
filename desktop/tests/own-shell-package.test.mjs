import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ELECTRON_ABI,
  ELECTRON_NATIVE_DEPENDENCIES,
  ELECTRON_NATIVE_NODE_FILES,
  ELECTRON_NATIVE_PACKAGES,
  ELECTRON_VERSION,
  RUNTIME_DEPS_MANIFEST,
  assertElectronHeaders,
  electronNodeGypEnvironment,
  parseNodeVersionHeader,
  stageElectronRuntimeDependencies,
} from "../scripts/lib/electron-runtime.mjs";
import {
  APP_CATEGORY,
  OWN_SHELL_RECORD,
  WEBAUTHN_SIGNER,
  ownShellBundlePaths,
  ownShellPackageJson,
  ownShellPackageRecord,
  ownShellPackagerOptions,
  ownShellPackagerOutput,
  ownShellPlistExtension,
  verifyOwnShellUnpackedPayload,
} from "../scripts/lib/own-shell.mjs";
import { REQUIRED_ASAR_ENTRIES, plistNamesPreviousMaker } from "../scripts/verify-own-shell.mjs";

// Track D, piece 1 (5 October 2026): Simeon packaged on its own Electron
// shell. Offline: the package.json and plist the bundle carries, the
// packager's options, the add-on manifest and its staging, and what the
// verification refuses. The bundle itself is checked by
// scripts/verify-own-shell.mjs on the machine that built it.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the Electron triple is one thing: version 42.1.0, ABI 146, Node 24.15", () => {
  assert.equal(ELECTRON_VERSION, "42.1.0");
  assert.equal(ELECTRON_ABI, "146");
  const header = "#define NODE_MAJOR_VERSION 24\n#define NODE_MINOR_VERSION 15\n#define NODE_PATCH_VERSION 0\n#define NODE_MODULE_VERSION 146\n";
  assert.deepEqual(parseNodeVersionHeader(header), { modules: 146, major: 24, minor: 15 });
  assert.deepEqual(assertElectronHeaders(header), { modules: 146, major: 24, minor: 15 });
  assert.throws(() => assertElectronHeaders(header.replace("146", "137")), /NODE_MODULE_VERSION 137, not 146/);
  assert.throws(() => assertElectronHeaders(header.replace("MINOR_VERSION 15", "MINOR_VERSION 2")), /Node 24\.2, not 24\.15/);
  assert.throws(() => parseNodeVersionHeader("nothing"), /does not declare/);
  const env = electronNodeGypEnvironment({ PATH: "/usr/bin", npm_config_nodedir: "/elsewhere", npm_config_build_from_source: "true" });
  assert.deepEqual(env, { PATH: "/usr/bin", npm_config_runtime: "electron", npm_config_target: "42.1.0", npm_config_disturl: "https://artifacts.electronjs.org/headers/dist" });
  // The same version the dev app runs on and the old build script pins.
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.devDependencies.electron, ELECTRON_VERSION);
  assert.equal(packageJson.devDependencies["@electron/packager"], "20.3.0");
  assert.equal(packageJson.scripts["package:own-shell"], "npm run check && node scripts/package-simeon-shell.mjs");
  assert.equal(packageJson.scripts["verify:own-shell"], "node scripts/verify-own-shell.mjs");
});

test("the bundle's package.json and plist are Simeon's own", () => {
  const packageJson = ownShellPackageJson({ name: "Simeon", version: "0.1.0" });
  assert.deepEqual(packageJson, { name: "simeon", productName: "Simeon", version: "0.1.0", description: "Simeon desktop agent", author: "Simeon Labs", homepage: "https://simeonlabs.com", private: true, main: "dist/electron-main/main.cjs" });
  assert.deepEqual(ownShellPackageJson({ name: "Simeon", version: "0.1.0", dev: true }).sandLab, true);
  assert.equal(ownShellPackageJson({ name: "Simeon", version: "0.1.0", dev: true }).productName, "Simeon Dev");
  const plist = ownShellPlistExtension({ environment: { SAND_BACKEND_URL: "https://api.simeonlabs.com" }, year: 2026 });
  assert.equal(plist.NSHumanReadableCopyright, "Copyright © 2026 SimeonLabs, Inc. All rights reserved.");
  assert.match(plist.NSMicrophoneUsageDescription, /^Simeon uses the microphone/);
  assert.match(plist.NSCameraUsageDescription, /^Simeon uses the camera/);
  assert.deepEqual(plist.LSEnvironment, { MallocNanoZone: "0", SAND_BACKEND_URL: "https://api.simeonlabs.com" }, "Electron's own entry stays beside ours");
  // What the upstream shell's plist carried (read on the founder's Mac, 5 October 2026), in our words.
  for (const key of ["NSAudioCaptureUsageDescription", "NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription"]) assert.match(plist[key], /^Simeon /, key);
  assert.equal(plist.LSMinimumSystemVersion, "12.0");
  assert.equal(plist.NSRequiresAquaSystemAppearance, false);
  assert.equal(plist.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
  assert.deepEqual(Object.keys(plist.NSAppTransportSecurity.NSExceptionDomains), ["127.0.0.1", "localhost"]);
  for (const value of Object.values(plist)) if (typeof value === "string") assert.equal(plistNamesPreviousMaker(value), false, value);
  assert.equal(plistNamesPreviousMaker("<string>Grok Bot Helper</string>"), true);
  assert.equal(plistNamesPreviousMaker("<string>https://cursor.com/x</string>"), true);
  assert.equal(plistNamesPreviousMaker("<string>Simeon Helper (GPU)</string>"), false);
});

test("the packager is told to wrap our prebuilt asar in a stock Electron with Simeon's identity", () => {
  const options = ownShellPackagerOptions({ stageRoot: "/b/app", asarPath: "/b/app.asar", outDir: "/b/out", icon: "/brand/Simeon.icns", name: "Simeon", bundleId: "com.simeonlabs.simeon", version: "0.1.0", urlScheme: "simeon", environment: { SIMEON_API_BASE_URL: "https://api.simeonlabs.com" } });
  assert.equal(options.prebuiltAsar, "/b/app.asar");
  assert.equal(options.dir, "/b/app");
  assert.equal(options.electronVersion, "42.1.0");
  assert.deepEqual([options.platform, options.arch], ["darwin", "arm64"]);
  assert.deepEqual([options.name, options.executableName, options.appBundleId, options.appVersion, options.buildVersion], ["Simeon", "Simeon", "com.simeonlabs.simeon", "0.1.0", "0.1.0"]);
  assert.deepEqual(options.protocols, [{ name: "Simeon auth callback", schemes: ["simeon"] }]);
  assert.equal(options.appCategoryType, APP_CATEGORY);
  assert.equal(options.icon, "/brand/Simeon.icns");
  assert.equal(options.extendInfo.LSEnvironment.SIMEON_API_BASE_URL, "https://api.simeonlabs.com");
  assert.equal(options.osxSign, undefined, "signed by codesign.mjs afterwards, ad hoc until Track E");
  assert.equal(options.electronZipDir, undefined);
  const dev = ownShellPackagerOptions({ stageRoot: "/b/app", asarPath: "/b/app.asar", outDir: "/b/out", icon: "/i.icns", bundleId: "com.simeonlabs.simeon", dev: true, electronZipDir: "/zips" });
  assert.deepEqual([dev.name, dev.appBundleId, dev.electronZipDir], ["Simeon Dev", "com.simeonlabs.simeon.dev", "/zips"]);
  assert.throws(() => ownShellPackagerOptions({ stageRoot: "/b/app", asarPath: "/b/app.asar", outDir: "/b/out" }), /needs icon/);
  assert.equal(ownShellPackagerOutput({ outDir: "/b/out", name: "Simeon" }), "/b/out/Simeon-darwin-arm64/Simeon.app");
  assert.equal(ownShellPackagerOutput({ outDir: "/b/out", name: "Simeon", platform: "linux", arch: "x64" }), "/b/out/Simeon-linux-x64", "on Linux the packager's folder is the bundle");
  const mac = ownShellBundlePaths("/Applications/Simeon.app");
  assert.equal(mac.asar, "/Applications/Simeon.app/Contents/Resources/app.asar");
  assert.equal(mac.unpacked, "/Applications/Simeon.app/Contents/Resources/app.asar.unpacked");
  assert.equal(mac.record, `/Applications/Simeon.app/Contents/Resources/${OWN_SHELL_RECORD}`);
  assert.equal(ownShellBundlePaths("/opt/Simeon", "linux").asar, "/opt/Simeon/resources/app.asar");
});

test("the add-ons are staged with their manifest, and the payload check reads that manifest", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-own-shell-"));
  try {
    // A pretend build cache: the two add-ons' binaries and the two packages they resolve.
    const cacheRoot = path.join(temporary, "cache");
    for (const packageName of [...ELECTRON_NATIVE_PACKAGES, ...ELECTRON_NATIVE_DEPENDENCIES]) {
      await mkdir(path.join(cacheRoot, packageName), { recursive: true });
      await writeFile(path.join(cacheRoot, packageName, "package.json"), JSON.stringify({ name: packageName, version: "9.9.9" }));
      await writeFile(path.join(cacheRoot, packageName, "index.js"), "module.exports = {};\n");
    }
    for (const relative of ELECTRON_NATIVE_NODE_FILES) {
      await mkdir(path.dirname(path.join(cacheRoot, relative)), { recursive: true });
      await writeFile(path.join(cacheRoot, relative), Buffer.from("not really a Mach-O"));
    }
    const outputRoot = path.join(temporary, "stage");
    const manifest = await stageElectronRuntimeDependencies({ outputRoot, platform: "darwin", arch: "arm64", cacheRoot });
    assert.equal(manifest.origin, "simeon-build");
    assert.deepEqual([manifest.electron, manifest.modules, manifest.platform, manifest.arch], ["42.1.0", 146, "darwin", "arm64"]);
    assert.deepEqual(manifest.nodeFiles, [...ELECTRON_NATIVE_NODE_FILES]);
    assert.deepEqual(manifest.packages.map((p) => p.name), ["tree-sitter", "tree-sitter-bash", "node-addon-api", "node-gyp-build"]);
    assert.deepEqual(manifest.resolutionClosure.packages.map((p) => p.destination), ["node_modules/node-addon-api", "node_modules/node-gyp-build"]);
    const written = JSON.parse(await readFile(path.join(outputRoot, "dist", "deps", RUNTIME_DEPS_MANIFEST), "utf8"));
    assert.deepEqual(written, manifest);
    for (const relative of ELECTRON_NATIVE_NODE_FILES) assert.ok((await stat(path.join(outputRoot, "dist", "deps", relative))).isFile(), relative);
    assert.ok((await stat(path.join(outputRoot, "dist", "deps", "node_modules", "node-gyp-build", "package.json"))).isFile());

    // The payload check: the manifest's platform, the files it names, the signer when expected.
    const payload = await verifyOwnShellUnpackedPayload({ unpackedRoot: outputRoot, platform: "darwin", arch: "arm64", signerExpected: false });
    assert.deepEqual(payload.nodeFiles, [...ELECTRON_NATIVE_NODE_FILES]);
    assert.equal(payload.signerPresent, false);
    await assert.rejects(verifyOwnShellUnpackedPayload({ unpackedRoot: outputRoot, platform: "linux", arch: "x64", signerExpected: false }), /built for darwin-arm64, not linux-x64/);
    await assert.rejects(verifyOwnShellUnpackedPayload({ unpackedRoot: outputRoot, platform: "darwin", arch: "arm64", signerExpected: true }), new RegExp(`${WEBAUTHN_SIGNER} is missing`));
    await mkdir(path.join(outputRoot, "dist", "native"), { recursive: true });
    await writeFile(path.join(outputRoot, "dist", "native", WEBAUTHN_SIGNER), "signer");
    assert.equal((await verifyOwnShellUnpackedPayload({ unpackedRoot: outputRoot, platform: "darwin", arch: "arm64", signerExpected: true })).signerPresent, true);
    await rm(path.join(outputRoot, "dist", "deps", ELECTRON_NATIVE_NODE_FILES[1]));
    await assert.rejects(verifyOwnShellUnpackedPayload({ unpackedRoot: outputRoot, platform: "darwin", arch: "arm64", signerExpected: true }), /Add-on missing from the bundle/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("the package record says what the bundle was built from", () => {
  const record = ownShellPackageRecord({ platform: "darwin", arch: "arm64", asarSha256: "a".repeat(64), staged: { renderer: { files: 7 }, deps: { nodeFiles: ["x.node"], packages: [] }, signer: { present: true, origin: "upstream-0.18.0", sha256: "b".repeat(64), bytes: 10 } }, name: "Simeon", version: "0.1.0", bundleId: "com.simeonlabs.simeon" });
  assert.equal(record.schemaVersion, 1);
  assert.deepEqual(record.app, { name: "Simeon", version: "0.1.0", bundleId: "com.simeonlabs.simeon", dev: undefined });
  assert.deepEqual(record.electron, { version: "42.1.0", origin: "electron release", platform: "darwin", arch: "arm64" });
  assert.equal(record.window.origin, "pinned-0.18.0-renderer-patched");
  assert.equal(record.signer.present, true);
  assert.match(record.builtAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("every file the app opens by path inside its bundle is a required asar entry", async () => {
  const contract = await readFile(path.join(repoRoot, "source/electron-main/production-ipc-contract.ts"), "utf8");
  const layout = /ELECTRON_PRODUCTION_RESOURCE_LAYOUT = \{([\s\S]*?)\} as const;/.exec(contract)[1];
  const paths = [...layout.matchAll(/"(dist\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(paths.length >= 9, "the layout names the runtime files");
  for (const relative of paths) {
    // The dev capability preload is written at runtime for a development session only (dev/dev-capability.ts).
    if (relative.endsWith("preload-sand-dev.cjs")) continue;
    assert.ok(REQUIRED_ASAR_ENTRIES.includes(relative), `${relative} is in REQUIRED_ASAR_ENTRIES`);
  }
  for (const relative of ["dist/host/host-main.cjs", "dist/box-exec-daemon/main.cjs", "dist/local-exec-daemon/main.cjs", "dist/renderer-router-extension.json", "dist/simeon-build.json"]) assert.ok(REQUIRED_ASAR_ENTRIES.includes(relative), relative);
});

test("the own-shell package script never reads the upstream shell, its asar or its plists", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/package-simeon-shell.mjs"), "utf8");
  const own = await readFile(path.join(repoRoot, "scripts/lib/own-shell.mjs"), "utf8");
  for (const forbidden of ["verifyOfficialMacReference", "renameMacBundleIdentity", "plistIdentityRewrites", "ElectronAsarIntegrity", "CFBundleIconName", "SYSTEM_TOOLS.ditto", "Contents/MacOS/Grok", "buildFidelityReconstructedAsar"]) {
    assert.equal(script.includes(forbidden), false, `${forbidden} belongs to the old path`);
  }
  assert.match(script, /import \{ packager \} from "@electron\/packager"/);
  assert.match(script, /buildFidelityDistribution\(\{ outputRoot: cleanOutputRoot \}\)/);
  assert.match(script, /finishOwnShellStage\(/);
  assert.match(script, /packStagedAppWithIntegrity\(\{ stageRoot, archivePath: asarPath, unpackedRoot \}\)/);
  assert.match(script, /copyUnpackedBesideAsar\(/);
  assert.match(script, /signAppBundleAdHoc\(finalApp\)/);
  assert.match(script, /verifyOwnShellPackage\(\{ appPath: finalApp/);
  // The signer is the one thing still taken from the upstream app, and only when it is there.
  assert.match(script, /resolveRuntimeApp\(\)/);
  assert.match(script, /no upstream app for the signer/);
  // The copies keep a framework's links as links: codesign refuses absolute ones (measured on the founder's Mac).
  assert.match(script, /await cp\(built, finalApp, \{ recursive: true, dereference: false, verbatimSymlinks: true/);
  assert.match(own, /NATIVE_HELPERS = Object\.freeze\(\[WEBAUTHN_SIGNER, ONEPASSWORD_LAUNCHER\]\)/);
  assert.match(own, /Run npm run bootstrap: until the window is Simeon's own/);
});

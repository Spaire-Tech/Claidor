/**
 * Simeon on its own Electron shell (Track D, piece 1, 5 October 2026).
 *
 * `scripts/package-macos.mjs` copies the upstream app whole and swaps our
 * parts into it. This path builds the bundle from the other direction: a
 * staging folder that holds only what we build (the main process, the host,
 * the coordinator, the preloads, the workers, the daemons, the voice-call
 * page), the pinned window (still the upstream's compiled renderer, patched,
 * until the window is ours, Track D piece 2), the native add-ons we compile
 * for Electron (`electron-runtime.mjs`), and the WebAuthn signer (still
 * copied from the upstream app until piece 4). `@electron/packager` then lays
 * out a stock Electron 42.1.0 around that: the executable, the four helpers,
 * the plists, the icon and the URL scheme all carry Simeon's names from the
 * start, so nothing is renamed after the fact.
 *
 * What this path does not need: the upstream app's shell, its `app.asar`,
 * its native payload, its plists. What it still needs: the pinned window and
 * the signer, both read from the bootstrap output when present.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { applyOriginalRendererRouterPatch } from "./router-renderer-patch.mjs";
import { packagedEnvironment, repoRoot, simeonBundleId, simeonName, simeonUrlScheme, simeonVersion } from "./config.mjs";
import { ELECTRON_VERSION, RUNTIME_DEPS_MANIFEST, stageElectronRuntimeDependencies } from "./electron-runtime.mjs";

export const OWN_SHELL_RECORD = "simeon-package.json";
/** The build manifest inside the asar: the composition and every output's hash. */
export const OWN_SHELL_BUILD_MANIFEST = "dist/simeon-build.json";
/** Folders the asar keeps unpacked beside it (`asar-integrity.mjs`). */
export const UNPACKED_PREFIXES = Object.freeze(["dist/deps/", "dist/native/", "dist/node-deps/"]);
export const WEBAUTHN_SIGNER = "sand-webauthn-signer";
export const APP_CATEGORY = "public.app-category.productivity";
export const COPYRIGHT_YEAR = 2026;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

/**
 * The app's own package.json, in place of the upstream's: Electron reads
 * `productName` for app.name (the menu, About, the user-data folder) and
 * `version` for app.getVersion(); the main process reads `version` and
 * `sandLab` (`main-production-services.ts`, `readElectronProductionMetadata`).
 */
export function ownShellPackageJson({ name = simeonName, version = simeonVersion, dev = false } = {}) {
  return {
    name: "simeon",
    productName: dev ? "Simeon Dev" : name,
    version,
    description: "Simeon desktop agent",
    author: "Simeon Labs",
    homepage: "https://simeonlabs.com",
    private: true,
    main: "dist/electron-main/main.cjs",
    ...(dev ? { sandLab: true } : {}),
  };
}

/**
 * What goes into Info.plist beyond what the packager writes from its options
 * (name, bundle id, version, copyright, category, icon, URL scheme). The
 * permission prompts macOS shows in Simeon's words; the backend the bundle
 * carries (a bundle launched from Finder inherits no shell environment).
 */
export function ownShellPlistExtension({ environment = packagedEnvironment, year = COPYRIGHT_YEAR } = {}) {
  return {
    NSHumanReadableCopyright: `Copyright © ${year} SimeonLabs, Inc. All rights reserved.`,
    NSMicrophoneUsageDescription: "Simeon uses the microphone to take your dictation and for voice calls with your agents.",
    NSCameraUsageDescription: "Simeon uses the camera for video calls with your agents.",
    NSHighResolutionCapable: true,
    LSEnvironment: { ...environment },
  };
}

/** The packager's options for one platform and architecture. */
export function ownShellPackagerOptions({
  stageRoot,
  asarPath,
  outDir,
  platform = "darwin",
  arch = "arm64",
  electronZipDir = process.env.SIMEON_ELECTRON_ZIP_DIR?.trim() || undefined,
  name = simeonName,
  bundleId = simeonBundleId,
  version = simeonVersion,
  urlScheme = simeonUrlScheme,
  icon,
  environment = packagedEnvironment,
  dev = false,
} = {}) {
  for (const [label, value] of Object.entries({ stageRoot, asarPath, outDir, icon })) {
    if (typeof value !== "string" || value.length === 0) throw new TypeError(`ownShellPackagerOptions needs ${label}`);
  }
  return {
    dir: stageRoot,
    prebuiltAsar: asarPath,
    out: outDir,
    overwrite: true,
    name: dev ? "Simeon Dev" : name,
    executableName: dev ? "Simeon Dev" : name,
    appBundleId: dev ? `${bundleId}.dev` : bundleId,
    appVersion: version,
    buildVersion: version,
    appCopyright: ownShellPlistExtension({ environment }).NSHumanReadableCopyright,
    appCategoryType: APP_CATEGORY,
    electronVersion: ELECTRON_VERSION,
    platform,
    arch,
    icon,
    protocols: [{ name: "Simeon auth callback", schemes: [urlScheme] }],
    extendInfo: ownShellPlistExtension({ environment }),
    ...(electronZipDir ? { electronZipDir } : {}),
    // Signed by scripts/lib/codesign.mjs afterwards, ad hoc until Track E.
    osxSign: undefined,
    osxNotarize: undefined,
    quiet: true,
  };
}

/** The bundle's inner paths, by platform. */
export function ownShellBundlePaths(appPath, platform = "darwin") {
  if (platform === "darwin") {
    const contents = path.join(appPath, "Contents");
    const resources = path.join(contents, "Resources");
    return { contents, resources, infoPlist: path.join(contents, "Info.plist"), frameworks: path.join(contents, "Frameworks"), asar: path.join(resources, "app.asar"), unpacked: path.join(resources, "app.asar.unpacked"), record: path.join(resources, OWN_SHELL_RECORD) };
  }
  const resources = path.join(appPath, "resources");
  return { contents: appPath, resources, infoPlist: null, frameworks: null, asar: path.join(resources, "app.asar"), unpacked: path.join(resources, "app.asar.unpacked"), record: path.join(resources, OWN_SHELL_RECORD) };
}

/**
 * Where the packager puts the bundle for a platform and architecture: on
 * macOS the .app inside the output folder it returns; on Linux that folder
 * itself (the executable and `resources/` sit directly in it).
 */
export function ownShellPackagerOutput({ outDir, name = simeonName, platform = "darwin", arch = "arm64", dev = false }) {
  const appName = dev ? "Simeon Dev" : name;
  const folder = path.join(outDir, `${appName}-${platform}-${arch}`);
  return platform === "darwin" ? path.join(folder, `${appName}.app`) : folder;
}

/**
 * Finishes the staging folder after the clean distribution has been laid
 * into it: the app's package.json, the pinned window with the brand and
 * settings patch applied, the Electron add-ons, the signer. Returns what was
 * staged, for the package record.
 */
export async function finishOwnShellStage({ stageRoot, rendererRoot, signerPath = null, platform = process.platform, arch = process.arch, dev = false, log = () => {} } = {}) {
  if (typeof stageRoot !== "string" || stageRoot.length === 0) throw new TypeError("finishOwnShellStage requires stageRoot");
  if (typeof rendererRoot !== "string" || !(await exists(path.join(rendererRoot, "index.html")))) {
    throw new Error(`The pinned window is not at ${rendererRoot}. Run npm run bootstrap: until the window is Simeon's own (Track D, piece 2), the package carries the pinned 0.18.0 renderer.`);
  }
  await writeFile(path.join(stageRoot, "package.json"), `${JSON.stringify(ownShellPackageJson({ dev }), null, 2)}\n`);

  const renderer = path.join(stageRoot, "dist", "renderer");
  await rm(renderer, { recursive: true, force: true });
  await cp(rendererRoot, renderer, { recursive: true, dereference: false, preserveTimestamps: true });
  const patch = await applyOriginalRendererRouterPatch({ stageRoot });

  const deps = await stageElectronRuntimeDependencies({ outputRoot: stageRoot, platform, arch, log });

  const nativeDir = path.join(stageRoot, "dist", "native");
  await rm(nativeDir, { recursive: true, force: true });
  await mkdir(nativeDir, { recursive: true });
  let signer = { present: false, reason: "no upstream app on this machine; passkeys need the signer (Track D, piece 4 rewrites it)" };
  if (signerPath != null && await exists(signerPath)) {
    const bytes = await readFile(signerPath);
    await writeFile(path.join(nativeDir, WEBAUTHN_SIGNER), bytes, { mode: 0o755 });
    signer = { present: true, origin: "upstream-0.18.0", sha256: sha256(bytes), bytes: bytes.byteLength };
  } else {
    log(`warning: ${WEBAUTHN_SIGNER} is not staged (${signer.reason}); sign-in with a passkey will not work in this build`);
  }

  // Nothing the upstream asar carried leaks in: the staging folder is ours.
  for (const relative of ["dist/recovered-source", "dist/reconstruction-build.json"]) await rm(path.join(stageRoot, relative), { recursive: true, force: true });
  return { renderer: { files: patch?.files?.length ?? patch?.record?.files?.length ?? null }, deps: { nodeFiles: deps.nodeFiles, packages: deps.packages }, signer };
}

/** The `app.asar.unpacked` folder the packager does not copy for a prebuilt asar. */
export async function copyUnpackedBesideAsar({ unpackedRoot, appPath, platform = "darwin" }) {
  const paths = ownShellBundlePaths(appPath, platform);
  await rm(paths.unpacked, { recursive: true, force: true });
  await cp(unpackedRoot, paths.unpacked, { recursive: true, dereference: false, preserveTimestamps: true });
  return paths.unpacked;
}

async function walkFiles(root, current = root) {
  const found = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) found.push(...await walkFiles(root, target));
    else if (entry.isFile()) found.push(path.relative(root, target).split(path.sep).join("/"));
  }
  return found.sort();
}

/**
 * Checks the unpacked payload the bundle carries against its own manifest:
 * every add-on the manifest names is a regular file, and the manifest says
 * Electron 42.1.0 on this platform and architecture.
 */
export async function verifyOwnShellUnpackedPayload({ unpackedRoot, platform, arch, signerExpected }) {
  const manifestPath = path.join(unpackedRoot, "dist", "deps", RUNTIME_DEPS_MANIFEST);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.origin !== "simeon-build" || manifest.electron !== ELECTRON_VERSION) throw new Error(`The unpacked payload's manifest is not Simeon's build for Electron ${ELECTRON_VERSION}`);
  if (manifest.platform !== platform || manifest.arch !== arch) throw new Error(`The add-ons were built for ${manifest.platform}-${manifest.arch}, not ${platform}-${arch}`);
  if (!Array.isArray(manifest.nodeFiles) || manifest.nodeFiles.length === 0) throw new Error("The add-on manifest names no native files");
  for (const relative of manifest.nodeFiles) {
    const target = path.join(unpackedRoot, "dist", "deps", relative);
    const info = await stat(target).catch(() => null);
    if (info == null || !info.isFile()) throw new Error(`Add-on missing from the bundle: ${relative}`);
  }
  const signerPath = path.join(unpackedRoot, "dist", "native", WEBAUTHN_SIGNER);
  const signerPresent = await exists(signerPath);
  if (signerExpected && !signerPresent) throw new Error(`${WEBAUTHN_SIGNER} is missing from the bundle`);
  const files = await walkFiles(unpackedRoot);
  return { nodeFiles: manifest.nodeFiles, signerPresent, fileCount: files.length };
}

/**
 * The runtime composition the build manifest records: the base
 * distribution's entries with the main process and the host as ignited
 * clean source, and the three runtime boundaries that were the upstream's
 * replaced by what this path ships.
 */
export function ownShellComposition(baseComposition, { hostProvenancePath, electronMainProvenancePath, signerPresent }) {
  const replaced = new Map([
    ["electron-main", { runtime: "electron-main", path: "dist/electron-main/main.cjs", mode: "clean-source", source: "source/electron-main/main.ts", bindingManifest: electronMainProvenancePath }],
    ["host", { runtime: "host", path: "dist/host/host-main.cjs", mode: "clean-source", source: "source/host/main.ts", bindingManifest: hostProvenancePath }],
    ["electron-runtime-dependencies", { runtime: "electron-runtime-dependencies", path: "dist/deps", mode: "simeon-build", reason: `tree-sitter and tree-sitter-bash compiled for Electron ${ELECTRON_VERSION} (scripts/lib/electron-runtime.mjs).` }],
    ["electron-runtime-resolution-closure", { runtime: "electron-runtime-resolution-closure", path: "dist/deps/node_modules", mode: "simeon-build", provenance: `dist/deps/${RUNTIME_DEPS_MANIFEST}`, reason: "node-addon-api and node-gyp-build beside the add-ons, for their own resolution." }],
    ["native-runtime-tools", { runtime: "native-runtime-tools", path: "dist/native", mode: signerPresent ? "upstream-signer-until-track-d-piece-4" : "absent", reason: signerPresent ? "The WebAuthn signer is still the upstream app's binary; Track D piece 4 rewrites it." : "No signer on the building machine; passkeys do not work in this build." }],
    ["electron-shell", { runtime: "electron-shell", path: "Contents/Frameworks/Electron Framework.framework", mode: "electron-release", reason: `A stock Electron ${ELECTRON_VERSION} from Electron's release, laid out by @electron/packager.` }],
  ]);
  const seen = new Set();
  const composition = baseComposition.map((runtime) => { seen.add(runtime.runtime); return replaced.get(runtime.runtime) ?? runtime; });
  for (const [name, entry] of replaced) if (!seen.has(name)) composition.push(entry);
  return composition;
}

export function isUnpackedPath(relative) {
  return UNPACKED_PREFIXES.some((prefix) => relative.startsWith(prefix));
}

/** Every file under `<stageRoot>/dist`, hashed, for the build manifest. */
export async function stageOutputs(stageRoot) {
  const outputs = [];
  for (const relative of await walkFiles(path.join(stageRoot, "dist"))) {
    const target = path.join(stageRoot, "dist", relative);
    const bytes = await readFile(target);
    outputs.push({ path: `dist/${relative}`, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return outputs;
}

export async function writeOwnShellBuildManifest({ stageRoot, composition, platform, arch }) {
  const outputs = (await stageOutputs(stageRoot)).filter((output) => output.path !== OWN_SHELL_BUILD_MANIFEST);
  const manifest = { schemaVersion: 1, builder: "scripts/package-simeon-shell.mjs", electron: ELECTRON_VERSION, platform, arch, runtimeComposition: composition, outputs };
  await writeFile(path.join(stageRoot, OWN_SHELL_BUILD_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** The record written beside the asar: what the bundle was built from, for `verify-own-shell` and for people. */
export function ownShellPackageRecord({ platform, arch, asarSha256, staged, dev, name = simeonName, version = simeonVersion, bundleId = simeonBundleId }) {
  return {
    schemaVersion: 1,
    builder: "scripts/package-simeon-shell.mjs",
    builtAt: new Date().toISOString(),
    app: { name: dev ? "Simeon Dev" : name, version, bundleId: dev ? `${bundleId}.dev` : bundleId, dev },
    electron: { version: ELECTRON_VERSION, origin: "electron release", platform, arch },
    asar: { sha256: asarSha256 },
    window: { origin: "pinned-0.18.0-renderer-patched", ...(staged.renderer ?? {}) },
    deps: staged.deps,
    signer: staged.signer,
  };
}

export { repoRoot };

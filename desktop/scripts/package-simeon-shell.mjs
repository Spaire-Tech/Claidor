/**
 * Package Simeon on its own Electron shell (Track D, piece 1, 5 October 2026).
 *
 *   npm run package:own-shell        → dist/Simeon.app (macOS arm64)
 *   node scripts/package-simeon-shell.mjs --platform linux --arch x64
 *                                    → a Linux bundle, for checking the path
 *                                      on a machine without macOS
 *
 * The steps, each one measured (`scripts/lib/own-shell.mjs`):
 *   1. every process we build, bundled from source, with the main process
 *      and the host ignited (`scripts/lib/clean-build.mjs`,
 *      `scripts/simeon-ignition-activation.mjs`), and nothing compared
 *      against the upstream app's files;
 *   2. the staging folder: our package.json, the pinned window with the
 *      patch applied, the Electron add-ons we compile, the signer, and the
 *      build manifest with every output's hash;
 *   3. one app.asar with its unpacked payload;
 *   4. @electron/packager around a stock Electron 42.1.0: executable, four
 *      helpers, plists, icon and URL scheme with Simeon's names;
 *   5. the unpacked payload beside the asar, the package record, the ad-hoc
 *      signature, Launch Services, and the verification
 *      (`scripts/verify-own-shell.mjs`).
 *
 * The upstream app is read for two things only, when it is on the machine:
 * the pinned window (until Track D piece 2) and the WebAuthn signer (until
 * piece 4). Without it the window is refused (it is the app's face) and the
 * signer is reported absent.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { packager } from "@electron/packager";

import { buildFidelityDistribution } from "./lib/clean-build.mjs";
import { packStagedAppWithIntegrity } from "./lib/asar-integrity.mjs";
import { buildDir, outputApp, outputDir, repoRoot, sourceAppDir } from "./lib/config.mjs";
import { signAppBundleAdHoc } from "./lib/codesign.mjs";
import {
  copyUnpackedBesideAsar,
  finishOwnShellStage,
  ownShellBundlePaths,
  ownShellComposition,
  ownShellPackageRecord,
  ownShellPackagerOptions,
  ownShellPackagerOutput,
  writeOwnShellBuildManifest,
} from "./lib/own-shell.mjs";
import { resolveRuntimeApp } from "./lib/runtime.mjs";
import { run } from "./lib/process.mjs";
import { SYSTEM_TOOLS } from "./lib/system-tools.mjs";
import { APP_ICON_ICNS } from "./make-app-icon.mjs";
import { igniteProductionElectronMain, igniteProductionHost } from "./simeon-ignition-activation.mjs";
import { verifyOwnShellPackage } from "./verify-own-shell.mjs";

function readArguments(argv) {
  const options = { platform: process.platform === "darwin" ? "darwin" : "linux", arch: process.arch };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--platform" || flag === "--arch") {
      const value = argv[index + 1];
      if (value == null || value.startsWith("--")) throw new Error("Usage: node scripts/package-simeon-shell.mjs [--platform darwin|linux] [--arch arm64|x64]");
      options[flag.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument ${flag}`);
    }
  }
  return options;
}

export async function packageOwnShell({ platform = "darwin", arch = "arm64", dev = process.env.SIMEON_BUILD_DEV_APP === "1", log = (line) => console.log(`[own-shell] ${line}`) } = {}) {
  if (platform === "darwin" && process.platform !== "darwin") throw new Error("A macOS bundle can only be packaged on macOS.");
  const root = path.join(buildDir, "own-shell");
  const cleanOutputRoot = path.join(root, "clean-runtime");
  const stageRoot = path.join(root, "app");
  const asarPath = path.join(root, "app.asar");
  const unpackedRoot = `${asarPath}.unpacked`;
  const outDir = path.join(root, "out");
  await rm(root, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  // 1. Every process we build, the main process and the host ignited.
  const base = await buildFidelityDistribution({ outputRoot: cleanOutputRoot });
  const host = await igniteProductionHost({ outputRoot: cleanOutputRoot });
  const main = await igniteProductionElectronMain({ outputRoot: cleanOutputRoot, simeonPackage: true });
  await cp(path.join(cleanOutputRoot, "dist"), path.join(stageRoot, "dist"), { recursive: true, dereference: false, preserveTimestamps: true });

  // 2. The window, the add-ons, the signer, the manifest.
  let nativeRoot = null;
  try {
    const runtimeApp = await resolveRuntimeApp();
    nativeRoot = path.join(runtimeApp, "Contents", "Resources", "app.asar.unpacked", "dist", "native");
  } catch (error) {
    log(`no upstream app for the signer: ${error.message}`);
  }
  const staged = await finishOwnShellStage({ stageRoot, rendererRoot: path.join(sourceAppDir, "dist", "renderer"), nativeRoot, platform, arch, dev, log });
  const composition = ownShellComposition(base.buildManifest.runtimeComposition, {
    hostProvenancePath: path.relative(cleanOutputRoot, host.provenancePath).split(path.sep).join("/"),
    electronMainProvenancePath: path.relative(cleanOutputRoot, main.provenancePath).split(path.sep).join("/"),
    signerPresent: staged.signer.present,
  });
  const manifest = await writeOwnShellBuildManifest({ stageRoot, composition, platform, arch });
  log(`staged ${manifest.outputs.length} outputs`);

  // 3. One asar with its unpacked payload.
  await packStagedAppWithIntegrity({ stageRoot, archivePath: asarPath, unpackedRoot });
  const asarSha256 = createHash("sha256").update(await readFile(asarPath)).digest("hex");
  log(`app.asar ${asarSha256}`);

  // 4. Stock Electron around it.
  const options = ownShellPackagerOptions({ stageRoot, asarPath, outDir, platform, arch, icon: APP_ICON_ICNS, dev });
  log(`packaging with Electron ${options.electronVersion} for ${platform}-${arch}${options.electronZipDir ? ` from ${options.electronZipDir}` : ""}`);
  const [packaged] = await packager(options);
  const built = ownShellPackagerOutput({ outDir, platform, arch, dev });
  const expectedFolder = platform === "darwin" ? path.dirname(built) : built;
  if (path.resolve(packaged) !== path.resolve(expectedFolder)) throw new Error(`The packager wrote ${packaged}, expected ${expectedFolder}`);

  // 5. The payload beside the asar, the record, the signature, the verification.
  await copyUnpackedBesideAsar({ unpackedRoot, appPath: built, platform });
  const paths = ownShellBundlePaths(built, platform);
  const record = ownShellPackageRecord({ platform, arch, asarSha256, staged, dev });
  await writeFile(paths.record, `${JSON.stringify(record, null, 2)}\n`);

  const finalApp = platform === "darwin" ? outputApp : path.join(outputDir, path.basename(built));
  await mkdir(outputDir, { recursive: true });
  await rm(finalApp, { recursive: true, force: true });
  // verbatimSymlinks: a framework's top-level entries are links to
  // Versions/Current/…; without it fs.cp rewrites them as absolute paths into
  // .build, and codesign refuses "unsealed contents present in the root
  // directory of an embedded framework" (measured on the founder's Mac,
  // 5 October 2026).
  await cp(built, finalApp, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true });

  if (platform === "darwin") {
    await run(SYSTEM_TOOLS.xattr, ["-cr", finalApp]).catch(() => {});
    try {
      await signAppBundleAdHoc(finalApp);
    } catch (error) {
      console.warn(`Initial ad-hoc signing pass failed; retrying once: ${String(error)}`);
      await signAppBundleAdHoc(finalApp);
    }
    await run(SYSTEM_TOOLS.codesign, ["--verify", "--deep", "--strict", finalApp]);
    await run("/usr/bin/touch", [finalApp]).catch(() => {});
    await run("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", finalApp]).catch(() => {});
  }
  const verification = await verifyOwnShellPackage({ appPath: finalApp, platform, arch, log });
  log(`Packaged application: ${finalApp} (Electron ${options.electronVersion}, ${verification.helpers?.length ?? 0} helpers, ${verification.payload.nodeFiles.length} add-ons, signer ${verification.payload.signerPresent ? "present" : "absent"})`);
  return { appPath: finalApp, record, verification };
}

const invokedDirectly = process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(repoRoot, "scripts", "package-simeon-shell.mjs");
if (invokedDirectly) {
  const { platform, arch } = readArguments(process.argv.slice(2));
  await packageOwnShell({ platform, arch });
}

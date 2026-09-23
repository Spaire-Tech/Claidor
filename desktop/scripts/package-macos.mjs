import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  outputApp,
  outputDir,
  packagedEnvironment,
  reconstructedBundleId,
  reconstructedName
} from "./lib/config.mjs";
import { buildFidelityReconstructedAsar } from "./clean-build.mjs";
import { signAppBundleAdHoc } from "./lib/codesign.mjs";
import { verifyOfficialMacReference, verifyReconstructedMacPackage } from "./lib/macos-package-verification.mjs";
import { run } from "./lib/process.mjs";
import { SYSTEM_TOOLS } from "./lib/system-tools.mjs";
import { APP_ICON_ICNS } from "./make-app-icon.mjs";

if (process.platform !== "darwin") {
  throw new Error("The reconstructed macOS application can only be packaged on macOS.");
}

// Keep the checksum-pinned shipped renderer as the window chrome. Product
// work in frontend/ is a recovered skeleton without the atom stylesheet;
// shipping it emptied the sidebar and composer. The ignited host still
// replaces Grok's 0.18.0 agent runtime (Terra→Luna, Claidor proxy).
const { builtAsar, builtAsarUnpacked, runtimeApp } = await buildFidelityReconstructedAsar();
// Keep the signed release audit separate from the reconstructed package audit:
// the official app is reference-only and is never used as the runtime payload.
await verifyOfficialMacReference({ runtimeApp });
await mkdir(outputDir, { recursive: true });
await rm(outputApp, { recursive: true, force: true });
await run(SYSTEM_TOOLS.ditto, [runtimeApp, outputApp]);
// The source DMG's quarantine/provenance applies to Anysphere's signed artifact,
// not to this differently identified local reconstruction. Leaving it attached
// makes Gatekeeper reject the otherwise valid ad-hoc signature before launch.
await run(SYSTEM_TOOLS.xattr, ["-cr", outputApp]);

const resources = path.join(outputApp, "Contents", "Resources");
// The Dock and Finder icon: Simeon's mark over every icon file the 0.18.0
// shell carried (brand/Simeon.icns, from scripts/make-app-icon.mjs).
const dockIcon = await stat(APP_ICON_ICNS).then(() => APP_ICON_ICNS, () => null);
if (dockIcon == null) throw new Error(`Dock icon missing: ${APP_ICON_ICNS}. Run node scripts/make-app-icon.mjs.`);
for (const name of await readdir(resources)) {
  if (name.endsWith(".icns")) await cp(dockIcon, path.join(resources, name));
}
// macOS caches icons by bundle; a touched bundle and a re-registration make
// Finder and the Dock read the new one instead of the cached Grok Bot icon.
await run("/usr/bin/touch", [outputApp]).catch(() => {});
await run("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", outputApp]).catch(() => {});
const packagedAsar = path.join(resources, "app.asar");
const packagedUnpacked = `${packagedAsar}.unpacked`;
await rm(packagedAsar, { force: true });
await rm(packagedUnpacked, { recursive: true, force: true });
await cp(builtAsar, packagedAsar);
await cp(builtAsarUnpacked, packagedUnpacked, {
  recursive: true,
  dereference: false,
  preserveTimestamps: true
});

const infoPlist = path.join(outputApp, "Contents", "Info.plist");
await run(SYSTEM_TOOLS.plutil, ["-remove", "ElectronAsarIntegrity", infoPlist]);
await run(SYSTEM_TOOLS.plutil, ["-replace", "CFBundleIdentifier", "-string", reconstructedBundleId, infoPlist]);
await run(SYSTEM_TOOLS.plutil, ["-replace", "CFBundleDisplayName", "-string", reconstructedName, infoPlist]);
// The backend currently emits only the `sand` auth/deep-link target. Make the
// reconstructed bundle's claim explicit and remove inherited aliases such as
// `grokbot`; the original bundle remains untouched and remains reference-only.
await run(SYSTEM_TOOLS.plutil, ["-remove", "CFBundleURLTypes", infoPlist]);
await run(SYSTEM_TOOLS.plutil, ["-insert", "CFBundleURLTypes", "-xml", "<array><dict><key>CFBundleTypeRole</key><string>Viewer</string><key>CFBundleURLName</key><string>Simeon auth callback</string><key>CFBundleURLSchemes</key><array><string>sand</string></array></dict></array>", infoPlist]);
// The packaged bundle carries its own backend. A bundle launched from Finder
// inherits no shell environment, so a build without this signs in to
// cursor.com however the terminal that built it was configured.
await run(SYSTEM_TOOLS.plutil, ["-remove", "LSEnvironment", infoPlist]).catch(() => {});
await run(SYSTEM_TOOLS.plutil, [
  "-insert",
  "LSEnvironment",
  "-xml",
  `<dict>${Object.entries(packagedEnvironment)
    .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
    .join("")}</dict>`,
  infoPlist,
]);

// CFBundleName stays "Grok Bot", and it is not a choice. On 23 September 2026
// the line below set it to Simeon for the menu bar ("rename it to Simeon
// too"); the packaged app then died 0.2 s after launch, SIGTRAP inside
// ElectronMain, before any JavaScript ran. Electron locates its helper
// bundles as "<name> Helper*.app" under Contents/Frameworks, trying the
// compiled-in product name first and this bundle's CFBundleName second; the
// helpers here are the unrenamed 0.18 shell's ("Grok Bot Helper*.app"), so
// "Simeon" finds none and Electron aborts with "Unable to find helper app".
// The menu bar therefore still says Grok Bot. Making it say Simeon means
// renaming the four helper bundles, their executables and their plists the
// way electron-packager does, and re-signing them. docs/product/name-measured.md.

await rm(path.join(outputApp, "Contents", "_CodeSignature"), { recursive: true, force: true });
try {
  await signAppBundleAdHoc(outputApp);
} catch (error) {
  // macOS can transiently deny replacement of a nested framework signature
  // immediately after the copied runtime was in use. A second idempotent pass
  // succeeds once the kernel releases that code object.
  console.warn(`Initial ad-hoc signing pass failed; retrying once: ${String(error)}`);
  await signAppBundleAdHoc(outputApp);
}
await run(SYSTEM_TOOLS.codesign, ["--verify", "--deep", "--strict", outputApp]);
const verification = await verifyReconstructedMacPackage({
  officialApp: runtimeApp,
  reconstructedApp: outputApp,
  sourceUnpackedRoot: builtAsarUnpacked,
  packagedUnpackedRoot: packagedUnpacked,
});

console.log(`Packaged application: ${outputApp} (${verification.runtime.nodeFileCount} native manifest entries, ${verification.runtime.runtimeFileCount} unpacked runtime files)`);

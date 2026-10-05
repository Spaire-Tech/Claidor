/**
 * The pieces of a signed, notarized Mac release that can be reasoned about
 * off a Mac: the entitlements, the identity choice, the command lines and
 * the release records. `scripts/release-macos.mjs` runs them on a Mac.
 *
 * A release of version V is four files in `dist/release/V/`:
 *   Simeon-V-darwin-arm64.dmg   what a person downloads from simeonlabs.com
 *   Simeon-V-darwin-arm64.zip   what an installed app downloads to update
 *   feed.json                   the Squirrel answer the updater reads
 *                               (`electron-main/update/update-feed.ts`)
 *   release.json                version, date, the two files' sha256 and size
 */
import { basename } from "node:path";

export const DEFAULT_NOTARY_PROFILE = "simeon-notary";
export const DEFAULT_RELEASE_BASE_URL = "https://simeonlabs.com/releases";
export const DEVELOPER_ID_PREFIX = "Developer ID Application:";
export const VOLUME_NAME = "Simeon";

/**
 * Hardened-runtime entitlements for Electron: JIT and unsigned executable
 * memory for V8, library validation off for the compiled add-ons the app
 * loads (tree-sitter), and the two devices the app's calls use. The
 * helpers get the first three only.
 */
export function entitlementsPlist({ helper = false } = {}) {
  const keys = [
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.disable-library-validation",
    ...(helper ? [] : ["com.apple.security.device.audio-input", "com.apple.security.device.camera"]),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "  <dict>",
    ...keys.flatMap((key) => [`    <key>${key}</key>`, "    <true/>"]),
    "  </dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** Whether a file inside the bundle is one of Electron's helper apps. */
export function isHelperBinary(filePath) {
  return /\/Contents\/Frameworks\/[^/]+\.app\//.test(filePath);
}

/**
 * Picks the Developer ID Application identity from `security find-identity
 * -v -p codesigning` output. With a team id, the one carrying it; otherwise
 * the only one, and a clear error when there is none or several.
 */
export function chooseSigningIdentity(findIdentityOutput, { teamId } = {}) {
  const found = [];
  for (const line of findIdentityOutput.split("\n")) {
    const match = /"(Developer ID Application: [^"]+)"/.exec(line);
    if (match != null && !found.includes(match[1])) found.push(match[1]);
  }
  const wanted = teamId == null ? found : found.filter((name) => name.includes(`(${teamId})`));
  if (wanted.length === 1) return wanted[0];
  if (wanted.length === 0) {
    throw new Error(
      teamId == null
        ? "No Developer ID Application certificate in the keychain. Install one from developer.apple.com (Certificates → Developer ID Application) or Xcode → Settings → Accounts → Manage Certificates."
        : `No Developer ID Application certificate for team ${teamId} in the keychain; found: ${found.join(", ") || "none"}.`,
    );
  }
  throw new Error(`Several Developer ID Application certificates match; set SIMEON_SIGN_IDENTITY to one of: ${wanted.join(" | ")}`);
}

export function releaseFileNames(version, arch = "arm64") {
  return {
    dmg: `Simeon-${version}-darwin-${arch}.dmg`,
    zip: `Simeon-${version}-darwin-${arch}.zip`,
  };
}

/** `ditto` arguments for the zip the updater downloads (Squirrel wants the .app at the zip root). */
export function dittoZipArguments(appPath, zipPath) {
  return ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, zipPath];
}

/** `hdiutil` arguments for a compressed, read-only disk image of the staging folder. */
export function hdiutilCreateArguments(stagingDir, dmgPath, { volumeName = VOLUME_NAME } = {}) {
  return ["create", "-volname", volumeName, "-srcfolder", stagingDir, "-ov", "-format", "UDZO", "-imagekey", "zlib-level=9", dmgPath];
}

/** `codesign` arguments for the disk image itself. */
export function codesignDmgArguments(dmgPath, identity) {
  return ["--force", "--timestamp", "--sign", identity, dmgPath];
}

/** `xcrun notarytool submit` with the stored keychain profile, waiting for Apple's answer. */
export function notarytoolSubmitArguments(filePath, { profile = DEFAULT_NOTARY_PROFILE } = {}) {
  return ["notarytool", "submit", filePath, "--keychain-profile", profile, "--wait", "--output-format", "json"];
}

export function staplerArguments(target) {
  return ["stapler", "staple", target];
}

/** `spctl` acceptance of the app as Gatekeeper will see it on another Mac. */
export function spctlAssessArguments(appPath) {
  return ["--assess", "--type", "execute", "--verbose=4", appPath];
}

/** The result of a `notarytool submit --wait --output-format json`, judged. */
export function readNotarizationResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`notarytool answered something other than JSON: ${stdout.slice(0, 400)}`);
  }
  if (parsed.status !== "Accepted") {
    throw new Error(`Apple did not accept the submission (status ${parsed.status ?? "unknown"}, id ${parsed.id ?? "?"}). Read the log: xcrun notarytool log ${parsed.id ?? "<id>"} --keychain-profile <profile>`);
  }
  return { id: parsed.id, status: parsed.status };
}

/**
 * The Squirrel feed entry the updater reads (`parseUpdateResponse` wants
 * `url` and `name`; `pub_date` is what Squirrel.Mac shows).
 */
export function squirrelFeed({ version, zipUrl, pubDate }) {
  return { url: zipUrl, name: version, pub_date: pubDate };
}

export function releaseRecord({ version, arch = "arm64", pubDate, baseUrl = DEFAULT_RELEASE_BASE_URL, dmg, zip, notarization }) {
  const base = baseUrl.replace(/\/+$/, "");
  const names = releaseFileNames(version, arch);
  const entry = (file, name) => ({ url: `${base}/${version}/${name}`, sha256: file.sha256, size: file.size });
  return {
    version,
    platform: `darwin-${arch}`,
    pub_date: pubDate,
    dmg: entry(dmg, names.dmg),
    zip: entry(zip, names.zip),
    notarization,
  };
}

export function releaseUrls(record) {
  return { dmg: record.dmg.url, zip: record.zip.url, feed: record.zip.url.replace(basename(record.zip.url), "feed.json") };
}

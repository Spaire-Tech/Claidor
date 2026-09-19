import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(thisDir, "../..");
export const sourceAppDir = path.join(repoRoot, "src", "app");
export const cacheDir = path.join(repoRoot, ".cache");
export const cachedRuntimeApp = path.join(cacheDir, "runtime", "Grok Bot.app");
export const cachedDmg = path.join(cacheDir, "downloads", "Grok_Bot_0.18.0.dmg");
export const archivedDmg = path.join(repoRoot, "research-archives", "original", "0.18.0", "macos-arm64", "Grok_Bot_0.18.0.dmg");
export const buildDir = path.join(repoRoot, ".build");
export const stagedAppDir = path.join(buildDir, "app");
export const builtAsar = path.join(buildDir, "app.asar");
export const builtAsarUnpacked = `${builtAsar}.unpacked`;
export const fidelityBuildDir = path.join(buildDir, "fidelity");
export const fidelityStagedAppDir = path.join(fidelityBuildDir, "app");
export const fidelityBuiltAsar = path.join(fidelityBuildDir, "app.asar");
export const fidelityBuiltAsarUnpacked = `${fidelityBuiltAsar}.unpacked`;
export const fidelityCandidateManifest = path.join(fidelityBuildDir, "release-candidate.json");
export const fidelityE2ECandidateManifest = path.join(fidelityBuildDir, "e2e-candidate.json");
export const fidelityReleaseEvidenceDir = path.join(fidelityBuildDir, "release-evidence");
export const outputDir = path.join(repoRoot, "dist");
const configuredOutputName = process.env.GROK_BOT_OUTPUT_APP_NAME?.trim();
export const outputApp = path.join(
  outputDir,
  // The bundle on disk carries the product's name. `CFBundleName` and
  // `CFBundleExecutable` inside it stay "Grok Bot", because Electron derives
  // its nested helper names from them and this build reuses the ABI-matched
  // 0.18 shell exactly; only the bundle and its display name are ours.
  configuredOutputName ? path.basename(configuredOutputName) : "Caisra.app"
);
export const fidelityOutputApp = path.join(outputDir, "Grok Bot 0.18 Fidelity.app");
export const fidelityOutputAppForAsarHash = asarHash => {
  if (!/^[0-9a-f]{64}$/.test(asarHash)) throw new TypeError("A full lowercase ASAR SHA-256 is required");
  return path.join(outputDir, `Grok Bot 0.18 Fidelity-${asarHash.slice(0, 12)}.app`);
};
export const fidelityInstalledAppForAsarHash = asarHash => path.join("/Applications", path.basename(fidelityOutputAppForAsarHash(asarHash)));
export const recoveredFrontendDir = path.join(repoRoot, "recovered", "frontend");
export const recoveredRendererDir = path.join(recoveredFrontendDir, "app");
export const frontendDir = path.join(repoRoot, "frontend");
export const devOutputApp = path.join(outputDir, "Grok Bot 0.18 Dev.app");
export const devProfileDir = path.join(cacheDir, "dev-profile");

export const upstreamVersion = "0.18.0";
export const reconstructedBundleId = "com.anysphere.sand.reconstructed";
export const reconstructedName = process.env.CAISRA_DISPLAY_NAME?.trim() || "Caisra";

/**
 * Where the packaged app signs in.
 *
 * The app resolves these from `process.env` at startup
 * (`source/shared/node/cursor-token.ts`, `getConfiguredBackendUrl`, and
 * `packages/cursor-config/auth/login.ts`, `resolveApiBaseUrl` /
 * `resolveWebsiteUrl`). A bundle launched from Finder inherits no shell
 * environment, so without this a packaged build goes to cursor.com no matter
 * what is exported in a terminal. They are written into `LSEnvironment` so the
 * app carries its own backend.
 *
 * Both names are required and neither is redundant: `SAND_BACKEND_URL` is read
 * only by `getConfiguredBackendUrl`, while the login manager that actually
 * opens the browser reads `CURSOR_API_BASE_URL` and `CURSOR_WEBSITE_URL` and
 * nothing else. Measured — see `docs/product/app-sign-in.md`.
 *
 * `SAND_AUTH_CLIENT_ID` is deliberately absent: setting it makes
 * `isDevAuthBackend` true, and `shouldRefreshAccessToken` then returns true
 * unconditionally, which is a token rotation before every model call.
 */
export const packagedEnvironment = Object.freeze({
  CURSOR_API_BASE_URL: process.env.CAISRA_BACKEND_URL?.trim() || "https://api.claidor.com",
  CURSOR_WEBSITE_URL: process.env.CAISRA_BACKEND_URL?.trim() || "https://api.claidor.com",
  SAND_BACKEND_URL: process.env.CAISRA_BACKEND_URL?.trim() || "https://api.claidor.com",
});
export const fidelityBundleId = "com.anysphere.sand.reconstructed.fidelity";
export const fidelityName = "Grok Bot 0.18 Fidelity";
export const dmgUrl = "https://downloads.cursor.com/grokbot/stable/darwin-arm64/0.18.0/Grok_Bot_0.18.0.dmg";

/**
 * Where else the pinned DMG can be had.
 *
 * `dmgUrl` above is the address the reconstruction documents, and it answers
 * **403 for everyone** — confirmed 19 September 2026 from a build container
 * and from the founder's own Mac. Gitee, which the project's own docs name as
 * the Git LFS home of `research-archives/`, holds the pointer but not the
 * object: it issues a signed URL whose path is the pinned digest, and that URL
 * answers `{"message":"'a253ccd8…d203eb' object not found"}`.
 *
 * Public GitHub forks of the reconstruction do carry the LFS object, and
 * GitHub serves it over ordinary HTTPS — which matters, because macOS ships
 * git without the `lfs` subcommand, so the documented `git lfs pull` route
 * dead-ends before it starts.
 *
 * Every one of these is checked against `dmgSha256` before it is used, exactly
 * as the official URL is, so an unreachable, truncated, or substituted file is
 * refused rather than built. That is what makes reaching for a mirror safe:
 * the digest is the authority, not the host.
 *
 * `GROK_BOT_DMG_URL` is tried before all of them.
 */
const mirrorOwners = [
  "webdevtodayjason",  // verified 19 September 2026: 155,793,020 bytes, digest matched
  "sergiodekki",
  "EpicHacker67",
  "agisota",
  "woosa0502",
  "xianyu110",
];

const mirrorPath = "research-archives/original/0.18.0/macos-arm64/Grok_Bot_0.18.0.dmg";

export const dmgUrls = Object.freeze([
  ...(process.env.GROK_BOT_DMG_URL?.trim() ? [process.env.GROK_BOT_DMG_URL.trim()] : []),
  dmgUrl,
  ...mirrorOwners.map(owner => `https://github.com/${owner}/grok-bot-0.18-reconstructed/raw/main/${mirrorPath}`),
]);
export const dmgSha256 = "a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb";
export const upstreamAsarSha256 = "6665408168466f9cacc6087e917890c17f59d2e2e9c2404a5c4a59ad79c1de58";

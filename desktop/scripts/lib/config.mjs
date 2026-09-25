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
  // The bundle on disk, its display name, its executable and its helper
  // bundles all carry the product's name (scripts/lib/macos-bundle-rename.mjs).
  configuredOutputName ? path.basename(configuredOutputName) : "Simeon.app"
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
/**
 * The app's own identity, since 23 September 2026 ("com.claidor.simeon is
 * fine"). Until then it was com.anysphere.sand.reconstructed, Grok Bot's
 * maker's name with a suffix. macOS keys the Keychain access to safeStorage
 * secrets and the privacy grants (screen recording, accessibility,
 * automation) on this, so the person may sign in once more and grant them
 * again after the first build carrying it.
 */
export const reconstructedBundleId = "com.claidor.simeon";
/** The URL scheme the bundle claims; must equal SAND_DEEP_LINK_SCHEME in source/shared/desktop.ts. */
export const reconstructedUrlScheme = "simeon";
export const reconstructedName = process.env.CAISRA_DISPLAY_NAME?.trim() || "Simeon";
/**
 * The name of the executable, and so of the helper bundles and of
 * CFBundleName: what the menu bar, Activity Monitor and crash reports
 * show. Since 23 September 2026 the packager renames the 0.18 shell's
 * "Grok Bot" executable and its helpers to this, together
 * (scripts/lib/macos-bundle-rename.mjs); before that it stayed "Grok Bot",
 * and setting CFBundleName alone crashed the app at launch.
 */
export const reconstructedExecutableName = reconstructedName;

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
  CURSOR_API_BASE_URL: process.env.CAISRA_BACKEND_URL?.trim() || "https://api.simeonlabs.com",
  CURSOR_WEBSITE_URL: process.env.CAISRA_BACKEND_URL?.trim() || "https://api.simeonlabs.com",
  SAND_BACKEND_URL: process.env.CAISRA_BACKEND_URL?.trim() || "https://api.simeonlabs.com",
});
export const fidelityBundleId = "com.anysphere.sand.reconstructed.fidelity";
export const fidelityName = "Grok Bot 0.18 Fidelity";
export const dmgUrl = "https://downloads.cursor.com/grokbot/stable/darwin-arm64/0.18.0/Grok_Bot_0.18.0.dmg";
export const dmgSha256 = "a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb";
export const upstreamAsarSha256 = "6665408168466f9cacc6087e917890c17f59d2e2e9c2404a5c4a59ad79c1de58";

/**
 * The tests' way into TypeScript, as `desktop/tests` does it: esbuild
 * bundles an entry for Node into a temporary folder and the test imports
 * it. Only `src/core/` is tested this way; it imports nothing from React
 * Native, so it runs as it does on the phone.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

export const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const repoRoot = path.resolve(mobileRoot, "..");

/** Bundles `entry` (relative to the repository) and imports it; `dispose` removes the bundle. */
export async function loadModule(entry, name, options = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-mobile-${name}-`));
  const outfile = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", ...options });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

/** Runs a script the app injects into the page against a stand-in window, as WKWebView would. */
export function runInPage(script, window) {
  return new Function("window", `${script}`)(window);
}

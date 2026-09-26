/**
 * Cursor leftovers reachable from the app (batch 4, cluster 2, 25 September
 * 2026; ledger F-215, F-216, F-219, F-221, F-227, F-303, F-314).
 *
 * Offline: an unpackaged run with no backend named goes to Simeon Labs'
 * API, not api2.cursor.sh, and its sign-in page is that host too, not
 * cursor.com (the packaged app always carries the variables; this is the
 * `npm start` case); Cursor's origin is still known so the sharing
 * environment can refuse it; the Statsig client's exposure logging is off
 * because `cursor.statsig-bootstrap` is not a served service; product
 * analytics is off in Simeon's gate table; https deep links are
 * app.simeonlabs.com and a cursor.com link is refused; and DevTools opens
 * in a packaged build only under `SAND_DEVTOOLS=1`.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-cursor-leftovers-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/cursor-leftovers-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("an unpackaged run with no backend named goes to Simeon Labs, and Cursor's origin is still known to refuse", async () => {
  const loaded = await load();
  try {
    const { module } = loaded;
    assert.equal(module.getConfiguredBackendUrl({}), "https://api.simeonlabs.com/");
    assert.equal(module.getConfiguredBackendUrl({ CURSOR_API_BASE_URL: "https://api.simeonlabs.com" }), "https://api.simeonlabs.com/");
    assert.equal(module.getConfiguredBackendUrl({ SAND_BACKEND_URL: "http://127.0.0.1:8000" }), "http://127.0.0.1:8000/");
    assert.equal(module.DEFAULT_SAND_BACKEND_URL, "https://api.simeonlabs.com");
    assert.equal(module.DEFAULT_CURSOR_BACKEND_URL, "https://api2.cursor.sh");
    assert.equal(new URL(module.getAuthWebsiteUrl("https://api.simeonlabs.com", {})).origin, "https://api.simeonlabs.com");
    assert.equal(module.DEFAULT_CURSOR_WEBSITE_URL, "https://api.simeonlabs.com");
    const login = await readFile(path.join(repoRoot, "source/packages/cursor-config/auth/login.ts"), "utf8");
    assert.equal(login.includes('?? "https://cursor.com"'), false);
    assert.equal(login.includes('?? "https://api2.cursor.sh"'), false);
    assert.match(login, /CURSOR_WEBSITE_URL \?\? "https:\/\/api\.simeonlabs\.com"/);
    assert.match(login, /CURSOR_API_BASE_URL \?\? "https:\/\/api\.simeonlabs\.com"/);
  } finally {
    await loaded.dispose();
  }
});

test("exposure logging to Cursor, product analytics and cursor.com deep links are off", async () => {
  const loaded = await load();
  try {
    const { module } = loaded;
    // cursor-experiments.ts: loggingEnabled is "always" only when this name is served.
    assert.equal(module.isConnectServed({}, "cursor.statsig-bootstrap"), false);
    assert.equal(module.isConnectServed({ SAND_CONNECT_SERVED: "1" }, "cursor.statsig-bootstrap"), true);
    const experiments = await readFile(path.join(repoRoot, "source/shared/node/experiments/cursor-experiments.ts"), "utf8");
    assert.match(experiments, /loggingEnabled: isConnectServed\(process\.env, "cursor\.statsig-bootstrap"\) \? "always" : "disabled"/);
    assert.equal(module.SIMEON_FEATURE_GATE_DEFAULTS.sand_product_analytics, false);
    assert.equal(module.SAND_HTTPS_DEEP_LINK_ORIGIN, "https://app.simeonlabs.com");
    assert.equal(module.parseSandDeepLink("https://cursor.com/sand/link/v1/open"), null);
    assert.equal(module.parseSandDeepLink("https://app.simeonlabs.com/sand/link/v1/open")?.link.route, "open");
    // The packaged build's guard: telemetry off unless the environment says otherwise.
    const asar = await readFile(path.join(repoRoot, "scripts/lib/build-asar.mjs"), "utf8");
    assert.match(asar, /SAND_DISABLE_TELEMETRY \?\?= \\"1\\"/);
  } finally {
    await loaded.dispose();
  }
});

test("DevTools in a packaged build opens only under SAND_DEVTOOLS=1", async () => {
  const loaded = await load();
  try {
    const packaged = loaded.module.createDevToolsGate({ isDevBuild: false });
    packaged.setMembership("denied");
    assert.equal(packaged.isAllowed(), false);
    const opened = loaded.module.createDevToolsGate({ isDevBuild: true });
    opened.setMembership("denied");
    assert.equal(opened.isAllowed(), true);
    const main = await readFile(path.join(repoRoot, "source/electron-main/main.ts"), "utf8");
    assert.match(main, /createDevToolsGate\(\{ isDevBuild: !deps\.app\.isPackaged \|\| process\.env\.SAND_DEVTOOLS\?\.trim\(\) === "1" \}\)/);
  } finally {
    await loaded.dispose();
  }
});

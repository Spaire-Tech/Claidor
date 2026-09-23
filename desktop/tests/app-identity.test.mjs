import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

import { reconstructedBundleId, reconstructedUrlScheme } from "../scripts/lib/config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  return { module: await import(`${pathToFileURL(output).href}?${Date.now()}`), dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the app is com.claidor.simeon and claims simeon://, and only that", () => {
  assert.equal(reconstructedBundleId, "com.claidor.simeon");
  assert.equal(reconstructedUrlScheme, "simeon");
});

test("the scheme the app parses, registers and sends as redirectTarget is the one the bundle claims", async () => {
  const deepLink = await loadModule("source/shared/deep-link.ts", "deep-link");
  const desktop = await loadModule("source/shared/desktop.ts", "desktop-shared");
  const auth = await loadModule("source/electron-main/auth/auth-callback-registration.ts", "auth-callback");
  try {
    assert.equal(deepLink.module.SAND_DEEP_LINK_SCHEME, reconstructedUrlScheme);
    assert.equal(deepLink.module.SAND_OPEN_DEEP_LINK_URL, "simeon://app/v1/open");
    // What Claidor's sign-in page opens after the POST (app_sign_in.py builds
    // `<redirectTarget>://app/v1/open`): parsed as the open route.
    assert.equal(deepLink.module.parseSandDeepLink("simeon://app/v1/open")?.link.route, "open");
    // Grok Bot's scheme is no longer ours to answer.
    assert.equal(deepLink.module.parseSandDeepLink("sand://app/v1/open"), null);
    assert.match(desktop.module.buildSandPluginDeepLink("42"), /^simeon:\/\/app\/v1\/plugin\/add\?id=42$/);
    assert.equal(auth.module.resolveAuthRedirectTarget({}), "simeon");
    assert.equal(auth.module.resolveAuthProtocolScheme({}), "simeon");
    const registered = [];
    const registration = auth.module.registerAuthCallbackProtocol({ app: { setAsDefaultProtocolClient: (scheme) => { registered.push(scheme); return true; } }, isPackaged: true, isLabBuild: false, env: {} });
    assert.deepEqual(registered, ["simeon"]);
    assert.equal(registration.redirectTarget, "simeon");
  } finally {
    await deepLink.dispose();
    await desktop.dispose();
    await auth.dispose();
  }
});

test("packaging writes the scheme and bundle id from config, and verify refuses the old scheme", async () => {
  const packager = await readFile(path.join(repoRoot, "scripts", "package-macos.mjs"), "utf8");
  assert.match(packager, /<key>CFBundleURLSchemes<\/key><array><string>\$\{reconstructedUrlScheme\}<\/string>/);
  assert.match(packager, /"-replace", "CFBundleIdentifier", "-string", reconstructedBundleId/);
  assert.doesNotMatch(packager, /<string>sand<\/string>/);
  const verify = await readFile(path.join(repoRoot, "scripts", "verify.mjs"), "utf8");
  assert.match(verify, /urlTypes\.includes\(`<string>\$\{reconstructedUrlScheme\}<\/string>`\)/);
  assert.match(verify, /urlTypes\.includes\("<string>sand<\/string>"\)\) throw/);
  const recovered = await readFile(path.join(repoRoot, "frontend", "src", "recovered", "features", "deep-links", "overlay", "model.ts"), "utf8");
  assert.doesNotMatch(recovered, /sand:\/\//);
});

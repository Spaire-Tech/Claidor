import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function envOf(args) {
  const env = {};
  for (let index = 0; index < args.length; index += 2) {
    assert.equal(args[index], "--env");
    const [key, ...rest] = args[index + 1].split("=");
    env[key] = rest.join("=");
  }
  return env;
}

test("the box runtime is the upstream app's: the cloud computer, Docker only by the internal switch", async () => {
  const loaded = await loadModule("source/shared/box-runtime.ts", "box-runtime");
  try {
    assert.equal(loaded.module.DEFAULT_SAND_BOX_RUNTIME, "remote");
    assert.equal(loaded.module.resolveSandBoxRuntime({}), "remote");
    assert.equal(loaded.module.resolveSandBoxRuntime({ SAND_BOX_RUNTIME: "local-docker" }), "local-docker");
    assert.equal(loaded.module.resolveSandBoxRuntime({ SAND_BOX_RUNTIME: "anything" }), "remote");
  } finally {
    await loaded.dispose();
  }
});

test("a settings store reports the cloud computer, even with local Docker saved by the old switch", async () => {
  const loaded = await loadModule("source/shared/node/settings/sand-settings-store.ts", "sand-settings-store");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "simeon-settings-"));
  const saved = process.env.SAND_BOX_RUNTIME;
  delete process.env.SAND_BOX_RUNTIME;
  try {
    const settingsPath = path.join(dataDir, "settings.json");
    assert.equal(new loaded.module.SandSettingsStore(settingsPath).getBoxRuntime(), "remote");
    await writeFile(settingsPath, JSON.stringify({ boxRuntime: "local-docker" }));
    assert.equal(new loaded.module.SandSettingsStore(settingsPath).getBoxRuntime(), "remote");
    process.env.SAND_BOX_RUNTIME = "local-docker";
    assert.equal(new loaded.module.SandSettingsStore(settingsPath).getBoxRuntime(), "local-docker");
  } finally {
    if (saved === undefined) delete process.env.SAND_BOX_RUNTIME; else process.env.SAND_BOX_RUNTIME = saved;
    await rm(dataDir, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("a late inference credential does not tear down a running box", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-replace");
  try {
    const { LOCAL_DOCKER_SCHEMA_VERSION, localDockerContainerNeedsReplace } = loaded.module;
    assert.equal(localDockerContainerNeedsReplace({
      schemaVersion: LOCAL_DOCKER_SCHEMA_VERSION,
      hostSha256: "abc",
    }, "abc"), false);
    assert.equal(localDockerContainerNeedsReplace({
      schemaVersion: LOCAL_DOCKER_SCHEMA_VERSION,
      hostSha256: "old",
    }, "abc"), true);
    const source = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"),
      "utf8",
    );
    assert.match(source, /localDockerContainerNeedsReplace\(inspected, hostBundle\.sha256, credentialsSha256\)/);
    assert.doesNotMatch(source, /inferenceCredential != null && !inspected\.hasInferenceCredential/);
    assert.doesNotMatch(source, /OPTIONAL_CREDENTIAL_TIMEOUT_MS = 3_000/);
    // Since 26 September 2026 the box's credentials reach it in its
    // environment, the upstream app's pod contract, and no token file is mounted
    // (F-148; tests/local-docker-credentials.test.mjs).
    assert.doesNotMatch(source, /SAND_DEV_INFERENCE_TOKEN_FILE=/);
    assert.doesNotMatch(source, /dst=\/run\/grok-bot/);
    assert.doesNotMatch(source, /\.claude/);
    assert.doesNotMatch(source, /\.codex/);
    assert.equal(LOCAL_DOCKER_SCHEMA_VERSION, "12");
    const production = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/electron-main/main-production-services.ts"),
      "utf8",
    );
    assert.match(production, /startLocalDockerBox\(settingsStore\.settingsPath\)/);
    assert.doesNotMatch(production, /routesSimeonThroughHost\(env\)/);
    assert.doesNotMatch(source, /usesLeftoverDockerHost/);
    const computerUse = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/host/runner/computer-use.ts"),
      "utf8",
    );
    assert.match(computerUse, /box-chrome --new-window/);
    assert.doesNotMatch(computerUse, /box-chrome --sand-prepare/);
  } finally {
    await loaded.dispose();
  }
});

test("the local box is Simeon's own container, on the volumes it always had", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-name");
  try {
    assert.equal(loaded.module.LOCAL_DOCKER_BOX_CONTAINER, "simeon-box");
    const source = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"),
      "utf8",
    );
    // The container mounts Simeon-named volumes (internal testing only;
    // people run on the cloud computer).
    assert.match(source, /"--volume", "simeon-box-workspace:\/workspace", "--volume", "simeon-box-data:\/home\/box\/sand-data"/);
    // Every docker call names the container through the constant, never by a literal.
    assert.doesNotMatch(source, /"(?:inspect|start|stop|restart|rm|logs|run)"[^\n]*"grok-bot-local-vm"/);
  } finally {
    await loaded.dispose();
  }
});

test("the local Docker box is always told our backend, credential or not", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-host-connector");
  try {
    const { localDockerInferenceEnvironmentArguments } = loaded.module;
    const env = { SAND_BACKEND_URL: "https://api.simeonlabs.com" };

    const withoutCredential = envOf(localDockerInferenceEnvironmentArguments(undefined, env));
    assert.equal(withoutCredential.SAND_BACKEND_URL, "https://api.simeonlabs.com/");
    assert.equal(withoutCredential.SAND_INFERENCE_RENEWAL_CREDENTIAL, undefined);
    assert.equal(withoutCredential.SAND_INFERENCE_PROVIDER, "simeon");
    assert.equal(withoutCredential.SAND_DISABLE_TELEMETRY, "1", "no the upstream app telemetry from the box");
    assert.equal(withoutCredential.SAND_DISABLE_ANALYTICS, "1");
    assert.equal(withoutCredential.SAND_BOX_LOG_SHIP_DISABLED, "1");

    const withCredential = envOf(localDockerInferenceEnvironmentArguments("simeon_db_box", env));
    assert.equal(withCredential.SAND_BACKEND_URL, "https://api.simeonlabs.com/");
    assert.equal(withCredential.SAND_INFERENCE_RENEWAL_CREDENTIAL, "simeon_db_box");

    const fromPluginVariable = envOf(localDockerInferenceEnvironmentArguments(undefined, { SIMEON_API_BASE_URL: "https://api.simeonlabs.com" }));
    assert.equal(fromPluginVariable.SAND_BACKEND_URL, "https://api.simeonlabs.com/");
  } finally {
    await loaded.dispose();
  }
});

test("an empty inference token file is a wait, not a hard failure", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    path.join(repoRoot, "source/host/extensions/auth/credential-renewer.ts"),
    "utf8",
  );
  assert.match(source, /class SandCredentialNotReadyError/);
  assert.match(source, /DEV_TOKEN_FILE_POLL_MS = 1_000/);
  assert.match(source, /error instanceof SandCredentialNotReadyError/);
});

test("the box renews its own token, so the Mac no longer rewrites one every five minutes", async () => {
  // Until 26 September 2026 the Mac re-issued a one-hour token into a file
  // the box read (the upstream app's development path). The box now holds its
  // renewal credential in its environment and renews on the upstream app's
  // production path (F-148; tests/local-docker-credentials.test.mjs).
  const source = await (await import("node:fs/promises")).readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
  assert.doesNotMatch(source, /function startInferenceCredentialKeepFresh\b/);
  assert.doesNotMatch(source, /setInterval\(/, "no rewrite loop");
});

test("the docker CLI is found where Docker Desktop and Homebrew put it, not only on a Finder-launched app's PATH", async () => {
  // Measured 25 September 2026: `spawn docker ENOENT` from the packaged app while Terminal had it.
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-binary");
  try {
    const { DOCKER_BINARY_CANDIDATES, resolveDockerBinary, dockerSpawnEnv } = loaded.module;
    const finderPath = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" };
    assert.ok(DOCKER_BINARY_CANDIDATES(finderPath, "/Users/me").includes("/usr/local/bin/docker"));
    assert.ok(DOCKER_BINARY_CANDIDATES(finderPath, "/Users/me").includes("/Users/me/.docker/bin/docker"));
    assert.equal(resolveDockerBinary({ ...finderPath, SAND_DOCKER_BINARY: "/x/docker" }, () => false), "/x/docker", "an explicit binary wins");
    assert.equal(resolveDockerBinary({ PATH: "/nowhere" }, (path) => path === "/opt/homebrew/bin/docker"), "/opt/homebrew/bin/docker");
    assert.match(dockerSpawnEnv(finderPath).PATH, /\/usr\/local\/bin/);
    assert.match(dockerSpawnEnv(finderPath).PATH, /\/opt\/homebrew\/bin/);
  } finally {
    await loaded.dispose();
  }
});

test("ExternalAwaitShell waits in the user's computer's terminals folder, not the box's", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /const getLocalTerminalsFolder = method\(localExec\.box as DynamicApi, "terminalsFolder"\);/);
  assert.match(composition, /const getTerminalsFolder = getLocalTerminalsFolder \?\? method\(remoteBox, "getTerminalsFolder"\);/);
});

test("a local box that fails to start at launch writes its sentence to computer-stream.log instead of vanishing", async () => {
  // F-231 / F-301, 25 September 2026: `spawn docker ENOENT` at first launch
  // was swallowed by `.catch(() => undefined)`; the Computer panel paints
  // the last stream line after 20 s, so the sentence now goes there.
  const source = await readFile(path.join(repoRoot, "source/electron-main/main-production-services.ts"), "utf8");
  assert.match(source, /void startLocalDockerBox\(settingsStore\.settingsPath\)\.catch\(\(error: unknown\) => \{\n\s*computerStreamLine\(`local docker: start at launch failed: \$\{error instanceof Error \? error\.message : String\(error\)\}`\);/);
  assert.doesNotMatch(source, /startLocalDockerBox\([^)]*\)\.catch\(\(\) => undefined\)/);
});

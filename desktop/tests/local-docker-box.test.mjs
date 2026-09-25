import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
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

test("the box runtime defaults to local Docker", async () => {
  const loaded = await loadModule("source/shared/box-runtime.ts", "box-runtime");
  try {
    assert.equal(loaded.module.DEFAULT_SAND_BOX_RUNTIME, "local-docker");
  } finally {
    await loaded.dispose();
  }
});

test("a fresh settings store reports local Docker as the box runtime", async () => {
  const loaded = await loadModule("source/shared/node/settings/sand-settings-store.ts", "sand-settings-store");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "caisra-settings-"));
  try {
    const store = new loaded.module.SandSettingsStore(path.join(dataDir, "settings.json"));
    assert.equal(store.getBoxRuntime(), "local-docker");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("a late inference credential does not tear down a running box", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-replace");
  try {
    const { LOCAL_DOCKER_SCHEMA_VERSION, OPTIONAL_CREDENTIAL_WAIT_MS, localDockerContainerNeedsReplace } = loaded.module;
    assert.equal(OPTIONAL_CREDENTIAL_WAIT_MS <= 250, true);
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
    assert.match(source, /localDockerContainerNeedsReplace\(inspected, hostBundle\.sha256\)/);
    assert.doesNotMatch(source, /inferenceCredential != null && !inspected\.hasInferenceCredential/);
    assert.doesNotMatch(source, /OPTIONAL_CREDENTIAL_TIMEOUT_MS = 3_000/);
    assert.match(source, /SAND_DEV_INFERENCE_TOKEN_FILE=\$\{LOCAL_DOCKER_INFERENCE_TOKEN_FILE\}/);
    assert.match(source, /dst=\/run\/grok-bot,readonly/);
    assert.match(source, /if \(late != null && late !== issued\) await persistInferenceCredential/);
    assert.doesNotMatch(source, /\.claude/);
    assert.doesNotMatch(source, /\.codex/);
    assert.equal(LOCAL_DOCKER_SCHEMA_VERSION, "10");
    const production = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/electron-main/main-production-services.ts"),
      "utf8",
    );
    assert.match(production, /startLocalDockerBox\(settingsStore\.settingsPath\)/);
    assert.doesNotMatch(production, /routesClaidorThroughHost\(env\)/);
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
    // The rename must not lose the person's workspace or the host's data:
    // the renamed container mounts the same two volumes.
    assert.match(source, /"--volume", "grok-bot-local-vm-workspace:\/workspace", "--volume", "grok-bot-local-vm-data:\/home\/box\/sand-data"/);
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
    assert.equal(withoutCredential.SAND_DEV_INFERENCE_TOKEN_FILE, "/run/grok-bot/inference.json");
    assert.equal(withoutCredential.SAND_INFERENCE_PROVIDER, "claidor");
    assert.equal(withoutCredential.CAISRA_CLAUDE_CODE, "0");
    assert.equal(withoutCredential.SAND_DISABLE_TELEMETRY, "1", "no Cursor telemetry from the box");
    assert.equal(withoutCredential.SAND_DISABLE_ANALYTICS, "1");
    assert.equal(withoutCredential.SAND_BOX_LOG_SHIP_DISABLED, "1");

    const withCredential = envOf(localDockerInferenceEnvironmentArguments({ backendUrl: "https://api.simeonlabs.com/" }, env));
    assert.equal(withCredential.SAND_BACKEND_URL, "https://api.simeonlabs.com/");
    assert.equal(withCredential.SAND_DEV_INFERENCE_TOKEN_FILE, "/run/grok-bot/inference.json");

    const fromCursorVariable = envOf(localDockerInferenceEnvironmentArguments(undefined, { CURSOR_API_BASE_URL: "https://api.simeonlabs.com" }));
    assert.equal(fromCursorVariable.SAND_BACKEND_URL, "https://api.simeonlabs.com/");
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

test("the Mac rewrites the box's token file when its access token changes, so a box older than an hour is not left with an expired one", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-keep-fresh");
  try {
    const { refreshInferenceCredentialFile, startInferenceCredentialKeepFresh, stopInferenceCredentialKeepFresh, INFERENCE_CREDENTIAL_KEEP_FRESH_INTERVAL_MS } = loaded.module;
    assert.equal(INFERENCE_CREDENTIAL_KEEP_FRESH_INTERVAL_MS <= 10 * 60_000, true, "well inside a one-hour token life");
    const persisted = [];
    const persist = async (_settingsPath, credential) => { persisted.push(credential.accessToken); };
    let token = "tok-1";
    const issue = async () => ({ accessToken: token, backendUrl: "https://api.simeonlabs.com/", expiresAtMs: Date.now() + 3_600_000 });
    assert.equal(await refreshInferenceCredentialFile(issue, "/tmp/settings.json", persist), "rewritten");
    assert.equal(await refreshInferenceCredentialFile(issue, "/tmp/settings.json", persist), "unchanged");
    token = "tok-2";
    assert.equal(await refreshInferenceCredentialFile(issue, "/tmp/settings.json", persist), "rewritten");
    assert.deepEqual(persisted, ["tok-1", "tok-2"]);
    assert.equal(await refreshInferenceCredentialFile(async () => { throw new Error("signed out"); }, "/tmp/settings.json", persist), "unavailable");
    assert.equal(await refreshInferenceCredentialFile(async () => undefined, "/tmp/settings.json", persist), "unavailable");
    assert.deepEqual(persisted, ["tok-1", "tok-2"], "a missing token never overwrites the file");

    let ticks = 0;
    const setIntervalImpl = (fn, ms) => { ticks += 1; assert.equal(ms, INFERENCE_CREDENTIAL_KEEP_FRESH_INTERVAL_MS); return { unref() {} }; };
    startInferenceCredentialKeepFresh(issue, "/tmp/settings.json", { setIntervalImpl, log: () => {} });
    startInferenceCredentialKeepFresh(issue, "/tmp/settings.json", { setIntervalImpl, log: () => {} });
    assert.equal(ticks, 1, "one loop per process");
    stopInferenceCredentialKeepFresh();
    const source = await (await import("node:fs/promises")).readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
    assert.match(source, /startInferenceCredentialKeepFresh\(\n\s*remote\.issueInferenceCredential == null \? undefined : \(\) => remote\.issueInferenceCredential!\(\),/);
  } finally {
    await loaded.dispose();
  }
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

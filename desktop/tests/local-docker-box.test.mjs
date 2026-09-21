import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
    assert.match(source, /if \(late != null\) await persistInferenceCredential/);
    assert.doesNotMatch(source, /\.claude/);
    assert.doesNotMatch(source, /\.codex/);
    assert.equal(LOCAL_DOCKER_SCHEMA_VERSION, "9");
    const production = await (await import("node:fs/promises")).readFile(
      path.join(repoRoot, "source/electron-main/main-production-services.ts"),
      "utf8",
    );
    assert.match(production, /routesClaidorThroughHost\(env\)/);
    assert.match(production, /startLocalDockerBox\(settingsStore\.settingsPath\)/);
    assert.match(source, /usesLeftoverDockerHost/);
    assert.match(source, /routesClaidorThroughHost\(\)/);
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

test("the local Docker box is always told our backend, credential or not", async () => {
  const loaded = await loadModule("source/electron-main/box/local-docker-host-connector.ts", "local-docker-host-connector");
  try {
    const { localDockerInferenceEnvironmentArguments } = loaded.module;
    const env = { SAND_BACKEND_URL: "https://api.claidor.com" };

    const withoutCredential = envOf(localDockerInferenceEnvironmentArguments(undefined, env));
    assert.equal(withoutCredential.SAND_BACKEND_URL, "https://api.claidor.com/");
    assert.equal(withoutCredential.SAND_DEV_INFERENCE_TOKEN_FILE, "/run/grok-bot/inference.json");
    assert.equal(withoutCredential.SAND_INFERENCE_PROVIDER, "claidor");
    assert.equal(withoutCredential.CAISRA_CLAUDE_CODE, "0");

    const withCredential = envOf(localDockerInferenceEnvironmentArguments({ backendUrl: "https://api.claidor.com/" }, env));
    assert.equal(withCredential.SAND_BACKEND_URL, "https://api.claidor.com/");
    assert.equal(withCredential.SAND_DEV_INFERENCE_TOKEN_FILE, "/run/grok-bot/inference.json");

    const fromCursorVariable = envOf(localDockerInferenceEnvironmentArguments(undefined, { CURSOR_API_BASE_URL: "https://api.claidor.com" }));
    assert.equal(fromCursorVariable.SAND_BACKEND_URL, "https://api.claidor.com/");
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

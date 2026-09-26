/**
 * The local box's credentials, kept the way Grok Bot keeps them (ledger
 * F-148, 26 September 2026).
 *
 * Grok Bot writes its box descriptor encrypted with Electron's safeStorage
 * (`gateway-descriptor-store.ts`), holds a secret in memory when encryption
 * is unavailable (`secret-store.ts`), and hands its box a renewal
 * credential in the environment that the box renews its own model token
 * with (`host/extensions/auth/auth-service.ts`). Offline: the three secrets
 * never touch the Mac's disk in the clear; yesterday's plain files are
 * adopted once and removed; without encryption nothing is written; the
 * box credential is minted once, however many connects race; sign-out
 * drops it; the box is created with its credentials in its environment
 * and no token file; and the box's host renews on Grok Bot's production
 * path from that environment.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** A stand-in for Electron's safeStorage whose output never contains the input. */
function fakeSafeStorage(available = true) {
  const flip = (text) => Buffer.from(text, "utf8").map((byte) => byte ^ 0x5a);
  return {
    encrypted: 0,
    isEncryptionAvailable: () => available,
    encryptString(value) { this.encrypted += 1; return Buffer.concat([Buffer.from("SS1:"), flip(value)]); },
    decryptString(value) { assert.equal(value.subarray(0, 4).toString(), "SS1:"); return Buffer.from(flip(value.subarray(4).toString("latin1"))).toString("utf8"); },
  };
}

async function tempSettings() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-box-secrets-"));
  return { dir, settingsPath: path.join(dir, "settings.json"), dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the gateway token, the stream token and the box credential are kept encrypted, never in a plain file", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "box-secrets");
  const { dir, settingsPath, dispose: disposeDir } = await tempSettings();
  try {
    const storage = fakeSafeStorage();
    module.configureLocalDockerSecretStorage(storage);
    const gateway = await module.readOrCreateToken(settingsPath);
    const stream = await module.readOrCreateStreamToken(settingsPath);
    await module.storeBoxCredential(settingsPath, "claidor_db_the_box_credential");
    assert.match(gateway, /^[0-9a-f]{64}$/);
    assert.match(stream, /^[0-9a-f]{64}$/);
    assert.deepEqual((await readdir(dir)).sort(), ["local-docker-secrets.json"], "one file, and no plain token file beside it");
    const raw = await readFile(path.join(dir, "local-docker-secrets.json"), "utf8");
    for (const secret of [gateway, stream, "claidor_db_the_box_credential"]) assert.equal(raw.includes(secret), false, "no secret in the clear");
    assert.equal(JSON.parse(raw).version, 1);
    assert.equal((await stat(path.join(dir, "local-docker-secrets.json"))).mode & 0o777, 0o600);
    // A new run reads the same values back through the storage.
    module.configureLocalDockerSecretStorage(fakeSafeStorage());
    assert.equal(await module.readOrCreateToken(settingsPath), gateway);
    assert.equal(await module.readOrCreateStreamToken(settingsPath), stream);
    assert.equal(await module.readBoxCredential(settingsPath), "claidor_db_the_box_credential");
  } finally {
    await disposeDir();
    await dispose();
  }
});

test("yesterday's plain files are adopted once and removed", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "box-secrets-migrate");
  const { dir, settingsPath, dispose: disposeDir } = await tempSettings();
  try {
    const gateway = "a".repeat(64);
    const stream = "b".repeat(64);
    await writeFile(path.join(dir, "local-docker-vm.json"), JSON.stringify({ schemaVersion: 1, token: gateway }));
    await mkdir(path.join(dir, "local-docker-credential"), { recursive: true });
    await writeFile(path.join(dir, "local-docker-credential", "inference.json"), JSON.stringify({ accessToken: "claidor_da_old", expiresAtMs: 1, renewalCredential: "claidor_db_old_box" }));
    await writeFile(path.join(dir, "local-docker-credential", "box-stream-token"), `${stream}\n`);
    const lines = [];
    module.configureLocalDockerSecretStorage(fakeSafeStorage());
    assert.equal(await module.readOrCreateToken(settingsPath), gateway, "the running box's gateway token is kept, so it is not replaced for this");
    assert.equal(await module.readOrCreateStreamToken(settingsPath), stream);
    assert.equal(await module.readBoxCredential(settingsPath), "claidor_db_old_box");
    assert.deepEqual((await readdir(dir)).sort(), ["local-docker-secrets.json"], "the plain gateway file and the whole token folder are gone");
    const raw = await readFile(path.join(dir, "local-docker-secrets.json"), "utf8");
    assert.equal(raw.includes(gateway) || raw.includes("claidor_db_old_box"), false);
    void lines;
  } finally {
    await disposeDir();
    await dispose();
  }
});

test("without encryption nothing is written, plain files are left alone, and the values last the run", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "box-secrets-memory");
  const { dir, settingsPath, dispose: disposeDir } = await tempSettings();
  try {
    await writeFile(path.join(dir, "local-docker-vm.json"), JSON.stringify({ token: "c".repeat(64) }));
    module.configureLocalDockerSecretStorage(fakeSafeStorage(false));
    assert.equal(await module.readOrCreateToken(settingsPath), "c".repeat(64));
    const stream = await module.readOrCreateStreamToken(settingsPath);
    assert.equal(await module.readOrCreateStreamToken(settingsPath), stream, "stable for the run");
    assert.deepEqual((await readdir(dir)).sort(), ["local-docker-vm.json"], "no new file, the old one untouched");
  } finally {
    await disposeDir();
    await dispose();
  }
});

test("before the app configures the storage, the box's credentials are refused rather than guessed", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "box-secrets-unconfigured");
  const { settingsPath, dispose: disposeDir } = await tempSettings();
  try {
    await assert.rejects(() => module.readOrCreateToken(settingsPath), /credential storage is not configured/);
    const services = await readFile(path.join(repoRoot, "source/electron-main/main-production-services.ts"), "utf8");
    assert.ok(services.indexOf("configureLocalDockerSecretStorage(bindings.native.safeStorage);") < services.indexOf("void startLocalDockerBox(settingsStore.settingsPath)"), "configured before the launch-time start");
    const adapter = await readFile(path.join(repoRoot, "source/electron-main/adapters/coordinator-gateway.ts"), "utf8");
    assert.match(adapter, /configureLocalDockerSecretStorage\(context\.native\.safeStorage\);\n\s*const remote = createSettingsRoutedHostConnector/);
  } finally {
    await disposeDir();
    await dispose();
  }
});

test("the box credential is minted once however many connects race, and sign-out drops it", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "box-credential-mint");
  const { dir, settingsPath, dispose: disposeDir } = await tempSettings();
  try {
    module.configureLocalDockerSecretStorage(fakeSafeStorage());
    let mints = 0;
    const issue = async () => { mints += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { credential: `claidor_db_mint_${mints}`, expiresAtMs: 0 }; };
    const lines = [];
    const results = await Promise.all(Array.from({ length: 12 }, () => module.ensureBoxCredential(settingsPath, issue, (line) => lines.push(line))));
    assert.equal(mints, 1, "a second mint would revoke the first on the server");
    assert.deepEqual(new Set(results), new Set(["claidor_db_mint_1"]));
    assert.equal(await module.ensureBoxCredential(settingsPath, issue), "claidor_db_mint_1", "kept for the box's life, not minted per run");
    assert.equal(mints, 1);
    assert.equal(await module.ensureBoxCredential(path.join(dir, "other", "settings.json"), async () => undefined, (line) => lines.push(line)), undefined);
    assert.ok(lines.some((line) => line.includes("no box credential (not signed in?)")));
    const forgotten = [];
    await module.forgetInferenceCredential(settingsPath, { log: (line) => forgotten.push(line) });
    assert.match(forgotten.join("\n"), /box credential forgotten \(signed out\)/);
    assert.equal(await module.readBoxCredential(settingsPath), undefined);
    assert.match(await module.readOrCreateToken(settingsPath), /^[0-9a-f]{64}$/, "sign-out keeps the gateway and stream tokens, which name no account");
    assert.equal(await module.ensureBoxCredential(settingsPath, issue), "claidor_db_mint_2", "the next sign-in mints a new one");
  } finally {
    await disposeDir();
    await dispose();
  }
});

test("the box is created with its credentials in its environment, no token file, and replaced when they change", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "box-credential-env");
  try {
    const envOf = (args) => { const env = {}; for (let index = 0; index < args.length; index += 2) { assert.equal(args[index], "--env"); const [key, ...rest] = args[index + 1].split("="); env[key] = rest.join("="); } return env; };
    const withCredential = envOf(module.localDockerInferenceEnvironmentArguments("claidor_db_box", { SAND_BACKEND_URL: "https://api.simeonlabs.com" }));
    assert.equal(withCredential.SAND_INFERENCE_RENEWAL_CREDENTIAL, "claidor_db_box", "Grok Bot's pod contract");
    assert.equal(withCredential.SAND_BACKEND_URL, "https://api.simeonlabs.com/");
    assert.equal(withCredential.SAND_DEV_INFERENCE_TOKEN_FILE, undefined, "the development path's token file is gone");
    assert.equal(withCredential.SAND_DISABLE_TELEMETRY, "1");
    const withoutCredential = envOf(module.localDockerInferenceEnvironmentArguments(undefined, { SAND_BACKEND_URL: "https://api.simeonlabs.com" }));
    assert.equal(withoutCredential.SAND_INFERENCE_RENEWAL_CREDENTIAL, undefined);
    assert.equal(withoutCredential.SAND_BACKEND_URL, "https://api.simeonlabs.com/", "always told our backend");
    const a = module.localDockerCredentialsFingerprint({ gatewayToken: "g", streamToken: "s", boxCredential: "c1" });
    const b = module.localDockerCredentialsFingerprint({ gatewayToken: "g", streamToken: "s", boxCredential: "c2" });
    assert.notEqual(a, b);
    assert.equal(module.localDockerContainerNeedsReplace({ schemaVersion: module.LOCAL_DOCKER_SCHEMA_VERSION, hostSha256: "h", credentialsSha256: a }, "h", a), false);
    assert.equal(module.localDockerContainerNeedsReplace({ schemaVersion: module.LOCAL_DOCKER_SCHEMA_VERSION, hostSha256: "h", credentialsSha256: a }, "h", b), true, "a new credential replaces the box, which reads it once");
    assert.equal(module.LOCAL_DOCKER_SCHEMA_VERSION, "12");
    const source = await readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
    assert.doesNotMatch(source, /dst=\/run\/grok-bot/, "no token folder is mounted from the Mac");
    assert.doesNotMatch(source, /function (startInferenceCredentialKeepFresh|persistInferenceCredential|refreshInferenceCredentialFile)\b/, "the Mac no longer writes a token for the box");
    assert.match(source, /"--env", `SAND_BOX_STREAM_NETWORK_TOKEN=\$\{streamToken\}`/);
    assert.match(source, /"--label", `com\.grok-bot\.local-vm\.credentials-sha256=\$\{credentialsSha256\}`/);
    assert.match(source, /const credential = await ensureBoxCredential\(settings\.settingsPath, remote\.issueBoxRenewalCredential == null \? undefined : \(\) => remote\.issueBoxRenewalCredential!\(\)\);/);
    assert.match(source, /return credential !== before \? await queuedEnsure\(settings\.settingsPath\) : connection;/, "a fresh mint replaces a box started without it, at connect");
  } finally {
    await dispose();
  }
});

test("the box's host renews on Grok Bot's production path from the credential in its environment", async () => {
  const { module, dispose } = await load("source/host/extensions/auth/auth-service.ts", "host-auth-env");
  try {
    const renewals = [];
    const renewCredential = async (backendUrl, credential) => { renewals.push({ backendUrl, credential }); return { accessToken: "box-token", expiresAtMs: Date.now() + 3_600_000 }; };
    const clock = { now: () => Date.now(), monotonicNow: () => Date.now(), schedule: () => ({ dispose() {} }) };
    const retry = { name: "test", schedule: () => ({ elapsed: Promise.resolve(), dispose() {} }), runWithRetry: async (work) => work(0, new AbortController().signal) };
    const service = module.createHostAuthService({ retry, clock, log: () => {}, env: { SAND_INFERENCE_RENEWAL_CREDENTIAL: "claidor_db_box", SAND_BACKEND_URL: "https://api.simeonlabs.com" }, renewCredential, readDevCredential: async () => { throw new Error("no token file is read on this path"); } });
    try {
      for (let index = 0; index < 50 && service.getLastRenewalEvent() == null; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(await service.getAccessToken(), "box-token");
      assert.deepEqual(renewals[0], { backendUrl: "https://api.simeonlabs.com/", credential: "claidor_db_box" });
    } finally {
      service.dispose();
    }
  } finally {
    await dispose();
  }
});

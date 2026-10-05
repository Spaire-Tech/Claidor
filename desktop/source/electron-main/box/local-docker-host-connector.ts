import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_INFERENCE_PROVIDER, readSimeonEnv, SAND_INFERENCE_PROVIDER_ENV } from "../../shared/inference-router.js";
import { getConfiguredBackendUrl } from "../../shared/node/cursor-token.js";
import { buildSandBoxNoVncUrl } from "../../packages/constants/sand-box.js";
import type { SandSettingsStore } from "../../shared/node/settings/sand-settings-store.js";
import type { SecureStorageCodec } from "../secrets/secret-store.js";
import type { RecreateResult } from "./box-recreate-commands.js";
import type { SandRemoteHostConnector } from "./box-host-connector.js";
import type { GatewayConnection } from "./gateway-descriptor-cache.js";
import { computerStreamLine } from "../vnc/computer-stream-log.js";

// The image the earlier path ran, until Simeon's own (box/Dockerfile,
// 5 October 2026) is published: `SIMEON_BOX_IMAGE=<reference>` (or
// `SAND_BOX_IMAGE`) names another, as the server's SIMEON_BOX_IMAGE does.
export const LOCAL_DOCKER_BOX_IMAGE = "public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest";
export function localDockerBoxImage(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.SIMEON_BOX_IMAGE ?? env.SAND_BOX_IMAGE ?? "").trim();
  return configured.length > 0 ? configured.split("@", 1)[0]! : LOCAL_DOCKER_BOX_IMAGE;
}
// The tag is mutable. A digest pins the box (F-412, F-363):
// `SAND_BOX_IMAGE_DIGEST=<64 hex>` makes every create run `image@sha256:<digest>`
// and refuse a container on any other reference. The digest is read on a
// Mac (`docker image inspect --format '{{index .RepoDigests 0}}' <image>`)
// and recorded in docs/services-core.md; none is pinned yet.
export function localDockerBoxImageReference(env: NodeJS.ProcessEnv = process.env): string {
  const image = localDockerBoxImage(env);
  const digest = (env.SIMEON_BOX_IMAGE_DIGEST ?? env.SAND_BOX_IMAGE_DIGEST ?? "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(digest) ? `${image}@sha256:${digest}` : image;
}
// The container, its two volumes and its labels carry Simeon's names. A
// container made before 29 September 2026 carries the earlier owner label
// (LEGACY_LOCAL_DOCKER_LABEL_PREFIX); it still counts as ours, so it is
// replaced like any stale one, and it starts on fresh volumes. This path is
// for internal testing only (SAND_BOX_RUNTIME=local-docker); people run on
// the cloud computer.
export const LOCAL_DOCKER_BOX_CONTAINER = "simeon-box";
export const LOCAL_DOCKER_GATEWAY_URL = "http://127.0.0.1:1340";
const LOCAL_DOCKER_LABEL_PREFIX = "com.simeonlabs.box";
const LEGACY_LOCAL_DOCKER_LABEL_PREFIX = "com.grok-bot.local-vm";
export const LOCAL_DOCKER_OWNER_LABEL = `${LOCAL_DOCKER_LABEL_PREFIX}=1`;
// 11 since 26 September 2026: the stream is published through the host's
// token guard instead of websockify's bare ports (ledger F-135). 12 the same
// day: the box's credentials reach it in its environment, the way the upstream app's
// pod receives them, and no token file is mounted from the Mac (F-148).
export const LOCAL_DOCKER_SCHEMA_VERSION = "12";
/**
 * Where the stream is published on the Mac, and to what in the box: the
 * guard's listeners (16080, 16081), never websockify's own 6080 and 6081,
 * which only the guard reaches, on the box's loopback. The Mac keeps the
 * port numbers the upstream app's URLs name.
 */
export const LOCAL_DOCKER_STREAM_PUBLISH = Object.freeze(["127.0.0.1:6080:16080", "127.0.0.1:6081:16081"]);
export const LOCAL_DOCKER_STREAM_PRIMARY_BASE = "http://127.0.0.1:6080";
export const LOCAL_DOCKER_STREAM_FORK_BASE = "http://127.0.0.1:6081";
/**
 * The upstream app's `vncProxy` descriptor for the local box: the coordinator
 * rewrites every box status's stream URL through it (`box-vnc-proxy.ts`)
 * and Electron's box session sends the token on every request of the page
 * (`vnc-trust.ts`), exactly as for the upstream app's cloud box.
 */
export function localDockerVncProxy(networkToken: string): NonNullable<GatewayConnection["vncProxy"]> {
  return {
    primaryUrl: buildSandBoxNoVncUrl(LOCAL_DOCKER_STREAM_PRIMARY_BASE, networkToken),
    forkBaseUrl: LOCAL_DOCKER_STREAM_FORK_BASE,
    networkToken,
  };
}
const READY_TIMEOUT_MS = 180_000;

export interface LocalDockerStatus {
  readonly available: boolean;
  readonly running: boolean;
  readonly ready: boolean;
  readonly containerName: string;
  readonly image: string;
  readonly detail: string;
}

interface CommandResult { readonly ok: boolean; readonly output: string }
interface LocalHostBundle { readonly path: string; readonly sha256: string; readonly boxExecDaemonPath: string; readonly boxExecDaemonSha256: string }

// Measured on the founder's Mac, 25 September 2026: every box call failed
// with `spawn docker ENOENT` while `docker version` worked in Terminal. A
// packaged app launched from Finder gets PATH=/usr/bin:/bin:/usr/sbin:/sbin,
// and Docker Desktop's CLI is a symlink in /usr/local/bin (or Homebrew's
// /opt/homebrew/bin, or the per-user ~/.docker/bin), so a bare "docker"
// resolves to nothing. The binary is looked up here instead; SAND_DOCKER_BINARY
// names one outright.
export const DOCKER_BINARY_CANDIDATES = (env: NodeJS.ProcessEnv = process.env, home: string = homedir()): readonly string[] => [
  ...(env.PATH ?? "").split(":").filter((dir) => dir.length > 0).map((dir) => join(dir, "docker")),
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  join(home, ".docker", "bin", "docker"),
  "/Applications/Docker.app/Contents/Resources/bin/docker",
  join(home, ".rd", "bin", "docker"),
  "/opt/podman/bin/docker",
];
let resolvedDockerBinary: string | undefined;
export function resolveDockerBinary(env: NodeJS.ProcessEnv = process.env, isExecutable: (path: string) => boolean = (path) => { try { accessSync(path, fsConstants.X_OK); return true; } catch { return false; } }): string {
  const named = env.SAND_DOCKER_BINARY?.trim();
  if (named != null && named.length > 0) return named;
  if (resolvedDockerBinary != null) return resolvedDockerBinary;
  const found = DOCKER_BINARY_CANDIDATES(env).find(isExecutable);
  if (found != null) { resolvedDockerBinary = found; computerStreamLine(`local docker: cli at ${found}`); }
  return found ?? "docker";
}
export function dockerSpawnEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const extra = ["/usr/local/bin", "/opt/homebrew/bin", join(homedir(), ".docker", "bin")];
  const path = (env.PATH ?? "").split(":").filter((dir) => dir.length > 0);
  return { ...env, PATH: [...path, ...extra.filter((dir) => !path.includes(dir))].join(":") };
}

function runDocker(args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    // The CLI also spawns credential helpers by name, so its PATH is widened too.
    const child = spawn(resolveDockerBinary(), [...args], { stdio: ["ignore", "pipe", "pipe"], env: dockerSpawnEnv() });
    let output = "";
    const append = (chunk: Buffer): void => { output += chunk.toString(); if (output.length > 200_000) output = output.slice(-200_000); };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => resolve({ ok: false, output: `${output}\n${error.message}`.trim() }));
    child.once("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

/**
 * The box's credentials, kept the way the upstream app keeps them (ledger F-148,
 * 26 September 2026).
 *
 * The upstream app never leaves a box credential on the person's Mac in the clear.
 * Its box descriptor, gateway token and network token included, is written
 * encrypted with Electron's `safeStorage` (`gateway-descriptor-store.ts`),
 * and its secret store holds a value encrypted when encryption is available
 * and in memory when it is not (`secret-store.ts`,
 * `resolveSecretStorageMode`). The box itself, a pod on the upstream's servers,
 * receives its gateway token and a long-lived renewal credential in its
 * environment (`SAND_GATEWAY_TOKEN`, `SAND_INFERENCE_RENEWAL_CREDENTIAL`) and
 * renews its short-lived model token itself (`host/extensions/auth`).
 *
 * The local Docker box used the upstream app's development path instead: the
 * gateway token in plain `local-docker-vm.json`, and a one-hour model token,
 * later with the renewal credential beside it, in plain
 * `local-docker-credential/inference.json`, mounted into the box and
 * rewritten every five minutes (`SAND_DEV_INFERENCE_TOKEN_FILE`). Now the Mac
 * plays the upstream app's broker: the three secrets live in one file encrypted with
 * `safeStorage` (in memory only when encryption is unavailable), the box gets
 * them in its environment at creation, and it renews its own token. Those
 * plain files are adopted once and then removed.
 */
export interface LocalDockerSecrets { readonly gatewayToken?: string; readonly streamToken?: string; readonly boxCredential?: string }
export type LocalDockerSecretStorage = Pick<SecureStorageCodec, "isEncryptionAvailable" | "encryptString" | "decryptString">;
const LOCAL_DOCKER_SECRETS_FILE = "local-docker-secrets.json";
const LOCAL_DOCKER_SECRETS_VERSION = 1;
let secretStorage: LocalDockerSecretStorage | undefined;
let secretsCache: { readonly path: string; value: LocalDockerSecrets } | undefined;
let secretsQueue: Promise<unknown> = Promise.resolve();
let reportedInMemory = false;

/** Called once by the app's services with Electron's `safeStorage`, before the box is touched. */
export function configureLocalDockerSecretStorage(storage: LocalDockerSecretStorage): void {
  secretStorage = storage;
  secretsCache = undefined;
}

// The upstream app's rule, `resolveSecretStorageMode` in `secret-store.ts`: encrypted
// when encryption is available, in memory when it is not. Restated here so the
// connector does not load that module's telemetry.
function storageMode(storage: LocalDockerSecretStorage): "encrypted" | "in-memory" {
  return storage.isEncryptionAvailable() ? "encrypted" : "in-memory";
}

function requireSecretStorage(): LocalDockerSecretStorage {
  // Guessing here would mint new tokens and recreate the box on every
  // launch, so a caller that runs before the services is an error.
  if (secretStorage === undefined) throw new Error("The local Docker box's credential storage is not configured.");
  return secretStorage;
}

function secretsPath(settingsPath: string): string { return join(dirname(settingsPath), LOCAL_DOCKER_SECRETS_FILE); }
function legacyGatewayTokenPath(settingsPath: string): string { return join(dirname(settingsPath), "local-docker-vm.json"); }
function legacyCredentialDirectory(settingsPath: string): string { return join(dirname(settingsPath), "local-docker-credential"); }

function secretString(value: unknown, minLength: number): string | undefined {
  return typeof value === "string" && value.trim().length >= minLength ? value.trim() : undefined;
}

function parseSecrets(value: unknown): LocalDockerSecrets {
  if (typeof value !== "object" || value == null) return {};
  const record = value as Record<string, unknown>;
  const gatewayToken = secretString(record.gatewayToken, 32);
  const streamToken = secretString(record.streamToken, 32);
  const boxCredential = secretString(record.boxCredential, 16);
  return { ...(gatewayToken === undefined ? {} : { gatewayToken }), ...(streamToken === undefined ? {} : { streamToken }), ...(boxCredential === undefined ? {} : { boxCredential }) };
}

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown; } catch { return undefined; }
}

async function readLegacySecrets(settingsPath: string): Promise<LocalDockerSecrets> {
  const gateway = await readJson(legacyGatewayTokenPath(settingsPath)) as { token?: unknown } | undefined;
  const inference = await readJson(join(legacyCredentialDirectory(settingsPath), "inference.json")) as { renewalCredential?: unknown } | undefined;
  let stream: string | undefined;
  try { stream = (await readFile(join(legacyCredentialDirectory(settingsPath), "box-stream-token"), "utf8")).trim(); } catch {}
  return parseSecrets({ gatewayToken: gateway?.token, streamToken: stream, boxCredential: inference?.renewalCredential });
}

async function removeLegacySecrets(settingsPath: string): Promise<void> {
  await rm(legacyGatewayTokenPath(settingsPath), { force: true });
  await rm(legacyCredentialDirectory(settingsPath), { recursive: true, force: true });
}

async function loadSecrets(settingsPath: string): Promise<LocalDockerSecrets> {
  const path = secretsPath(settingsPath);
  if (secretsCache?.path === path) return secretsCache.value;
  const storage = requireSecretStorage();
  let stored: LocalDockerSecrets = {};
  if (storageMode(storage) === "encrypted") {
    const file = await readJson(path) as { version?: unknown; encrypted?: unknown } | undefined;
    if (file?.version === LOCAL_DOCKER_SECRETS_VERSION && typeof file.encrypted === "string") {
      try { stored = parseSecrets(JSON.parse(storage.decryptString(Buffer.from(file.encrypted, "base64")))); }
      catch (error) { computerStreamLine(`local docker: stored box credentials could not be decrypted (${error instanceof Error ? error.message : String(error)}); new ones will be made`); }
    }
  }
  const legacy = await readLegacySecrets(settingsPath);
  const value = { ...legacy, ...stored };
  secretsCache = { path, value };
  if (Object.keys(legacy).length > 0) await persistSecrets(settingsPath, value, { removeLegacy: true });
  return value;
}

async function persistSecrets(settingsPath: string, value: LocalDockerSecrets, options: { readonly removeLegacy?: boolean } = {}): Promise<void> {
  const path = secretsPath(settingsPath);
  secretsCache = { path, value };
  const storage = requireSecretStorage();
  if (storageMode(storage) !== "encrypted") {
    // The upstream app's rule: without encryption nothing is written; the values
    // live for this run only. Plain files already on disk are left alone.
    if (!reportedInMemory) { reportedInMemory = true; computerStreamLine("local docker: encryption is unavailable, so the box's credentials are kept in memory for this run only"); }
    return;
  }
  const payload = JSON.stringify({ version: LOCAL_DOCKER_SECRETS_VERSION, encrypted: storage.encryptString(JSON.stringify(value)).toString("base64") });
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, `${payload}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
  if (options.removeLegacy === true) {
    await removeLegacySecrets(settingsPath);
    computerStreamLine("local docker: box credentials moved from plain files to encrypted storage");
  }
}

// One change at a time: two concurrent writers must not each mint a token.
function updateSecrets(settingsPath: string, change: (current: LocalDockerSecrets) => LocalDockerSecrets): Promise<LocalDockerSecrets> {
  const run = async (): Promise<LocalDockerSecrets> => {
    const current = await loadSecrets(settingsPath);
    const next = change(current);
    if (next !== current) await persistSecrets(settingsPath, next);
    return next;
  };
  const next = secretsQueue.then(run, run);
  secretsQueue = next.catch(() => undefined);
  return next;
}

export async function readOrCreateToken(settingsPath: string): Promise<string> {
  const secrets = await updateSecrets(settingsPath, (current) => current.gatewayToken != null ? current : { ...current, gatewayToken: randomBytes(32).toString("hex") });
  return secrets.gatewayToken!;
}

/** The desktop stream's network token, one per install (`host/box-stream-guard.ts`). */
export async function readOrCreateStreamToken(settingsPath: string): Promise<string> {
  const secrets = await updateSecrets(settingsPath, (current) => current.streamToken != null ? current : { ...current, streamToken: randomBytes(32).toString("hex") });
  return secrets.streamToken!;
}

export async function readBoxCredential(settingsPath: string): Promise<string | undefined> {
  return (await updateSecrets(settingsPath, (current) => current)).boxCredential;
}

export async function storeBoxCredential(settingsPath: string, credential: string): Promise<void> {
  await updateSecrets(settingsPath, (current) => ({ ...current, boxCredential: credential }));
}

/**
 * What the container was made with. A box whose credentials no longer
 * match what the Mac holds is replaced, since the box reads them once, at
 * start, from its environment.
 */
export function localDockerCredentialsFingerprint(secrets: { readonly gatewayToken: string; readonly streamToken: string; readonly boxCredential?: string }): string {
  return createHash("sha256").update(JSON.stringify([secrets.gatewayToken, secrets.streamToken, secrets.boxCredential ?? ""])).digest("hex");
}

async function gatewayReady(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_DOCKER_GATEWAY_URL}/health`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch { return false; }
}

async function inspectContainer(): Promise<{ exists: boolean; running: boolean; owned: boolean; image: string; hostSha256: string; hasInferenceCredential: boolean; schemaVersion: string; credentialsSha256: string }> {
  const result = await runDocker(["inspect", "--format", "{{json .}}", LOCAL_DOCKER_BOX_CONTAINER]);
  if (!result.ok) return { exists: false, running: false, owned: false, image: "", hostSha256: "", hasInferenceCredential: false, schemaVersion: "", credentialsSha256: "" };
  try {
    const value = JSON.parse(result.output) as { State?: { Running?: unknown }; Config?: { Image?: unknown; Labels?: Record<string, unknown> } };
    return {
      exists: true,
      running: value.State?.Running === true,
      owned: value.Config?.Labels?.[LOCAL_DOCKER_LABEL_PREFIX] === "1" || value.Config?.Labels?.[LEGACY_LOCAL_DOCKER_LABEL_PREFIX] === "1",
      image: typeof value.Config?.Image === "string" ? value.Config.Image : "",
      hostSha256: typeof value.Config?.Labels?.[`${LOCAL_DOCKER_LABEL_PREFIX}.host-sha256`] === "string" ? value.Config.Labels[`${LOCAL_DOCKER_LABEL_PREFIX}.host-sha256`] as string : "",
      hasInferenceCredential: value.Config?.Labels?.[`${LOCAL_DOCKER_LABEL_PREFIX}.inference-credential`] === "1",
      schemaVersion: typeof value.Config?.Labels?.[`${LOCAL_DOCKER_LABEL_PREFIX}.schema-version`] === "string" ? value.Config.Labels[`${LOCAL_DOCKER_LABEL_PREFIX}.schema-version`] as string : "",
      credentialsSha256: typeof value.Config?.Labels?.[`${LOCAL_DOCKER_LABEL_PREFIX}.credentials-sha256`] === "string" ? value.Config.Labels[`${LOCAL_DOCKER_LABEL_PREFIX}.credentials-sha256`] as string : "",
    };
  } catch { throw new Error("Docker returned malformed container inspection data."); }
}

export function localDockerContainerNeedsReplace(
  inspected: { readonly schemaVersion: string; readonly hostSha256: string; readonly credentialsSha256?: string },
  hostSha256: string,
  credentialsSha256?: string,
): boolean {
  // The box reads its credentials once, at start, from its environment
  // (F-135, F-148); a container made with others would refuse the app's
  // gateway calls or stream, or renew with a revoked credential.
  const credentialsChanged = credentialsSha256 !== undefined && inspected.credentialsSha256 !== credentialsSha256;
  return inspected.schemaVersion !== LOCAL_DOCKER_SCHEMA_VERSION || inspected.hostSha256 !== hostSha256 || credentialsChanged;
}

export async function getLocalDockerStatus(settingsPath: string): Promise<LocalDockerStatus> {
  const daemon = await runDocker(["info", "--format", "{{.ServerVersion}}"]).catch(() => ({ ok: false, output: "Docker is not installed." }));
  if (!daemon.ok) return { available: false, running: false, ready: false, containerName: LOCAL_DOCKER_BOX_CONTAINER, image: localDockerBoxImage(), detail: daemon.output || "Docker is not running." };
  const inspected = await inspectContainer();
  if (!inspected.exists) return { available: true, running: false, ready: false, containerName: LOCAL_DOCKER_BOX_CONTAINER, image: localDockerBoxImage(), detail: "Ready to create the local VM." };
  if (!inspected.owned) return { available: true, running: inspected.running, ready: false, containerName: LOCAL_DOCKER_BOX_CONTAINER, image: inspected.image, detail: `Container ${LOCAL_DOCKER_BOX_CONTAINER} exists but is not owned by Simeon.` };
  const ready = inspected.running && await gatewayReady(await readOrCreateToken(settingsPath));
  return { available: true, running: inspected.running, ready, containerName: LOCAL_DOCKER_BOX_CONTAINER, image: inspected.image, detail: ready ? "Local Docker VM is ready." : inspected.running ? "Container is starting." : "Local Docker VM is stopped." };
}

let ensureInFlight: Promise<GatewayConnection> | undefined;

async function stageCurrentHostBundle(settingsPath: string): Promise<LocalHostBundle> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const readRuntime = async (relative: string): Promise<Buffer> => {
    const candidates = [resolve(moduleDirectory, `../${relative}`), resolve(moduleDirectory, `../../${relative}`)];
    for (const candidate of candidates) {
      try { return await readFile(candidate); } catch {}
    }
    throw new Error(`The reconstructed runtime is unavailable at ${candidates.join(" or ")}; refusing to start a stock local VM.`);
  };
  const hostBytes = await readRuntime("host/host-main.cjs");
  const boxExecDaemonBytes = await readRuntime("box-exec-daemon/main.cjs");
  const sha256 = createHash("sha256").update(hostBytes).digest("hex");
  const boxExecDaemonSha256 = createHash("sha256").update(boxExecDaemonBytes).digest("hex");
  const directory = join(dirname(settingsPath), "local-docker-runtime", `${sha256}-${boxExecDaemonSha256}`);
  const persistRuntime = async (name: string, bytes: Buffer): Promise<string> => {
    const target = join(directory, name);
    await mkdir(dirname(target), { recursive: true });
    try {
      const existing = await readFile(target);
      if (!existing.equals(bytes)) throw new Error(`Content-addressed local runtime ${target} has unexpected bytes.`);
    } catch (error) {
      if (error instanceof Error && !Reflect.has(error, "code")) throw error;
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, target);
    }
    return target;
  };
  await mkdir(directory, { recursive: true });
  return {
    path: await persistRuntime("host-main.cjs", hostBytes),
    sha256,
    boxExecDaemonPath: await persistRuntime("box-exec-daemon/main.cjs", boxExecDaemonBytes),
    boxExecDaemonSha256,
  };
}

async function localAuthMountArguments(): Promise<string[]> {
  return [];
}

// The box image carries its own default backend host. The container must be
// told ours on every creation: a container created without one would send
// its credential to the image's default host. The renewal credential is
// The upstream app's pod contract (`SAND_INFERENCE_RENEWAL_CREDENTIAL`): the host
// trades it for a short-lived model token at the backend and renews it
// itself, so nothing on the Mac writes a token for the box any more (F-148).
export function localDockerInferenceEnvironmentArguments(boxCredential?: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const backendUrl = getConfiguredBackendUrl(env);
  return [
    "--env", `SAND_BACKEND_URL=${backendUrl}`,
    ...(boxCredential == null || boxCredential.length === 0 ? [] : ["--env", `SAND_INFERENCE_RENEWAL_CREDENTIAL=${boxCredential}`]),
    "--env", `${SAND_INFERENCE_PROVIDER_ENV}=${PRODUCT_INFERENCE_PROVIDER}`,
    // The packaged Mac carries these guards in its main; the box never got
    // them, so the host buffered console lines, crash markers and product
    // events for the upstream app's AnalyticsService and posted them to Simeon Labs'
    // server every 3 s to get a 404 (design-audit-ledger.md F-376, F-378,
    // F-391). Schema 10 replaces a container created without them.
    "--env", "SAND_DISABLE_TELEMETRY=1",
    "--env", "SAND_DISABLE_ANALYTICS=1",
    "--env", "SAND_BOX_LOG_SHIP_DISABLED=1",
    // The served switches (docs/services-agents.md) default
    // on in both processes; an override set on the Mac reaches the box
    // too, since the host in the box is what polls the relay.
    ...SERVED_SWITCH_ENVS.flatMap((name) => { const value = readSimeonEnv(env, name)?.trim(); return value == null || value.length === 0 ? [] : ["--env", `${name}=${value}`]; }),
  ];
}
export const SERVED_SWITCH_ENVS = ["SAND_CONNECT_SERVED", "SAND_LISTENER_RELAY_SERVED", "SAND_CLOUD_AGENTS_SERVED", "SAND_SHARING_SERVED", "SAND_CHANNELS_SERVED", "SAND_VIDEO_SUBAGENT_SERVED", "SAND_SIMEON_VIDEO_MODEL", "SAND_AGENT_SCREENSHOT_TOOL", "SAND_FEATURE_GATE_OVERRIDES"] as const;

async function ensureLocalDockerBox(settingsPath: string): Promise<GatewayConnection> {
  try {
    return await ensureLocalDockerBoxNarrated(settingsPath);
  } catch (error) {
    computerStreamLine(`local docker FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function ensureLocalDockerBoxNarrated(settingsPath: string): Promise<GatewayConnection> {
  computerStreamLine("local docker: ensuring the box");
  const token = await readOrCreateToken(settingsPath);
  const hostBundle = await stageCurrentHostBundle(settingsPath);
  const streamToken = await readOrCreateStreamToken(settingsPath);
  const boxCredential = await readBoxCredential(settingsPath);
  const credentialsSha256 = localDockerCredentialsFingerprint({ gatewayToken: token, streamToken, ...(boxCredential === undefined ? {} : { boxCredential }) });
  const daemon = await runDocker(["info", "--format", "{{.ServerVersion}}"]).catch(() => ({ ok: false, output: "Docker is not installed." }));
  if (!daemon.ok) throw new Error(`Local Docker VM is selected, but Docker is unavailable: ${/ENOENT/.test(daemon.output) ? `no docker command was found (looked in PATH, /usr/local/bin, /opt/homebrew/bin, ~/.docker/bin and Docker.app); install Docker Desktop or set SAND_DOCKER_BINARY` : daemon.output || "start Docker and try again"}`);
  computerStreamLine(`local docker: daemon ${daemon.output.trim()}`);
  const inspected = await inspectContainer();
  computerStreamLine(`local docker: container exists=${inspected.exists} running=${inspected.running} owned=${inspected.owned} schema=${inspected.schemaVersion || "?"} hostBundleMatches=${inspected.hostSha256 === hostBundle.sha256}`);
  if (inspected.exists && !inspected.owned) throw new Error(`Local Docker VM cannot use ${LOCAL_DOCKER_BOX_CONTAINER}: an unowned container already has that name.`);
  if (inspected.exists && inspected.image !== localDockerBoxImageReference()) throw new Error(`Local Docker VM container uses unexpected image ${inspected.image}. Remove it explicitly before changing images.`);
  const shouldReplace = inspected.exists && localDockerContainerNeedsReplace(inspected, hostBundle.sha256, credentialsSha256);
  if (shouldReplace) {
    computerStreamLine("local docker: replacing the container (schema, host bundle or credentials changed)");
    const removed = await runDocker(["rm", "--force", LOCAL_DOCKER_BOX_CONTAINER]);
    if (!removed.ok) throw new Error(`Could not replace the local VM with the current app runtime: ${removed.output}`);
  }
  const current = shouldReplace ? await inspectContainer() : inspected;
  if (current.exists && !current.running) {
    computerStreamLine("local docker: starting the stopped container");
    const started = await runDocker(["start", LOCAL_DOCKER_BOX_CONTAINER]);
    if (!started.ok) throw new Error(`Could not start the local Docker VM: ${started.output}`);
  } else if (!current.exists) {
    computerStreamLine("local docker: creating the container");
    const authMounts = await localAuthMountArguments();
    const created = await runDocker([
      "run", "--detach", "--name", LOCAL_DOCKER_BOX_CONTAINER,
      "--label", LOCAL_DOCKER_OWNER_LABEL, "--label", `${LOCAL_DOCKER_LABEL_PREFIX}.host-sha256=${hostBundle.sha256}`,
      "--label", `${LOCAL_DOCKER_LABEL_PREFIX}.box-exec-daemon-sha256=${hostBundle.boxExecDaemonSha256}`,
      "--label", `${LOCAL_DOCKER_LABEL_PREFIX}.inference-credential=${boxCredential == null ? "0" : "1"}`,
      "--label", `${LOCAL_DOCKER_LABEL_PREFIX}.schema-version=${LOCAL_DOCKER_SCHEMA_VERSION}`,
      "--label", `${LOCAL_DOCKER_LABEL_PREFIX}.credentials-sha256=${credentialsSha256}`,
      "--platform", "linux/amd64", "--restart", "unless-stopped",
      "--env", "SAND_SUPERVISOR_ENABLED=1", "--env", "SAND_BOX_AUTO_UPDATE=0", "--env", "SAND_USE_EXISTING_BOX_EXEC_DAEMON=1",
      // The host's data root is the volume below, said here rather than left to the image's environment (F-362).
      "--env", "SAND_DATA_ROOT=/home/box/sand-data", "--env", "SAND_TREE_SITTER_NODE_DEPS=/home/box/deps", "--env", "NODE_PATH=/home/box/deps", "--env", "SAND_GATEWAY_BIND_HOST=0.0.0.0", "--env", "SAND_HOST_PORT=1340", "--env", `SAND_GATEWAY_TOKEN=${token}`,
      ...localDockerInferenceEnvironmentArguments(boxCredential),
      "--env", `SAND_BOX_STREAM_NETWORK_TOKEN=${streamToken}`,
      // The gateway (1340) and the screen only. The exec daemon (1337) and
      // the fork router (1339) take the fixed bearer "local" and nothing on
      // the Mac dials them (grep 25 September 2026). The screen is the
      // host's token guard, not websockify (F-135): until 26 September
      // 2026 6080/6081 were websockify itself, with no credential, so any
      // web page open on the Mac could drive the agent's desktop.
      "--publish", "127.0.0.1:1340:1340",
      ...LOCAL_DOCKER_STREAM_PUBLISH.flatMap((mapping) => ["--publish", mapping]),
      "--volume", "simeon-box-workspace:/workspace", "--volume", "simeon-box-data:/home/box/sand-data",
      "--mount", `type=bind,src=${hostBundle.path},dst=/home/box/sand-host/host-main.cjs,readonly`,
      "--mount", `type=bind,src=${dirname(hostBundle.boxExecDaemonPath)},dst=/home/box/box-exec-daemon,readonly`,
      ...authMounts,
      localDockerBoxImageReference(),
    ]);
    if (!created.ok) throw new Error(`Could not create the local Docker VM: ${created.output}`);
  }
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const waitStarted = Date.now();
  let reported = false;
  while (Date.now() < deadline) {
    if (await gatewayReady(token)) {
      computerStreamLine(`local docker: gateway ready at ${LOCAL_DOCKER_GATEWAY_URL} after ${Math.round((Date.now() - waitStarted) / 1000)}s`);
      return { baseUrl: LOCAL_DOCKER_GATEWAY_URL, token, vncProxy: localDockerVncProxy(streamToken) };
    }
    if (!reported && Date.now() - waitStarted > 20_000) { reported = true; computerStreamLine("local docker: gateway not answering yet after 20s; still waiting (up to 3 minutes)"); }
    const state = await inspectContainer();
    if (!state.running) {
      const logs = await runDocker(["logs", "--tail", "80", LOCAL_DOCKER_BOX_CONTAINER]);
      throw new Error(`Local Docker VM stopped before its gateway became ready.\n${logs.output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Local Docker VM did not expose its gateway within three minutes.");
}

function queuedEnsure(settingsPath: string): Promise<GatewayConnection> {
  return ensureInFlight ?? (ensureInFlight = ensureLocalDockerBox(settingsPath).finally(() => { ensureInFlight = undefined; }));
}

export async function startLocalDockerBox(settingsPath: string): Promise<GatewayConnection> {
  return await queuedEnsure(settingsPath);
}

// Quitting Simeon stops the box unless a routine needs it. The agent runs
// inside the container, so until 22 September 2026 a turn kept calling the
// model after the window was closed; from then the box always stopped on
// quit, which made routines fire only while the app was open. The founder,
// 25 September 2026: the Mac can be awake while the app is closed, and a
// routine should still execute; spend is the routine's and the box's
// business (the hidden-turn budget, the proxy's hourly cap, the user-away
// guard that pauses routines), not a reason to make the feature useless.
// So: with at least one enabled routine the box is kept; with none it is
// stopped, the brake of before. SAND_KEEP_BOX_RUNNING_ON_QUIT=1 keeps it
// always, SAND_STOP_BOX_ON_QUIT=1 stops it always. Sleep and shutdown stop
// it regardless: a local computer cannot run with the Mac off.
export const SAND_KEEP_BOX_RUNNING_ON_QUIT_ENV = "SAND_KEEP_BOX_RUNNING_ON_QUIT";
export const SAND_STOP_BOX_ON_QUIT_ENV = "SAND_STOP_BOX_ON_QUIT";
const flag = (value: string | undefined): boolean => /^(1|true|yes)$/i.test(value?.trim() ?? "");
export function shouldStopLocalDockerBoxOnQuit(boxRuntime: string, env: NodeJS.ProcessEnv = process.env, hasEnabledRoutine = false): boolean {
  if (boxRuntime !== "local-docker") return false;
  if (flag(env[SAND_STOP_BOX_ON_QUIT_ENV])) return true;
  if (flag(env[SAND_KEEP_BOX_RUNNING_ON_QUIT_ENV])) return false;
  return !hasEnabledRoutine;
}
// Asked of the box itself at quit, on the gateway's own wire, because the
// coordinator is already gone by then: any routine, any agent, enabled.
export async function localBoxHasEnabledRoutine(settingsPath: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const token = await readOrCreateToken(settingsPath);
  const response = await fetchImpl(`${LOCAL_DOCKER_GATEWAY_URL}/api/listAllAutomations`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`listAllAutomations answered ${response.status}`);
  const routines = await response.json() as unknown;
  return Array.isArray(routines) && routines.some((routine) => typeof routine === "object" && routine != null && (routine as { isEnabled?: unknown }).isEnabled === true);
}
export async function stopLocalDockerBoxOnQuit(options: { readonly boxRuntime: string; readonly env?: NodeJS.ProcessEnv; readonly stop?: () => Promise<void>; readonly log?: (line: string) => void; readonly timeoutMs?: number; readonly hasEnabledRoutine?: () => Promise<boolean> }): Promise<"stopped" | "kept" | "failed" | "timed-out"> {
  const log = options.log ?? computerStreamLine;
  let hasEnabledRoutine = false;
  if (options.boxRuntime === "local-docker" && options.hasEnabledRoutine != null) {
    try { hasEnabledRoutine = await options.hasEnabledRoutine(); }
    catch (error) { log(`local docker: could not ask the box for its routines (${error instanceof Error ? error.message : String(error)}); stopping it`); }
  }
  if (!shouldStopLocalDockerBoxOnQuit(options.boxRuntime, options.env, hasEnabledRoutine)) { log(hasEnabledRoutine ? "local docker: kept running on quit for an enabled routine" : "local docker: kept running on quit"); return "kept"; }
  const stop = options.stop ?? stopLocalDockerBox;
  let timer: NodeJS.Timeout | undefined;
  try {
    const outcome = await Promise.race([
      stop().then(() => "stopped" as const, (error: unknown) => { log(`local docker: stop on quit FAILED: ${error instanceof Error ? error.message : String(error)}`); return "failed" as const; }),
      new Promise<"timed-out">((resolve) => { timer = setTimeout(() => resolve("timed-out"), options.timeoutMs ?? 15_000); }),
    ]);
    log(outcome === "stopped" ? "local docker: stopped on quit" : outcome === "timed-out" ? "local docker: stop on quit did not finish in time; the container may still be running" : "local docker: stop on quit failed");
    return outcome;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function stopLocalDockerBox(): Promise<void> {
  const inspected = await inspectContainer();
  if (!inspected.exists || !inspected.running) return;
  if (!inspected.owned) throw new Error(`Refusing to stop unowned container ${LOCAL_DOCKER_BOX_CONTAINER}.`);
  const stopped = await runDocker(["stop", LOCAL_DOCKER_BOX_CONTAINER]);
  if (!stopped.ok) throw new Error(`Could not stop the local Docker VM: ${stopped.output}`);
}

// The box renews its own model token with its renewal credential (the
// upstream app's production path, `host/extensions/auth/auth-service.ts`), so the
// Mac no longer rewrites a token file every five minutes (F-148, 26
// September 2026; until then `startInferenceCredentialKeepFresh` did, the
// development path's way of keeping a one-hour token alive).
//
// The credential is minted once per box and kept, encrypted, for the box's
// life: the server revokes the previous credential on every mint, so
// minting per run, as the Mac did until today, would kill the credential
// the running box was created with. One mint at a time for the same reason.
let mintInFlight: Promise<string | undefined> | undefined;
export async function ensureBoxCredential(
  settingsPath: string,
  issue: (() => Promise<{ readonly credential: string } | undefined>) | undefined,
  log: (line: string) => void = computerStreamLine,
): Promise<string | undefined> {
  const existing = await readBoxCredential(settingsPath);
  if (existing != null || issue == null) return existing;
  mintInFlight ??= (async () => {
    try {
      const again = await readBoxCredential(settingsPath);
      if (again != null) return again;
      const minted = await issue().catch(() => undefined);
      if (minted == null || minted.credential.length === 0) {
        log("local docker: no box credential (not signed in?); the box cannot reach the model until Simeon is signed in");
        return undefined;
      }
      await storeBoxCredential(settingsPath, minted.credential);
      log("local docker: box credential minted and stored encrypted");
      return minted.credential;
    } finally {
      mintInFlight = undefined;
    }
  })();
  return mintInFlight;
}

// Sign-out forgets what the box was lent (25 September 2026). The server
// revokes the box credential with the session; the Mac drops its copy so
// the next sign-in mints a new one, and the box is replaced with it.
export async function forgetInferenceCredential(settingsPath: string, options: { readonly log?: (line: string) => void } = {}): Promise<void> {
  const log = options.log ?? computerStreamLine;
  try {
    await updateSecrets(settingsPath, (current) => {
      if (current.boxCredential == null) return current;
      const { boxCredential: _dropped, ...rest } = current;
      return rest;
    });
    await rm(join(legacyCredentialDirectory(settingsPath), "inference.json"), { force: true });
    log("local docker: box credential forgotten (signed out)");
  } catch (error) {
    log(`local docker: box credential NOT forgotten: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function createSettingsRoutedHostConnector(
  remote: SandRemoteHostConnector,
  settings: SandSettingsStore,
): SandRemoteHostConnector {
  const localConnect = (): Promise<GatewayConnection> => {
    return (async () => {
      // The box's renewal credential, minted once and kept encrypted, is
      // what the box renews its model token with, app open or closed.
      const before = await readBoxCredential(settings.settingsPath);
      const credential = await ensureBoxCredential(settings.settingsPath, remote.issueBoxRenewalCredential == null ? undefined : () => remote.issueBoxRenewalCredential!());
      const connection = await queuedEnsure(settings.settingsPath);
      // A start already in flight when the credential was minted (the one
      // at launch) made the box without it; replace it now, at connect,
      // rather than on some later call in the middle of a turn.
      return credential !== before ? await queuedEnsure(settings.settingsPath) : connection;
    })();
  };
  return {
    connect: async () => settings.getBoxRuntime() === "local-docker" ? await localConnect() : await remote.connect(),
    // The local-exec daemon credential re-resolves a *cloud* box's gateway
    // through the backend; the local Docker runtime writes the connection
    // file itself, and the route is not served, so until 25 September 2026
    // this was one 404 with the bearer every 30 s for the app's life (F-413).
    ...(remote.issueLocalExecDaemonCredential == null ? {} : { issueLocalExecDaemonCredential: async () => settings.getBoxRuntime() === "local-docker" ? undefined : await remote.issueLocalExecDaemonCredential!() }),
    ...(remote.issueInferenceCredential == null ? {} : { issueInferenceCredential: remote.issueInferenceCredential.bind(remote) }),
    recreate: async (args): Promise<RecreateResult> => {
      if (settings.getBoxRuntime() !== "local-docker") {
        if (remote.recreate == null) throw new Error("Remote computer recreation is unavailable.");
        return await remote.recreate(args);
      }
      const stopped = await runDocker(["restart", LOCAL_DOCKER_BOX_CONTAINER]);
      if (!stopped.ok) throw new Error(`Could not restart the local Docker VM: ${stopped.output}`);
      await localConnect();
      return { status: "started-untrackable" };
    },
    forceRecreate: async (): Promise<RecreateResult> => {
      if (settings.getBoxRuntime() !== "local-docker") {
        if (remote.forceRecreate == null) return { status: "rejected", reason: "Remote computer reset is unavailable." };
        return await remote.forceRecreate();
      }
      const removed = await runDocker(["rm", "--force", LOCAL_DOCKER_BOX_CONTAINER]);
      if (!removed.ok && !/no such container/i.test(removed.output)) return { status: "rejected", reason: removed.output };
      await localConnect();
      return { status: "started-untrackable" };
    },
  };
}

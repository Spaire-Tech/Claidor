import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CAISRA_CLAUDE_CODE_ENV, PRODUCT_INFERENCE_PROVIDER, SAND_INFERENCE_PROVIDER_ENV } from "../../shared/inference-router.js";
import { getConfiguredBackendUrl } from "../../shared/node/cursor-token.js";
import type { SandSettingsStore } from "../../shared/node/settings/sand-settings-store.js";
import type { RecreateResult } from "./box-recreate-commands.js";
import type { SandRemoteHostConnector } from "./box-host-connector.js";
import type { GatewayConnection } from "./gateway-descriptor-cache.js";
import { computerStreamLine } from "../vnc/computer-stream-log.js";

export const LOCAL_DOCKER_BOX_IMAGE = "public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest";
// The tag is Cursor's and mutable. A digest pins the box (F-412, F-363):
// `SAND_BOX_IMAGE_DIGEST=<64 hex>` makes every create run `image@sha256:<digest>`
// and refuse a container on any other reference. The digest is read on a
// Mac (`docker image inspect --format '{{index .RepoDigests 0}}' <image>`)
// and recorded in docs/product/box-substrate-read.md; none is pinned yet.
export function localDockerBoxImageReference(env: NodeJS.ProcessEnv = process.env): string {
  const digest = env.SAND_BOX_IMAGE_DIGEST?.trim().toLowerCase().replace(/^sha256:/, "") ?? "";
  return /^[0-9a-f]{64}$/.test(digest) ? `${LOCAL_DOCKER_BOX_IMAGE}@sha256:${digest}` : LOCAL_DOCKER_BOX_IMAGE;
}
// The container carries our own name. Until 23 September 2026 it was
// "grok-bot-local-vm", the name this tree's origin (Grok Bot 0.18) gave its
// own local mode, so an installed Grok Bot and Simeon would have contended
// for one container, and the replace below would have removed the other's.
// The two volumes keep their names on purpose: the workspace and the host's
// data carry over to the renamed container unchanged. A leftover
// "grok-bot-local-vm" is not removed by this app, because the same name may
// be the real Grok Bot's; `docker rm -f grok-bot-local-vm` by hand, once,
// after checking that it mounts our host bundle.
export const LOCAL_DOCKER_BOX_CONTAINER = "simeon-box";
export const LOCAL_DOCKER_GATEWAY_URL = "http://127.0.0.1:1340";
export const LOCAL_DOCKER_OWNER_LABEL = "com.grok-bot.local-vm=1";
export const LOCAL_DOCKER_SCHEMA_VERSION = "10";
export const LOCAL_DOCKER_INFERENCE_TOKEN_FILE = "/run/grok-bot/inference.json";
const READY_TIMEOUT_MS = 180_000;
export const OPTIONAL_CREDENTIAL_WAIT_MS = 250;

export interface LocalDockerStatus {
  readonly available: boolean;
  readonly running: boolean;
  readonly ready: boolean;
  readonly containerName: string;
  readonly image: string;
  readonly detail: string;
}

interface CommandResult { readonly ok: boolean; readonly output: string }
interface InferenceCredential { readonly accessToken: string; readonly backendUrl: string; readonly expiresAtMs: number; readonly renewalCredential?: string }
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

function credentialPath(settingsPath: string): string {
  return join(dirname(settingsPath), "local-docker-vm.json");
}

function inferenceCredentialPath(settingsPath: string): string {
  return join(dirname(settingsPath), "local-docker-credential", "inference.json");
}

// The app fires its box calls in a burst at startup, and each one runs
// this connect. Until 22 September 2026 every caller wrote the token file
// through the same temporary name, so the first rename won and the rest
// failed with "no such file", which failed the whole connect: the box was
// up, the app could not reach it, and the agent worked with nothing on
// screen. One writer at a time now, each with its own temporary name.
let persistQueue: Promise<unknown> = Promise.resolve();
let persistSerial = 0;
export function persistInferenceCredential(settingsPath: string, credential: InferenceCredential): Promise<string> {
  const write = async (): Promise<string> => {
    const target = inferenceCredentialPath(settingsPath);
    persistSerial += 1;
    const temporary = `${target}.${process.pid}.${persistSerial}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    // `renewalCredential` is what lets the box outlive the app (the host's
    // auth service trades it for a token when this file goes stale).
    await writeFile(temporary, `${JSON.stringify({ accessToken: credential.accessToken, expiresAtMs: credential.expiresAtMs, ...(credential.renewalCredential == null ? {} : { renewalCredential: credential.renewalCredential }) })}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600);
    return target;
  };
  const next = persistQueue.then(write, write);
  persistQueue = next.catch(() => undefined);
  return next;
}

async function ensureInferenceCredentialDirectory(settingsPath: string): Promise<string> {
  const target = inferenceCredentialPath(settingsPath);
  await mkdir(dirname(target), { recursive: true });
  return dirname(target);
}

async function readOrCreateToken(settingsPath: string): Promise<string> {
  const target = credentialPath(settingsPath);
  try {
    const parsed = JSON.parse(await readFile(target, "utf8")) as { token?: unknown };
    if (typeof parsed.token === "string" && parsed.token.length >= 32) return parsed.token;
  } catch {}
  const token = randomBytes(32).toString("hex");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ schemaVersion: 1, token }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(target, 0o600);
  return token;
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

async function inspectContainer(): Promise<{ exists: boolean; running: boolean; owned: boolean; image: string; hostSha256: string; hasInferenceCredential: boolean; schemaVersion: string }> {
  const result = await runDocker(["inspect", "--format", "{{json .}}", LOCAL_DOCKER_BOX_CONTAINER]);
  if (!result.ok) return { exists: false, running: false, owned: false, image: "", hostSha256: "", hasInferenceCredential: false, schemaVersion: "" };
  try {
    const value = JSON.parse(result.output) as { State?: { Running?: unknown }; Config?: { Image?: unknown; Labels?: Record<string, unknown> } };
    return {
      exists: true,
      running: value.State?.Running === true,
      owned: value.Config?.Labels?.["com.grok-bot.local-vm"] === "1",
      image: typeof value.Config?.Image === "string" ? value.Config.Image : "",
      hostSha256: typeof value.Config?.Labels?.["com.grok-bot.local-vm.host-sha256"] === "string" ? value.Config.Labels["com.grok-bot.local-vm.host-sha256"] as string : "",
      hasInferenceCredential: value.Config?.Labels?.["com.grok-bot.local-vm.inference-credential"] === "1",
      schemaVersion: typeof value.Config?.Labels?.["com.grok-bot.local-vm.schema-version"] === "string" ? value.Config.Labels["com.grok-bot.local-vm.schema-version"] as string : "",
    };
  } catch { throw new Error("Docker returned malformed container inspection data."); }
}

export function localDockerContainerNeedsReplace(
  inspected: { readonly schemaVersion: string; readonly hostSha256: string },
  hostSha256: string,
): boolean {
  return inspected.schemaVersion !== LOCAL_DOCKER_SCHEMA_VERSION || inspected.hostSha256 !== hostSha256;
}

export async function getLocalDockerStatus(settingsPath: string): Promise<LocalDockerStatus> {
  const daemon = await runDocker(["info", "--format", "{{.ServerVersion}}"]).catch(() => ({ ok: false, output: "Docker is not installed." }));
  if (!daemon.ok) return { available: false, running: false, ready: false, containerName: LOCAL_DOCKER_BOX_CONTAINER, image: LOCAL_DOCKER_BOX_IMAGE, detail: daemon.output || "Docker is not running." };
  const inspected = await inspectContainer();
  if (!inspected.exists) return { available: true, running: false, ready: false, containerName: LOCAL_DOCKER_BOX_CONTAINER, image: LOCAL_DOCKER_BOX_IMAGE, detail: "Ready to create the local VM." };
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
// told ours on every creation, not only when the optional credential race was
// won: a container created without one would otherwise send whatever token it
// is later handed to the image's default host.
export function localDockerInferenceEnvironmentArguments(inferenceCredential?: Pick<InferenceCredential, "backendUrl">, env: NodeJS.ProcessEnv = process.env): string[] {
  const backendUrl = inferenceCredential?.backendUrl ?? getConfiguredBackendUrl(env);
  return [
    "--env", `SAND_BACKEND_URL=${backendUrl}`,
    "--env", `SAND_DEV_INFERENCE_TOKEN_FILE=${LOCAL_DOCKER_INFERENCE_TOKEN_FILE}`,
    "--env", `${SAND_INFERENCE_PROVIDER_ENV}=${PRODUCT_INFERENCE_PROVIDER}`,
    "--env", `${CAISRA_CLAUDE_CODE_ENV}=0`,
    // The packaged Mac carries these guards in its main; the box never got
    // them, so the host buffered console lines, crash markers and product
    // events for Cursor's AnalyticsService and posted them to Simeon Labs'
    // server every 3 s to get a 404 (design-audit-ledger.md F-376, F-378,
    // F-391). Schema 10 replaces a container created without them.
    "--env", "SAND_DISABLE_TELEMETRY=1",
    "--env", "SAND_DISABLE_ANALYTICS=1",
    "--env", "SAND_BOX_LOG_SHIP_DISABLED=1",
    // The served switches (docs/product/cursor-dependencies-map.md) default
    // on in both processes; an override set on the Mac reaches the box
    // too, since the host in the box is what polls the relay.
    ...SERVED_SWITCH_ENVS.flatMap((name) => { const value = env[name]?.trim(); return value == null || value.length === 0 ? [] : ["--env", `${name}=${value}`]; }),
  ];
}
export const SERVED_SWITCH_ENVS = ["SAND_CONNECT_SERVED", "SAND_LISTENER_RELAY_SERVED", "SAND_CLOUD_AGENTS_SERVED", "SAND_SHARING_SERVED", "SAND_CHANNELS_SERVED", "SAND_VIDEO_SUBAGENT_SERVED", "SAND_CLAIDOR_VIDEO_MODEL", "SAND_AGENT_SCREENSHOT_TOOL"] as const;

async function ensureLocalDockerBox(settingsPath: string, inferenceCredential?: InferenceCredential): Promise<GatewayConnection> {
  try {
    return await ensureLocalDockerBoxNarrated(settingsPath, inferenceCredential);
  } catch (error) {
    computerStreamLine(`local docker FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function ensureLocalDockerBoxNarrated(settingsPath: string, inferenceCredential?: InferenceCredential): Promise<GatewayConnection> {
  computerStreamLine("local docker: ensuring the box");
  const token = await readOrCreateToken(settingsPath);
  const hostBundle = await stageCurrentHostBundle(settingsPath);
  const inferenceDir = await ensureInferenceCredentialDirectory(settingsPath);
  if (inferenceCredential != null) await persistInferenceCredential(settingsPath, inferenceCredential);
  const daemon = await runDocker(["info", "--format", "{{.ServerVersion}}"]).catch(() => ({ ok: false, output: "Docker is not installed." }));
  if (!daemon.ok) throw new Error(`Local Docker VM is selected, but Docker is unavailable: ${/ENOENT/.test(daemon.output) ? `no docker command was found (looked in PATH, /usr/local/bin, /opt/homebrew/bin, ~/.docker/bin and Docker.app); install Docker Desktop or set SAND_DOCKER_BINARY` : daemon.output || "start Docker and try again"}`);
  computerStreamLine(`local docker: daemon ${daemon.output.trim()}`);
  const inspected = await inspectContainer();
  computerStreamLine(`local docker: container exists=${inspected.exists} running=${inspected.running} owned=${inspected.owned} schema=${inspected.schemaVersion || "?"} hostBundleMatches=${inspected.hostSha256 === hostBundle.sha256}`);
  if (inspected.exists && !inspected.owned) throw new Error(`Local Docker VM cannot use ${LOCAL_DOCKER_BOX_CONTAINER}: an unowned container already has that name.`);
  if (inspected.exists && inspected.image !== localDockerBoxImageReference()) throw new Error(`Local Docker VM container uses unexpected image ${inspected.image}. Remove it explicitly before changing images.`);
  const shouldReplace = inspected.exists && localDockerContainerNeedsReplace(inspected, hostBundle.sha256);
  if (shouldReplace) {
    computerStreamLine("local docker: replacing the container (schema or host bundle changed)");
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
      "--label", LOCAL_DOCKER_OWNER_LABEL, "--label", `com.grok-bot.local-vm.host-sha256=${hostBundle.sha256}`,
      "--label", `com.grok-bot.local-vm.box-exec-daemon-sha256=${hostBundle.boxExecDaemonSha256}`,
      "--label", `com.grok-bot.local-vm.inference-credential=${inferenceCredential == null ? "0" : "1"}`,
      "--label", `com.grok-bot.local-vm.schema-version=${LOCAL_DOCKER_SCHEMA_VERSION}`,
      "--platform", "linux/amd64", "--restart", "unless-stopped",
      "--env", "SAND_SUPERVISOR_ENABLED=1", "--env", "SAND_BOX_AUTO_UPDATE=0", "--env", "SAND_USE_EXISTING_BOX_EXEC_DAEMON=1",
      // The host's data root is the volume below, said here rather than left to the image's environment (F-362).
      "--env", "SAND_DATA_ROOT=/home/box/sand-data", "--env", "SAND_TREE_SITTER_NODE_DEPS=/home/box/deps", "--env", "NODE_PATH=/home/box/deps", "--env", "SAND_GATEWAY_BIND_HOST=0.0.0.0", "--env", "SAND_HOST_PORT=1340", "--env", `SAND_GATEWAY_TOKEN=${token}`,
      ...localDockerInferenceEnvironmentArguments(inferenceCredential),
      // The gateway (1340) and the screen (6080/6081) only. The exec daemon
      // (1337) and the fork router (1339) take the fixed bearer "local" and
      // nothing on the Mac dials them (grep 25 September 2026).
      "--publish", "127.0.0.1:1340:1340",
      "--publish", "127.0.0.1:6080:6080", "--publish", "127.0.0.1:6081:6081", 
      "--volume", "grok-bot-local-vm-workspace:/workspace", "--volume", "grok-bot-local-vm-data:/home/box/sand-data",
      "--mount", `type=bind,src=${hostBundle.path},dst=/home/box/sand-host/host-main.cjs,readonly`,
      "--mount", `type=bind,src=${dirname(hostBundle.boxExecDaemonPath)},dst=/home/box/box-exec-daemon,readonly`,
      "--mount", `type=bind,src=${inferenceDir},dst=/run/grok-bot,readonly`,
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
      return { baseUrl: LOCAL_DOCKER_GATEWAY_URL, token };
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

function queuedEnsure(settingsPath: string, inferenceCredential?: InferenceCredential): Promise<GatewayConnection> {
  const run = ensureInFlight ?? (ensureInFlight = ensureLocalDockerBox(settingsPath, inferenceCredential).finally(() => { ensureInFlight = undefined; }));
  return run.then(async (connection) => {
    if (inferenceCredential != null) await persistInferenceCredential(settingsPath, inferenceCredential);
    return connection;
  });
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

// The box reads its bearer token from the file the Mac writes at connect
// (`/run/grok-bot/inference.json`, re-read by the host's renewer as it
// nears expiry). Until 24 September 2026 nothing rewrote that file after
// connect, and a desktop access token lives one hour: every box older than
// that called the model with an expired token and the agent failed with
// "Unauthorized" until the app reconnected. The Mac now re-issues the
// credential every few minutes and rewrites the file when it changed; the
// host's renewer re-reads an expired file every 30 s, so it picks the new
// token up within the minute.
export const INFERENCE_CREDENTIAL_KEEP_FRESH_INTERVAL_MS = 5 * 60_000;
let keepFreshTimer: ReturnType<typeof setInterval> | undefined;
let lastPersistedAccessToken: string | undefined;

let boxRenewalCredential: string | undefined;
export function rememberBoxRenewalCredential(credential: string | undefined): void { boxRenewalCredential = credential; }
function withBoxRenewalCredential(credential: InferenceCredential): InferenceCredential {
  return boxRenewalCredential == null ? credential : { ...credential, renewalCredential: boxRenewalCredential };
}

export async function refreshInferenceCredentialFile(
  issue: () => Promise<InferenceCredential | undefined>,
  settingsPath: string,
  persist: (settingsPath: string, credential: InferenceCredential) => Promise<unknown> = persistInferenceCredential,
): Promise<"rewritten" | "unchanged" | "unavailable"> {
  let issued: InferenceCredential | undefined;
  try { issued = await issue(); } catch { issued = undefined; }
  if (issued == null || issued.accessToken.length === 0) return "unavailable";
  if (issued.accessToken === lastPersistedAccessToken) return "unchanged";
  await persist(settingsPath, withBoxRenewalCredential(issued));
  lastPersistedAccessToken = issued.accessToken;
  return "rewritten";
}

export function startInferenceCredentialKeepFresh(
  issue: (() => Promise<InferenceCredential | undefined>) | undefined,
  settingsPath: string,
  options: { readonly intervalMs?: number; readonly setIntervalImpl?: typeof setInterval; readonly log?: (line: string) => void } = {},
): void {
  if (keepFreshTimer != null || issue == null) return;
  const log = options.log ?? computerStreamLine;
  const timer = (options.setIntervalImpl ?? setInterval)(() => {
    void refreshInferenceCredentialFile(issue, settingsPath).then((outcome) => {
      if (outcome === "rewritten") log("local docker: inference credential rewritten");
      else if (outcome === "unavailable") log("local docker: inference credential unavailable (not signed in?); the box keeps its last token");
    }, (error: unknown) => log(`local docker: inference credential rewrite FAILED: ${error instanceof Error ? error.message : String(error)}`));
  }, options.intervalMs ?? INFERENCE_CREDENTIAL_KEEP_FRESH_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  keepFreshTimer = timer;
}

export function stopInferenceCredentialKeepFresh(): void {
  if (keepFreshTimer != null) clearInterval(keepFreshTimer);
  keepFreshTimer = undefined;
}

// Sign-out forgets everything the box was lent (25 September 2026): the
// keep-fresh timer stops, the box's renewal credential is dropped so the
// next connect mints a new one for the next person, and the token file
// goes. Until then a sign-out deleted the keychain entries and nothing
// else, and if the server could not be told (offline) the plaintext token
// on disk stayed good for up to an hour and the box kept using it.
export async function forgetInferenceCredential(settingsPath: string, options: { readonly log?: (line: string) => void; readonly remove?: (path: string) => Promise<void> } = {}): Promise<void> {
  stopInferenceCredentialKeepFresh();
  boxRenewalCredential = undefined;
  lastPersistedAccessToken = undefined;
  const log = options.log ?? computerStreamLine;
  const path = inferenceCredentialPath(settingsPath);
  try {
    await (options.remove ?? ((target: string) => rm(target, { force: true })))(path);
    log("local docker: inference credential forgotten (signed out)");
  } catch (error) {
    log(`local docker: inference credential NOT forgotten: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function createSettingsRoutedHostConnector(
  remote: SandRemoteHostConnector,
  settings: SandSettingsStore,
): SandRemoteHostConnector {
  const localConnect = (): Promise<GatewayConnection> => {
    return (async () => {
      // The box's own renewal credential rides in the token file, so a box
      // that outlives the app (routines fire while the Mac is awake) can
      // renew its access token without the Mac. Minted once per app run.
      if (boxRenewalCredential == null && remote.issueBoxRenewalCredential != null) {
        const minted = await remote.issueBoxRenewalCredential().catch(() => undefined);
        if (minted != null) { boxRenewalCredential = minted.credential; computerStreamLine("local docker: box renewal credential minted"); }
        else computerStreamLine("local docker: no box renewal credential (not signed in?); the box will not outlive the app's token");
      }
      const pending = remote.issueInferenceCredential == null
        ? Promise.resolve(undefined)
        : remote.issueInferenceCredential().then((value) => value == null ? undefined : withBoxRenewalCredential(value)).catch(() => undefined);
      const issued = await Promise.race([
        pending,
        new Promise<undefined>((resolve) => setTimeout(resolve, OPTIONAL_CREDENTIAL_WAIT_MS)),
      ]);
      const connection = await queuedEnsure(settings.settingsPath, issued);
      const late = await pending;
      if (late != null && late !== issued) await persistInferenceCredential(settings.settingsPath, late);
      lastPersistedAccessToken = (late ?? issued)?.accessToken ?? lastPersistedAccessToken;
      startInferenceCredentialKeepFresh(
        remote.issueInferenceCredential == null ? undefined : () => remote.issueInferenceCredential!(),
        settings.settingsPath,
      );
      return connection;
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

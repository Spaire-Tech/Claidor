import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
export const LOCAL_DOCKER_BOX_CONTAINER = "grok-bot-local-vm";
export const LOCAL_DOCKER_GATEWAY_URL = "http://127.0.0.1:1340";
export const LOCAL_DOCKER_OWNER_LABEL = "com.grok-bot.local-vm=1";
export const LOCAL_DOCKER_SCHEMA_VERSION = "9";
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
interface InferenceCredential { readonly accessToken: string; readonly backendUrl: string; readonly expiresAtMs: number }
interface LocalHostBundle { readonly path: string; readonly sha256: string; readonly boxExecDaemonPath: string; readonly boxExecDaemonSha256: string }

function runDocker(args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", [...args], { stdio: ["ignore", "pipe", "pipe"] });
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

async function persistInferenceCredential(settingsPath: string, credential: InferenceCredential): Promise<string> {
  const target = inferenceCredentialPath(settingsPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ accessToken: credential.accessToken, expiresAtMs: credential.expiresAtMs })}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  await chmod(target, 0o600);
  return target;
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
  ];
}

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
  if (!daemon.ok) throw new Error(`Local Docker VM is selected, but Docker is unavailable: ${daemon.output || "start Docker and try again"}`);
  computerStreamLine(`local docker: daemon ${daemon.output.trim()}`);
  const inspected = await inspectContainer();
  computerStreamLine(`local docker: container exists=${inspected.exists} running=${inspected.running} owned=${inspected.owned} schema=${inspected.schemaVersion || "?"} hostBundleMatches=${inspected.hostSha256 === hostBundle.sha256}`);
  if (inspected.exists && !inspected.owned) throw new Error(`Local Docker VM cannot use ${LOCAL_DOCKER_BOX_CONTAINER}: an unowned container already has that name.`);
  if (inspected.exists && inspected.image !== LOCAL_DOCKER_BOX_IMAGE) throw new Error(`Local Docker VM container uses unexpected image ${inspected.image}. Remove it explicitly before changing images.`);
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
      "--env", "SAND_SUPERVISOR_ENABLED=1", "--env", "SAND_BOX_AUTO_UPDATE=0", "--env", "SAND_USE_EXISTING_BOX_EXEC_DAEMON=1", "--env", "SAND_TREE_SITTER_NODE_DEPS=/home/box/deps", "--env", "NODE_PATH=/home/box/deps", "--env", "SAND_GATEWAY_BIND_HOST=0.0.0.0", "--env", "SAND_HOST_PORT=1340", "--env", `SAND_GATEWAY_TOKEN=${token}`,
      ...localDockerInferenceEnvironmentArguments(inferenceCredential),
      "--publish", "127.0.0.1:1337:1337", "--publish", "127.0.0.1:1339:1339", "--publish", "127.0.0.1:1340:1340",
      "--publish", "127.0.0.1:6080:6080", "--publish", "127.0.0.1:6081:6081", "--publish", "127.0.0.1:8790:8790",
      "--volume", "grok-bot-local-vm-workspace:/workspace", "--volume", "grok-bot-local-vm-data:/home/box/sand-data",
      "--mount", `type=bind,src=${hostBundle.path},dst=/home/box/sand-host/host-main.cjs,readonly`,
      "--mount", `type=bind,src=${dirname(hostBundle.boxExecDaemonPath)},dst=/home/box/box-exec-daemon,readonly`,
      "--mount", `type=bind,src=${inferenceDir},dst=/run/grok-bot,readonly`,
      ...authMounts,
      LOCAL_DOCKER_BOX_IMAGE,
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

export async function stopLocalDockerBox(): Promise<void> {
  const inspected = await inspectContainer();
  if (!inspected.exists || !inspected.running) return;
  if (!inspected.owned) throw new Error(`Refusing to stop unowned container ${LOCAL_DOCKER_BOX_CONTAINER}.`);
  const stopped = await runDocker(["stop", LOCAL_DOCKER_BOX_CONTAINER]);
  if (!stopped.ok) throw new Error(`Could not stop the local Docker VM: ${stopped.output}`);
}

export function createSettingsRoutedHostConnector(
  remote: SandRemoteHostConnector,
  settings: SandSettingsStore,
): SandRemoteHostConnector {
  const localConnect = (): Promise<GatewayConnection> => {
    return (async () => {
      const pending = remote.issueInferenceCredential == null
        ? Promise.resolve(undefined)
        : remote.issueInferenceCredential().catch(() => undefined);
      const issued = await Promise.race([
        pending,
        new Promise<undefined>((resolve) => setTimeout(resolve, OPTIONAL_CREDENTIAL_WAIT_MS)),
      ]);
      const connection = await queuedEnsure(settings.settingsPath, issued);
      const late = await pending;
      if (late != null) await persistInferenceCredential(settings.settingsPath, late);
      return connection;
    })();
  };
  return {
    connect: async () => settings.getBoxRuntime() === "local-docker" ? await localConnect() : await remote.connect(),
    ...(remote.issueLocalExecDaemonCredential == null ? {} : { issueLocalExecDaemonCredential: remote.issueLocalExecDaemonCredential.bind(remote) }),
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

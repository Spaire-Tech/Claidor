/**
 * The computer in the cloud, app side (25 September 2026,
 * docs/product/cloud-computer-served.md).
 *
 * Nothing here is new app code beyond two things: the egress tunnel's
 * derivation learned the API proxy's `/p/<port>` shape next to Cursor's
 * `-<port>` label, and `setBoxRuntime("remote")` probes the broker before
 * stopping the local box. Everything else was already built
 * (`BrokeredHostConnector`, the descriptor, the blocked hold); these tests
 * drive it with the JSON `polar/sand/box_broker.py` answers.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const BOX_ID = "0f6a1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const API = "https://api.simeonlabs.com";
const brokerAnswer = {
  cluster: "simeon", tenantId: "u1", podId: BOX_ID,
  networkToken: "net-token", gatewayToken: "gw-token",
  gatewayUrl: `${API}/sand-box/${BOX_ID}/p/1340`,
  vncUrl: `${API}/sand-box/${BOX_ID}/p/6080/vnc.html?network_token=net-token&resume_lower_s=900&resume_upper_s=18000&path=websockify%3Fnetwork_token%3Dnet-token%26resume_lower_s%3D900%26resume_upper_s%3D18000`,
  forkVncBaseUrl: `${API}/sand-box/${BOX_ID}/p/6081`,
  imageUpdateAvailable: false,
};

test("the egress tunnel derives from Cursor's label shape, from the API proxy's path shape, and from a bare host", async () => {
  const { module, dispose } = await load("source/shared/node/egress-tunnel/box-connection.ts", "box-connection");
  try {
    const { deriveEgressTunnelWsUrl, boxConnectionToEgressConfig } = module;
    // Cursor's pod proxy, and a founder's per-port hostnames: unchanged.
    assert.equal(deriveEgressTunnelWsUrl("https://pod-abc-1340.example.com/", true), "wss://pod-abc-8790.example.com/");
    assert.equal(deriveEgressTunnelWsUrl("https://box-0f6a-1340.boxes.simeonlabs.com", true), "wss://box-0f6a-8790.boxes.simeonlabs.com/");
    // The API's own proxy: the path names the port.
    assert.equal(deriveEgressTunnelWsUrl(brokerAnswer.gatewayUrl, true), `wss://api.simeonlabs.com/sand-box/${BOX_ID}/p/8790/`);
    assert.equal(deriveEgressTunnelWsUrl(`${brokerAnswer.gatewayUrl}/`, true), `wss://api.simeonlabs.com/sand-box/${BOX_ID}/p/8790/`);
    // Neither shape: no tunnel, as before.
    assert.equal(deriveEgressTunnelWsUrl("https://api.simeonlabs.com/", true), null);
    // A local box: the port.
    assert.equal(deriveEgressTunnelWsUrl("http://127.0.0.1:1340", false), "ws://127.0.0.1:8790/");
    const config = boxConnectionToEgressConfig({ baseUrl: brokerAnswer.gatewayUrl, token: "gw-token", headers: { "x-anyrun-network-token": "net-token" }, vncProxy: { primaryUrl: brokerAnswer.vncUrl, forkBaseUrl: brokerAnswer.forkVncBaseUrl, networkToken: "net-token" } });
    assert.deepEqual(config, { url: `wss://api.simeonlabs.com/sand-box/${BOX_ID}/p/8790/`, bearer: "gw-token", headers: { "x-anyrun-network-token": "net-token" }, allowPrivateTargets: false });
  } finally {
    await dispose();
  }
});

test("the brokered connector builds the descriptor from the broker's answer and holds off on a blocked box", async () => {
  const { module, dispose } = await load("source/electron-main/box/box-host-connector.ts", "box-host-connector");
  try {
    const { BrokeredHostConnector, buildConnection, SandBoxHostConnectError } = module;
    const calls = [];
    const client = {
      ensureSandBox: async (request) => { calls.push(["ensure", request]); return { ...brokerAnswer }; },
      recreateSandBox: async (request) => { calls.push(["recreate", request]); return { started: true, reason: "", operationId: "op-1" }; },
      forceRecreateSandBox: async () => ({ started: false, reason: "no host", operationId: "" }),
    };
    const connector = new BrokeredHostConnector({ getAccessToken: async () => "claidor_da_x", getMachineId: () => "m" }, client);
    const descriptor = await connector.connect();
    assert.deepEqual(descriptor, {
      baseUrl: brokerAnswer.gatewayUrl,
      token: "gw-token",
      headers: { "x-anyrun-network-token": "net-token" },
      vncProxy: { primaryUrl: brokerAnswer.vncUrl, forkBaseUrl: brokerAnswer.forkVncBaseUrl, networkToken: "net-token" },
    });
    assert.deepEqual(await connector.recreate({ preserveData: true }), { status: "started", operationId: { value: "op-1" } });
    assert.deepEqual(await connector.forceRecreate(), { status: "rejected", reason: "Couldn't reset the computer (no host). It is unchanged." });
    assert.deepEqual(calls[1], ["recreate", { preserveData: true, force: false }]);
    // An empty gateway URL is the one thing the connector refuses itself.
    client.ensureSandBox = async () => ({ ...brokerAnswer, gatewayUrl: "" });
    await assert.rejects(connector.connect(), SandBoxHostConnectError);
    // No VNC proxy without all three parts (a local or env descriptor).
    assert.deepEqual(buildConnection("http://127.0.0.1:1340", "t", ""), { baseUrl: "http://127.0.0.1:1340", token: "t" });
  } finally {
    await dispose();
  }
});

test("setBoxRuntime probes the cloud computer before stopping the local box, and falls back with one sentence", async () => {
  const { module, dispose } = await load("source/electron-main/main-edge.ts", "main-edge");
  try {
    const { createMainEdgeHandlers, remoteBoxFailureSentence } = module;
    const state = { boxRuntime: "local-docker" };
    const log = [];
    const settingsStore = { settingsPath: path.join(os.tmpdir(), "no-such-settings.json"), getBoxRuntime: () => state.boxRuntime, setBoxRuntime: (mode) => { state.boxRuntime = mode; log.push(`set:${mode}`); } };
    const unavailable = Object.assign(new Error("[unavailable] Simeon's cloud computer needs a host; set CLAIDOR_BOX_HOST_PROVIDER"), { rawMessage: "Simeon's cloud computer needs a host; set CLAIDOR_BOX_HOST_PROVIDER" });
    const boxRecovery = { probeRemoteBox: async () => { log.push("probe"); throw unavailable; }, restartCoordinator: () => log.push("restart") };
    const handlers = createMainEdgeHandlers({ settingsStore, boxRecovery, readLiveUpdateService: () => null, readThemeController: () => null, readEgressTunnelController: () => null, agentPrefsStore: {}, boxToggleStore: {}, onboardingSeen: {}, shell: {}, windowChrome: {}, avatarImages: {}, attachments: {}, cursorAccount: {}, experiments: {}, syncHostSettingsToBox: async () => null, readHostSettingsFromBox: async () => ({}), recordLocalToolApproval: async () => {}, clearLocalToolApprovals: async () => {}, getComputerUseModelOverride: () => null, fetchAvailableModels: () => [], emitEgressTunnelChanged: () => {}, emitWebauthnProxyChanged: () => {}, ensureTranscriptionManager: async () => ({}), platform: "darwin" });
    await assert.rejects(handlers.setBoxRuntime({ mode: "remote" }), (error) => error.message === "Simeon's cloud computer needs a host; set CLAIDOR_BOX_HOST_PROVIDER");
    // Set to remote for the probe, put back on refusal, the local box never stopped, the coordinator not restarted.
    assert.deepEqual(log, ["set:remote", "probe", "set:local-docker"]);
    assert.equal(state.boxRuntime, "local-docker");
    assert.equal(remoteBoxFailureSentence(new Error("plain")), "plain");
    // With SAND_CONNECT_SERVED=0 the old refusal stands and nothing is probed.
    process.env.SAND_CONNECT_SERVED = "0";
    try {
      await assert.rejects(handlers.setBoxRuntime({ mode: "remote" }), /switched off in this build/);
    } finally {
      delete process.env.SAND_CONNECT_SERVED;
    }
    assert.deepEqual(log, ["set:remote", "probe", "set:local-docker"]);
  } finally {
    await dispose();
  }
});

test("the box recovery exposes the probe on the connector's connect", async () => {
  const { module, dispose } = await load("source/electron-main/box/box-recovery.ts", "box-recovery");
  try {
    const probed = [];
    const recovery = module.createProductionBoxRecovery({ connector: { connect: async () => { probed.push(1); return {}; } }, broadcast: () => {}, restartCoordinator: () => {}, updateForeverBox: async () => ({}) });
    await recovery.probeRemoteBox();
    assert.equal(probed.length, 1);
    const without = module.createProductionBoxRecovery({ connector: {}, broadcast: () => {}, restartCoordinator: () => {}, updateForeverBox: async () => ({}) });
    await assert.rejects(without.probeRemoteBox(), /no connector/);
    recovery.dispose(); without.dispose();
  } finally {
    await dispose();
  }
});

test("the settings switch is enabled both ways and no longer says coming soon", async () => {
  const patch = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  const start = patch.indexOf("function RBoxRuntime()");
  const body = patch.slice(start, patch.indexOf("function RRouterPanel()", start));
  assert.ok(start >= 0);
  assert.doesNotMatch(body, /coming soon/i);
  assert.match(body, /disabled:s\.busy,/);
  assert.match(body, /Switch off to use Simeon's cloud computer/);
  assert.match(body, /run on Simeon's cloud computer/);
  // The served set still lists the broker, so the edge lets a person pick "remote".
  assert.match(await src("shared/cloud-agents-availability.ts"), /"aiserver\.v1\.GrokBotService",/);
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// 5 October 2026: Simeon's own names on the wire. The services the Mac app
// and the box host call on Simeon Labs' server are `simeon.v1.*`, the client
// headers are `x-simeon-client-*`, a cloud agent's source is `SIMEON`, and
// every `SAND_<NAME>` setting is also read as `SIMEON_<NAME>`. The server
// answers the earlier names too for one release (`docs/kept-names.md`).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

test("the served services carry Simeon's names and the upstream's methods", async () => {
  const loaded = await loadModule("source/packages/proto/simeon/v1/services.ts", "services");
  try {
    const { ComputerService, DashboardService, AutomationsService, CloudAgentService, AiService, renamedService } = loaded.module;
    assert.equal(ComputerService.typeName, "simeon.v1.ComputerService");
    assert.equal(DashboardService.typeName, "simeon.v1.DashboardService");
    assert.equal(AutomationsService.typeName, "simeon.v1.AutomationsService");
    assert.equal(CloudAgentService.typeName, "simeon.v1.CloudAgentService");
    assert.equal(AiService.typeName, "simeon.v1.AiService");
    // The methods are the generated ones, untouched: the box broker's five the server serves among them.
    for (const method of ["ensureSandBox", "recreateSandBox", "forceRecreateSandBox", "watchSandBoxMigration", "getSandBoxRunState", "notifySandAgentTurnFinished"]) assert.ok(ComputerService.methods[method], method);
    assert.equal(ComputerService.methods.ensureSandBox.name, "EnsureSandBox");
    assert.ok(DashboardService.methods.getUserPrivacyMode);
    assert.ok(AutomationsService.methods.createSandAutomation);
    assert.ok(CloudAgentService.methods.startBackgroundComposerFromSnapshot);
    assert.ok(AiService.methods.availableModels);
    const renamed = renamedService({ typeName: "a.B", methods: { x: 1 } }, "c.D");
    assert.deepEqual(renamed, { typeName: "c.D", methods: { x: 1 } });
  } finally {
    await loaded.dispose();
  }
});

test("a Connect call leaves under Simeon's service name with Simeon's headers", async () => {
  const loaded = await loadModule("source/shared/node/simeon-backend/simeon-inference.ts", "simeon-inference");
  const services = await loadModule("source/packages/proto/simeon/v1/services.ts", "services-2");
  try {
    const { createSandInferenceInterceptor } = loaded.module;
    const { ComputerService } = services.module;
    const headers = new Map();
    const request = { service: ComputerService, method: ComputerService.methods.ensureSandBox, header: { get: (name) => headers.get(name) ?? null, set: (name, value) => headers.set(name, value), delete: (name) => headers.delete(name) }, stream: false };
    const interceptor = createSandInferenceInterceptor({ backendUrl: "https://api.simeonlabs.com", getAccessToken: async () => "simeon_da_x", getMachineId: () => "m", env: { SAND_PACKAGED: "1" }, resolveGhostModeHeader: async () => "true" });
    await interceptor(async (passed) => passed)(request);
    assert.equal(headers.get("x-simeon-client-type"), "sand");
    assert.match(headers.get("x-simeon-client-version"), /^0\.1\.0(-dev)?$/);
    assert.equal(headers.get("x-cursor-client-type"), undefined);
    assert.equal(headers.get("x-cursor-client-version"), undefined);
    assert.equal(headers.get("authorization"), "Bearer simeon_da_x");
  } finally {
    await loaded.dispose();
    await services.dispose();
  }
});

test("the metadata module and the web page send the same header names", async () => {
  const loaded = await loadModule("source/shared/node/sand-client-metadata.ts", "client-metadata");
  try {
    const { getSandBackendClientHeaders, CLIENT_TYPE_HEADER, CLIENT_VERSION_HEADER } = loaded.module;
    assert.equal(CLIENT_TYPE_HEADER, "x-simeon-client-type");
    assert.equal(CLIENT_VERSION_HEADER, "x-simeon-client-version");
    assert.deepEqual(Object.keys(getSandBackendClientHeaders({ SAND_PACKAGED: "1" })).sort(), ["x-sand-box-namespace", "x-simeon-client-type", "x-simeon-client-version"]);
    const web = await readFile(path.join(repoRoot, "web/api.ts"), "utf8");
    assert.match(web, /"x-simeon-client-type": "sand", "x-simeon-client-version"/);
    assert.match(web, /CONNECT_SERVICE = "simeon\.v1\.ComputerService"/);
    // The server reads Simeon's header first and the earlier ones after it.
    const endpoints = await readFile(path.join(repoRoot, "../server/simeon/desktop/endpoints.py"), "utf8");
    assert.match(endpoints, /CLIENT_VERSION_HEADERS = \(\n    "x-simeon-client-version",\n    "x-cursor-client-version",/);
    // And mounts every service under both names.
    const connect = await readFile(path.join(repoRoot, "../server/simeon/sand/box_broker.py"), "utf8");
    assert.match(connect, /"simeon\.v1\.ComputerService", aliases=\("aiserver\.v1\.GrokBotService",\)/);
  } finally {
    await loaded.dispose();
  }
});

test("a cloud agent is launched with Simeon's source", async () => {
  const source = await readFile(path.join(repoRoot, "source/host/extensions/cloud-agents/cloud-agents-service.ts"), "utf8");
  assert.equal(source.includes("BackgroundComposerSource.GROK_BOT"), false);
  assert.ok(source.includes("source: BackgroundComposerSource.SIMEON"));
  const loaded = await loadModule("source/packages/proto/generated/aiserver/v1/background_composer_pb.ts", "bc-pb");
  try {
    const { BackgroundComposerSource } = loaded.module;
    assert.equal(BackgroundComposerSource.SIMEON, 34);
    assert.equal(BackgroundComposerSource[34], "SIMEON");
  } finally {
    await loaded.dispose();
  }
});

test("every SIMEON_ setting is read where the code reads SAND_, and SAND_ wins when both are set", async () => {
  const loaded = await loadModule("source/shared/node/env-names.ts", "env-names");
  try {
    const { acceptSimeonEnvNames } = loaded.module;
    const env = { SIMEON_BACKEND_URL: "https://api.simeonlabs.com", SIMEON_AGENT_MODEL: "gpt-6-sol", SAND_AGENT_MODEL: "gpt-6-luna", SIMEON_EMPTY: "", PATH: "/usr/bin" };
    const written = acceptSimeonEnvNames(env);
    assert.deepEqual(written.sort(), ["SAND_BACKEND_URL", "SAND_EMPTY"]);
    assert.equal(env.SAND_BACKEND_URL, "https://api.simeonlabs.com");
    assert.equal(env.SAND_AGENT_MODEL, "gpt-6-luna", "an explicit SAND_ setting is never overwritten");
    assert.equal(env.SAND_EMPTY, "", "an empty value is a value");
    assert.equal(env.SIMEON_AGENT_MODEL, "gpt-6-sol", "the SIMEON_ name is left for readers that already use it");
    assert.deepEqual(acceptSimeonEnvNames(env), [], "a second pass writes nothing");
  } finally {
    await loaded.dispose();
  }
  // The shim is the first import of every process entry.
  for (const entry of ["source/electron-main/main.ts", "source/host/main.ts", "source/node-agent-coordinator/main.ts", "source/local-exec-daemon/main.ts", "source/box-exec-daemon/cli.ts", "source/electron-dev-controls/main.ts"]) {
    const text = await readFile(path.join(repoRoot, entry), "utf8");
    assert.ok(text.startsWith('import "../shared/node/accept-simeon-env.js";\n'), `${entry} accepts SIMEON_ names first`);
  }
});

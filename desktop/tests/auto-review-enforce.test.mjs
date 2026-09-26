/**
 * Auto-review enforces, "asks once" remembers, and the box stops talking to
 * Cursor (25 September 2026, design-audit-ledger.md clusters
 * `auto-review-enforce`, `asks-once-memory`, `box-telemetry`).
 *
 * The box host never saw Simeon's gate table (only the Mac wrapped its
 * experiment service), so `sand_auto_review` read its bundled false and every
 * surface resolved to shadow: one Luna call per action, verdict discarded,
 * no card. The production shell's user-message epoch was a no-op, so an
 * approval never expired and a refusal was remembered for ever; the subagent
 * launch reviewer was never handed to the production input; the classifier
 * had one attempt of 10 s. The card's "Always allow" landed in the box's
 * settings and the Mac pushed its own "ask" back on every reconnect. And the
 * container ran without the Mac's telemetry guards, posting console lines
 * and product events to Simeon Labs' server every 3 s to get a 404.
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

test("the box host reads Simeon's gate table, and auto-review enforces on it", async () => {
  const experiments = await src("host/extensions/experiments/extension.ts");
  assert.match(experiments, /applySimeonGateDefaults\(new SandExperimentService\(\{/, "the host wraps its service the way the Mac does");
  const { module, dispose } = await load("source/shared/node/experiments/simeon-gate-defaults.ts", "gate-defaults");
  try {
    assert.equal(module.simeonGateDefault("sand_auto_review", {}), true);
    assert.equal(module.simeonGateDefault("sand_product_analytics", {}), false);
    assert.equal(module.simeonGateDefault("sand_auto_review", { SAND_FEATURE_GATE_OVERRIDES: "sand_auto_review=0" }), false, "the env kill switch still wins");
    const bare = { checkFeatureGate: () => false, getSnapshot: () => ({ featureGates: { sand_auto_review: false } }), subscribe: () => () => {}, getFeatureFlagOverridesRecord: () => ({}) };
    const wrapped = module.applySimeonGateDefaults(bare, {});
    assert.equal(wrapped.checkFeatureGate("sand_auto_review"), true);
    assert.equal(wrapped.getSnapshot().featureGates.sand_auto_review, true);
  } finally {
    await dispose();
  }
  const review = await load("source/host/runner/sand-auto-review.ts", "sand-auto-review-modes");
  try {
    const modes = review.module.resolveSandAutoReviewModes({ settingsEnabled: true, enforceEnabled: true });
    for (const surface of ["hostShell", "boxShell", "computer", "automationWrite", "subagentLaunch"]) assert.equal(modes[surface], "enforce", surface);
  } finally {
    await review.dispose();
  }
});

test("the classifier has two attempts of 30 s, the epoch and the turn begin on a new message, and a subagent launch is reviewed", async () => {
  const run = await src("host/runner/sand-auto-review-classifier-run.ts");
  assert.match(run, /SAND_AUTO_REVIEW_CLASSIFIER_MAX_ATTEMPTS = 2;/);
  const measurement = await src("packages/agent/utils/smart-mode-classifier-measurement.ts");
  assert.match(measurement, /SMART_MODE_CLASSIFIER_TIMEOUT_MS = 30_000;/);
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /beginAutoReviewUserMessageEpoch: \(\) => \{\n\s*if \(!identity\.isSubagentRunner\) \{\n\s*autoReviewController\?\.beginUserMessageEpoch\(\);\n\s*method\(localToolPermission, "beginTurn"\)\?\.\(session\.id\);/);
  assert.match(composition, /subagentReview: \{\n\s*isSubagentRunner: isSharedRoomTurn,\n\s*mode: autoReviewModes\.subagentLaunch,/);
});

test("the local audit line carries no inline secret", async () => {
  const { module, dispose } = await load("source/host/extensions/action-audit/action-audit-service.ts", "action-audit");
  try {
    const line = module.localAuditJsonlLine({ occurredAtMs: 0, agentId: "a1", action: { kind: "shellCommand", command: "curl -H 'Authorization: Bearer sk-live-abcdefghijklmnopqrstuvwxyz0123456789' https://x", shellKind: "box", target: "box" } }, "e1");
    assert.ok(!line.includes("sk-live-abcdefghijklmnopqrstuvwxyz0123456789"), line);
    assert.match(line, /curl -H/);
  } finally {
    await dispose();
  }
});

test("the Mac adopts the box's Always allow on reconnect instead of pushing its own ask back", async () => {
  const { module, dispose } = await load("source/electron-main/coordinator/coordinator-resync.ts", "coordinator-resync");
  try {
    const run = async (boxPermission, macPermission) => {
      const pushed = [];
      let adopted;
      const chain = module.createCoordinatorResyncChain({
        legs: { getHostSettings: async () => ({ localToolPermission: boxPermission }), setHostSettings: async (update) => { pushed.push(update); return update; } },
        getMcpCustomInstructionsAccountScope: () => null, getMcpCustomInstructionsByServerId: () => ({}), getMcpDisabledToolsByServerId: () => ({}),
        setMcpCustomInstructionsByServerId: () => {}, setMcpDisabledToolsByServerId: () => {}, detectTimeZone: () => null, getUserTimeZoneOverride: () => null,
        getComputerUseModel: () => null, getAutoReviewInstructions: () => ({ isEnabled: true }), getLocalToolPermission: () => macPermission,
        setLocalToolPermission: (value) => { adopted = value; }, getWebauthnProxyEnabled: () => false, getFeatureFlagOverrides: () => ({}),
        pushBoxSecrets: async () => {}, syncWindowFocused: async () => {},
      });
      await chain.onTransportConnected();
      return { adopted, pushedPermission: pushed.filter((update) => "localToolPermission" in update).map((update) => update.localToolPermission) };
    };
    assert.deepEqual(await run("always", "ask"), { adopted: "always", pushedPermission: [] }, "the person's Always allow on the card is remembered");
    assert.deepEqual(await run("never", "ask"), { adopted: "never", pushedPermission: [] });
    assert.deepEqual(await run("ask", "ask"), { adopted: undefined, pushedPermission: ["ask"] });
    assert.deepEqual(await run("always", "never"), { adopted: undefined, pushedPermission: ["never"] }, "a choice made in the Mac's Settings still wins");
  } finally {
    await dispose();
  }
});

test("the box carries the telemetry guards and makes no Cursor pre-flight, and the Mac copies no Statsig cache", async () => {
  const docker = await src("electron-main/box/local-docker-host-connector.ts");
  // Schema 10 carried the guards; 11 (the stream guard, F-135) keeps them.
  assert.match(docker, /LOCAL_DOCKER_SCHEMA_VERSION = "11"/);
  for (const key of ["SAND_DISABLE_TELEMETRY=1", "SAND_DISABLE_ANALYTICS=1", "SAND_BOX_LOG_SHIP_DISABLED=1"]) assert.ok(docker.includes(`"--env", "${key}"`), key);
  assert.match(await src("shared/node/cursor-backend/cursor-inference.ts"), /privacyLookup \|\| !isConnectServed\(options\.env, "aiserver\.v1\.DashboardService"\) \? "true"/);
  assert.match(await src("host/extensions/notifications/extension.ts"), /start: \(context\) => \{ if \(!isConnectServed\(process\.env, "aiserver\.v1\.GrokBotService"\)\) return \{\};/);
  assert.match(await src("shared/node/experiments/cursor-experiments.ts"), /loggingEnabled: isConnectServed\(process\.env, "cursor\.statsig-bootstrap"\) \? "always" : "disabled"/);
  assert.match(await src("electron-main/startup/desktop-user-data-bootstrap.ts"), /"sand-statsig-bootstrap\.json"\]\);/);
  assert.match(await src("shared/observability/sentry.ts"), /SAND_SENTRY_DSN = "";/);
  assert.match(await src("electron-main/account/cursor-profile.ts"), /if \(!isConnectServed\(process\.env, "aiserver\.v1\.DashboardService"\)\) return PrivacyMode\.NO_TRAINING;/);
});

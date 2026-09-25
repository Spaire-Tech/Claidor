/**
 * Event listeners are Coming Soon at every reach point (25 September 2026,
 * design-audit-ledger.md clusters `listeners-coming-soon` and
 * `routines-away`).
 *
 * The relay a listener routine needs (/sand/listener-*,
 * /sand/automation-events/poll, AutomationsService, the dashboard's
 * Slack/GitHub connections) is Cursor's; Simeon Labs' server serves none
 * of it, and no flag turns it on. So: the update_state tool refuses a
 * listener trigger with one sentence, the agent's brief offers cron only
 * and says listeners and running-while-away are coming soon, the connect
 * URL is no longer cursor.com, cloud absence is seeded so a cron routine is
 * scheduled locally from the first pass, and the box does not poll the
 * two unserved endpoints every 30 s.
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

test("the tool refuses a listener trigger with the Coming Soon sentence, and keeps taking cron", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const { module, dispose } = await load("source/host/runner/tools/sand-state-tool.ts", "sand-state-tool");
  try {
    const deps = { state: {} };
    const base = { target: "routine", action: "create", name: "Nightly", prompt: "x" };
    assert.deepEqual(module.resolveTrigger({ ...base, schedule: "0 9 * * 1-5" }, deps), { type: "cron", schedule: "0 9 * * 1-5" });
    assert.deepEqual(module.resolveTrigger({ ...base, trigger: { type: "cron", schedule: "0 9 * * 1-5" } }, deps), { type: "cron", schedule: "0 9 * * 1-5" });
    for (const trigger of [
      { type: "slack", channel: "#eng", match: { kind: "mention" } },
      { type: "github", repo: "o/r", events: ["pr-opened"] },
      { type: "group", listeners: [{ type: "cron", schedule: "0 9 * * *" }, { type: "sentry", event: { case: "issue-created" } }] },
      [{ type: "pagerduty", event: { case: "incident-triggered" } }],
    ]) {
      assert.throws(() => module.resolveTrigger({ ...base, trigger }, deps), /Event listeners \(Slack, GitHub, Microsoft Teams, Linear, Sentry, PagerDuty\) are coming soon on Simeon/);
    }
  } finally {
    await dispose();
  }
});

test("the agent's brief offers cron only and names what is coming soon; the flag restores Grok Bot's listener text", async () => {
  delete process.env.SAND_LISTENER_RELAY_SERVED;
  const { module, dispose } = await load("source/host/automations/automation.ts", "automation-prompt");
  try {
    const prompt = module.renderAutomationsSystemPrompt([], "/home/box/agent-data/automations", "Africa/Dakar");
    assert.match(prompt, /are coming soon on Simeon\. For now a routine fires on a cron schedule/);
    assert.match(prompt, /running while the user is away is coming soon/);
    for (const gone of ["Trigger shapes", '"type": "slack"', "@Cursor", "Cursor Slack app", "Claidor account", "run even when the user is away", "acts while they're away", "Slack listener", "event trigger", "cloud-agent"]) {
      assert.ok(!prompt.includes(gone), `the brief no longer says ${JSON.stringify(gone)}`);
    }
    assert.match(prompt, /small model-call budget/, "a routine wake is a hidden turn on the small budget, and the brief says so");
    assert.match(prompt, /schedule is a 5-field cron expression/);
    process.env.SAND_LISTENER_RELAY_SERVED = "1";
    const served = module.renderAutomationsSystemPrompt([], "/home/box/agent-data/automations");
    assert.match(served, /Trigger shapes/);
    assert.match(served, /"type": "slack"/);
    assert.ok(!served.includes("coming soon"));
  } finally {
    delete process.env.SAND_LISTENER_RELAY_SERVED;
    await dispose();
  }
});

test("a cron routine is scheduled locally from the first pass, without a failed RPC first", async () => {
  const { module, dispose } = await load("source/host/extensions/automations/sand-automation-cloud-sync.ts", "cloud-sync");
  try {
    let calls = 0;
    const client = { listSandAutomations: async () => { calls += 1; throw new Error("should not be called"); } };
    const common = { client, hasCredential: () => true, listAgentIds: async () => ["a1"], listAutomations: async () => [], onFailure: () => {}, onRecovery: () => {}, onSchedulingAuthorityChanged: () => {} };
    const seeded = new module.SandAutomationCloudSync({ ...common, cloudServiceAbsent: true });
    const cron = { id: "r1", trigger: { type: "cron", schedule: "0 9 * * *" } };
    assert.equal(seeded.isCloudServiceAbsent(), true);
    assert.equal(seeded.shouldScheduleLocally({ agentId: "a1", automation: cron }), true);
    await seeded.reconcileNow();
    assert.equal(calls, 0, "the Connect client is never called");
    const discovering = new module.SandAutomationCloudSync(common);
    assert.equal(discovering.isCloudServiceAbsent(), false, "the default still discovers, for a server that serves it");
  } finally {
    await dispose();
  }
});

test("the extension seeds absence, starts no relay source, does not poll the fire consumer, and the connect URL is not cursor.com", async () => {
  const extension = await src("host/extensions/automations/extension.ts");
  assert.match(extension, /cloudServiceAbsent: !isListenerRelayServed\(\)/);
  assert.match(extension, /sources: listenerRelayServed \? \[relay\.slack, relay\.github\] : \[\]/);
  assert.match(extension, /if \(listenerRelayServed\) void fireConsumer\.tick\(\);/);
  assert.match(extension, /if \(listenerRelayServed\) fireConsumer\.start\(\);/);
  const reads = await src("host/extensions/automations/listener-integrations.ts");
  assert.doesNotMatch(reads, /https:\/\/cursor\.com/);
  assert.match(reads, /export const DASHBOARD_INTEGRATIONS_URL: string \| null = null;/);
  const { module, dispose } = await load("source/host/extensions/automations/listener-integrations.ts", "listener-reads");
  try {
    delete process.env.SAND_LISTENER_RELAY_SERVED;
    const lines = [];
    const reader = module.createListenerIntegrationReads({ dashboard: () => { throw new Error("no dashboard"); }, transcript: { listAllAutomationDefinitions: async () => [], getAgentChannels: async () => [] }, sourceStatuses: () => new Map(), log: (line) => lines.push(line) });
    assert.equal(await reader.getConnectUrl("github"), null);
    assert.equal(await reader.getConnectUrl("slack"), null);
    assert.match(lines.join("\n"), /coming soon on Simeon/);
  } finally {
    await dispose();
  }
  for (const [file, gone] of [["host/automations/listener-integrations.ts", "@Cursor"], ["host/extensions/transcript/box-handoff-resume.ts", "@Cursor"], ["host/extensions/transcript/box-handoff-resume.ts", "Claidor account"], ["host/extensions/automations/backend-relay-source.ts", "Claidor account"], ["host/runner/tools/listener-connect-cards.ts", "Claidor account"]]) {
    assert.ok(!(await src(file)).includes(gone), `${file} no longer says ${gone}`);
  }
});

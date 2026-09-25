/**
 * Cloud agents and messaging channels are Coming Soon at every reach point
 * (25 September 2026, design-audit-ledger.md cluster `cloud-agents-channels`:
 * F-007, F-210, F-055, F-056, F-057, F-081, F-472).
 *
 * Cursor's BackgroundComposerService and the channel relay are not served
 * by Simeon Labs' server, and no connector manifest is available. The brief
 * used to tell the agent to hand every repository task to a cloud agent
 * whose launch failed every time; the SendMessage tool offered a
 * cursor-agent card, a channel target that always raised "Message not
 * delivered", and a secret-request whose only store is a channel credential
 * nothing reads; the gateway's channel manifests carried no availability,
 * so the Channels tab drew nothing.
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

test("SendMessage: no cursor-agent, a dropped channel, a refused secret-request; the flag restores cloud agents", async () => {
  delete process.env.SAND_CLOUD_AGENTS_SERVED;
  const { module, dispose } = await load("source/host/runner/tools/send-message-schema.ts", "send-message-schema");
  try {
    const types = module.describeSendMessageTypes({});
    assert.match(types, /cursor-agent is not available: cloud agents are coming soon in Simeon/);
    assert.match(types, /secret-request is not available: messaging channels are coming soon/);
    assert.doesNotMatch(types, /cursor-agent to reference a cloud agent/);
    assert.deepEqual(module.refineSendMessage({ type: "cursor-agent", bcId: "bc-1" }, {}).map((issue) => issue.message), [
      "Cloud agents are coming soon in Simeon, so the CloudAgent tool and cloud-agent cards are not available here yet. Never claim you can launch or manage one.",
    ]);
    assert.match(module.refineSendMessage({ type: "secret-request", secret: { label: "Slack token", connector: "slack", field: "token" } }, {})[0].message, /Messaging channels \(Slack, Discord\) are coming soon on Simeon/);
    assert.deepEqual(module.refineSendMessage({ type: "cursor-agent", bcId: "bc-1" }, { SAND_CLOUD_AGENTS_SERVED: "1" }), [], "served: Grok Bot's card is back");
    const parsed = module.sendMessageParameters.safeParse({ type: "text", content: "Hi", channel: "slack:C1" });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.channel, undefined, "a channel the model set is dropped, and the text lands in the in-app chat");
    assert.equal(parsed.data.content, "Hi");
    assert.equal(module.sendMessageParameters.safeParse({ type: "cursor-agent", bcId: "bc-1" }).success, false);
  } finally {
    await dispose();
  }
  const tool = await load("source/host/runner/tools/send-message-tool.ts", "send-message-tool");
  try {
    const description = tool.module.describeSendMessageTool({});
    assert.match(description, /Cloud agents are coming soon in Simeon/);
    assert.match(description, /Messaging channels \(Slack, Discord\) are coming soon on Simeon/);
    assert.doesNotMatch(description, /"type":"cursor-agent"/);
    assert.doesNotMatch(description, /"type":"secret-request"/);
    assert.match(tool.module.SAND_SEND_MESSAGE_TOOL_DESCRIPTION, /"type":"cursor-agent"/, "Grok Bot's full text is kept");
  } finally {
    await tool.dispose();
  }
});

test("the brief: cloud agents coming soon, no admin, no Origin, no CloudAgent tool in the production toolset", async () => {
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /isCloudAgentsDisabledByTeam: \(\) => !isCloudAgentsServed\(\) \|\|/);
  assert.match(composition, /cloudAgentsDisabledByTeam: \(\) => !isCloudAgentsServed\(\) \|\|/);
  assert.match(composition, /cloudAgent !== undefined && isCloudAgentsServed\(\)\n\s*\? \{\n\s*createCloudAgentToolInputs:/);
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "system-prompt");
  try {
    const disabled = module.SAND_SYSTEM_PROMPT_CLOUD_AGENTS_DISABLED;
    assert.match(disabled, /Cloud agents are coming soon in Simeon, so you cannot launch or manage them from here yet/);
    assert.doesNotMatch(disabled, /team's admin/);
    assert.doesNotMatch(disabled, /## Origin/);
    assert.doesNotMatch(disabled, /cursor\.com\/codebase/);
    assert.doesNotMatch(disabled, /CloudAgent tool/);
    assert.match(module.SAND_CLOUD_AGENTS_DISABLED_PROMPT_SECTION, /^## Cloud agents coming soon\n/);
    assert.doesNotMatch(module.SAND_CLOUD_AGENTS_DISABLED_PROMPT_SECTION, /admin/);
    assert.match(module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: true }), /## Origin/, "Grok Bot's served text is kept behind the flag");
    assert.doesNotMatch(module.DEFAULT_SAND_SYSTEM_PROMPT, /## Origin/, "the bare fallback follows the switch too (F-280)");
  } finally {
    await dispose();
  }
});

test("channels: the gateway's manifests carry availability, a coming-soon platform takes no credential, the store is private", async () => {
  const { module, dispose } = await load("source/host/extensions/automations/listener-integrations.ts", "listener-reads-channels");
  try {
    const reader = module.createListenerIntegrationReads({ dashboard: () => { throw new Error("no dashboard"); }, transcript: { listAllAutomationDefinitions: async () => [], getAgentChannels: async () => [{ platform: "slack", label: "x" }, { platform: "github", label: "y" }] }, sourceStatuses: () => new Map(), log: () => {} });
    const channels = await reader.getAgentChannels("a1");
    assert.deepEqual(channels.manifests.map((manifest) => [manifest.platform, manifest.availability, manifest.displayName]), [["discord", "coming-soon", "Discord"], ["slack", "coming-soon", "Slack"]]);
    assert.deepEqual(channels.connections.map((connection) => connection.platform), ["slack"], "a github row is not a channel");
  } finally {
    await dispose();
  }
  const manager = await src("host/extensions/transcript/transcript-manager.ts");
  assert.match(manager, /if \(findConnectorManifest\(platform\)\?\.availability !== "available"\) return false;/);
  const store = await src("host/extensions/session/connector-secret-store.ts");
  assert.match(store, /mode: 0o600/);
  const ack = await src("host/runner/tools/sand-secret-request.ts");
  assert.doesNotMatch(ack, /links within a few seconds/);
  assert.match(ack, /messaging channels are coming soon in Simeon/);
  const prompt = await src("shared/channel-messaging.ts");
  assert.doesNotMatch(prompt, /cursor-agent/);
});

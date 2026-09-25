/**
 * Cloud agents and messaging channels were Coming Soon at every reach point
 * on 25 September 2026 (design-audit-ledger.md cluster `cloud-agents-channels`:
 * F-007, F-210, F-055, F-056, F-057, F-081, F-472), and both are served
 * since later that day: cloud agents by `polar/sand/cloud_agents.py`,
 * channels by the connector runtime in the box (`host/extensions/channels/`,
 * tests/channels-runtime.test.mjs). This test keeps the Coming Soon branch
 * honest behind its switches (`SAND_CLOUD_AGENTS_SERVED=0`,
 * `SAND_CHANNELS_SERVED=0`): the brief used to tell the agent to hand every
 * repository task to a cloud agent whose launch failed every time; the
 * SendMessage tool offered a cursor-agent card, a channel target that always
 * raised "Message not delivered", and a secret-request whose only store is a
 * channel credential nothing read; the gateway's channel manifests carried
 * no availability, so the Channels tab drew nothing.
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

test("SendMessage: cursor-agent served by default, a dropped channel, a refused secret-request; the flag at 0 restores coming soon", async () => {
  // Cloud agents are served by default since 25 September 2026 (polar/sand/cloud_agents.py).
  process.env.SAND_CLOUD_AGENTS_SERVED = "0";
  process.env.SAND_CHANNELS_SERVED = "0";
  const { module, dispose } = await load("source/host/runner/tools/send-message-schema.ts", "send-message-schema");
  try {
    const off = { SAND_CLOUD_AGENTS_SERVED: "0", SAND_CHANNELS_SERVED: "0" };
    const types = module.describeSendMessageTypes(off);
    assert.match(types, /cursor-agent is not available: cloud agents are coming soon in Simeon/);
    assert.match(types, /secret-request is not available: messaging channels are coming soon/);
    assert.doesNotMatch(types, /cursor-agent to reference a cloud agent/);
    assert.deepEqual(module.refineSendMessage({ type: "cursor-agent", bcId: "bc-1" }, off).map((issue) => issue.message), [
      "Cloud agents are coming soon in Simeon, so the CloudAgent tool and cloud-agent cards are not available here yet. Never claim you can launch or manage one.",
    ]);
    assert.match(module.refineSendMessage({ type: "secret-request", secret: { label: "Slack token", connector: "slack", field: "token" } }, off)[0].message, /Messaging channels \(Slack, Discord\) are coming soon on Simeon/);
    assert.deepEqual(module.refineSendMessage({ type: "secret-request", secret: { label: "Slack token", connector: "slack", field: "token" } }, {}), [], "served by default: the secret-request card is back (channels-runtime.test.mjs)");
    assert.deepEqual(module.refineSendMessage({ type: "cursor-agent", bcId: "bc-1" }, {}), [], "served by default: Grok Bot's card is back");
    assert.match(module.describeSendMessageTypes({}), /cursor-agent to reference a cloud agent/);
    assert.match(module.describeSendMessageTypes({}), /secret-request to ask the user for a credential/);
    const parsed = module.sendMessageParameters.safeParse({ type: "text", content: "Hi", channel: "slack:C1" });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.channel, undefined, "with the switch off a channel the model set is dropped, and the text lands in the in-app chat");
    assert.equal(parsed.data.content, "Hi");
    assert.equal(module.sendMessageParameters.safeParse({ type: "cursor-agent", bcId: "bc-1" }).success, false);
  } finally {
    delete process.env.SAND_CLOUD_AGENTS_SERVED;
    delete process.env.SAND_CHANNELS_SERVED;
    await dispose();
  }
  process.env.SAND_CLOUD_AGENTS_SERVED = "0";
  const tool = await load("source/host/runner/tools/send-message-tool.ts", "send-message-tool");
  try {
    const description = tool.module.describeSendMessageTool({ SAND_CLOUD_AGENTS_SERVED: "0", SAND_CHANNELS_SERVED: "0" });
    assert.match(description, /Cloud agents are coming soon in Simeon/);
    assert.match(description, /Messaging channels \(Slack, Discord\) are coming soon on Simeon/);
    assert.doesNotMatch(description, /"type":"cursor-agent"/);
    assert.doesNotMatch(description, /"type":"secret-request"/);
    assert.match(tool.module.SAND_SEND_MESSAGE_TOOL_DESCRIPTION, /"type":"cursor-agent"/, "Grok Bot's full text is kept");
  } finally {
    delete process.env.SAND_CLOUD_AGENTS_SERVED;
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
    // Served since 25 September 2026 (polar/sand/cloud_agents.py): the enabled
    // sections are on, and say Simeon where Grok Bot said Cursor
    // (tests/cloud-agents-served.test.mjs measures the sentences).
    assert.match(module.buildSandBaseSystemPrompt({ cloudAgentsEnabled: true }), /## Repositories/, "Grok Bot's served structure is kept behind the flag, as Simeon's");
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /## Repositories/, "the bare fallback follows the switch too (F-280): served by default since 25 September");
  } finally {
    await dispose();
  }
});

test("channels: the gateway's manifests carry availability, a coming-soon platform takes no credential, the store is private", async () => {
  const { module, dispose } = await load("source/host/extensions/automations/listener-integrations.ts", "listener-reads-channels");
  try {
    const reader = module.createListenerIntegrationReads({ dashboard: () => { throw new Error("no dashboard"); }, transcript: { listAllAutomationDefinitions: async () => [], getAgentChannels: async () => [{ platform: "slack", label: "x" }, { platform: "github", label: "y" }] }, sourceStatuses: () => new Map(), log: () => {} });
    const served = await reader.getAgentChannels("a1");
    assert.deepEqual(served.manifests.map((manifest) => [manifest.platform, manifest.availability, manifest.displayName]), [["discord", "available", "Discord"], ["slack", "available", "Slack"]], "served by default since 25 September 2026");
    process.env.SAND_CHANNELS_SERVED = "0";
    let channels;
    try { channels = await reader.getAgentChannels("a1"); } finally { delete process.env.SAND_CHANNELS_SERVED; }
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
  assert.match(ack, /served\?"Confirm to the user that it is stored, then continue\. The channel connector reads it and links within a few seconds/, "served: the connector links");
  assert.match(ack, /messaging channels are coming soon in Simeon/, "switch off: nothing reads the secret");
  const prompt = await src("shared/channel-messaging.ts");
  assert.doesNotMatch(prompt, /cursor-agent/);
});

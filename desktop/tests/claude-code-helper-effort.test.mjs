/**
 * Background work at low effort on the person's Claude plan (12 November
 * 2026, the founder: every way of running the agents behaves as Simeon's own
 * models do). A helper on the computer's screen or in its browser is marked
 * as background work in the agent's config (`claudeCodeBackground`, read as
 * `isHelperSimeonSession` reads it), and the real Agent's user-message
 * handler hands that to the Claude Code hook, which runs it at `--effort low`
 * (tests/claude-code-agent-turn.test.mjs). The agent's own turn and a general
 * helper are not marked: they keep the effort chosen. The hook here is a
 * stand-in and every fetch refuses: nothing reaches claude.ai, Anthropic or
 * any provider.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  // Inside the tree, as tests/send-message-through-agent-loop.test.mjs does, so the packages left external resolve.
  const bundleDir = path.join(repoRoot, `.tmp-helper-effort-${randomBytes(4).toString("hex")}`);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "simeon-helper-effort-"));
  const output = path.join(bundleDir, "agent-loop.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/simeon-agent-loop-entry.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    external: ["jsonc-parser"],
    banner: { js: 'import { createRequire as __agentLoopRequire } from "node:module"; const require = __agentLoopRequire(import.meta.url);' },
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return {
    module,
    dataDir,
    dispose: async () => {
      await rm(bundleDir, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function staticConfig(m, tool, identity) {
  return m.createSandAgentStaticConfig({
    modelId: "gpt-6-sol",
    agentTokenLimit: 200_000,
    conversationId: identity.conversationId,
    isBoxScopedSubagent: identity.isSubagentRunner,
    isSubagentRunner: identity.isSubagentRunner,
    isSharedRoomRunner: false,
    ...(identity.isComputerUseSubagent === undefined ? {} : { isComputerUseSubagent: identity.isComputerUseSubagent }),
    ...(identity.isBrowserUseSubagent === undefined ? {} : { isBrowserUseSubagent: identity.isBrowserUseSubagent }),
    sandSendMessageDeliveryOwed: false,
    systemPromptGenerator: () => m.DEFAULT_SAND_SYSTEM_PROMPT,
    toolsGenerator: () => m.ToolSetHandle.fromTools([tool]),
  });
}

/** One product turn on the real Agent, its Claude Code hook a stand-in that records what the handler gave it. */
async function runTurn(loaded, identity) {
  const { module: m, dataDir } = loaded;
  globalThis.fetch = async (input) => { throw new Error(`nothing is fetched here: ${typeof input === "string" ? input : input.url}`); };
  const tool = m.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: () => "t1s1" });
  const config = staticConfig(m, tool, identity);
  const asked = [];
  config.claudeCodeTurn = {
    chosen: () => true,
    run: async (input) => { asked.push(input); return { ran: true, text: "Done." }; },
  };
  // The roles are not read from the server here.
  config.beforeTurn = async () => {};
  const ctx = m.createProductionRunnerContext();
  const runContext = await m.createTurnAgentRunContext({
    context: ctx,
    conversationId: identity.conversationId,
    requestId: "req-1",
    inference: { resolvePrivacyMode: () => m.PrivacyMode.NO_STORAGE, createSession: () => { throw new Error("not used"); } },
    onRequestId: () => {},
    isSubagentRunner: identity.isSubagentRunner,
    isSilenceAllowed: false,
    canUseSelfSummary: () => true,
    cancelThisRun: () => {},
    emittedConnectorCards: new Set(),
  });
  const requestContextExecutor = new m.SandRequestContextExecutor(
    { resolve: () => ({ osVersion: "test", shell: "sh", timeZone: "UTC", transcriptsFolder: dataDir }), resolveRules: async () => undefined },
    false,
    false,
  );
  const resourceAccessor = new m.CombinedResourceAccessor(
    { get: (resource) => { throw new Error(`the harness binds no ${String(resource.symbol)}`); } },
    [m.resourceEntry(m.requestContextExecutorResource, requestContextExecutor)],
  );
  const agent = m.createTurnAgentForRun({
    config,
    toolSession: runContext.toolSession,
    emitUpdate: () => {},
    interactionObservers: {},
    privacyMode: runContext.privacyMode,
    resourceAccessor,
    blobStore: new m.InMemoryBlobStore(),
    summarizationSession: runContext.summarizationSession,
  });
  const action = new m.ConversationAction({
    action: { case: "userMessageAction", value: new m.UserMessageAction({ userMessage: new m.UserMessage({ text: "Click Book.", messageId: "u1" }) }) },
  });
  const start = m.createTurnAgentStreamStart({ agent: { agent }, baseState: new m.ConversationStateStructure({}), action, privacyMode: runContext.privacyMode, mcpTools: [] });
  const [runCtx] = ctx.withCancel();
  await start.startStream(runCtx, undefined, async () => {});
  return { config, asked };
}

test("the helpers on the screen and in the browser are background work in the agent's config; the agent and a general helper are not", async () => {
  const loaded = await loadHarness();
  try {
    const m = loaded.module;
    const tool = m.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: () => "t1s1" });
    const of = (identity) => staticConfig(m, tool, { conversationId: "c", ...identity });
    const computer = of({ isSubagentRunner: true, isComputerUseSubagent: true });
    assert.equal(computer.claudeCodeKind, "helper");
    assert.equal(computer.claudeCodeBackground, true);
    assert.equal(of({ isSubagentRunner: true, isBrowserUseSubagent: true }).claudeCodeBackground, true);
    const general = of({ isSubagentRunner: true });
    assert.equal(general.claudeCodeKind, "helper");
    assert.equal(general.claudeCodeBackground, undefined);
    const own = of({ isSubagentRunner: false });
    assert.equal(own.claudeCodeKind, "agent");
    assert.equal(own.claudeCodeBackground, undefined);
  } finally {
    await loaded.dispose();
  }
});

test("the real Agent hands a computer-use helper's turn to Claude Code as background work, and the agent's own turn as its own", async () => {
  const loaded = await loadHarness();
  const fetchBefore = globalThis.fetch;
  try {
    const helper = await runTurn(loaded, { conversationId: "nora-computer-1", isSubagentRunner: true, isComputerUseSubagent: true });
    assert.equal(helper.asked.length, 1);
    assert.equal(helper.asked[0].kind, "helper");
    assert.equal(helper.asked[0].background, true);
    assert.match(helper.asked[0].text, /Click Book\./);

    const general = await runTurn(loaded, { conversationId: "nora-helper-1", isSubagentRunner: true });
    assert.equal(general.asked.length, 1);
    assert.equal(general.asked[0].kind, "helper");
    assert.equal("background" in general.asked[0], false);

    const own = await runTurn(loaded, { conversationId: "nora", isSubagentRunner: false });
    assert.equal(own.asked.length, 1);
    assert.equal(own.asked[0].kind, "agent");
    assert.equal("background" in own.asked[0], false);
  } finally {
    globalThis.fetch = fetchBefore;
    await loaded.dispose();
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const alice = { id: "a", name: "Alice", description: "ops" };
const bob = { id: "b", name: "Bob", description: "design" };
const cara = { id: "c", name: "Cara", description: "legal" };
const members = [alice, bob, cara];

test("a group text reaches every member, the upstream app's rounds (restored 28 September 2026)", async () => {
  // 19 September (f278ec79) cut rooms to one Luna speaker with no tools and
  // the member's job description as its only identity; every member then
  // answered "hi" by reciting that description. The upstream app's own room is back.
  const loaded = await load("source/host/groups/group-chat.ts", "group-chat");
  try {
    const { GROUP_MAX_ROUNDS, buildGroupMemberSystemPrompt, buildGroupTurnPrompt, resolveResponders } = loaded.module;
    const hello = [{ speaker: { kind: "user", name: "Bass" }, content: "hello everyone, what's the plan" }];
    assert.equal(GROUP_MAX_ROUNDS, 3);
    assert.deepEqual(resolveResponders(members, hello).map((member) => member.id), ["a", "b", "c"]);
    assert.deepEqual(
      resolveResponders(members, [{ speaker: { kind: "user" }, content: "need @bob on this" }]).map((member) => member.id),
      ["b"],
    );
    const system = buildGroupMemberSystemPrompt(alice, { name: "Week", description: "the weekly room" }, [bob, cara]);
    const turn = buildGroupTurnPrompt({ member: alice, group: { name: "Week", description: "the weekly room" }, peers: [bob, cara], newMessages: hello });
    assert.match(system, /SendMessage/);
    assert.match(system, /full toolkit/);
    assert.match(turn, /single SendMessage/);
  } finally {
    await loaded.dispose();
  }
});

test("machinery sessions stay on Luna; unknown the upstream app model ids cannot steal Terra", async () => {
  const loaded = await load("source/host/extensions/inference/provider-session.ts", "provider-session");
  const previousModel = process.env.SAND_SIMEON_MODEL;
  const previousCheap = process.env.SAND_SIMEON_CHEAP_MODEL;
  try {
    delete process.env.SAND_SIMEON_MODEL;
    delete process.env.SAND_SIMEON_CHEAP_MODEL;
    const {
      DEFAULT_SIMEON_MODEL,
      DEFAULT_SIMEON_CHEAP_MODEL,
      SIMEON_WORKING_CONTEXT_TOKENS,
      simeonModelForSession,
      createProviderPromptSession,
      isConfiguredSimeonModelId,
    } = loaded.module;
    assert.equal(DEFAULT_SIMEON_MODEL, "gpt-6-sol");
    assert.equal(DEFAULT_SIMEON_CHEAP_MODEL, "gpt-6-luna");
    assert.equal(SIMEON_WORKING_CONTEXT_TOKENS, 200_000);
    assert.equal(simeonModelForSession(), "gpt-6-sol");
    assert.equal(simeonModelForSession({ cheap: true }), "gpt-6-luna");
    assert.equal(simeonModelForSession({ isSummarizationSession: true, modelId: "gemini-2.5-flash" }), "gpt-6-luna");
    // The helpers that act on a screen run on the main model, as the upstream's do (8 October 2026).
    assert.equal(simeonModelForSession({ isComputerUseSubagent: true }), "gpt-6-sol");
    assert.equal(simeonModelForSession({ isBrowserUseSubagent: true }), "gpt-6-sol");
    assert.equal(simeonModelForSession({ model: "gpt-6-luna" }), "gpt-6-luna");
    assert.equal(simeonModelForSession({ modelId: "gpt-6-luna" }), "gpt-6-luna");
    assert.equal(simeonModelForSession({ modelId: "grok-4.5" }), "gpt-6-sol");
    assert.equal(simeonModelForSession({ model: "gemini-2.5-flash", cheap: true }), "gpt-6-luna");
    assert.equal(isConfiguredSimeonModelId("gpt-6-luna"), true);
    assert.equal(isConfiguredSimeonModelId("grok-4.5"), false);
    assert.equal(createProviderPromptSession("simeon").getModelId(), "gpt-6-sol");
    assert.equal(createProviderPromptSession("simeon", { cheap: true, isSummarizationSession: true }).getModelId(), "gpt-6-luna");
  } finally {
    if (previousModel === undefined) delete process.env.SAND_SIMEON_MODEL;
    else process.env.SAND_SIMEON_MODEL = previousModel;
    if (previousCheap === undefined) delete process.env.SAND_SIMEON_CHEAP_MODEL;
    else process.env.SAND_SIMEON_CHEAP_MODEL = previousCheap;
    await loaded.dispose();
  }
});

test("the turn's model id reaches the executor through the owner input (24 September 2026)", async () => {
  // Until then the owner input carried no modelId, so every turn fell through
  // to the executor's default whatever SAND_AGENT_MODEL said.
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /const staticModelId = process\.env\.SAND_AGENT_MODEL \?\? DEFAULT_SAND_MODEL;/);
  assert.match(composition, /onRequestId: requestIdForwarder\(hooks, "agent"\),\n(?:\s*\/\/.*\n)*\s*modelId: staticModelId,/);
});

test("local group turns run each member's own agent runner, as the upstream app does", async () => {
  const glue = await readFile(path.join(repoRoot, "source/host/extensions/transcript/group-chat-glue.ts"), "utf8");
  const orchestrator = await readFile(path.join(repoRoot, "source/host/extensions/transcript/group-chat-orchestrator.ts"), "utf8");
  assert.match(glue, /pinMemberSessionForGroupTurn/);
  assert.match(glue, /createGroupMemberRunner/);
  assert.doesNotMatch(glue, /runRoutedProviderText/);
  assert.match(orchestrator, /GROUP_MAX_ROUNDS/);
  assert.match(orchestrator, /resolveResponders/);
});

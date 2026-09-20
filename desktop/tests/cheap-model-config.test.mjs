import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
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
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const alice = { id: "a", name: "Alice", description: "ops" };
const bob = { id: "b", name: "Bob", description: "design" };
const cara = { id: "c", name: "Cara", description: "legal" };
const members = [alice, bob, cara];

test("a plain group text picks one speaker, not the whole room", async () => {
  const loaded = await load("source/host/groups/group-chat.ts", "group-chat");
  try {
    const {
      GROUP_MAX_ROUNDS,
      buildGroupMemberSystemPrompt,
      buildGroupTurnPrompt,
      nextUnmentionedSpeaker,
      resolveResponders,
    } = loaded.module;
    const hello = [{ speaker: { kind: "user", name: "Bass" }, content: "hello everyone, what's the plan" }];
    assert.equal(GROUP_MAX_ROUNDS, 2);
    assert.deepEqual(resolveResponders(members, hello).map((member) => member.id), ["a"]);
    assert.equal(nextUnmentionedSpeaker(members, hello)?.id, "a");
    assert.equal(
      nextUnmentionedSpeaker(members, [...hello, { speaker: { kind: "member", id: "a", name: "Alice" }, content: "hey" }])?.id,
      "b",
    );
    assert.deepEqual(
      resolveResponders(members, [{ speaker: { kind: "user" }, content: "need @bob on this" }]).map((member) => member.id),
      ["b"],
    );
    assert.deepEqual(
      resolveResponders(members, [{ speaker: { kind: "user" }, content: "@everyone check in" }]).map((member) => member.id),
      ["a", "b", "c"],
    );

    const system = buildGroupMemberSystemPrompt(alice, { name: "Week", description: "the weekly room" }, [bob, cara]);
    const turn = buildGroupTurnPrompt({
      member: alice,
      group: { name: "Week", description: "the weekly room" },
      peers: [bob, cara],
      newMessages: hello,
    });
    assert.match(system, /This is a conversation, not a work turn/);
    assert.match(system, /No tools/);
    assert.doesNotMatch(system, /full toolkit|do the work first|SendMessage/i);
    assert.match(turn, /one short message/);
    assert.doesNotMatch(turn, /full toolkit|SendMessage/i);
    assert.ok(system.length + turn.length < 2_000, `group prompts were ${system.length + turn.length} characters`);
  } finally {
    await loaded.dispose();
  }
});

test("machinery sessions stay on Luna; unknown Cursor model ids cannot steal Terra", async () => {
  const loaded = await load("source/host/extensions/inference/provider-session.ts", "provider-session");
  const previousModel = process.env.SAND_CLAIDOR_MODEL;
  const previousCheap = process.env.SAND_CLAIDOR_CHEAP_MODEL;
  try {
    delete process.env.SAND_CLAIDOR_MODEL;
    delete process.env.SAND_CLAIDOR_CHEAP_MODEL;
    const {
      DEFAULT_CLAIDOR_MODEL,
      DEFAULT_CLAIDOR_CHEAP_MODEL,
      CLAIDOR_WORKING_CONTEXT_TOKENS,
      claidorModelForSession,
      createProviderPromptSession,
      isConfiguredClaidorModelId,
    } = loaded.module;
    assert.equal(DEFAULT_CLAIDOR_MODEL, "gpt-5.6-terra");
    assert.equal(DEFAULT_CLAIDOR_CHEAP_MODEL, "gpt-5.6-luna");
    assert.equal(CLAIDOR_WORKING_CONTEXT_TOKENS, 200_000);
    assert.equal(claidorModelForSession(), "gpt-5.6-terra");
    assert.equal(claidorModelForSession({ cheap: true }), "gpt-5.6-luna");
    assert.equal(claidorModelForSession({ isSummarizationSession: true, modelId: "gemini-2.5-flash" }), "gpt-5.6-luna");
    assert.equal(claidorModelForSession({ isComputerUseSubagent: true }), "gpt-5.6-luna");
    assert.equal(claidorModelForSession({ isBrowserUseSubagent: true }), "gpt-5.6-luna");
    assert.equal(claidorModelForSession({ model: "gpt-5.6-luna" }), "gpt-5.6-luna");
    assert.equal(claidorModelForSession({ modelId: "gpt-5.6-luna" }), "gpt-5.6-luna");
    assert.equal(claidorModelForSession({ modelId: "grok-4.5" }), "gpt-5.6-terra");
    assert.equal(claidorModelForSession({ model: "gemini-2.5-flash", cheap: true }), "gpt-5.6-luna");
    assert.equal(isConfiguredClaidorModelId("gpt-5.6-luna"), true);
    assert.equal(isConfiguredClaidorModelId("grok-4.5"), false);
    assert.equal(createProviderPromptSession("claidor").getModelId(), "gpt-5.6-terra");
    assert.equal(createProviderPromptSession("claidor", { cheap: true, isSummarizationSession: true }).getModelId(), "gpt-5.6-luna");
  } finally {
    if (previousModel === undefined) delete process.env.SAND_CLAIDOR_MODEL;
    else process.env.SAND_CLAIDOR_MODEL = previousModel;
    if (previousCheap === undefined) delete process.env.SAND_CLAIDOR_CHEAP_MODEL;
    else process.env.SAND_CLAIDOR_CHEAP_MODEL = previousCheap;
    await loaded.dispose();
  }
});

test("local group turns are a cheap talk-only Luna call, not the host runner", async () => {
  const glue = await readFile(path.join(repoRoot, "source/host/extensions/transcript/group-chat-glue.ts"), "utf8");
  const orchestrator = await readFile(path.join(repoRoot, "source/host/extensions/transcript/group-chat-orchestrator.ts"), "utf8");
  const providers = await readFile(path.join(repoRoot, "source/host/extensions/inference/provider-session.ts"), "utf8");
  assert.match(glue, /runRoutedProviderText/);
  assert.match(glue, /configuredClaidorCheapModel\(\)/);
  assert.match(glue, /cheap: true/);
  assert.doesNotMatch(glue, /createGroupMemberRunner/);
  assert.doesNotMatch(glue, /executeTool|maxSteps/);
  assert.match(orchestrator, /GROUP_MAX_ROUNDS/);
  assert.match(orchestrator, /resolveResponders/);
  assert.match(providers, /DEFAULT_CLAIDOR_CHEAP_MODEL = "gpt-5\.6-luna"/);
  assert.match(providers, /CLAIDOR_WORKING_CONTEXT_TOKENS/);
});

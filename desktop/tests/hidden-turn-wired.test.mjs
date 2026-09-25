/**
 * Hidden turns get their 40-call budget on the production path, and the
 * runner sees its turn's prompt messages (25 September 2026,
 * design-audit-ledger.md F-001/F-015/F-117 and F-020).
 *
 * createAgentOwnerInput in host-runner-composition.ts copied
 * isSilenceAllowed and ackToken from the run options and dropped `hidden`,
 * so createProviderPromptSession saw hidden=false and every intro, nudge,
 * routine and revival ran with the asked-turn cap of 5,000 model calls;
 * and nothing set the runner's latest-prompt-messages getter, so the
 * closing-send nudge and post-turn labelling read an empty list.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the production owner input carries hidden and binds the prompt-messages getter", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /\.\.\.\(runOptions\.hidden === undefined\n\s*\? \{\}\n\s*: \{ hidden: runOptions\.hidden === true \}\),/, "hidden reaches the owner input");
  assert.match(composition, /onLatestPromptMessages: \(getter: \(\) => readonly unknown\[\]\) => \{\n\s*const runner = builtRunner as \{ setLatestPromptMessagesGetter\?/, "the agent's runner takes the getter");
  const runner = await readFile(path.join(repoRoot, "source/host/runner/sand-agent-runner.ts"), "utf8");
  assert.match(runner, /setLatestPromptMessagesGetter\(getter: \(\(\) => readonly unknown\[\]\) \| undefined\): void \{\n\s*this\.#latestPromptMessagesGetter = getter;/);
  const owner = await readFile(path.join(repoRoot, "source/host/runner/production-turn-agent-owner.ts"), "utf8");
  assert.match(owner, /\.\.\.\(input\.hidden === undefined \? \{\} : \{ hidden: input\.hidden \}\),/, "the owner forwards hidden to the run context");
});

test("a hidden session's budget is 40, an asked one's 5,000, and the model line says which", async () => {
  const { module, dispose } = await load("source/host/extensions/inference/provider-session.ts", "provider-session-budget");
  try {
    const hidden = module.createModelCallBudget({ hidden: true }, {});
    const asked = module.createModelCallBudget({}, {});
    assert.deepEqual([hidden.limit, hidden.hidden], [40, true]);
    assert.deepEqual([asked.limit, asked.hidden], [5000, false]);
    for (let i = 0; i < 40; i += 1) module.spendModelCall(hidden);
    assert.throws(() => module.spendModelCall(hidden), /ran without being asked and reached its budget of 40 model calls/);
    const line = module.formatModelCallLogLine({ model: "gpt-5.6-terra", effort: "high", inputTokens: 1, cachedTokens: 0, outputTokens: 1, reasoningTokens: 0, elapsedMs: 1, tools: "-", offered: "SendMessage", budget: "40 hidden=true" });
    assert.match(line, / offered=SendMessage budget=40 hidden=true$/);
  } finally {
    await dispose();
  }
});

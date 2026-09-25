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

const cursorBudget = {
  unusedTokensThresholdToStartBackgroundSummarization: 10_000,
  unusedPercentTokensThresholdToStartBackgroundSummarization: 0.1,
  unusedTokensThresholdToPersistBackgroundSummarization: 5_000,
  unusedPercentTokensThresholdToPersistBackgroundSummarization: 0.05,
};

test("Cursor's compaction trigger is dead when maxTokens is 0, and live on the 200k working window", async () => {
  const loaded = await load(
    "source/packages/agent-summarization/background-summarization.ts",
    "compaction-window",
  );
  try {
    const {
      getBackgroundSummarizationTriggerThreshold,
      shouldStartBackgroundSummarization,
    } = loaded.module;
    assert.equal(getBackgroundSummarizationTriggerThreshold(0, cursorBudget), undefined);
    assert.equal(shouldStartBackgroundSummarization(46_589, 0, cursorBudget), false);
    assert.equal(getBackgroundSummarizationTriggerThreshold(200_000, cursorBudget), 180_000);
    assert.equal(shouldStartBackgroundSummarization(46_589, 200_000, cursorBudget), false);
    assert.equal(shouldStartBackgroundSummarization(180_000, 200_000, cursorBudget), true);
  } finally {
    await loaded.dispose();
  }
});

test("Claidor reports the working window, not Terra's 1.05M physical one", async () => {
  const window = await load("source/shared/inference/claidor-context-window.ts", "claidor-window");
  const providers = await readFile(path.join(repoRoot, "source/host/extensions/inference/provider-session.ts"), "utf8");
  const host = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  try {
    assert.equal(window.module.CLAIDOR_WORKING_CONTEXT_TOKENS, 200_000);
    assert.match(providers, /aiSdkExecutor\([^\n]+CLAIDOR_WORKING_CONTEXT_TOKENS, \{ reasoningEffort \}, \{ model: id, effort: reasoningEffort[^\n]*\}\)/);
    assert.match(host, /agentTokenLimit: CLAIDOR_WORKING_CONTEXT_TOKENS/);
    assert.doesNotMatch(providers, /maxTokens: 0 \}\)\);\n  if \(onUsage/);
  } finally {
    await window.dispose();
  }
});

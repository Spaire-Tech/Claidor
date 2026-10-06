/**
 * Memory upkeep paid three times for one exchange (OpenAI log, 2 October
 * 2026): the checker refused a proposal, the retry policy asked again on the
 * same evidence, and again, a proposal and a check each time. The memory also
 * kept "Gmail is connected" because the assistant had said so.
 *
 * Offline, with the real service and retry policy: a refused proposal is not
 * retried, a failed call still is, and both prompts say an assistant's claim
 * about its own setup is not a memory.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = path.join(repoRoot, `.tmp-memory-synthesis-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/memory-synthesis-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const target = {
  prepareSynthesis: () => ({ memories: [] }),
  applySynthesis: () => "committed",
  hasMemories: () => false,
  hasDatedMemory: () => false,
  isTemporalReviewDue: () => false,
  markTemporalReview: () => {},
};

function service(module, { propose, verify }) {
  return new module.MemorySynthesisService({
    getTarget: () => target,
    propose,
    verify,
    retry: module.createRetryPolicy(module.realClock, { name: "test-retry", maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, shouldRetry: module.shouldRetryMemorySynthesis }),
  });
}

const EXCHANGE = { id: "e1", user: "Luna is our COO", assistant: "Noted. Gmail is connected.", occurredAt: 0 };
const PROPOSAL = { changes: [{ action: "create", content: "Luna is the COO.", kind: "profile", sourceEvidenceIds: ["e1"] }] };

test("a refused proposal is not proposed again", async () => {
  const { module, dispose } = await load();
  try {
    let proposals = 0, checks = 0;
    const memory = service(module, { propose: async () => { proposals++; return PROPOSAL; }, verify: async () => { checks++; return false; } });
    memory.start();
    memory.recordTurn("agent-1", EXCHANGE);
    const outcomes = await memory.runNow();
    assert.deepEqual(outcomes, ["rejected"]);
    assert.equal(proposals, 1);
    assert.equal(checks, 1);
    memory.dispose();
  } finally {
    await dispose();
  }
});

test("a failed call is still retried", async () => {
  const { module, dispose } = await load();
  // The policy's wait is an unreferenced timer; hold the loop open meanwhile.
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    let proposals = 0;
    const memory = service(module, { propose: async () => { proposals++; if (proposals < 2) throw new Error("socket hang up"); return PROPOSAL; }, verify: async () => true });
    memory.start();
    memory.recordTurn("agent-1", EXCHANGE);
    assert.deepEqual(await memory.runNow(), ["committed"]);
    assert.equal(proposals, 2);
    memory.dispose();
  } finally {
    clearInterval(keepAlive);
    await dispose();
  }
});

test("both prompts keep the assistant's own claims out of memory", async () => {
  const { module, dispose } = await load();
  try {
    assert.match(module.synthesisSystemPrompt(), /only when the person confirmed it/);
    assert.match(module.synthesisSystemPrompt(), /Gmail is connected/);
    assert.match(module.verificationSystemPrompt(), /rests only on the assistant's own claim/);
  } finally {
    await dispose();
  }
});

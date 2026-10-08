/**
 * A trivial reply is not remembered (8 October 2026). The founder's staffing
 * log: after "ok no worries" and every other short reply, two cheap-model
 * memory calls ran a minute later. The memory path every agent runs on
 * (synthesis) skipped the triviality filter, and the filter matched whole
 * phrases only, so "ok no worries" passed it anyway.
 *
 * Offline, this holds:
 * - a short message made only of acknowledgement words is trivial, while a
 *   question, anything longer than 40 characters, or a short message with a
 *   word of substance is memorable;
 * - turn-settle asks the filter on both memory paths.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const memory = await loadModule("source/host/runner/sand-memory.ts", "sand-memory-trivial");

test("short acknowledgements are trivial", () => {
  for (const reply of ["ok no worries", "OK, no worries!", "kk go", "thanks!", "thank you so much", "sounds good", "got it, thanks", "yes please", "go ahead", "all set", "👍", "ok", "no worries"]) {
    assert.equal(memory.isMemorableExchange(reply), false, reply);
  }
});

test("questions, longer messages and short messages with substance are memorable", () => {
  for (const message of [
    "We haven't collected it yet",
    "another source i'll keep you posted",
    "my name is Bass",
    "no, cancel that",
    "ok what's next?",
    "Staff Growth, Finance, and Customer Voice.",
    "ok no worries for now, i'll come back with more info later",
    "merci",
  ]) {
    assert.equal(memory.isMemorableExchange(message), true, message);
  }
  assert.equal(memory.isMemorableExchange("   "), false);
});

test("turn-settle asks the filter on the synthesis path too", async () => {
  const settle = await readFile(path.join(repoRoot, "source/host/runner/turn-settle.ts"), "utf8");
  assert.match(settle, /scope\.isMemorableExchange != null\n\s*\? scope\.isMemorableExchange\(args\.trimmedPrompt\)\n\s*: scope\.memoryStore\.recordMemoryEvidence != null/);
  assert.doesNotMatch(settle, /scope\.memoryStore\.recordMemoryEvidence != null\n\s*\|\| scope\.isMemorableExchange/);
});

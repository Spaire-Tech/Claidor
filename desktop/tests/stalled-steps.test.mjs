/**
 * A step can't hang for ever (18 October 2026). Rhea's browser helper sat
 * in one step after a failed click: a model answer that stalls after its
 * first bytes had no deadline at all, nor did a browser command. Each now
 * has one: an answer with nothing new for three minutes is cancelled with a
 * sentence the loop can act on, a browser step past two minutes is given up.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("a model answer with nothing new within the deadline is cancelled with a plain sentence; one that answers is untouched", async (t) => {
  const { module, dispose } = await load("source/host/extensions/inference/provider-session.ts", "stalled-answer");
  t.after(dispose);
  assert.equal(module.SIMEON_STREAM_IDLE_MS, 180_000);
  const cancelled = [];
  const silent = { next: () => new Promise(() => {}) };
  await assert.rejects(module.nextWithin(silent, 30, (reason) => cancelled.push(reason.message)), /^Error: The model stopped answering: nothing came for 0 s\.$/);
  assert.deepEqual(cancelled, ["The model stopped answering: nothing came for 0 s."], "the request itself is cancelled");
  const talking = { next: async () => ({ done: false, value: { type: "text-delta", textDelta: "Hi" } }) };
  assert.deepEqual(await module.nextWithin(talking, 1_000, () => cancelled.push("no")), { done: false, value: { type: "text-delta", textDelta: "Hi" } });
  assert.equal(cancelled.length, 1);
});

test("a browser step the computer never answers is given up after two minutes", async (t) => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-tools.ts", "stalled-browser");
  t.after(dispose);
  assert.equal(module.SAND_BROWSER_STEP_LIMIT_MS, 120_000);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const driver = new module.SandBrowserDriver({
    getBoxId: () => "box",
    getDefaultViewId: () => "view",
    uploadFile: async () => {},
    downloadFile: async () => new Uint8Array(),
    executeShell: (_context, request) => request.command.startsWith("test -s") ? Promise.resolve({ case: "success", stdout: "present", exitCode: 0 }) : new Promise(() => {}),
    resolveWindowIndex: async () => 1,
  });
  driver.resolveWindowIndex = async () => 1;
  const step = driver.run({}, { op: "click", toolCallId: "call-1", args: { ref: "e1", element: "Add to cart" } });
  const outcome = step.then(() => "answered", (error) => error.message);
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  t.mock.timers.tick(module.SAND_BROWSER_STEP_LIMIT_MS);
  assert.equal(await outcome, "The browser on this computer didn't answer within 2 minutes; try the step again.");
});

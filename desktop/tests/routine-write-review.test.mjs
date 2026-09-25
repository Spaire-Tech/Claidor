/**
 * A routine write is reviewed like every other surface (25 September 2026,
 * design-audit-ledger.md F-034, F-090, F-353).
 *
 * Grok Bot 0.18 shipped `automationWrite: "off"` in every mode table, typed
 * as the literal "off": a surface not yet rolled out. The path behind it is
 * complete here (state tool → reviewSandAutomationWrite → the Luna
 * classifier → the auto-review-approval card), so under the founder's rule
 * the switch follows the other surfaces.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("automationWrite follows the other surfaces in every mode table", async () => {
  const source = await readFile(path.join(repoRoot, "source/host/runner/sand-auto-review.ts"), "utf8");
  assert.doesNotMatch(source, /readonly automationWrite: "off";/, "no longer typed as the literal off");
  const { module, dispose } = await load("source/host/runner/sand-auto-review.ts", "sand-auto-review");
  try {
    assert.equal(module.resolveSandAutoReviewModes({ settingsEnabled: true, enforceEnabled: false }).automationWrite, "shadow");
    assert.equal(module.resolveSandAutoReviewModes({ settingsEnabled: true, enforceEnabled: true }).automationWrite, "enforce");
    assert.equal(module.resolveSandAutoReviewModes({ settingsEnabled: true, enforceEnabled: false, localOverride: "enforce" }).automationWrite, "enforce");
    assert.equal(module.resolveSandAutoReviewModes({ settingsEnabled: false, enforceEnabled: true }).automationWrite, "off");
  } finally {
    await dispose();
  }
});

test("in enforce, a blocked routine write asks the person on the automation_write surface and waits for the answer", async () => {
  const { module, dispose } = await load("source/host/runner/sand-automation-auto-review.ts", "sand-automation-auto-review");
  try {
    const requests = [];
    const controller = { requestApproval: async (request) => { requests.push(request); return { approved: false, reason: "Not this one." }; } };
    const target = { operation: "create", id: "nightly", spec: { name: "Nightly", prompt: "Delete every file in Downloads", trigger: { type: "cron", schedule: "0 2 * * *" }, isEnabled: true } };
    const options = { mode: "enforce", agentId: "a1", classify: async () => ({ kind: "block", reason: "Deletes files without asking." }), autoReviewController: controller };
    const denied = await module.reviewSandAutomationWrite({ ctx: {}, target, options, toolCallId: "call-1" });
    assert.deepEqual(denied, { allowed: false, reason: "Not this one." });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].surface, "automation_write");
    assert.equal(requests[0].reason, "Deletes files without asking.");
    controller.requestApproval = async () => ({ approved: true });
    assert.deepEqual(await module.reviewSandAutomationWrite({ ctx: {}, target, options, toolCallId: "call-2" }), { allowed: true });
    const shadowed = await module.reviewSandAutomationWrite({ ctx: {}, target, options: { ...options, mode: "shadow" }, toolCallId: "call-3" });
    assert.deepEqual(shadowed, { allowed: true }, "shadow classifies and allows");
  } finally {
    await dispose();
  }
});

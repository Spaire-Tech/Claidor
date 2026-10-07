/**
 * From the insurance log of 6 October 2026 (the founder: "fix this based on
 * how the upstream app did it"), offline:
 *
 * - a shadow review survives a failed page-state probe: the action runs and
 *   the host log says why; enforce still refuses, with the cause;
 * - the Computer tool refuses the third identical action on an unchanged
 *   screen;
 * - the helpers and the main agent are told to stop at a form that needs
 *   the person's own details and hand them the box, never to swap the job;
 * - an attachment's bytes count whatever shape the bridge delivered.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

test("a shadow review survives a failed page-state probe; enforce refuses with the cause", async () => {
  const browser = await loadModule("source/host/runner/sand-browser-auto-review.ts", "browser-review");
  const computer = await loadModule("source/host/runner/sand-computer-auto-review.ts", "computer-review");
  const logged = [];
  const failing = async () => { throw new Error("curl: (7) Failed to connect"); };
  const base = { agentId: "a1", boxIdentity: { boxId: "b", windowGeneration: "g" }, resolveDisplayNumber: async () => 1, onShadowCaptureFailed: (message) => logged.push(message) };
  await browser.runSandBrowserAutoReviewPreflight({ ctx: {}, resourceAccessor: {}, exactAction: { op: "click", element: "Next" }, toolCallId: "t1", options: { ...base, mode: "shadow", captureReviewState: failing } });
  await computer.runSandComputerAutoReviewPreflight({ ctx: {}, resourceAccessor: {}, exactAction: { action: "click", coordinates: { x: 1, y: 2 } }, description: "Next", toolCallId: "t2", options: { ...base, mode: "shadow", captureDisplayStateIdentity: failing } });
  assert.deepEqual(logged, ["curl: (7) Failed to connect", "curl: (7) Failed to connect"], "the action ran and the log says why the review was skipped");
  await assert.rejects(browser.runSandBrowserAutoReviewPreflight({ ctx: {}, resourceAccessor: {}, exactAction: { op: "click", element: "Next" }, toolCallId: "t3", options: { ...base, mode: "enforce", captureReviewState: failing } }), /Failed to connect/);
  await assert.rejects(computer.runSandComputerAutoReviewPreflight({ ctx: {}, resourceAccessor: {}, exactAction: { action: "click", coordinates: { x: 1, y: 2 } }, description: "Next", toolCallId: "t4", options: { ...base, mode: "enforce", captureDisplayStateIdentity: failing } }), /Failed to connect/);
  const aborted = Object.assign(new Error("gone"), { name: "AbortError" });
  await assert.rejects(browser.runSandBrowserAutoReviewPreflight({ ctx: {}, resourceAccessor: {}, exactAction: { op: "click", element: "Next" }, toolCallId: "t5", options: { ...base, mode: "shadow", captureReviewState: async () => { throw aborted; } } }), /gone/, "a cancelled turn stays a cancellation");
});

test("the Computer tool refuses the third identical action on an unchanged screen, and a changed screen starts again", async () => {
  const { createComputerLoopGuard, SAND_COMPUTER_LOOP_MESSAGE, createComputerTool } = await loadModule("source/host/runner/tools/sand-computer-tool.ts", "computer-tool");
  const guard = createComputerLoopGuard();
  guard.sawScreen("SHOT-A");
  const typeZip = { action: "type", text: "98144" };
  assert.equal(guard.check(typeZip), true);
  assert.equal(guard.check(typeZip), true);
  assert.equal(guard.check(typeZip), false, "the third time on the same screen");
  guard.sawScreen("SHOT-B");
  assert.equal(guard.check(typeZip), true, "a new screen is a new start");
  assert.equal(guard.check({ action: "click", coordinates: { x: 1, y: 1 } }), true, "a different action is fine");
  assert.match(SAND_COMPUTER_LOOP_MESSAGE, /third time you have sent exactly this action to exactly this screen/);
  // Through the tool itself: the box answers the same screenshot every time.
  const calls = [];
  const tool = createComputerTool({ resourceAccessor: { get: () => undefined }, getPersistImage: () => undefined, execute: async (_ctx, args) => { calls.push(args.actions.length); return { result: { case: "success", value: { screenshot: "U0hPVA==" } } }; } });
  const run = () => tool.execute({ action: "click", x: 174, y: 569, description: "Focus GEICO ZIP input" }, { context: {}, toolCallId: "c" });
  // The first call acts on no known screen; the next three act on the screen it returned.
  const first = await run(), second = await run(), third = await run(), fourth = await run();
  assert.equal(first.result.case, "success");
  assert.equal(second.result.case, "success");
  assert.equal(third.result.case, "success");
  assert.equal(fourth.result.case, "error");
  assert.equal(fourth.result.value.error, SAND_COMPUTER_LOOP_MESSAGE);
  assert.equal(calls.length, 3, "the refused action never reached the box");
  assert.match(tool.render(fourth).content, /^Computer action failed: Not run: this is the third time/);
});

test("helpers stop at a form that needs the person's own details, and the agents hand over the box", async () => {
  const glue = await readFile(path.join(repoRoot, "source/host/runner/prompt-collector-glue.ts"), "utf8");
  assert.equal((glue.match(/or a form that asks for the user's own details \(name, address, date of birth, licence, card\) — stop at that form with it on screen/g) ?? []).length, 2, "the computer and browser helpers");
  assert.match(glue, /or a form that asks for their own details: a quote, a booking, an application\), hand them the box with request_box_help directly/);
  const { computerUseSubagentDescription } = await loadModule("source/host/runner/tools/sand-computer-use-subagent.ts", "computer-description");
  assert.match(computerUseSubagentDescription(true), /a form asking for the user's own details\) it stops at that step and reports back/);
  assert.match(computerUseSubagentDescription(true), /never swap the job for a safer one on your own/);
  const browserUse = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-browser-use-subagent.ts"), "utf8");
  assert.match(browserUse, /or a form asking for the user's own details\)/);
  const { staffedFirstRunCue } = await loadModule("source/shared/agents/chief-of-staff.ts", "chief-of-staff-cue");
  assert.match(staffedFirstRunCue({ fromName: "Simeon", personName: "Bass F" }), /hand them your computer with request_box_help so they fill it in; never swap the job for a safer one and never invent their details/);
});

test("an attachment's bytes count whatever shape the bridge delivered", async () => {
  const { coerceAttachmentBytes } = await loadModule("source/electron-main/attachments/attachments.ts", "attachments-bytes");
  assert.deepEqual([...coerceAttachmentBytes(new Uint8Array([1, 2]))], [1, 2]);
  assert.deepEqual([...coerceAttachmentBytes(new Uint8Array([3, 4]).buffer)], [3, 4]);
  assert.deepEqual([...coerceAttachmentBytes(Buffer.from([5, 6]))], [5, 6]);
  assert.deepEqual([...coerceAttachmentBytes(new DataView(new Uint8Array([7]).buffer))], [7]);
  assert.deepEqual([...coerceAttachmentBytes([8, 9])], [8, 9]);
  assert.deepEqual([...coerceAttachmentBytes({ type: "Buffer", data: [10] })], [10]);
  assert.equal(coerceAttachmentBytes("not bytes"), null);
  assert.equal(coerceAttachmentBytes({ 0: 1, 1: 2 }), null);
});

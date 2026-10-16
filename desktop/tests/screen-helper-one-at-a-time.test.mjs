/**
 * One helper on the screen at a time (15 October 2026). The founder asked
 * the agent to fill in a practice form; it sent browser helpers, and the
 * typed fields came out scrambled ("a couple of them overlapped and typed
 * over each other"), the form open in two tabs. A computerUse helper already
 * held the screen while it ran; a browserUse helper did not, and every
 * browser helper acts in the agent's own tab (`getDefaultViewId` is the
 * agent's), so two at once clicked and typed into the same fields.
 *
 * Offline, with the adapter the Task tool goes through and the screen lock
 * production wires to it (`createComputerUseCoordination`).
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
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function adapter() {
  const adapters = await load("source/host/runner/agent-adapters.ts", "agent-adapters");
  const coordination = await load("source/host/runner/computer-use.ts", "computer-use");
  const screen = coordination.createComputerUseCoordination({});
  const running = new Set();
  const sessions = new Map();
  let failNext = false;
  const host = new adapters.SandSubagentHostAdapter(sessions, () => {
    if (failNext) { failNext = false; throw new Error("the runner could not be made"); }
    return { run: async () => ({ text: "done", aborted: false }), interrupt() {} };
  }, {
    isRunning: (id) => running.has(id),
    allocateComputerUseWindow: (id) => screen.allocateWindow(id),
    freeComputerUseWindow: (id) => screen.freeWindow(id),
    dispatch() {},
  });
  const launch = (subagentType, resumeAgentId) => host.createOrResumeSession({}, { subagentType, toolCallId: `call-${Math.random()}`, prompt: "Fill in the form.", ...(resumeAgentId === undefined ? {} : { resumeAgentId }) });
  // What `subagent-runtime.ts` does when a helper settles, whatever its outcome.
  const settle = (id) => screen.freeWindow(id);
  return { adapters, launch, settle, failNextRunner: () => { failNext = true; } };
}

test("a second browser helper is refused while one is on the screen, and so is a computer helper", async () => {
  const { adapters, launch, settle } = await adapter();
  const first = await launch("browserUse");
  await assert.rejects(launch("browserUse"), (error) => error.message === adapters.SCREEN_BUSY);
  await assert.rejects(launch("browser_use"), (error) => error.message === adapters.SCREEN_BUSY);
  await assert.rejects(launch("computerUse"), (error) => error.message === adapters.SCREEN_BUSY);
  assert.match(adapters.SCREEN_BUSY, /wait for its result.*StopSubagent/);
  // A helper that does not drive the screen is not held up.
  assert.match(await launch("generalPurpose"), /^subagent-/);
  // Once the first one settles (done, stopped or failed), the next one may go.
  settle(first);
  const second = await launch("browserUse");
  assert.notEqual(second, first);
});

test("a computer helper holds the screen against a browser helper too", async () => {
  const { adapters, launch, settle } = await adapter();
  const computer = await launch("computerUse");
  await assert.rejects(launch("browserUse"), (error) => error.message === adapters.SCREEN_BUSY);
  settle(computer);
  assert.match(await launch("browserUse"), /^subagent-/);
});

test("a helper dispatched again to continue takes the screen again, and waits its turn", async () => {
  const { adapters, launch, settle } = await adapter();
  const first = await launch("browserUse");
  settle(first);
  const other = await launch("computerUse");
  await assert.rejects(launch("browserUse", first), (error) => error.message === adapters.SCREEN_BUSY);
  settle(other);
  assert.equal(await launch("browserUse", first), first);
  await assert.rejects(launch("browserUse"), (error) => error.message === adapters.SCREEN_BUSY, "the resumed one holds it");
});

test("a helper that could not be made lets go of the screen", async () => {
  const { launch, failNextRunner } = await adapter();
  failNextRunner();
  await assert.rejects(launch("browserUse"), /could not be made/);
  assert.match(await launch("browserUse"), /^subagent-/);
});

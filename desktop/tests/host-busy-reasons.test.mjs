/**
 * What keeps the computer awake (12 November 2026).
 *
 * The founder switched on `SIMEON_BOX_SLEEPS_WITH_APP_OPEN` and the cloud
 * computer still never slept; nothing said why. `/health` now names what
 * holds it (`busyReasons`), and a background command an agent left running
 * (a dev server, `tail -f`) stops holding it once it has been quiet for
 * thirty minutes: no output, and no turn since.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const MINUTE = 60_000;

function idle(now) {
  return { nowMs: now, runningTurns: false, backgroundShellRunning: false, pendingWakes: [], midDrainRevival: false, coding: false, lastWorkAtMs: 0 };
}

test("each kind of work is named, and nothing is named when nothing runs", async () => {
  const { module, dispose } = await load("source/host/host-busy.ts", "host-busy");
  try {
    const now = 100 * MINUTE;
    assert.equal(module.BACKGROUND_SHELL_QUIET_MS, 30 * MINUTE);
    assert.deepEqual(module.describeHostBusy(idle(now)), { otherWorkBusy: false, busyReasons: [], quietBackgroundShell: false });
    assert.deepEqual(module.describeHostBusy({ ...idle(now), runningTurns: true, lastWorkAtMs: now }).busyReasons, ["turn"]);
    assert.deepEqual(module.describeHostBusy({ ...idle(now), midDrainRevival: true }).busyReasons, ["revival"]);
    assert.deepEqual(module.describeHostBusy({ ...idle(now), coding: true }).busyReasons, ["coding"]);
    // A cloud agent's result awaited holds the computer however long it takes.
    const cloud = module.describeHostBusy({ ...idle(now), pendingWakes: [{ kind: "cloud-agent", markedAtMs: 0 }] });
    assert.deepEqual(cloud.busyReasons, ["pending-wake"]);
    assert.equal(cloud.otherWorkBusy, true);
    // A turn alone is not "other work" (the approval card's rule needs that).
    assert.equal(module.describeHostBusy({ ...idle(now), runningTurns: true }).otherWorkBusy, false);
  } finally {
    await dispose();
  }
});

test("a background command holds the computer for thirty quiet minutes, then lets it sleep", async () => {
  const { module, dispose } = await load("source/host/host-busy.ts", "host-busy");
  try {
    const started = 10 * MINUTE;
    const shell = (now, extra = {}) => module.describeHostBusy({ ...idle(now), backgroundShellRunning: true, backgroundShellActiveAtMs: started, lastWorkAtMs: started, ...extra });
    assert.deepEqual(shell(started + 29 * MINUTE).busyReasons, ["background-shell"]);
    assert.equal(shell(started + 29 * MINUTE).otherWorkBusy, true);
    const quiet = shell(started + 30 * MINUTE);
    assert.deepEqual(quiet.busyReasons, [], "a dev server left running no longer holds it");
    assert.equal(quiet.otherWorkBusy, false);
    assert.equal(quiet.quietBackgroundShell, true);
    // Output written since restarts the quiet time.
    assert.deepEqual(shell(started + 40 * MINUTE, { backgroundShellActiveAtMs: started + 20 * MINUTE }).busyReasons, ["background-shell"]);
    // So does a turn (one may have read its output).
    assert.deepEqual(shell(started + 40 * MINUTE, { lastWorkAtMs: started + 15 * MINUTE }).busyReasons, ["background-shell"]);
    // A turn running is named on its own, and the command with it.
    assert.deepEqual(shell(started + 40 * MINUTE, { runningTurns: true, lastWorkAtMs: started + 40 * MINUTE }).busyReasons, ["turn", "background-shell"]);
  } finally {
    await dispose();
  }
});

test("a command's kept wake counts as the command, with the same limit", async () => {
  const { module, dispose } = await load("source/host/host-busy.ts", "host-busy");
  try {
    const marked = 50 * MINUTE;
    const kept = (now) => module.describeHostBusy({ ...idle(now), pendingWakes: [{ kind: "shell", markedAtMs: marked }, { kind: "cloud-agent", markedAtMs: 0 }] });
    assert.deepEqual(kept(marked + 5 * MINUTE).busyReasons, ["background-shell", "pending-wake"]);
    assert.deepEqual(kept(marked + 31 * MINUTE).busyReasons, ["pending-wake"]);
    const alone = module.describeHostBusy({ ...idle(marked + 31 * MINUTE), pendingWakes: [{ kind: "shell", markedAtMs: marked }] });
    assert.deepEqual(alone, { otherWorkBusy: false, busyReasons: [], quietBackgroundShell: true });
  } finally {
    await dispose();
  }
});

test("a watched command's output restarts its quiet time; its start is when it was watched", async () => {
  const { module, dispose } = await load("source/host/runner/background-work.ts", "background-work");
  try {
    let now = 1_000;
    let wrote;
    const watches = module.createBackgroundWatches({
      now: () => now,
      getConversationId: () => "agent-1",
      emitAsyncTasksChanged() {},
      pendingWakeArmedHandler: () => undefined,
      backgroundShellSettledHandler: () => undefined,
      notifyBackgroundWorkSettled() {},
      cloudAgentWatcher: () => null,
      pollShellTerminalFile(_id, _cancelled, _settle, onWrote) { wrote = onWrote; },
    });
    assert.equal(watches.backgroundShellActiveAtMs(), undefined, "nothing runs");
    watches.watchBackgroundShell("4242", { title: "npm run dev" });
    assert.equal(watches.hasRunningBackgroundShellWork(), true);
    assert.equal(watches.backgroundShellActiveAtMs(), 1_000);
    now = 5_000;
    wrote();
    assert.equal(watches.backgroundShellActiveAtMs(), 5_000);
    // Work registered for a turn counts from when it was registered.
    now = 9_000;
    watches.registry().upsertWork({ id: "77", kind: "shell", state: "running" });
    assert.equal(watches.backgroundShellActiveAtMs(), 9_000);
    watches.cancelBackgroundWatches();
    assert.equal(watches.backgroundShellActiveAtMs(), undefined);
  } finally {
    await dispose();
  }
});

test("the terminal file growing is output; its header ticking is not", async () => {
  const { module, dispose } = await load("source/host/runner/shell-terminal-watch.ts", "shell-terminal-watch");
  try {
    const header = (ms) => `---\nstatus: running  \nrunning_for_ms: ${String(ms).padEnd(9, " ")}\n---\n`;
    const reads = [header(5_000), header(10_000), header(15_000) + "listening on :3000\n", header(20_000) + "listening on :3000\n", header(25_000) + "listening on :3000\n\n---\nexit_code: 0\nended_at: x\n---\n"];
    let wrote = 0;
    let settled;
    const host = {
      ctx: {},
      getConversationId: () => "agent-1",
      ensureBoxReady: async () => ({
        terminalsFolder: "/terminals",
        remoteAccessor: { read: async () => ({ result: { case: "success", value: { output: { case: "content", value: reads.shift() ?? "" } } } }) },
      }),
      getConversationState: () => ({ turns: [] }),
      getBlob: async () => null,
      decodeConversationTurn: () => ({}),
      decodeUserMessage: () => ({ text: "", messageId: "" }),
      getConfirmedUserTurnWatermarkCache: () => undefined,
      setConfirmedUserTurnWatermarkCache() {},
      delay: async () => {},
    };
    await module.pollShellTerminalFile(host, "4242", () => false, (status) => { settled = status; }, () => { wrote += 1; });
    assert.equal(settled, "success");
    assert.equal(wrote, 2, "the line written and the footer; never the header's clock");
  } finally {
    await dispose();
  }
});

test("/health says what holds the computer, and says nothing more for a host that does not know", async () => {
  const { module, dispose } = await load("source/host/gateway-server.ts", "gateway-server");
  let health = { isBusy: true, busyOnlyAwaitingApproval: false, activeAgentId: null, lastBusyAtMs: 7, busyReasons: ["background-shell"], quietBackgroundShell: false };
  const server = await module.startGatewayServer({ api: { getAgentAvatar: async () => ({}) }, subscribe: () => () => {}, getHealth: () => health, startedAt: 1 });
  try {
    const read = async () => (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
    const said = await read();
    assert.equal(said.isBusy, true);
    assert.deepEqual(said.busyReasons, ["background-shell"]);
    assert.equal(said.quietBackgroundShell, false);
    health = { isBusy: false, busyOnlyAwaitingApproval: false, activeAgentId: null, lastBusyAtMs: 7 };
    const older = await read();
    assert.equal("busyReasons" in older, false, "a missing field means unknown");
    assert.equal("quietBackgroundShell" in older, false);
  } finally {
    await server.close();
    await dispose();
  }
});

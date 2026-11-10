/**
 * The chat's line when an agent's model changes (10 November 2026, the
 * founder: "whenever a model is changed, i want this to fire in the chat"):
 * the turn's model read from the server's roles and names, each agent's
 * last model kept across restarts, a line only when it really changes (none
 * at first sight), written in the chat without waking the agent, never in a
 * group, and never in the turn's way.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-turn-model-"));
  const outfile = path.join(dir, "turn-model.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/turn-model-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dir, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const rows = (...list) => ({ code: 0, data: list });
const opusRow = { modelId: "own:anthropic:claude-opus-5-5", modelName: "Claude Opus 5.5", role: "primary", transportApi: "openai-responses", accessible: true };
const solRow = { modelId: "gpt-6.1-sol", modelName: "GPT-6.1 Sol", role: "primary", transportApi: "openai-responses", accessible: true };
const claudeRow = { modelId: "own:claude:claude-opus-5-5", modelName: "Claude Opus 5.5", role: "primary", transportApi: "claude-code", claudeCodeModel: "opus", accessible: true };

test("the turn's model: the person's own, Claude's plan, or Simeon's whichever model that is", async () => {
  const { module: m, dispose } = await load();
  try {
    m.rememberSimeonModelNames(rows(opusRow, solRow));
    const roles = m.parseSimeonModelRoles(rows(opusRow, solRow));
    assert.deepEqual(m.turnModelOf(roles, roles.primary), { model: "own:anthropic:claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" });
    // Simeon's own model, GPT or Claude, is Simeon: its change is not the person's.
    assert.deepEqual(m.turnModelOf({ primary: "gpt-6.1-sol" }, "gpt-6.1-sol"), m.SIMEON_TURN_MODEL);
    assert.deepEqual(m.turnModelOf({ primary: "claude-sonnet-5-5" }, "claude-sonnet-5-5"), m.SIMEON_TURN_MODEL);
    assert.deepEqual(m.turnModelOf({}, undefined), m.SIMEON_TURN_MODEL);
    // A key's model the server didn't name: its id says it.
    assert.deepEqual(m.turnModelOf({}, "own:deepseek:deepseek-v4-pro", () => undefined), { model: "own:deepseek:deepseek-v4-pro", name: "deepseek-v4-pro", provider: "deepseek" });
    // The Claude plan: the Claude Code row's model, named as the server named it.
    m.rememberSimeonModelNames(rows(claudeRow, solRow));
    assert.equal(m.simeonClaudeCodeModelId(), "own:claude:claude-opus-5-5");
    const claude = m.parseSimeonModelRoles(rows(claudeRow, solRow));
    assert.deepEqual(m.turnModelOf(claude, claude.primary), { model: "own:claude:claude-opus-5-5", name: "Claude Opus 5.5", provider: "claude" });
    assert.equal(m.simeonModelName("gpt-6.1-sol"), "GPT-6.1 Sol");
    // Nothing that isn't an answer changes the names kept.
    m.rememberSimeonModelNames({ nope: true });
    assert.equal(m.simeonModelName("gpt-6.1-sol"), "GPT-6.1 Sol");
  } finally {
    await dispose();
  }
});

test("a line only when an agent's model changes, none at first sight, kept across restarts", async () => {
  const { module: m, dir, dispose } = await load();
  try {
    const file = path.join(dir, "data", m.TURN_MODELS_FILE);
    const written = [];
    const write = (agentId, event) => { written.push({ agentId, event }); };
    const opus = { model: "own:anthropic:claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" };
    const deepseek = { model: "own:deepseek:deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "deepseek" };
    const models = new m.TurnModels(file, write, () => {});
    // First sight (a new agent, or every agent once this engine arrives): remembered, no line.
    assert.equal(await models.note("iris", m.SIMEON_TURN_MODEL), false);
    assert.equal(await models.note("iris", m.SIMEON_TURN_MODEL), false);
    assert.equal(written.length, 0);
    // The person picks Claude Opus 5.5: one line, then none while it stays.
    assert.equal(await models.note("iris", opus), true);
    assert.equal(await models.note("iris", opus), false);
    assert.deepEqual(written, [{ agentId: "iris", event: { type: "model-changed", from: m.SIMEON_TURN_MODEL, to: opus } }]);
    // Each agent its own: Theo's first turn is first sight.
    assert.equal(await models.note("theo", opus), false);
    // After a restart the last model is still known.
    const again = new m.TurnModels(file, write, () => {});
    assert.equal(await again.note("iris", deepseek), true);
    assert.deepEqual(written.at(-1).event, { type: "model-changed", from: opus, to: deepseek });
    // Back to Simeon.
    assert.equal(await again.note("iris", m.SIMEON_TURN_MODEL), true);
    assert.deepEqual(written.at(-1).event.to, m.SIMEON_TURN_MODEL);
    // The same model named better (a key's own list): kept, no line.
    assert.equal(await again.note("theo", { ...opus, name: "Claude Opus 5.5 (latest)" }), false);
    const kept = JSON.parse(await readFile(file, "utf8"));
    assert.equal(kept.theo.name, "Claude Opus 5.5 (latest)");
    assert.equal(kept.iris.model, null);
    assert.equal(written.length, 3);
    // An unreadable file: every agent seen afresh, nothing thrown.
    const broken = path.join(dir, "broken.json");
    await (await import("node:fs/promises")).writeFile(broken, "{not json");
    assert.equal(await new m.TurnModels(broken, write, () => {}).note("iris", opus), false);
  } finally {
    await dispose();
  }
});

test("never in the turn's way: a slow or failing writer, or none set", async () => {
  const { module: m, dir, dispose } = await load();
  try {
    const opus = { model: "own:anthropic:claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" };
    // No writer yet (the transcript not started): nothing done.
    m.setTurnModelLine(undefined);
    await m.noteTurnModel("iris", opus);
    // A writer that never answers: the turn waits a second at most.
    m.setTurnModelLine(() => new Promise(() => {}), path.join(dir, "slow.json"));
    await m.noteTurnModel("iris", m.SIMEON_TURN_MODEL);
    const started = Date.now();
    await m.noteTurnModel("iris", opus);
    assert.ok(Date.now() - started < m.TURN_MODEL_LINE_WAIT_MS + 500);
    // A writer that throws: swallowed.
    m.setTurnModelLine(() => { throw new Error("disk full"); }, path.join(dir, "failing.json"));
    await m.noteTurnModel("iris", m.SIMEON_TURN_MODEL);
    await m.noteTurnModel("iris", opus);
  } finally {
    m.setTurnModelLine(undefined);
    await dispose();
  }
});

function manager({ active, live, atRest, gone = false, group = false }) {
  const seen = { appended: [], live: [], rest: [], emitted: [], woken: [] };
  return {
    seen,
    tm: {
      sessions: {
        isAgentGone: () => gone,
        activeSession: active === undefined ? null : { id: active },
        inMemoryTranscriptAgentId: null,
        liveSessions: new Map(live === undefined ? [] : [[live, { db: { appendTranscriptEntry: (entry) => { seen.live.push(entry); return true; } } }]]),
      },
      sessionStore: atRest === undefined ? undefined : { withAgentDb: async (agentId, use) => (agentId === atRest ? use({ appendTranscriptEntry: (entry) => { seen.rest.push(entry); return true; } }) : false) },
      groupChat: { isGroupAgentId: () => group },
      appendEntry: (entry) => seen.appended.push(entry),
      // Never the timeline's path: it would run a hidden turn for the agent to answer.
      emitTimelineEvent: (agentId) => seen.woken.push(agentId),
      backgroundWakes: { emitTimelineEvent: (agentId) => seen.woken.push(agentId) },
      roster: { emit: (event, agentId) => seen.emitted.push({ type: event.type, agentId }), emitAgentUpdate: async () => {} },
    },
  };
}

test("the line goes in the agent's chat as a model-changed event, open, running or at rest, waking no one", async () => {
  const { module: m, dispose } = await load();
  try {
    const event = { type: "model-changed", from: m.SIMEON_TURN_MODEL, to: { model: "own:anthropic:claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" } };
    const open = manager({ active: "iris" });
    await m.appendModelChangeLine(open.tm, "iris", event);
    assert.equal(open.seen.appended.length, 1);
    const [entry] = open.seen.appended;
    assert.equal(entry.kind, "event");
    assert.match(entry.id, /^event-model-/);
    assert.deepEqual(entry.event, event);
    assert.equal(typeof entry.timestampMs, "number");
    assert.deepEqual(open.seen.woken, []);

    const running = manager({ live: "theo" });
    await m.appendModelChangeLine(running.tm, "theo", event);
    assert.equal(running.seen.live.length, 1);
    assert.deepEqual(running.seen.emitted, [{ type: "appended", agentId: "theo" }]);

    const resting = manager({ atRest: "nora" });
    await m.appendModelChangeLine(resting.tm, "nora", event);
    assert.equal(resting.seen.rest.length, 1);
    assert.deepEqual(resting.seen.woken, []);

    // Not in a group chat, nor for an agent that's gone.
    const group = manager({ active: "team", group: true });
    await m.appendModelChangeLine(group.tm, "team", event);
    assert.equal(group.seen.appended.length, 0);
    const gone = manager({ active: "iris", gone: true });
    await m.appendModelChangeLine(gone.tm, "iris", event);
    assert.equal(gone.seen.appended.length, 0);
  } finally {
    await dispose();
  }
});

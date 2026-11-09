/**
 * The chat's one line when Claude Code can't run an agent's turn and
 * Simeon's models answer (9 November 2026; docs/your-own-models.md, section
 * 6, step C4): the words in the person's language for each reason, the
 * notice written whether the chat is open, running or at rest (and not for
 * an agent that's gone), and said once an hour per agent and reason.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-notice-"));
  const outfile = path.join(dir, "notice.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claude-code-notice-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function manager({ active, live, atRest, gone = false, language = "en" }) {
  const seen = { appended: [], live: [], rest: [], emitted: [], updated: [] };
  return {
    seen,
    tm: {
      userLanguage: () => language,
      sessions: {
        isAgentGone: () => gone,
        activeSession: active === undefined ? null : { id: active },
        inMemoryTranscriptAgentId: null,
        liveSessions: new Map(live === undefined ? [] : [[live, { db: { appendTranscriptEntry: (entry) => { seen.live.push(entry); return true; } } }]]),
      },
      sessionStore: atRest === undefined ? undefined : { withAgentDb: async (agentId, use) => (agentId === atRest ? use({ appendTranscriptEntry: (entry) => { seen.rest.push(entry); return true; } }) : false) },
      appendEntry: (entry) => seen.appended.push(entry),
      roster: { emit: (event, agentId) => seen.emitted.push({ type: event.type, agentId }), emitAgentUpdate: async (agentId) => seen.updated.push(agentId) },
    },
  };
}

test("the words, in the person's language, for each reason", async () => {
  const { module: notice, dispose } = await load();
  try {
    assert.equal(notice.claudeCodeNoticeText("en", "limited"), "Your Claude plan's limit is reached, so Simeon's models answer until it resets.");
    assert.match(notice.claudeCodeNoticeText("en", "signed_out"), /Connect Claude again in Settings › AI Models\.$/);
    assert.equal(notice.claudeCodeNoticeText("en", "failed"), notice.claudeCodeNoticeText("en", "not_installed"));
    assert.match(notice.claudeCodeNoticeText("fr", "limited"), /^La limite de ton forfait Claude/);
    assert.match(notice.claudeCodeNoticeText("de", "signed_out"), /Einstellungen › KI-Modelle/);
    for (const language of ["es", "nl", "it", "pt-BR", "sv", "pl", "tr"]) {
      for (const why of ["limited", "signed_out", "failed"]) {
        const text = notice.claudeCodeNoticeText(language, why);
        assert.notEqual(text, notice.claudeCodeNoticeText("en", why), `${language} ${why}`);
      }
    }
  } finally {
    await dispose();
  }
});

test("the notice reaches the chat whether it's open, running or at rest; never an agent that's gone", async () => {
  const { module: notice, dispose } = await load();
  try {
    const open = manager({ active: "nora" });
    await notice.appendClaudeCodeNotice(open.tm, "nora", "limited");
    assert.equal(open.seen.appended.length, 1);
    assert.equal(open.seen.appended[0].kind, "notice");
    assert.match(open.seen.appended[0].id, /^notice-claude-/);
    // Written for the person: the apps show it as it is, though it names Claude.
    assert.equal(open.seen.appended[0].forPerson, true);
    assert.deepEqual(open.seen.updated, ["nora"]);

    const running = manager({ active: "theo", live: "nora", language: "fr" });
    await notice.appendClaudeCodeNotice(running.tm, "nora", "signed_out");
    assert.equal(running.seen.appended.length, 0);
    assert.match(running.seen.live[0].text, /^Claude n’est plus connecté/);
    assert.deepEqual(running.seen.emitted, [{ type: "appended", agentId: "nora" }]);

    const resting = manager({ atRest: "nora" });
    await notice.appendClaudeCodeNotice(resting.tm, "nora", "failed");
    assert.equal(resting.seen.rest.length, 1);
    assert.deepEqual(resting.seen.emitted, [{ type: "appended", agentId: "nora" }]);

    const gone = manager({ active: "nora", gone: true });
    await notice.appendClaudeCodeNotice(gone.tm, "nora", "limited");
    assert.equal(gone.seen.appended.length, 0);
  } finally {
    await dispose();
  }
});

test("said once an hour per agent and reason", async () => {
  const { module: notice, dispose } = await load();
  try {
    const at = 1_794_140_000_000;
    assert.equal(notice.claudeCodeNoticeDue("nora", "limited", at), true);
    assert.equal(notice.claudeCodeNoticeDue("nora", "limited", at + 59 * 60_000), false);
    assert.equal(notice.claudeCodeNoticeDue("nora", "signed_out", at + 1), true);
    assert.equal(notice.claudeCodeNoticeDue("theo", "limited", at + 1), true);
    assert.equal(notice.claudeCodeNoticeDue("nora", "limited", at + 60 * 60_000), true);
  } finally {
    await dispose();
  }
});

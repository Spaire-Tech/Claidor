/**
 * Everything on the person's own Claude plan (11 November 2026, the founder:
 * "small jobs is their own plan and chosen model. and make sure everything
 * else is like that"). The small jobs (the safety review, memory, a summary,
 * a title) are one `claude -p` each on the model and effort chosen, with no
 * tools and nothing kept on disk; Simeon's model answers only when Claude
 * Code can't, and Claude waits a while before it is tried again. A helper's
 * brief says its last words are its report; a group chat's that only
 * SendMessage reaches the room; the computer's screenshot reaches Claude as
 * a picture. A stand-in takes Claude Code's place: nothing reaches claude.ai
 * or Anthropic.
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-small-jobs-"));
  const outfile = path.join(dir, "jobs.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claude-code-small-jobs-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const collect = async (result) => {
  const parts = [];
  for await (const part of result.fullStream) parts.push(part);
  return parts;
};

test("a small job is the system messages as Claude Code's own system prompt, the rest as its prompt", async () => {
  const { module: jobs, dispose } = await load();
  try {
    assert.deepEqual(jobs.claudeCodeTextJob([
      { role: "system", content: "You review commands." },
      { role: "user", content: [{ type: "text", text: "rm -rf /tmp/x" }] },
    ]), { system: "You review commands.", prompt: "rm -rf /tmp/x" });
    const longer = jobs.claudeCodeTextJob([
      { role: "system", content: "Summarise." },
      { role: "user", content: "Book the dentist." },
      { role: "assistant", content: "Booked for Tuesday." },
      { role: "user", content: "Summarise the chat." },
    ]);
    assert.equal(longer.system, "Summarise.");
    assert.equal(longer.prompt, '<message from="user">\nBook the dentist.\n</message>\n\n<message from="you">\nBooked for Tuesday.\n</message>\n\n<message from="user">\nSummarise the chat.\n</message>\n\nWrite your next message.');
  } finally {
    await dispose();
  }
});

test("a small job runs on the chosen model and effort, with no tools and nothing kept", async () => {
  const { module: jobs, dispose } = await load();
  try {
    const args = jobs.claudeCodeTurnArgs({ prompt: "x", model: "claude-opus-5-5", effort: "high", tools: [], noSessionPersistence: true }, { system: "/tmp/system.md" }, "0b0e8f2e-0000-4000-8000-000000000001");
    assert.equal(args[args.indexOf("--model") + 1], "claude-opus-5-5");
    assert.equal(args[args.indexOf("--effort") + 1], "high");
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.equal(args[args.indexOf("--system-prompt-file") + 1], "/tmp/system.md");
    assert.ok(args.includes("--no-session-persistence"));
    assert.ok(!args.includes("--append-system-prompt-file"));
    assert.ok(!args.includes("--mcp-config"));

    jobs.setSimeonModelRolesForTest({ primary: "gpt-6-sol", cheap: "gpt-6-luna", claudeCode: "claude-opus-5-5", claudeCodeEffort: "high" });
    jobs.resetClaudeCodeTextPause();
    assert.deepEqual(jobs.claudeCodeTextChoice(), { model: "claude-opus-5-5", effort: "high" });
    const asked = [];
    const run = async (input) => { asked.push(input); return { kind: "done", sessionId: "s", text: "ALLOW", turns: 1 }; };
    let simeon = 0;
    const result = jobs.claudeCodeTextResult([{ role: "system", content: "Review." }, { role: "user", content: "ls" }], jobs.claudeCodeTextChoice(), () => { simeon += 1; throw new Error("not Simeon's"); }, { run });
    const parts = await collect(result);
    assert.deepEqual(parts.filter((part) => part.type === "text-delta"), [{ type: "text-delta", textDelta: "ALLOW" }]);
    assert.equal(await result.text, "ALLOW");
    assert.equal(simeon, 0);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].model, "claude-opus-5-5");
    assert.equal(asked[0].effort, "high");
    assert.equal(asked[0].systemPrompt, "Review.");
    assert.deepEqual(asked[0].tools, []);
    assert.equal(asked[0].noSessionPersistence, true);
    assert.equal(asked[0].prompt, "ls");
  } finally {
    await dispose();
  }
});

test("when Claude Code can't answer, Simeon's model does, and Claude waits before it is tried again", async () => {
  const { module: jobs, dispose } = await load();
  try {
    jobs.setSimeonModelRolesForTest({ primary: "gpt-6-sol", cheap: "gpt-6-luna", claudeCode: "claude-opus-5-5", claudeCodeEffort: "high" });
    jobs.resetClaudeCodeTextPause();
    const run = async () => ({ kind: "not_installed" });
    const simeonStream = { fullStream: (async function* () { yield { type: "text-delta", textDelta: "From Simeon" }; })(), text: Promise.resolve("From Simeon") };
    const result = jobs.claudeCodeTextResult([{ role: "user", content: "Title this." }], jobs.claudeCodeTextChoice(), () => simeonStream, { run });
    const parts = await collect(result);
    assert.deepEqual(parts, [{ type: "text-delta", textDelta: "From Simeon" }]);
    assert.equal(await result.text, "From Simeon");
    // Not tried again for a while: the next job goes straight to Simeon's.
    assert.equal(jobs.claudeCodeTextChoice(), undefined);
    assert.ok(jobs.claudeCodeTextChoice(Date.now() + 61 * 60_000) !== undefined);
    // Nothing chosen: no Claude.
    jobs.resetClaudeCodeTextPause();
    jobs.setSimeonModelRolesForTest({ primary: "gpt-6-sol", cheap: "gpt-6-luna" });
    assert.equal(jobs.claudeCodeTextChoice(), undefined);
  } finally {
    await dispose();
  }
});

test("a helper's brief makes its last words its report; a group chat's sends everything with SendMessage", async () => {
  const { module: jobs, dispose } = await load();
  try {
    const helper = jobs.claudeCodeBriefLead("helper");
    assert.match(helper, /You are a helper one of the person's agents in Simeon started/);
    assert.match(helper, /your last words are your report to the agent that asked/);
    assert.match(jobs.claudeCodeBriefNote("helper"), /a screenshot comes back as a picture/);
    assert.doesNotMatch(jobs.claudeCodeBriefNote("helper"), /sent to them as your reply/);
    assert.match(jobs.claudeCodeBriefLead("room"), /in a group chat with the person and other agents/);
    assert.match(jobs.claudeCodeBriefNote("room"), /your own text reaches no one/);
    // An agent in its own chat: as before.
    assert.match(jobs.claudeCodeBriefNote(), /your final words are sent to them as your reply/);
  } finally {
    await dispose();
  }
});

test("the computer's screenshot reaches Claude as a picture of its own type", async () => {
  const { module: jobs, dispose } = await load();
  try {
    assert.deepEqual(jobs.screenshotOf({ result: { case: "success", value: { screenshot: "UklGRiQAAABXRUJQ" } } }), { type: "image", data: "UklGRiQAAABXRUJQ", mimeType: "image/webp" });
    assert.equal(jobs.screenshotOf({ result: { case: "success", value: { screenshot: "iVBORw0KGgoAAA" } } }).mimeType, "image/png");
    assert.equal(jobs.screenshotOf({ result: { case: "success", value: { screenshot: "/9j/4AAQ" } } }).mimeType, "image/jpeg");
    assert.equal(jobs.screenshotOf({ result: { case: "error", value: { error: "no display" } } }), undefined);
    assert.equal(jobs.screenshotOf({ result: { case: "success", value: {} } }), undefined);
    assert.equal(jobs.screenshotOf("Done."), undefined);
    // A helper's sessions last the engine's run only.
    const sessions = new jobs.ClaudeCodeMemorySessions();
    sessions.set("helper-1", "0b0e8f2e-0000-4000-8000-000000000001");
    assert.equal(sessions.get("helper-1"), "0b0e8f2e-0000-4000-8000-000000000001");
    sessions.forget("helper-1");
    assert.equal(sessions.get("helper-1"), undefined);
  } finally {
    await dispose();
  }
});

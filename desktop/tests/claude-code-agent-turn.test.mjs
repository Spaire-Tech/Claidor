/**
 * An agent's turn on the person's own Claude plan (9 November 2026;
 * docs/your-own-models.md, section 6, step C4 part 3): the hook the agent's
 * user-message handler calls. Claude Code (a stand-in) gets the brief with
 * the note naming Simeon's tools, the context on a session's first turn
 * only, Simeon's tools over MCP and the permission tool; Simeon's real
 * SendMessage reaches the chat; the session is kept. When Claude Code can't
 * (the plan's limit, the sign-in gone, not installed), the turn is left to
 * Simeon's model and Claude waits (until the limit resets, five minutes, an
 * hour); a turn the person stopped is over. Nothing reaches claude.ai or
 * Anthropic.
 */
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-agent-turn-"));
  const outfile = path.join(dir, "hook.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claude-code-agent-turn-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** A stand-in `claude -p`: its mode in a file beside its config; it writes what it saw, and in "ok" calls Simeon's SendMessage over MCP. */
const STAND_IN = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const dir = process.env.CLAUDE_CONFIG_DIR;
const mode = (() => { try { return fs.readFileSync(path.join(dir, "mode"), "utf8").trim(); } catch { return "ok"; } })();
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const session = flag("--resume") ?? flag("--session-id");
let stdin = "";
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", async () => {
  const seenFile = path.join(dir, "seen.json");
  const all = (() => { try { return JSON.parse(fs.readFileSync(seenFile, "utf8")); } catch { return []; } })();
  all.push({ argv, prompt: JSON.parse(stdin).message.content[0].text, brief: fs.readFileSync(flag("--append-system-prompt-file"), "utf8") });
  fs.writeFileSync(seenFile, JSON.stringify(all));
  const out = (event) => process.stdout.write(JSON.stringify({ ...event, session_id: session }) + "\\n");
  if (mode === "hang") { setInterval(() => {}, 1000); return; }
  out({ type: "system", subtype: "init" });
  if (mode === "limit") { out({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached|1794150000" }); process.exit(1); }
  if (mode === "expired") { out({ type: "result", subtype: "success", is_error: true, result: "Invalid API key · Please run /login" }); process.exit(1); }
  if (mode === "words") { out({ type: "result", subtype: "success", is_error: false, result: "Tuesday at 10 is booked.", num_turns: 1 }); return; }
  if (mode === "usage") {
    out({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 1794150000 }, seven_day: { utilization: 0.05, resetsAt: 1794500000 } } } });
    out({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", unifiedWindows: { five_hour: { utilization: 0.81, resetsAt: 1794150000 }, seven_day: { utilization: 0.06, resetsAt: 1794500000 } } } });
    out({ type: "result", subtype: "success", is_error: false, result: "Done.", num_turns: 1 });
    return;
  }
  const url = JSON.parse(fs.readFileSync(flag("--mcp-config"), "utf8")).mcpServers.simeon.url;
  const rpc = async (id, method, params) => (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
  await rpc(1, "initialize", { protocolVersion: "2025-06-18" });
  const listed = await rpc(2, "tools/list", {});
  const called = await rpc(3, "tools/call", { name: "SendMessage", arguments: { type: "text", content: "Done: " + JSON.parse(stdin).message.content[0].text.split("\\n").pop() } });
  out({ type: "result", subtype: "success", is_error: false, result: "Sent. tools=" + listed.result.tools.map((t) => t.name).join(","), num_turns: 2 });
});
`;

async function setUp(bridge) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-hook-"));
  const bin = path.join(dir, "claude");
  await writeFile(bin, STAND_IN);
  await chmod(bin, 0o755);
  const config = path.join(dir, "config");
  await mkdir(config);
  const sent = [];
  const fallbacks = [];
  const usage = [];
  const lines = [];
  let clock = 1_794_140_000_000;
  const sessions = new bridge.ClaudeCodeSessions(path.join(dir, "data", "claude-code-sessions.json"));
  const hook = bridge.createClaudeCodeAgentTurn({
    sessions,
    model: () => "opus",
    env: { PATH: process.env.PATH, HOME: dir, SIMEON_CLAUDE_CODE_BIN: bin },
    configDir: config,
    onFallback: (agent, why, until) => fallbacks.push({ agent, why, until }),
    onUsage: (windows) => usage.push(windows),
    log: (line) => lines.push(line),
    now: () => clock,
  });
  const tool = bridge.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: (message) => { sent.push(message); return "t1s1"; } });
  const input = (text, signal = new AbortController().signal) => ({ ctx: bridge.createContext(), conversationId: "nora", brief: "You are Nora.", context: "<user_info>Bass, Paris, 9 November</user_info>", text, tools: [tool], listener: undefined, stateHandler: undefined, signal });
  return {
    dir, hook, sent, fallbacks, usage, lines, sessions, input,
    mode: (value) => writeFile(path.join(config, "mode"), value),
    seen: async () => JSON.parse(await readFile(path.join(config, "seen.json"), "utf8")),
    advance: (ms) => { clock += ms; },
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}

test("Claude Code runs the agent's turn: the brief with the tools' note, the context once, Simeon's SendMessage reaching the chat", async () => {
  const { module: bridge, dispose } = await load();
  const box = await setUp(bridge);
  try {
    assert.equal(box.hook.chosen("nora"), true);
    const first = await box.hook.run(box.input("Book the dentist for Tuesday"));
    assert.equal(first.ran, true);
    assert.equal(first.text, "Sent. tools=SendMessage,ReviewPermission");
    assert.deepEqual(box.sent, [{ type: "text", content: "Done: Book the dentist for Tuesday" }]);
    const second = await box.hook.run(box.input("And the vet on Friday"));
    assert.equal(second.ran, true);

    const [one, two] = await box.seen();
    // The brief: who it is first (not a coding assistant; answer first), the agent's own, then the note naming Simeon's tools.
    assert.ok(one.brief.startsWith("## Who you are\nYou are not a coding assistant here."), one.brief);
    assert.match(one.brief, /Answer the person first\. Look at files or run commands only when what they asked needs it\.\n\nYou are Nora\.\n\n## Your Simeon tools/);
    assert.match(one.brief, /mcp__simeon__SendMessage/);
    // The context goes with the session's first turn only; Claude Code keeps it after.
    assert.equal(one.prompt, "<user_info>Bass, Paris, 9 November</user_info>\n\nBook the dentist for Tuesday");
    assert.equal(two.prompt, "And the vet on Friday");
    assert.equal(two.argv[two.argv.indexOf("--resume") + 1], box.sessions.get("nora"));
    assert.equal(one.argv[one.argv.indexOf("--model") + 1], "opus");
    assert.equal(one.argv[one.argv.indexOf("--permission-prompt-tool") + 1], "mcp__simeon__ReviewPermission");
    // Claude Code's own shell is off; every command goes through the engine's Shell and its safety review. Simeon's tools don't ask.
    assert.equal(one.argv[one.argv.indexOf("--disallowedTools") + 1], "Bash,BashOutput,KillShell,KillBash");
    assert.equal(one.argv[one.argv.indexOf("--allowedTools") + 1], "mcp__simeon");
    assert.match(one.brief, /Run shell commands with `mcp__simeon__Shell`/);
    assert.deepEqual(box.lines.filter((line) => line.startsWith("claude-code tools offered=")), ["claude-code tools offered=SendMessage"]);
    assert.ok(box.lines.some((line) => /^claude-code turn agent=nora model=opus outcome=done tools=1 ms=\d+$/.test(line)), box.lines.join("\n"));
    assert.deepEqual(box.fallbacks, []);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("how much of the plan is used, as Claude Code last said it in the turn, is passed on once", async () => {
  const { module: bridge, dispose } = await load();
  const box = await setUp(bridge);
  try {
    await box.mode("words");
    await box.hook.run(box.input("Anything?"));
    assert.deepEqual(box.usage, [], "a turn that said nothing of it tells nothing");
    await box.mode("usage");
    const done = await box.hook.run(box.input("Anything else?"));
    assert.equal(done.ran, true);
    assert.deepEqual(box.usage, [[
      { kind: "five_hour", usedPercent: 81, resetsAt: 1_794_150_000_000 },
      { kind: "weekly", usedPercent: 6, resetsAt: 1_794_500_000_000 },
    ]]);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("when Claude Code can't, the turn goes to Simeon's model and Claude waits", async () => {
  const { module: bridge, dispose } = await load();
  const box = await setUp(bridge);
  try {
    // The plan's limit: Simeon's model until it resets (the time Claude Code gives).
    await box.mode("limit");
    assert.deepEqual(await box.hook.run(box.input("Hi")), { ran: false });
    assert.deepEqual(box.fallbacks.at(-1), { agent: "nora", why: "limited", until: 1_794_150_000_000 });
    assert.equal(box.hook.chosen("nora"), false);
    box.advance(9_999_000);
    assert.equal(box.hook.chosen("nora"), false);
    box.advance(2_000);
    assert.equal(box.hook.chosen("nora"), true);

    // The sign-in gone: five minutes, then Claude is tried again.
    await box.mode("expired");
    assert.deepEqual(await box.hook.run(box.input("Hi")), { ran: false });
    assert.equal(box.fallbacks.at(-1).why, "signed_out");
    box.advance(4 * 60_000);
    assert.equal(box.hook.chosen("nora"), false);
    box.advance(61_000);
    assert.equal(box.hook.chosen("nora"), true);

    // A turn the person stopped is over: it doesn't move to Simeon's.
    await box.mode("hang");
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 300);
    assert.deepEqual(await box.hook.run(box.input("Hi", stop.signal)), { ran: true, text: "" });
    assert.equal(box.sent.length, 0);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("the prompt and the brief's note", async () => {
  const { module: bridge, dispose } = await load();
  try {
    assert.equal(bridge.claudeCodePrompt("Hi", "ctx", true), "ctx\n\nHi");
    assert.equal(bridge.claudeCodePrompt("Hi", "ctx", false), "Hi");
    assert.equal(bridge.claudeCodePrompt("Hi", undefined, true), "Hi");
    assert.match(bridge.claudeCodePrompt("  ", undefined, false), /continue as the brief says/);
    assert.match(bridge.claudeCodeBriefNote(), /The person sees only what you send with it/);
  } finally {
    await dispose();
  }
});

test("how a turn ended: its last words, whether it sent anything, and whether it worked on after", async () => {
  const { module: bridge, dispose } = await load();
  const box = await setUp(bridge);
  try {
    // Simeon's SendMessage reached the chat: its last words are notes, not owed to anyone.
    await box.hook.run(box.input("Book the dentist for Tuesday"));
    const sent = bridge.claudeCodeEndingSince("nora", 0);
    assert.equal(sent.spoke, true);
    assert.equal(sent.workedAfterSpeaking, false);
    assert.equal(bridge.claudeCodeReplyToSend(sent, false), undefined);
    // Its answer in its own words, nothing sent: those words are the reply.
    await box.mode("words");
    box.advance(1_000);
    await box.hook.run(box.input("Is it booked?"));
    const words = bridge.claudeCodeEndingSince("nora", 1_794_140_000_500);
    assert.equal(words.spoke, false);
    assert.equal(words.text, "Tuesday at 10 is booked.");
    assert.equal(bridge.claudeCodeReplyToSend(words, true), "Tuesday at 10 is booked.");
    // An ending from before the person's turn began is not this turn's.
    assert.equal(bridge.claudeCodeEndingSince("nora", 1_794_140_002_000), undefined);
    assert.match(bridge.claudeCodeBriefNote(), /your final words are sent to them as your reply/);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("the words sent after a turn: none, its answer, or the result after an \"On it\"", async () => {
  const { module: bridge, dispose } = await load();
  try {
    const ending = (calls, text) => bridge.claudeCodeEnding(calls, text, 1);
    // Nothing reached the person: its words are the reply.
    assert.equal(bridge.claudeCodeReplyToSend(ending(["Shell", "Shell"], "  The grep found 3 lines. "), true), "The grep found 3 lines.");
    // "On it", then work, then the result in its own words: sent.
    const after = ending(["SendMessage", "Shell", "Shell"], "Here are the results.");
    assert.equal(after.workedAfterSpeaking, true);
    assert.equal(bridge.claudeCodeReplyToSend(after, false), "Here are the results.");
    // The result was its last message: its notes after it stay its own.
    assert.equal(bridge.claudeCodeReplyToSend(ending(["Shell", "SendMessage"], "Sent the results."), false), undefined);
    // A reaction is speaking too.
    assert.equal(ending(["ReactToMessage"], "").spoke, true);
    // No words, nothing to send.
    assert.equal(bridge.claudeCodeReplyToSend(ending([], " "), true), undefined);
  } finally {
    await dispose();
  }
});

test("after a turn the person started, Claude's own words reach them and nothing pokes it", async () => {
  const { module: bridge, dispose } = await load();
  const box = await setUp(bridge);
  try {
    const updates = [];
    let runs = 0;
    const runner = { run: async () => { runs += 1; return { sentMessageCount: 0, reacted: false, aborted: false }; }, emitUpdate: (update) => updates.push(update) };
    const runtime = new bridge.TurnRuntime({ sendPipeline: { currentTurnEpoch: () => 1 }, telemetry: { reportClosingSendNudge: () => {} } });
    const session = { id: "nora" };
    const nothingSent = { sentMessageCount: 0, reacted: false, aborted: false };

    // Claude answered in its own words: they're sent, once, with the turn's ack token; no hidden turn runs.
    await box.mode("words");
    const started = Date.now() - 1;
    box.advance(Date.now() - 1_794_140_000_000);
    await box.hook.run(box.input("Is it booked?"));
    const words = await runtime.ensureUserReply(runner, nothingSent, session, 1, "ack-1", undefined, undefined, undefined, started);
    assert.equal(runs, 0);
    assert.equal(words.deliveryOwed, false);
    assert.equal(words.replyNudgeAttempts, 0);
    assert.deepEqual(updates.map(({ type, message, ackToken }) => ({ type, message, ackToken })), [{ type: "send-message", message: { type: "text", content: "Tuesday at 10 is booked." }, ackToken: "ack-1" }]);

    // Claude's SendMessage reached the chat and that was its last word: nothing more, and no closing nudge,
    // though the engine's own history (which Claude Code doesn't write) looks like a silent ending.
    await box.mode("ok");
    box.advance(1_000);
    const later = Date.now() - 1;
    box.advance(1_000);
    await box.hook.run(box.input("Thanks"));
    const spoke = await runtime.ensureUserReply(runner, { sentMessageCount: 1, reacted: false, aborted: false, endedOnSilentToolCalls: true }, session, 1, "ack-2", undefined, undefined, undefined, later);
    assert.equal(runs, 0);
    assert.equal(spoke.deliveryOwed, false);
    assert.equal(updates.length, 1);

    // A turn Simeon's model answered (no Claude ending since it began): the nudges stay as they were.
    const simeon = await runtime.ensureUserReply(runner, nothingSent, session, 1, "ack-3", undefined, undefined, undefined, Date.now() + 60_000_000_000);
    assert.equal(runs, 3);
    assert.equal(simeon.deliveryOwed, true);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("what Claude said goes into the model's history, so Simeon's model sees each message answered", async () => {
  const { module: bridge, dispose } = await load();
  const box = await setUp(bridge);
  try {
    // Simeon's SendMessage: the call and its answer, as the loop keeps them, then Claude's last words.
    const sent = await box.hook.run(box.input("Book the dentist for Tuesday"));
    const [call, answer, last] = sent.history;
    assert.equal(sent.history.length, 3);
    assert.equal(call.role, "assistant");
    assert.equal(call.content[0].type, "tool-call");
    assert.equal(call.content[0].toolName, "SendMessage");
    assert.deepEqual(call.content[0].args, { type: "text", content: "Done: Book the dentist for Tuesday" });
    assert.match(call.content[0].toolCallId, /^cc_[0-9a-f-]+$/);
    assert.equal(answer.role, "tool");
    assert.equal(answer.content[0].type, "tool-result");
    assert.equal(answer.content[0].toolCallId, call.content[0].toolCallId);
    assert.equal(answer.content[0].toolName, "SendMessage");
    assert.equal(typeof answer.content[0].result, "string");
    assert.deepEqual(last, { role: "assistant", content: "Sent. tools=SendMessage,ReviewPermission" });

    // Its answer in its own words: those words alone.
    await box.mode("words");
    const words = await box.hook.run(box.input("Is it booked?"));
    assert.deepEqual(words.history, [{ role: "assistant", content: "Tuesday at 10 is booked." }]);

    // Signed out before saying anything: nothing to keep, Simeon's model answers.
    await box.mode("expired");
    assert.deepEqual(await box.hook.run(box.input("Hi")), { ran: false });

    // Only what reached the person is kept; a command's call stays in Claude Code's own session.
    const result = { content: [{ type: "text", text: "ok" }] };
    assert.deepEqual(bridge.claudeCodeHistory([
      { id: "cc_1", name: "Shell", args: { command: "ls" }, result },
      { id: "cc_2", name: "ReactToMessage", args: { emoji: "👍" }, result: { content: [{ type: "text", text: "no such message" }], isError: true } },
    ], "  "), [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "cc_2", toolName: "ReactToMessage", args: { emoji: "👍" } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "cc_2", toolName: "ReactToMessage", result: "no such message", isError: true }] },
    ]);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("Claude reads the person's own words: the turn keeps them wrapped, never as a plain string", async () => {
  const { module: bridge, dispose } = await load();
  try {
    // The turn's message as the engine keeps it (9 November 2026: read as a plain string, it was always
    // empty, and Claude answered "I'm here whenever you need me" to "archive anything not important").
    const kept = bridge.toRedactedUserMessage(new bridge.UserMessage({ text: "can you archive anything not important" }), bridge.PrivacyMode.NO_TRAINING);
    assert.notEqual(typeof kept.text, "string");
    assert.equal(bridge.claudeCodeTurnWords(kept.text), "can you archive anything not important");
    // Messages sent while the agent was busy, taken into this turn, come first, each as written.
    assert.equal(bridge.claudeCodeTurnWords(kept.text, ["can you archive anything important", "  "]), "can you archive anything important\n\ncan you archive anything not important");
    assert.equal(bridge.claudeCodeTurnWords("plain words"), "plain words");
    assert.equal(bridge.claudeCodeTurnWords(undefined), "");
    // What Claude Code is then given: the words, never the line for an empty turn.
    assert.equal(bridge.claudeCodePrompt(bridge.claudeCodeTurnWords(kept.text), undefined, false), "can you archive anything not important");
  } finally {
    await dispose();
  }
});

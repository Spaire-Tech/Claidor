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
  const lines = [];
  let clock = 1_794_140_000_000;
  const sessions = new bridge.ClaudeCodeSessions(path.join(dir, "data", "claude-code-sessions.json"));
  const hook = bridge.createClaudeCodeAgentTurn({
    sessions,
    model: () => "opus",
    env: { PATH: process.env.PATH, HOME: dir, SIMEON_CLAUDE_CODE_BIN: bin },
    configDir: config,
    onFallback: (agent, why, until) => fallbacks.push({ agent, why, until }),
    log: (line) => lines.push(line),
    now: () => clock,
  });
  const tool = bridge.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: (message) => { sent.push(message); return "t1s1"; } });
  const input = (text, signal = new AbortController().signal) => ({ ctx: bridge.createContext(), conversationId: "nora", brief: "You are Nora.", context: "<user_info>Bass, Paris, 9 November</user_info>", text, tools: [tool], listener: undefined, stateHandler: undefined, signal });
  return {
    dir, hook, sent, fallbacks, lines, sessions, input,
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
    assert.deepEqual(first, { ran: true, text: "Sent. tools=SendMessage,ReviewPermission" });
    assert.deepEqual(box.sent, [{ type: "text", content: "Done: Book the dentist for Tuesday" }]);
    const second = await box.hook.run(box.input("And the vet on Friday"));
    assert.equal(second.ran, true);

    const [one, two] = await box.seen();
    // The brief: the agent's own, then the note naming Simeon's tools.
    assert.ok(one.brief.startsWith("You are Nora.\n\n## Your Simeon tools"), one.brief);
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

/**
 * An agent's turn run by Claude Code on the person's computer (9 November
 * 2026; docs/your-own-models.md, section 6, step C4): the arguments and the
 * prompt Claude Code gets (stream-json, the brief and Simeon's MCP server in
 * private files, the permission tool), the environment (none of the
 * engine's keys), each agent's session resumed and started afresh when the
 * computer no longer has it, and the endings sorted: done, the plan's limit,
 * the sign-in gone, not installed, stopped. Also the engine's roles reading
 * the server's `claude-code` row. Against a stand-in `claude` that writes
 * stream-json as Claude Code 2.1.311 does; nothing reaches claude.ai or
 * Anthropic.
 */
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/**
 * A stand-in `claude -p` in stream-json. The mode is a file beside its config
 * (the environment it gets passes no variable of the test's); it writes what
 * it saw (arguments, the prompt, the brief and MCP files, its environment)
 * to `seen.json` there.
 */
const STAND_IN = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const dir = process.env.CLAUDE_CONFIG_DIR;
const mode = (() => { try { return fs.readFileSync(path.join(dir, "mode"), "utf8").trim(); } catch { return "ok"; } })();
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const read = (file) => { try { return { text: fs.readFileSync(file, "utf8"), mode: (fs.statSync(file).mode & 0o777).toString(8) }; } catch { return null; } };
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
  const seenFile = path.join(dir, "seen.json");
  const all = (() => { try { return JSON.parse(fs.readFileSync(seenFile, "utf8")); } catch { return []; } })();
  all.push({ argv, stdin, cwd: process.cwd(), brief: read(flag("--append-system-prompt-file")), mcp: read(flag("--mcp-config")),
    env: { apiKey: process.env.ANTHROPIC_API_KEY ?? null, baseUrl: process.env.ANTHROPIC_BASE_URL ?? null, gateway: process.env.SAND_GATEWAY_TOKEN ?? null, config: process.env.CLAUDE_CONFIG_DIR, shell: process.env.SHELL, updater: process.env.DISABLE_AUTOUPDATER } });
  fs.writeFileSync(seenFile, JSON.stringify(all));
  const resume = flag("--resume");
  const session = resume ?? flag("--session-id");
  const out = (event) => process.stdout.write(JSON.stringify({ ...event, session_id: session }) + "\\n");
  if (mode === "hang") { setInterval(() => {}, 1000); return; }
  if (mode === "nosession" && resume !== undefined) { process.stderr.write("No conversation found with session ID: " + resume + "\\n"); process.exit(1); }
  out({ type: "system", subtype: "init", model: flag("--model"), tools: ["Bash", "mcp__simeon__SendMessage"], mcp_servers: [{ name: "simeon", status: "connected" }] });
  if (mode === "limit") { out({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached|1794150000", num_turns: 1 }); process.exit(1); }
  if (mode === "expired") { out({ type: "result", subtype: "success", is_error: true, result: "OAuth token has expired. Please run /login", num_turns: 1 }); process.exit(1); }
  if (mode === "limit-event") { out({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1794150000, rateLimitType: "five_hour" } }); setInterval(() => {}, 1000); return; }
  if (mode === "limit-api-error") { out({ type: "assistant", is_api_error_message: true, api_error_code: "usage_limit_reached", api_error_params: { rate_limit_info: { status: "rejected", resetsAt: 1794153600 } }, message: { role: "assistant", content: [{ type: "text", text: "You've hit your limit" }] } }); setInterval(() => {}, 1000); return; }
  if (mode === "crash") { process.stdout.write("not json\\n"); process.stderr.write("something broke\\n"); process.exit(3); }
  out({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Sending it." }, { type: "tool_use", id: "toolu_1", name: "mcp__simeon__SendMessage", input: { type: "text", content: "Done" } }] } });
  out({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "sent" }] } });
  out({ type: "result", subtype: "success", is_error: false, result: "All set.", num_turns: 2 });
});
`;

async function standIn() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-turn-test-"));
  const bin = path.join(dir, "claude");
  await writeFile(bin, STAND_IN);
  await chmod(bin, 0o755);
  const config = path.join(dir, "config");
  await import("node:fs/promises").then((fs) => fs.mkdir(config, { recursive: true }));
  const env = { PATH: process.env.PATH, HOME: dir, SIMEON_CLAUDE_CODE_BIN: bin, ANTHROPIC_API_KEY: "sk-stand-in", ANTHROPIC_BASE_URL: "https://simeon.example/proxy", SAND_GATEWAY_TOKEN: "gateway-stand-in" };
  return {
    dir, config, env,
    mode: (value) => writeFile(path.join(config, "mode"), value),
    seen: async () => JSON.parse(await readFile(path.join(config, "seen.json"), "utf8")),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("a turn: stream-json in and out, the brief and Simeon's tools in private files, none of the engine's keys", async () => {
  const { module: turn, dispose } = await load("source/host/claude-code/claude-code-turn.ts", "claude-code-turn");
  const box = await standIn();
  try {
    const events = [];
    const outcome = await turn.runClaudeCodeTurn({
      prompt: "Book the dentist for Tuesday",
      model: "opus",
      brief: "You are Nora, Bass's assistant.",
      mcpServers: { simeon: { type: "http", url: "http://127.0.0.1:4100/mcp/turn-1" } },
      permissionPromptTool: "mcp__simeon__ReviewPermission",
      disallowedTools: ["TodoWrite"],
      env: box.env,
      configDir: box.config,
      onEvent: (event) => events.push(event.type),
    });
    assert.equal(outcome.kind, "done");
    assert.match(outcome.sessionId, UUID);
    assert.equal(outcome.text, "All set.");
    assert.equal(outcome.turns, 2);
    assert.deepEqual(events, ["system", "assistant", "user", "result"]);

    const [seen] = await box.seen();
    const at = (name) => seen.argv[seen.argv.indexOf(name) + 1];
    assert.deepEqual(seen.argv.slice(0, 8), ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", "opus"]);
    assert.equal(at("--session-id"), outcome.sessionId);
    assert.ok(!seen.argv.includes("--resume"));
    assert.ok(seen.argv.includes("--strict-mcp-config"));
    assert.equal(at("--permission-prompt-tool"), "mcp__simeon__ReviewPermission");
    assert.equal(at("--disallowedTools"), "TodoWrite");
    assert.deepEqual(seen.brief, { text: "You are Nora, Bass's assistant.", mode: "600" });
    assert.deepEqual(JSON.parse(seen.mcp.text), { mcpServers: { simeon: { type: "http", url: "http://127.0.0.1:4100/mcp/turn-1" } } });
    assert.equal(seen.mcp.mode, "600");
    // The prompt goes in on stdin, never in the arguments.
    assert.deepEqual(JSON.parse(seen.stdin), { type: "user", message: { role: "user", content: [{ type: "text", text: "Book the dentist for Tuesday" }] } });
    assert.ok(!seen.argv.some((arg) => arg.includes("dentist")));
    // Claude Code signs in with the person's plan only: none of Simeon's keys or addresses.
    assert.deepEqual(seen.env, { apiKey: null, baseUrl: null, gateway: null, config: box.config, shell: "/bin/bash", updater: "1" });
    // The private files are gone once the turn ends.
    assert.equal(existsSync(path.dirname(at("--append-system-prompt-file"))), false);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("each agent's session is resumed, and started afresh when the computer no longer has it", async () => {
  const { module: turn, dispose } = await load("source/host/claude-code/claude-code-turn.ts", "claude-code-turn");
  const box = await standIn();
  try {
    const sessions = new turn.ClaudeCodeSessions(path.join(box.dir, "data", "claude-code-sessions.json"));
    const base = { prompt: "Hi", model: "sonnet", env: box.env, configDir: box.config };
    const first = await turn.runAgentClaudeCodeTurn("nora", sessions, base);
    assert.equal(first.kind, "done");
    assert.equal(sessions.get("nora"), first.sessionId);
    assert.equal(sessions.get("theo"), undefined);

    const second = await turn.runAgentClaudeCodeTurn("nora", sessions, base);
    assert.equal(second.sessionId, first.sessionId);
    let seen = await box.seen();
    assert.equal(seen[1].argv[seen[1].argv.indexOf("--resume") + 1], first.sessionId);
    assert.ok(!seen[1].argv.includes("--session-id"));

    // The computer was made afresh: Claude Code has no such session; a new one starts and is kept.
    await box.mode("nosession");
    const third = await turn.runAgentClaudeCodeTurn("nora", sessions, base);
    assert.equal(third.kind, "done");
    assert.notEqual(third.sessionId, first.sessionId);
    assert.equal(sessions.get("nora"), third.sessionId);
    seen = await box.seen();
    assert.equal(seen.length, 4);
    assert.ok(seen[3].argv.includes("--session-id"));
    const file = await readFile(path.join(box.dir, "data", "claude-code-sessions.json"), "utf8");
    assert.deepEqual(JSON.parse(file), { nora: third.sessionId });
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("the endings: the plan's limit, the sign-in gone, a crash, not installed, stopped", async () => {
  const { module: turn, dispose } = await load("source/host/claude-code/claude-code-turn.ts", "claude-code-turn");
  const box = await standIn();
  try {
    const base = { prompt: "Hi", model: "opus", env: box.env, configDir: box.config };
    await box.mode("limit");
    const limited = await turn.runClaudeCodeTurn(base);
    assert.equal(limited.kind, "limited");
    assert.equal(limited.until, 1_794_150_000_000);
    assert.match(limited.sessionId, UUID);

    // Claude Code 2.1.311's own limit events (read from the program): the turn stops at once, not at the reset.
    await box.mode("limit-event");
    let started = Date.now();
    const evented = await turn.runClaudeCodeTurn(base);
    assert.equal(evented.kind, "limited");
    assert.equal(evented.until, 1_794_150_000_000);
    assert.ok(Date.now() - started < 4_000);
    await box.mode("limit-api-error");
    const apiError = await turn.runClaudeCodeTurn(base);
    assert.equal(apiError.kind, "limited");
    assert.equal(apiError.until, 1_794_153_600_000);
    // An allowed-with-warning event is not a limit.
    assert.equal(turn.limitFromEvent({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", resetsAt: 1 } }), undefined);

    await box.mode("expired");
    assert.deepEqual(await turn.runClaudeCodeTurn(base), { kind: "signed_out", said: "OAuth token has expired. Please run /login" });

    await box.mode("crash");
    const crashed = await turn.runClaudeCodeTurn(base);
    assert.equal(crashed.kind, "failed");
    assert.equal(crashed.exitCode, 3);
    assert.equal(crashed.said, "something broke");

    assert.deepEqual(await turn.runClaudeCodeTurn({ ...base, env: { ...box.env, SIMEON_CLAUDE_CODE_BIN: path.join(box.dir, "missing") } }), { kind: "not_installed" });

    await box.mode("hang");
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 300);
    started = Date.now();
    const stopped = await turn.runClaudeCodeTurn({ ...base, signal: stop.signal });
    assert.equal(stopped.kind, "aborted");
    assert.ok(Date.now() - started < 5_000);
    assert.deepEqual(await turn.runClaudeCodeTurn({ ...base, signal: stop.signal }), { kind: "aborted" });
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("Claude Code's words sorted", async () => {
  const { module: turn, dispose } = await load("source/host/claude-code/claude-code-turn.ts", "claude-code-turn");
  try {
    assert.equal(turn.classifyClaudeCodeError("Claude AI usage limit reached|1794150000"), "limited");
    assert.equal(turn.classifyClaudeCodeError("5-hour limit reached ∙ resets 3pm"), "limited");
    assert.equal(turn.classifyClaudeCodeError("Invalid API key · Please run /login"), "signed_out");
    assert.equal(turn.classifyClaudeCodeError("Not logged in · Please run /login"), "signed_out");
    assert.equal(turn.classifyClaudeCodeError("No conversation found with session ID: 1234"), "no_session");
    assert.equal(turn.classifyClaudeCodeError("API Error: 500 Internal server error"), "failed");
    assert.equal(turn.limitEnds("Claude AI usage limit reached|1794150000"), 1_794_150_000_000);
    assert.equal(turn.limitEnds("5-hour limit reached"), undefined);
    const events = [];
    const lines = new turn.StreamJsonLines((event) => events.push(event.type));
    lines.push('{"type":"system"}\n{"type":"assi');
    lines.push('stant"}\nnot json\n{"no":"type"}\n');
    lines.push('{"type":"result"}');
    lines.end();
    assert.deepEqual(events, ["system", "assistant", "result"]);
  } finally {
    await dispose();
  }
});

test("the engine reads the server's claude-code row, keeps it with the roles, and leaves primary to Simeon's", async () => {
  const { module: roles, dispose } = await load("source/host/extensions/inference/simeon-model-roles.ts", "simeon-model-roles");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-roles-"));
  try {
    const answer = { code: 0, data: [
      { modelId: "own:claude:opus", role: "primary", provider: "anthropic", transportApi: "claude-code", apiFormat: "claude-code", claudeCodeModel: "opus" },
      { modelId: "claude-sonnet-5-5", role: "primary", provider: "anthropic", transportApi: "anthropic-messages" },
      { modelId: "claude-haiku-5-5", role: "cheap", provider: "anthropic", transportApi: "anthropic-messages" },
    ] };
    assert.deepEqual(roles.parseSimeonModelRoles(answer), { primary: "claude-sonnet-5-5", cheap: "claude-haiku-5-5", claudeCode: "opus" });
    // A model name Claude Code wouldn't take, a closed row, or no model: not followed.
    for (const bad of [{ claudeCodeModel: "opus; rm -rf /" }, { claudeCodeModel: "opus", accessible: false }, {}]) {
      const row = { modelId: "own:claude:opus", role: "primary", transportApi: "claude-code", ...bad };
      assert.equal(roles.parseSimeonModelRoles({ data: [row] }).claudeCode, undefined, JSON.stringify(bad));
    }
    // An engine without it: the row alone leaves every role to the defaults.
    assert.deepEqual(roles.parseSimeonModelRoles({ data: [{ modelId: "own:claude:sonnet", role: "primary", transportApi: "claude-code", claudeCodeModel: "sonnet" }] }), { claudeCode: "sonnet" });

    const file = path.join(dir, "model-roles.json");
    const lines = [];
    const fetch = async () => Response.json(answer);
    await roles.refreshSimeonModelRoles({ getAccessToken: async () => "simeon_da_stand_in", fetch, rememberIn: file, backendUrl: "https://simeon.example" });
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { primary: "claude-sonnet-5-5", cheap: "claude-haiku-5-5", claudeCode: "opus" });
    roles.setSimeonModelRolesForTest({});
    assert.deepEqual(roles.recallSimeonModelRoles(file), { primary: "claude-sonnet-5-5", cheap: "claude-haiku-5-5", claudeCode: "opus" });
    assert.equal(roles.simeonModelRoles().claudeCode, "opus");
    await writeFile(file, JSON.stringify({ primary: "gpt-6-sol", claudeCode: "../../evil" }));
    roles.setSimeonModelRolesForTest({});
    assert.deepEqual(roles.recallSimeonModelRoles(file), { primary: "gpt-6-sol" });
    void lines;
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

test("the effort the person chose: read from Claude's row, kept, and given to Claude Code as --effort", async () => {
  const { module: roles, dispose } = await load("source/host/extensions/inference/simeon-model-roles.ts", "simeon-model-roles");
  const { module: turn, dispose: disposeTurn } = await load("source/host/claude-code/claude-code-turn.ts", "claude-code-turn");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-effort-"));
  try {
    const row = (effort) => ({ modelId: "own:claude:claude-opus-5-5", role: "primary", transportApi: "claude-code", claudeCodeModel: "claude-opus-5-5", ...(effort === undefined ? {} : { claudeCodeEffort: effort }) });
    assert.deepEqual(roles.parseSimeonModelRoles({ data: [row("xhigh")] }), { claudeCode: "claude-opus-5-5", claudeCodeEffort: "xhigh" });
    // An effort Claude Code doesn't take, or none: Claude Code's own.
    for (const bad of ["extreme", "high; rm -rf /", 3, undefined]) assert.equal(roles.parseSimeonModelRoles({ data: [row(bad)] }).claudeCodeEffort, undefined, String(bad));
    const file = path.join(dir, "model-roles.json");
    await writeFile(file, JSON.stringify({ claudeCode: "claude-opus-5-5", claudeCodeEffort: "max" }));
    roles.setSimeonModelRolesForTest({});
    assert.deepEqual(roles.recallSimeonModelRoles(file), { claudeCode: "claude-opus-5-5", claudeCodeEffort: "max" });

    const args = turn.claudeCodeTurnArgs({ prompt: "Hi", model: "claude-opus-5-5", effort: "high" }, {}, undefined);
    assert.equal(args[args.indexOf("--effort") + 1], "high");
    assert.equal(turn.claudeCodeTurnArgs({ prompt: "Hi", model: "claude-opus-5-5" }, {}, undefined).includes("--effort"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
    await disposeTurn();
  }
});

test("before a turn, the roles are read again when the last read is old, and a slow read doesn't hold the turn", async () => {
  const { module: roles, dispose } = await load("source/host/extensions/inference/simeon-model-roles.ts", "simeon-model-roles");
  try {
    let reads = 0;
    let answer = { data: [{ modelId: "own:claude:claude-opus-5-5", role: "primary", transportApi: "claude-code", claudeCodeModel: "claude-opus-5-5", claudeCodeEffort: "low" }] };
    const source = { getAccessToken: async () => "simeon_da_stand_in", backendUrl: "https://simeon.example", fetch: async () => { reads += 1; return Response.json(answer); } };
    roles.setSimeonModelRolesForTest({});
    // Just read: nothing more.
    roles.setSimeonModelRolesSourceForTest(source, Date.now());
    await roles.refreshSimeonModelRolesBeforeTurn();
    assert.equal(reads, 0);
    // Older than fifteen seconds: read now, and the turn sees the new choice.
    roles.setSimeonModelRolesSourceForTest(source, Date.now() - 16_000);
    await roles.refreshSimeonModelRolesBeforeTurn();
    assert.equal(reads, 1);
    assert.equal(roles.simeonModelRoles().claudeCodeEffort, "low");
    // A read that hangs: the turn goes on after three seconds with what it has.
    answer = { data: [] };
    const hanging = { ...source, fetch: () => new Promise(() => {}) };
    roles.setSimeonModelRolesSourceForTest(hanging, 0);
    const started = Date.now();
    await roles.refreshSimeonModelRolesBeforeTurn();
    const waited = Date.now() - started;
    assert.ok(waited >= 2_900 && waited < 4_500, String(waited));
    assert.equal(roles.simeonModelRoles().claudeCodeEffort, "low");
  } finally {
    roles.setSimeonModelRolesSourceForTest(undefined);
    await dispose();
  }
});

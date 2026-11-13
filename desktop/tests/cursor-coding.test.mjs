/**
 * A cloud agent's coding in Cursor's own command-line agent on the person's
 * own computer, on their Cursor plan (13 November 2026, the founder: "Cursor
 * now"): which program codes, Cursor's install, its sign-in on the computer
 * and its turn.
 *
 * Only stand-ins: a script is Cursor's program (it speaks as 2026.11.11 was
 * measured and read to: its arguments, its sign-in link and file, its JSON
 * events, its error output), a small local archive is its download. Nothing
 * reaches Cursor. The real program was run through this same code by hand
 * with its network cut off, against a stand-in server
 * (docs/services-agents.md).
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-cursor-coding-"));
  const outfile = path.join(dir, "cursor.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/cursor-coding-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dir, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const SESSION = "c6b62c6f-7ead-4fd6-9922-e952131177ff";
const GONE = "c6b62c6f-0000-4000-8000-000000000000";
const FIRST = "On it. I'll read the README first.";
const LAST = "Changed the README and ran the tests.";

/**
 * Cursor's program as a script. It keeps what it was started with, signs in
 * and out as the real one does (a link to Cursor's site, then its own file
 * once approved), and writes the real one's events for a turn; its mode is
 * read from a file beside it, since the engine gives it none of its own
 * variables.
 */
const STAND_IN = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const dir = __dirname, mode = JSON.parse(fs.readFileSync(path.join(dir, "mode.json"), "utf8")), args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({ args, cwd: process.cwd(), env: { noBrowser: process.env.NO_OPEN_BROWSER ?? null, secret: process.env.SIMEON_SECRET ?? null, endpoint: process.env.CURSOR_API_ENDPOINT ?? null } }) + "\\n");
const auth = path.join(process.env.HOME, ".config", "cursor", "auth.json");
if (args[0] === "login") {
  console.log("Starting login process...\\nAuthenticating with Cursor...\\nWaiting for browser authentication...");
  console.log("Open a browser and navigate to this link: https://cursor.com/loginDeepControl?challenge=abc&uuid=1234&mode=login&redirectTarget=cli");
  if (mode.login === "refuse") setTimeout(() => { console.error("Login failed or timed out. Please try again."); process.exit(1); }, 50);
  else { const timer = setInterval(() => { if (!fs.existsSync(path.join(dir, "approved"))) return; clearInterval(timer); fs.mkdirSync(path.dirname(auth), { recursive: true }); fs.writeFileSync(auth, JSON.stringify({ accessToken: "stand-in", refreshToken: "stand-in" }), { mode: 0o600 }); console.log("Login successful!"); process.exit(0); }, 20); }
} else if (args[0] === "logout") {
  if (mode.logout !== "leaves") fs.rmSync(auth, { force: true });
} else {
  const say = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
  if (!fs.existsSync(auth)) { console.error("Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable."); process.exit(1); }
  if (mode.turn === "refused") { fs.rmSync(auth); console.error("Your stored authentication is invalid. Please log in again.\\nPlease run 'agent login' to authenticate."); process.exit(1); }
  if (mode.turn === "limit") { console.error("Error: [resource_exhausted] You've hit your usage limit"); process.exit(1); }
  if (mode.turn === "broken") { console.error("Error: [internal] something broke"); process.exit(1); }
  const at = args.indexOf("--resume"), resume = at < 0 ? undefined : args[at + 1];
  if (resume === "${GONE}") { console.error("Error: [not_found] chat not found"); process.exit(1); }
  const session_id = resume ?? "${SESSION}";
  say({ type: "system", subtype: "init", apiKeySource: "login", cwd: process.cwd(), session_id, model: "Auto", permissionMode: "default" });
  say({ type: "user", message: { role: "user", content: [{ type: "text", text: args.at(-1) }] }, session_id });
  say({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: ${JSON.stringify(FIRST)} }] }, session_id });
  say({ type: "tool_call", subtype: "started", call_id: "c1", session_id });
  say({ type: "tool_call", subtype: "completed", call_id: "c1", session_id });
  if (mode.turn === "slow") setTimeout(() => {}, 60000);
  else {
    if (mode.turn !== "tail") say({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: ${JSON.stringify(LAST)} }] }, session_id });
    say({ type: "result", subtype: "success", is_error: false, duration_ms: 5, duration_api_ms: 5, result: ${JSON.stringify(FIRST + LAST)}, session_id, request_id: "r1" });
  }
}
`;

/** A folder with the stand-in, its mode and a home of its own; `env` is what the engine is given. */
async function standIn(dir, mode = {}) {
  const home = path.join(dir, "home");
  const bin = path.join(dir, "bin");
  await mkdir(home, { recursive: true });
  await mkdir(bin, { recursive: true });
  const script = path.join(bin, "agent");
  await writeFile(script, STAND_IN);
  await chmod(script, 0o755);
  const set = (next) => writeFile(path.join(bin, "mode.json"), JSON.stringify(next));
  await set(mode);
  const calls = async () => (existsSync(path.join(bin, "calls.jsonl")) ? (await readFile(path.join(bin, "calls.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
  const env = { PATH: process.env.PATH, HOME: home, SIMEON_CURSOR_BIN: script, SIMEON_SECRET: "never given" };
  const signIn = async () => { await mkdir(path.join(home, ".config", "cursor"), { recursive: true }); await writeFile(path.join(home, ".config", "cursor", "auth.json"), JSON.stringify({ accessToken: "stand-in", refreshToken: "stand-in" })); };
  return { home, bin, env, set, calls, signIn, approve: () => writeFile(path.join(bin, "approved"), "") };
}

const until = async (check, ms = 5_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((resolve) => setTimeout(resolve, 20)); }
  return false;
};

test("which program codes: Cursor after the server's programs while it is signed in on the computer, its model and its names", async () => {
  const { module, dispose } = await load();
  try {
    module.setSimeonModelRolesForTest({});
    module.setSimeonCodingProgramsForTest([{ coder: "claude-code", model: "claude-opus-5-5", effort: "high", modelId: "own:claude:claude-opus-5-5" }]);
    assert.deepEqual(module.codingChoices(false).map((one) => one.coder), ["claude-code"]);
    assert.deepEqual(module.codingChoices(true), [
      { coder: "claude-code", model: "claude-opus-5-5", effort: "high", modelId: "own:claude:claude-opus-5-5" },
      { coder: "cursor", model: "auto", modelId: "own:cursor:auto" },
    ]);
    // Alone: Cursor codes when it is the one connected.
    module.setSimeonCodingProgramsForTest([]);
    assert.deepEqual(module.codingChoices(true), [{ coder: "cursor", model: "auto", modelId: module.CURSOR_MODEL_ID }]);
    assert.deepEqual(module.codingChoices(false), []);
    // The server keeps the model with the cloud agent; the program is read back from it.
    assert.deepEqual(["own:cursor:auto", "own:chatgpt:gpt-6.1-sol", "own:claude:claude-opus-5-5", "", undefined].map(module.coderOfModel), ["cursor", "codex", "claude-code", "claude-code", "claude-code"]);
    assert.deepEqual(module.CLOUD_AGENT_CODERS.map((one) => [module.coderName(one), module.coderPlan(one), module.coderProvider(one)]), [["Claude Code", "Claude", "claude"], ["Codex", "ChatGPT", "chatgpt"], ["Cursor", "Cursor", "cursor"]]);
    // The chat's preview line names what the card offers; an older card's two when it names none it knows.
    assert.equal(module.modelConnectPreviewNames(["claude", "chatgpt", "cursor"]), "Claude Code, Codex, Cursor");
    assert.equal(module.modelConnectPreviewNames(["cursor"]), "Cursor");
    assert.equal(module.modelConnectPreviewNames(undefined), "Claude Code, Codex");
  } finally {
    await dispose();
  }
});

test("Cursor's arguments, task, environment, words and errors, as the program was measured", async () => {
  const { module, dispose } = await load();
  try {
    const args = module.cursorTurnArgs({ prompt: "Fix the typo.", brief: "You're working for the person.", cwd: "/home/box/code/bc-1/repo" });
    assert.deepEqual(args.slice(0, -1), ["-p", "--output-format", "stream-json", "--force", "--trust", "--sandbox", "disabled", "--workspace", "/home/box/code/bc-1/repo"]);
    // A new session's task begins with Simeon's brief (the program has no other place for it); a session carried on has it already.
    assert.equal(args.at(-1), "You're working for the person.\n\n---\n\nFix the typo.");
    const carried = module.cursorTurnArgs({ prompt: "And the title.", brief: "You're working for the person.", resume: SESSION, cwd: "/w" });
    assert.deepEqual(carried.slice(-3), ["--resume", SESSION, "And the title."]);
    assert.ok(!args.includes("--model"), "Cursor names its own model");
    assert.deepEqual(module.cursorTurnArgs({ prompt: "x", model: "gpt-6", cwd: "/w" }).slice(9, 11), ["--model", "gpt-6"]);
    // A task too long for the command line keeps its end: the person's last words.
    const long = module.cursorPrompt({ prompt: `${"old line\n".repeat(20_000)}The person now says: ship it é`, brief: "Brief." }, 10_000);
    assert.ok(Buffer.byteLength(long, "utf8") <= 10_100);
    assert.ok(long.startsWith("Brief.\n\n---\n\n(The start of the exchange is left out: it is too long.)\n"));
    assert.ok(long.endsWith("The person now says: ship it é"));

    const env = module.cursorEnv({ PATH: "/usr/bin", HOME: "/home/box", SIMEON_ACCESS_TOKEN: "never", ANTHROPIC_API_KEY: "never", CURSOR_API_KEY: "never", https_proxy: "http://proxy:1" });
    assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/home/box", https_proxy: "http://proxy:1", SHELL: "/bin/bash", NO_OPEN_BROWSER: "1", NO_COLOR: "1", TERM: "dumb" });
    assert.equal(module.cursorEnv({ SIMEON_CURSOR_ENDPOINT: "http://127.0.0.1:4747" }).CURSOR_API_ENDPOINT, "http://127.0.0.1:4747");

    assert.equal(module.cursorWords({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "On " }, { type: "text", text: "it." }] } }), "On it.");
    assert.equal(module.cursorWords({ type: "user", message: { role: "user", content: [{ type: "text", text: "task" }] } }), "");
    assert.equal(module.cursorWords({ type: "result", result: "all of it" }), "");

    assert.equal(module.classifyCursorError("Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.", false), "signed_out");
    assert.equal(module.classifyCursorError("Your stored authentication is invalid. Please log in again.", true), "signed_out");
    assert.equal(module.classifyCursorError("Error: [resource_exhausted] stand-in 429", false), "limited");
    assert.equal(module.classifyCursorError("Error: [not_found] stand-in 404", true), "no_session");
    assert.equal(module.classifyCursorError("Error: [not_found] stand-in 404", false), "failed");
    assert.equal(module.classifyCursorError("Error: [internal] boom", true), "failed");

    // The sign-in link: a page on Cursor's own site, and nothing else a program might print.
    assert.equal(module.cursorSignInLink("Open a browser and navigate to this link: https://cursor.com/loginDeepControl?challenge=a&uuid=b&mode=login\n"), "https://cursor.com/loginDeepControl?challenge=a&uuid=b&mode=login");
    assert.equal(module.cursorSignInLink("see https://example.com/cursor.com/login and http://cursor.com/x"), undefined);
    assert.equal(module.cursorSignInLink("https://cursor.com.evil.example/login"), undefined);

    // The download is the maker's own archive for this version, with its fingerprint written down.
    const pinned = module.CURSOR_PACKAGES["linux-x64"];
    assert.equal(pinned.url, `https://downloads.cursor.com/lab/${module.CURSOR_VERSION}/linux/x64/agent-cli-package.tar.gz`);
    assert.match(pinned.sha256, /^[0-9a-f]{64}$/);
  } finally {
    await dispose();
  }
});

test("the install: the archive downloaded, checked against its fingerprint and unpacked; another archive refused", async () => {
  const { module, dir, dispose } = await load();
  try {
    // The maker's archive, small: one top folder with the launcher, its Node and its code.
    const source = path.join(dir, "source", "dist-package");
    await mkdir(source, { recursive: true });
    for (const name of ["cursor-agent", "node", "index.js"]) await writeFile(path.join(source, name), `stand-in ${name}\n`);
    const archive = path.join(dir, "agent-cli-package.tar.gz");
    await run("tar", ["-czf", archive, "-C", path.join(dir, "source"), "dist-package"]);
    const sha256 = await module.fingerprintOf(archive);
    const env = { PATH: process.env.PATH, SIMEON_CURSOR_DIR: path.join(dir, "installed") };
    const lines = [];

    assert.equal(module.isCursorInstalled(env.SIMEON_CURSOR_DIR), false);
    // Not the pinned archive: nothing is unpacked.
    assert.equal(await module.ensureCursor({ env, archive: { url: pathToFileURL(archive).href, sha256: "0".repeat(64) }, log: (line) => lines.push(line) }), "failed");
    assert.equal(module.isCursorInstalled(env.SIMEON_CURSOR_DIR), false);
    assert.match(lines.at(-1), /cursor install failed reason=the download isn't the pinned archive/);

    assert.equal(await module.ensureCursor({ env, archive: { url: pathToFileURL(archive).href, sha256 }, log: (line) => lines.push(line) }), "ready");
    assert.equal(module.isCursorInstalled(env.SIMEON_CURSOR_DIR), true);
    const launcher = path.join(env.SIMEON_CURSOR_DIR, module.CURSOR_VERSION, "cursor-agent");
    assert.equal(module.cursorBinary(env), launcher);
    assert.equal(await readFile(launcher, "utf8"), "stand-in cursor-agent\n");
    assert.match(lines.at(-1), new RegExp(`cursor installed version=${module.CURSOR_VERSION.replace(/\./g, "\\.")}`));
    assert.ok(!existsSync(path.join(env.SIMEON_CURSOR_DIR, "download.tar.gz")), "the download is not kept");
    // Asked again: it is there, and nothing is downloaded.
    assert.equal(await module.ensureCursor({ env, archive: { url: "file:///nowhere", sha256 } }), "ready");
    // A stand-in named for tests is always ready, and is the program.
    assert.equal(await module.ensureCursor({ env: { SIMEON_CURSOR_BIN: "/x/agent" } }), "ready");
    assert.equal(module.cursorBinary({ SIMEON_CURSOR_BIN: "/x/agent" }), "/x/agent");
  } finally {
    await dispose();
  }
});

test("the sign-in on the computer: Cursor's own link, connected once approved there, signed out with its own program, a refusal told", async () => {
  const { module, dir, dispose } = await load();
  // The engine's own timers never hold a process open; the test's does, while it waits on them.
  const awake = setInterval(() => {}, 1_000);
  try {
    const cursor = await standIn(dir);
    const lines = [];
    const computer = new module.CursorOnComputer({ env: cursor.env, answerMs: 4_000, log: (line) => lines.push(line) });
    assert.deepEqual(computer.signInState(), { state: "none" });
    assert.equal(computer.connected(), false);

    const started = await computer.startSignIn();
    assert.equal(started.state, "waiting");
    assert.equal(started.url, "https://cursor.com/loginDeepControl?challenge=abc&uuid=1234&mode=login&redirectTarget=cli");
    assert.ok(started.expiresAtMs > Date.now() + 19 * 60_000);
    // Asked again while it waits (the card drawn anew): the same sign-in, not a second program.
    assert.deepEqual(await computer.startSignIn(), started);
    assert.deepEqual(computer.signInState(), started);
    const first = await cursor.calls();
    assert.deepEqual(first.map((call) => call.args), [["login"]]);
    // No browser is opened on the computer, and nothing of the engine's own reaches the program.
    assert.deepEqual(first[0].env, { noBrowser: "1", secret: null, endpoint: null });

    // The person approves on Cursor's site: its program writes its own file, and that is what says connected.
    await cursor.approve();
    assert.ok(await until(() => computer.connected()));
    assert.ok(await until(() => lines.some((line) => /cursor connected/.test(line))));
    assert.deepEqual(computer.signInState(), { state: "connected" });
    assert.deepEqual(await computer.startSignIn(), { state: "connected" });
    assert.deepEqual(module.codingChoices(computer.connected()).at(-1), { coder: "cursor", model: "auto", modelId: "own:cursor:auto" });
    // Neither the link nor a sign-in is in the log.
    assert.ok(lines.every((line) => !/loginDeepControl|stand-in|https:/.test(line)), lines.join("\n"));

    // Disconnect: Cursor's own sign-out; were its file left, it is taken away.
    await cursor.set({ logout: "leaves" });
    assert.deepEqual(await computer.signOut(), { state: "none" });
    assert.equal(computer.connected(), false);
    assert.ok(!existsSync(module.cursorAuthFile(cursor.env)));
    assert.deepEqual((await cursor.calls()).at(-1).args, ["logout"]);

    // Not approved (Cursor's program gave up): the card is told, and Connect starts over.
    await cursor.set({ login: "refuse" });
    assert.equal((await computer.startSignIn()).state, "waiting");
    assert.ok(await until(() => computer.signInState().state === "failed"));
    assert.deepEqual(computer.signInState(), { state: "failed", why: "Cursor's sign-in ended before it was approved" });
    await cursor.set({});
    assert.equal((await computer.startSignIn()).state, "waiting");
    computer.dispose();

    // The program can't be put on the computer: said, not thrown.
    const none = new module.CursorOnComputer({ env: cursor.env, ensure: async () => "failed", log: () => {} });
    assert.deepEqual(await none.startSignIn(), { state: "failed", why: "Cursor couldn't be set up on the computer" });
    // Still being put in place when the card asks: "installing", and the link follows.
    let installed;
    const slow = new module.CursorOnComputer({ env: cursor.env, ensure: () => new Promise((resolve) => { installed = resolve; }), answerMs: 30, log: () => {} });
    assert.deepEqual(await slow.startSignIn(), { state: "installing" });
    assert.deepEqual(await slow.startSignIn(), { state: "installing" });
    installed("ready");
    assert.ok(await until(() => slow.signInState().state === "waiting"));
    slow.dispose();
  } finally {
    clearInterval(awake);
    await dispose();
  }
});

test("a turn in Cursor: done with its session and its answer, a session carried on, a session gone, the plan's limit, signed out, stopped, not installed", async () => {
  const { module, dir, dispose } = await load();
  try {
    const cursor = await standIn(dir);
    const cwd = path.join(dir, "repo");
    await mkdir(cwd);
    const heard = [];
    const turn = (extra = {}) => module.runCursorTurn({ prompt: "Fix the typo.", brief: "Brief.", cwd, env: cursor.env, onEvent: (event) => { const words = module.cursorWords(event); if (words) heard.push(words); }, ...extra });

    // Not signed in: the program's own words, read as signed out.
    assert.deepEqual(await turn(), { kind: "signed_out", said: "Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable." });

    await cursor.signIn();
    assert.deepEqual(await turn(), { kind: "done", sessionId: SESSION, text: LAST });
    // What it said along the way, whole, for the chat: its "on it" first.
    assert.deepEqual(heard, [FIRST, LAST]);
    const call = (await cursor.calls()).at(-1);
    assert.equal(call.cwd, cwd);
    assert.deepEqual(call.args, ["-p", "--output-format", "stream-json", "--force", "--trust", "--sandbox", "disabled", "--workspace", cwd, "Brief.\n\n---\n\nFix the typo."]);
    assert.deepEqual(call.env, { noBrowser: "1", secret: null, endpoint: null });

    // A session carried on: `--resume`, and the follow-up alone.
    assert.deepEqual(await turn({ prompt: "And the title.", resume: SESSION }), { kind: "done", sessionId: SESSION, text: LAST });
    assert.deepEqual((await cursor.calls()).at(-1).args.slice(-3), ["--resume", SESSION, "And the title."]);
    // A session it no longer has: said so, and the coding gives the whole exchange to a new one.
    assert.deepEqual(await turn({ resume: GONE }), { kind: "no_session" });

    // Its last words not sent as an event of their own: read from the result, after what was heard.
    await cursor.set({ turn: "tail" });
    assert.deepEqual(await turn(), { kind: "done", sessionId: SESSION, text: LAST });

    await cursor.set({ turn: "limit" });
    assert.deepEqual(await turn(), { kind: "limited", sessionId: undefined, until: undefined, said: "Error: [resource_exhausted] You've hit your usage limit" });
    await cursor.set({ turn: "broken" });
    assert.deepEqual(await turn({ resume: SESSION }), { kind: "failed", sessionId: SESSION, said: "Error: [internal] something broke", exitCode: 1 });

    // The person stops it while it runs.
    await cursor.set({ turn: "slow" });
    const stop = new AbortController();
    const before = heard.length;
    const slow = turn({ signal: stop.signal });
    assert.ok(await until(() => heard.length > before), "its first words are heard while it still runs");
    stop.abort();
    assert.deepEqual(await slow, { kind: "aborted", sessionId: SESSION });
    assert.deepEqual(await turn({ signal: stop.signal }), { kind: "aborted" });

    // Cursor refused the sign-in: its program takes its own file away, and the turn reads as signed out.
    await cursor.set({ turn: "refused" });
    assert.equal((await turn()).kind, "signed_out");
    assert.equal(module.cursorConnected(cursor.env), false);

    assert.deepEqual(await turn({ env: { ...cursor.env, SIMEON_CURSOR_BIN: path.join(dir, "no-such-program") } }), { kind: "not_installed" });
  } finally {
    await dispose();
  }
});

test("waiting on the chat's card: an agent whose launch named Cursor is resumed by Cursor alone", async () => {
  const { module, dispose } = await load();
  try {
    const connected = {};
    const resumed = [];
    const wait = new module.ModelConnectWait({ connected: (program) => connected[program ?? "any"], read: async () => {}, onConnected: (agentId, choice) => resumed.push([agentId, choice.coder]), intervalMs: 1e9, now: () => 0 });
    wait.wait("agent-any");
    wait.wait("agent-cursor", "cursor");
    await wait.check();
    assert.deepEqual([resumed, wait.size()], [[], 2]);
    // Claude connected in AI Models: the agent that asked for no program goes on, the one that asked for Cursor still waits.
    connected.any = { coder: "claude-code", model: "claude-opus-5-5" };
    await wait.check();
    assert.deepEqual([resumed, wait.size()], [[["agent-any", "claude-code"]], 1]);
    connected.cursor = { coder: "cursor", model: "auto" };
    await wait.check();
    assert.deepEqual([resumed.at(-1), wait.size()], [["agent-cursor", "cursor"], 0]);
    wait.dispose();
  } finally {
    await dispose();
  }
});

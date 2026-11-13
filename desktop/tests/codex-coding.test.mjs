/**
 * A cloud agent's coding in Codex on the person's own computer, on their
 * ChatGPT plan (13 November 2026, the founder: "running one in Codex is not
 * built"): which program codes, Codex's turn, and the relay its calls go
 * through to Simeon Labs' server.
 *
 * Only stand-ins: a script is Codex (it speaks as Codex 0.168.0 was measured
 * to: its arguments, its JSON events, its error output), a function is
 * Simeon Labs' server. Nothing reaches OpenAI, ChatGPT or the server. The
 * real program was run through this same code by hand, against a stand-in
 * server (docs/services-agents.md).
 */
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-codex-coding-"));
  const outfile = path.join(dir, "codex.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/codex-coding-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const SESSION = "01a1d3ff-d8f5-7491-a258-a863ed913521";
const GONE = "01a1d3ff-0000-7000-8000-000000000000";

/** The server's answer to a call, as a Responses stream. */
function stream(text) {
  const events = [
    { type: "response.created", response: { id: "resp_1" } },
    { type: "response.output_item.done", output_index: 0, item: { type: "message", role: "assistant", content: [{ type: "output_text", text }] } },
    { type: "response.completed", response: { id: "resp_1", usage: { input_tokens: 10, output_tokens: 2 } } },
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Simeon Labs' server as a function: it keeps what it was sent and answers as told. */
function server(answer = () => stream("Done.")) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const call = { url: String(url), headers: { ...init.headers }, body: JSON.parse(gunzipSync(Buffer.from(init.body)).toString("utf8")) };
    calls.push(call);
    return answer(call, calls.length);
  };
  return { calls, fetchImpl };
}

/**
 * Codex as a script. It reads its arguments and its input as the real one
 * does, makes one call to its provider with its key, and writes the real
 * one's events: `thread.started`, what the model said, `turn.completed`; on
 * a refusal `turn.failed` in Codex's own words and exit 1; for a session it
 * doesn't have, Codex's error line and exit 1.
 */
async function codexScript(dir) {
  const file = path.join(dir, "codex");
  await writeFile(file, `#!/usr/bin/env node
const fs = require("fs"); const path = require("path");
const args = process.argv.slice(2);
const set = Object.fromEntries(args.flatMap((arg, i) => args[i - 1] === "-c" ? [[arg.slice(0, arg.indexOf("=")), JSON.parse(arg.slice(arg.indexOf("=") + 1))]] : []));
const resume = args[1] === "resume" ? args[args.length - 2] : undefined;
let prompt = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", async () => {
  fs.appendFileSync(path.join(process.env.CODEX_HOME, "runs.jsonl"), JSON.stringify({ args, prompt, cwd: process.cwd(), env: Object.keys(process.env).sort(), noProxy: process.env.NO_PROXY }) + "\\n");
  const say = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
  if (resume === "${GONE}") { process.stderr.write("Error: thread/resume: thread/resume failed: no rollout found for thread id ${GONE} (code -32600)\\n\\nStack backtrace:\\n   0: <unknown>\\n"); process.exit(1); }
  say({ type: "thread.started", thread_id: resume ?? "${SESSION}" });
  say({ type: "turn.started" });
  if (prompt.includes("wait")) { say({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: "On it. Waiting." } }); setTimeout(() => process.exit(0), 60000); return; }
  const response = await fetch(set["model_providers.simeon.base_url"] + "/responses", { method: "POST", headers: { authorization: "Bearer " + process.env[set["model_providers.simeon.env_key"]], "content-type": "application/json", originator: "codex_exec", "session-id": "sess-1", "x-codex-window-id": "w:0", "x-private": "no" }, body: JSON.stringify({ model: args[args.indexOf("-m") + 1], stream: true, input: [{ role: "user", content: prompt }], client_metadata: { a: 1 } }) });
  const text = await response.text();
  if (response.status === 429) { const words = "You\\u2019ve hit your usage limit. Try again at 10:43 AM."; say({ type: "error", message: words }); say({ type: "turn.failed", error: { message: words } }); process.exit(1); }
  if (!response.ok) { const words = "unexpected status " + response.status + ": " + (JSON.parse(text).error?.message ?? "") + ", url: " + set["model_providers.simeon.base_url"] + "/responses"; say({ type: "error", message: words }); say({ type: "turn.failed", error: { message: words } }); process.exit(1); }
  const done = text.split("\\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6))).filter((event) => event.type === "response.output_item.done").map((event) => event.item.content[0].text);
  say({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: "On it. I'll read the README first." } });
  say({ type: "item.completed", item: { id: "item_1", type: "command_execution", command: "cat README.md", aggregated_output: "Demo", exit_code: 0, status: "completed" } });
  say({ type: "item.completed", item: { id: "item_2", type: "agent_message", text: done.join(" ") } });
  say({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0 } });
});
`);
  await chmod(file, 0o755);
  return file;
}

test("which program codes: the server's list in its order, the cloud agent's own program kept, Claude alone on an older server, none when neither is connected", async () => {
  const { module, dispose } = await load();
  try {
    const rows = { data: [
      { modelId: "claude-haiku-5-5", role: "primary", transportApi: "anthropic-messages" },
      { modelId: "own:chatgpt:gpt-6.1-sol", modelName: "GPT-6.1 Sol", role: "coding", transportApi: "codex", codexModel: "gpt-6.1-sol", codexEffort: "medium", accessible: true },
      { modelId: "own:claude:claude-opus-5-5", role: "coding", transportApi: "claude-code", claudeCodeModel: "claude-opus-5-5", claudeCodeEffort: "high" },
      { modelId: "own:claude:x", role: "coding", transportApi: "claude-code", claudeCodeModel: "Not A Model" },
      { modelId: "own:chatgpt:off", role: "coding", transportApi: "codex", codexModel: "gpt-6-luna", accessible: false },
      { modelId: "own:other:x", role: "coding", transportApi: "something-else" },
    ] };
    const programs = module.parseSimeonCodingPrograms(rows);
    assert.deepEqual(programs, [
      { coder: "codex", model: "gpt-6.1-sol", effort: "medium", modelId: "own:chatgpt:gpt-6.1-sol" },
      { coder: "claude-code", model: "claude-opus-5-5", effort: "high", modelId: "own:claude:claude-opus-5-5" },
    ]);
    assert.deepEqual(module.parseSimeonCodingPrograms({ data: "no" }), []);

    module.setSimeonModelRolesForTest({});
    module.setSimeonCodingProgramsForTest(programs);
    assert.equal(module.codingChoice().coder, "codex", "the first the server lists");
    assert.equal(module.codingChoice("claude-code").coder, "claude-code", "a cloud agent begun in Claude Code stays there while Claude is connected");
    assert.equal(module.codingChoice("claude-code").model, "claude-opus-5-5");
    module.setSimeonCodingProgramsForTest([programs[0]]);
    assert.equal(module.codingChoice("claude-code").coder, "codex", "Claude gone: the one that is connected");

    // An older server lists no programs: a person on Claude still codes in Claude Code.
    module.setSimeonCodingProgramsForTest([]);
    module.setSimeonModelRolesForTest({ claudeCode: "claude-sonnet-5-5", claudeCodeEffort: "max" });
    module.rememberSimeonModelNames({ data: [{ modelId: "own:claude:claude-sonnet-5-5", role: "primary", transportApi: "claude-code" }] });
    assert.deepEqual(module.codingChoice(), { coder: "claude-code", model: "claude-sonnet-5-5", effort: "max", modelId: "own:claude:claude-sonnet-5-5" });
    module.setSimeonModelRolesForTest({});
    assert.equal(module.codingChoice(), undefined, "neither connected");
    assert.deepEqual(module.codingChoices(), []);

    assert.equal(module.coderOfModel("own:chatgpt:gpt-6.1-sol"), "codex");
    assert.equal(module.coderOfModel("own:claude:claude-opus-5-5"), "claude-code");
    assert.equal(module.coderOfModel(""), "claude-code", "every cloud agent before Codex ran in Claude Code");
    assert.equal(module.coderOfModel(undefined), "claude-code");
    assert.equal(module.coderName("codex"), "Codex");
    assert.equal(module.coderPlan("codex"), "ChatGPT");
    assert.equal(module.coderPlan("claude-code"), "Claude");
  } finally {
    await dispose();
  }
});

test("Codex's arguments, environment and words, as the program was measured", async () => {
  const { module, dispose } = await load();
  try {
    const relay = { baseUrl: "http://127.0.0.1:4711/v1" };
    const brief = "Work in this checkout.\n- Say \"On it\" first.";
    assert.deepEqual(module.codexTurnArgs({ model: "gpt-6.1-sol", effort: "high", brief }, relay), [
      "exec", "--json", "--dangerously-bypass-approvals-and-sandbox", "-m", "gpt-6.1-sol",
      "-c", 'model_provider="simeon"',
      "-c", 'model_providers.simeon.name="Simeon"',
      "-c", 'model_providers.simeon.base_url="http://127.0.0.1:4711/v1"',
      "-c", 'model_providers.simeon.wire_api="responses"',
      "-c", 'model_providers.simeon.env_key="SIMEON_CODEX_KEY"',
      "-c", 'model_reasoning_effort="high"',
      "-c", `developer_instructions=${JSON.stringify(brief)}`,
      "-",
    ]);
    const resumed = module.codexTurnArgs({ model: "gpt-6-luna", resume: SESSION }, relay);
    assert.deepEqual(resumed.slice(0, 3), ["exec", "resume", "--json"]);
    assert.deepEqual(resumed.slice(-2), [SESSION, "-"], "the session, then the follow-up on its input");
    assert.ok(!resumed.some((arg) => arg.startsWith("model_reasoning_effort")), "no effort named: Codex's own");

    const env = module.codexEnv({ PATH: "/bin", HOME: "/home/box", SIMEON_ACCESS_TOKEN: "secret", ANTHROPIC_API_KEY: "secret", no_proxy: "internal", SSL_CERT_FILE: "/ca.pem" }, { home: "/home/box/.simeon-codex", key: "turn-key" });
    assert.equal(env.CODEX_HOME, "/home/box/.simeon-codex");
    assert.equal(env.SIMEON_CODEX_KEY, "turn-key");
    assert.equal(env.no_proxy, "internal,127.0.0.1,localhost", "the relay is on this computer");
    assert.equal(env.NO_PROXY, "127.0.0.1,localhost");
    assert.equal(env.SSL_CERT_FILE, "/ca.pem");
    assert.equal(env.SIMEON_ACCESS_TOKEN, undefined, "nothing of the engine's");
    assert.equal(env.ANTHROPIC_API_KEY, undefined);

    assert.equal(module.codexWords({ type: "item.completed", item: { type: "agent_message", text: "On it." } }), "On it.");
    assert.equal(module.codexWords({ type: "item.completed", item: { type: "command_execution", aggregated_output: "x" } }), "");
    assert.equal(module.codexWords({ type: "item.started", item: { type: "agent_message", text: "half" } }), "");
    assert.equal(module.codexWords({ type: "turn.completed" }), "");

    assert.equal(module.classifyCodexError("Error: thread/resume: thread/resume failed: no rollout found for thread id x (code -32600)"), "no_session");
    assert.equal(module.classifyCodexError("You’ve hit your usage limit. Try again at 9:21 AM."), "limited");
    assert.equal(module.classifyCodexError("unexpected status 401 Unauthorized: ChatGPT isn't connected."), "signed_out");
    assert.equal(module.classifyCodexError("unexpected status 503 Service Unavailable"), "failed");

    const now = Date.UTC(2026, 10, 13, 9, 0);
    assert.equal(module.limitOfRefusal(429, JSON.stringify({ error: { type: "usage_limit_reached", resets_at: 1_794_566_600 } }), now), 1_794_566_600_000);
    assert.equal(module.limitOfRefusal(429, JSON.stringify({ error: { type: "usage_limit_reached", resets_in_seconds: 60 } }), now), now + 60_000);
    assert.equal(module.limitOfRefusal(429, JSON.stringify({ error: { type: "usage_limit_reached" } }), now), 0, "a limit that names no time");
    assert.equal(module.limitOfRefusal(429, JSON.stringify({ error: { type: "rate_limit_exceeded_for_now" } }), now), 0);
    assert.equal(module.limitOfRefusal(503, JSON.stringify({ error: { type: "usage_limit_reached" } }), now), undefined);
    assert.equal(module.limitOfRefusal(429, "not json", now), undefined);

    assert.deepEqual(module.codexOwnHeaders({ "session-id": "s", "thread-id": "t", "x-codex-window-id": "w", "x-openai-internal-codex-responses-lite": "true", originator: "codex_exec", authorization: "Bearer turn-key", "user-agent": "codex", "x-other": "no", host: "127.0.0.1" }), { "session-id": "s", "thread-id": "t", "x-codex-window-id": "w", "x-openai-internal-codex-responses-lite": "true", originator: "codex_exec" });
  } finally {
    await dispose();
  }
});

test("the relay: Codex's call handed to the server with the computer's credential, the model as the person's own and the reason, the answer streamed back; the limit and ChatGPT not connected kept", async () => {
  const { module, dispose } = await load();
  try {
    const tokens = ["token-1", "token-2", "token-3", "token-4", "token-5"];
    let asked = 0;
    const s = server((call, n) => {
      if (call.body.input === "limit") return new Response(JSON.stringify({ error: { type: "usage_limit_reached", message: "The usage limit has been reached", resets_at: 1_794_566_600 } }), { status: 429, headers: { "content-type": "application/json" } });
      if (call.body.input === "stale" && call.headers.authorization === "Bearer token-2") return new Response(JSON.stringify({ error: { message: "Unauthenticated" } }), { status: 401 });
      if (call.body.input === "gone") return new Response(JSON.stringify({ error: { type: "chatgpt_not_connected", message: "ChatGPT isn't connected." } }), { status: 401, headers: { "content-type": "application/json" } });
      return stream(`Answer ${n}.`);
    });
    const relay = await module.startCodexRelay({ getBackendUrl: () => "https://api.simeon.test", getAccessToken: async () => tokens[asked++], modelId: "own:chatgpt:gpt-6.1-sol", fetchImpl: s.fetchImpl });
    try {
      assert.match(relay.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/, "on the loopback only");
      const call = (input, headers = {}) => fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: `Bearer ${relay.key}`, "content-type": "application/json", originator: "codex_exec", "session-id": "sess-1", "x-codex-window-id": "w:0", "x-private": "no", ...headers }, body: JSON.stringify({ model: "gpt-6.1-sol", stream: true, input, client_metadata: { a: 1 } }) });

      const first = await call("hello");
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("content-type"), "text/event-stream");
      assert.match(await first.text(), /"text":"Answer 1\."/, "the server's stream, as it came");
      const sent = s.calls[0];
      assert.equal(sent.url, "https://api.simeon.test/desktop/api/proxy/v1/responses");
      assert.equal(sent.headers.authorization, "Bearer token-1", "the computer's own credential, never Codex's key");
      assert.equal(sent.headers["x-simeon-call-reason"], "coding");
      assert.equal(sent.headers["content-encoding"], "gzip");
      assert.equal(sent.headers.originator, "codex_exec");
      assert.equal(sent.headers["session-id"], "sess-1");
      assert.equal(sent.headers["x-codex-window-id"], "w:0");
      assert.equal(sent.headers["x-private"], undefined);
      assert.deepEqual(sent.body, { model: "own:chatgpt:gpt-6.1-sol", stream: true, input: "hello", client_metadata: { a: 1 } }, "Codex's own request, only the model named as the person's own");

      // Not this turn's key, another path, not JSON: nothing reaches the server.
      assert.equal((await call("x", { authorization: "Bearer other" })).status, 401);
      assert.equal((await fetch(`${relay.baseUrl}/models`, { headers: { authorization: `Bearer ${relay.key}` } })).status, 404);
      assert.equal((await fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: `Bearer ${relay.key}` }, body: "{" })).status, 400);
      assert.equal(s.calls.length, 1);

      // The computer's own credential refused: once more with the one it has now.
      const stale = await call("stale");
      assert.equal(stale.status, 200);
      assert.deepEqual(s.calls.slice(1).map((one) => one.headers.authorization), ["Bearer token-2", "Bearer token-3"]);
      assert.deepEqual(relay.state(), { calls: 2, limited: false, notConnected: false });

      const limited = await call("limit");
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).error.type, "usage_limit_reached", "ChatGPT's own words reach Codex");
      assert.deepEqual(relay.state(), { calls: 3, limited: true, limitedUntilMs: 1_794_566_600_000, notConnected: false });

      const gone = await call("gone");
      assert.equal(gone.status, 401);
      assert.equal(relay.state().notConnected, true);
      const before = s.calls.length;
      assert.equal((await call("hello again")).status, 401, "said once by the server, the same to Codex's retries");
      assert.equal(s.calls.length, before);
    } finally {
      await relay.close();
    }
    await assert.rejects(fetch(`${relay.baseUrl}/responses`, { method: "POST", headers: { authorization: `Bearer ${relay.key}` }, body: "{}" }), "closed with the turn");

    // The server out of reach: said to Codex, which tries again by itself.
    const down = await module.startCodexRelay({ getBackendUrl: () => "https://api.simeon.test", getAccessToken: async () => "token", modelId: "own:chatgpt:gpt-6.1-sol", fetchImpl: async () => { throw new Error("connect ECONNREFUSED"); } });
    try {
      const answer = await fetch(`${down.baseUrl}/responses`, { method: "POST", headers: { authorization: `Bearer ${down.key}` }, body: "{}" });
      assert.equal(answer.status, 502);
      assert.match((await answer.json()).error.message, /couldn't be reached/);
    } finally {
      await down.close();
    }
  } finally {
    await dispose();
  }
});

test("a turn in Codex: done with its session and its words, a session carried on, a session gone, the plan's limit with when, ChatGPT not connected, the person's Stop, not installed", async () => {
  const { module, dispose } = await load();
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-codex-turn-"));
  try {
    const bin = await codexScript(dir);
    const home = path.join(dir, "codex-home");
    const env = { PATH: process.env.PATH, HOME: dir, SIMEON_CODEX_BIN: bin, SIMEON_CODEX_HOME: home, SIMEON_ACCESS_TOKEN: "never-passed" };
    const runs = async () => (await readFile(path.join(home, "runs.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const turn = (s, extra = {}) => module.runCodexTurn({ prompt: "Polish the README.", model: "gpt-6.1-sol", modelId: "own:chatgpt:gpt-6.1-sol", effort: "medium", brief: "Commit on this branch.", cwd: dir, env, relay: { getBackendUrl: () => "https://api.simeon.test", getAccessToken: async () => "computer-token", fetchImpl: s.fetchImpl }, ...extra });

    const said = [];
    const ok = server(() => stream("Polished the README and ran the checks."));
    const done = await turn(ok, { onEvent: (event) => { const words = module.codexWords(event); if (words !== "") said.push(words); } });
    assert.deepEqual(done, { kind: "done", sessionId: SESSION, text: "Polished the README and ran the checks.", turns: 1 });
    assert.deepEqual(said, ["On it. I'll read the README first.", "Polished the README and ran the checks."], "its words between its commands, for the chat");
    assert.equal(ok.calls[0].body.model, "own:chatgpt:gpt-6.1-sol");
    assert.equal(ok.calls[0].headers.authorization, "Bearer computer-token");
    const [first] = await runs();
    assert.equal(first.prompt, "Polish the README.", "the task on its input, never an argument");
    assert.equal(first.cwd, dir);
    assert.ok(first.args.includes('model_reasoning_effort="medium"'));
    assert.ok(first.args.includes('developer_instructions="Commit on this branch."'));
    assert.ok(first.env.includes("SIMEON_CODEX_KEY") && first.env.includes("CODEX_HOME"));
    assert.ok(!first.env.includes("SIMEON_ACCESS_TOKEN"), "nothing of the engine's reaches Codex");
    assert.match(first.noProxy, /127\.0\.0\.1/);

    const carried = await turn(ok, { prompt: "Add a note.", resume: SESSION });
    assert.equal(carried.kind, "done");
    const second = (await runs())[1];
    assert.deepEqual(second.args.slice(0, 2), ["exec", "resume"]);
    assert.equal(second.args.at(-2), SESSION);
    assert.equal(second.prompt, "Add a note.");

    assert.deepEqual(await turn(ok, { resume: GONE }), { kind: "no_session" });

    const limit = server(() => new Response(JSON.stringify({ error: { type: "usage_limit_reached", resets_at: 1_794_566_600 } }), { status: 429 }));
    const limited = await turn(limit);
    assert.equal(limited.kind, "limited");
    assert.equal(limited.until, 1_794_566_600_000, "when the limit ends, as the server said");
    assert.equal(limited.sessionId, SESSION, "its session kept: a reply after the reset carries on");

    const out = server(() => new Response(JSON.stringify({ error: { type: "chatgpt_not_connected", message: "ChatGPT isn't connected." } }), { status: 401 }));
    assert.equal((await turn(out)).kind, "signed_out");

    const busy = server(() => new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503 }));
    const failed = await turn(busy);
    assert.equal(failed.kind, "failed");
    assert.match(failed.said, /unexpected status 503: busy/);
    assert.equal(failed.exitCode, 1);

    const stop = new AbortController();
    const stopped = turn(ok, { prompt: "wait", signal: stop.signal, onEvent: () => stop.abort() });
    assert.deepEqual(await stopped, { kind: "aborted", sessionId: SESSION });
    assert.deepEqual(await turn(ok, { signal: stop.signal }), { kind: "aborted" }, "already stopped: nothing is started");

    // No program by that name, and none installed: the coding says so and tries again later.
    const missing = await module.runCodexTurn({ prompt: "x", model: "gpt-6.1-sol", modelId: "own:chatgpt:gpt-6.1-sol", cwd: dir, env: { ...env, SIMEON_CODEX_BIN: path.join(dir, "no-such-codex") }, relay: { getBackendUrl: () => "https://api.simeon.test", getAccessToken: async () => "t", fetchImpl: ok.fetchImpl } });
    assert.deepEqual(missing, { kind: "not_installed" });
    assert.equal(module.isCodexInstalled(path.join(dir, "nothing-here")), false);
    assert.equal(module.codexBinary({ SIMEON_CODEX_DIR: path.join(dir, "nothing-here") }), "codex");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

test("waiting on the chat's card: the list read again, every waiting agent resumed once a program can code, an agent nobody connected for forgotten", async () => {
  const { module, dispose } = await load();
  try {
    let clock = 0;
    let reads = 0;
    let connected;
    const resumed = [];
    const wait = new module.ModelConnectWait({ connected: () => connected, read: async () => { reads += 1; }, onConnected: (agentId, choice) => resumed.push([agentId, choice.coder]), intervalMs: 60_000, lifetimeMs: 1_000, now: () => clock });
    try {
      await wait.check();
      assert.equal(reads, 0, "nobody waits: nothing is asked of the server");
      wait.wait("agent-1");
      wait.wait("agent-2");
      await wait.check();
      assert.equal(reads, 1);
      assert.deepEqual(resumed, []);
      assert.equal(wait.size(), 2);

      connected = { coder: "codex", model: "gpt-6.1-sol" };
      await wait.check();
      assert.deepEqual(resumed, [["agent-1", "codex"], ["agent-2", "codex"]]);
      assert.equal(wait.size(), 0);
      await wait.check();
      assert.equal(reads, 2, "everyone resumed: the reading stops");

      connected = undefined;
      wait.wait("agent-3");
      clock = 2_000;
      await wait.check();
      assert.equal(wait.size(), 0, "forgotten after its time");
      assert.equal(reads, 2);
    } finally {
      wait.dispose();
    }
  } finally {
    await dispose();
  }
});

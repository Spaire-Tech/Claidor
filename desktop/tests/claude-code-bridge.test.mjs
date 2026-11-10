/**
 * Simeon's tools offered to Claude Code over MCP (9 November 2026;
 * docs/your-own-models.md, section 6, step C4): the turn's own MCP server
 * (127.0.0.1, a token in the path, no web page and no other host, plain JSON
 * answers), the engine's tools bridged with their own names, schemas,
 * execute and render (Simeon's real SendMessage reaching the chat), the
 * tools Claude Code has its own of left out, and Claude Code's permission
 * asks answered by the safety review. Nothing reaches claude.ai or
 * Anthropic.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { request } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-bridge-"));
  const outfile = path.join(dir, "bridge.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/claude-code-bridge-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** One HTTP call, with the headers given (Claude Code sends no Origin). */
function call(url, { method = "POST", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = request({ hostname: target.hostname, port: target.port, path: target.pathname, method, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode, json: text === "" ? undefined : JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });

test("the turn's MCP server: the handshake, the tools, a call, and nothing from a web page or another path", async () => {
  const { module: bridge, dispose } = await load();
  const lines = [];
  let seenSignal;
  const tools = [
    { name: "Echo", description: "Says it back", inputSchema: { type: "object", properties: { words: { type: "string" } } }, call: async (args, signal) => { seenSignal = signal; return { content: [{ type: "text", text: `you said ${args.words}` }] }; } },
    { name: "Refuse", description: "Says no", inputSchema: { type: "object" }, call: async () => ({ content: [{ type: "text", text: "no" }], isError: true }) },
    { name: "Throw", description: "Breaks", inputSchema: { type: "object" }, call: async () => { throw new Error("it broke"); } },
  ];
  const turn = new AbortController();
  const server = await bridge.startSimeonMcpServer({ tools: () => tools, signal: turn.signal, log: (line) => lines.push(line) });
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]{48}$/);
    assert.deepEqual(server.config, { type: "http", url: server.url });

    const hello = await call(server.url, { body: rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2.1.311" } }) });
    assert.equal(hello.status, 200);
    assert.deepEqual(hello.json.result, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "simeon", version: "1" } });
    const older = await call(server.url, { body: rpc(2, "initialize", { protocolVersion: "2099-01-01" }) });
    assert.equal(older.json.result.protocolVersion, "2025-06-18");
    assert.equal((await call(server.url, { body: { jsonrpc: "2.0", method: "notifications/initialized" } })).status, 202);
    assert.deepEqual((await call(server.url, { body: rpc(3, "ping") })).json, { jsonrpc: "2.0", id: 3, result: {} });

    const listed = await call(server.url, { body: rpc(4, "tools/list") });
    assert.deepEqual(listed.json.result.tools.map((tool) => tool.name), ["Echo", "Refuse", "Throw"]);
    assert.deepEqual(listed.json.result.tools[0].inputSchema, { type: "object", properties: { words: { type: "string" } } });

    const echoed = await call(server.url, { body: rpc(5, "tools/call", { name: "Echo", arguments: { words: "hi" } }) });
    assert.deepEqual(echoed.json, { jsonrpc: "2.0", id: 5, result: { content: [{ type: "text", text: "you said hi" }] } });
    assert.deepEqual((await call(server.url, { body: rpc(6, "tools/call", { name: "Refuse", arguments: {} }) })).json.result, { content: [{ type: "text", text: "no" }], isError: true });
    assert.deepEqual((await call(server.url, { body: rpc(7, "tools/call", { name: "Throw" }) })).json.result, { content: [{ type: "text", text: "it broke" }], isError: true });
    assert.equal((await call(server.url, { body: rpc(8, "tools/call", { name: "Nope" }) })).json.error.code, -32602);
    assert.equal((await call(server.url, { body: rpc(9, "resources/list") })).json.error.code, -32601);
    assert.equal((await call(server.url, { body: "{not json" })).json.error.code, -32700);
    const batch = await call(server.url, { body: [rpc(10, "ping"), { jsonrpc: "2.0", method: "notifications/cancelled" }, rpc(11, "ping")] });
    assert.deepEqual(batch.json.map((one) => one.id), [10, 11]);
    // One line per call: the tool and how it ended, never what it was given or gave back.
    assert.ok(lines.some((line) => /^claude-code tool=Echo ok=yes ms=\d+$/.test(line)), lines.join("\n"));
    assert.ok(lines.some((line) => /^claude-code tool=Throw ok=no threw ms=\d+$/.test(line)));
    assert.ok(!lines.join("\n").includes("hi"));

    // Not this turn's path, a web page, another host's name, another method: refused.
    assert.equal((await call(server.url.replace(/[0-9a-f]{48}$/, "0".repeat(48)), { body: rpc(12, "ping") })).status, 404);
    assert.equal((await call(server.url, { body: rpc(13, "ping"), headers: { origin: "https://evil.example" } })).status, 403);
    assert.equal((await call(server.url, { body: rpc(14, "ping"), headers: { host: "evil.example" } })).status, 403);
    assert.equal((await call(server.url, { method: "GET" })).status, 405);

    // The turn stops: a call's signal says so.
    assert.equal(seenSignal.aborted, false);
    turn.abort();
    assert.equal(seenSignal.aborted, true);
  } finally {
    await server.close();
    await dispose();
  }
  await assert.rejects(call(server.url, { body: rpc(15, "ping") }));
});

test("the engine's tools bridged: Simeon's real SendMessage reaches the chat, Claude Code's own kinds left out", async () => {
  const { module: bridge, dispose } = await load();
  const sent = [];
  const lines = [];
  const sendMessage = bridge.createSendMessageTool({
    getIngestAttachment: () => undefined,
    onSendMessage: (message, timestampMs) => { sent.push({ message, timestampMs }); return "t3s1"; },
  });
  const readTool = { toolIdentifier: "READ", name: "Read", parameters: { jsonSchema: { type: "object" } }, execute: async () => "file" };
  // The engine's Shell is offered: it carries the person's safety review, and Claude Code's own Bash is off.
  const shellTool = { toolIdentifier: "SHELL", name: "Shell", parameters: { jsonSchema: { type: "object" } }, execute: async () => "ran" };
  const reaching = {
    toolIdentifier: "ASK_LOOP",
    name: "Ask Loop!",
    description: "Reaches for a part of the loop the bridge doesn't give",
    parameters: { jsonSchema: { type: "object", properties: {} } },
    execute: async (_ctx, handler) => handler.requestUserApproval("ok?"),
  };
  const turn = new AbortController();
  try {
    const tools = bridge.bridgeEngineTools([sendMessage, readTool, shellTool, reaching], { ctx: bridge.createContext(), signal: turn.signal, log: (line) => lines.push(line) });
    assert.deepEqual(tools.map((tool) => tool.name), ["SendMessage", "Shell", "Ask_Loop_"]);
    assert.deepEqual(bridge.CLAUDE_CODE_TOOLS_OFF, ["Bash", "BashOutput", "KillShell", "KillBash", "AskUserQuestion"]);
    const send = tools[0];
    assert.match(send.description, /This is your only voice/);
    assert.equal(send.inputSchema.type, "object");
    assert.ok("content" in send.inputSchema.properties, Object.keys(send.inputSchema.properties).join(","));

    const answer = await send.call({ type: "text", content: "Booked for Tuesday at 10." }, new AbortController().signal);
    assert.deepEqual(answer, { content: [{ type: "text", text: "Message sent to user. (id: t3s1)" }] });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].message, { type: "text", content: "Booked for Tuesday at 10." });

    const wrong = await send.call({ type: "widget" }, new AbortController().signal);
    assert.equal(wrong.isError, true);
    assert.equal(sent.length, 1);

    const missing = await tools[2].call({}, new AbortController().signal);
    assert.equal(missing.isError, true);
    await tools[2].call({}, new AbortController().signal);
    assert.deepEqual(lines.filter((line) => line.includes("tool-handler missing")), ["claude-code tool-handler missing=requestUserApproval"]);
  } finally {
    await dispose();
  }
});

test("Claude Code's permission asks go to the safety review", async () => {
  const { module: bridge, dispose } = await load();
  try {
    const asked = [];
    const tool = bridge.permissionBridgeTool(async (name, input) => {
      asked.push(name);
      if (name === "Bash" && String(input.command).includes("rm -rf")) return { allow: false, reason: "Deleting everything needs the person's yes." };
      if (name === "Broken") throw new Error("review down");
      return { allow: true };
    });
    assert.equal(tool.name, "ReviewPermission");
    const signal = new AbortController().signal;
    const allow = await tool.call({ tool_name: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" }, signal);
    assert.deepEqual(JSON.parse(allow.content[0].text), { behavior: "allow", updatedInput: { command: "ls" } });
    const deny = await tool.call({ tool_name: "Bash", input: { command: "rm -rf /" } }, signal);
    assert.deepEqual(JSON.parse(deny.content[0].text), { behavior: "deny", message: "Deleting everything needs the person's yes." });
    const broken = await tool.call({ tool_name: "Broken", input: {} }, signal);
    assert.equal(JSON.parse(broken.content[0].text).behavior, "deny");
    assert.deepEqual(asked, ["Bash", "Bash", "Broken"]);
  } finally {
    await dispose();
  }
});

/**
 * A stand-in `claude -p` that does what Claude Code does with `--mcp-config`:
 * reads the file, connects to the server named there, lists the tools and
 * calls one, then writes its result. It sends no Origin header, as Claude
 * Code doesn't.
 */
const MCP_STAND_IN = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(argv[argv.indexOf("--mcp-config") + 1], "utf8"));
const url = config.mcpServers.simeon.url;
const session = argv[argv.indexOf("--session-id") + 1];
let stdin = "";
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", async () => {
  const rpc = async (id, method, params) => (await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
  await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2.1.311" } });
  const listed = await rpc(2, "tools/list", {});
  const prompt = JSON.parse(stdin).message.content[0].text;
  const called = await rpc(3, "tools/call", { name: "SendMessage", arguments: { type: "text", content: "On it: " + prompt } });
  const out = (event) => process.stdout.write(JSON.stringify({ ...event, session_id: session }) + "\\n");
  out({ type: "system", subtype: "init", tools: listed.result.tools.map((t) => "mcp__simeon__" + t.name), mcp_servers: [{ name: "simeon", status: "connected" }] });
  out({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: called.result.content }] } });
  out({ type: "result", subtype: "success", is_error: false, result: called.result.content[0].text, num_turns: 2 });
});
`;

test("a turn end to end: Claude Code (a stand-in) reaches Simeon's tools through the config file and the person gets the message", async () => {
  const { module: bridge, dispose } = await load();
  const { chmod, writeFile, mkdir } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-e2e-"));
  const sent = [];
  const turn = new AbortController();
  try {
    const bin = path.join(dir, "claude");
    await writeFile(bin, MCP_STAND_IN);
    await chmod(bin, 0o755);
    await mkdir(path.join(dir, "config"));
    const sendMessage = bridge.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: (message) => { sent.push(message); return "t1s1"; } });
    const tools = bridge.bridgeEngineTools([sendMessage], { ctx: bridge.createContext(), signal: turn.signal });
    const server = await bridge.startSimeonMcpServer({ tools: () => [...tools, bridge.permissionBridgeTool(async () => ({ allow: true }))], signal: turn.signal });
    try {
      const outcome = await bridge.runClaudeCodeTurn({
        prompt: "Book the dentist",
        model: "sonnet",
        mcpServers: { simeon: server.config },
        permissionPromptTool: "mcp__simeon__ReviewPermission",
        env: { PATH: process.env.PATH, HOME: dir, SIMEON_CLAUDE_CODE_BIN: bin },
        configDir: path.join(dir, "config"),
      });
      assert.equal(outcome.kind, "done");
      assert.equal(outcome.text, "Message sent to user. (id: t1s1)");
      assert.deepEqual(sent, [{ type: "text", content: "On it: Book the dentist" }]);
    } finally {
      await server.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

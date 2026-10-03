/**
 * "What's my Gmail address?" took about twenty model calls and failed
 * (OpenAI log, 2 October 2026). The model asked for Gmail's tools as
 * {"server":"gmail","toolName":"","pattern":""}, every property filled, and
 * GetMcpTools read the blank toolName as a lookup of a tool named "":
 * `MCP tool "" not found on server "gmail"`. With no names to pick from, the
 * model guessed: get_profile, getProfile, gmail_get_profile, users_get_profile…
 *
 * Offline, against the real tool: a blank argument is no argument, a "not
 * found" names the tools the server has, and a large server is listed by name
 * instead of pasting every schema into the conversation.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = path.join(repoRoot, `.tmp-get-mcp-tools-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/get-mcp-tools-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const SCHEMA = JSON.stringify({ type: "object", properties: { query: { type: "string", description: "A Gmail search query. ".repeat(20) }, max_results: { type: "integer" } } });

function gmail(module, count) {
  const tools = Array.from({ length: count }, (_, index) => new module.McpToolDescriptor({ toolName: index === 0 ? "GMAIL_GET_PROFILE" : `GMAIL_TOOL_${index}`, description: "Does one Gmail thing. ".repeat(10), inputSchemaJson: SCHEMA }));
  return new module.McpMetaToolOptions({ mcpDescriptors: [new module.McpDescriptor({ serverIdentifier: "gmail", serverName: "Gmail", tools })] });
}

async function call(module, tool, args) {
  const handler = { emitPartialToolCall: () => {}, executeToolCall: async (ctx, _call, _id, run) => run(ctx) };
  async function* stream() { yield JSON.stringify(args); }
  try {
    const result = await tool.execute(module.createContext(), handler, stream(), { toolCallId: "call-1" });
    return { ok: true, text: result.result.value.content };
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : String(error) };
  }
}

test("blank arguments are dropped, so {server, toolName:'', pattern:''} lists the server", async () => {
  const { module, dispose } = await load();
  try {
    assert.deepEqual(module.withoutBlankArgs({ server: " gmail ", toolName: "", pattern: "  ", extra: null }), { server: "gmail" });
    const tool = module.createGetMcpToolsTool(gmail(module, 3));
    const result = await call(module, tool, { server: "gmail", toolName: "", pattern: "" });
    assert.equal(result.ok, true, result.text);
    assert.match(result.text, /GMAIL_GET_PROFILE/);
  } finally {
    await dispose();
  }
});

test("a tool that is not found names the tools the server has", async () => {
  const { module, dispose } = await load();
  try {
    const tool = module.createGetMcpToolsTool(gmail(module, 3));
    const result = await call(module, tool, { server: "gmail", toolName: "get_profile" });
    assert.equal(result.ok, false);
    assert.match(result.text, /not found on server "gmail"\. Its tools: GMAIL_GET_PROFILE, GMAIL_TOOL_1, GMAIL_TOOL_2\./);
  } finally {
    await dispose();
  }
});

test("a large server is listed by name; one tool's schema is fetched on its own", async () => {
  const { module, dispose } = await load();
  try {
    const tool = module.createGetMcpToolsTool(gmail(module, 60));
    const listing = await call(module, tool, { server: "gmail" });
    assert.equal(listing.ok, true, listing.text);
    const parsed = JSON.parse(listing.text);
    assert.equal(parsed.tools.length, 60);
    assert.equal(parsed.tools.some((entry) => entry.inputSchema !== undefined), false);
    assert.match(parsed.note, /"toolName":"<name>"/);
    // Each tool carries its arguments, so it can be called without a second lookup.
    assert.equal(parsed.tools[0].args, "query?: string, max_results?: integer");
    assert.ok(Buffer.byteLength(listing.text) < 20_000, `listing is ${Buffer.byteLength(listing.text)} bytes`);
    const one = await call(module, tool, { server: "gmail", toolName: "GMAIL_GET_PROFILE" });
    assert.equal(one.ok, true, one.text);
    assert.ok(JSON.parse(one.text).tool.inputSchema !== undefined);
  } finally {
    await dispose();
  }
});

test("a small server still comes with its schemas in one call", async () => {
  const { module, dispose } = await load();
  try {
    const tool = module.createGetMcpToolsTool(gmail(module, 2));
    const parsed = JSON.parse((await call(module, tool, { server: "gmail" })).text);
    assert.equal(parsed.note, undefined);
    assert.ok(parsed.tools.every((entry) => entry.inputSchema !== undefined));
  } finally {
    await dispose();
  }
});

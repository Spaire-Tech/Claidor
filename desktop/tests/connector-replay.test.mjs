/**
 * "Just to verify you got the right gmail, what's the address?" cost about
 * twenty model calls and ended in "the account details lookup isn't
 * responding" (OpenAI log, 2 October 2026). Notion did the same.
 *
 * Replayed offline through the real Agent loop (the one a product turn runs,
 * tests/fixtures/simeon-agent-loop-entry.ts) with the real connector tools and
 * a fake model that behaves the way GPT-6 Sol did in that log:
 *
 * - it fills every property it is offered, "" for strings and placeholder
 *   objects for the rest;
 * - it asks for a server's tools as {"server":"gmail","toolName":"","pattern":""};
 * - when a tool name is refused, it guesses another one, the names from the log;
 * - once it has the real list, it calls the profile tool and answers.
 *
 * Every model call is one request to the fake Responses server, so the count
 * of requests is the count of paid calls.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadHarness() {
  const bundleDir = path.join(repoRoot, `.tmp-connector-replay-${randomBytes(4).toString("hex")}`);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "simeon-connector-replay-"));
  const output = path.join(bundleDir, "replay.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/connector-replay-entry.ts")],
    outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent",
    external: ["jsonc-parser"],
    banner: { js: 'import { createRequire as __replayRequire } from "node:module"; const require = __replayRequire(import.meta.url);' },
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir, dispose: async () => { await rm(bundleDir, { recursive: true, force: true }); await rm(dataDir, { recursive: true, force: true }); } };
}

function sse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
function functionCallStream(n, calls) {
  const events = [{ type: "response.created", response: { id: `resp_${n}`, created_at: 1_700_000_001, model: "gpt-6-sol" } }];
  calls.forEach(({ name, args }, index) => {
    const item = { type: "function_call", id: `fc_${n}_${index}`, call_id: `call_${n}_${index}`, name, arguments: "" };
    const text = JSON.stringify(args);
    events.push({ type: "response.output_item.added", output_index: index, item });
    events.push({ type: "response.function_call_arguments.delta", item_id: item.id, output_index: index, delta: text });
    events.push({ type: "response.output_item.done", output_index: index, item: { ...item, arguments: text, status: "completed" } });
  });
  events.push({ type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 4 } } });
  return sse(events);
}
function emptyStream(n) {
  return sse([
    { type: "response.created", response: { id: `resp_${n}`, created_at: 1_700_000_000, model: "gpt-6-sol" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 0 } } },
  ]);
}

// What GPT-6 Sol wrote around every SendMessage in the log.
const FILLER = { url: "", images: [], alt: "", reply_to: "", channel: "", widget: { prompt: "x", helpText: "x", options: [{ label: "x", value: "x", description: "x", style: "default" }], allowCustom: false, dismissOnMoveOn: false }, bcId: "", secret: { label: "x", description: "x", connector: "x", field: "x" } };
const say = (content, final = false) => ({ name: "SendMessage", args: { type: "text", content, ...FILLER, final } });
// The names it tried, in the order of the log.
const GUESSES = ["", "get_profile", "users_get_profile", "", "gmail_get_profile", "getProfile", "", "get_user_profile", "", "", "get_account_info", "list_messages", "gmail.users.getProfile", "", "", "get-profile", "", ""];

function lastToolOutputs(request) {
  const outputs = [];
  for (let index = request.input.length - 1; index >= 0; index--) {
    const item = request.input[index];
    // The loop's reminder rides after tool results; the model reads past it.
    if (item.role === "user" && JSON.stringify(item.content).includes("system_reminder")) continue;
    if (item.type !== "function_call_output") break;
    outputs.unshift(String(item.output));
  }
  return outputs;
}

// The fake GPT-6: decides its next step from what the last tools answered.
function gpt6(requests, state) {
  const outputs = lastToolOutputs(requests.at(-1)).join("\n"); if (process.env.REPLAY_DEBUG) console.log("REQ", requests.length, JSON.stringify(requests.at(-1).input.slice(-3)).slice(0, 600));
  if (requests.length === 1) return [say("I'll verify the connected address."), { name: "GetMcpTools", args: { server: "gmail", toolName: "", pattern: "" } }];
  if (/GMAIL_GET_PROFILE/.test(outputs) && !state.answered) {
    state.answered = true;
    return [say("It's bass@example.com.", true)];
  }
  if (/not found/.test(outputs) && state.guess < GUESSES.length) {
    const toolName = GUESSES[state.guess++];
    return [{ name: "GetMcpTools", args: { server: "gmail", toolName, pattern: "" } }];
  }
  if (/not found/.test(outputs)) return [say("Gmail shows connected, but the account details lookup isn't responding.", true)];
  return [];
}

function gmailTools(m) {
  const tools = ["GMAIL_GET_PROFILE", ...Array.from({ length: 59 }, (_, index) => `GMAIL_TOOL_${index}`)].map((toolName) => new m.McpToolDescriptor({
    toolName,
    description: "Does one Gmail thing through the connected account. ".repeat(6),
    inputSchemaJson: JSON.stringify({ type: "object", properties: { user_id: { type: "string", description: "The user, me by default. ".repeat(10) } } }),
  }));
  return new m.McpMetaToolOptions({ enabled: true, mcpDescriptors: [new m.McpDescriptor({ serverIdentifier: "gmail", serverName: "Gmail", tools })] });
}

async function replay(loaded, question) {
  const { module: m, dataDir } = loaded;
  const requests = [];
  const hostLog = [];
  const sent = [];
  const state = { guess: 0, answered: false };
  m.setHostLogSink((line) => hostLog.push(line));
  m.setSimeonCredentialSource({ getAccessToken: async () => "simeon_da_replay" });
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(init?.body ?? "{}"));
    if (requests.length > 40) throw new Error("runaway: more than forty model calls");
    const calls = gpt6(requests, state);
    return calls.length === 0 ? emptyStream(requests.length) : functionCallStream(requests.length, calls);
  };
  const transport = m.createSandTransport((update) => { if (update.type === "send-message") { sent.push(update.message); return `t1s${sent.length}`; } return undefined; });
  const tools = [
    m.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: (message, timestampMs) => { transport.onUpdate({ type: "send-message", message, timestampMs }); return transport.lastSentMessageId(); } }),
    m.createGetMcpToolsTool(gmailTools(m)),
  ];
  const ctx = m.createProductionRunnerContext();
  const runContext = await m.createTurnAgentRunContext({
    context: ctx, conversationId: "agent-1", requestId: "req-1",
    inference: { resolvePrivacyMode: () => m.PrivacyMode.NO_STORAGE, createSession: () => { throw new Error("not used"); } },
    onRequestId: () => {}, isSubagentRunner: false, isSilenceAllowed: false, canUseSelfSummary: () => true, cancelThisRun: () => {}, emittedConnectorCards: new Set(),
  });
  const config = m.createSandAgentStaticConfig({
    modelId: "gpt-6-sol", agentTokenLimit: 200_000, conversationId: "agent-1",
    isBoxScopedSubagent: false, isSubagentRunner: false, isSharedRoomRunner: false, sandSendMessageDeliveryOwed: false,
    systemPromptGenerator: () => m.DEFAULT_SAND_SYSTEM_PROMPT,
    toolsGenerator: () => m.ToolSetHandle.fromTools(tools),
  });
  const requestContextExecutor = new m.SandRequestContextExecutor({ resolve: () => ({ osVersion: "test", shell: "sh", timeZone: "UTC", transcriptsFolder: dataDir }), resolveRules: async () => undefined }, false, false);
  const resourceAccessor = new m.CombinedResourceAccessor({ get: (resource) => { throw new Error(`the harness binds no ${String(resource.symbol)}`); } }, [m.resourceEntry(m.requestContextExecutorResource, requestContextExecutor)]);
  const agent = m.createTurnAgentForRun({ config, toolSession: runContext.toolSession, emitUpdate: (update) => transport.onUpdate(update), interactionObservers: {}, privacyMode: runContext.privacyMode, resourceAccessor, blobStore: new m.InMemoryBlobStore(), summarizationSession: runContext.summarizationSession });
  const action = new m.ConversationAction({ action: { case: "userMessageAction", value: new m.UserMessageAction({ userMessage: new m.UserMessage({ text: question, messageId: "u1" }) }) } });
  const start = m.createTurnAgentStreamStart({ agent: { agent }, baseState: new m.ConversationStateStructure({}), action, privacyMode: runContext.privacyMode, mcpTools: [] });
  const [runCtx] = ctx.withCancel();
  await start.startStream(runCtx, undefined, async () => {});
  return { requests, hostLog, sent, state };
}

const env = { previous: {} };
function pin(dataDir) {
  for (const key of ["SAND_DATA_ROOT", "SAND_BACKEND_URL"]) env.previous[key] = process.env[key];
  process.env.SAND_DATA_ROOT = dataDir;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
}
function unpin() { for (const [key, value] of Object.entries(env.previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }

test("'what's my Gmail address?' replayed: the tool list arrives on the first lookup and nothing is guessed", async () => {
  const loaded = await loadHarness();
  const previousFetch = globalThis.fetch;
  try {
    pin(loaded.dataDir);
    const run = await replay(loaded, "just to verify you got the right gmail whats the adress?");
    // In the log this question took about twenty calls and failed.
    console.log(`REPLAY calls=${run.requests.length} guesses=${run.state.guess}`);
    if (process.env.REPLAY_SIZES) { const first = run.requests[0]; const dev = first.input.filter((item) => item.role === "developer" || item.role === "system").map((item) => typeof item.content === "string" ? item.content : JSON.stringify(item.content)).join(""); console.log(`SIZES instructions=${dev.length} tools=${JSON.stringify(first.tools).length} ${first.tools.map((tool) => `${tool.name}:${JSON.stringify(tool).length}`).join(" ")}`); }
    assert.equal(run.state.guess, 0, "no tool name was guessed");
    assert.deepEqual(run.sent.map((message) => message.content), ["I'll verify the connected address.", "It's bass@example.com."]);
    // One call to acknowledge and list the tools, one to answer; the answer is
    // final, so no third call to end the turn.
    assert.equal(run.requests.length, 2, `${run.requests.length} model calls`);
    // Every call of the turn starts with the same bytes and names a cache key,
    // so the provider bills the repeated start at the cached price.
    const [first, second] = run.requests;
    assert.ok(typeof first.prompt_cache_key === "string" && first.prompt_cache_key.length > 0, "a prompt cache key is sent");
    assert.equal(second.prompt_cache_key, first.prompt_cache_key);
    assert.deepEqual(second.input.slice(0, first.input.length), first.input, "the second call repeats the whole first one, unchanged, then adds to it");
    assert.deepEqual(second.tools, first.tools);
    // The filler the model wrote never reaches the chat.
    assert.ok(run.sent.every((message) => message.type === "text" && message.widget === undefined && message.secret === undefined));
  } finally {
    globalThis.fetch = previousFetch;
    unpin();
    await loaded.dispose();
  }
});

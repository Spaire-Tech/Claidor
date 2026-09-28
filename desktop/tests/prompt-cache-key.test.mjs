/**
 * The conversation's prompt cache key on the wire (26 September 2026).
 *
 * Grok Bot's loop puts the conversation id in the context
 * (`packages/agent/index.ts`, `conversationIdKey`) and its inference client
 * sends it on every request (`chat-inference-proto/client.ts`,
 * `InferenceStreamRequest.conversationId`). The claidor executor read the
 * context as `_ctx` and dropped it; on the founder's Mac the first call of
 * each turn then read 0 of ~50,000 tokens from cache. Offline: the executor
 * turns the context's id into OpenAI's `prompt_cache_key`, the same id gives
 * the same key on every step and turn, a call without one sends none, a 400
 * naming the key is retried without it, and the model= line carries the
 * prefix fingerprint.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-prompt-cache-key-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/prompt-cache-key-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function responsesStream(text) {
  const events = [
    { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-5.6-terra" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function drain(result) {
  for await (const _ of result.fullStream) { /* the loop reads the stream */ }
  await result.response;
  await result.extendedUsage.catch(() => undefined);
}

test("every step of a conversation carries one prompt cache key derived from its id", async () => {
  const loaded = await load();
  const previousFetch = globalThis.fetch;
  const previousDataRoot = process.env.SAND_DATA_ROOT;
  const previousBackend = process.env.SAND_BACKEND_URL;
  const requests = [];
  const lines = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    globalThis.fetch = async (_input, init) => { requests.push(JSON.parse(init?.body ?? "{}")); return responsesStream("ok"); };
    const { createProviderPromptSession, setClaidorCredentialSource, claidorPromptCacheKey, conversationIdKey, createContext, setModelCallLog } = loaded.module;
    setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_token" });
    setModelCallLog((line) => lines.push(line));

    const key = claidorPromptCacheKey("agent-1");
    assert.match(key, /^simeon-[0-9a-f]{32}$/);
    assert.equal(claidorPromptCacheKey("agent-1"), key);
    assert.notEqual(claidorPromptCacheKey("agent-2"), key);
    assert.equal(claidorPromptCacheKey(""), undefined);
    assert.equal(claidorPromptCacheKey(undefined), undefined);
    assert.ok(!key.includes("agent-1"), "the id itself never leaves the Mac");

    const session = createProviderPromptSession("claidor");
    const ctx = createContext().with(conversationIdKey, "agent-1");
    const system = { role: "system", content: "You are Simeon." };
    // Two turns, as the loop runs them: a fresh executor per step.
    await drain(session.getExecutor([system, { role: "user", content: "hi" }]).stream(ctx, "inv-1"));
    await drain(session.getExecutor([system, { role: "user", content: "hi" }, { role: "assistant", content: "hey" }, { role: "user", content: "again" }]).stream(ctx, "inv-2"));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].prompt_cache_key, key);
    assert.equal(requests[1].prompt_cache_key, key);

    // A call whose context names no conversation sends no key.
    await drain(session.getExecutor([system, { role: "user", content: "hi" }]).stream(createContext(), "inv-3"));
    assert.equal("prompt_cache_key" in requests[2], false);

    // The model= line says what the cache could match: same system prompt and
    // tools, same hashes; the key's hash when there is one.
    const prefixes = lines.filter((line) => line.includes(" model=")).map((line) => line.match(/ prefix=(\S+)/)?.[1]);
    assert.equal(prefixes.length, 3);
    assert.match(prefixes[0], /^sys:[0-9a-f]{8},tools:[0-9a-f]{8},key:[0-9a-f]{8}$/);
    assert.equal(prefixes[0], prefixes[1]);
    assert.match(prefixes[2], /,key:-$/);
  } finally {
    globalThis.fetch = previousFetch;
    loaded.module.setModelCallLog(null);
    if (previousDataRoot === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = previousDataRoot;
    if (previousBackend === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previousBackend;
    await loaded.dispose();
  }
});

test("a 400 naming prompt_cache_key is retried once without it and the key stays off", async () => {
  const loaded = await load();
  const previousFetch = globalThis.fetch;
  const previousDataRoot = process.env.SAND_DATA_ROOT;
  const previousBackend = process.env.SAND_BACKEND_URL;
  const requests = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      requests.push(body);
      if ("prompt_cache_key" in body) return new Response(JSON.stringify({ error: { message: "Unknown parameter: 'prompt_cache_key'.", param: "prompt_cache_key" } }), { status: 400, headers: { "content-type": "application/json" } });
      return responsesStream("ok");
    };
    const { createProviderPromptSession, setClaidorCredentialSource, conversationIdKey, createContext, resetPromptCacheKeyRefusalForTest } = loaded.module;
    resetPromptCacheKeyRefusalForTest();
    setClaidorCredentialSource({ getAccessToken: async () => "claidor_da_token" });
    const session = createProviderPromptSession("claidor");
    const ctx = createContext().with(conversationIdKey, "agent-1");
    await drain(session.getExecutor([{ role: "user", content: "hi" }]).stream(ctx, "inv-1"));
    assert.equal(requests.length, 2);
    assert.equal("prompt_cache_key" in requests[0], true);
    assert.equal("prompt_cache_key" in requests[1], false);
    await drain(session.getExecutor([{ role: "user", content: "hi" }]).stream(ctx, "inv-2"));
    assert.equal(requests.length, 3, "once refused, the key is not sent again");
    assert.equal("prompt_cache_key" in requests[2], false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDataRoot === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = previousDataRoot;
    if (previousBackend === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previousBackend;
    await loaded.dispose();
  }
});

test("the loop names the conversation in the context the executor reads", async () => {
  const agent = await readFile(path.join(repoRoot, "source/packages/agent/index.ts"), "utf8");
  // The executor reads the same key module the loop imports.
  assert.match(agent, /import \{[^}]*\bconversationIdKey\b[^}]*\} from "\.\/utils\/request-id\.js";/);
  assert.match(agent, /if \(this\.config\.conversationId !== undefined\) ctx = ctx\.with\(conversationIdKey, this\.config\.conversationId\);/);
  const composition = await readFile(path.join(repoRoot, "source/host/runner/turn-agent-composition.ts"), "utf8");
  assert.match(composition, /conversationId: input\.conversationId,/);
  const executor = await readFile(path.join(repoRoot, "source/host/extensions/inference/provider-session.ts"), "utf8");
  assert.match(executor, /claidorPromptCacheKey\(conversationIdFromContext\(ctx\)\)/);
  assert.match(executor, /import \{ conversationIdKey \} from "\.\.\/\.\.\/\.\.\/packages\/agent\/utils\/request-id\.js";/);
});

/**
 * Why each model call was made, on the wire (2 October 2026).
 *
 * The server's usage table recorded the model and the tokens of every call
 * but not what the call was for, so it could say Sol was expensive but not
 * whether routines, agents waking each other or the person's own messages
 * were the cost. Every request to Simeon Labs' proxy now carries
 * `x-simeon-call-reason`, stored in `desktop_usage.reason`. Offline: the word
 * read off a session's flags, a caller's word winning over the
 * summarization flag the safety check and memory share, and the header on
 * the request.
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
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-call-reason-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/prompt-cache-key-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function responsesStream() {
  const events = [
    { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-6-sol" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    { type: "response.output_text.delta", delta: "ok" },
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

test("each session's calls are named by what they are for", async () => {
  const loaded = await load();
  try {
    const { simeonCallReason } = loaded.module;
    assert.equal(simeonCallReason(), "chat");
    assert.equal(simeonCallReason({ hidden: true }), "background");
    assert.equal(simeonCallReason({ hidden: true, callReason: "routine" }), "routine");
    assert.equal(simeonCallReason({ hidden: true, callReason: "agent_wake" }), "agent_wake");
    assert.equal(simeonCallReason({ cheap: true }), "cheap");
    assert.equal(simeonCallReason({ cheap: true, isSummarizationSession: true }), "summary");
    // The safety check and memory run on the summarization session and say so.
    assert.equal(simeonCallReason({ isSummarizationSession: true, callReason: "safety" }), "safety");
    assert.equal(simeonCallReason({ isSummarizationSession: true, callReason: "memory" }), "memory");
    // A helper kind is what it is, whoever started it.
    assert.equal(simeonCallReason({ isComputerUseSubagent: true, callReason: "routine" }), "computer");
    assert.equal(simeonCallReason({ isBrowserUseSubagent: true }), "browser");
    assert.equal(simeonCallReason({ isVideoSubagent: true }), "video");
    // A word the server would not store falls back to the flags.
    assert.equal(simeonCallReason({ hidden: true, callReason: "Not A Reason" }), "background");
  } finally {
    await loaded.dispose();
  }
});

test("every request to the proxy carries its reason header", async () => {
  const loaded = await load();
  const previousFetch = globalThis.fetch;
  const previousDataRoot = process.env.SAND_DATA_ROOT;
  const previousBackend = process.env.SAND_BACKEND_URL;
  const reasons = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    globalThis.fetch = async (_input, init) => { reasons.push(new Headers(init?.headers).get("x-simeon-call-reason")); return responsesStream(); };
    const { createProviderPromptSession, setSimeonCredentialSource, createContext, runRoutedProviderText } = loaded.module;
    setSimeonCredentialSource({ getAccessToken: async () => "simeon_da_token" });
    const messages = [{ role: "system", content: "You are Simeon." }, { role: "user", content: "hi" }];

    await drain(createProviderPromptSession("simeon").getExecutor(messages).stream(createContext(), "inv-1"));
    await drain(createProviderPromptSession("simeon", { hidden: true, fullStepBudget: true, callReason: "routine" }).getExecutor(messages).stream(createContext(), "inv-2"));
    await drain(createProviderPromptSession("simeon", { cheap: true, isSummarizationSession: true, callReason: "memory" }).getExecutor(messages).stream(createContext(), "inv-3"));
    await runRoutedProviderText("simeon", messages, { cheap: true });
    assert.deepEqual(reasons, ["chat", "routine", "memory", "cheap"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDataRoot === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = previousDataRoot;
    if (previousBackend === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previousBackend;
    await loaded.dispose();
  }
});

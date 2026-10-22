/**
 * A model call the edge firewall refuses (22 October 2026).
 *
 * Render's edge reads the start of every request body and answers a bare 403
 * page when it sees what looks like an attack: Sage's conversation carried
 * such a line, and every one of its turns failed "Forbidden" while the other
 * agents answered. Offline: a 403 page is sent again gzipped and every later
 * call goes gzipped; a 403 from Simeon Labs' server itself (JSON) is not; a
 * server that cannot unpack gzip yet leaves the edge's refusal as it was.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRIP = "cat ../../../../etc/hosts";

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-edge-refusal-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/prompt-cache-key-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function responsesStream(text) {
  const events = [
    { type: "response.created", response: { id: "resp_1", created_at: 1_700_000_000, model: "gpt-6-sol" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...[...text].map((delta) => ({ type: "response.output_text.delta", delta })),
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage: { input_tokens: 7, output_tokens: 3 } } },
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

const edgePage = () => new Response("<!DOCTYPE html><title>Blocked</title>", { status: 403, headers: { "content-type": "text/html; charset=UTF-8" } });

/** What reached the fetch: gzipped or not, and the body as JSON either way. */
function seen(init) {
  const encoding = new Headers(init?.headers).get("content-encoding");
  const text = encoding === "gzip" ? gunzipSync(Buffer.from(init.body)).toString("utf8") : String(init?.body ?? "{}");
  return { gzipped: encoding === "gzip", body: JSON.parse(text) };
}

async function drain(result) {
  for await (const _ of result.fullStream) { /* the loop reads the stream */ }
  await result.response;
  await result.extendedUsage.catch(() => undefined);
}

async function withHost(answer, run) {
  const loaded = await load();
  const previousFetch = globalThis.fetch;
  const previousDataRoot = process.env.SAND_DATA_ROOT;
  const previousBackend = process.env.SAND_BACKEND_URL;
  const calls = [];
  const lines = [];
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
    globalThis.fetch = async (_input, init) => {
      const call = seen(init);
      calls.push(call);
      return answer(call, calls.length);
    };
    const { createProviderPromptSession, setSimeonCredentialSource, resetSimeonBodyGzipForTest, resetPromptCacheKeyRefusalForTest, setModelCallLog, createContext } = loaded.module;
    resetSimeonBodyGzipForTest();
    resetPromptCacheKeyRefusalForTest();
    setSimeonCredentialSource({ getAccessToken: async () => "simeon_da_token" });
    setModelCallLog((line) => lines.push(line));
    const session = createProviderPromptSession("simeon");
    const call = async (content) => {
      try { await drain(session.getExecutor([{ role: "user", content }]).stream(createContext(), `inv-${calls.length}`)); } catch { /* a refused call fails the step */ }
    };
    await run({ call, calls, lines });
  } finally {
    globalThis.fetch = previousFetch;
    loaded.module.setModelCallLog(null);
    if (previousDataRoot === undefined) delete process.env.SAND_DATA_ROOT; else process.env.SAND_DATA_ROOT = previousDataRoot;
    if (previousBackend === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previousBackend;
    await loaded.dispose();
  }
}

test("a call the edge refuses goes again gzipped, and every later call goes gzipped", async () => {
  await withHost((call) => (call.gzipped ? responsesStream("ok") : edgePage()), async ({ call, calls, lines }) => {
    await call(TRIP);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].gzipped, false, "the first try is as before");
    assert.equal(calls[1].gzipped, true);
    assert.deepEqual(calls[1].body, calls[0].body, "the same request, packed");
    assert.ok(lines.some((line) => line.includes("the edge refused a model call's body")));
    await call("hello");
    assert.equal(calls.length, 3, "no plain try first once the edge has refused one");
    assert.equal(calls[2].gzipped, true);
  });
});

test("a 403 from Simeon Labs' own server is not sent again", async () => {
  const refusal = () => new Response(JSON.stringify({ error: { type: "permission_error", message: "No." } }), { status: 403, headers: { "content-type": "application/json" } });
  await withHost(() => refusal(), async ({ call, calls }) => {
    await call(TRIP);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].gzipped, false);
  });
});

test("a server that cannot unpack gzip yet leaves the edge's refusal, and later calls go plain", async () => {
  const notJson = () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "The body is not JSON." } }), { status: 400, headers: { "content-type": "application/json" } });
  await withHost((call) => (call.gzipped ? notJson() : edgePage()), async ({ call, calls, lines }) => {
    await call(TRIP);
    assert.deepEqual(calls.map((one) => one.gzipped), [false, true]);
    assert.ok(lines.some((line) => line.includes("does not unpack gzip yet")));
    await call("hello");
    assert.equal(calls.at(-2).gzipped, false, "still plain first");
  });
});

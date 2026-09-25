/**
 * Models and spend, web search (batch 6, 25 September 2026; ledger F-132,
 * F-133, F-235, F-240, F-241, F-286, F-290, F-291, F-295).
 *
 * Offline: the search service sends a client deadline and carries the
 * server's `searches` count; the escape-hatch turn runs under the hidden
 * budget and the routed text runner spends it; the avatar generator asks
 * for the cheapest quality; the image service passes the server's usage
 * through; the GenerateImage result tells the agent to attach the file;
 * the error action opens Simeon's site; and the web-search tool keeps a
 * cited page's URL beside the answer and names the server's refusal.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(repoRoot, relative), "utf8");

async function loadCapabilityTools() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-spend-batch6-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/extensions/inference/capability-tools.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the search call carries a client deadline and the server's searches count", async () => {
  const loaded = await loadCapabilityTools();
  try {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ answer: "Paris.", documents: [{ url: "https://example.org/paris", title: "Paris", text: "Paris is the capital." }], searches: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const search = loaded.module.createClaidorWebSearchService({ getAccessToken: async () => "claidor_da_x", backendUrl: "https://api.simeonlabs.com", fetch: fetchImpl });
    const answer = await search({}, { searchTerm: "capital of France" });
    assert.equal(answer.answer, "Paris.");
    assert.equal(answer.searches, 0);
    assert.deepEqual(answer.documents, [{ url: "https://example.org/paris", title: "Paris", text: "Paris is the capital." }]);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/desktop/api/proxy/v1/web/search"), calls[0].url);
    assert.ok(calls[0].init.signal instanceof AbortSignal, "a deadline travels with the call");
    assert.equal(loaded.module.WEB_SEARCH_CLIENT_TIMEOUT_MS, 90_000);
  } finally {
    await loaded.dispose();
  }
});

test("the escape-hatch turn runs under the hidden budget and the routed runner spends it", async () => {
  const router = await read("source/node-agent-coordinator/inference-router.ts");
  assert.match(router, /const budget = \{ limit: resolveSandAgentStepCap\(\{ hidden: true \}\), hidden: true, used: 0 \};/);
  assert.match(router, /runRoutedProviderText\(provider, turnMessages, bridge == null \? \{\n\s*budget,/);
  assert.match(router, /: \{ budget, mcpServerUrl: bridge\.url,/);
  const session = await read("source/host/extensions/inference/provider-session.ts");
  assert.match(session, /readonly budget\?: ModelCallBudget;\n\}\): Promise<string> \{/);
  assert.match(session, /if \(options\?\.budget != null\) spendModelCall\(options\.budget\);/);
  assert.match(session, /claidorReasoningEffortForSession\(options\), options\?\.budget\)/);
});

test("the avatar asks for low quality, the image service passes usage through, and the result says to attach the file", async () => {
  const avatar = await read("source/electron-main/adapters/avatar-images.ts");
  assert.match(avatar, /quality: "low",/);
  const service = await read("source/host/extensions/attachments/generate-image-service.ts");
  assert.match(service, /\.\.\.\(generated\.usage === undefined \? \{\} : \{ usage: generated\.usage \}\)/);
  const tool = await read("source/packages/agent/tools/core/generate-image.ts");
  assert.match(tool, /It is not shown to the user on its own: attach it with SendMessage/);
  assert.equal(tool.includes("it is already displayed to the user"), false);
  const runError = await read("source/host/extensions/transcript/agent-run-error.ts");
  assert.match(runError, /export const SIMEON_WEBSITE_ORIGIN = "https:\/\/simeonlabs\.com";/);
  assert.equal(runError.includes("`${CURSOR_WEBSITE_ORIGIN}/pricing`"), false);
});

test("the web-search tool keeps a cited page beside the answer, labels an unsearched answer, and names the server's refusal", async () => {
  const source = await read("source/packages/agent/tools/core/web-search.ts");
  assert.match(source, /readonly searches\?: number;/);
  assert.match(source, /const searched = serviceResult\.searches === undefined \|\| serviceResult\.searches > 0;/);
  assert.match(source, /title: searched \? "Web search results" : "Answer without a web search/);
  assert.equal(source.includes("if (answer !== undefined) continue;"), false, "a page beside an answer is no longer dropped");
  assert.match(source, /const served = typeof error === "object" && error !== null && "status" in error/);
  assert.match(source, /status === 402 \? `The search was refused: \$\{directMessage\} Do not retry it this turn\.`/);
});

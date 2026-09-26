import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The model picker, offline: `getAvailableModels` reads Simeon Labs'
// server's `/desktop/api/models/available` and hands the renderer the same
// `AvailableModelsResponse` it always read. Until 24 September 2026 the Mac
// binding called `AiService/AvailableModels`, which the server never served.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function envelope(data, status = 200) {
  return new Response(JSON.stringify({ code: 0, data }), { status, headers: { "content-type": "application/json" } });
}

// `DesktopModel.available()` in `server/polar/desktop/pricing.py`, one row each.
const SERVER_ROWS = [
  { modelId: "gpt-5.6", modelName: "Terra", provider: "openai", apiFormat: "openai", description: "Every reply you read.", costMultiplier: 0.67, accessible: true, supportsImage: true, supportsVideo: false, supportsThinking: false, supportsToolCalling: true, agenticReady: true, role: "primary", transportApi: "openai-responses", contextWindow: 400000, maxTokens: 128000, explicitContextCache: false },
  { modelId: "gpt-5.6-mini", modelName: "Luna", provider: "openai", apiFormat: "openai", description: "Machinery.", costMultiplier: 0.07, accessible: true, supportsImage: true, supportsVideo: false, supportsThinking: false, supportsToolCalling: true, agenticReady: true, role: "cheap", transportApi: "openai-responses", contextWindow: 400000, maxTokens: 128000, explicitContextCache: false },
  { modelId: "claude-sonnet-4-5", modelName: "Sonnet", provider: "anthropic", apiFormat: "anthropic", description: "When OpenAI is down.", costMultiplier: 1, accessible: true, supportsImage: true, role: "fallback", contextWindow: 200000, maxTokens: 16384 },
  { modelId: "gpt-5.6-pro", modelName: "Astra", provider: "openai", accessible: false, role: "primary" },
  { modelName: "no id" },
];

test("the picker's list comes from /desktop/api/models/available and keeps the proto shape", async () => {
  const loaded = await loadModule("source/electron-main/models/claidor-model-catalog.ts", "claidor-model-catalog");
  const requests = [];
  try {
    const { fetchClaidorAvailableModels } = loaded.module;
    const response = await fetchClaidorAvailableModels({
      getAccessToken: async () => "claidor_da_picker",
      backendUrl: "https://api.simeonlabs.com",
      fetch: async (input, init) => {
        requests.push({ url: typeof input === "string" ? input : input.url, method: init?.method, headers: new Headers(init?.headers) });
        return envelope(SERVER_ROWS);
      },
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.simeonlabs.com/desktop/api/models/available");
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_picker");

    // What the edge serialises for the renderer, exactly as before: proto
    // JSON, so a false `defaultOn` is simply absent, as it always was.
    const json = response.toJson();
    // One row: the primary. Luna is machinery and is not offered (F-120,
    // 26 September 2026: "no one in grok bot choose what model they want").
    assert.deepEqual(json.models.map((model) => model.name), ["gpt-5.6"]);
    assert.deepEqual(json.models.map((model) => model.defaultOn ?? false), [true]);
    assert.deepEqual(response.models.map((model) => model.defaultOn), [true]);
    assert.equal(loaded.module.availableModelFromClaidorRow({ modelId: "x", role: "cheap" }), null);
    const terra = json.models[0];
    assert.equal(terra.clientDisplayName, "Terra");
    assert.equal(terra.serverModelName, "gpt-5.6");
    assert.equal(terra.tagline, "Every reply you read.");
    assert.equal(terra.supportsAgent, true);
    assert.equal(terra.supportsImages, true);
    assert.equal(terra.supportsThinking, false);
    assert.equal(terra.supportsMaxMode, false);
    assert.equal(terra.supportsNonMaxMode, true);
    assert.equal(terra.contextTokenLimit, 400000);
    assert.equal(terra.vendorName, "openai");
    assert.equal(terra.isHidden, false);
    assert.deepEqual(terra.parameterDefinitions ?? [], []);
    assert.deepEqual(terra.variants ?? [], []);
    // The instance itself is the generated class, so field access works too.
    assert.equal(response.models[0].name, "gpt-5.6");
    assert.equal(typeof response.toBinary, "function");
  } finally {
    await loaded.dispose();
  }
});

test("a fallback role, an unavailable row and a row without an id are left off; one default always", async () => {
  const loaded = await loadModule("source/electron-main/models/claidor-model-catalog.ts", "claidor-model-catalog");
  try {
    const { availableModelsResponseFromClaidor, availableModelFromClaidorRow } = loaded.module;
    assert.equal(availableModelFromClaidorRow({ modelId: "x", role: "fallback" }), null);
    assert.equal(availableModelFromClaidorRow({ modelId: "x", accessible: false }), null);
    assert.equal(availableModelFromClaidorRow({ modelId: "x", available: false }), null);

    const noPrimary = availableModelsResponseFromClaidor([{ modelId: "a", role: "cheap" }, { modelId: "b", role: "cheap" }]);
    assert.deepEqual(noPrimary.models, []);

    const twoPrimaries = availableModelsResponseFromClaidor([{ modelId: "a", role: "cheap" }, { modelId: "b", role: "primary" }, { modelId: "c", role: "primary" }]);
    assert.deepEqual(twoPrimaries.models.map((model) => [model.name, model.defaultOn]), [["b", true], ["c", false]]);

    assert.deepEqual(availableModelsResponseFromClaidor(null).toJson(), {});
    assert.deepEqual(availableModelsResponseFromClaidor({ not: "a list" }).toJson(), {});
  } finally {
    await loaded.dispose();
  }
});

test("a refusal from the server is the server's own sentence, and the Mac binding no longer speaks the RPC", async () => {
  const loaded = await loadModule("source/electron-main/models/claidor-model-catalog.ts", "claidor-model-catalog");
  try {
    const { fetchClaidorAvailableModels } = loaded.module;
    await assert.rejects(
      () => fetchClaidorAvailableModels({ getAccessToken: async () => "x", backendUrl: "https://api.simeonlabs.com", fetch: async () => new Response(JSON.stringify({ error: { type: "unauthorized", message: "This desktop session has expired." } }), { status: 401 }) }),
      (error) => { assert.equal(error.name, "ClaidorApiError"); assert.equal(error.status, 401); assert.match(error.message, /expired/); return true; },
    );
    await assert.rejects(
      () => fetchClaidorAvailableModels({ getAccessToken: async () => "x", backendUrl: "https://api.simeonlabs.com", fetch: async () => new Response(JSON.stringify({ code: 40101, message: "Sign in first." }), { status: 200 }) }),
      (error) => { assert.equal(error.name, "ClaidorApiError"); assert.equal(error.message, "Sign in first."); return true; },
    );
    const adapter = await readFile(path.join(repoRoot, "source/electron-main/models/claidor-model-catalog.ts"), "utf8");
    assert.equal(adapter.includes("createSandCursorBackendClient"), false);
    assert.equal(adapter.includes("aiserver_connect"), false);
    const services = await readFile(path.join(repoRoot, "source/electron-main/main-production-services.ts"), "utf8");
    assert.equal(services.includes("fetchSandAvailableModels"), false);
    assert.match(services, /fetchClaidorAvailableModels\(/);
    // The cloud-agent path keeps its RPC; only the Mac binding moved.
    const cloud = await readFile(path.join(repoRoot, "source/electron-main/models/cursor-model-catalog.ts"), "utf8");
    assert.match(cloud, /export async function fetchSandAvailableModels/);
  } finally {
    await loaded.dispose();
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// Phase 4, offline: the four capability doors the agent advertises that
// are not a model turn. Three go to Claidor's proxy (search, pictures,
// dictation). Fetch stays on this machine. No key, no Mac, no live
// provider — a stubbed fetch and the real HTML-to-text path.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("every Claidor door lives under /desktop/api/proxy/v1", async () => {
  const loaded = await loadModule("source/shared/node/cursor-backend/claidor-api.ts", "claidor-api");
  try {
    const { claidorProxyBaseUrl, claidorProxyUrl, CLAIDOR_PROXY_PREFIX } = loaded.module;
    assert.equal(CLAIDOR_PROXY_PREFIX, "desktop/api/proxy/v1");
    assert.equal(claidorProxyBaseUrl("https://api.claidor.com"), "https://api.claidor.com/desktop/api/proxy/v1");
    assert.equal(claidorProxyBaseUrl("https://api.claidor.com/"), "https://api.claidor.com/desktop/api/proxy/v1");
    assert.equal(claidorProxyUrl("web/search", "https://api.claidor.com"), "https://api.claidor.com/desktop/api/proxy/v1/web/search");
    assert.equal(claidorProxyUrl("/images/generations", "https://api.claidor.com/"), "https://api.claidor.com/desktop/api/proxy/v1/images/generations");
    assert.equal(claidorProxyUrl("audio/transcriptions", "https://api.claidor.com"), "https://api.claidor.com/desktop/api/proxy/v1/audio/transcriptions");
  } finally {
    await loaded.dispose();
  }
});

test("web search speaks Claidor's door and keeps the tool's answer shape", async () => {
  const loaded = await loadModule("source/host/extensions/inference/capability-tools.ts", "capability-tools");
  const requests = [];
  try {
    const search = loaded.module.createClaidorWebSearchService({
      getAccessToken: async () => "claidor_da_search",
      backendUrl: "https://api.claidor.com",
      fetch: async (input, init) => {
        requests.push({ url: typeof input === "string" ? input : input.url, headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? "{}") });
        return jsonResponse({
          answer: "Paris is the capital of France.",
          documents: [
            { url: "https://en.wikipedia.org/wiki/Paris", title: "Paris", text: "capital and largest city" },
            { url: "https://example.com/drop-me" },
            { title: "no url" },
          ],
        });
      },
    });
    const result = await search({}, { searchTerm: "capital of France", explanation: "need a city" });
    assert.equal(result.answer, "Paris is the capital of France.");
    assert.deepEqual(result.documents, [{ url: "https://en.wikipedia.org/wiki/Paris", title: "Paris", text: "capital and largest city" }, { url: "https://example.com/drop-me", title: "", text: "" }]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.claidor.com/desktop/api/proxy/v1/web/search");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_search");
    assert.deepEqual(requests[0].body, { query: "capital of France", explanation: "need a city" });
  } finally {
    await loaded.dispose();
  }
});

test("web fetch reads the page on this machine and never calls Claidor", async () => {
  const loaded = await loadModule("source/shared/node/web-fetch.ts", "web-fetch");
  try {
    const { htmlToText, fetchWebPage, WEB_FETCH_USER_AGENT } = loaded.module;
    assert.equal(
      htmlToText('<html><head><title>Hello</title><script>alert(1)</script></head><body><h1>Hi</h1><p>See <a href="/about">about</a>.</p></body></html>', "https://example.com/page"),
      "Hello\n\n# Hi\n\nSee [about](https://example.com/about) .",
    );
    assert.equal(htmlToText("a &amp; b &#x3C; c"), "a & b < c");

    const seen = [];
    const page = await fetchWebPage("https://example.com/docs", {
      fetch: async (input, init) => {
        seen.push({ url: String(input), headers: new Headers(init?.headers) });
        return new Response('<html><head><title>Docs</title></head><body><p>Readable.</p></body></html>', { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      },
    });
    assert.deepEqual(page, { content: "Docs\n\nReadable." });
    assert.equal(seen[0].url, "https://example.com/docs");
    assert.equal(seen[0].headers.get("user-agent"), WEB_FETCH_USER_AGENT);
    assert.match(seen[0].headers.get("user-agent"), /Caisra/);
    assert.equal(seen[0].headers.get("authorization"), null);

    assert.deepEqual(await fetchWebPage("file:///etc/passwd"), { error: "Only http and https addresses can be fetched (got file:)." });
    assert.deepEqual(await fetchWebPage("not a url"), { error: `"not a url" is not a URL.` });
    const refused = await fetchWebPage("https://example.com/gone", { fetch: async () => new Response("", { status: 404, statusText: "Not Found" }) });
    assert.equal(refused.error, "example.com answered 404 Not Found.");
    const binary = await fetchWebPage("https://example.com/pic.png", { fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }) });
    assert.equal(binary.error, "example.com returned image/png, which is not text.");
  } finally {
    await loaded.dispose();
  }
});

test("image generation posts to Claidor and maps a 402 to the tool's restricted error", async () => {
  const loaded = await loadModule("source/shared/node/cursor-backend/claidor-generate-image.ts", "claidor-generate-image");
  const requests = [];
  try {
    const { createClaidorGenerateImageService, imageSizeForAspectRatio, SandGenerateImageModelRestrictedError } = loaded.module;
    assert.equal(imageSizeForAspectRatio("16:9"), "1536x1024");
    assert.equal(imageSizeForAspectRatio("9:16"), "1024x1536");
    assert.equal(imageSizeForAspectRatio("1:1"), "1024x1024");
    assert.equal(imageSizeForAspectRatio(), "auto");

    const generate = createClaidorGenerateImageService({
      getAccessToken: async () => "claidor_da_img",
      backendUrl: "https://api.claidor.com",
      fetch: async (input, init) => {
        requests.push({ url: typeof input === "string" ? input : input.url, headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? "{}") });
        return jsonResponse({ data: [{ b64_json: Buffer.from("png").toString("base64"), mime_type: "image/png" }] });
      },
    });
    const picture = await generate({}, "a red boat", [{ data: "abc", mimeType: "image/png" }], "16:9");
    assert.equal(picture.imageData, Buffer.from("png").toString("base64"));
    assert.equal(picture.mimeType, "image/png");
    assert.equal(requests[0].url, "https://api.claidor.com/desktop/api/proxy/v1/images/generations");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_img");
    assert.deepEqual(requests[0].body, {
      prompt: "a red boat",
      size: "1536x1024",
      quality: "auto",
      reference_images: [{ data: "abc", mime_type: "image/png" }],
    });

    const restricted = createClaidorGenerateImageService({
      getAccessToken: async () => "claidor_da_img",
      backendUrl: "https://api.claidor.com",
      fetch: async () => jsonResponse({ error: { type: "insufficient_quota", message: "Allowance exhausted." } }, 402),
    });
    await assert.rejects(() => restricted({}, "anything"), (error) => {
      assert.equal(error.name, "SandGenerateImageModelRestrictedError");
      assert.equal(error instanceof SandGenerateImageModelRestrictedError, true);
      assert.match(error.message, /Allowance exhausted/);
      return true;
    });
  } finally {
    await loaded.dispose();
  }
});

test("transcription posts the clip as multipart and never talks protobuf", async () => {
  const loaded = await loadModule("source/electron-main/account/claidor-transcribe.ts", "claidor-transcribe");
  const requests = [];
  try {
    const { SandTranscriptionManager, SandTranscribeEmptyAudioError } = loaded.module;
    const manager = new SandTranscriptionManager({
      getAccessToken: async () => "claidor_da_voice",
      backendUrl: "https://api.claidor.com",
      fetch: async (input, init) => {
        const body = init?.body;
        assert.ok(body instanceof FormData);
        const file = body.get("file");
        requests.push({
          url: typeof input === "string" ? input : input.url,
          headers: new Headers(init?.headers),
          language: body.get("language"),
          filename: file instanceof File ? file.name : null,
          mime: file instanceof Blob ? file.type : null,
          bytes: file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null,
        });
        return jsonResponse({ text: "hello there", seconds: 1.5 });
      },
    });
    const empty = new SandTranscriptionManager({ getAccessToken: async () => "x", fetch: async () => { throw new Error("must not fetch"); } });
    await assert.rejects(() => empty.transcribe({ audio: new Uint8Array(), mimeType: "audio/webm" }), SandTranscribeEmptyAudioError);

    const result = await manager.transcribe({ audio: new Uint8Array([1, 2, 3, 4]), mimeType: "audio/webm;codecs=opus", language: "fr-FR" });
    assert.deepEqual(result, { text: "hello there", transcriptionTimeMs: 1500 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.claidor.com/desktop/api/proxy/v1/audio/transcriptions");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_voice");
    assert.equal(requests[0].language, "fr-FR");
    assert.equal(requests[0].filename, "audio.webm");
    assert.equal(requests[0].mime, "audio/webm");
    assert.deepEqual(requests[0].bytes, new Uint8Array([1, 2, 3, 4]));
    assert.match(loaded.module.SandTranscriptionManager.toString() + Object.keys(loaded.module).join(","), /SandTranscriptionManager/);
    const source = await import("node:fs/promises").then((fs) => fs.readFile(path.join(repoRoot, "source/electron-main/account/claidor-transcribe.ts"), "utf8"));
    assert.equal(source.includes("from \"../../packages/proto/generated/aiserver"), false);
    assert.equal(source.includes("TranscribeAudioRequest"), false);
    assert.equal(source.includes("createSandCursorBackendClient"), false);
    assert.match(source, /audio\/transcriptions/);
  } finally {
    await loaded.dispose();
  }
});

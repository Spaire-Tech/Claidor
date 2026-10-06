/**
 * A generated picture reaches the agent as a success (6 October 2026).
 *
 * The founder asked an agent for "a kid playing soccer"; the server drew
 * it, the host saved it, the usage was billed, and the agent answered
 * "the image generator isn't returning an image". The tool is built with
 * no prompt version in production (`turn-toolset.ts`, the generateImage
 * fallback), so it renders as "latest", and that branch read the empty
 * bytes Simeon's service answers beside the saved path as a failure.
 *
 * Offline: the tool as production builds it, rendering the result the
 * host's service produces (an absolute path, no bytes), tells the agent
 * to attach the file; a result with neither path nor bytes still fails.
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-generate-image-"));
  const outfile = path.join(dir, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/generate-image-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function productionTool(module) {
  // turn-toolset.ts builds it from the registered service with these three fields and nothing else.
  return module.createGenerateImageTool({
    resourceAccessor: { get: () => undefined },
    generateImageService: async () => ({ filePath: "/home/box/media/kid-playing-soccer.png", imageData: "" }),
    isModelRestricted: false,
  });
}

// The tool's telemetry asks the context for a metrics backend (`packages/metrics`): a silent one here.
const metrics = { increment() {}, record() {}, gauge() {}, histogram() {} };
const ctx = { get: () => metrics, signal: new AbortController().signal, withName: () => ctx, reason: undefined };

function textOf(rendered) {
  if (typeof rendered === "string") return rendered;
  if (rendered && typeof rendered === "object") {
    for (const key of ["text", "content", "value", "result"]) if (typeof rendered[key] === "string") return rendered[key];
    return JSON.stringify(rendered);
  }
  return String(rendered);
}

test("a saved picture with no bytes renders as a success that says to attach the file", async () => {
  const { module, dispose } = await load();
  try {
    const tool = productionTool(module);
    const result = new module.GenerateImageResult({ result: { case: "success", value: new module.GenerateImageSuccess({ filePath: "/home/box/media/kid-playing-soccer.png", imageData: "" }) } });
    const text = textOf(await tool.render(ctx, result, undefined));
    assert.match(text, /Successfully generated image at: \/home\/box\/media\/kid-playing-soccer\.png/);
    assert.match(text, /attach it with SendMessage/);
    assert.doesNotMatch(text, /Failed to generate image/);
  } finally {
    await dispose();
  }
});

test("a result with neither a saved path nor bytes still reads as a failure", async () => {
  const { module, dispose } = await load();
  try {
    const tool = productionTool(module);
    const result = new module.GenerateImageResult({ result: { case: "success", value: new module.GenerateImageSuccess({ filePath: "kid.png", imageData: "" }) } });
    const text = textOf(await tool.render(ctx, result, undefined));
    assert.match(text, /Failed to generate image: no image data returned/);
  } finally {
    await dispose();
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadErrors() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-error-message-"));
  const output = path.join(temporary, "errors.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/shared/errors.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("errorMessage unwraps provider objects instead of printing [object Object]", async () => {
  const loaded = await loadErrors();
  try {
    const { errorMessage, asError } = loaded.module;
    assert.equal(errorMessage({ error: { message: "Invalid schema for Task." } }), "Invalid schema for Task.");
    assert.equal(errorMessage({ message: "[object Object]", error: { message: "OpenAI refused the request." } }), "OpenAI refused the request.");
    assert.equal(
      errorMessage({ responseBody: JSON.stringify({ error: { message: "401 Unauthorized" } }) }),
      "401 Unauthorized",
    );
    assert.equal(errorMessage({ data: { error: { message: "model not found" } } }), "model not found");
    const wrapped = new Error("[object Object]");
    wrapped.cause = { error: { message: "Responses rejected additionalProperties." } };
    assert.equal(errorMessage(wrapped), "Responses rejected additionalProperties.");
    assert.equal(asError({ error: { message: "tool schema is not strict" } }).message, "tool schema is not strict");
    assert.notEqual(String(asError({ error: { message: "readable" } })), "[object Object]");
  } finally {
    await loaded.dispose();
  }
});

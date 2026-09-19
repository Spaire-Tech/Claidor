import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function stream(parts, settled) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        if (part instanceof Error) throw part;
        yield part;
      }
    })(),
    response: settled.response,
    usage: settled.usage,
    extendedUsage: settled.extendedUsage,
    providerMetadata: settled.providerMetadata,
    invocationId: Promise.resolve("turn-1"),
  };
}

function settled(value) {
  return {
    response: Promise.resolve(value),
    usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
    extendedUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, maxTokens: 0 }),
    providerMetadata: Promise.resolve({ model: value.id }),
  };
}

function rejected(error) {
  const fail = Promise.reject(error);
  fail.catch(() => undefined);
  return {
    response: fail,
    usage: fail,
    extendedUsage: fail,
    providerMetadata: fail,
  };
}

test("a Terra TPM refusal still answers on Luna in the same turn", async () => {
  const loaded = await load("source/shared/inference/cheap-rate-limit-fallback.ts", "cheap-fallback");
  try {
    const tpm = new Error(
      "Rate limit reached for gpt-5.6-terra in organization org-test on tokens per minute (TPM): Limit 500000, Used 454422, Requested 46589. Please try again in 121ms.",
    );
    let fallbacks = 0;
    const result = loaded.module.withCheapRateLimitFallback(
      stream([tpm], rejected(tpm)),
      () => {
        fallbacks += 1;
        return stream(
          [{ type: "text-delta", textDelta: "Hey — I'm here." }],
          settled({ id: "gpt-5.6-luna" }),
        );
      },
    );
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    assert.equal(fallbacks, 1);
    assert.deepEqual(parts, [{ type: "text-delta", textDelta: "Hey — I'm here." }]);
    assert.equal((await result.response).id, "gpt-5.6-luna");
    assert.equal((await result.providerMetadata).model, "gpt-5.6-luna");
  } finally {
    await loaded.dispose();
  }
});

test("a non-rate-limit failure does not fall through to Luna", async () => {
  const loaded = await load("source/shared/inference/cheap-rate-limit-fallback.ts", "cheap-fallback-no");
  try {
    const boom = new Error("dashboard unavailable");
    let fallbacks = 0;
    const result = loaded.module.withCheapRateLimitFallback(
      stream([boom], rejected(boom)),
      () => {
        fallbacks += 1;
        return stream([{ type: "text-delta", textDelta: "should not run" }], settled({ id: "gpt-5.6-luna" }));
      },
    );
    const responseFailure = assert.rejects(() => result.response, /dashboard unavailable/);
    await assert.rejects(async () => {
      for await (const _part of result.fullStream) {
        // drain
      }
    }, /dashboard unavailable/);
    assert.equal(fallbacks, 0);
    await responseFailure;
  } finally {
    await loaded.dispose();
  }
});

test("Claidor's Terra executor falls through to Luna on TPM", async () => {
  const providers = await readFile(path.join(repoRoot, "source/host/extensions/inference/provider-session.ts"), "utf8");
  assert.match(providers, /withCheapRateLimitFallback/);
  assert.match(providers, /configuredClaidorCheapModel\(\)/);
  assert.match(providers, /if \(requested === cheap\) return start\(requested\)/);
  assert.match(providers, /withCheapRateLimitFallback\(start\(requested\), \(\) => start\(cheap\)\)/);
});

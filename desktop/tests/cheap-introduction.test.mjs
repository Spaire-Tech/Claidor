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

test("an OpenAI TPM refusal is a rate limit, not a transient retry", async () => {
  const loaded = await load("source/shared/provider-rate-limit.ts", "rate-limit");
  try {
    const { isProviderRateLimitError } = loaded.module;
    assert.equal(
      isProviderRateLimitError(
        "Rate limit reached for gpt-5.6-terra in organization org-test on tokens per minute (TPM): Limit 500000, Used 465216, Requested 35272. Please try again in 558ms.",
      ),
      true,
    );
    assert.equal(isProviderRateLimitError({ error: { message: "429 Too Many Requests" } }), true);
    assert.equal(isProviderRateLimitError(new Error("dashboard unavailable")), false);
  } finally {
    await loaded.dispose();
  }
});

test("first-run kickstart asks Claidor for widgets, not the host inference router", async () => {
  const loaded = await load("source/shared/agents/onboarding.ts", "onboarding");
  try {
    const { SAND_ONBOARDING_KICKSTART_PROMPT, cheapIntroductionMessages, fallbackIntroductionText } = loaded.module;
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /connector card/);
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /question widget/);
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /\[first run\]/);
    const messages = cheapIntroductionMessages({ name: "Bass", description: "helps with the week" });
    assert.equal(messages.some((message) => /SendMessage|question widget|connector card/i.test(message.content)), false);
    assert.equal(fallbackIntroductionText("Bass"), "Hey — I'm Bass. What would you like help with first?");
  } finally {
    await loaded.dispose();
  }
});

test("kickstart introduces over Claidor, not Claude Code", async () => {
  const lifecycle = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts"), "utf8");
  const providers = await readFile(path.join(repoRoot, "source/host/extensions/inference/provider-session.ts"), "utf8");
  const retry = await readFile(path.join(repoRoot, "source/host/runner/transient-stream-error.ts"), "utf8");
  const routing = await readFile(path.join(repoRoot, "source/node-agent-coordinator/inference-router.ts"), "utf8");
  assert.match(lifecycle, /SAND_ONBOARDING_KICKSTART_PROMPT/);
  assert.match(lifecycle, /deliverCheapIntroduction\(session\)/);
  assert.match(lifecycle, /kickstartWithFullRunner\(session, SAND_DISK_SAVER_KICKSTART_PROMPT\)/);
  assert.doesNotMatch(lifecycle, /kickstartWithFullRunner\(session, prompt\)/);
  assert.match(routing, /if \(raw\.length === 0\) return false;/);
  assert.match(providers, /DEFAULT_CLAIDOR_CHEAP_MODEL = "gpt-5\.6-luna"/);
  assert.match(providers, /withCheapRateLimitFallback\(start\(requested\), \(\) => start\(cheap\)\)/);
  assert.match(retry, /isProviderRateLimitError\(error\)\) return false/);
});

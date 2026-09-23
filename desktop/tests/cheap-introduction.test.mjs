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

test("the first-run kickstart prompt asks for a greeting with a question widget and connector cards", async () => {
  const loaded = await load("source/shared/agents/onboarding.ts", "onboarding");
  try {
    const { SAND_ONBOARDING_KICKSTART_PROMPT, cheapIntroductionMessages, fallbackIntroductionText } = loaded.module;
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /connector card/);
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /question widget/);
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /Greet them and get them going/);
    assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /\[first run\]/);
    assert.doesNotMatch(SAND_ONBOARDING_KICKSTART_PROMPT, /two SendMessages/);
    assert.doesNotMatch(SAND_ONBOARDING_KICKSTART_PROMPT, /Never open with a widget/);
    const messages = cheapIntroductionMessages({ name: "Bass", description: "helps with the week" });
    assert.equal(messages.some((message) => /SendMessage|question widget|connector card/i.test(message.content)), false);
    assert.equal(fallbackIntroductionText("Bass"), "Hey — I'm Bass. What would you like help with first?");
    assert.equal(typeof loaded.module.firstHelloText, "undefined");
    assert.equal(typeof loaded.module.withLeadingHello, "undefined");
  } finally {
    await loaded.dispose();
  }
});

test("the first-run intro runs on the full runner, and product turns on the host loop", async () => {
  const lifecycle = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts"), "utf8");
  const providers = await readFile(path.join(repoRoot, "source/host/extensions/inference/provider-session.ts"), "utf8");
  const retry = await readFile(path.join(repoRoot, "source/host/runner/transient-stream-error.ts"), "utf8");
  const routing = await readFile(path.join(repoRoot, "source/node-agent-coordinator/inference-router.ts"), "utf8");
  const shared = await readFile(path.join(repoRoot, "source/shared/inference-router.ts"), "utf8");
  const turnShell = await readFile(path.join(repoRoot, "source/host/runner/turn-run-shell.ts"), "utf8");
  // Grok Bot's own kickstart: the real runner, a hidden turn, the reply nudge,
  // and introductionPending cleared only once something was delivered.
  assert.match(lifecycle, /SAND_ONBOARDING_KICKSTART_PROMPT/);
  assert.match(lifecycle, /runner\.run\(prompt, \{ hidden: true \}\)/);
  assert.match(lifecycle, /ensureHiddenTurnReply\(runner\)/);
  assert.match(lifecycle, /else if \(!result\.aborted && delivered\)\n\s*session\.db\.setIntroductionPending\(false\)/);
  assert.doesNotMatch(lifecycle, /deliverCheapIntroduction/);
  assert.doesNotMatch(lifecycle, /runRoutedProviderText/);
  assert.doesNotMatch(lifecycle, /SEND_MESSAGE_PLAIN_TEXT_RETRY/);
  assert.doesNotMatch(lifecycle, /cheapIntroductionMessages/);
  assert.doesNotMatch(lifecycle, /buildSimeonProductSystemPrompt|withLeadingHello|firstHelloText|CAISRA_USER_REPLY_REMINDER/);
  // That runner speaks Claidor.
  assert.match(turnShell, /const inferenceProvider = "claidor" as const/);
  // Product turns go to the host by default; off is the Mac hatch.
  assert.match(shared, /if \(raw\.length === 0\) return true/);
  assert.match(shared, /return !envFlagDisabled\(raw\)/);
  assert.match(routing, /export \{ SAND_CLAIDOR_FULL_AGENT_ENV, routesClaidorThroughHost \}/);
  assert.match(routing, /SAND_CLAIDOR_FULL_AGENT=off escape hatch/);
  assert.match(providers, /DEFAULT_CLAIDOR_CHEAP_MODEL = "gpt-5\.6-luna"/);
  assert.match(providers, /withCheapRateLimitFallback\(start\(requested\), \(\) => start\(cheap\)\)/);
  assert.match(retry, /isProviderRateLimitError\(error\)\) return false/);
});

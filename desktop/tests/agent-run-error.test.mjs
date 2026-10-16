import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

test("OpenAI account-quota refusals do not send the person to platform.openai.com", async () => {
  const source = await readFile(
    path.join(repoRoot, "source/host/extensions/transcript/agent-run-error.ts"),
    "utf8",
  );
  assert.match(source, /export function simeonFacingProviderError/);
  assert.match(source, /no credits remaining\|insufficient_quota\|platform\\.openai\\.com/);
  assert.match(source, /Claude Code is not installed/);
  assert.match(source, /simeonFacingProviderError\(shown\)/);
  assert.doesNotMatch(source, /Add credits to continue using the API/);
  // Nothing behind Simeon is named to the person (13 October 2026).
  assert.doesNotMatch(source, /OpenAI has no credits left/);
  assert.doesNotMatch(source, /not Claude Code/);
});

test("a model company's refusal reads as Simeon not being available, the plan's own refusals stay", async () => {
  const loaded = await loadModule("source/host/extensions/transcript/agent-run-error.ts", "agent-run-error-plain");
  try {
    const { simeonFacingProviderError, describeAgentRunError } = loaded.module;
    const plain = "Simeon isn't available at the moment. Try again in a little while.";
    assert.equal(simeonFacingProviderError("429 You exceeded your current quota, please check your plan and billing details."), plain);
    assert.equal(simeonFacingProviderError("Your credit balance is too low to access the Anthropic API."), plain);
    assert.equal(simeonFacingProviderError("Gemini request failed (503: overloaded)."), plain);
    assert.equal(simeonFacingProviderError("claude-sonnet is served by anthropic and is not reached through the openai API."), plain);
    assert.equal(simeonFacingProviderError("The step budget ran out (SAND_AGENT_MAX_STEPS)."), plain);
    assert.equal(simeonFacingProviderError("Claude Code is not installed"), "Sign in to Simeon again, then try again.");
    const week = "This week's credits are used (code 40200). They reset on Monday. Upgrade at https://app.simeonlabs.com/billing to keep going now.";
    assert.equal(simeonFacingProviderError(week), week);
    assert.equal(simeonFacingProviderError("The file was too large to attach."), "The file was too large to attach.");
    const described = describeAgentRunError(new Error("insufficient_quota: no credits remaining, see platform.openai.com/settings/organization/billing"));
    assert.equal(described.detail, plain);
  } finally {
    await loaded.dispose();
  }
});

test("an upgrade button opens the billing page on the plan's card", async () => {
  const loaded = await loadModule("source/host/extensions/transcript/agent-run-error.ts", "agent-run-error");
  try {
    const { checkoutDeepControlUrl, mapErrorDetailButtons } = loaded.module;
    assert.equal(checkoutDeepControlUrl({ membershipToUpgradeTo: "pro_plus" }), "https://app.simeonlabs.com/billing?plan=pro&from=app");
    assert.equal(checkoutDeepControlUrl({ membershipToUpgradeTo: "ultra", allowTrial: true }), "https://app.simeonlabs.com/billing?plan=max&from=app&allowTrial=true");
    assert.equal(checkoutDeepControlUrl({}), "https://app.simeonlabs.com/billing?plan=standard&from=app");
    const [choice] = mapErrorDetailButtons([{ label: "Upgrade", action: { case: "upgradeChoice", value: {} } }]);
    assert.deepEqual(choice, { kind: "open-url", label: "Upgrade", url: "https://app.simeonlabs.com/billing?from=app" });
  } finally {
    await loaded.dispose();
  }
});

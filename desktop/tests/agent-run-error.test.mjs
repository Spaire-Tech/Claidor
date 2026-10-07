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
  assert.match(source, /OpenAI has no credits left on Simeon Labs' account/);
  assert.match(source, /Claude Code is not installed/);
  assert.match(source, /Simeon talks to Simeon Labs' server, not Claude Code/);
  assert.match(source, /simeonFacingProviderError\(shown\)/);
  assert.doesNotMatch(source, /Add credits to continue using the API/);
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

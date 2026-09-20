import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("OpenAI account-quota refusals do not send the person to platform.openai.com", async () => {
  const source = await readFile(
    path.join(repoRoot, "source/host/extensions/transcript/agent-run-error.ts"),
    "utf8",
  );
  assert.match(source, /export function claidorFacingProviderError/);
  assert.match(source, /no credits remaining\|insufficient_quota\|platform\\.openai\\.com/);
  assert.match(source, /OpenAI has no credits left on Claidor's account/);
  assert.match(source, /claidorFacingProviderError\(shown\)/);
  assert.doesNotMatch(source, /Add credits to continue using the API/);
});

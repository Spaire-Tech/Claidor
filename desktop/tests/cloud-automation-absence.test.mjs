import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadAbsence() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-automation-absence-"));
  const output = path.join(temporary, "cloud-service-absence.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/extensions/automations/cloud-service-absence.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("unimplemented and missing automation RPCs are treated as an absent cloud service", async () => {
  const loaded = await loadAbsence();
  try {
    const { isAbsentCloudAutomationService } = loaded.module;
    assert.equal(isAbsentCloudAutomationService(Object.assign(new Error("[unimplemented]"), { code: 12 })), true);
    assert.equal(isAbsentCloudAutomationService(Object.assign(new Error("edge/handler-failed: [unimplemented]"), { code: 12 })), true);
    assert.equal(isAbsentCloudAutomationService(Object.assign(new Error("unauthenticated"), { code: 16 })), true);
    assert.equal(isAbsentCloudAutomationService({ status: 404, message: "Not Found" }), true);
    assert.equal(isAbsentCloudAutomationService({ status: 401, message: "Unauthorized" }), true);
    assert.equal(isAbsentCloudAutomationService(new Error("HTTP 501")), true);
    assert.equal(isAbsentCloudAutomationService(new Error("dashboard unavailable")), false);
  } finally {
    await loaded.dispose();
  }
});

test("an absent Automations API keeps routines local and does not raise a tray", async () => {
  const sync = await readFile(path.join(repoRoot, "source/host/extensions/automations/sand-automation-cloud-sync.ts"), "utf8");
  const extension = await readFile(path.join(repoRoot, "source/host/extensions/automations/extension.ts"), "utf8");
  const errors = await readFile(path.join(repoRoot, "source/shared/errors.ts"), "utf8");
  const stream = await readFile(path.join(repoRoot, "source/host/runner/conversation-state.ts"), "utf8");
  const runError = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-run-error.ts"), "utf8");
  assert.match(sync, /if \(this\.cloudServiceAbsent\) return true;/);
  assert.match(sync, /this\.cloudServiceAbsent = true;/);
  assert.match(sync, /if \(this\.cloudServiceAbsent\) \{\n      this\.recordRecovery\(agentId\);\n      return true;/);
  assert.match(extension, /isAbsentCloudAutomationService\(error\)\) return;/);
  assert.doesNotMatch(stream, /new Error\(String\(part\.error\)\)/);
  assert.match(stream, /error = asError\(part\.error\)/);
  assert.match(errors, /export function asError/);
  assert.match(runError, /getBackendErrorDetailMessage\(error\) \?\? errorMessage\(error\)/);
});

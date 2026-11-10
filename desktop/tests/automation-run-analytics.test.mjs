// A routine's run reported through the analytics facade (`withAutomationRunAnalytics`,
// `host/extensions/telemetry/analytics-service.ts`) reaches the telemetry it wraps with
// that telemetry as `this`. Unbound, every run threw "Cannot read properties of
// undefined (reading 'mapped')" once it had run (11 November 2026: a routine run on
// demand by a bot ran, and its caller was told it failed).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-automation-run-analytics-"));
  const outfile = path.join(dir, "analytics.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/extensions/telemetry/analytics-service.ts")],
    outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("a routine's run reaches the wrapped telemetry as itself", async () => {
  const { module, dispose } = await load();
  try {
    const mapped = [];
    class Telemetry {
      mapped(event) { mapped.push(event); }
      reportAutomationRun(report) { this.mapped(report); }
    }
    const events = [];
    const facade = module.withAutomationRunAnalytics(new Telemetry(), {
      trackEvent: (name, properties) => events.push({ name, properties }),
    });
    const report = { conversationId: "nora", automationId: "r1", trigger: "manual", outcome: "ok", isGroup: false };
    assert.doesNotThrow(() => facade.reportAutomationRun(report));
    assert.deepEqual(mapped, [report]);
    assert.equal(events[0].name, "sand.automation.run");
    assert.equal(events[0].properties.trigger, "manual");
  } finally {
    await dispose();
  }
});

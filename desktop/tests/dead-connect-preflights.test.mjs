/**
 * Dead Cursor pre-flights are skipped and struck services say Coming Soon
 * (25 September 2026, design-audit-ledger.md cluster `dead-cursor-services`:
 * F-004/F-123, F-392, F-394, F-396, F-397, F-401, F-403).
 *
 * Every turn used to open with Cursor's GetUserPrivacyMode Connect RPC,
 * every host start prefetched a team-admin policy from Cursor's dashboard,
 * the sharing extension answered "not enabled for your account" for a relay
 * that does not exist, the box published a port for a tunnel the design
 * struck, and the Coming Soon brief still blamed "your team's admin".
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the privacy-mode pre-flight, the team-admin prefetch and the cloud-agent watcher are off unless Connect or cloud agents are served", async () => {
  delete process.env.SAND_CONNECT_SERVED;
  const session = await src("host/extensions/inference/cursor-session.ts");
  assert.match(session, /resolvePrivacyMode: \(\) => isConnectServed\(\) \? resolveSandRunPrivacyMode\(auth\) : Promise\.resolve\(SAND_RUN_PRIVACY_MODE_FALLBACK\)/);
  const { module, dispose } = await load("source/shared/cloud-agents-availability.ts", "availability");
  try {
    assert.equal(module.isConnectServed({}), false);
    assert.equal(module.isConnectServed({ SAND_CONNECT_SERVED: "1" }), true);
  } finally {
    await dispose();
  }
  assert.match(await src("host/extensions/cloud-agents/extension.ts"), /if \(isCloudAgentsServed\(\)\) service\.prefetchTeamAdminPolicy\(\);/);
  assert.match(await src("host/host-runner-composition.ts"), /\.\.\.\(awaitCloudAgent === undefined \|\| !isCloudAgentsServed\(\)\n\s*\? \{\}/);
});

test("the Coming Soon brief no longer blames a team admin, and no string the agent or a person reads says Claidor account", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "system-prompt-brief");
  try {
    assert.doesNotMatch(module.SAND_SYSTEM_PROMPT_CLOUD_AGENTS_DISABLED, /team has disabled|team's admin/);
    assert.match(module.SAND_SYSTEM_PROMPT_CLOUD_AGENTS_DISABLED, /cloud agents are coming soon in Simeon and that repository work waits for them/);
    assert.doesNotMatch(module.SAND_CLOUD_AGENTS_DISABLED_PROMPT_SECTION, /team has disabled/);
  } finally {
    await dispose();
  }
  for (const file of ["host/runner/system-prompt.ts", "host/runner/tools/sand-mcp-management-tools.ts", "shared/grok-bot-tools.ts", "shared/node/mcp/mcp-manager.ts", "electron-main/account/cursor-auth.ts", "host/automations/automation.ts"]) {
    assert.ok(!(await src(file)).includes("Claidor account"), `${file} says Simeon account`);
  }
});

test("sharing is Coming Soon behind a served switch, and the struck tunnel's port is not published", async () => {
  const sharing = await src("host/extensions/cross-user-sharing/extension.ts");
  assert.match(sharing, /SHARING_DISABLED_MESSAGE = "Sharing is coming soon in Simeon\."/);
  assert.match(sharing, /if \(on && !isSharingServed\(\)\) \{[^}]*applyGate\(false\); return; \}/);
  const docker = await src("electron-main/box/local-docker-host-connector.ts");
  assert.doesNotMatch(docker, /8790/);
});

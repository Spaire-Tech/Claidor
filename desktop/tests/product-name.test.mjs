import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Phase 5: nothing a person or the agent can read says Cursor, Grok Bot,
// or Anysphere. Internal identifiers stay. This contract reads the files
// that show, and asserts the plumbing names are still there.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relative) {
  return readFile(path.join(repoRoot, relative), "utf8");
}

test("Settings copy names Claidor and Caisra, not Cursor or Grok Bot", async () => {
  const patch = await read("scripts/lib/router-renderer-patch.mjs");
  const view = await read("frontend/src/recovered/features/settings/overlay/view.tsx");
  const router = await read("frontend/src/recovered/features/settings/overlay/router.ts");
  const panels = await read("frontend/src/recovered/features/settings/overlay/panels.tsx");
  assert.doesNotMatch(patch, /id:"router",label:"Router"/);
  assert.doesNotMatch(view, /id: "router"/);
  const copyStart = patch.indexOf("COMPONENT_SOURCE = String.raw");
  const settingsCopy = patch.slice(copyStart, patch.indexOf("`;", copyStart));
  assert.ok(settingsCopy.length > 1000);
  assert.doesNotMatch(settingsCopy, /Grok Bot/);
  assert.match(router, /DEFAULT_ROUTER_PROVIDER: RouterProviderId = "claidor"/);
  assert.doesNotMatch(router, /signed-in Cursor account/);
  assert.match(panels, /Sign In with Claidor/);
  assert.doesNotMatch(panels, /Sign In with Cursor/);
});

test("sign-in errors name Claidor, not Cursor", async () => {
  const auth = await read("source/electron-main/account/cursor-auth.ts");
  const wiring = await read("source/electron-main/account/cursor-auth-wiring.ts");
  const mcp = await read("source/shared/node/mcp/mcp-manager.ts");
  assert.match(auth, /Sign in to Claidor to run Caisra\./);
  assert.match(auth, /Claidor sign-in expired/);
  assert.match(auth, /another Claidor account/);
  assert.doesNotMatch(auth, /Sign in to Cursor/);
  assert.doesNotMatch(auth, /Cursor sign-in/);
  assert.doesNotMatch(auth, /another Cursor account/);
  assert.match(wiring, /Sign in to Claidor to continue/);
  assert.doesNotMatch(wiring, /Sign in to Cursor to continue/);
  assert.match(mcp, /signed-in Claidor account/);
  assert.doesNotMatch(mcp, /signed-in Cursor account/);
  assert.match(auth, /isAnysphereUser/);
  assert.match(auth, /export interface CursorProfile/);
});

test("the agent's brief names Claidor and Caisra, not Cursor or Grok Bot", async () => {
  const prompt = await read("source/host/runner/system-prompt.ts");
  const appUi = await read("source/host/runner/box-reference-docs.ts");
  const listeners = await read("source/host/runner/tools/listener-connect-cards.ts");
  const plugins = await read("source/host/runner/tools/sand-mcp-management-tools.ts");
  assert.match(prompt, /user's Claidor account \(saved to Caisra settings/);
  assert.doesNotMatch(prompt, /user's Cursor account/);
  assert.doesNotMatch(prompt, /using Cursor directly/);
  assert.doesNotMatch(prompt, /Cursor cloud agent/);
  assert.match(appUi, /Sign In with Claidor/);
  assert.doesNotMatch(appUi, /Sign In with Cursor/);
  assert.match(listeners, /user's Claidor account/);
  assert.match(plugins, /user's Claidor account/);
  assert.match(prompt, /cursor-agent/);
});

test("the shipped renderer is renamed Simeon and its default agent New Agent, by the brand pass", async () => {
  const patch = await read("scripts/lib/router-renderer-patch.mjs");
  assert.match(patch, /\["Grok Bot", "Simeon"\]/);
  assert.match(patch, /\["New Bot", "New Agent"\]/);
  const agents = await read("source/shared/agents/agents.ts");
  assert.match(agents, /SAND_DEFAULT_AGENT_NAME = "New Agent"/);
  assert.match(agents, /LEGACY_SAND_DEFAULT_AGENT_NAME = "New Bot"/);
  const shortcuts = await read("frontend/src/recovered/features/window-chrome/global-keyboard-shortcuts.ts");
  assert.doesNotMatch(shortcuts, /New Bot/);
});

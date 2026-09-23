/** Liquid Glass on the chrome (23 September 2026): a CSS block appended to the pinned stylesheet, once. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the glass block frosts the sidebar, panes, composer, menus, dialogs and pills, and applies once", async () => {
  const { LIQUID_GLASS_CSS, patchOriginalGlassStylesheet } = await import(patchModule);
  const out = patchOriginalGlassStylesheet(":root{--x:1}");
  assert.ok(out.startsWith(":root{--x:1}\n"));
  for (const surface of [".sand-agents-sidebar", ".sand-info-pane", ".sand-prompt-shell", ".sand-new-chat-menu", "[role=dialog].sand-10e981r", ".sand-new-messages-pill", ".sand-computer-top-bar", "html,body,#root{background:transparent!important}", ".sand-1ua6jya{background-color:color-mix(in srgb,var(--cursor-bg-editor) 58%,transparent)!important}"]) {
    assert.ok(LIQUID_GLASS_CSS.includes(surface), `${surface} is glass`);
  }
  assert.match(LIQUID_GLASS_CSS, /--simeon-glass-blur:blur\(24px\) saturate\(1\.6\)/);
  assert.match(LIQUID_GLASS_CSS, /inset 0 1px 0 var\(--simeon-glass-highlight\)/, "the specular top edge");
  assert.doesNotMatch(LIQUID_GLASS_CSS, /sand-message-card|sand-message-prose|sand-mvmkjj|sand-message-hover-actions|sand-reaction-pill/, "messages, their hover actions and reactions are content, not chrome");
  assert.throws(() => patchOriginalGlassStylesheet(out), /already present/);
});

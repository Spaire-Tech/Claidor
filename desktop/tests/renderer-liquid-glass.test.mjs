/** Liquid Glass on the chrome (23 September 2026), the agents sidebar only since 27 September 2026, Messages' near-white frost since 5 October 2026: a CSS block appended to the pinned stylesheet, once. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the glass block is the agents sidebar only, see-through to the Mac's sidebar material, and applies once", async () => {
  const { LIQUID_GLASS_CSS, patchOriginalGlassStylesheet } = await import(patchModule);
  const out = patchOriginalGlassStylesheet(":root{--x:1}");
  assert.ok(out.startsWith(":root{--x:1}\n"));
  // The material of Messages' sidebar (5 October 2026): a near-white frost over a 40 pt blur, no border, a specular inner hairline; the same in the dark.
  assert.match(LIQUID_GLASS_CSS, /\.sand-agents-sidebar\{background:linear-gradient\(180deg,light-dark\(rgba\(255,255,255,\.82\),rgba\(32,32,34,\.76\)\),light-dark\(rgba\(250,251,253,\.74\),rgba\(28,28,30,\.7\)\)\)!important;-webkit-backdrop-filter:blur\(40px\) saturate\(1\.6\)!important;backdrop-filter:blur\(40px\) saturate\(1\.6\)!important;border-right:0!important;box-shadow:inset -\.5px 0 0 light-dark\(/);
  assert.ok(!LIQUID_GLASS_CSS.includes("--simeon-bg-chrome"), "the frost is its own colour, not the chrome's");
  // The page is clear only where the sidebar is, so the window's material shows there and nowhere else.
  assert.ok(LIQUID_GLASS_CSS.includes("html:has(.sand-agents-sidebar),html:has(.sand-agents-sidebar) body,[data-theme]:has(>.sand-agents-sidebar){background-color:transparent!important}"));
  assert.ok(LIQUID_GLASS_CSS.includes(".sand-agents-sidebar~.sand-chat,.sand-agents-sidebar~.sand-info-pane{background-color:var(--sand-bg-base)!important}"));
  for (const surface of [".sand-prompt-shell", ".sand-new-chat-menu", "[role=dialog].sand-10e981r", ".sand-new-messages-pill", ".sand-computer-top-bar", ".sand-chat-header__name"]) {
    assert.ok(!LIQUID_GLASS_CSS.includes(surface), `${surface} is no longer glass`);
  }
  assert.doesNotMatch(LIQUID_GLASS_CSS, /sand-message-card|sand-message-prose|sand-mvmkjj|sand-message-hover-actions|sand-reaction-pill/, "messages, their hover actions and reactions are content, not chrome");
  assert.throws(() => patchOriginalGlassStylesheet(out), /already present/);
});

test("the Mac window is clear with Apple's sidebar material behind it, following the window's focus", async () => {
  const source = await (await import("node:fs/promises")).readFile(path.join(repoRoot, "source/electron-main/window-chrome.ts"), "utf8");
  assert.match(source, /export const MAC_VIBRANT_WINDOW_BACKGROUND = "#00000000";/);
  assert.match(source, /vibrancy: "sidebar",\s*visualEffectState: "followWindow",\s*backgroundColor: MAC_VIBRANT_WINDOW_BACKGROUND,/);
  // main.ts spreads the chrome options after the theme colour, so the Mac's clear background wins.
  const main = await (await import("node:fs/promises")).readFile(path.join(repoRoot, "source/electron-main/main.ts"), "utf8");
  assert.match(main, /backgroundColor,\s*\.\.\.chrome,/);
});

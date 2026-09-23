/** The chat header is the agent's card (23 September 2026): a CSS block appended to the pinned stylesheet. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the header card block hides the divider, centres the identity, enlarges the mark and pins the controls right, once", async () => {
  const { HEADER_CARD_CSS, patchOriginalHeaderStylesheet } = await import(patchModule);
  const out = patchOriginalHeaderStylesheet(":root{--x:1}");
  assert.ok(out.startsWith(":root{--x:1}\n"), "appended, nothing replaced");
  assert.match(HEADER_CARD_CSS, /\.sand-toolbar-divider\{display:none!important\}/);
  assert.match(HEADER_CARD_CSS, /\.sand-chat-header:has\(>\.sand-chat-header__identity-row\)\{justify-content:center!important/);
  assert.match(HEADER_CARD_CSS, /\.sand-chat-header__avatar \.sand-grok-bot-mark\{width:52px!important;height:52px!important\}/);
  assert.match(HEADER_CARD_CSS, /\.sand-chat-header__name\{[^}]*border-radius:999px!important/);
  assert.match(HEADER_CARD_CSS, /\.sand-chat-header__controls\{position:absolute!important;right:0!important/);
  assert.throws(() => patchOriginalHeaderStylesheet(out), /already present/);
});

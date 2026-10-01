/** The person's chat bubble is one flat blue (1 October 2026): the blue in the runtime token and the stylesheet default, no image on the one bubble class, and a readable selection in dark mode. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the user bubble is one flat blue in light and dark, and selection on it reads in dark mode", async () => {
  const { BUBBLE_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT, patchOriginalBubble, patchOriginalBubbleStylesheet, USER_BUBBLE_LIGHT, USER_BUBBLE_DARK, USER_BUBBLE_PAINT_CSS, TITLE_TAG_BLUE_CSS } = await import(patchModule);
  assert.equal(USER_BUBBLE_LIGHT, "#255a93");
  assert.equal(USER_BUBBLE_DARK, "#1f5087");
  const patched = patchOriginalBubble(BUBBLE_REPLACEMENTS.map(([, before]) => before).join(";"));
  assert.match(patched, /Ct\("fill\/bubble-user",El\(\{value:"#255a93",alias:"simeon\/sky-wash"\},\{value:"#1f5087",alias:"simeon\/sky-wash-dark"\}\)\)/);
  const sheet = patchOriginalBubbleStylesheet(`:root{${BUBBLE_CSS_REPLACEMENT[1]}}`);
  assert.ok(sheet.startsWith(":root{--sand-fill-bubble-user:#255a93;}"));
  assert.ok(sheet.endsWith(`${USER_BUBBLE_PAINT_CSS}${TITLE_TAG_BLUE_CSS}`));
  // An agent's title tag reads in the bubble's blue, on the tag and its text span.
  assert.ok(TITLE_TAG_BLUE_CSS.includes(".sand-agent-title-tag:not(#\\#):not(#\\#):not(#\\#),.sand-agent-title-tag *:not(#\\#):not(#\\#):not(#\\#){color:light-dark(#255a93,#8cb8e8)}"));
  assert.ok(TITLE_TAG_BLUE_CSS.includes(".sand-agent-title-tag:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background:none;border-color:transparent;box-shadow:none;padding-inline:0}"), "the title is text, not a pill");
  // The same selector, byte for byte, as the pinned rule that sets the bubble colour.
  assert.ok(USER_BUBBLE_PAINT_CSS.includes(".sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#){background-image:none}"));
  // One simple blue: no gradient, no grain or brush texture ("looks dirty").
  assert.doesNotMatch(USER_BUBBLE_PAINT_CSS, /gradient|feTurbulence|url\(/);
  // Dark mode only: selected text is the bubble's blue on white.
  assert.ok(USER_BUBBLE_PAINT_CSS.includes('[data-theme="cursor-dark"] .sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#) *::selection{background-color:#ffffff;color:#1f5087}'));
  assert.doesNotMatch(USER_BUBBLE_PAINT_CSS, /cursor-light/);
  assert.throws(() => patchOriginalBubbleStylesheet(sheet), /bubble paint block is already present/);
  assert.throws(() => patchOriginalBubble(patched), /user-bubble-blue anchor is missing or ambiguous/);
});

test("the pinned 0.18.0 renderer carries the bubble token and the stylesheet default exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { BUBBLE_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of BUBBLE_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
  const css = await readFile(path.join(assets, names.find((name) => name.endsWith(".css"))), "utf8");
  assert.equal(css.split(BUBBLE_CSS_REPLACEMENT[1]).length - 1, 1, "one stylesheet default");
  assert.equal(css.split(".sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#){background-color:var(--sand-fill-bubble-user)}").length - 1, 1, "one rule paints the bubble");
  assert.equal(chunk.split("sand-mvmkjj").length - 1, 1, "the bubble class belongs to the user message style alone");
});

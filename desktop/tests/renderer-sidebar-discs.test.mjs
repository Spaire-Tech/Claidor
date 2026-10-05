/**
 * The sidebar's round glass discs (5 October 2026, the founder): search and
 * create in the header in place of the plus and the search bar, the same two
 * at the foot of the rail while the pane is open, the account initials as a
 * disc, the pane's tabs as discs, and the pane open at its widest by default.
 *
 * Offline: the replacements apply once each to a source carrying every
 * anchor, the header and the rail hand `onOpenSearch` through, the search bar
 * is gone, and every fallback for the pane's width is the widest. With a
 * pinned renderer on disk: every anchor occurs in the chunk exactly once.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the discs patch replaces the plus and the search bar, feeds the rail, and widens the pane's default", async () => {
  const { SIDEBAR_DISCS_REPLACEMENTS, patchOriginalSidebarDiscs, PANE_WIDEST } = await import(patchModule);
  assert.deepEqual(SIDEBAR_DISCS_REPLACEMENTS.map(([label]) => label), [
    "sidebar-discs-components", "sidebar-header-takes-search", "sidebar-header-discs", "sidebar-rail-discs",
    "sidebar-cache-two-more", "sidebar-header-call-search", "sidebar-header-store-search", "sidebar-no-search-bar",
    "sidebar-rail-call-search", "pane-widest-default", "pane-widest-stored-fallback", "pane-widest-legacy-fallback",
    "pane-widest-stored-key-fallback",
  ]);
  assert.equal(PANE_WIDEST, 480);
  // The components anchor (the header's opening) is inside the header's own anchor, so the join carries it once.
  const patched = patchOriginalSidebarDiscs(SIDEBAR_DISCS_REPLACEMENTS.slice(1).map(([, before]) => before).join("\n"));
  // The header: its memo guard learns the search callback and renders the two discs in place of the plus.
  assert.match(patched, /function pcn\(n\)\{const e=he\.c\(14\),\{isSelecting:t,[^}]*onNewChat:h,onOpenSearch:__s\}=n;/);
  assert.match(patched, /\|\|e\[13\]!==__s\)\{/);
  assert.ok(patched.includes('p.jsx(__simeonSidebarDiscs,{onOpenSearch:__s,onNewChat:h})]})}),e[0]=i,'));
  assert.ok(patched.includes("e[12]=y,e[13]=__s}else y=e[12];return y}"));
  assert.ok(!patched.includes('icon:"plus",onClick:h'), "the header's plus is gone");
  // The rail's own new button becomes the same two discs, and the sidebar passes the search callback to both.
  assert.ok(patched.includes('function n0n(n){const{onNewChat:t,onOpenSearch:s}=n;return p.jsx("div",{className:"sand-agents-sidebar__rail-new simeon-rail-discs '));
  assert.ok(patched.includes("function u0n(n){const e=he.c(206),"));
  assert.ok(patched.includes("||e[204]!==V?(yi=p.jsx(pcn,{onOpenSearch:V,"));
  assert.ok(patched.includes("e[126]=yi,e[204]=V):yi=e[126];"));
  assert.ok(patched.includes("||e[205]!==V?(ai=Hn&&!gt?p.jsx(n0n,{onNewChat:F,onOpenSearch:V}):null,"));
  assert.ok(patched.includes("e[176]=ai,e[205]=V):ai=e[176];"));
  // The search bar under the header is not rendered.
  assert.ok(patched.includes("ki=null"));
  assert.ok(!patched.includes("p.jsx(a0n,{onOpenSearch:V})"));
  // The pane's width: every fallback is the widest, the drag limits stay.
  assert.ok(patched.includes("Olt={isOpen:!1,width:ume}"));
  assert.ok(patched.includes("bge(s.width,ume)") && patched.includes("bge(e.infoPaneWidth,ume)"));
  assert.ok(patched.includes("{fallback:ume,min:DQ,max:ume}"));
  assert.ok(!patched.includes("K4e"), "no fallback to the 320 default remains");
  // The components: the founder's compose glyph on the create disc, a magnifier on search, tooltips on both.
  const components = SIDEBAR_DISCS_REPLACEMENTS[0][2];
  assert.ok(components.includes('"create":"<path d=\\"M12 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V12M18.3 3.7a1.9 1.9 0 0 1 2.7 2.7L13 14.4l-3.6.9.9-3.6z\\"/>"'));
  assert.ok(components.includes('"search":"<circle cx=\\"11\\" cy=\\"11\\" r=\\"6.5\\"/><path d=\\"m16 16 4.5 4.5\\"/>"'));
  assert.ok(components.includes('p.jsx(yo,{content:l,children:p.jsx("button",{type:"button","aria-label":l,className:"simeon-disc "+c,onClick:o,'));
  assert.ok(components.includes('onClick:()=>{typeof s=="function"&&s()}'), "search opens the window's search, with no event handed through");
  assert.throws(() => patchOriginalSidebarDiscs(patched), /missing or ambiguous/);
});

test("the discs stylesheet block hides the search bar, draws the discs in both themes, and applies once", async () => {
  const { SIDEBAR_DISCS_CSS, SIDEBAR_DISCS_MARKER, patchOriginalSidebarDiscsStylesheet, styleAnchorClasses } = await import(patchModule);
  const out = patchOriginalSidebarDiscsStylesheet(":root{--x:1}");
  assert.ok(out.startsWith(":root{--x:1}\n"));
  assert.ok(SIDEBAR_DISCS_CSS.startsWith(SIDEBAR_DISCS_MARKER));
  assert.ok(SIDEBAR_DISCS_CSS.includes(".sand-agents-sidebar__search{display:none!important}"));
  assert.match(SIDEBAR_DISCS_CSS, /\.simeon-disc\{display:grid;place-items:center;width:40px;height:40px;[^}]*border-radius:999px;[^}]*backdrop-filter:blur\(14px\) saturate\(1\.6\);/);
  assert.ok(SIDEBAR_DISCS_CSS.includes("light-dark("), "the discs read in the dark too");
  assert.ok(SIDEBAR_DISCS_CSS.includes(".sand-agents-sidebar__header:has(.simeon-disc){height:60px!important;padding-right:12px!important}"));
  assert.ok(SIDEBAR_DISCS_CSS.includes(".simeon-rail-discs{gap:10px!important;padding-bottom:10px!important}"));
  assert.ok(SIDEBAR_DISCS_CSS.includes(".sand-agents-sidebar__account .sand-kit-base-avatar{width:40px!important;height:40px!important;border-radius:999px!important;"));
  assert.deepEqual(styleAnchorClasses(SIDEBAR_DISCS_CSS).filter((name) => name.startsWith("sand-")), [
    "sand-agents-sidebar__account", "sand-agents-sidebar__header", "sand-agents-sidebar__new-actions", "sand-agents-sidebar__search", "sand-kit-base-avatar", "sand-prompt-attach",
  ]);
  assert.ok(SIDEBAR_DISCS_CSS.includes(".sand-prompt-attach{width:30px!important;height:30px!important;border-radius:999px!important;"), "the composer's attach button is the same disc at its own size");
  assert.throws(() => patchOriginalSidebarDiscsStylesheet(out), /already present/);
});

test("the apply pass runs the discs patch on the mark chunk and the stylesheet, and records it", async () => {
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(source, /const markPatched = patchOriginalSidebarDiscs\(patchOriginalCooStep\(/);
  assert.match(source, /const stylesheetPatched = patchOriginalSidebarDiscsStylesheet\(patchOriginalCooStylesheet\(/);
  assert.match(source, /if \(!SIDEBAR_DISCS_REPLACEMENTS\.every\(\(\[, before\]\) => markChunks\[0\]\.source\.includes\(before\)\)\) throw new Error/);
  assert.match(source, /sidebarDiscs: countStyleAnchors\(styleAnchorClasses\(SIDEBAR_DISCS_CSS\)\.filter\(\(name\) => name\.startsWith\("sand-"\)\)/);
  assert.match(source, /\.\.\.SIDEBAR_DISCS_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT\]\.map\(\(\[label\]\) => label\), "chat-header-card", "liquid-glass-chrome", "sidebar-discs",/);
  assert.match(source, /"sidebar-glass-discs", "pane-widest-default", "pane-three-tabs"\]/);
});

test("the pinned 0.18.0 renderer carries every discs anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { SIDEBAR_DISCS_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of SIDEBAR_DISCS_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
});

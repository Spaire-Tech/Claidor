/** The agent's pane is one page (1 October 2026): avatar, name and title, then Profile · Routines · Computer over the window's own views (the Channels tab went on 5 October 2026); no gear, no computer button in the chat header. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the pane patch admits a routines view, opens on Profile, and draws the segmented page", async () => {
  const { AGENT_PANE_REPLACEMENTS, patchOriginalAgentPane } = await import(patchModule);
  const labels = AGENT_PANE_REPLACEMENTS.map(([label]) => label);
  assert.deepEqual(labels, [
    "agent-pane-components", "agent-pane-routines-view", "agent-pane-opens-on-profile", "agent-pane-routine-request",
    "agent-pane-routine-editor", "agent-pane-no-subpage-title", "agent-pane-no-gear", "agent-pane-close-x",
    "agent-pane-avatar-toggles", "agent-pane-no-computer-button", "agent-pane-one-page",
    "agent-pane-compacts-sidebar", "agent-pane-fits-beside-the-rail", "agent-pane-grows-beside-the-rail",
  ]);
  const patched = patchOriginalAgentPane(AGENT_PANE_REPLACEMENTS.map(([, before]) => before).join("\n"));
  assert.match(patched, /e==="routines"\|\|/, "the view guard admits routines");
  assert.match(patched, /\[P,J\]=S\.useState\("settings"\)/, "the pane opens on Profile");
  assert.match(patched, /J\(r\.automationId!=null\?"routines":r\.section\?\?"overview"\)/, "a routine request lands on Routines");
  assert.match(patched, /ne=!1\?p\.jsx\(yo,\{content:iSn/, "the chat header draws no computer button");
  assert.match(patched, /n\.isOpen\?"close":"open-settings"/, "the header avatar toggles the pane");
  assert.match(patched, /p\.jsx\(__simeonPaneSegments,\{value:F,onChange:J\}\)/);
  for (const view of ['F==="settings"?p.jsx(h3n,', 'F==="routines"?', 'F==="overview"?', 'F==="channels"?p.jsx(_0n,']) assert.ok(patched.includes(view), view);
  assert.ok(!patched.includes("Connected"), "no connection status under the name");
  // The sidebar steps back to its rail while the pane is open, the same way ⌘B draws it (WFe), and
  // comes back when the pane closes only if the pane took it.
  assert.ok(patched.includes('if(L){__simeonSetPaneTookSidebar(!__sb.isCollapsed);__sb.isCollapsed||s.set(__to(!0))}else{__simeonPaneTookSidebar&&__sb.isCollapsed&&s.set(__to(!1));__simeonSetPaneTookSidebar(!1)}'));
  assert.ok(patched.includes('__to=c=>__sh!=null?WFe(__sh,__sb,c,window.innerWidth):{...__sb,isCollapsed:c}'));
  assert.ok(patched.includes("uan({windowWidth:window.innerWidth,sidebar:{...m,isCollapsed:!0},paneWidth:u})"), "the pane's fit is reckoned beside the rail");
  assert.ok(patched.includes("G=dan({windowWidth:H,sidebar:{...m,isCollapsed:!0},paneWidth:u})"), "the window grows only for the rail");
  assert.throws(() => patchOriginalAgentPane(patched), /anchor is missing or ambiguous/);
});

test("the pane remembers across launches whether it took the sidebar", async () => {
  const { AGENT_PANE_REPLACEMENTS } = await import(patchModule);
  const source = AGENT_PANE_REPLACEMENTS[0][2];
  const store = new Map();
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const run = () => new Function("localStorage", "p", "yo", "S", `${source.slice(0, source.indexOf("function __simeonPaneSegments"))}function p3n(){};return { took: () => __simeonPaneTookSidebar, set: __simeonSetPaneTookSidebar };`)(localStorage, {}, {}, {});
  const first = run();
  assert.equal(first.took(), false);
  first.set(true);
  assert.equal(store.get("simeon.paneTookSidebar"), "1");
  assert.equal(run().took(), true, "a relaunch reads it back");
  const broken = new Function("localStorage", `${source.slice(0, source.indexOf("function __simeonPaneSegments"))};return __simeonPaneTookSidebar;`)({ getItem() { throw new Error("blocked"); } });
  assert.equal(broken, false, "storage that throws reads as not taken");
});

test("the segments read Profile, Routines and Computer, as glass discs, and no Channels tab (5 October 2026)", async () => {
  const { AGENT_PANE_REPLACEMENTS, AGENT_PANE_CSS } = await import(patchModule);
  const components = AGENT_PANE_REPLACEMENTS[0][2];
  assert.match(components, /\[\\"settings\\",\\"Profile\\"\]|\["settings","Profile"\]/);
  assert.match(components, /"routines","Routines"/);
  assert.match(components, /"overview","Computer"/);
  assert.ok(!components.includes("Channels"), "no Channels tab");
  assert.ok(!components.includes("hasChannels"), "the segments take no channels flag");
  assert.ok(!components.includes("simeon-segments__thumb"), "no sliding thumb under round tabs");
  assert.ok(components.includes('className:"simeon-disc simeon-segments__item"'), "each tab is a glass disc");
  assert.ok(!AGENT_PANE_CSS.includes(".simeon-segments__thumb"), "the pane styles no thumb");
  assert.ok(AGENT_PANE_CSS.includes(".simeon-segments .simeon-segments__item[aria-selected=\"true\"]{color:var(--simeon-ink);background:linear-gradient(180deg,light-dark(#ffffff,#6a6a6e)"), "the chosen tab is solid");
});

test("the pane's styles are greys only, and every switch in the window is the main blue", async () => {
  const { AGENT_PANE_CSS, patchOriginalAgentPaneStylesheet, switchBlueCss, USER_BUBBLE_LIGHT, SWITCH_BLUE_DARK } = await import(patchModule);
  assert.ok(AGENT_PANE_CSS.startsWith("/* Simeon: the agent's pane, one page with a segmented control"));
  const colours = AGENT_PANE_CSS.match(/#[0-9a-f]{6}\b/gi) ?? [];
  const neutral = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) <= 12; };
  assert.deepEqual(colours.filter((hex) => !neutral(hex)), [], "greys only");
  assert.ok(switchBlueCss().includes(`[role="switch"][aria-checked="true"]:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background-color:light-dark(${USER_BUBBLE_LIGHT},${SWITCH_BLUE_DARK})!important`));
  assert.equal(USER_BUBBLE_LIGHT, "#255a93");
  assert.throws(() => patchOriginalAgentPaneStylesheet(`x\n${AGENT_PANE_CSS}`), /agent pane block is already present/);
});

test("the pinned 0.18.0 renderer carries every pane anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { AGENT_PANE_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of AGENT_PANE_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
});

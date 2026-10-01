/** The agent's pane is one page (1 October 2026): avatar, name and title, then Profile · Routines · Computer · Channels over the window's own views; no gear, no computer button in the chat header. */
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
  ]);
  const patched = patchOriginalAgentPane(AGENT_PANE_REPLACEMENTS.map(([, before]) => before).join("\n"));
  assert.match(patched, /e==="routines"\|\|/, "the view guard admits routines");
  assert.match(patched, /\[P,J\]=S\.useState\("settings"\)/, "the pane opens on Profile");
  assert.match(patched, /J\(r\.automationId!=null\?"routines":r\.section\?\?"overview"\)/, "a routine request lands on Routines");
  assert.match(patched, /ne=!1\?p\.jsx\(yo,\{content:iSn/, "the chat header draws no computer button");
  assert.match(patched, /n\.isOpen\?"close":"open-settings"/, "the header avatar toggles the pane");
  assert.match(patched, /p\.jsx\(__simeonPaneSegments,\{value:F,onChange:J,hasChannels:k\.some\(Ie=>Ie\.id==="channels"\)\}\)/);
  for (const view of ['F==="settings"?p.jsx(h3n,', 'F==="routines"?', 'F==="overview"?', 'F==="channels"?p.jsx(_0n,']) assert.ok(patched.includes(view), view);
  assert.ok(!patched.includes("Connected"), "no connection status under the name");
  assert.throws(() => patchOriginalAgentPane(patched), /anchor is missing or ambiguous/);
});

test("the segments read Profile, Routines, Computer and, where served, Channels", async () => {
  const { AGENT_PANE_REPLACEMENTS } = await import(patchModule);
  const components = AGENT_PANE_REPLACEMENTS[0][2];
  assert.match(components, /\[\\"settings\\",\\"Profile\\"\]|\["settings","Profile"\]/);
  assert.match(components, /"routines","Routines"/);
  assert.match(components, /"overview","Computer"/);
  assert.match(components, /\.\.\.\(h\?\[\["channels","Channels"\]\]:\[\]\)/);
});

test("the pane's styles carry no accent colour", async () => {
  const { AGENT_PANE_CSS, patchOriginalAgentPaneStylesheet } = await import(patchModule);
  assert.ok(AGENT_PANE_CSS.startsWith("/* Simeon: the agent's pane, one page with a segmented control"));
  const colours = AGENT_PANE_CSS.match(/#[0-9a-f]{6}\b/gi) ?? [];
  const neutral = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) <= 12; };
  assert.deepEqual(colours.filter((hex) => !neutral(hex)), [], "greys only");
  assert.match(AGENT_PANE_CSS, /\.sand-info-pane \[role="switch"\]\[aria-checked="true"\]\{background-color:light-dark\(#1d1d1f,#f5f5f7\)!important/);
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

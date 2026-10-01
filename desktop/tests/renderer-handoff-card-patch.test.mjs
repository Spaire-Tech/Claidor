/** The take-over card (1 October 2026): the agent's request to use the computer, drawn the Simeon way with the window's own handlers. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the window's card hands its props to the Simeon card, which keeps every action", async () => {
  const { HANDOFF_REPLACEMENTS, patchOriginalHandoff } = await import(patchModule);
  const [[label, before]] = HANDOFF_REPLACEMENTS;
  assert.equal(label, "handoff-card");
  const patched = patchOriginalHandoff(before);
  assert.ok(patched.includes("function Hbn(n){return p.jsx(__simeonHandoffCard,{...n})}"));
  for (const text of ['"Your turn on the computer"', '"Waiting for you"', '"Take over"', '"I’m done"', '"Skip"', '"Open computer"', "onClick:o", "onClick:hb", "onClick:ds"]) assert.ok(patched.includes(text), text);
  assert.match(patched, /handed_back:"Done",replied:"Answered",dismissed:"Skipped"/);
  assert.throws(() => patchOriginalHandoff(patched), /anchor is missing or ambiguous/);
});

test("the card's Take over is the main blue, on the Messages grey of every card", async () => {
  const { handoffCss, USER_BUBBLE_LIGHT, AGENT_BUBBLE_LIGHT, patchOriginalHandoffStylesheet } = await import(patchModule);
  const css = handoffCss();
  assert.ok(css.includes(`--h-blue:light-dark(${USER_BUBBLE_LIGHT},`));
  assert.ok(css.includes(".simeon-handoff__primary{background:var(--h-blue);color:#ffffff}"));
  assert.ok(css.includes(`background:light-dark(${AGENT_BUBBLE_LIGHT},#2c2c2e)!important`));
  assert.throws(() => patchOriginalHandoffStylesheet(`x\n${css}`), /already present/);
});

test("the pinned 0.18.0 renderer carries the take-over card anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { HANDOFF_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [name, before] of HANDOFF_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${name} occurs once`);
});

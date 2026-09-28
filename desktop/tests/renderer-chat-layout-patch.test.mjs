/**
 * An agent's chat opens as a chat, with the composer docked, even before
 * anything has been said (28 September 2026): a package-time patch over the
 * pinned renderer's "is this chat active" test.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("a chat counts as active whenever an agent is open, so it never draws the empty hero", async () => {
  const { CHAT_LAYOUT_REPLACEMENTS, patchOriginalChatLayout } = await import(patchModule);
  const chunk = CHAT_LAYOUT_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOriginalChatLayout(chunk);
  assert.match(patched, /,z=e!=null\|\|B\|\|D\.isRunning\|\|F\|\|R\|\|q,/);
  assert.throws(() => patchOriginalChatLayout(patched), /chat-active-when-open anchor is missing or ambiguous/);
});

test("the pinned 0.18.0 renderer carries the chat-layout anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { CHAT_LAYOUT_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunkName = names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name));
  const source = await readFile(path.join(assets, chunkName), "utf8");
  for (const [label, before] of CHAT_LAYOUT_REPLACEMENTS) assert.equal(source.split(before).length - 1, 1, `${label} occurs once in ${chunkName}`);
});

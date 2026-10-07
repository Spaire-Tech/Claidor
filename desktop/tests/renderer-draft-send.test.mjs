/**
 * Send and Discard on the email and Slack draft cards (7 October 2026, the
 * founder: "the send email button dont work"). The pinned renderer drew both
 * cards with empty callbacks, so a press never left the window.
 *
 * Offline: the main chunk learns `sendDraft`/`discardDraft` in the window's
 * coordinator table, its domain map and the transcript client, and exports a
 * hook that calls them with the agent the card belongs to; each card calls
 * the hook and hands Send its entry id and the edited fields. With a pinned
 * renderer on disk: every anchor occurs exactly once, the patched files still
 * parse, and the empty callbacks are gone.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the main chunk learns sendDraft and discardDraft and exports the cards' hook", async () => {
  const { DRAFT_SEND_REPLACEMENTS, patchOriginalDraftSend } = await import(patchModule);
  assert.deepEqual(DRAFT_SEND_REPLACEMENTS.map(([label]) => label), ["draft-send-methods", "draft-send-domains", "draft-send-transcript", "draft-send-hook", "draft-send-export"]);
  const patched = patchOriginalDraftSend(DRAFT_SEND_REPLACEMENTS.map(([, before]) => before).join("\n"));
  assert.match(patched, /sendDraft:\{args:"object",reply:"void"\},discardDraft:\{args:"object",reply:"void"\}/);
  assert.match(patched, /sendDraft:"widgets",discardDraft:"widgets"/);
  assert.match(patched, /sendDraft:j=>e\.sendDraft\(j\),discardDraft:j=>e\.discardDraft\(j\)/);
  assert.match(patched, /export\{__simeonDraftActions,/);
  assert.throws(() => patchOriginalDraftSend(patched), /already present/);
});

test("the hook calls the transcript with the card's agent, its entry id and the edited draft", async () => {
  const { DRAFT_SEND_REPLACEMENTS } = await import(patchModule);
  const hookSource = DRAFT_SEND_REPLACEMENTS.find(([label]) => label === "draft-send-hook")[2];
  const calls = [];
  const transcript = { sendDraft: async (args) => { calls.push(["sendDraft", args]); }, discardDraft: async (args) => { calls.push(["discardDraft", args]); } };
  const S = { useRef: (value) => ({ current: value }), useMemo: (build) => build(), useContext: () => ({ agentId: "agent-1" }) };
  const make = new Function("S", "Qe", "_me", `${hookSource};return __simeonDraftActions;`);
  const hook = make(S, () => ({ transcript }), null);
  const actions = hook();
  actions.send("entry-7", { to: ["a@b.c"], subject: "Hi", body: "Edited" });
  actions.discard("entry-8");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [
    ["sendDraft", { agentId: "agent-1", entryId: "entry-7", draft: { to: ["a@b.c"], subject: "Hi", body: "Edited" } }],
    ["discardDraft", { agentId: "agent-1", entryId: "entry-8" }],
  ]);
  // No agent in view (or an older client without the methods): nothing is sent, nothing throws.
  const none = make({ ...S, useContext: () => null }, () => ({ transcript }), null)();
  none.send("entry-9", {});
  const old = make(S, () => ({ transcript: {} }), null)();
  old.send("entry-9", {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
});

test("each draft card calls the hook and passes its entry id; other chunks are untouched", async () => {
  const { DRAFT_CARD_CHUNKS, patchOriginalDraftCard } = await import(patchModule);
  assert.deepEqual(Object.keys(DRAFT_CARD_CHUNKS), ["view-ClhdNXKM.js", "view-DyaeCHiE.js"]);
  for (const [name, replacements] of Object.entries(DRAFT_CARD_CHUNKS)) {
    const patched = patchOriginalDraftCard(replacements.map(([, before]) => before).join("\n"), name);
    assert.match(patched, /__simeonDraftActions as __da/);
    assert.match(patched, /const __d=__da\(\),s=/);
    assert.match(patched, /onDiscard:\(\)=>__d\.discard\(a\.id\),onSend:x=>__d\.send\(a\.id,x\),/);
  }
  assert.equal(patchOriginalDraftCard("const unrelated=1;", "view-other.js"), "const unrelated=1;");
  assert.throws(() => patchOriginalDraftCard("no anchors here", "view-ClhdNXKM.js"), /anchor is missing/);
});

test("the pinned renderer carries every draft anchor once, and the patched files still parse", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { DRAFT_SEND_REPLACEMENTS, DRAFT_CARD_CHUNKS, patchOriginalDraftSend, patchOriginalDraftCard } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const main = await readFile(path.join(assets, "index-UbX-y3il.js"), "utf8");
  for (const [label, before] of DRAFT_SEND_REPLACEMENTS) assert.equal(main.split(before).length - 1, 1, `${label} occurs once`);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "simeon-draft-send-"));
  try {
    const mainPatched = path.join(scratch, "index.mjs");
    await writeFile(mainPatched, patchOriginalDraftSend(main));
    execFileSync(process.execPath, ["--check", mainPatched]);
    for (const name of Object.keys(DRAFT_CARD_CHUNKS)) {
      const source = await readFile(path.join(assets, name), "utf8");
      assert.match(source, /function [A-Za-z]{2}\(\)\{\}function [A-Za-z]{2}\(\)\{\}export\{/, `${name} ships the empty callbacks`);
      const patched = patchOriginalDraftCard(source, name);
      assert.doesNotMatch(patched, /onSend:(qs|Ss),/);
      const file = path.join(scratch, name.replace(/\.js$/, ".mjs"));
      await writeFile(file, patched);
      execFileSync(process.execPath, ["--check", file]);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("the box looks the card up in its own agent's transcript before Send and Discard", async () => {
  const source = await readFile(path.join(repoRoot, "source/host/extensions/transcript/draft-cards.ts"), "utf8");
  const send = source.slice(source.indexOf("async sendDraft("), source.indexOf("async discardDraft("));
  const discard = source.slice(source.indexOf("async discardDraft("), source.indexOf("markDraftDelivered("));
  for (const body of [send, discard]) assert.ok(body.indexOf("ensureActionTarget") >= 0 && body.indexOf("ensureActionTarget") < body.indexOf("this.find("));
});

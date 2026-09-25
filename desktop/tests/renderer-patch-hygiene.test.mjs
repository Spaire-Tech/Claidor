/**
 * The renderer patch measures what it appends (batch 4, cluster 5,
 * 25 September 2026; ledger F-199, F-206, F-209).
 *
 * Offline: the class names the header-card and Liquid Glass blocks rely on
 * are extracted from the CSS and counted against the shipped stylesheet and
 * chunks, with the ones that appear nowhere listed as `missing` (until
 * today the two blocks were appended blind); a Settings transform that
 * returns its input is not recorded as a change, and the record's feature
 * list no longer names the two no-ops; and the gate table records why
 * browserUse stays off and multitask on.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HEADER_CARD_CSS,
  LIQUID_GLASS_CSS,
  countStyleAnchors,
  patchOriginalSettingsPanel,
  styleAnchorClasses,
} from "../scripts/lib/router-renderer-patch.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every class the appended CSS relies on is extracted and counted, and a miss is named", () => {
  const header = styleAnchorClasses(HEADER_CARD_CSS);
  assert.ok(header.includes("sand-toolbar-divider"));
  assert.ok(header.includes("sand-chat-header__identity-row"));
  assert.ok(header.includes("sand-grok-bot-mark"));
  const glass = styleAnchorClasses(LIQUID_GLASS_CSS);
  assert.ok(glass.includes("sand-agents-sidebar"));
  assert.ok(glass.includes("sand-prompt-shell"));
  assert.ok(glass.includes("sand-10e981r"));
  assert.equal(glass.includes("simeon-glass-fill"), false, "custom properties are not class anchors");
  const stylesheet = ".sand-toolbar-divider{height:1px}.sand-agents-sidebar{width:240px}";
  const chunk = 'p.jsx("div",{className:"sand-prompt-shell"})';
  const measured = countStyleAnchors(["sand-toolbar-divider", "sand-agents-sidebar", "sand-prompt-shell", "sand-nowhere"], [stylesheet, chunk]);
  assert.deepEqual(measured.counts, { "sand-toolbar-divider": 1, "sand-agents-sidebar": 1, "sand-prompt-shell": 1, "sand-nowhere": 0 });
  assert.deepEqual(measured.missing, ["sand-nowhere"]);
});

test("the patch records its style anchors and only the chunks a transform changed", async () => {
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(source, /styles: styleAnchors,/);
  assert.match(source, /header: countStyleAnchors\(styleAnchorClasses\(HEADER_CARD_CSS\), \[bubbleSheets\[0\]\.css, \.\.\.chunkSources\]\)/);
  assert.match(source, /if \(patched === candidate\.source\) continue;/);
  assert.equal(patchOriginalSettingsPanel("unchanged panel"), "unchanged panel");
  const record = source.slice(source.indexOf("const record = {"), source.indexOf("const provenancePath"));
  assert.equal(record.includes('"settings-router-provider"'), false);
  assert.equal(record.includes('"usage-current-provider"'), false);
  assert.equal(record.includes('"router-panel"'), false);
  assert.equal(record.includes('"usage-panel"'), false);
  assert.match(record, /features: \["settings-local-docker-vm", "brand-simeon",/);
});

test("the gate table says why browserUse stays off and multitask on", async () => {
  const gates = await readFile(path.join(repoRoot, "source/shared/node/experiments/simeon-gate-defaults.ts"), "utf8");
  assert.match(gates, /`sand_browser_use_subagent` stays at its bundled default, off/);
  assert.match(gates, /`sand_multitask` stays at its bundled default, on/);
  assert.equal(/sand_browser_use_subagent: (true|false)/.test(gates), false, "the table itself does not set it");
});

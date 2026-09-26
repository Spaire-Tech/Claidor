/**
 * The renderer patch record the diagnostic package reads (25 September 2026,
 * ledger F-197 / F-198). `router-renderer-patch.mjs` writes schema 2
 * (`chunks`, `marks`, `files`, `brand`, `features`, `transformations`);
 * until today `verifyChecksumPinnedRendererPackage` accepted only schema 1
 * with five keys and compared every file outside the two Settings chunks
 * against the shipped bytes, so `npm run package:diagnostic` could not pass
 * on a patched renderer. Offline: the validator takes the record shape the
 * patch writes, reads the per-file patched hashes from `files`, refuses a
 * record whose originals drift from the shipped inventory, and still takes
 * schema 1.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readRendererExtensionRecord } from "../scripts/lib/macos-package-verification.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = text => createHash("sha256").update(text).digest("hex");
const entry = text => ({ bytes: Buffer.byteLength(text), sha256: sha(text) });

const shipped = new Map([
  ["assets/registry-abc.js", entry("registry original")],
  ["assets/panel-def.js", entry("panel original")],
  ["assets/marks-ghi.js", entry("marks original")],
  ["assets/index-jkl.css", entry("stylesheet original")],
  ["assets/app-icon-C7NKj2u7.png", entry("icon original")],
]);
const row = (relative, patchedText) => ({ path: `dist/renderer/${relative}`, original: shipped.get(relative), patched: entry(patchedText) });

function schemaTwoRecord() {
  const chunks = [
    { role: "registry", ...row("assets/registry-abc.js", "registry patched") },
    { role: "panel", ...row("assets/panel-def.js", "panel patched") },
  ];
  return {
    schemaVersion: 2,
    mode: "original-renderer-settings-extension",
    chunks,
    marks: { chunk: "dist/renderer/assets/marks-ghi.js" },
    files: [
      ...chunks.map(({ role: _role, ...rest }) => rest),
      row("assets/marks-ghi.js", "marks patched"),
      row("assets/index-jkl.css", "stylesheet patched"),
      row("assets/app-icon-C7NKj2u7.png", "icon patched"),
    ],
    brand: { replacements: [], totals: {}, files: [] },
    features: ["brand-simeon"],
    transformations: ["settings-registry", "router-panel", "marks", "app-icon", "brand-strings"],
  };
}

test("the validator's schema-2 key set is exactly what router-renderer-patch.mjs writes", async () => {
  const patch = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  const record = patch.slice(patch.indexOf("const record = {"), patch.indexOf("const provenancePath"));
  // Keys written `key: value,` and shorthand keys written `key,`.
  const keys = [...record.matchAll(/^\s{4}(\w+)(?::|,$)/gm)].map(match => match[1]).sort();
  assert.deepEqual(keys, ["brand", "chunks", "features", "files", "marks", "mode", "schemaVersion", "transformations"]);
  assert.match(record, /schemaVersion: 2,/);
  // And the validator takes that record.
  const read = readRendererExtensionRecord(schemaTwoRecord(), shipped);
  assert.deepEqual([...read.chunks.keys()], ["assets/registry-abc.js", "assets/panel-def.js"]);
  assert.deepEqual([...read.patched.keys()], [...shipped.keys()]);
  assert.equal(read.patched.get("assets/index-jkl.css").sha256, sha("stylesheet patched"));
});

test("a schema-2 record whose originals drift from the shipped inventory is refused", () => {
  const drifted = schemaTwoRecord();
  drifted.files[3] = { ...drifted.files[3], original: entry("not the shipped stylesheet") };
  assert.throws(() => readRendererExtensionRecord(drifted, shipped), /source identity drift at assets\/index-jkl\.css/);
  const disagreeing = schemaTwoRecord();
  disagreeing.files[0] = { ...disagreeing.files[0], patched: entry("registry patched differently") };
  assert.throws(() => readRendererExtensionRecord(disagreeing, shipped), /chunk and file inventories disagree/);
  const unknown = { ...schemaTwoRecord(), extra: true };
  assert.throws(() => readRendererExtensionRecord(unknown, shipped), /unknown fields/);
  const noFiles = { ...schemaTwoRecord(), files: [] };
  assert.throws(() => readRendererExtensionRecord(noFiles, shipped), /no patched file inventory/);
});

test("a schema-1 record still reads, with the chunks as the only patched files", () => {
  const chunks = [
    { role: "registry", ...row("assets/registry-abc.js", "registry patched") },
    { role: "panel", ...row("assets/panel-def.js", "panel patched") },
  ];
  const read = readRendererExtensionRecord({ schemaVersion: 1, mode: "original-renderer-settings-extension", chunks, features: [], transformations: [] }, shipped);
  assert.deepEqual([...read.patched.keys()], ["assets/registry-abc.js", "assets/panel-def.js"]);
  assert.throws(() => readRendererExtensionRecord({ schemaVersion: 3, mode: "original-renderer-settings-extension", chunks }, shipped), /contract is invalid/);
});

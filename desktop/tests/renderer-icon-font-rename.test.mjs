import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 5 October 2026, the founder: "do the icon font file too". The patch
// renames the pinned window's icon font file from the earlier maker's name
// and records the move under `renames` (schema 3); both verifiers read the
// pinned inventory through that map. Needs the bootstrapped window
// (desktop/src/app/dist/renderer); skipped without it.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinned = path.join(repoRoot, "src/app/dist/renderer");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function walk(root, prefix = "") {
  const out = [];
  for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...await walk(root, relative));
    else out.push(relative);
  }
  return out;
}

test("the patch renames the icon font file, points the stylesheet at it, and the verifiers accept the declared rename", async t => {
  let hasPinned = true;
  try { await readFile(path.join(pinned, "index.html")); } catch { hasPinned = false; }
  if (!hasPinned) { t.skip("no bootstrapped window at src/app/dist/renderer"); return; }
  const stageRoot = await mkdtemp(path.join(os.tmpdir(), "simeon-icon-font-"));
  try {
    await cp(pinned, path.join(stageRoot, "dist/renderer"), { recursive: true });
    const { applyOriginalRendererRouterPatch } = await import("../scripts/lib/router-renderer-patch.mjs");
    const record = await applyOriginalRendererRouterPatch({ stageRoot });
    assert.equal(record.schemaVersion, 3);
    assert.equal(record.renames.length, 1);
    const [move] = record.renames;
    assert.match(move.from, /^dist\/renderer\/assets\/cursor-icons-16-.*\.woff2$/);
    assert.match(move.to, /^dist\/renderer\/assets\/simeon-icons-16-.*\.woff2$/);
    const assets = await readdir(path.join(stageRoot, "dist/renderer/assets"));
    assert.ok(assets.includes(path.basename(move.to)), "the renamed font is on disk");
    assert.ok(!assets.includes(path.basename(move.from)), "the old name is gone");
    const css = assets.filter(name => name.endsWith(".css"));
    const sheet = await readFile(path.join(stageRoot, "dist/renderer/assets", css[0]), "utf8");
    assert.ok(sheet.includes(`./${path.basename(move.to)}`), "the stylesheet loads the font by its new name");
    assert.ok(!sheet.includes("cursor-icons"), "the stylesheet no longer says cursor-icons");
    assert.ok(record.transformations.includes("icon-font-file"));

    // The pinned inventory, as the provenance lists it, read through the record.
    const expectedFiles = new Map();
    for (const relative of await walk(pinned)) {
      const bytes = await readFile(path.join(pinned, relative));
      expectedFiles.set(relative, { path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
    }
    const { readRendererExtensionRecord } = await import("../scripts/lib/macos-package-verification.mjs");
    const read = readRendererExtensionRecord(JSON.parse(await readFile(record.provenancePath, "utf8")), expectedFiles);
    assert.deepEqual([...read.renames.entries()], [[move.from.slice("dist/renderer/".length), move.to.slice("dist/renderer/".length)]]);
    // The packaged inventory the verifier expects is the pinned one with the move applied.
    const packaged = (await walk(path.join(stageRoot, "dist/renderer"))).sort();
    const expectedPackaged = [...expectedFiles.keys()].map(relative => read.renames.get(relative) ?? relative).sort();
    assert.deepEqual(packaged, expectedPackaged);
    // A rename to a path the inventory already has is refused.
    const bad = JSON.parse(await readFile(record.provenancePath, "utf8"));
    bad.renames = [{ from: move.from, to: "dist/renderer/index.html" }];
    assert.throws(() => readRendererExtensionRecord(bad, expectedFiles), /rename provenance is invalid/);
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
});

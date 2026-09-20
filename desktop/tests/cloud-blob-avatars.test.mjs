import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the 19 cloud blobs are a stored random pick, not a hash of the bot id", async () => {
  const loaded = await load("source/shared/agent/cloud-blobs.ts", "cloud-blobs");
  try {
    const {
      CLOUD_BLOB_COLORS,
      CLOUD_BLOB_SHAPE,
      assignedCloudBlobFields,
      isCloudBlobColor,
      pickRandomCloudBlobColor,
      resolveCloudBlobColor,
    } = loaded.module;

    assert.equal(CLOUD_BLOB_COLORS.length, 19);
    assert.equal(new Set(CLOUD_BLOB_COLORS.map((color) => color.id)).size, 19);
    assert.equal(CLOUD_BLOB_SHAPE, "cloud");

    const kept = assignedCloudBlobFields("sage");
    assert.deepEqual(kept, { avatarShape: "cloud", avatarColor: "sage" });

    const ignoredLegacy = assignedCloudBlobFields("blue");
    assert.equal(ignoredLegacy.avatarShape, "cloud");
    assert.equal(isCloudBlobColor(ignoredLegacy.avatarColor), true);
    assert.notEqual(ignoredLegacy.avatarColor, "blue");

    const first = pickRandomCloudBlobColor(() => 0);
    const last = pickRandomCloudBlobColor(() => 0.999);
    assert.equal(first, "mist");
    assert.equal(last, "blush");
    assert.notEqual(first, last);

    const hashed = resolveCloudBlobColor("agent-a");
    assert.equal(isCloudBlobColor(hashed), true);
    assert.equal(resolveCloudBlobColor("agent-a", "peach"), "peach");
    assert.equal(resolveCloudBlobColor("agent-a"), hashed);
  } finally {
    await loaded.dispose();
  }
});

test("new bots and the editor share the 19-cloud palette", async () => {
  const materialization = await readFile(
    path.join(repoRoot, "source/host/extensions/session/session-materialization.ts"),
    "utf8",
  );
  const localSession = await readFile(
    path.join(repoRoot, "source/host/extensions/session/agent-session.ts"),
    "utf8",
  );
  const character = await readFile(
    path.join(repoRoot, "frontend/src/recovered/features/onboarding/signed-in/character.tsx"),
    "utf8",
  );
  const editor = await readFile(
    path.join(repoRoot, "frontend/src/recovered/features/agent-info/avatar-editor/view.tsx"),
    "utf8",
  );

  assert.match(materialization, /assignedCloudBlobFields\(profile\?\.avatarColor\)/);
  assert.match(localSession, /assignedCloudBlobFields\(profile\.avatarColor\)/);
  assert.match(character, /CLOUD_BLOB_SHAPE/);
  assert.match(character, /CloudEye/);
  assert.match(editor, /gridTemplateColumns: "repeat\(5, minmax\(0, 1fr\)\)"/);
  assert.doesNotMatch(editor, /Character shape/);
});

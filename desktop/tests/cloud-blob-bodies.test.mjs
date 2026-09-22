import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bodyDir = path.join(repoRoot, "source/shared/agent/cloud-blob-bodies");

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
    loader: { ".png": "dataurl" },
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
    assert.equal(resolveCloudBlobColor("agent-a", "blue"), "sky");
    assert.equal(resolveCloudBlobColor("agent-a", "light-dark(#2A92FE, #0E74E0)"), "sky");
  } finally {
    await loaded.dispose();
  }
});

test("each of the 19 designed bodies is the cut PNG with animated eyes composited on top", async () => {
  const [bodies, face] = await Promise.all([
    load("source/shared/agent/cloud-blob-bodies.ts", "cloud-blob-bodies"),
    load("source/shared/agent/cloud-blob-face.ts", "cloud-blob-face"),
  ]);
  try {
    const files = (await readdir(bodyDir)).filter((name) => name.endsWith(".png")).toSorted();
    assert.deepEqual(files, [
      "apricot.png",
      "blush.png",
      "chartreuse.png",
      "cream.png",
      "fog.png",
      "iris.png",
      "lilac.png",
      "mauve.png",
      "meadow.png",
      "mist.png",
      "peach.png",
      "periwinkle.png",
      "sage.png",
      "sea.png",
      "sky.png",
      "slate.png",
      "steel.png",
      "tangerine.png",
      "violet.png",
    ]);

    const { CLOUD_BLOB_BODIES, CLOUD_BLOB_BODY_SIZE } = bodies.module;
    assert.equal(CLOUD_BLOB_BODY_SIZE, 336);
    assert.equal(Object.keys(CLOUD_BLOB_BODIES).length, 19);
    for (const [id, dataUrl] of Object.entries(CLOUD_BLOB_BODIES)) {
      assert.match(dataUrl, /^data:image\/png;base64,/);
      const file = await readFile(path.join(bodyDir, `${id}.png`));
      assert.equal(dataUrl, `data:image/png;base64,${file.toString("base64")}`);
      assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    }

    const { cloudBlobSvgMarkup, CLOUD_BLOB_EYES } = face.module;
    const markup = cloudBlobSvgMarkup({ id: "face", agentId: "agent-bass", color: "mist" });
    assert.match(markup, /class="caisra-cloud-blob__body"/);
    assert.match(markup, /href="data:image\/png;base64,/);
    assert.match(markup, /data-eye="left"/);
    assert.match(markup, /data-eye="right"/);
    assert.match(markup, /caisra-cloud-blob__pupil/);
    assert.doesNotMatch(markup, /linearGradient/);
    assert.equal(CLOUD_BLOB_EYES.left.cx, 138);
    assert.equal(CLOUD_BLOB_EYES.right.cx, 210);
  } finally {
    await bodies.dispose();
    await face.dispose();
  }
});

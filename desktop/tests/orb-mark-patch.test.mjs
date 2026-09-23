/**
 * The orb marks are a package-time patch over the pinned 0.18.0 renderer
 * (scripts/lib/orb-mark-patch.mjs). Two things are checked: every anchor is
 * replaced exactly once and the result is what the element expects, on a
 * synthetic chunk built from the anchors themselves; and, when the pinned
 * renderer is on disk (GROK_BOT_PINNED_RENDERER names its dist/renderer
 * folder), that the real chunk carries every anchor once and still parses
 * after the patch.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/orb-mark-patch.mjs")).href;

async function stageFromSynthetic(chunk) {
  const stage = await mkdtemp(path.join(os.tmpdir(), "caisra-orb-stage-"));
  const assets = path.join(stage, "dist", "renderer", "assets");
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, "index-abc.js"), chunk);
  await writeFile(path.join(assets, "other-def.js"), "const unrelated = 1;");
  await writeFile(path.join(stage, "dist", "renderer", "index.html"), '<head>\n    <script type="module" src="./assets/index-abc.js"></script>\n</head>');
  return stage;
}

test("the chunk patch replaces every anchor once and leaves the mark's animator wiring in place", async () => {
  const { ORB_CHUNK_REPLACEMENTS, patchOrbMarkChunk, ORB_SHAPE_IDS, ORB_COLOR_IDS } = await import(patchModule);
  const chunk = ORB_CHUNK_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOrbMarkChunk(chunk);
  for (const [label, before, after] of ORB_CHUNK_REPLACEMENTS) {
    assert.equal(patched.includes(after), true, `${label}: replacement present`);
    if (!after.includes(before)) assert.equal(patched.includes(before), false, `${label}: anchor gone`);
  }
  // Mirrors are off: every mark owns an animator.
  assert.match(patched, /function wct\(n\)\{return null\}/);
  // The eyes are hidden, the body is unfilled, the orb sits in the face group under the mark's clip.
  assert.match(patched, /WBe=\{fill:"var\(--bg\)",display:"none"\}/);
  assert.match(patched, /p\.jsxs\("g",\{ref:A,children:\[p\.jsxs\("g",\{clipPath:`url\(#\$\{N\}\)`,children:\[p\.jsx\("path",\{ref:G,style:OrbBodyStyle,d:le\.path\}\),p\.jsx\("foreignObject",\{x:J1\.minX,y:J1\.minY,width:J1\.width,height:J1\.height,style:OrbFrameStyle,children:p\.jsx\("cloud-orb",\{shape:"none",style:OrbElementStyle\}\)\}\)\]\}\),/);
  // The picker is the founder's six and six.
  assert.match(patched, new RegExp(`Ij=${JSON.stringify(ORB_SHAPE_IDS).replace(/[[\]]/g, "\\$&")}`));
  assert.match(patched, new RegExp(`OrbColorIds=new Set\\(${JSON.stringify(ORB_COLOR_IDS).replace(/[[\]]/g, "\\$&")}\\)`));
  assert.match(patched, /disc:Po\("Disc",zBe\(113,113,2\)\),pill:Po\("Pill",ZJt\(113,62\)\),square:Po\("Square",zBe\(107,107,6\)\)/);
  // Each agent seeds its own orb through the mark's inline style.
  assert.match(patched, /function orbSeedOf\(n\)\{return n==null\?0:mOt\(String\(n\)\)%991\}/);
  assert.match(patched, /style:\{\.\.\.m,"--orb-seed":orbSeedOf\(t\)\}/);
  assert.match(patched, /state:ae,style:\{"--orb-seed":orbSeedOf\(L\)\}/);
  // A second application finds no anchors and refuses.
  assert.throws(() => patchOrbMarkChunk(patched), /mirrors-off anchor is missing or ambiguous/);
});

test("the staged patch rewrites the one animator chunk, loads the element from the page and records provenance", async () => {
  const { ORB_CHUNK_REPLACEMENTS, applyOrbMarkPatch, ORB_ELEMENT_ASSET } = await import(patchModule);
  const chunk = ORB_CHUNK_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const stage = await stageFromSynthetic(chunk);
  try {
    const record = await applyOrbMarkPatch({ stageRoot: stage });
    assert.equal(record.chunk.path, "dist/renderer/assets/index-abc.js");
    assert.notEqual(record.chunk.original.sha256, record.chunk.patched.sha256);
    const page = await readFile(path.join(stage, "dist", "renderer", "index.html"), "utf8");
    assert.match(page, /<script src="\.\/assets\/cloud-orb\.js"><\/script>\n\s*<script type="module"/);
    assert.doesNotMatch(page, /crossorigin/, "the element script must not be crossorigin: file:// gives the page a null origin");
    const element = await readFile(path.join(stage, "dist", "renderer", "assets", ORB_ELEMENT_ASSET), "utf8");
    assert.match(element, /customElements\.define\("cloud-orb"/);
    assert.match(element, /none: 6/, "the element knows the 'none' outline the SVG clip relies on");
    assert.match(element, /\.sand-grok-bot-mark/, "the element reads its host mark");
    const provenance = JSON.parse(await readFile(path.join(stage, "dist", "renderer-orb-marks.json"), "utf8"));
    assert.equal(provenance.mode, "original-renderer-orb-marks");
    assert.deepEqual(provenance.chunk.replacements, ORB_CHUNK_REPLACEMENTS.map(([label]) => label));
    assert.equal((await readFile(path.join(stage, "dist", "renderer", "assets", "other-def.js"), "utf8")), "const unrelated = 1;");
    // The page script is not added twice.
    await assert.rejects(() => applyOrbMarkPatch({ stageRoot: stage }), /Expected one renderer chunk carrying the agent mark animator, found 0/);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

test("the pinned 0.18.0 renderer carries every anchor once and parses after the patch", async (t) => {
  const pinned = process.env.GROK_BOT_PINNED_RENDERER?.trim();
  if (!pinned) { t.skip("GROK_BOT_PINNED_RENDERER is not set; the pinned renderer is not in this repository"); return; }
  const { ORB_CHUNK_REPLACEMENTS, ORB_PAGE_REPLACEMENT, patchOrbMarkChunk } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await import("node:fs/promises").then((fs) => fs.readdir(assets));
  const chunkName = names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name));
  assert.ok(chunkName, "an index-*.js chunk");
  const source = await readFile(path.join(assets, chunkName), "utf8");
  for (const [label, before] of ORB_CHUNK_REPLACEMENTS) assert.equal(source.split(before).length - 1, 1, `${label} occurs once in ${chunkName}`);
  const page = await readFile(path.join(pinned, "index.html"), "utf8");
  assert.equal(page.split(ORB_PAGE_REPLACEMENT[1]).length - 1, 1, "one module script tag in index.html");
  const patched = patchOrbMarkChunk(source);
  const out = path.join(repoRoot, ".tmp-orb-check", "patched-chunk.mjs");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, patched);
  try {
    await promisify(execFile)(process.execPath, ["--check", out]);
    assert.ok((await stat(out)).size > source.length);
  } finally {
    await rm(path.dirname(out), { recursive: true, force: true });
  }
});

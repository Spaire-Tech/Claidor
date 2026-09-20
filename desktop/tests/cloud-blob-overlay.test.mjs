import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadOverlay() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-cloud-overlay-"));
  const output = path.join(temporary, "cloud-blob-overlay.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/electron-preload/cloud-blob-overlay.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function grokMark(document, { color = "blue", shape = "blob", sourceId = "agent-bass" } = {}) {
  const mark = document.createElement("span");
  mark.className = "sand-agent-avatar sand-grok-bot-mark";
  mark.setAttribute("data-avatar-color", color);
  mark.setAttribute("data-avatar-shape", shape);
  mark.setAttribute("data-source-id", sourceId);
  mark.style.width = "28px";
  mark.style.height = "28px";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-15 -10 259 275");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534Z");
  svg.append(path);
  mark.append(svg);
  document.body.append(mark);
  return mark;
}

test("preload overlay replaces a 0.18.0 Grok mark with a stored cloud color", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks, injectCloudBlobOverlayStyle } = loaded.module;
    injectCloudBlobOverlayStyle(window.document);
    const mark = grokMark(window.document, { color: "sage", shape: "cloud", sourceId: "agent-bass" });
    assert.equal(syncCloudBlobMarks(window.document), 1);
    const overlay = mark.querySelector("[data-caisra-cloud-blob]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-avatar-shape"), "cloud");
    assert.equal(overlay.getAttribute("data-avatar-color"), "sage");
    assert.match(overlay.innerHTML, /linearGradient/);
    assert.equal(mark.querySelectorAll("[data-caisra-cloud-blob]").length, 1);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    assert.equal(mark.querySelectorAll("[data-caisra-cloud-blob]").length, 1);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("preload overlay maps an unknown Grok color onto one of the 19 clouds", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks } = loaded.module;
    grokMark(window.document, { color: "blue", shape: "pebble", sourceId: "agent-old" });
    syncCloudBlobMarks(window.document);
    const overlay = window.document.querySelector("[data-caisra-cloud-blob]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-avatar-shape"), "cloud");
    assert.notEqual(overlay.getAttribute("data-avatar-color"), "blue");
    assert.match(
      overlay.getAttribute("data-avatar-color") ?? "",
      /^(mist|meadow|lilac|peach|periwinkle|slate|apricot|sage|mauve|sky|tangerine|sea|violet|cream|steel|fog|iris|chartreuse|blush)$/,
    );
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("preload overlay leaves photo and room marks alone", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks } = loaded.module;
    const photo = window.document.createElement("img");
    photo.className = "sand-agent-avatar";
    photo.setAttribute("data-avatar-kind", "photo");
    window.document.body.append(photo);
    const room = window.document.createElement("span");
    room.className = "sand-agent-avatar sand-shared-room-avatar";
    const inner = window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    inner.setAttribute("viewBox", "-15 -10 259 275");
    room.append(inner);
    window.document.body.append(room);
    assert.equal(syncCloudBlobMarks(window.document), 0);
    assert.equal(window.document.querySelector("[data-caisra-cloud-blob]"), null);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

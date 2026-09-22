import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COLOR_IDS = "mist|meadow|lilac|peach|periwinkle|slate|apricot|sage|mauve|sky|tangerine|sea|violet|cream|steel|fog|iris|chartreuse|blush";

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
    loader: { ".png": "dataurl" },
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function grokMark(document, { color = "blue", shape = "blob", sourceId = "agent-bass", sleeping = false } = {}) {
  const mark = document.createElement("span");
  mark.className = "sand-agent-avatar sand-grok-bot-mark";
  mark.setAttribute("data-avatar-color", color);
  mark.setAttribute("data-avatar-shape", shape);
  mark.setAttribute("data-source-id", sourceId);
  if (sleeping) mark.setAttribute("data-grok-state", "sleeping");
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

test("preload overlay paints a stored cloud body with a separate animated eye layer", async () => {
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
    const body = overlay.querySelector("image.caisra-cloud-blob__body");
    assert.ok(body);
    assert.match(body.getAttribute("href") ?? "", /^data:image\/png;base64,/);
    assert.ok(overlay.querySelector('.caisra-cloud-blob__eye[data-eye="left"]'));
    assert.ok(overlay.querySelector('.caisra-cloud-blob__eye[data-eye="right"]'));
    assert.equal(overlay.querySelectorAll(".caisra-cloud-blob__pupil").length, 2);
    assert.match(window.document.getElementById("caisra-cloud-blob-overlay")?.textContent ?? "", /caisra-cloud-blink/);
    assert.match(window.document.getElementById("caisra-cloud-blob-overlay")?.textContent ?? "", /caisra-cloud-gaze/);
    assert.doesNotMatch(overlay.innerHTML, /linearGradient/);
    assert.equal(mark.querySelectorAll("[data-caisra-cloud-blob]").length, 1);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    assert.equal(mark.querySelectorAll("[data-caisra-cloud-blob]").length, 1);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("a 0.18.0 mark with only --fg still gets a designed cloud body", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks } = loaded.module;
    const mark = window.document.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.setAttribute("data-grok-state", "idle");
    mark.style.setProperty("--fg", "light-dark(#2A92FE, #0E74E0)");
    mark.style.width = "28px";
    mark.style.height = "28px";
    const face = window.document.createElement("canvas");
    mark.append(face);
    window.document.body.append(mark);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    const overlay = mark.querySelector("[data-caisra-cloud-blob]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-avatar-color"), "sky");
    assert.ok(overlay.querySelector("image.caisra-cloud-blob__body"));
    assert.ok(overlay.querySelector(".caisra-cloud-blob__pupil"));
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("preload overlay maps an unknown Grok color onto one of the 19 cloud bodies", async () => {
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
    assert.match(overlay.getAttribute("data-avatar-color") ?? "", new RegExp(`^(${COLOR_IDS})$`));
    assert.match(overlay.querySelector("image")?.getAttribute("href") ?? "", /^data:image\/png;base64,/);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("sleeping marks keep the painted body and swap eyes for a rest pose", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks } = loaded.module;
    grokMark(window.document, { color: "blush", sourceId: "agent-asleep", sleeping: true });
    syncCloudBlobMarks(window.document);
    const overlay = window.document.querySelector("[data-caisra-cloud-blob]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-sleeping"), "true");
    assert.ok(overlay.querySelector("image.caisra-cloud-blob__body"));
    assert.equal(overlay.querySelectorAll(".caisra-cloud-blob__eye").length, 0);
    assert.ok(overlay.querySelector("path"));
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
    inner.setAttribute("viewBox", "0 0 336 336");
    room.append(inner);
    window.document.body.append(room);
    assert.equal(syncCloudBlobMarks(window.document), 0);
    assert.equal(window.document.querySelector("[data-caisra-cloud-blob]"), null);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("the packaged 0.18.0 window paints the 19 designed bodies through the clean preload", async () => {
  const preload = await readFile(path.join(repoRoot, "source", "electron-preload", "preload.ts"), "utf8");
  const overlay = await readFile(path.join(repoRoot, "source", "electron-preload", "cloud-blob-overlay.ts"), "utf8");
  const packaging = await readFile(path.join(repoRoot, "scripts", "lib", "clean-build.mjs"), "utf8");
  const audit = await readFile(path.join(repoRoot, "scripts", "audit-runtime-composition.mjs"), "utf8");
  const ignition = await readFile(path.join(repoRoot, "scripts", "caisra-ignition-activation.mjs"), "utf8");
  const workspaceBuild = await readFile(path.join(repoRoot, "scripts", "build-caisra.mjs"), "utf8");
  assert.match(preload, /installCloudBlobOverlaySafely\(\)/);
  assert.match(overlay, /sand-grok-bot-mark/);
  assert.match(overlay, /caisra-cloud-blink/);
  assert.match(overlay, /caisra-cloud-gaze/);
  assert.match(packaging, /"\.png": "dataurl"/);
  assert.match(audit, /"\.png": "dataurl"/);
  assert.match(ignition, /"\.png": "dataurl"/);
  assert.match(workspaceBuild, /"\.png": "dataurl"/);
});

test("the composition audit can graph the primary preload without a PNG loader", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-cloud-preload-graph-"));
  try {
    await build({
      absWorkingDir: repoRoot,
      bundle: true,
      entryPoints: [path.join(repoRoot, "source/electron-preload/runtime/primary.ts")],
      external: ["electron"],
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(temporary, "preload.cjs"),
      platform: "node",
      write: true,
    });
    const bundled = await readFile(path.join(temporary, "preload.cjs"), "utf8");
    assert.match(bundled, /data:image\/png;base64,/);
    assert.match(bundled, /installCloudBlobOverlay/);
    assert.doesNotMatch(await readFile(path.join(repoRoot, "source/shared/agent/cloud-blob-bodies.ts"), "utf8"), /from "\.\/cloud-blob-bodies\/.*\.png"/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("a Grok face painted as a grandchild is hidden by the overlay stylesheet, not only a direct child", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks, injectCloudBlobOverlayStyle } = loaded.module;
    injectCloudBlobOverlayStyle(window.document);
    const mark = window.document.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.style.setProperty("--fg", "light-dark(#FF3E51, #E02135)");
    const wrapperDiv = window.document.createElement("div");
    const face = window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    face.setAttribute("data-grok-state", "idle");
    wrapperDiv.append(face);
    mark.append(wrapperDiv);
    window.document.body.append(mark);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    const overlay = mark.querySelector("[data-caisra-cloud-blob]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-avatar-color"), "blush");
    const css = window.document.getElementById("caisra-cloud-blob-overlay").textContent;
    // The hide rule reaches every descendant that is not ours, at any depth.
    assert.match(css, /\.sand-grok-bot-mark :not\(\[data-caisra-cloud-blob\]\):not\(\[data-caisra-cloud-blob\] \*\) \{ visibility: hidden !important; \}/);
    assert.match(css, /\[data-caisra-cloud-blob\] \* \{ visibility: visible !important; \}/);
    assert.match(css, /\.sand-grok-bot-mark::before, \.sand-grok-bot-mark::after \{ display: none !important; \}/);
    // Overlay geometry is written through CSSOM, so a style-src policy without
    // 'unsafe-inline' still cannot leave it at the 300x150 default.
    assert.equal(overlay.style.getPropertyValue("width"), "100%");
    assert.equal(overlay.style.getPropertyValue("height"), "100%");
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("a mark that is itself an <svg> gets the overlay beside it and is hidden as a host", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks } = loaded.module;
    const cell = window.document.createElement("div");
    const mark = window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    mark.setAttribute("class", "sand-grok-bot-mark");
    mark.setAttribute("data-grok-state", "idle");
    mark.setAttribute("width", "28");
    mark.style.setProperty("--fg", "#00C972");
    cell.append(mark);
    window.document.body.append(cell);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    assert.equal(mark.getAttribute("data-caisra-cloud-host"), "1");
    assert.equal(mark.querySelector("[data-caisra-cloud-blob]"), null, "nothing is nested inside the svg mark");
    const overlay = mark.nextElementSibling;
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-caisra-cloud-blob"), "1");
    assert.equal(overlay.getAttribute("data-avatar-color"), "sage");
    assert.equal(overlay.style.getPropertyValue("position"), "absolute");
    assert.equal(cell.style.position, "relative");
    assert.equal(syncCloudBlobMarks(window.document), 1);
    assert.equal(cell.querySelectorAll("[data-caisra-cloud-blob]").length, 1);
    const css = window.document.getElementById("caisra-cloud-blob-overlay").textContent;
    assert.match(css, /\[data-caisra-cloud-host="1"\]:not\(\.sand-grok-bot-mark\) \{ visibility: hidden !important; \}/);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("a mark with an open shadow root is painted inside the shadow tree", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncCloudBlobMarks } = loaded.module;
    const mark = window.document.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.style.setProperty("--fg", "light-dark(#A97EFE, #804EE0)");
    const shadow = mark.attachShadow({ mode: "open" });
    const face = window.document.createElement("canvas");
    face.setAttribute("data-grok-state", "sleeping");
    shadow.append(face);
    window.document.body.append(mark);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    assert.equal(mark.querySelector("[data-caisra-cloud-blob]"), null, "a light-DOM child would not render under a shadow root");
    const overlay = shadow.querySelector("[data-caisra-cloud-blob]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-avatar-color"), "violet");
    assert.equal(overlay.getAttribute("data-sleeping"), "true");
    const style = shadow.querySelector("#caisra-cloud-blob-overlay");
    assert.ok(style, "the stylesheet lives in the shadow tree where the face is");
    assert.match(style.textContent, /:host \{ position: relative; \}/);
    assert.match(style.textContent, /caisra-cloud-blink/);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("a mark whose ink comes from the computed color still maps to a designed body", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { hostForeground, syncCloudBlobMarks } = loaded.module;
    const mark = window.document.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.style.color = "rgb(255, 120, 28)";
    mark.append(window.document.createElement("canvas"));
    window.document.body.append(mark);
    assert.match(hostForeground(mark), /rgb\(255,\s*120,\s*28\)/);
    assert.equal(syncCloudBlobMarks(window.document), 1);
    assert.equal(mark.querySelector("[data-caisra-cloud-blob]").getAttribute("data-avatar-color"), "tangerine");
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("install before <head> exists does not throw and paints once the document is parsed", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { installCloudBlobOverlay } = loaded.module;
    const lines = [];
    const doc = window.document;
    let parsed = false;
    // A preload-time document: nothing parsed yet.
    const proxied = new Proxy(doc, {
      get(target, property) {
        if (property === "head" || property === "documentElement") return parsed ? Reflect.get(target, property) : null;
        if (property === "readyState") return parsed ? "complete" : "loading";
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const handle = installCloudBlobOverlay(proxied, { log: (line) => lines.push(line), diagnosticDelayMs: 0 });
    assert.ok(handle);
    assert.equal(doc.getElementById("caisra-cloud-blob-overlay"), null, "no stylesheet can be placed before <html> exists");
    const mark = doc.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.style.setProperty("--fg", "light-dark(#2A92FE, #0E74E0)");
    mark.append(doc.createElement("canvas"));
    doc.body.append(mark);
    parsed = true;
    doc.dispatchEvent(new window.Event("DOMContentLoaded"));
    assert.ok(doc.getElementById("caisra-cloud-blob-overlay"), "the stylesheet lands once the document is parsed");
    assert.equal(mark.querySelector("[data-caisra-cloud-blob]")?.getAttribute("data-avatar-color"), "sky");
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[CaisraCloudOverlay\] marks=1 hosts=1 painted=1 readyState=complete first=<span class="sand-grok-bot-mark"/);
    assert.doesNotMatch(lines[0], /data-caisra-cloud-blob/, "the diagnostic shows the page's own mark, not our overlay");
    handle.disconnect();
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("the diagnostic line says what else is on the page when no mark is found", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { describeCloudBlobOverlay } = loaded.module;
    window.document.body.innerHTML = '<div class="sand-agent-avatar"><canvas></canvas></div><svg data-grok-state="idle"></svg>';
    const line = describeCloudBlobOverlay(window.document);
    assert.match(line, /marks=0 hosts=0 painted=0/);
    assert.match(line, /svg=1 canvas=1 grokState=1 avatars=1/);
  } finally {
    window.close();
    await loaded.dispose();
  }
});

test("the preload keeps its bridges when the overlay cannot install", async () => {
  const preload = await readFile(path.join(repoRoot, "source", "electron-preload", "preload.ts"), "utf8");
  assert.match(preload, /installCloudBlobOverlaySafely\(\)/);
  assert.doesNotMatch(preload, /\binstallCloudBlobOverlay\(\)/);
});

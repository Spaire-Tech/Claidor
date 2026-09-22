import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadOverlay() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-face-overlay-"));
  const output = path.join(temporary, "agent-face-overlay.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/electron-preload/agent-face-overlay.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function grokMark(document, { color = "blue", shape = "blob", sourceId = "sand-agent-mark-source-agent-bass", state = "idle" } = {}) {
  const mark = document.createElement("span");
  mark.className = "sand-agent-avatar sand-grok-bot-mark";
  mark.setAttribute("data-avatar-color", color);
  mark.setAttribute("data-avatar-shape", shape);
  mark.style.width = "28px";
  mark.style.height = "28px";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-15 -15 259 259");
  svg.setAttribute("data-grok-state", state);
  svg.setAttribute("data-source-id", sourceId);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534Z");
  svg.append(path);
  mark.append(svg);
  document.body.append(mark);
  return mark;
}

// The shipped face as the pinned renderer draws it (character.tsx): a bare
// svg with a source id, an ink gradient in Grok's stops and the shape's path.
const STOPS = { blue: ["#2A92FE", "#0E74E0"], green: ["#00C972", "#009957"], red: ["#FF3E51", "#E02135"], magenta: ["#FF5EB1", "#E02A88"] };
const PATHS = { blob: "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217", hex: "M217.73 153.04Q217.73 174 199.58 184.48L132.42 223.25Q114.27", teardrop: "M125.97 7.2Q114.27 -7.28 102.57 7.2L43.49 80.31C13.46 117.46", tablet: "M74.27 40.27L154.27 40.27C195.14 40.27 228.27 73.4 228.27 11" };
function shippedFace(document, { sourceId, color = "blue", shape = "blob", state = "idle" } = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-15 -15 259 259");
  svg.setAttribute("data-grok-state", state);
  if (sourceId != null) svg.setAttribute("data-source-id", sourceId);
  const [light, dark] = STOPS[color];
  svg.innerHTML = `<defs><linearGradient id="r1-ink" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${light}"></stop><stop offset="1" stop-color="${dark}"></stop></linearGradient></defs><g transform="translate(0 0)"><path d="${PATHS[shape]}Z" fill="url(#r1-ink)"></path></g>`;
  return svg;
}

const finish = async (loaded, window) => { loaded.module.resetFaceMotion?.(); window.close(); await loaded.dispose(); };

test("the preload overlay paints a slice face keyed on the mark's shape and colour, and moves it", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, injectFaceOverlayStyle, tickFaceMotion, resetFaceMotion } = loaded.module;
    resetFaceMotion(() => 1000);
    injectFaceOverlayStyle(window.document);
    const mark = grokMark(window.document, { sourceId: "sand-agent-mark-source-agent-perrin", state: "working" });
    assert.equal(syncFaceMarks(window.document), 1);
    const overlay = mark.querySelector("[data-caisra-face]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-face-key"), "agent-perrin|lump|1084FE", "the key is the agent id from the face source, Grok's shape and Grok's colour");
    assert.ok(overlay.querySelector(".caisra-face__face"));
    assert.equal(overlay.querySelector(".caisra-face__eyes"), null, "the slice has no eyes");
    assert.doesNotMatch(overlay.innerHTML, /<rect[^>]*fill=/, "no background tile under the face");
    assert.equal(overlay.style.getPropertyValue("pointer-events"), "none");
    assert.equal(tickFaceMotion(1000), 1);
    assert.equal(overlay.querySelector(".caisra-face__face").getAttribute("transform"), "translate(0 0) rotate(-3 50 50)");
    // Painting again is idempotent; the face is kept, not regenerated.
    assert.equal(syncFaceMarks(window.document), 1);
    assert.equal(mark.querySelectorAll("[data-caisra-face]").length, 1);
    assert.equal(mark.querySelector("[data-caisra-face]"), overlay);
    // The mark's state drives the body each frame.
    mark.querySelector("svg").setAttribute("data-grok-state", "suspicious");
    tickFaceMotion(1500);
    assert.match(overlay.querySelector(".caisra-face__face").getAttribute("transform"), /rotate\(7 50 50\)/);
    // When Grok saves a new shape or colour onto the mark, the face follows.
    mark.setAttribute("data-avatar-shape", "hex");
    mark.setAttribute("data-avatar-color", "red");
    assert.equal(syncFaceMarks(window.document), 1);
    const repainted = mark.querySelector("[data-caisra-face]");
    assert.notEqual(repainted, overlay);
    assert.equal(repainted.getAttribute("data-face-key"), "agent-perrin|hexagon|FF263C");
    assert.equal(mark.querySelectorAll("[data-caisra-face]").length, 1);
    assert.equal(tickFaceMotion(1600), 1, "the repainted face is the one the loop moves");
  } finally {
    await finish(loaded, window);
  }
});

test("the avatar editor's cells are bare faces: shape from the cell's source id, colour from the ink, id from the source", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, hostIdentity } = loaded.module;
    const shapes = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"];
    const document = window.document;
    // avatar-editor/view.tsx: the current face with source `<agentId>`, then
    // one bare svg per shape with source `<agentId>-<shape>`, all in green.
    const current = shippedFace(document, { sourceId: "agent-juno", color: "green", shape: "hex" });
    const cells = shapes.map((shape) => { const cell = document.createElement("button"); cell.append(shippedFace(document, { sourceId: `agent-juno-${shape}`, color: "green", shape: "blob" })); return cell; });
    document.body.append(current, ...cells);
    assert.deepEqual(hostIdentity(current), { agentId: "agent-juno", shape: "hex", color: "green" }, "the current face: shape read off its path, colour off its gradient");
    assert.deepEqual(hostIdentity(cells[5].firstElementChild), { agentId: "agent-juno", shape: "hex", color: "green" }, "a cell: shape from the source id suffix");
    assert.equal(syncFaceMarks(document), 9);
    const keys = [current, ...cells].map((node) => (node.matches("svg") ? node.nextElementSibling : node.querySelector("[data-caisra-face]")).getAttribute("data-face-key"));
    assert.deepEqual(keys, ["agent-juno|hexagon|00C972", ...shapes.map((shape) => `agent-juno|${{ blob: "lump", pebble: "egg", squircle: "squircle", tablet: "pill", wedge: "diamond", hex: "hexagon", cloud: "arch", teardrop: "lens" }[shape]}|00C972`)]);
    assert.equal(new Set(keys).size, 8, "eight different faces, the current one repeating its own shape");
    const cuts = (node) => /href="#[^"]*-cuts-([A-Za-z]+)-/.exec(node.innerHTML)[1];
    const faces = [...document.querySelectorAll("[data-caisra-face]")];
    assert.ok(faces.every((face) => cuts(face) === cuts(faces[0])), "every cell keeps the agent's own cuts, so the choice is the shape");
  } finally {
    await finish(loaded, window);
  }
});

test("a bot picker row that exposes only the drawing still gets that agent's own face", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, hostIdentity } = loaded.module;
    const document = window.document;
    // No wrapper, no attributes but the source: shape and colour come off the drawing.
    const a = shippedFace(document, { sourceId: "sand-agent-mark-source-agent-a", color: "red", shape: "teardrop" });
    const b = shippedFace(document, { sourceId: "sand-agent-mark-source-agent-b", color: "magenta", shape: "tablet" });
    // No source at all: still the drawing.
    const c = shippedFace(document, { color: "blue", shape: "hex" });
    document.body.append(a, b, c);
    assert.deepEqual(hostIdentity(a), { agentId: "agent-a", shape: "teardrop", color: "red" });
    assert.deepEqual(hostIdentity(b), { agentId: "agent-b", shape: "tablet", color: "magenta" });
    assert.deepEqual(hostIdentity(c), { agentId: null, shape: "hex", color: "blue" });
    assert.equal(syncFaceMarks(document), 3);
    const keys = [a, b, c].map((node) => node.nextElementSibling.getAttribute("data-face-key"));
    assert.deepEqual(keys, ["agent-a|lens|FF263C", "agent-b|pill|FF309B", "persona|hexagon|1084FE"]);
  } finally {
    await finish(loaded, window);
  }
});

test("a sidebar mark whose wrapper carries the colour but no shape gets Grok's shape for that agent, not one lump for all", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, hostIdentity } = loaded.module;
    const document = window.document;
    const marks = ["agent-perrin", "agent-juno", "agent-mira", "agent-sable"].map((id) => {
      const mark = document.createElement("span");
      mark.className = "sand-agent-avatar sand-grok-bot-mark";
      mark.setAttribute("data-avatar-color", "blue");
      // The wrapper writes data-avatar-shape only when a shape was persisted; the face draws the hash default.
      mark.append(shippedFace(document, { sourceId: `sand-agent-mark-source-${id}`, color: "blue", shape: id === "agent-perrin" ? "teardrop" : id === "agent-juno" ? "hex" : id === "agent-mira" ? "tablet" : "blob" }));
      document.body.append(mark);
      return mark;
    });
    assert.deepEqual(hostIdentity(marks[0]), { agentId: "agent-perrin", shape: "teardrop", color: "blue" });
    assert.equal(syncFaceMarks(document), 4);
    const shapes = marks.map((mark) => mark.querySelector("[data-caisra-face]").getAttribute("data-face-key").split("|")[1]);
    assert.deepEqual(shapes, ["lens", "hexagon", "pill", "lump"]);
    // A face whose path is not one of the eight, and no attribute: Grok's hash default for that id.
    const odd = document.createElement("span");
    odd.className = "sand-grok-bot-mark";
    odd.setAttribute("data-avatar-color", "green");
    const face = shippedFace(document, { sourceId: "sand-agent-mark-source-agent-perrin", color: "green" });
    face.querySelector("path").setAttribute("d", "M0 0L1 1Z");
    odd.append(face);
    document.body.append(odd);
    assert.equal(hostIdentity(odd).shape, "teardrop", "resolvePersonaShape('agent-perrin') is teardrop, as the shipped hash says");
  } finally {
    await finish(loaded, window);
  }
});

test("one agent gets the same face wherever it is drawn, and another agent of the same shape and colour a different one", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks } = loaded.module;
    const sidebar = grokMark(window.document, { sourceId: "sand-agent-mark-source-agent-juno" });
    const header = grokMark(window.document, { sourceId: "sand-agent-mark-source-agent-juno" });
    const other = grokMark(window.document, { sourceId: "sand-agent-mark-source-agent-mira" });
    const third = grokMark(window.document, { sourceId: "sand-agent-mark-source-agent-sable" });
    assert.equal(syncFaceMarks(window.document), 4);
    const shape = (mark) => mark.querySelector("[data-caisra-face]").innerHTML.replace(/af[0-9a-z]+-[0-9a-z]+/g, "ID").replace(/ transform="[^"]*"/g, "");
    assert.equal(shape(sidebar), shape(header));
    const cuts = (mark) => /href="#[^"]*-cuts-([A-Za-z]+)-/.exec(mark.querySelector("[data-caisra-face]").innerHTML)[1];
    assert.ok(new Set([cuts(sidebar), cuts(other), cuts(third)]).size >= 2, `three blue blobs, at least two cut patterns: ${[cuts(sidebar), cuts(other), cuts(third)].join(" ")}`);
    const ids = [...window.document.querySelectorAll("[data-caisra-face] [id]")].map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique across the faces on one page");
  } finally {
    await finish(loaded, window);
  }
});

test("a mark without a face source is keyed on its shape and colour alone; a bare mark on one shared face", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, hostIdentity } = loaded.module;
    const coloured = window.document.createElement("span");
    coloured.className = "sand-grok-bot-mark";
    coloured.setAttribute("data-avatar-color", "orange");
    coloured.setAttribute("data-avatar-shape", "cloud");
    coloured.append(window.document.createElement("canvas"));
    const bare = window.document.createElement("span");
    bare.className = "sand-grok-bot-mark";
    bare.append(window.document.createElement("canvas"));
    window.document.body.append(coloured, bare);
    assert.deepEqual(hostIdentity(coloured), { agentId: null, shape: "cloud", color: "orange" });
    assert.deepEqual(hostIdentity(bare), { agentId: null, shape: null, color: null }, "a mark that exposes nothing at all");
    assert.equal(syncFaceMarks(window.document), 2);
    assert.equal(coloured.querySelector("[data-caisra-face]").getAttribute("data-face-key"), "persona|arch|FF6700");
    assert.equal(bare.querySelector("[data-caisra-face]").getAttribute("data-face-key"), "persona|lump|seed");
  } finally {
    await finish(loaded, window);
  }
});

test("preload overlay leaves photo and room marks alone", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks } = loaded.module;
    window.document.body.innerHTML = `
      <span class="sand-agent-avatar sand-shared-room-avatar"><svg data-avatar-shape="blob"></svg></span>
      <span class="sand-agent-avatar" data-avatar-kind="photo"><img alt=""><svg data-avatar-shape="blob"></svg></span>
      <span class="sand-group-avatar"><span class="sand-grok-bot-mark"><svg data-grok-state="idle"></svg></span></span>
    `;
    assert.equal(syncFaceMarks(window.document), 0);
    assert.equal(window.document.querySelector("[data-caisra-face]"), null);
  } finally {
    await finish(loaded, window);
  }
});

test("the packaged 0.18.0 window paints slice faces through the clean preload", async () => {
  const preload = await readFile(path.join(repoRoot, "source", "electron-preload", "preload.ts"), "utf8");
  const overlay = await readFile(path.join(repoRoot, "source", "electron-preload", "agent-face-overlay.ts"), "utf8");
  const faces = await readFile(path.join(repoRoot, "source", "shared", "agent", "agent-face.ts"), "utf8");
  assert.match(preload, /installFaceOverlaySafely\(\)/);
  assert.doesNotMatch(preload, /\binstallFaceOverlay\(\)/);
  assert.match(overlay, /sand-grok-bot-mark/);
  assert.match(overlay, /tickFaceMotion/);
  assert.match(faces, /@dicebear\/styles\/slice\.json/);
  assert.match(faces, /shapeVariant: shape/);
  assert.match(faces, /bodyColor: \[color\]/);
  assert.match(faces, /backgroundColor: \[\]/);
  // The clean preload bundle carries the generator and the style definition.
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-face-preload-graph-"));
  try {
    const output = path.join(temporary, "preload.cjs");
    await build({ entryPoints: [path.join(repoRoot, "source/electron-preload/runtime/primary.ts")], outfile: output, bundle: true, format: "cjs", platform: "node", target: "node22", external: ["electron"], logLevel: "silent" });
    const bundled = await readFile(output, "utf8");
    assert.match(bundled, /installFaceOverlay/);
    assert.match(bundled, /"dbsl-6-0"/, "the slice definition is in the bundle");
    assert.doesNotMatch(bundled, /data:image\/png;base64,/, "no picture files");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("a Grok face painted as a grandchild is hidden by the overlay stylesheet, not only a direct child", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, injectFaceOverlayStyle } = loaded.module;
    injectFaceOverlayStyle(window.document);
    const mark = window.document.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.setAttribute("data-avatar-color", "pink");
    const wrapper = window.document.createElement("div");
    const face = window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    face.setAttribute("data-grok-state", "idle");
    wrapper.append(face);
    mark.append(wrapper);
    window.document.body.append(mark);
    assert.equal(syncFaceMarks(window.document), 1);
    assert.ok(mark.querySelector("[data-caisra-face]"));
    const css = window.document.getElementById("caisra-face-overlay").textContent;
    assert.match(css, /\.sand-grok-bot-mark :not\(\[data-caisra-face\]\):not\(\[data-caisra-face\] \*\) \{ visibility: hidden !important; \}/);
    assert.match(css, /\[data-caisra-face\] \* \{ visibility: visible !important; \}/);
    assert.match(css, /svg\[viewBox="-15 -15 259 259"\]:not\(\[data-caisra-face\]\)/);
    assert.doesNotMatch(css, /@keyframes/, "no CSS motion: the loop owns it");
  } finally {
    await finish(loaded, window);
  }
});

test("a mark that is itself an <svg> gets the overlay beside it and is hidden as a host", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks } = loaded.module;
    const cell = window.document.createElement("div");
    const mark = window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    mark.setAttribute("class", "sand-grok-bot-mark");
    mark.setAttribute("data-grok-state", "idle");
    mark.setAttribute("data-source-id", "sand-agent-mark-source-agent-sable");
    cell.append(mark);
    window.document.body.append(cell);
    assert.equal(syncFaceMarks(window.document), 1);
    assert.equal(mark.getAttribute("data-caisra-face-host"), "1");
    assert.equal(mark.querySelector("[data-caisra-face]"), null, "nothing is nested inside the svg mark");
    const overlay = mark.nextElementSibling;
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-caisra-face"), "1");
    assert.equal(overlay.getAttribute("data-face-key"), "agent-sable|pill|936439", "nothing drawn and no attribute: Grok's own hash defaults for that id (tablet, brown), never one shared face");
    assert.equal(overlay.style.getPropertyValue("position"), "absolute");
    assert.equal(cell.style.position, "relative");
    assert.equal(syncFaceMarks(window.document), 1);
    assert.equal(cell.querySelectorAll("[data-caisra-face]").length, 1);
    const css = window.document.getElementById("caisra-face-overlay").textContent;
    assert.match(css, /\[data-caisra-face-host="1"\]:not\(\.sand-grok-bot-mark\) \{ visibility: hidden !important; \}/);
  } finally {
    await finish(loaded, window);
  }
});

test("a mark with an open shadow root is painted inside the shadow tree", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { syncFaceMarks, tickFaceMotion } = loaded.module;
    const mark = window.document.createElement("span");
    mark.className = "sand-grok-bot-mark";
    const shadow = mark.attachShadow({ mode: "open" });
    const face = window.document.createElement("canvas");
    face.setAttribute("data-grok-state", "suspicious");
    face.setAttribute("data-source-id", "sand-agent-mark-source-agent-terra");
    face.setAttribute("data-avatar-shape", "teardrop");
    face.setAttribute("data-avatar-color", "magenta");
    shadow.append(face);
    window.document.body.append(mark);
    assert.equal(syncFaceMarks(window.document), 1);
    assert.equal(mark.querySelector("[data-caisra-face]"), null, "a light-DOM child would not render under a shadow root");
    const overlay = shadow.querySelector("[data-caisra-face]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-face-key"), "agent-terra|lens|FF309B", "shape and colour are read through the shadow root too");
    const style = shadow.querySelector("#caisra-face-overlay");
    assert.ok(style, "the stylesheet lives in the shadow tree where the face is");
    assert.match(style.textContent, /:host \{ position: relative; \}/);
    tickFaceMotion(10);
    assert.match(overlay.querySelector(".caisra-face__face").getAttribute("transform"), /rotate\(7 50 50\)/, "the state is read through the shadow root");
  } finally {
    await finish(loaded, window);
  }
});

test("install before <head> exists does not throw and paints once the document is parsed", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { installFaceOverlay } = loaded.module;
    const lines = [];
    const doc = window.document;
    let parsed = false;
    const proxied = new Proxy(doc, {
      get(target, property) {
        if (property === "head" || property === "documentElement") return parsed ? Reflect.get(target, property) : null;
        if (property === "readyState") return parsed ? "complete" : "loading";
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const handle = installFaceOverlay(proxied, { log: (line) => lines.push(line), diagnosticDelayMs: 0 });
    assert.ok(handle);
    assert.equal(doc.getElementById("caisra-face-overlay"), null, "no stylesheet can be placed before <html> exists");
    const mark = doc.createElement("span");
    mark.className = "sand-grok-bot-mark";
    mark.append(doc.createElement("canvas"));
    doc.body.append(mark);
    parsed = true;
    doc.dispatchEvent(new window.Event("DOMContentLoaded"));
    assert.ok(doc.getElementById("caisra-face-overlay"), "the stylesheet lands once the document is parsed");
    assert.ok(mark.querySelector("[data-caisra-face]"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[CaisraFaceOverlay\] marks=1 hosts=1 painted=1 readyState=complete first=<span class="sand-grok-bot-mark"/);
    assert.doesNotMatch(lines[0], /data-caisra-face=/, "the diagnostic shows the page's own mark, not our overlay");
    handle.disconnect();
  } finally {
    await finish(loaded, window);
  }
});

test("the diagnostic line says what else is on the page when no mark is found", async () => {
  const loaded = await loadOverlay();
  const window = new Window();
  try {
    const { describeFaceOverlay } = loaded.module;
    window.document.body.innerHTML = '<div class="sand-agent-avatar"><canvas></canvas></div><svg data-grok-state="idle"></svg>';
    const line = describeFaceOverlay(window.document);
    assert.match(line, /^\[CaisraFaceOverlay\] marks=0 hosts=0 painted=0/);
    assert.match(line, /svg=1 canvas=1 grokState=1 avatars=1/);
  } finally {
    await finish(loaded, window);
  }
});

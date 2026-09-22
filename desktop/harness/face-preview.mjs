// A moving preview of the slice faces under Grok's motion, offline.
//
//   node harness/face-preview.mjs
//
// Writes .build/face-preview.html (open it in any browser: the overlay
// script is inlined, every face cycles through the states and follows the
// pointer), harness/shots/face-preview.png (a still), and
// harness/shots/face-preview.webm (six seconds of it moving).
import { mkdir, readFile, rename, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { buildFaceOverlayScript } from "./face-overlay-bundle.mjs";
import shapePaths from "../source/shared/agent/grok-shape-paths.json" with { type: "json" };

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const shotsDir = path.join(here, "shots");
const CHROMIUM = process.env.SHOT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// Agent ids as the app mints them are opaque; these stand in for eighteen agents.
const AGENTS = ["perrin", "juno", "mira", "sable", "board-pack", "bass", "terra", "luna", "caisra", "ines", "ola", "remy", "nova", "kip", "zed", "tao", "bo", "ada"];
// Grok's persisted avatar: a shape and a colour per agent (avatar-editor/model.ts).
const SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"];
const COLORS = ["blue", "green", "red", "orange", "yellow", "cyan", "violet", "magenta", "brown", "gray", "black"];
// The ink gradient the shipped face paints each colour with (character.tsx COLORS).
const STOPS = { black: ["#000000", "#FFFFFF"], brown: ["#A27952", "#855C36"], red: ["#FF3E51", "#E02135"], orange: ["#FF781C", "#FF6700"], yellow: ["#FFAF38", "#FF9800"], green: ["#00C972", "#009957"], cyan: ["#1CC3B0", "#00A592"], blue: ["#2A92FE", "#0E74E0"], violet: ["#A97EFE", "#804EE0"], magenta: ["#FF5EB1", "#E02A88"], gray: ["#959595", "#777777"] };
// The shipped face svg, as character.tsx renders it: source id, ink gradient, shape path.
function shippedFace({ sourceId, shape, color, state, size }) {
  const [light, dark] = STOPS[color];
  const gradient = `g-${sourceId.replace(/[^a-z0-9]/gi, "")}`;
  return `<svg aria-hidden="true" data-grok-state="${state}" data-source-id="${sourceId}" height="${size}" width="${size}" viewBox="-15 -15 259 259" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible"><defs><linearGradient id="${gradient}-ink" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><g transform="translate(0 0)"><path d="${shapePaths[shape]}" fill="url(#${gradient}-ink)"/><g fill="#fff"><ellipse cx="88" cy="110" rx="9" ry="7"/><ellipse cx="140" cy="110" rx="9" ry="7"/></g></g></svg>`;
}
// The states the app actually puts a mark in (agent-avatar.tsx,
// personaStateFromAgent) first, then the rest of Grok's table.
const STATES = ["idle", "thinking", "working", "searching", "listening", "sending", "receiving", "excited", "celebrate", "curious", "confused", "sad", "sleeping", "waking", "writing", "happy", "surprised", "bored"];

const overlayScript = await readFile(await buildFaceOverlayScript(), "utf8");
// The sidebar's wrapper carries the colour, and the shape only when one was
// persisted (here: never), exactly as the pinned renderer writes it; the
// shape is read off the face's own path.
const marks = AGENTS.map((agent, index) => `
  <figure>
    <span aria-hidden="true" class="sand-agent-avatar sand-grok-bot-mark" data-avatar-color="${COLORS[index % COLORS.length]}" style="width: 96px; height: 96px; display: block;">
      ${shippedFace({ sourceId: `sand-agent-mark-source-agent-${agent}`, shape: SHAPES[index % SHAPES.length], color: COLORS[index % COLORS.length], state: STATES[index % STATES.length], size: 96 })}
    </span>
    <figcaption><b>${agent}</b> · ${SHAPES[index % SHAPES.length]} ${COLORS[index % COLORS.length]}<br><span class="state">${STATES[index % STATES.length]}</span></figcaption>
  </figure>`).join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Caisra faces, moving</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 13px/1.4 -apple-system, system-ui, sans-serif; background: #f4f4f5; color: #222; }
  @media (prefers-color-scheme: dark) { body { background: #151517; color: #ddd; } }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
  p { margin: 0 0 20px; opacity: .7; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 20px 12px; }
  figure { margin: 0; text-align: center; }
  figure > span { margin: 0 auto 8px; position: relative; }
  figcaption .state { opacity: .7; font-variant-numeric: tabular-nums; }
  h2 { font-size: 14px; font-weight: 600; margin: 28px 0 4px; }
  .row { display: flex; gap: 10px; align-items: center; }
  .cell { position: relative; display: inline-block; padding: 0; border: 0; background: transparent; }
  code { font-size: 12px; }
</style>
</head>
<body>
<h1>Caisra faces, moving</h1>
<p>Eighteen agents' slice faces, each keyed on the shape and colour the shipped face draws (read off its path and its ink gradient) with the cuts from the agent's id, under Grok Bot's motion table: each cycles through the states, spins on <i>sending</i> and <i>celebrate</i>, and bounces on <i>excited</i> and <i>receiving</i>.</p>
<main>${marks}</main>
<h2>Change avatar: one agent, eight cells</h2>
<p>The avatar editor draws bare faces with source <code>&lt;agentId&gt;-&lt;shape&gt;</code> and no attributes (avatar-editor/view.tsx). Same cuts in every cell, one body per cell.</p>
<div class="row" id="editor">${SHAPES.map((shape) => `<button class="cell" title="${shape}">${shippedFace({ sourceId: `agent-juno-${shape}`, shape: "blob", color: "green", state: "idle", size: 48 })}</button>`).join("")}</div>
<h2>Bot picker: nothing but the drawing</h2>
<p>A row that exposes no source and no attribute: shape from the path, colour from the ink.</p>
<div class="row" id="picker">${AGENTS.slice(0, 9).map((agent, index) => `<span class="cell">${shippedFace({ sourceId: "", shape: SHAPES[(index + 3) % SHAPES.length], color: COLORS[(index + 5) % COLORS.length], state: "idle", size: 28 }).replace(' data-source-id=""', "")}</span>`).join("")}</div>
<script>${overlayScript}</script>
<script>
  const STATES = ${JSON.stringify(STATES)};
  const figures = [...document.querySelectorAll("figure")];
  let step = 0;
  function advance() {
    step += 1;
    figures.forEach((figure, index) => {
      const state = STATES[(index + step) % STATES.length];
      figure.querySelector("[data-grok-state]").setAttribute("data-grok-state", state);
      figure.querySelector(".state").textContent = state;
    });
  }
  window.__caisraAdvance = advance;
  if (!new URLSearchParams(location.search).has("still")) setInterval(advance, 2400);
</script>
</body>
</html>
`;
const buildDir = path.join(desktopRoot, ".build");
await mkdir(buildDir, { recursive: true });
await mkdir(shotsDir, { recursive: true });
const htmlFile = path.join(buildDir, "face-preview.html");
await writeFile(htmlFile, html);
console.log("wrote", path.relative(desktopRoot, htmlFile));

const videoDir = path.join(buildDir, "face-preview-video");
await rm(videoDir, { recursive: true, force: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--use-gl=swiftshader"] });
const problems = [];
const lines = [];
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 1060 }, deviceScaleFactor: 2, recordVideo: { dir: videoDir, size: { width: 1180, height: 1060 } } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.text().includes("[CaisraFaceOverlay]")) lines.push(message.text());
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`));
  await page.goto(`file://${htmlFile}`);
  await page.waitForFunction((count) => document.querySelectorAll("[data-caisra-face] .caisra-face__face[transform]").length >= count, AGENTS.length + 8 + 9, { timeout: 10_000 });
  await page.mouse.move(590, 360);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shotsDir, "face-preview.png") });
  console.log("shot harness/shots/face-preview.png");
  await page.mouse.move(40, 120, { steps: 20 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotsDir, "face-preview-gaze.png") });
  console.log("shot harness/shots/face-preview-gaze.png");
  await page.mouse.move(590, 360, { steps: 30 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__caisraAdvance());
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__caisraAdvance());
  await page.waitForTimeout(1800);
  const measured = await page.evaluate(() => ({
    marks: document.querySelectorAll(".sand-grok-bot-mark").length,
    painted: document.querySelectorAll("[data-caisra-face]").length,
    moving: document.querySelectorAll("[data-caisra-face] .caisra-face__face[transform]").length,
    sampleFace: document.querySelector("[data-caisra-face] .caisra-face__face")?.getAttribute("transform"),
    keys: [...document.querySelectorAll("main [data-caisra-face]")].map((face) => face.getAttribute("data-face-key")),
    editorKeys: [...document.querySelectorAll("#editor [data-caisra-face]")].map((face) => face.getAttribute("data-face-key")),
    editorCuts: new Set([...document.querySelectorAll("#editor [data-caisra-face]")].map((face) => /href="#[^"]*-cuts-([A-Za-z]+)-/.exec(face.innerHTML)?.[1])).size,
    pickerKeys: [...document.querySelectorAll("#picker [data-caisra-face]")].map((face) => face.getAttribute("data-face-key")),
  }));
  console.log("measured", JSON.stringify(measured));
  if (measured.moving !== AGENTS.length + 17) problems.push(`expected ${AGENTS.length + 17} moving faces, found ${measured.moving}`);
  if (new Set(measured.keys).size !== AGENTS.length) problems.push(`expected ${AGENTS.length} different faces, found ${new Set(measured.keys).size}`);
  if (new Set(measured.editorKeys).size !== 8 || measured.editorCuts !== 1) problems.push(`expected 8 editor cells with one cut pattern, found ${new Set(measured.editorKeys).size} keys and ${measured.editorCuts} cut patterns`);
  if (new Set(measured.pickerKeys).size !== 9) problems.push(`expected 9 different picker faces, found ${new Set(measured.pickerKeys).size}`);
  await context.close();
  const [recorded] = (await readdir(videoDir)).filter((name) => name.endsWith(".webm"));
  if (recorded == null) problems.push("no video was recorded");
  else {
    await rename(path.join(videoDir, recorded), path.join(shotsDir, "face-preview.webm"));
    console.log("video harness/shots/face-preview.webm");
  }
} finally {
  await browser.close();
}
for (const line of lines) console.log(line.slice(0, 400));
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}

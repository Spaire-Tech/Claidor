// A moving preview of the clay faces under Grok's motion, offline.
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

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const shotsDir = path.join(here, "shots");
const CHROMIUM = process.env.SHOT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// Agent ids as the app mints them are opaque; these stand in for eighteen agents.
const AGENTS = ["perrin", "juno", "mira", "sable", "board-pack", "bass", "terra", "luna", "caisra", "ines", "ola", "remy", "nova", "kip", "zed", "tao", "bo", "ada"];
// The states the app actually puts a mark in (agent-avatar.tsx,
// personaStateFromAgent) first, then the rest of Grok's table.
const STATES = ["idle", "thinking", "working", "searching", "listening", "sending", "receiving", "excited", "celebrate", "curious", "confused", "sad", "sleeping", "waking", "writing", "happy", "surprised", "bored"];

const overlayScript = await readFile(await buildFaceOverlayScript(), "utf8");
const marks = AGENTS.map((agent, index) => `
  <figure>
    <span aria-hidden="true" class="sand-agent-avatar sand-grok-bot-mark" data-avatar-color="blue" data-avatar-shape="blob" style="--fg: #2A92FE; width: 96px; height: 96px; display: block;">
      <svg data-grok-state="${STATES[index % STATES.length]}" data-source-id="sand-agent-mark-source-agent-${agent}" viewBox="-15 -15 259 259" width="96" height="96" xmlns="http://www.w3.org/2000/svg"><path d="M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534Z" fill="currentColor"/></svg>
    </span>
    <figcaption><b>${agent}</b><br><span class="state">${STATES[index % STATES.length]}</span></figcaption>
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
  .sand-grok-bot-mark svg { color: var(--fg); }
</style>
</head>
<body>
<h1>Caisra faces, moving</h1>
<p>Eighteen agents' clay faces under Grok Bot's motion table: each cycles through the states, spins on <i>sending</i> and <i>celebrate</i>, bounces on <i>excited</i> and <i>receiving</i>, and the pupils follow the pointer.</p>
<main>${marks}</main>
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
  const context = await browser.newContext({ viewport: { width: 1180, height: 700 }, deviceScaleFactor: 2, recordVideo: { dir: videoDir, size: { width: 1180, height: 700 } } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.text().includes("[CaisraFaceOverlay]")) lines.push(message.text());
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`));
  await page.goto(`file://${htmlFile}`);
  await page.waitForFunction((count) => document.querySelectorAll("[data-caisra-face] .caisra-face__face[transform]").length >= count, AGENTS.length, { timeout: 10_000 });
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
    sampleEyes: document.querySelector("[data-caisra-face] .caisra-face__eyes")?.getAttribute("transform"),
    samplePupil: document.querySelector("[data-caisra-face] .caisra-face__pupil")?.getAttribute("transform"),
  }));
  console.log("measured", JSON.stringify(measured));
  if (measured.moving !== AGENTS.length) problems.push(`expected ${AGENTS.length} moving faces, found ${measured.moving}`);
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

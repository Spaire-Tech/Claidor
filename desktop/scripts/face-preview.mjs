#!/usr/bin/env node
// Builds the clay-face preview page (frontend/src/dev/face-preview.tsx) into
// .build/face-preview/ and, when playwright-core and a Chromium are on hand,
// screenshots it into docs/product/faces-clay/. Neither is part of the app.
//
//   node scripts/face-preview.mjs            build + screenshots
//   node scripts/face-preview.mjs --no-shots build only
//   node scripts/face-preview.mjs --serve    build, then serve on :4173
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".build/face-preview");
const shotsDir = path.resolve(root, "../docs/product/faces-clay");
const args = new Set(process.argv.slice(2));

const CSS = `
:root { color-scheme: light dark; font: 13px/1.4 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; }
html, body { margin: 0; }
.page { min-height: 100vh; padding: 20px 24px 40px; }
.page[data-theme="cursor-light"] { background: #ffffff; color: #1d1d1f; }
.page[data-theme="cursor-dark"] { background: #1c1c1e; color: #f2f2f4; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-bottom: 18px; }
.group { display: inline-flex; gap: 4px; align-items: center; }
.group button { font: inherit; padding: 3px 9px; border-radius: 6px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; cursor: pointer; }
.group button[aria-pressed="true"] { background: rgba(128,128,128,.22); }
.tone { display: inline-block; width: 18px; height: 18px; border-radius: 50%; }
.tones small { margin-left: 8px; opacity: .7; }
.grid-section { margin: 22px 0; }
.grid-section h2 { font-size: 13px; font-weight: 600; margin: 0 0 8px; opacity: .8; }
.grid { display: inline-grid; align-items: center; }
.label { font-size: 11px; opacity: .65; text-align: center; }
.row-label { text-align: right; padding-right: 8px; white-space: nowrap; }
.row-label small { display: block; opacity: .7; }
.cell { display: inline-block; line-height: 0; }
`;

async function bundle() {
  await mkdir(outDir, { recursive: true });
  await build({
    entryPoints: [path.join(root, "frontend/src/dev/face-preview.tsx")],
    outfile: path.join(outDir, "face-preview.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: false,
    logLevel: "warning",
  });
  await writeFile(path.join(outDir, "face-preview.css"), CSS);
  await writeFile(path.join(outDir, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clay faces</title><link rel="stylesheet" href="./face-preview.css"></head>
<body><div id="root"></div><script src="./face-preview.js"></script></body></html>
`);
  return path.join(outDir, "index.html");
}

async function screenshots(page) {
  let chromium;
  try { ({ chromium } = await import("playwright-core")); } catch { console.log("playwright-core is not installed; no screenshots."); return; }
  const executablePath = process.env.FACE_PREVIEW_CHROMIUM ?? undefined;
  const browser = await chromium.launch({ executablePath }).catch(async (error) => {
    for (const candidate of ["/opt/pw-browsers/chromium/chrome-linux/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]) {
      try { return await chromium.launch({ executablePath: candidate }); } catch { /* next */ }
    }
    throw error;
  });
  await mkdir(shotsDir, { recursive: true });
  const measured = {};
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
    const tab = await context.newPage();
    const errors = [];
    tab.on("pageerror", (error) => errors.push(String(error)));
    tab.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") errors.push(message.text()); });
    await tab.goto(`${pathToFileURL(page).href}?theme=${theme}&state=idle`);
    await tab.waitForSelector("svg.sand-face");
    await tab.waitForTimeout(600);
    measured[theme] = await tab.evaluate(() => {
      const faces = Array.from(document.querySelectorAll("svg.sand-face"));
      const first = faces[0];
      const sample = (selector) => { const node = first.querySelector(selector); return node == null ? null : getComputedStyle(node).getPropertyValue(selector.includes("stop") ? "stop-color" : "fill"); };
      return {
        faces: faces.length,
        stopColor: sample("radialGradient stop"),
        hairVar: getComputedStyle(first).getPropertyValue("--sand-face-hair").trim(),
        sclera: getComputedStyle(first.querySelector("circle[fill='var(--sand-face-sclera)']")).fill,
        transforms: { face: first.querySelector("g[transform]").getAttribute("transform"), eyes: first.querySelectorAll("g[transform]")[1]?.getAttribute("transform") },
        styleSheets: document.querySelectorAll("#sand-face-style").length,
      };
    });
    // Mid-animation frames, so the record shows the loop running, not a resting pose.
    await tab.waitForTimeout(700);
    const sections = await tab.$$("section.grid-section");
    await sections[5].screenshot({ path: path.join(shotsDir, `faces-clay-states-${theme}.png`) });
    await sections[1].screenshot({ path: path.join(shotsDir, `faces-clay-28px-${theme}.png`) });
    if (theme === "light") {
      await sections[4].screenshot({ path: path.join(shotsDir, "faces-clay-80px-light.png") });
      await sections[0].screenshot({ path: path.join(shotsDir, "faces-clay-16px-light.png") });
    }
    // The whole page, all five sizes, at 1x so the record stays small.
    const whole = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
    await whole.goto(`${pathToFileURL(page).href}?theme=${theme}&state=idle`);
    await whole.waitForSelector("svg.sand-face");
    await whole.waitForTimeout(400);
    await whole.screenshot({ path: path.join(shotsDir, `faces-clay-${theme}.png`), fullPage: true });
    await whole.close();
    measured[theme].errors = errors;
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify(measured, null, 2));
  console.log(`screenshots in ${shotsDir}`);
}

const page = await bundle();
console.log(`built ${page}`);
if (args.has("--serve")) {
  const { createServer } = await import("node:http");
  const { default: sirv } = await import("sirv");
  createServer(sirv(outDir, { dev: true })).listen(4173, () => console.log("http://localhost:4173/"));
} else if (!args.has("--no-shots")) {
  await screenshots(page);
}

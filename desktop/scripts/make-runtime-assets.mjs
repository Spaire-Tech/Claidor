/**
 * The 18 renderer runtime assets, drawn here.
 *
 * `frontend/manifests/renderer-runtime-assets.json` names them and gives the
 * sha256 of each as 0.18.0 shipped it. None of them is in this repository and
 * none ever was: the whole vendored reconstruction contains exactly two binary
 * files, a docs screenshot and the icon webfont. They were build output of a
 * bundle we do not have, so they cannot be recovered — only replaced. Every
 * other tool logo in the onboarding grid (29 of them) is an inline data URI in
 * tool-assets.ts and is unaffected.
 *
 * Without them the onboarding screen draws broken-image boxes, which is what
 * the founder saw on 19 September.
 *
 * These are drawn from the app's own palette (runtime-theme-token-installer.ts)
 * so they sit inside the design rather than beside it. Chromium rasterises
 * them, so the type is real type. Run: node scripts/make-runtime-assets.mjs
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium } from "./lib/simeon-logo.mjs";
import { appIconPageMarkup } from "./make-app-icon.mjs";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend/runtime-assets");
const manifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend/manifests/renderer-runtime-assets.json");
/** `node scripts/make-runtime-assets.mjs app-icon` redraws only the files whose name contains the argument. */
const only = process.argv.slice(2);
const wanted = (file) => only.length === 0 || only.some((part) => file.includes(part));

/** Straight out of RUNTIME_PALETTE / SAND_DATA. */
const INK = "#141414";
const PAPER = "#fcfcfc";
const SAND = ["#c8af98", "#ae8968", "#97683d", "#734f2e"];

/**
 * The sixteen that were externalised are third-party marks. We do not hold
 * them and will not draw imitations of them, so each becomes a neutral tile
 * carrying its initial in the app's own palette — a complete, deliberate grid
 * rather than sixteen broken boxes. Replace with the real mark wherever the
 * vendor's brand terms allow it.
 */
const TOOLS = [
  ["apollo-B0sEgAUH.png", "A"], ["ashby-BidvOSTU.png", "A"], ["box-DrJB_xON.png", "B"],
  ["clay-CXmF7QZG.png", "C"], ["databricks-NEF0SRYx.png", "D"], ["nooks-Da6AC940.png", "N"],
  ["quickbooks-N88wePET.png", "Q"], ["rippling-cz7o1jpc.png", "R"], ["snowflake-B53K53W6.png", "S"],
  ["tableau-DMgl1MR0.png", "T"], ["zoominfo-kXQt8h27.png", "Z"],
  ["calendly-DYRMkyLM.svg", "C"], ["canva-djBDOrSx.svg", "C"], ["mailchimp-AFHOmIeb.svg", "M"],
  ["salesforce-DuGcPENR.svg", "S"], ["workday-DI2a8j1o.svg", "W"],
];

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";

function toolTile(letter) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${INK}" fill-opacity="0.06"/>
  <rect x="0.5" y="0.5" width="127" height="127" rx="27.5" fill="none" stroke="${INK}" stroke-opacity="0.15"/>
  <text x="64" y="64" font-family="${FONT}" font-size="58" font-weight="600"
        fill="${INK}" fill-opacity="0.66" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>`;
}

/** The app icon: the founder's file when present, else the drawing (scripts/make-app-icon.mjs). */
const APP_ICON = (await appIconPageMarkup(512)).markup;

/** The wallpaper behind the agent's demo computer: calm, and never the subject. */
const WALLPAPER = `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1600" viewBox="0 0 2560 1600">
  <defs>
    <linearGradient id="w" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#1a1613"/><stop offset="0.45" stop-color="#2b2420"/>
      <stop offset="1" stop-color="#4a3a2d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.24" r="0.62">
      <stop offset="0" stop-color="${SAND[1]}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="${SAND[1]}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="2560" height="1600" fill="url(#w)"/>
  <rect width="2560" height="1600" fill="url(#glow)"/>
</svg>`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch({
    executablePath: process.env.CAISRA_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const written = [];

  const raster = async (svg, file, width, height, type) => {
    if (!wanted(file)) return;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}</style>${svg}`,
      { waitUntil: "load" },
    );
    const buffer = await page.screenshot({
      type,
      ...(type === "jpeg" ? { quality: 88 } : { omitBackground: true }),
      clip: { x: 0, y: 0, width, height },
    });
    await page.close();
    await writeFile(path.join(outDir, file), buffer);
    written.push([file, buffer.length]);
  };

  // An .svg stays an .svg — it is already the right format and scales.
  for (const [file, letter] of TOOLS) {
    if (!wanted(file)) continue;
    if (file.endsWith(".svg")) {
      const svg = toolTile(letter);
      await writeFile(path.join(outDir, file), svg);
      written.push([file, Buffer.byteLength(svg)]);
    } else {
      await raster(toolTile(letter), file, 128, 128, "png");
    }
  }
  await raster(APP_ICON, "app-icon-C7NKj2u7.png", 512, 512, "png");
  // verify.mjs holds the packaged icon to the manifest's hash, so the manifest follows the drawing.
  if (wanted("app-icon-C7NKj2u7.png")) {
    const icon = await readFile(path.join(outDir, "app-icon-C7NKj2u7.png"));
    const manifest = await readFile(manifestPath, "utf8");
    const line = /^\s*\{ "file": "app-icon-C7NKj2u7\.png".*\},?$/m;
    if (!line.test(manifest)) throw new Error("renderer-runtime-assets.json has no app-icon line to update");
    const sha256 = createHash("sha256").update(icon).digest("hex");
    await writeFile(manifestPath, manifest.replace(line, (found) => `    { "file": "app-icon-C7NKj2u7.png", "bytes": ${icon.length}, "sha256": "${sha256}" }${found.trimEnd().endsWith(",") ? "," : ""}`));
  }
  await raster(WALLPAPER, "demo-computer-wallpaper-BO7Ye4dV.jpg", 2560, 1600, "jpeg");

  await browser.close();
  for (const [file, bytes] of written) console.log(`  ${file.padEnd(40)} ${String(bytes).padStart(9)} bytes`);
  console.log(`\n${written.length} runtime assets -> frontend/runtime-assets/`);
}

await main();

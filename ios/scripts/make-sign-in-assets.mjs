#!/usr/bin/env node
/**
 * The sign-in screen's marks, for the native iPhone app.
 *
 *   node ios/scripts/make-sign-in-assets.mjs
 *
 * Writes ios/Simeon/Assets.xcassets/SignIn/ from simeonlabs.com's own files,
 * so the screen carries the site's brand exactly (the founder, 9 October
 * 2026: "our logo, simeon real logo, below SimeonLabs - with our logo name
 * font (see website)"):
 * - Mark: the logo (sites/simeonlabs.com/public/favicon.svg, the app icon's
 *   four petals) as a vector PDF, a template the app draws in its ink.
 * - Wordmark: "SimeonLabs" (img/wordmark-labs.png, the site bar's), cut to
 *   its letters' own edges, a template too.
 * - Google: Google's "G", in its four colours, as a vector PDF (the mark
 *   Google's sign-in buttons carry).
 * - Apple: the Apple logo of the site's Download button (index.html,
 *   `svg.apl`), cut to its own edges, so the app sizes it by its true height
 *   (a template, in the button's ink).
 *
 * And server/simeon/desktop/sign_in_brand.py: the same mark, wordmark (600
 * pixels wide) and "G" for the pages the sign-in sheet shows after the
 * screen (`_page` in app_sign_in.py), so they match it.
 *
 * Drawn by Chromium (CHROMIUM, else the Linux path), as make-assets.mjs.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const site = path.join(root, "sites/simeonlabs.com/public");
const out = path.join(root, "ios/Simeon/Assets.xcassets/SignIn");
const serverOut = path.join(root, "server/simeon/desktop/sign_in_brand.py");
const require = createRequire(path.join(root, "desktop/package.json"));
const { chromium } = require("playwright-core");

/** Google's "G", from Google's sign-in button artwork. */
export const GOOGLE_G = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

/** The logo's own drawing, without the site's light and dark styles: one path, black. */
export function markSVG(favicon) {
  const viewBox = /viewBox="([^"]+)"/.exec(favicon)?.[1];
  const paths = [...favicon.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  if (viewBox == null || paths.length === 0) throw new Error("favicon.svg has no viewBox or path");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${paths.map((d) => `<path fill="#000" d="${d}"/>`).join("")}</svg>`;
}

function imageset(files, { template, vector }) {
  return `${JSON.stringify({
    images: files.map((filename) => ({ filename, idiom: "universal" })),
    info: { author: "xcode", version: 1 },
    properties: { ...(vector ? { "preserves-vector-representation": true } : {}), ...(template ? { "template-rendering-intent": "template" } : {}) },
  }, null, 2)}\n`;
}

async function write(name, file, bytes, options) {
  const dir = path.join(out, `${name}.imageset`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), bytes);
  await writeFile(path.join(dir, "Contents.json"), imageset([file], options));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "Contents.json"), `${JSON.stringify({ info: { author: "xcode", version: 1 }, properties: { "provides-namespace": true } }, null, 2)}\n`);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  // A vector PDF the size of the drawing's own box.
  const pdf = async (svg, width, height) => {
    await page.setContent(`<html><head><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0}svg{display:block;width:${width}px;height:${height}px}</style></head><body>${svg}</body></html>`);
    return page.pdf({ width: `${width}px`, height: `${height}px`, printBackground: false, pageRanges: "1" });
  };
  const favicon = await readFile(path.join(site, "favicon.svg"), "utf8");
  await write("Mark", "simeon-mark.pdf", await pdf(markSVG(favicon), 120, 120), { template: true, vector: true });
  await write("Google", "google-g.pdf", await pdf(GOOGLE_G, 48, 48), { template: false, vector: true });
  const index = await readFile(path.join(site, "index.html"), "utf8");
  const appleD = /<svg class="apl"[^>]*><path[^>]* d="([^"]+)"/.exec(index)?.[1];
  if (appleD == null) throw new Error("index.html has no svg.apl");
  await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240"><path id="p" d="${appleD}"/></svg>`);
  const box = await page.evaluate(() => { const b = document.getElementById("p").getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const appleSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><path fill="#000" d="${appleD}"/></svg>`;
  await write("Apple", "apple-logo.pdf", await pdf(appleSVG, Math.round(box.w * 10) / 2, Math.round(box.h * 10) / 2), { template: true, vector: true });

  // The wordmark cut to its letters: the site masks with the picture's alpha, so its edges are where alpha is.
  const wordmark = await readFile(path.join(site, "img/wordmark-labs.png"));
  const cut = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    const pad = 2;
    const box = { x: Math.max(0, left - pad), y: Math.max(0, top - pad), w: Math.min(width, right + pad + 1) - Math.max(0, left - pad), h: Math.min(height, bottom + pad + 1) - Math.max(0, top - pad) };
    const trimmed = document.createElement("canvas");
    trimmed.width = box.w; trimmed.height = box.h;
    trimmed.getContext("2d").drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return { png: trimmed.toDataURL("image/png"), box };
  }, `data:image/png;base64,${wordmark.toString("base64")}`);
  await write("Wordmark", "simeonlabs-wordmark.png", Buffer.from(cut.png.split(",")[1], "base64"), { template: true, vector: false });

  // The server's copy: the wordmark at 600 pixels (three times the 200 it is drawn at), as a mask.
  const small = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = Math.round(600 * image.naturalHeight / image.naturalWidth);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { png: canvas.toDataURL("image/png").split(",")[1], width: canvas.width, height: canvas.height };
  }, cut.png);
  const viewBox = /viewBox="([^"]+)"/.exec(favicon)[1];
  const markPaths = [...favicon.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  const wrap = (text) => text.match(/.{1,76}/g).map((line) => `    "${line}"`).join("\n");
  await writeFile(serverOut, [
    '"""simeonlabs.com\'s mark, its "SimeonLabs" wordmark and Google\'s "G", for the',
    "pages the sign-in sheet shows (`_page` in app_sign_in.py), so they match the",
    "iPhone's sign-in screen.",
    "",
    "Generated by ios/scripts/make-sign-in-assets.mjs from",
    "sites/simeonlabs.com/public (favicon.svg, img/wordmark-labs.png). Do not edit",
    'by hand."""',
    "",
    `MARK_VIEWBOX = "${viewBox}"`,
    `MARK_PATH = (\n${wrap(markPaths.join(" "))}\n)`,
    "",
    "#: The wordmark cut to its letters, 600 pixels wide, black on clear: a mask.",
    `WORDMARK_WIDTH = ${small.width}`,
    `WORDMARK_HEIGHT = ${small.height}`,
    `WORDMARK_PNG_BASE64 = (\n${wrap(small.png)}\n)`,
    "",
    `GOOGLE_G_SVG = (\n${wrap(GOOGLE_G.replace(/"/g, "'"))}\n)`,
    "",
  ].join("\n"));
  await browser.close();
  console.log(`wrote ${path.relative(root, out)}: Mark, Google, Wordmark (${cut.box.w}×${cut.box.h}); ${path.relative(root, serverOut)}`);
}

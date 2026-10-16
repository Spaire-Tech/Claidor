#!/usr/bin/env node
/**
 * The Mac's own logos and brand colours, for the native iPhone app.
 *
 *   node ios/scripts/make-assets.mjs
 *
 * Writes, from desktop/brand (the files the Mac window embeds):
 * - ios/Simeon/Assets.xcassets/Brands/<key>: the 72 app logos a message
 *   names (app-logos/, apps.json), then the 37 connectors added since
 *   (ios/scripts/connector-mentions.json, from connector-logos/; the web
 *   window does not read that list). The one-colour ones are templates, so
 *   the app tints them in the name's colour, as the Mac masks them. The
 *   group is copied to mac/Simeon/Assets.xcassets/Brands.
 * - ios/Simeon/Assets.xcassets/FileIcons/<kind>: the PDF, Word, Excel and
 *   PowerPoint artwork of a file card (file-icons/).
 * - ios/Simeon/Assets.xcassets/Connectors/<id>: the 79 connectors' marks of
 *   the Plugins screen (connector-logos/), each with its dark version where
 *   it has one: a file in connector-logos-dark/ (GitHub's and Intercom's,
 *   from Composio's logo service with `?theme=dark`), or the mark's own file
 *   drawn in dark mode when it styles itself for it (Mercury's). The other
 *   marks read on the dark tile as they are; Composio's dark theme changes
 *   no other of them.
 * - ios/SimeonCore/Sources/SimeonCore/GeneratedBrands.swift: every spelling
 *   a message can name (with the Mac's aliases and exclusions) and its
 *   colour in light and dark, worked out by the Mac's own `readableOn`.
 *   (Agents' names are no longer coloured by palette: faces, 12 October 2026.)
 *
 * SVGs are drawn by Chromium (the one on this machine, through the desktop
 * app's playwright-core), so they look as they do in the window.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const brand = path.join(root, "desktop/brand");
const assets = path.join(root, "ios/Simeon/Assets.xcassets");
const patch = await import(pathToFileURL(path.join(root, "desktop/scripts/lib/router-renderer-patch.mjs")).href);
const { appMentionNames, readableOn, MESSAGE_GREY_LIGHT, MESSAGE_GREY_DARK, FILE_ICON_SOURCES } = patch;
const require = createRequire(path.join(root, "desktop/package.json"));
const { chromium } = require("playwright-core");

const SIDE = 144;
const MIME = { ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: SIDE, height: SIDE }, deviceScaleFactor: 1 })).newPage();
const darkPage = await (await browser.newContext({ viewport: { width: SIDE, height: SIDE }, deviceScaleFactor: 1, colorScheme: "dark" })).newPage();

/** One source file drawn into a transparent square, as PNG bytes (in dark mode on `darkPage`). */
async function rasterize(file, on = page) {
  const page = on;
  const bytes = await readFile(file);
  const url = `data:${MIME[path.extname(file)]};base64,${bytes.toString("base64")}`;
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${url}" style="width:${SIDE}px;height:${SIDE}px;object-fit:contain;display:block"></body></html>`);
  await page.waitForFunction(() => { const i = document.getElementById("i"); return i.complete && i.naturalWidth > 0; });
  return page.locator("#i").screenshot({ omitBackground: true, type: "png" });
}

async function imageset(group, name, png, template, darkPng = null) {
  const dir = path.join(assets, group, `${name}.imageset`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.png`), png);
  if (darkPng) await writeFile(path.join(dir, `${name}-dark.png`), darkPng);
  const contents = {
    images: [
      { filename: `${name}.png`, idiom: "universal" },
      ...(darkPng ? [{ appearances: [{ appearance: "luminosity", value: "dark" }], filename: `${name}-dark.png`, idiom: "universal" }] : []),
    ],
    info: { author: "xcode", version: 1 },
    ...(template ? { properties: { "template-rendering-intent": "template" } } : { properties: { "template-rendering-intent": "original" } }),
  };
  await writeFile(path.join(dir, "Contents.json"), `${JSON.stringify(contents, null, 2)}\n`);
}

async function group(name) {
  await rm(path.join(assets, name), { recursive: true, force: true });
  await mkdir(path.join(assets, name), { recursive: true });
  await writeFile(path.join(assets, name, "Contents.json"), `${JSON.stringify({ info: { author: "xcode", version: 1 }, properties: { "provides-namespace": true } }, null, 2)}\n`);
}

// Brands named in messages: the Mac window's, then the connectors added since (connector-mentions.json, the native apps only).
const manifest = JSON.parse(await readFile(path.join(brand, "app-logos/apps.json"), "utf8"));
const extra = JSON.parse(await readFile(path.join(here, "connector-mentions.json"), "utf8"));
await group("Brands");
for (const app of manifest) await imageset("Brands", app.key, await rasterize(path.join(brand, "app-logos", app.logo)), app.mono === true);
for (const app of extra.apps) await imageset("Brands", app.key, await rasterize(path.join(brand, app.logo)), app.mono === true);

// File icons.
await group("FileIcons");
for (const [kind, file] of Object.entries(FILE_ICON_SOURCES)) await imageset("FileIcons", kind, await rasterize(path.join(brand, file)), false);

// Connector marks.
await group("Connectors");
const { readdir } = await import("node:fs/promises");
const { existsSync } = await import("node:fs");
for (const file of (await readdir(path.join(brand, "connector-logos"))).sort()) {
  const ext = path.extname(file);
  if (!MIME[ext]) continue;
  const id = path.basename(file, ext);
  const source = path.join(brand, "connector-logos", file);
  const darkFile = path.join(brand, "connector-logos-dark", `${id}.svg`);
  const selfStyled = ext === ".svg" && (await readFile(source, "utf8")).includes("prefers-color-scheme");
  const dark = existsSync(darkFile) ? await rasterize(darkFile) : selfStyled ? await rasterize(source, darkPage) : null;
  await imageset("Connectors", id, await rasterize(source), false, dark);
}
await browser.close();

// The colours, as the Mac computes them (router-renderer-patch.mjs, logosCss and agentMentionsCss).
const rgbOf = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (rgb) => { const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const byKey = new Map([...manifest, ...extra.apps].map((app) => [app.key, app]));
const names = appMentionNames(manifest);
for (const app of extra.apps) names[app.name] = app.key;
for (const alias of extra.aliases) if (byKey.has(alias.key)) names[alias.name] = alias.key;
const ordinaryWords = new Set(extra.apps.filter((app) => app.ordinaryWord === true).map((app) => app.name));
const mentionRows = Object.entries(names)
  .sort(([a], [b]) => b.length - a.length || a.localeCompare(b))
  .map(([name, key]) => {
    const app = byKey.get(key);
    const color = app.color.toLowerCase();
    const light = readableOn(color, MESSAGE_GREY_LIGHT, "#000000");
    const dark = luminance(rgbOf(color)) < 0.03 ? "#ececec" : readableOn(color, MESSAGE_GREY_DARK, "#ffffff", 4.5);
    return `    BrandMention(name: ${JSON.stringify(name)}, key: ${JSON.stringify(key)}, light: ${JSON.stringify(light)}, dark: ${JSON.stringify(dark)}, mono: ${app.mono === true}, ordinaryWord: ${ordinaryWords.has(name)}),`;
  });

const swift = `// Generated by ios/scripts/make-assets.mjs from desktop/brand and the Mac
// window's patch (router-renderer-patch.mjs). Do not edit by hand.

/** An app a message can name: the spelling, its logo's key, its colour in light and dark, whether its logo is one colour (tinted like the name), and whether the name is also an everyday word (not marked as a sentence's first word: "Link your account"). */
public struct BrandMention: Sendable, Hashable {
  public let name: String
  public let key: String
  public let light: String
  public let dark: String
  public let mono: Bool
  public let ordinaryWord: Bool
}

public enum Brands {
  /** Every spelling, longest first, as the Mac matches them. */
  public static let mentions: [BrandMention] = [
${mentionRows.join("\n")}
  ]
}
`;
await writeFile(path.join(root, "ios/SimeonCore/Sources/SimeonCore/GeneratedBrands.swift"), swift);

// The Mac app draws the same logos from its own catalogue: a copy of the iPhone's Brands.
const { cp } = await import("node:fs/promises");
const macBrands = path.join(root, "mac/Simeon/Assets.xcassets/Brands");
await rm(macBrands, { recursive: true, force: true });
await cp(path.join(assets, "Brands"), macBrands, { recursive: true });
console.log(`brands ${manifest.length}, spellings ${mentionRows.length}, file icons ${Object.keys(FILE_ICON_SOURCES).length}`);

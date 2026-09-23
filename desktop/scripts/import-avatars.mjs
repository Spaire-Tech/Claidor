#!/usr/bin/env node
// Turns the founder's avatars (brand/avatars/*.svg, DiceBear "Adventurer"
// exports, CC BY 4.0 by Lisa Wischofsky) into the data module the faces are
// drawn from: frontend/src/recovered/features/onboarding/signed-in/avatars.generated.ts.
//
// Each export is <defs> of named parts plus a row of <use> placements. The
// module inlines every part in place (no ids, no <use>, so forty copies of one
// avatar can share a page), keeps the part order, records the eye centre (the
// point the loop squints about) and the credit line the licence requires.
//
//   node scripts/import-avatars.mjs           regenerate the module from measures.json
//   node scripts/import-avatars.mjs --measure re-measure the parts in Chromium first
//   node scripts/import-avatars.mjs --check   fail if the module is stale
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "brand/avatars");
const target = path.join(root, "frontend/src/recovered/features/onboarding/signed-in/avatars.generated.ts");
export const SOURCE_BOX = 762;

function fail(message) { throw new Error(message); }

/** The top-level <g id="…">…</g> blocks of <defs>, walked by depth (a part may hold one <g fill> inside). */
function parseDefs(svg) {
  const defs = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? fail("no <defs>");
  const parts = new Map();
  const tags = [...defs.matchAll(/<g\b[^>]*>|<\/g>/g)];
  let depth = 0, open = null;
  for (const tag of tags) {
    if (tag[0] === "</g>") {
      depth -= 1;
      if (depth === 0 && open != null) {
        parts.set(open.id, defs.slice(open.end, tag.index).trim());
        open = null;
      }
      continue;
    }
    if (depth === 0) {
      const id = tag[0].match(/^<g id="([^"]+)">$/)?.[1] ?? fail(`unexpected top-level group ${tag[0]}`);
      open = { id, end: tag.index + tag[0].length };
    }
    depth += 1;
  }
  if (depth !== 0) fail("unbalanced <g> in defs");
  // A part may place another part (a long hair carries the earrings): inline it.
  const resolve = (markup, trail) => markup.replace(/<use transform="translate\((-?[\d.]+) (-?[\d.]+)\)" href="#([^"]+)"\/>/g, (_, x, y, id) => {
    if (trail.includes(id)) fail(`${id}: parts reference each other in a loop`);
    return `<g transform="translate(${x} ${y})">${resolve(parts.get(id) ?? fail(`${id}: placed but not in defs`), [...trail, id])}</g>`;
  });
  for (const [id, markup] of parts) {
    const inlined = resolve(markup, [id]);
    if (/\bid=|<use|<image|url\(#/.test(inlined)) fail(`${id}: markup still references an id`);
    parts.set(id, inlined);
  }
  return parts;
}

function parseUses(svg) {
  const body = svg.slice(svg.indexOf("</defs>"));
  const uses = [];
  for (const match of body.matchAll(/<use transform="translate\((-?[\d.]+) (-?[\d.]+)\)" href="#([^"]+)"\/>/g)) {
    uses.push({ x: Number(match[1]), y: Number(match[2]), id: match[3] });
  }
  if (uses.length === 0) fail("no <use> placements");
  return uses;
}

// The eye centre is measured, not parsed: `--measure` asks Chromium for the
// bounding box of every placed part (getBBox) and writes brand/avatars/measures.json,
// which is committed; the module is generated from it. An earlier path-data
// parser was 95 units out on one eye variant, so no parser is trusted here.
const measuresFile = path.join(sourceDir, "measures.json");

async function measure(files) {
  const { chromium } = await import("playwright-core");
  const candidates = [process.env.FACE_PREVIEW_CHROMIUM, "/opt/pw-browsers/chromium/chrome-linux/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].filter(Boolean);
  let browser = null, lastError = null;
  for (const executablePath of [undefined, ...candidates]) {
    try { browser = await chromium.launch({ executablePath }); break; } catch (error) { lastError = error; }
  }
  if (browser == null) throw lastError;
  const page = await browser.newPage();
  const measures = {};
  for (const file of files) {
    const svg = (await readFile(path.join(sourceDir, file), "utf8")).replace(/<metadata[\s\S]*?<\/metadata>/, "");
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
    measures[file.replace(".svg", "")] = await page.evaluate(() => {
      const root = document.querySelector("svg");
      const parts = {};
      for (const use of root.querySelectorAll("g[clip-path] > use")) {
        const box = use.getBBox();
        const [, tx, ty] = use.getAttribute("transform").match(/translate\((-?[\d.]+) (-?[\d.]+)\)/);
        parts[use.getAttribute("href").slice(1).replace(/-[0-9a-f]{8}$/, "")] = { x: +(box.x + +tx).toFixed(1), y: +(box.y + +ty).toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) };
      }
      const all = root.querySelector("g[clip-path]").getBBox();
      return { all: { x: +all.x.toFixed(1), y: +all.y.toFixed(1), w: +all.width.toFixed(1), h: +all.height.toFixed(1) }, parts };
    });
  }
  await browser.close();
  await writeFile(measuresFile, `${JSON.stringify(measures, null, 1)}\n`);
  return measures;
}

export async function importAvatars({ remeasure = false } = {}) {
  const files = (await readdir(sourceDir)).filter((name) => /^adventurer-\d\d\.svg$/.test(name)).sort();
  if (files.length === 0) fail(`no avatars in ${sourceDir}`);
  const measures = remeasure ? await measure(files) : JSON.parse(await readFile(measuresFile, "utf8").catch(() => fail(`${measuresFile} is missing; run with --measure (needs playwright-core and a Chromium)`)));
  const avatars = [];
  let credit = null;
  for (const file of files) {
    const svg = await readFile(path.join(sourceDir, file), "utf8");
    if (!svg.includes('viewBox="0 0 762 762"')) fail(`${file}: not a 762 box`);
    const rights = svg.match(/<dc:rights>([^<]+)<\/dc:rights>/)?.[1] ?? fail(`${file}: no licence line`);
    if (!rights.includes("CC BY 4.0")) fail(`${file}: licence is not CC BY 4.0`);
    credit ??= rights.replace(/[“”]/g, '"');
    const parts = parseDefs(svg);
    const uses = parseUses(svg);
    const key = file.replace(".svg", "");
    const measured = measures[key] ?? fail(`${file}: not in measures.json; run with --measure`);
    const layers = uses.map(({ x, y, id }) => {
      const markup = parts.get(id) ?? fail(`${file}: ${id} not in defs`);
      const part = id.replace(/-[0-9a-f]{8}$/, "");
      const box = measured.parts[part] ?? fail(`${file}: ${part} was not measured; run with --measure`);
      return { part, x, y, markup, box };
    });
    const eyes = layers.find((layer) => layer.part.startsWith("eyes-")) ?? fail(`${file}: no eyes`);
    const head = layers.find((layer) => layer.part.startsWith("head-")) ?? fail(`${file}: no head`);
    for (const required of ["mouth-", "hair-"]) if (!layers.some((layer) => layer.part.startsWith(required))) fail(`${file}: no ${required} part`);
    avatars.push({
      key,
      parts: layers.map((layer) => layer.part),
      eyes: { cx: Math.round((eyes.box.x + eyes.box.w / 2) * 10) / 10, cy: Math.round((eyes.box.y + eyes.box.h / 2) * 10) / 10 },
      head: head.box,
      bounds: measured.all,
      layers: layers.map(({ part, x, y, markup }) => ({ part, x, y, markup })),
    });
  }
  return { avatars, credit };
}

function render({ avatars, credit }) {
  const lines = [
    "// Generated by scripts/import-avatars.mjs from brand/avatars/*.svg. Do not edit.",
    `// ${credit}`,
    "// Attribution is required by that licence: keep this line, and the credit",
    "// ADVENTURER_CREDIT below, wherever these drawings ship.",
    "",
    "export interface AvatarLayer { readonly part: string; readonly x: number; readonly y: number; readonly markup: string }",
    "export interface AvatarBox { readonly x: number; readonly y: number; readonly w: number; readonly h: number }",
    "export interface Avatar { readonly key: string; readonly parts: readonly string[]; readonly eyes: { readonly cx: number; readonly cy: number }; readonly head: AvatarBox; readonly bounds: AvatarBox; readonly layers: readonly AvatarLayer[] }",
    "",
    `export const AVATAR_SOURCE_BOX = ${SOURCE_BOX};`,
    `export const ADVENTURER_CREDIT = ${JSON.stringify(credit)};`,
    `export const AVATAR_KEYS = [${avatars.map((avatar) => JSON.stringify(avatar.key)).join(", ")}] as const;`,
    "export type AvatarKey = typeof AVATAR_KEYS[number];",
    "",
    "export const AVATARS: Readonly<Record<AvatarKey, Avatar>> = {",
  ];
  for (const avatar of avatars) {
    lines.push(`  ${JSON.stringify(avatar.key)}: {`);
    lines.push(`    key: ${JSON.stringify(avatar.key)},`);
    lines.push(`    parts: ${JSON.stringify(avatar.parts)},`);
    lines.push(`    eyes: { cx: ${avatar.eyes.cx}, cy: ${avatar.eyes.cy} },`);
    lines.push(`    head: ${JSON.stringify(avatar.head)},`);
    lines.push(`    bounds: ${JSON.stringify(avatar.bounds)},`);
    lines.push("    layers: [");
    for (const layer of avatar.layers) lines.push(`      { part: ${JSON.stringify(layer.part)}, x: ${layer.x}, y: ${layer.y}, markup: ${JSON.stringify(layer.markup)} },`);
    lines.push("    ],");
    lines.push("  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = await importAvatars({ remeasure: process.argv.includes("--measure") });
  const output = render(data);
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== output) { console.error(`${path.relative(root, target)} is stale; run node scripts/import-avatars.mjs`); process.exit(1); }
    console.log(`${data.avatars.length} avatars, module up to date`);
  } else {
    await writeFile(target, output);
    console.log(`${data.avatars.length} avatars → ${path.relative(root, target)} (${(output.length / 1024).toFixed(0)} KB)`);
    for (const avatar of data.avatars) console.log(`  ${avatar.key}  eyes (${avatar.eyes.cx}, ${avatar.eyes.cy})  ${avatar.parts.join(" ")}`);
  }
}

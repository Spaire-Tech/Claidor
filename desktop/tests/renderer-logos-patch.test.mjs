/** Files and apps wear their real logos (27 September 2026): the file card's icon by kind, PowerPoint as its own kind, and the sidebar's "Connect apps" pill. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("every logo is a readable image, and the stylesheet paints each file kind and app tile", async () => {
  const { FILE_ICON_SOURCES, APP_LOGO_SOURCES, readLogoAssets, patchOriginalLogosStylesheet, LOGOS_MARKER } = await import(patchModule);
  for (const file of [...Object.values(FILE_ICON_SOURCES), ...Object.values(APP_LOGO_SOURCES)]) {
    const bytes = await readFile(path.join(repoRoot, "brand", file));
    if (file.endsWith(".svg")) assert.match(bytes.toString("utf8", 0, 200), /^<svg[ >]/, `${file} is plain SVG, not gzip`);
    else assert.equal(bytes.toString("latin1", 8, 12), "WEBP", `${file} is WebP`);
  }
  const assets = await readLogoAssets();
  const sheet = patchOriginalLogosStylesheet(":root{}", assets);
  assert.ok(sheet.includes(LOGOS_MARKER));
  for (const kind of ["pdf", "document", "markdown", "table", "slides"]) assert.ok(sheet.includes(`span[data-kind="${kind}"][data-size]`), `${kind} is painted`);
  // Markdown wears Word's logo, as asked.
  const logoOf = (kind) => sheet.match(new RegExp(`span\\[data-kind="${kind}"\\]\\[data-size\\][^{]*\\{--simeon-file-logo:url\\("([^"]+)"\\)`))[1];
  assert.equal(logoOf("markdown"), logoOf("document"));
  assert.equal(logoOf("pdf"), assets.files.pdf);
  assert.equal(logoOf("table"), assets.files.excel);
  assert.equal(logoOf("slides"), assets.files.powerpoint);
  for (const app of ["gmail", "calendar", "drive"]) assert.ok(sheet.includes(`i[data-app="${app}"]{background-image:url("data:image/`), `${app} tile`);
  // The Microsoft logos are the founder's (the web app's icons), not vscode-icons.
  for (const key of ["word", "excel", "powerpoint"]) assert.match(assets.files[key], /^data:image\/webp;base64,/);
  // Every app a message can name has a colour that holds 3:1 on the message grey in both themes.
  const { contrastRatio, MESSAGE_GREY_LIGHT, MESSAGE_GREY_DARK } = await import(patchModule);
  assert.ok(assets.mentions.length >= 60);
  for (const { key } of assets.mentions) {
    const rule = sheet.match(new RegExp(`\\.simeon-app\\[data-app="${key}"\\]\\{--simeon-app-color:light-dark\\((#[0-9a-f]{6}),(#[0-9a-f]{6})\\)\\}`));
    assert.ok(rule, `${key} has a colour`);
    assert.ok(contrastRatio(rule[1], MESSAGE_GREY_LIGHT) >= 3 && contrastRatio(rule[2], MESSAGE_GREY_DARK) >= 3, `${key} is readable`);
  }
  // Cards speak in the chat's blue: primary buttons inside a message card, and the pending approval badge.
  assert.ok(sheet.includes('.sand-message-card button[data-variant="primary"]:not(#\\#):not(#\\#):not(#\\#){background-color:light-dark(#255a93,#1f5087);border-color:transparent;color:#fff}'));
  assert.ok(sheet.includes('[data-simeon-approval="pending"]:not(#\\#):not(#\\#):not(#\\#){background-color:'));
  // Every card is white; the agent's bubble outside cards is Messages' grey; lines stay the renderer's own.
  assert.ok(sheet.includes("--sand-fill-bubble-agent:light-dark(#e9e9eb,#3b3b3d)"));
  assert.ok(sheet.includes(".sand-message-card{--sand-fill-bubble-agent:var(--sand-fill-elevated)}"));
  assert.ok(!sheet.includes("--sand-border-default:"), "border tokens are not overridden");
  // The narrow sidebar's New button matches the 36 px initials circle, and the wide-sidebar account rules leave the narrow one alone.
  assert.ok(sheet.includes(".sand-agents-sidebar__rail-new .sand-agents-sidebar__new:not(#\\#):not(#\\#):not(#\\#):not(#\\#){width:36px;height:36px;"));
  assert.ok(sheet.includes('.sand-agents-sidebar__account:not([data-collapsed="true"])'));
  assert.ok(!sheet.includes(".sand-agents-sidebar__account:not(#"), "no account rule reaches the collapsed rail");
  assert.throws(() => patchOriginalLogosStylesheet(sheet, assets), /logos block is already present/);
});

test("the button says Connect apps and PowerPoint gets its own kind, on anchors the pinned 0.18.0 chunk carries once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { LOGO_REPLACEMENTS, patchOriginalLogos, readLogoAssets, appMentionNames } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of LOGO_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
  const patched = patchOriginalLogos(chunk, appMentionNames((await readLogoAssets()).mentions));
  assert.ok(patched.includes("syntheticProseCards:n}],__simeonAppMentions]}"), "the message pipeline ends with the app step");
  assert.equal(patched.split("const __simeonAppMentions=").length - 1, 1);
  assert.ok(patched.includes('children:"Connect apps"'));
  assert.ok(patched.includes('notion:{kind:"brand",hex:"#FFFFFF",path:'), "Notion draws its light-mode logo");
  assert.ok(chunk.includes('kWkggS:"sand-1g0q52m",kMwMTN:"sand-1wd3ewq"'), "sand-1g0q52m is still the agent message's background class");
  assert.ok(patched.includes('"data-simeon-approval":N?"pending":void 0,role:"status"'), "the pending approval badge is marked");
  assert.ok(!patched.includes('name:"plug",size:14'));
  assert.ok(patched.includes('r==="pptx"||r==="ppt"?"slides"'));
  assert.ok(patched.includes('tin={slides:{icon24:"file",icon36:"file",tint:"neutral"},markdown:'));
  // The preview router is untouched: a .pptx is still offered no preview.
  assert.ok(patched.includes('e==="docx"?"docx":k6n(n)?"text":"unknown"'));
});

test("the message step marks app names with their logo, leaves links and code alone, and shares the parent's structure tag", async () => {
  const { readLogoAssets, appMentionNames, appMentionsPluginSource } = await import(patchModule);
  const names = appMentionNames((await readLogoAssets()).mentions);
  assert.equal(names.Loom, "loom");
  assert.equal(names["Microsoft Word"], "word");
  assert.equal(names.Word, undefined, "a bare Word is an ordinary word");
  const plugin = new Function(`${appMentionsPluginSource(names)}return __simeonAppMentions;`)();
  const tag = { brand: true };
  const text = (value) => ({ type: "text", value });
  const el = (tagName, children) => ({ type: "element", tagName, properties: {}, data: { sandMarkdown: tag }, children });
  const tree = { type: "root", children: [el("p", [text("Two tools: Loom and Miro, and a notion."), el("a", [text("Loom")]), el("code", [text("Figma")]), text(" see loom.com")])] };
  plugin()(tree);
  const p = tree.children[0].children;
  assert.deepEqual(p.slice(0, 5).map((n) => n.type === "text" ? n.value : `<${n.properties.dataApp}>`), ["Two tools: ", "<loom>", " and ", "<miro>", ", and a notion."]);
  assert.equal(p[1].data.sandMarkdown, tag);
  assert.equal(p[1].children[0].data.sandMarkdown, tag);
  assert.equal(p[1].children[1].value, "Loom", "the words are unchanged");
  assert.equal(p[5].children[0].value, "Loom", "a link's text is left alone");
  assert.equal(p[6].children[0].value, "Figma", "code is left alone");
  const bare = { type: "root", children: [text("Loom")] };
  plugin()(bare);
  assert.equal(bare.children[0].type, "text", "text with no structure tag above it is not touched");
});

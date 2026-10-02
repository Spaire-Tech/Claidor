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
  // Cards are the bubble's grey, solid, with no edge and no glass.
  assert.ok(sheet.includes(".sand-message-card{--sand-fill-bubble-agent:transparent}"));
  assert.match(sheet, /\.sand-message-card :is\([^)]*\.sand-file-card\)[^{]*\{background:var\(--simeon-card-fill\);border-color:transparent;box-shadow:none\}/);
  assert.ok(!/light-dark\(\s*linear-gradient/.test(sheet), "light-dark() holds colours only, never gradients");
  assert.ok(!sheet.includes("saturate(170%)") && !sheet.includes("saturate(160%)") && !sheet.includes(".sand-prompt-attach"), "no glass on cards or buttons");
  assert.ok(!sheet.includes(".sand-agents-sidebar__account .sand-kit-base-avatar"), "the initials circle is the renderer's own again");
  assert.ok(sheet.includes('.sand-agent-item[data-active="true"]:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background:light-dark(#fff,rgba(255,255,255,.12))'), "the selected row is white, not glass");
  assert.ok(sheet.includes("{display:grid;grid-template-columns:1fr auto 1fr;align-items:center}"), "an exchange centres its header");
  assert.match(sheet, /\.sand-chat-header__name:not\(#\\#\):not\(#\\#\):not\(#\\#\):not\(#\\#\)\{background:linear-gradient\(180deg,light-dark\(rgba\(255,255,255,\.92\)[^}]*backdrop-filter:blur\(20px\) saturate\(1\.8\)/, "the header's name pill is white glass");
  assert.ok(sheet.includes(".sand-prompt-send:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background-color:light-dark(#255a93,#1f5087);color:#fff}"), "the composer's send button is the chat's blue");
  // The choice card's options sit on the grey and each key is a round radio with a blue dot on the chosen answer.
  assert.ok(sheet.includes(".sand-widget__options:not(#\\#):not(#\\#):not(#\\#){background:var(--simeon-card-fill);border-color:transparent}"));
  assert.ok(sheet.includes(".sand-widget-option--selected .sand-widget-option__key:not(#\\#):not(#\\#):not(#\\#){opacity:1;border-color:light-dark(#255a93,#5b9be0);background:radial-gradient(circle,light-dark(#255a93,#5b9be0) 0 4px,transparent 4.5px)}"));
  // Dark theme keeps the renderer's own agent bubble; only the light theme takes the Messages grey, and cards follow the bubble of the theme in use.
  assert.ok(sheet.includes('[data-theme*="light"]:not(#\\#):not(#\\#),[data-theme*="light"] :is(.sand-1wuigm2,.ui-1lzgia1):not(#\\#):not(#\\#){--sand-fill-bubble-agent:#e9e9eb}'));
  assert.ok(sheet.includes("{--simeon-card-fill:var(--sand-fill-bubble-agent)}"));
  assert.ok(!/--sand-fill-bubble-agent:light-dark/.test(sheet), "no dark value is forced on the agent bubble");
  // Slack's tile and its name in a message carry the founder's full-colour mark; a file card's empty meta line is dropped.
  assert.match(sheet, /\.sand-tool-icon:has\(>svg path\[d\^="M5\.042 15\.165"\]\)[^{]*\{background:#fff url\("data:image\/webp;base64,/);
  assert.ok(sheet.includes('.simeon-app[data-app="slack"]>.simeon-app__logo{background-image:url("data:image/webp;base64,'));
  assert.ok(sheet.includes(".sand-file-card__meta:empty:not(#\\#):not(#\\#):not(#\\#){display:none}"));
  // A near-black brand is near-white in the dark theme.
  assert.ok(sheet.includes('.simeon-app[data-app="notion"]{--simeon-app-color:light-dark(#000000,#ececec)}'));
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
  assert.ok(patched.includes('slack:{kind:"brand",hex:"#FFFFFF",path:"M5.042 15.165'), "Slack's tile is white under its colour mark, and the glyph the stylesheet keys on is still there");
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

test("the sign-in wordmark is set in Suravaram, carried inside the stylesheet", async () => {
  const { patchOriginalWordmarkStylesheet, readLogoAssets, WORDMARK_MARKER } = await import("../scripts/lib/router-renderer-patch.mjs");
  const { wordmarkFont } = await readLogoAssets();
  assert.match(wordmarkFont, /^data:font\/woff2;base64,/);
  const css = patchOriginalWordmarkStylesheet(".a{}", wordmarkFont);
  assert.ok(css.includes(WORDMARK_MARKER));
  assert.match(css, /\.sand-onboarding__landing h1\{font-family:"Simeon Suravaram"/);
  assert.throws(() => patchOriginalWordmarkStylesheet(css, wordmarkFont), /already present/);
  assert.throws(() => patchOriginalWordmarkStylesheet(".a{}", ""), /did not load/);
});

test("the COO step sits after Meet Simeon, with Simeon at the centre and six agents leaving it", async () => {
  const { COO_REPLACEMENTS, COO_CSS, patchOriginalCooStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const [list, title, screen, hero, component] = COO_REPLACEMENTS;
  assert.match(list[2], /\["landing","meet","coo","computer-demo","name","tools"\]/, "the jobs and create steps are out; the name step follows the computer");
  assert.equal(title[2], 'N="Your agents have their own computer and work just like you"');
  assert.match(screen[2], /^case"coo":return p\.jsx\(__simeonCooStep,\{headingId:xn,onBack:\(\)=>x\.goBack\(ln\),onForward:\(\)=>x\.advance\(ln\)\}\);/);
  assert.match(hero[2], /^case"coo":return\{\.\.\.e,x:0,y:-40,scale:1,opacity:1/);
  assert.match(component[2], /title:"Your personal COO"/);
  assert.match(component[2], /Simeon staffs an agent for whatever needs doing\./);
  assert.equal((component[2].match(/"label":/g) ?? []).length, 6);
  new Function("p", "fde", "tye", "nye", "sd", "re", "Fo", component[2].replace(/function sjn\(n\)\{$/, ""));
  assert.match(COO_CSS, /prefers-reduced-motion:reduce/);
  assert.throws(() => patchOriginalCooStylesheet(patchOriginalCooStylesheet(".a{}")), /already present/);
});

test("Simeon is the first agent, titled COO, and always pinned", async () => {
  const { FIRST_AGENT_REPLACEMENTS, SIMEON_COO_PROFILE } = await import("../scripts/lib/router-renderer-patch.mjs");
  assert.deepEqual({ name: SIMEON_COO_PROFILE.name, title: SIMEON_COO_PROFILE.title }, { name: "Simeon", title: "COO" });
  const by = Object.fromEntries(FIRST_AGENT_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.match(by["first-agent-simeon"], /"name":"Simeon","title":"COO"/);
  assert.match(by["first-agent-from-apps"], /onForward:\(\)=>\{Pe\(\)\}/, "Next on the apps step makes Simeon and finishes");
  assert.match(by["first-agent-title"], /\.\.\.t\.title!=null\?\{title:t\.title\}:\{\}/);
  assert.equal(by["first-agent-no-cos-template"], "");
  // The pin rule, run on its own: the oldest agent titled COO leads the pinned list, once.
  const source = by["coo-pinned-split"].replace(/function t5e\(n,e\)\{.*$/, "");
  const pinCoo = new Function(`${source};return {pin:__simeonPinCoo,id:()=>__simeonCooId}`)();
  const agents = [{ id: "a", title: "Research" }, { id: "s2", title: "COO", createdAt: 9 }, { id: "s", title: "coo", createdAt: 1 }];
  assert.deepEqual(pinCoo.pin(agents, ["a", "s"]), ["s", "a"]);
  assert.equal(pinCoo.id(), "s");
  assert.deepEqual(pinCoo.pin([{ id: "a", title: "" }], ["a"]), ["a"], "an account with no COO is unchanged");
  for (const label of ["coo-no-unpin-item", "coo-no-hide-item", "coo-no-duplicate-item", "coo-no-delete-item"]) assert.match(by[label], /===__simeonCooId\)return null;$/);
  assert.match(by["coo-no-unpin-store"], /!D&&L===__simeonCooId\)return;/);
});

test("the name step: the apps step's agents gather over one field, and the last screen keeps only its line", async () => {
  const { NAME_STEP_REPLACEMENTS, NAME_CSS } = await import("../scripts/lib/router-renderer-patch.mjs");
  const by = Object.fromEntries(NAME_STEP_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.match(by["name-step-screen"], /^case"name":return p\.jsx\(__simeonNameStep,/);
  assert.match(by["name-step-agents"], /^case"name":return\{\.\.\.t,\.\.\.__simeonNameSeat\[e\],opacity:1/);
  assert.match(by["name-step-component"], /title:"What should your agents call you\?"/);
  assert.match(by["name-step-component"], /a\.updateName\(name\)/, "saved through the account's own rename");
  assert.match(by["name-step-component"], /`Hi, \$\{first\}\.`/);
  for (const seat of ["weekly-standup", "invoice-chaser", "sales-forecast"]) assert.match(by["name-step-component"], new RegExp(`"${seat}":\\{"x"`));
  assert.equal(by["hand-off-text-only"], 'x=p.jsxs("div",{className:f,style:m.style,children:[v,b]})');
  assert.match(NAME_CSS, /prefers-reduced-motion:reduce/);
});

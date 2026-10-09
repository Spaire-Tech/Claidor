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
  assert.ok(patched.includes("syntheticProseCards:n}],__simeonAppMentions,__simeonAgentMentions]}"), "the message pipeline ends with the app step, then the agent step");
  assert.equal(patched.split("const __simeonAppMentions=").length - 1, 1);
  assert.equal(patched.split("const __simeonAgentMentions=").length - 1, 1);
  assert.ok(patched.includes("?.id??__simeonRememberedAvatar(n.id)?.color??sle(n.id)}var __simeonAvatarMemory=null;"), "the colour resolver reads the memory before hashing, and the roster note follows it");
  assert.ok(patched.includes("??__simeonRememberedAvatar(n.id)?.shape??u4e(n.id)}"), "so does the shape resolver");
  assert.ok(patched.includes('GX("getCursorAuthStatus",t,()=>e.getStatus().then(__simeonNotePerson))'), "the signed-in person's name is noted");
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

test("the Chief of Staff step sits after Meet Simeon, with Simeon at the centre and six agents linked to him by blue curves", async () => {
  const { COO_REPLACEMENTS, COO_CSS, COO_TITLE, COO_COPY, patchOriginalCooStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const [list, title, screen, hero, component] = COO_REPLACEMENTS;
  assert.match(list[2], /\["landing","meet","coo","connect","computer-demo","name"\]$/, "the jobs, create and apps steps are out; connect sits before the computer; the name step is last");
  assert.equal(title[2], 'N="They have their own computer and work just like you"');
  assert.match(screen[2], /^case"coo":return p\.jsx\(__simeonCooStep,\{headingId:xn,onBack:\(\)=>x\.goBack\(ln\),onForward:\(\)=>x\.advance\(ln\)\}\);/);
  assert.match(hero[2], /^case"coo":return\{\.\.\.e,x:0,y:-40,scale:1,opacity:1/);
  assert.equal(COO_TITLE, "Simeon is your personal Chief of Staff");
  assert.equal(COO_COPY, "He hires an agent for every job you hand off.");
  assert.ok(component[2].includes(`title:${JSON.stringify(COO_TITLE)}`));
  assert.ok(component[2].includes(JSON.stringify(COO_COPY)));
  assert.doesNotMatch(component[2], /whatever needs doing/, "the sign-in tagline's words are not repeated");
  assert.equal((component[2].match(/"label":/g) ?? []).length, 6);
  const crew = JSON.parse(/const __simeonCooCrew=(\[.*?\]);function/.exec(component[2])[1]);
  assert.deepEqual(crew.map((a) => [a.x, a.y]), [[-300, -140], [-300, -40], [-300, 60], [300, -140], [300, -40], [300, 60]], "three a side, spaced");
  assert.equal(crew[0].d, "M-60 0C-160 0 -160 -100 -260 -100", "a curve from Simeon's side to the agent's inner edge");
  assert.equal(crew[4].d, "M60 0C160 0 160 0 260 0");
  assert.ok(crew.every((a, i) => a.delay === 700 + i * 180), "the curves draw one after another");
  new Function("p", "fde", "tye", "nye", "sd", "re", "Fo", component[2].replace(/function sjn\(n\)\{$/, ""));
  assert.ok(component[2].includes('y:-236,className:"simeon-coo__copy"'), "the copy sits high");
  assert.match(COO_CSS, /\.simeon-coo>div:first-child(:not\(#\\#\)){4}\{top:calc\(50% - 296px\)\}/, "the title sits higher than the flow puts it");
  assert.match(COO_CSS, /--simeon-coo-line:light-dark\(rgba\(10,132,255,\.55\)/, "the curves are blue");
  assert.match(COO_CSS, /@keyframes simeon-coo-link\{from\{opacity:\.28/, "an agent is a ghost until its curve arrives");
  assert.match(COO_CSS, /prefers-reduced-motion:reduce/);
  assert.throws(() => patchOriginalCooStylesheet(patchOriginalCooStylesheet(".a{}")), /already present/);
});

test("the Meet step: Simeon arrives large, turns once around himself, then settles under the title", async () => {
  const { MEET_STEP_REPLACEMENTS, MEET_CSS, patchOriginalCooStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const by = Object.fromEntries(MEET_STEP_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.match(by["meet-step-screen"], /^case"meet":return p\.jsx\(__simeonMeetStep,\{headingId:xn,onForward:\(\)=>x\.advance\(ln\),beat:Ejn\(ce\)\}\)$/, "the composer step is replaced");
  assert.match(by["meet-step-beats"], /const __simeonMeetBeats=\[1,16,56\];function Ejn\(n\)\{return n>=__simeonMeetBeats\[2\]\?3:n>=__simeonMeetBeats\[1\]\?2:n>=__simeonMeetBeats\[0\]\?1:0\}/);
  assert.match(by["meet-step-hero"], /^case"meet":return n\.meetBeat<1\?\{\.\.\.e,x:0,y:-40,scale:1\.6,opacity:1,state:"happy",transition:"none",isGazing:!1,turn:"in"\}:n\.meetBeat<3\?\{\.\.\.e,x:0,y:-40,scale:2\.3,opacity:1,state:"happy",transition:"slow",isGazing:!1,turn:n\.meetBeat===2\?"spin":"in"\}:\{\.\.\.e,x:0,y:-40,scale:1,opacity:1,state:"idle",transition:"standard",isGazing:!0\};$/, "fading in and growing, turning, then the seat he holds on the Chief of Staff step");
  assert.match(MEET_CSS, /\.simeon-turn--in\{animation:simeon-meet-fade 1\.2s/);
  assert.match(MEET_CSS, /\.simeon-turn--on\{animation:simeon-meet-fade 1\.2s cubic-bezier\(\.4,0,\.2,1\) both,simeon-meet-turn 1\.4s/, "the turn keeps the fade going");
  assert.match(MEET_CSS, /\.simeon-meet>div:first-child(:not\(#\\#\)){4}\{top:calc\(50% - 168px\)\}/, "the title sits closer to him");
  assert.match(MEET_CSS, /\.simeon-meet>div:last-child(:not\(#\\#\)){4}\{top:calc\(50% \+ 56px\)\}/, "Next sits closer to him");
  assert.match(by["meet-step-turn"], /\|\|e\[46\]!==t\.turn\?/, "the turn joins the placed element's memo");
  assert.match(by["meet-step-turn"], /className:t\.turn==="spin"\?"simeon-turn simeon-turn--on":t\.turn==="in"\?"simeon-turn simeon-turn--in":"simeon-turn"/);
  assert.equal(by["meet-step-turn-cache"], "function mqn(n){const e=he.c(47),");
  assert.match(by["meet-step-component"], /title:"Meet Simeon"\}\)\}function __simeonNameStep\(n\)\{$/);
  assert.doesNotMatch(by["meet-step-component"], /H2e|typedCount|composer/, "nothing is typed under the avatar any more");
  assert.match(MEET_CSS, /rotateY\(360deg\)/);
  assert.match(MEET_CSS, /\.simeon-meet--settled>div\{opacity:1;transform:none\}/);
  assert.match(MEET_CSS, /prefers-reduced-motion:reduce/);
  assert.ok(patchOriginalCooStylesheet(".a{}").includes(MEET_CSS));
});

test("the connect step: the site's connector scene with Simeon on the glass, the row fading at both ends", async () => {
  const { CONNECT_STEP_REPLACEMENTS, CONNECT_TITLE, CONNECT_LOGO_SOURCES, connectCss, readLogoAssets, patchOriginalLogosStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const by = Object.fromEntries(CONNECT_STEP_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.equal(CONNECT_TITLE, "Your agents connect to the apps you already use");
  assert.match(by["connect-step-screen"], /^case"connect":return p\.jsx\(__simeonConnectStep,\{headingId:xn,onBack:\(\)=>x\.goBack\(ln\),onForward:\(\)=>x\.advance\(ln\)\}\);case"computer-demo":return p\.jsx\(Yqn,\{$/);
  assert.match(by["connect-step-hero"], /^case"connect":return\{\.\.\.e,x:0,y:-20,scale:1\.3,opacity:1,state:"idle",transition:"standard",isGazing:!0\};case"computer-demo":return\{\.\.\.e,$/, "Simeon sits on the tile, large");
  const component = by["connect-step-component"];
  assert.ok(component.includes(`title:${JSON.stringify(CONNECT_TITLE)}`));
  assert.deepEqual(JSON.parse(/const __simeonConnectApps=(\[.*?\]);/.exec(component)[1]), Object.keys(CONNECT_LOGO_SOURCES));
  assert.equal(Object.keys(CONNECT_LOGO_SOURCES).length, 12, "the site's twelve");
  assert.match(component, /period=1600,move=550/, "one place every 1.6 s, the move 0.55 s, as the site");
  assert.match(component, /grow=1\+\.6\*Math\.max\(0,1-Math\.abs\(x\)\/\(gap\*\.6\)\)/, "the logo behind the glass swells");
  assert.match(component, /blur\("\+Math\.max\(0,\(d-\.8\)\*22,\(grow-1\)\*30\)/, "the logo under the glass blurs itself into a wash, whatever the engine makes of backdrop-filter");
  assert.match(component, /cancelAnimationFrame\(id\)/, "the frame stops with the step");
  new Function("p", "fde", "tye", "nye", "re", "Fo", "S", component.replace(/function __simeonMeetStep\(n\)\{$/, ""));
  const assets = await readLogoAssets();
  assert.deepEqual(Object.keys(assets.connect), Object.keys(CONNECT_LOGO_SOURCES));
  for (const url of Object.values(assets.connect)) assert.match(url, /^data:image\/(svg\+xml|webp);base64,/);
  const css = connectCss(assets.connect);
  assert.match(css, /mask-image:linear-gradient\(90deg,transparent,#000 18%,#000 82%,transparent\)/, "the row fades at both ends");
  assert.match(css, /\.simeon-connect__tile\{[^}]*background:rgba\(255,255,255,\.4\);[^}]*backdrop-filter:blur\(32px\) saturate\(2\)/, "frosted: the logo behind is a wash of its colour, not a shape");
  assert.equal((css.match(/\.simeon-connect__orb\[data-app=/g) ?? []).length, 12);
  assert.ok(patchOriginalLogosStylesheet(".a{}", assets).includes(css));
});

test("the computer step: the screen is 1.45 times the drawing, with the photograph on it, and Simeon walks the scaled path", async () => {
  const { COMPUTER_STEP_REPLACEMENTS, COMPUTER_CSS, COMPUTER_SCREEN_SCALE, WALLPAPER_SOURCE, WALLPAPER_ASSET, patchOriginalCooStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const by = Object.fromEntries(COMPUTER_STEP_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.equal(COMPUTER_SCREEN_SCALE, 1.45);
  assert.equal(by["computer-card-seat"], "$2e={x:0,y:0}");
  assert.match(by["computer-cursor-path"], /^x:\$2e\.x\+n\.demoCursor\.x\*__simeonComputerK\(\)-U2e\.x\*__simeonComputerCursor\(\),y:\$2e\.y\+n\.demoCursor\.y\*__simeonComputerK\(\)-U2e\.y\*__simeonComputerCursor\(\),scale:__simeonComputerCursor\(\),/, "the screen's factor (1.45 on a Mac, the phone's on a phone) and the cursor in proportion");
  assert.match(COMPUTER_CSS, /\.sand-onboarding__demo-card(:not\(#\\#\)){4}\{transform:scale\(1\.45\);background-color:#242a36\}/);
  assert.match(COMPUTER_CSS, /computer-demo>div:first-child(:not\(#\\#\)){4}\{top:calc\(50% - 312px\)\}/);
  assert.match(COMPUTER_CSS, /computer-demo>div:last-child(:not\(#\\#\)){4}\{top:calc\(50% \+ 256px\)\}/);
  assert.ok(patchOriginalCooStylesheet(".a{}").includes(COMPUTER_CSS));
  assert.equal(WALLPAPER_ASSET, "demo-computer-wallpaper-BO7Ye4dV.jpg");
  const photo = await readFile(WALLPAPER_SOURCE);
  assert.deepEqual([...photo.subarray(0, 3)], [0xff, 0xd8, 0xff], "the wallpaper source is a JPEG");
  assert.ok(photo.length > 50_000 && photo.length < 400_000, `the photograph is sized for the app (${photo.length} bytes)`);
});

test("onboarding on a phone: every scene laid out for the width it has, titles growing upwards, the flow scaled only when the screen is short", async () => {
  const { COO_REPLACEMENTS, NAME_STEP_REPLACEMENTS, CONNECT_STEP_REPLACEMENTS, PHONE_ONBOARDING_CSS, PHONE_MAX_WIDTH, PHONE_ONBOARDING_HALF_HEIGHT, COMPUTER_CARD_W, connectCss, patchOriginalCooStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const coo = COO_REPLACEMENTS.find(([label]) => label === "coo-step-component")[2].replace(/function sjn\(n\)\{$/, "");
  const name = NAME_STEP_REPLACEMENTS.find(([label]) => label === "name-step-component")[2].replace(/function __simeonCooStep\(n\)\{$/, "");
  // The step code as the window runs it, in a window of a given size.
  const at = (width, height) => {
    const set = {};
    const window = { innerWidth: width, innerHeight: height, addEventListener: () => {} };
    const document = { activeElement: null, documentElement: { style: { setProperty: (k, v) => { set[k] = v; } } } };
    const run = new Function("window", "document", "S", "p", "fde", "tye", "nye", "sd", "re", "Fo", `${coo}${name};return {cooAt:__simeonCooAt,k:__simeonComputerK,cursor:__simeonComputerCursor,seat:__simeonNameSeatAt,crew:__simeonCooCrew}`);
    return { ...run(window, document), set };
  };
  const mac = at(1280, 800);
  assert.deepEqual(mac.set, { "--simeon-vw": "1280", "--simeon-vh": "800" }, "the size reaches the CSS");
  assert.equal(mac.cooAt(1280), mac.crew, "a Mac keeps the Chief of Staff's own layout");
  assert.equal(mac.k(), 1.45);
  assert.equal(mac.cursor(), 0.66, "the cursor exactly as before on a Mac");
  assert.deepEqual(mac.seat("weekly-standup"), { x: -168, y: -64, scale: 0.62 });

  const phone = at(393, 759);
  const crew = phone.cooAt(393);
  assert.ok(crew.every((a) => Math.abs(a.x) === 393 / 2 - 50), "the agents come in to 50 px from the screen's edge");
  assert.ok(crew.every((a) => Math.abs(a.x) + 28 + 16 <= 393 / 2), "an agent and its margin fit");
  assert.equal(crew[0].d, `M-60 0C-83 0 -83 -100 -106.5 -100`, "the curves are drawn to where the agents are");
  assert.deepEqual(crew.map((a) => a.y), mac.crew.map((a) => a.y), "the same rows");
  assert.equal(phone.k(), (393 - 32) / COMPUTER_CARD_W, "the computer as wide as the screen less 16 px a side");
  assert.ok(Math.abs(phone.cursor() - phone.k() * 0.66 / 1.45) < 1e-12, "Simeon's cursor in proportion");
  assert.equal(phone.seat("sales-forecast").x, 393 / 2 - 44, "the name step's side agents come in");
  assert.equal(phone.seat("invoice-chaser").x, 0);
  assert.ok(at(320, 568).cooAt(320).every((a) => Math.abs(a.x) >= 104), "never closer to Simeon than his curves allow");

  // A narrow Mac window counts as a phone; the boundary is the same in the script and the stylesheet.
  assert.notEqual(at(599, 800).cooAt(599), at(599, 800).crew);
  assert.match(PHONE_ONBOARDING_CSS, new RegExp(`@media \\(max-width:${PHONE_MAX_WIDTH - 0.02}px\\)`));
  assert.match(PHONE_ONBOARDING_CSS, new RegExp(`--simeon-onb-fit:min\\(1,calc\\(\\(var\\(--simeon-vh,2000\\) / 2 - 16\\) / ${PHONE_ONBOARDING_HALF_HEIGHT}\\)\\)`), "scaled only when the screen is too short for the tallest step");
  assert.match(PHONE_ONBOARDING_CSS, /--simeon-computer-k:min\(1\.45,calc\(\(var\(--simeon-vw,1280\) - 32\) \/ 441\)\)/, "the stylesheet's factor is the script's");
  assert.match(PHONE_ONBOARDING_CSS, /\.sand-onboarding__step,\.sand-onboarding__cast\{scale:var\(--simeon-onb-fit\);transform-origin:50% 50%\}/, "the step and the cast that travels between steps scale together, about the centre");
  assert.match(PHONE_ONBOARDING_CSS, /\.sand-onboarding__step(:not\(#\\#\)){4},\.sand-onboarding__step main>div(:not\(#\\#\)){4}\{overflow:visible\}/, "a scaled step does not clip what it brought back on screen");
  for (const step of ["simeon-coo", "simeon-connect", "simeon-name", "sand-onboarding__computer-demo"]) assert.match(PHONE_ONBOARDING_CSS, new RegExp(`\\.${step}>div:first-child(:not\\(#\\\\#\\)){4}\\{top:auto;bottom:calc\\(50% \\+ `), `${step}: the title grows upwards`);
  assert.match(PHONE_ONBOARDING_CSS, /\.simeon-coo>div:first-child(:not\(#\\#\)){4}\{top:auto;bottom:calc\(50% \+ 262px\)\}/, "a two-line title ends just above the copy");
  assert.match(PHONE_ONBOARDING_CSS, /h1\{font-size:clamp\(22px,7\.1vw,28px\);line-height:1\.2;text-wrap:balance\}/, "no title takes more than two lines");
  assert.ok(patchOriginalCooStylesheet(".a{}").endsWith(PHONE_ONBOARDING_CSS), "after every step's own rules, so it wins on a phone");

  const connect = CONNECT_STEP_REPLACEMENTS.find(([label]) => label === "connect-step-component")[2];
  assert.match(connect, /let W=el\.clientWidth\|\|920;const fit=\(\)=>\{W=el\.clientWidth\|\|W\};window\.addEventListener\("resize",fit\)/, "the row of apps moves across the width it is drawn at");
  assert.match(connect, /window\.removeEventListener\("resize",fit\)/);
  assert.match(connectCss({}), /\.simeon-connect__orbit\{position:relative;width:min\(920px,100vw\);/, "no wider than the screen");
});

test("the phone's + sheets and call: the window's own create actions, the Mac's call look", async () => {
  const { PHONE_HOME_REPLACEMENTS, PHONE_HOME_CSS } = await import("../scripts/lib/router-renderer-patch.mjs");
  const source = PHONE_HOME_REPLACEMENTS.find(([label]) => label === "phone-sidebar-open")[2];
  assert.match(source, /n\.createAgent\(\{name:v,avatarColor:color,avatarShape:"cloud"\},\{isKickstartRequested:!0\}\)/, "New Agent: the window's createAgent, asked to introduce itself as the Mac's new chat does");
  assert.match(source, /n\.createGroup\(\{name:picked\.map\(a=>a\.name\)\.join\(", "\)\.slice\(0,60\),description:"",memberAgentIds:picked\.map\(a=>a\.id\)\}\)/, "New Group Chat: named after its members, as the Mac names a group of recipients");
  assert.match(source, /ok=picked\.length>=2&&!busy/, "a group is two agents or more");
  assert.match(source, /a\.isGroup!==!0&&a\.isHiddenFromSidebar!==!0/, "a group's members are agents the sidebar shows");
  assert.match(source, /item\("agent","New Agent"\),item\("group","New Group Chat"\)/);
  assert.match(source, /const __simeonPalettes=\[\{"id":"yellow","label":"Dusk"\}/, "the twelve palettes, as the window names them");
  // The call: the founder's layout, the Mac banner's buttons and nothing else (8 October 2026: "use our mac buttons. dont invent stuff").
  const call = source.slice(source.indexOf("function __simeonPhoneCall(){"), source.indexOf("function __simeonPhoneLayer("));
  assert.deepEqual([...call.matchAll(/btn\("simeon-call-(?:pill|full)__btn","([A-Za-z]+)"/g)].map((m) => m[1]), ["Transcript", "Transcript"], "Transcript, in the pill and full screen");
  assert.equal((call.match(/muteBtn\("simeon-call-(?:pill|full)__btn"\)/g) ?? []).length, 2, "Mute, in both");
  assert.equal((call.match(/endBtn\("simeon-call-(?:pill|full)__end"\)/g) ?? []).length, 2, "End, in both");
  assert.doesNotMatch(source, /__simeonVoicePicker|"gear"|"voice"/, "no buttons the Mac's call does not have");
  assert.match(source, /"talk":"<path d=\\"M5 7h14M5 12h14M5 17h9\\"\/>"/, "the banner's own Transcript glyph");
  assert.match(source, /hidden:!tr/, "Transcript shows and hides the lines, as on the Mac");
  assert.match(source, /function __simeonCallTime\(t\)\{[^}]*return h>0\?`\$\{h\}:\$\{String\(m\)\.padStart\(2,"0"\)\}:\$\{ss\}`:`\$\{m\}:\$\{ss\}`\}/, "the banner's clock, 0:16");
  assert.match(source, /d\.mute\?\.\(!c\.isMuted\)/);
  assert.match(source, /d\.hangUp\?\.\(\)/);
  assert.match(source, /if\(!__simeonPhoneOk\|\|d==null\|\|c==null\)return null;/, "nothing drawn on the Mac or without a call");
  assert.match(PHONE_HOME_CSS, /:root\{--simeon-call-card:#ffffff;/, "the Mac banner's card, white");
  assert.match(PHONE_HOME_CSS, /\[data-theme\*="dark"\]\{--simeon-call-card:#2a2a2d;/, "and #2a2a2d in the dark");
  assert.match(PHONE_HOME_CSS, /\.simeon-call-end\{[^}]*background:#ff3b30;/, "the banner's red");
  assert.match(PHONE_HOME_CSS, /\.simeon-call-say--me\{align-self:flex-end;text-align:right;color:var\(--sand-text-secondary\)\}/, "the founder's transcript: the person's lines at the right, grey");
  assert.match(PHONE_HOME_CSS, /\.simeon-call-say--them\{align-self:flex-start;color:var\(--sand-text-primary\)\}/, "the agent's at the left");
  assert.doesNotMatch(PHONE_HOME_CSS, /\.simeon-call-say[^{]*\{[^}]*background/, "plain lines, no bubbles");
  assert.match(PHONE_HOME_CSS, /\.simeon-phone-primary\{[^}]*background:var\(--sand-fill-bubble-user\);/, "Create and Next in the same blue");
});

test("the phone's top, Settings, search, the agent's page and the call's time on the list", async () => {
  const { PHONE_HOME_REPLACEMENTS, PHONE_HOME_CSS, PHONE_MAX_WIDTH, PHONE_SETTINGS_PANEL_REPLACEMENTS, patchOriginalPhoneSettingsPanel } = await import("../scripts/lib/router-renderer-patch.mjs");
  const mediaAt = PHONE_HOME_CSS.indexOf(`@media (max-width:${PHONE_MAX_WIDTH - 0.02}px){`);
  const phoneBlock = PHONE_HOME_CSS.slice(mediaAt, PHONE_HOME_CSS.indexOf("\n}\n", mediaAt) + 3);
  assert.match(phoneBlock, /\.sand-agents-sidebar__header \.simeon-disc,html\[data-simeon-phone\] \.simeon-disc\.simeon-phone-back\{width:46px;height:46px\}/, "the top's buttons a little larger than the Mac's 40");
  assert.match(phoneBlock, /\.sand-agents-sidebar__account \.sand-kit-base-avatar img\{width:46px!important;height:46px!important\}/, "BF the same size");
  assert.match(phoneBlock, /aside\.sand-info-pane\[data-open="true"\]\{position:fixed!important;[^}]*border-radius:32px;/, "the agent's page, a sheet");
  assert.match(phoneBlock, /\.sand-info-pane__inner\{[^}]*max-width:none!important;/, "its width, not what is left beside the chat");
  assert.match(phoneBlock, /\.sand-command-palette\{top:44px!important;[^}]*border-radius:32px!important;/, "search, a sheet");
  assert.match(phoneBlock, /\.sand-settings-dialog\{top:44px!important;[^}]*border-radius:32px!important\}/, "Settings, a sheet");
  assert.match(phoneBlock, /\.sand-settings-nav\{display:none!important\}/, "one column: General");
  const source = PHONE_HOME_REPLACEMENTS.find(([label]) => label === "phone-sidebar-open")[2];
  assert.match(source, /e\.target\.closest\("\.sand-agents-sidebar__account button"\)!=null/, "BF opens Settings on a phone");
  assert.match(source, /os\("general"\)/);
  assert.match(source, /onClick:\(\)=>uSe\(\),children:\[p\.jsx\("span",\{className:"simeon-connect-apps__label",children:"Connect apps"\}\)/, "Connect apps in Settings: the sidebar's button and the window's own opener");
  assert.match(source, /globalThis\.__simeonPhoneSettingsMore=__simeonPhoneSettingsMore/);
  assert.match(source, /className:"simeon-phone-settings-row simeon-phone-settings-row--danger",onClick:\(\)=>\{Promise\.resolve\(auth\.logout\(\)\)/, "Sign Out on its own row at the foot, the account's own sign-out");
  assert.match(phoneBlock, /\.sand-account-card__action\{display:none!important\}/, "not beside the e-mail, which then fits");
  assert.match(phoneBlock, /\.sand-account-card__body\{flex:1 1 auto!important;min-width:0!important;max-width:none!important\}/);
  const general = PHONE_SETTINGS_PANEL_REPLACEMENTS[0][1];
  assert.match(patchOriginalPhoneSettingsPanel(`x;${general};y`), /a\.jsx\(Sa,\{auth:t\},"general"\),a\.jsx\(globalThis\.__simeonPhoneSettingsMore\?\?\(\(\)=>null\),\{\},"simeon-phone-more"\)/, "under General, nothing on the Mac");
  assert.match(source, /className:\\?"simeon-call-chip\\?"|className:"simeon-call-chip"/, "the call's time");
  assert.match(PHONE_HOME_CSS, /html\[data-simeon-phone="list"\] \.simeon-call-pill\{display:none\}/, "on the list, not the pill");
  assert.match(PHONE_HOME_CSS, /html\[data-simeon-phone="list"\] \.simeon-call-chip\{[^}]*right:124px;[^}]*background:var\(--sand-fill-success\);/, "the green time, beside search and +");
});

test("a group's butterflies in the chat header are a single agent's size", async () => {
  const { HEADER_CARD_CSS } = await import("../scripts/lib/router-renderer-patch.mjs");
  assert.match(HEADER_CARD_CSS, /\.sand-chat-header__avatar \.sand-group-avatar\{zoom:2\.6\}/, "20 px butterflies drawn at 52, a single agent's size");
  assert.match(HEADER_CARD_CSS, /\.sand-chat-header__avatar \.sand-agent-avatar,\.sand-chat-header__avatar \.sand-simeon-mark\{width:52px!important;height:52px!important\}/);
});

test("the phone's home: the Mac's list full screen, a chat full screen, one at a time, and the Mac app left as it is", async () => {
  const { PHONE_HOME_REPLACEMENTS, PHONE_HOME_CSS, PHONE_MAX_WIDTH, patchOriginalPhoneHome, patchOriginalPhoneHomeStylesheet } = await import("../scripts/lib/router-renderer-patch.mjs");
  const source = PHONE_HOME_REPLACEMENTS.find(([label]) => label === "phone-sidebar-open")[2];
  // The window's script in a page, with the window's own fold (`can`, 424 px for the chat).
  const page = (userAgent, width = 393) => {
    const attrs = {};
    const body = { children: [], appendChild(el) { el.isConnected = true; this.children.push(el); } };
    const document = {
      body,
      documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null },
      createElement: (tag) => ({ tag, isConnected: false, attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.listeners[k] = f; } }),
      addEventListener: () => {},
    };
    const window = { innerWidth: width };
    const run = new Function("window", "document", "navigator", `${source}function can(n,e){return n.isCollapsed?!1:e<n.expandedWidth+424}return{DCe,go:__simeonPhoneGo,plus:__simeonPhoneNew,ui:__simeonPhoneUi,done:__simeonPhoneDone,callSource:__simeonCallSource}`);
    return { ...run(window, document, { userAgent }), window, body, mode: () => attrs["data-simeon-phone"] ?? null };
  };
  const open = { isCollapsed: false, expandedWidth: 280 };
  const folded = { isCollapsed: true, expandedWidth: 280 };

  const mac = page("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Simeon/1.0.0 Chrome/142.0.0.0 Electron/39.0.0 Safari/537.36");
  assert.equal(mac.mode(), null, "the Mac app never takes the phone's layout");
  assert.equal(mac.body.children.length, 0, "and has no back disc");
  assert.equal(mac.window.__simeonPhoneShow, undefined);
  assert.equal(mac.DCe(open, 520), true, "a narrow Mac window still folds the sidebar to its rail");
  assert.equal(mac.DCe(open, 1280), false);
  assert.equal(mac.DCe(folded, 1280), true);
  const macCall = (x) => x * 2;
  assert.equal(mac.go(macCall)(4), 8);
  assert.equal(mac.mode(), null, "opening something on the Mac changes nothing");

  const phone = page("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148");
  assert.equal(phone.mode(), "list", "the phone opens on the list");
  assert.equal(phone.DCe(open, 393), false, "on a phone the sidebar stays open, so its rows lay out wide");
  assert.equal(phone.DCe(folded, 393), false, "even if it was folded on a wider screen");
  assert.equal(phone.DCe(open, PHONE_MAX_WIDTH), true, "from the phone's boundary up, the window's own fold");
  assert.equal(phone.DCe(folded, 1280), true);
  let opened = null;
  const openAgent = (id) => { opened = id; return "done"; };
  const wrapped = phone.go(openAgent);
  assert.equal(phone.go(openAgent), wrapped, "one wrapper per callback, so the sidebar's memo holds");
  assert.equal(phone.go(undefined), undefined);
  assert.equal(wrapped("agent-1"), "done");
  assert.equal(opened, "agent-1", "the window still opens what was asked");
  assert.equal(phone.mode(), "chat", "and the phone shows the chat");
  const [back] = phone.body.children;
  assert.equal(back.attrs["aria-label"], "Back");
  assert.match(back.className, /^simeon-disc simeon-phone-back$/, "the back button is one of the Mac's discs");
  back.listeners.click();
  assert.equal(phone.mode(), "list", "back shows the list");
  phone.window.__simeonPhoneShow("chat");
  assert.equal(phone.mode(), "chat", "the iPhone app's notification tap shows the chat (desktop/web/bridge.ts)");

  // The +: on a phone a menu; on a Mac (or a wide window) the Mac's new chat.
  let newChats = 0;
  const newChat = () => { newChats += 1; return "new chat"; };
  assert.equal(mac.plus(newChat), mac.plus(newChat), "one wrapper per callback");
  assert.equal(page("Mozilla/5.0 (Macintosh) Electron/39.0.0", 393).plus(newChat)(), "new chat", "the Mac app's +, even narrow, is its new chat");
  assert.equal(page("Mozilla/5.0 (iPhone)", 1280).plus(newChat)(), "new chat", "a wide browser window's + is the new chat");
  assert.equal(newChats, 2);
  const phonePlus = phone.plus(newChat);
  assert.equal(phonePlus(), undefined);
  assert.equal(newChats, 2, "a phone's + does not open a new chat");
  assert.deepEqual(phone.ui(), { menu: true, sheet: null }, "it opens the menu");
  phonePlus();
  assert.deepEqual(phone.ui(), { menu: false, sheet: null }, "and closes it");
  // A sheet's result opens the chat it made, whichever shape the window returns.
  for (const made of [{ agent: { id: "a1" } }, { id: "a1" }]) {
    const seen = [];
    phone.done({ close: () => seen.push("closed"), openAgent: (id) => seen.push(id) }, made);
    assert.deepEqual(seen, ["closed", "a1"]);
  }
  const failed = [];
  phone.done({ close: () => failed.push("closed"), openAgent: (id) => failed.push(id) }, undefined);
  assert.deepEqual(failed, ["closed"], "nothing to open, nothing opened");
  // The call is drawn only where the window's voiceCall tells it as it goes: the phone's, not the Mac's banner.
  assert.equal(phone.callSource(), null);
  phone.window.desktop = { voiceCall: { start: () => {} } };
  assert.equal(phone.callSource(), null, "the Mac's voiceCall (start, no subscribe) draws no call in the window");
  const told = { start: () => {}, subscribe: () => () => {} };
  phone.window.desktop = { voiceCall: told };
  assert.equal(phone.callSource(), told);

  // Only the phone's width, only outside the Mac app; hidden screens keep their width beside the screen.
  assert.match(PHONE_HOME_CSS, /^\.simeon-disc\.simeon-phone-back\{display:none;/m, "the back disc is hidden everywhere else");
  const mediaAt = PHONE_HOME_CSS.indexOf(`@media (max-width:${PHONE_MAX_WIDTH - 0.02}px){`);
  const phoneBlock = PHONE_HOME_CSS.slice(mediaAt, PHONE_HOME_CSS.indexOf("\n}\n", mediaAt) + 3);
  for (const rule of phoneBlock.split("\n").slice(1, -2)) assert.match(rule, /^html\[data-simeon-phone/, `gated on the attribute the Mac app never sets: ${rule}`);
  assert.match(phoneBlock, /html\[data-simeon-phone="list"\] main\.sand-chat\{transform:translateX\(100%\)\}/);
  assert.match(phoneBlock, /html\[data-simeon-phone="chat"\] \.sand-agents-sidebar\{transform:translateX\(-100%\)\}/);
  assert.match(phoneBlock, /\.sand-agents-sidebar__footer\{position:absolute!important;top:0!important;left:0!important;/, "the account at the top");
  assert.match(phoneBlock, /\.sand-agents-sidebar__plugins-entry\{display:none!important\}/, "no Connect apps on the phone");
  assert.match(phoneBlock, /\.sand-agents-sidebar \.sand-agent-item\{zoom:1\.2\}/, "the Mac's rows, larger");
  assert.match(phoneBlock, /\.sand-agent-item__avatar\{zoom:1\.2\}/, "the butterfly 36 px on the Mac, 52 on the phone");
  assert.match(phoneBlock, /\.sand-agent-item__name\{font-weight:600!important\}/);
  assert.ok(patchOriginalPhoneHomeStylesheet(".a{}").endsWith(PHONE_HOME_CSS));
  assert.throws(() => patchOriginalPhoneHomeStylesheet(PHONE_HOME_CSS), /already present/);

  // Every anchor once; Settings, a dialog over either screen, is left alone.
  const anchors = PHONE_HOME_REPLACEMENTS.map(([, before]) => before).join("\n");
  const patched = patchOriginalPhoneHome(anchors);
  assert.match(patched, /Go=S\.useCallback\(Rs=>\{__simeonPhoneShow\("chat"\);Pc\(Rs\)\},\[Pc\]\)/);
  assert.match(patched, /onOpenSettings:vr,/);
  assert.match(patched, /onNewChat:__simeonPhoneNew\(fl\)/);
  assert.match(patched, /children:\[p\.jsx\(__simeonPhoneLayer,\{agents:lt,createAgent:Sn,createGroup:ln,openAgent:Go,openSettings:vr\},"simeon-phone-layer"\),p\.jsx\(u0n,/, "the + sheets and the call sit beside the sidebar, with the window's own create actions and Settings");
  assert.match(patched, /function uan\(n\)\{return __simeonIsPhone\(n\.windowWidth\)\|\|n\.windowWidth>=Dlt\(n\.sidebar,n\.paneWidth\)\}/, "the agent's page opens on a phone, where it is a sheet, not beside the chat");
  assert.match(patched, /size:"md",children:\[p\.jsx\("button",\{type:"button",className:"simeon-disc simeon-palette-close","aria-label":"Close search",onClick:\(\)=>i\(\)/, "search's close, inside the dialog (taps outside a modal do not reach the page)");
  assert.match(patched, /onOpenMessage:__simeonPhoneGo\(cr\)/);
  assert.throws(() => patchOriginalPhoneHome(`${anchors}\n${anchors}`), /phone-sidebar-open/);

  // The apply pass runs it last on the mark chunk and the stylesheet, and records it.
  const patchSource = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(patchSource, /const markPatched = patchOriginalPhoneHome\(patchOriginalButterfly\(/);
  assert.match(patchSource, /const stylesheetPatched = patchOriginalPhoneHomeStylesheet\(patchOriginalSidebarDiscsStylesheet\(/);
  assert.match(patchSource, /if \(!PHONE_HOME_REPLACEMENTS\.every\(\(\[, before\]\) => markChunks\[0\]\.source\.includes\(before\)\)\) throw new Error/);
  assert.match(patchSource, /\.\.\.BUTTERFLY_REPLACEMENTS, \.\.\.PHONE_HOME_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT\]\.map/);
  assert.match(patchSource, /"take-over-card-styles", "phone-home"\]/);
  assert.match(patchSource, /"draft-send", "phone-home"\]/);
});

test("Simeon is the first agent, titled Chief of Staff, pinned or not as the person likes", async () => {
  const { FIRST_AGENT_REPLACEMENTS, SIMEON_COO_PROFILE } = await import("../scripts/lib/router-renderer-patch.mjs");
  assert.deepEqual({ name: SIMEON_COO_PROFILE.name, title: SIMEON_COO_PROFILE.title }, { name: "Simeon", title: "Chief of Staff" });
  const by = Object.fromEntries(FIRST_AGENT_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.match(by["first-agent-simeon"], /"name":"Simeon","title":"Chief of Staff"/);
  assert.match(by["first-agent-from-apps"], /onForward:\(\)=>\{Pe\(\)\}/, "Next on the apps step makes Simeon and finishes");
  assert.match(by["first-agent-title"], /\.\.\.t\.title!=null\?\{title:t\.title\}:\{\}/);
  assert.equal(by["first-agent-no-cos-template"], "");
  assert.match(by["tools-skip-for-later"], /children:"Skip for later"\}\)\]\}\)/, "the apps step offers Skip for later under Next");
  // The roster read, run on its own: the oldest Chief of Staff (or COO, the day before) is noted; the pinned list is left as it is (4 October 2026: "its not pinned").
  const source = by["coo-pinned-split"].replace(/function t5e\(n,e\)\{.*$/, "");
  const pinCoo = new Function(`${source};return {pin:__simeonPinCoo,id:()=>__simeonCooId}`)();
  const agents = [{ id: "a", title: "Research" }, { id: "s2", title: "Chief of Staff", createdAt: 9 }, { id: "s", title: "COO", createdAt: 1 }];
  assert.deepEqual(pinCoo.pin(agents, ["a"]), ["a"], "nothing is pinned by force");
  assert.equal(pinCoo.id(), "s");
  pinCoo.pin([{ id: "a", title: "" }], ["a"]);
  assert.equal(pinCoo.id(), null, "an account with no Chief of Staff has none");
  for (const label of ["coo-no-unpin-item", "coo-no-unpin-store", "coo-no-hide-item", "coo-no-duplicate-item", "coo-no-delete-item", "coo-no-section-item"]) assert.equal(by[label], undefined, `${label}: the menu is the same for him as for any agent`);
});

test("the name step: the apps step's agents gather over one field, and the last screen keeps only its line", async () => {
  const { NAME_STEP_REPLACEMENTS, NAME_CSS } = await import("../scripts/lib/router-renderer-patch.mjs");
  const by = Object.fromEntries(NAME_STEP_REPLACEMENTS.map(([label, , after]) => [label, after]));
  assert.match(by["name-step-screen"], /^case"name":return p\.jsx\(__simeonNameStep,\{headingId:xn,onBack:\(\)=>x\.goBack\(ln\),onForward:\(\)=>\{Pe\(\)\}\}\);/, "Next on the name step makes Simeon and finishes");
  assert.match(by["name-step-agents"], /^case"name":return\{\.\.\.t,\.\.\.__simeonNameSeatAt\(e\),opacity:1/, "the seat for the width (the Mac's own above a phone's)");
  assert.match(by["name-step-component"], /title:"How should Simeon & Co call you\?"/);
  assert.match(by["name-step-component"], /a\.updateName\(name\)/, "saved through the account's own rename");
  assert.doesNotMatch(by["name-step-component"], /Hi, /, "no greeting bubble");
  for (const seat of ["weekly-standup", "invoice-chaser", "sales-forecast"]) assert.match(by["name-step-component"], new RegExp(`"${seat}":\\{"x"`));
  assert.equal(by["hand-off-text-only"], 'x=p.jsxs("div",{className:f,style:m.style,children:[v,b]})');
  assert.match(NAME_CSS, /background:light-dark\(#fff,#1c1c1e\)/, "a white field");
  assert.match(NAME_CSS, /height:38px/);
});

test("Simeon's title and description are read only; his name and avatar are the person's", async () => {
  const { FIRST_AGENT_REPLACEMENTS, COO_LOCK_CSS } = await import("../scripts/lib/router-renderer-patch.mjs");
  const by = Object.fromEntries(FIRST_AGENT_REPLACEMENTS.map(([label, , after]) => [label, after]));
  for (const field of ["title", "description"]) assert.match(by[`coo-readonly-${field}`], /^p\.jsx\(Uwe,\{readOnly:t\.id===__simeonCooId,/);
  for (const label of ["coo-readonly-name", "coo-readonly-avatar", "coo-readonly-pane-avatar"]) assert.equal(by[label], undefined, `${label}: changeable (4 October 2026)`);
  assert.match(by["coo-readonly-field"], /readOnly:n\.readOnly===!0\}$/);
  assert.match(by["coo-readonly-commit"], /^y=_=>\{if\(n\.readOnly===!0\)\{m\(s\);return\}/, "a read-only field never commits");
  assert.doesNotMatch(COO_LOCK_CSS, /simeon-coo-avatar/);
  assert.match(COO_LOCK_CSS, /\.simeon-tools__skip\{/);
});

test("an agent named in a message wears its face and its palette's colour, only where the name stands alone", async () => {
  const { AGENT_MENTIONS_PLUGIN_SOURCE, agentMentionMarks, agentMentionsCss, AGENT_PALETTES } = await import(patchModule);
  const plugin = new Function(`${AGENT_MENTIONS_PLUGIN_SOURCE}return __simeonAgentMentions;`)();
  const tree = () => ({ type: "root", children: [{ type: "element", tagName: "p", data: { sandMarkdown: 1 }, children: [{ type: "text", value: "Scout pulled quotes, Yodo closed tickets. Scouts and @Scout stay." }] }, { type: "element", tagName: "code", data: { sandMarkdown: 1 }, children: [{ type: "text", value: "Scout" }] }] });
  delete globalThis.__simeonAgentColors;
  const bare = tree();
  plugin()(bare);
  assert.equal(bare.children[0].children.length, 1, "no roster yet, nothing is marked");
  globalThis.__simeonAgentColors = { Scout: "cyan", Yodo: "red" };
  const marked = tree();
  plugin()(marked);
  const parts = marked.children[0].children.map((node) => node.type === "text" ? node.value : `[${node.properties.dataAgentColor}:${node.children[1].value}]`);
  assert.deepEqual(parts, ["[cyan:Scout]", " pulled quotes, ", "[red:Yodo]", " closed tickets. Scouts and @Scout stay."]);
  assert.equal(marked.children[1].children[0].type, "text", "code is left alone");
  assert.deepEqual(marked.children[0].children[0].children[0].properties.className, ["simeon-agent__mark"]);
  delete globalThis.__simeonAgentColors;
  const marks = agentMentionMarks();
  const css = agentMentionsCss();
  for (const { id, top } of AGENT_PALETTES) {
    assert.match(marks[id], /^data:image\/svg\+xml;base64,/, id);
    assert.ok(Buffer.from(marks[id].split(",")[1], "base64").toString().includes(`stop-color:${top}`), `${id}'s butterfly is in its palette`);
    assert.ok(css.includes(`.simeon-agent[data-agent-color="${id}"]`), id);
  }
});

test("a face is remembered by id across a reconnect, a mention follows the colour that comes back, and the person is never an agent", async () => {
  const { AGENT_RESOLVERS_AFTER, AGENT_MENTIONS_PLUGIN_SOURCE, AGENT_AVATAR_MEMORY_KEY } = await import(patchModule);
  // The window's own tables and hashes, as small as the test needs them.
  const store = new Map();
  const localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } };
  const saved = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true, writable: true });
  try {
    const make = () => new Function(`const PQ=[{id:"red"},{id:"cyan"}],Qtt=["cloud","pebble"],sle=()=>"hashed-colour",u4e=()=>"hashed-shape";${AGENT_RESOLVERS_AFTER};return {Cee,Eee,note:__simeonNoteAgents,person:__simeonNotePerson}`)();
    const first = make();
    // Connected: the roster carries faces; the note remembers them.
    first.note([{ id: "a1", name: "Scout", avatarColor: "cyan", avatarShape: "pebble" }, { id: "a2", name: "Bass", avatarColor: "red", avatarShape: "cloud" }, { id: "a3", name: "Bare" }]);
    assert.deepEqual(globalThis.__simeonAgentColors, { Scout: "cyan", Bass: "red", Bare: "hashed-colour" });
    assert.deepEqual(JSON.parse(store.get(AGENT_AVATAR_MEMORY_KEY)), { a1: { color: "cyan", shape: "pebble" }, a2: { color: "red", shape: "cloud" } }, "a record without a face is never remembered");
    // Reconnecting, in a fresh window: a member looked up before the roster answers has no face, and keeps the remembered one.
    const second = make();
    assert.equal(second.Cee({ id: "a1", avatarColor: null }), "cyan");
    assert.equal(second.Eee({ id: "a1", avatarShape: null }), "pebble");
    assert.equal(second.Cee({ id: "new", avatarColor: null }), "hashed-colour", "an unknown id still hashes");
    // The person's name, from the account status, passes through untouched.
    const status = { kind: "logged-in", displayName: " Bass " };
    assert.equal(second.person(status), status);
    assert.equal(globalThis.__simeonPersonName, "Bass");
    // The mention step: the person is left alone even though an agent shares the name, and a colour that changes is redrawn.
    const plugin = new Function(`${AGENT_MENTIONS_PLUGIN_SOURCE}return __simeonAgentMentions;`)();
    const tree = () => ({ type: "root", children: [{ type: "element", tagName: "p", data: { sandMarkdown: 1 }, children: [{ type: "text", value: "Hi, Bass. Scout is on it." }] }] });
    const parts = (node) => node.children[0].children.map((child) => child.type === "text" ? child.value : `[${child.properties.dataAgentColor}:${child.children[1].value}]`);
    globalThis.__simeonAgentColors = { Scout: "hashed-colour", Bass: "red" };
    const before = tree();
    plugin()(before);
    assert.deepEqual(parts(before), ["Hi, Bass. ", "[hashed-colour:Scout]", " is on it."]);
    globalThis.__simeonAgentColors = { Scout: "cyan", Bass: "red" };
    const after = tree();
    plugin()(after);
    assert.deepEqual(parts(after), ["Hi, Bass. ", "[cyan:Scout]", " is on it."], "the same names with a new colour are redrawn");
  } finally {
    delete globalThis.__simeonAgentColors;
    delete globalThis.__simeonPersonName;
    if (saved === undefined) delete globalThis.localStorage; else Object.defineProperty(globalThis, "localStorage", { value: saved, configurable: true, writable: true });
  }
});

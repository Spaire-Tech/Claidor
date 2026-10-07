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
  assert.match(list[2], /\["landing","meet","coo","computer-demo","name","tools"\]/, "the jobs and create steps are out; the name step follows the computer");
  assert.equal(title[2], 'N="Your agents have their own computer and work just like you"');
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
  assert.match(by["name-step-screen"], /^case"name":return p\.jsx\(__simeonNameStep,/);
  assert.match(by["name-step-agents"], /^case"name":return\{\.\.\.t,\.\.\.__simeonNameSeat\[e\],opacity:1/);
  assert.match(by["name-step-component"], /title:"How should they call you\?"/);
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

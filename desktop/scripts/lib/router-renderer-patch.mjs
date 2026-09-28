import { createHash } from "node:crypto";
import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SIMEON_PETALS } from "./simeon-logo.mjs";

const REGISTRY_BEFORE = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"usage",label:"Usage & Billing",icon:"chart-bars"},{id:"beta",label:"Updates",icon:"cloud-download"}]';
const REGISTRY_AFTER = REGISTRY_BEFORE;
const GENERAL_BEFORE = 'Q=x==="general"?a.jsx(Te,{children:a.jsx(Sa,{auth:t})}):null';
const GENERAL_AFTER = GENERAL_BEFORE;
const USAGE_BEFORE = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx(Na,{})}):null';
const USAGE_AFTER = USAGE_BEFORE;
const COMPONENT_ANCHOR = 'function Sa(s){';
const COMPONENT_SOURCE = String.raw`
const RRouterProviders=[
  {value:"cursor",label:"Claidor",description:"Use your signed-in Claidor account.",kind:"account"},
  {value:"claidor",label:"Claidor",description:"Use your signed-in Claidor account and its metered models.",kind:"account"},
  {value:"claude-code",label:"Claude Code",description:"Use your existing Claude Code sign-in and Simeon's connected plugins.",kind:"local",localKey:"claude-code"},
  {value:"codex",label:"Codex",description:"Use your existing ChatGPT sign-in from Codex with Simeon's connected plugins.",kind:"local",localKey:"codex"},
  {value:"openrouter",label:"OpenRouter",description:"Route through your OpenRouter account and selected model.",kind:"key",secret:"OPENROUTER_API_KEY"}
],RRouterOptions=RRouterProviders.map(s=>({value:s.value,label:s.label})),RRouterEmptyUsage={requests:0,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,lastUsedAt:null},RRouterInputClass="sand-9f619 sand-h8yej3 sand-5f5z56 sand-u97haq sand-lrnmfh sand-uve7l6 sand-16b7oty sand-1rgtt3y sand-o7x2bt sand-mkeg23 sand-1y0btm7 sand-qz0629 sand-1043rbw sand-13l7odt sand-1wd3ewq sand-jb2p0i sand-4z9k3i sand-frs9s4 sand-tt52l0 sand-1odjw0f sand-1t137rt sand-ltfok3";
function RRouterState(){
  const[s,e]=de.useState({provider:"cursor",usage:null,local:null,error:null});
  de.useEffect(()=>{let t=!0;const n=r=>{t&&e(r.detail)};window.addEventListener("sand-router-provider-changed",n);window.desktop.agent.getInferenceRouter().then(r=>{t&&e({...r,error:null})}).catch(r=>{t&&e(i=>({...i,error:String(r?.message??r)}))});return()=>{t=!1;window.removeEventListener("sand-router-provider-changed",n)}},[]);
  const t=async n=>{const r=s;e(i=>({...i,provider:n,error:null}));try{const i=await window.desktop.agent.setInferenceRouter(n),o={...i,error:null};e(o);window.dispatchEvent(new CustomEvent("sand-router-provider-changed",{detail:o}))}catch(i){e({...r,error:String(i?.message??i)})}};
  return[s,t]
}
function RRouterSecrets(){const[s,e]=de.useState([]),[t,n]=de.useState(0);de.useEffect(()=>{let r=!0;window.desktop.secrets.list().then(i=>{r&&e(Array.isArray(i?.keys)?i.keys:[])});return()=>{r=!1}},[t]);return[s,()=>n(r=>r+1)]}
function RRouterNumber(s){return new Intl.NumberFormat().format(s)}
function RRouterCredential({provider:s,state:e,keys:t,onSaved:n}){const[r,i]=de.useState(""),[o,l]=de.useState(!1);if(s.kind==="account")return a.jsx(se,{as:"span",color:"secondary",size:"sm",children:"Signed in"});if(s.kind==="local"){const c=e.local?.[s.localKey],d=c?.installed&&c?.authenticated;return a.jsx(se,{as:"span",color:d?"primary":"secondary",size:"sm",children:d?"Ready":c?.installed?"Sign in with "+(s.value==="codex"?"codex login":"claude"):"Not installed"})}const c=t.includes(s.secret),d=async()=>{if(r.trim().length===0)return;l(!0);try{await window.desktop.secrets.upsert({[s.secret]:r.trim()}),i(""),n()}finally{l(!1)}};return a.jsxs("div",{className:"sand-9f619 sand-78zum5 sand-6s0dn4 sand-h8yej3",style:{width:360},children:[a.jsx("input",{"aria-label":s.secret,className:RRouterInputClass,disabled:o,onChange:u=>i(u.currentTarget.value),placeholder:c?"Replace saved key":"Paste API key",style:{fontSize:13,height:34,minWidth:0,padding:"0 10px",width:270},type:"password",value:r}),a.jsx(oe,{disabled:o||r.trim().length===0,onClick:d,shape:"rectangular",size:"sm",variant:"secondary",children:o?"Saving…":"Save"})]})}
function RRouterUsageRows({usage:s}){return a.jsxs("div",{children:[a.jsx(ie,{label:"Requests",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.requests)})}),a.jsx(ie,{divided:!0,label:"Input tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.inputTokens)})}),a.jsx(ie,{divided:!0,label:"Output tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.outputTokens)})}),a.jsx(ie,{divided:!0,label:"Cache tokens",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:RRouterNumber(s.cacheReadTokens+s.cacheWriteTokens)})}),a.jsx(ie,{divided:!0,label:"Last used",variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:s.lastUsedAt?new Date(s.lastUsedAt).toLocaleString():"Not used yet"})})]})}
function RBoxRuntime(){const[s,e]=de.useState({mode:"local-docker",status:null,error:null,busy:!0});de.useEffect(()=>{let t=!0;window.desktop.agent.getBoxRuntime().then(n=>{t&&e({...n,error:null,busy:!1})}).catch(n=>{t&&e(r=>({...r,error:String(n?.message??n),busy:!1}))});return()=>{t=!1}},[]);const t=s.mode==="local-docker",n=async()=>{const r=t?"remote":"local-docker";e(i=>({...i,mode:r,busy:!0,error:null}));try{const i=await window.desktop.agent.setBoxRuntime(r);e({...i,error:null,busy:!1})}catch(i){e(o=>({...o,mode:t?"local-docker":"remote",error:String(i?.message??i),busy:!1}))}};return a.jsxs("div",{children:[a.jsx(ie,{description:t?((s.status?.detail??"Shell, files and computer use run in a Docker container on this Mac.")+" Switch off to use Simeon's cloud computer."):"Shell, files and computer use run on Simeon's cloud computer. Switch on to use the Docker container on this Mac.",label:"Use local Docker VM",variant:"card",children:a.jsx("button",{"aria-checked":t,"aria-label":"Use local Docker VM",disabled:s.busy,onClick:n,role:"switch",style:{appearance:"none",background:t?"var(--color-accent-primary, #4f8cff)":"rgba(255,255,255,.14)",border:0,borderRadius:999,cursor:s.busy?"wait":"pointer",height:22,opacity:s.busy?0.65:1,padding:2,position:"relative",transition:"background .15s ease",width:38},type:"button",children:a.jsx("span",{style:{background:"white",borderRadius:"50%",boxShadow:"0 1px 3px rgba(0,0,0,.35)",display:"block",height:18,transform:"translateX("+(t?16:0)+"px)",transition:"transform .15s ease",width:18}})})}),s.error?a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error}):null]})}
function RRouterPanel(){const[s,e]=RRouterState(),[t,n]=RRouterSecrets(),r=RRouterProviders.find(i=>i.value===s.provider)??RRouterProviders[0],i=s.usage?.providers?.[s.provider]??RRouterEmptyUsage,o=r.value==="codex"?"Uses the private ChatGPT login already stored by Codex on this Mac. Requests are made by Simeon directly.":r.kind==="local"?"Uses Claude Code's existing login on this Mac.":r.kind==="key"?"Stored securely with your other Simeon secrets.":"Uses the account already connected to Simeon.";return a.jsx(Te,{children:a.jsxs("div",{className:k("sand-settings-general","sand-9f619 sand-78zum5 sand-dt5ytf sand-3qzy4x"),children:[a.jsx(re,{title:"Routing",children:a.jsx(ie,{description:r.description,label:"Provider",variant:"card",children:a.jsx(ye,{"aria-label":"Routing provider",onValueChange:l=>{if(l!==null)void e(l)},options:RRouterOptions,placement:"bottom-end",size:"lg",value:s.provider,variant:"filled"})})}),a.jsx(re,{title:"Computer",children:a.jsx(RBoxRuntime,{})}),a.jsx(re,{title:r.kind==="key"?"OpenRouter account":"Account",children:a.jsx(ie,{description:o,label:r.kind==="key"?"API key":"Status",variant:"card",children:a.jsx(RRouterCredential,{provider:r,state:s,keys:t,onSaved:n})})}),s.error?a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error}):null,a.jsx(re,{title:"Usage for "+r.label,children:a.jsx(RRouterUsageRows,{usage:i})})]})})}
function RRouterUsageSummary({provider:s,usage:e,current:t,divided:n}){const r=[RRouterNumber(e.requests)+" requests",RRouterNumber(e.inputTokens)+" input",RRouterNumber(e.outputTokens)+" output",RRouterNumber(e.cacheReadTokens+e.cacheWriteTokens)+" cached"].join(" · "),i=t?"Current route":e.lastUsedAt?new Date(e.lastUsedAt).toLocaleString():"Not used yet";return a.jsx(ie,{divided:n,description:r,label:s.label,variant:"card",children:a.jsx(se,{as:"span",color:t?"primary":"secondary",size:"sm",children:i})})}
function RRouterUsage(){const[s]=RRouterState(),e=RRouterProviders.find(t=>t.value===s.provider)??RRouterProviders[0],t=RRouterProviders.filter(n=>n.value===s.provider||(s.usage?.providers?.[n.value]?.requests??0)>0);return a.jsxs("div",{className:k("sand-usage-section","sand-9f619 sand-78zum5 sand-dt5ytf sand-ou54vl"),children:[a.jsx(re,{title:"Current provider",children:a.jsx(ie,{description:e.description,label:e.label,variant:"card",children:a.jsx(se,{as:"span",color:"secondary",size:"sm",children:"Selected"})})}),a.jsx(re,{title:"Tracked activity",children:a.jsx("div",{children:t.map((n,r)=>a.jsx(RRouterUsageSummary,{provider:n,usage:s.usage?.providers?.[n.value]??RRouterEmptyUsage,current:n.value===s.provider,divided:r>0},n.value))})}),s.provider==="cursor"?a.jsx(Na,{}):null]})}
`;

/**
 * The product's name in the shipped 0.18.0 renderer, decided by the founder
 * on 22 September 2026: "replace all 'Grok Bot' by 'Simeon' everywhere in
 * the app. Replace all new names 'New Bot' by 'New Agent'". These are the
 * strings the checksum-pinned bytes carry (onboarding, About, the Computer
 * chrome, Settings titles, the default agent name); the pass runs over every
 * renderer chunk and the page, after the Settings patch.
 */
export const BRAND_REPLACEMENTS = Object.freeze([
  ["Grok Bot", "Simeon"],
  ["New Bot", "New Agent"],
  ["Caisra", "Simeon"],
]);

/**
 * "change all this by agent" (22 September 2026): the bare words Bot and
 * Bots ("Create new Bot", "Message Bot", "Search or create Bots", "Give
 * each Bot a job", "Hidden Bots", "Reset to the Bot"). In minified code a
 * three-letter identifier could be spelled Bot, so the word is only taken
 * where copy sits: between quotes, spaces or tag brackets, never next to
 * an operator, a dot or a bracket.
 */
export const BRAND_WORD_REPLACEMENTS = Object.freeze([
  [/(?<=["'` >])Bots(?=["'` <.,!?])/g, "Agents", "Bots"],
  [/(?<=["'` >])Bot(?=["'` <.,!?])/g, "Agent", "Bot"],
]);

/**
 * Words the brand pass does not rename, counted after it runs so the record
 * says whether any of Cursor's names are still in the shipped bytes (ledger
 * F-454, 26 September 2026). "Cursor" and "Anysphere" are left because in
 * a minified chunk they are as often identifiers as copy, and renaming an
 * identifier breaks the page; the count under `brand.residue` is the
 * measurement, and the visible occurrences are the Mac's to read.
 */
export const BRAND_RESIDUE_WORDS = Object.freeze(["Cursor", "Anysphere", "cursor.com", "cursor.sh"]);

export function countBrandResidue(sources) {
  const counts = {};
  for (const word of BRAND_RESIDUE_WORDS) {
    let count = 0;
    for (const source of sources) count += source.split(word).length - 1;
    counts[word] = count;
  }
  return counts;
}

export function patchOriginalBrandStrings(source) {
  let out = source;
  const counts = {};
  for (const [before, after] of BRAND_REPLACEMENTS) {
    const count = out.split(before).length - 1;
    counts[before] = count;
    if (count > 0) out = out.split(before).join(after);
  }
  for (const [pattern, after, label] of BRAND_WORD_REPLACEMENTS) {
    const count = (out.match(pattern) ?? []).length;
    counts[label] = count;
    if (count > 0) out = out.replace(pattern, after);
  }
  return { source: out, counts };
}


/**
 * The marks in the shipped screens, decided by the founder on 23 September
 * 2026 ("can we make it a cloud rather", "make it a cloud", and the petal
 * mark "with a slow turn so it still feels alive").
 *
 * Three anchors in the pinned chunk, each exactly once:
 *   1. The landing page's black mark next to the product name is an `sd`
 *      with no shape, so it draws the default blob. It becomes a cloud, one
 *      of the renderer's own shapes (`Jo.cloud`); the mood cycle is untouched.
 *   2. The onboarding hero, the mark that travels across the screens
 *      (`QBn`), is declared `shape:"blob"`. It becomes a cloud. The three
 *      teammates keep their shapes.
 *   3. The boot screen's logo (`tOt`, "Setting up …'s computer") is Grok
 *      Bot's own, an SVG path morphing through 158 frames. It becomes
 *      Simeon's twelve petals, drawn from the numbers in simeon-logo.mjs,
 *      same size, same colour variable (`MNe`, light-dark), same
 *      reduced-motion rule, turning once every 14 seconds instead of
 *      morphing.
 * Ocean, 26 September 2026 ("the onboarding cloud color is grey ish. i want
 * it this color", with a screenshot of the Ocean palette): the landing mark,
 * the hero and the no-agent mark (a fourth anchor) are `color:"blue"`, the
 * id Ocean is painted on, instead of `black` (Slate).
 * Plus one file: the hand-off screen ("Waking your computer…") and About
 * draw `assets/app-icon-C7NKj2u7.png`, and the pinned renderer carries Grok
 * Bot's icon under that name. Nothing replaced it before 23 September; the
 * founder's icon from frontend/runtime-assets is written over it now.
 */
const LANDING_MARK_BEFORE = 'p.jsx(sd,{"aria-hidden":!0,color:"black",paused:N,sizePx:ujn,state:E})';
const LANDING_MARK_AFTER = 'p.jsx(sd,{"aria-hidden":!0,color:"blue",paused:N,shape:"cloud",sizePx:ujn,state:E})';
const HERO_MARK_BEFORE = '{id:"hero",color:"black",shape:"blob",isGazing:!1,bob:null}';
const HERO_MARK_AFTER = '{id:"hero",color:"blue",shape:"cloud",isGazing:!1,bob:null}';
// The mark drawn when no agent is selected (the main screen before one is
// chosen): the renderer's own default was a black blob.
const IDLE_MARK_BEFORE = 'V=L==null?{color:"black",shape:"blob"}:';
const IDLE_MARK_AFTER = 'V=L==null?{color:"blue",shape:"cloud"}:';
const LOADING_LOGO_BEFORE = 'function tOt({size:n,color:e="black",className:t}){const s=window.matchMedia("(prefers-reduced-motion: reduce)").matches;return p.jsx("svg",{"aria-hidden":"true",className:t,height:n,viewBox:V_t,width:n,xmlns:"http://www.w3.org/2000/svg",children:p.jsx("path",{d:Q_t,fillRule:"evenodd",style:{fill:MNe(e)},children:s?null:p.jsx("animate",{attributeName:"d",calcMode:"discrete",dur:`${X_t}s`,repeatCount:"indefinite",values:eOt})})})}';
/** The petals fill the 80..320 window of the 400 box, so at 56 px the mark is as large as the logo it replaces. */
export const LOADING_LOGO_VIEWBOX = "80 80 240 240";
export const LOADING_LOGO_TURN_SECONDS = 14;
const LOADING_LOGO_PETALS = SIMEON_PETALS.map((petal, index) => `p.jsx("ellipse",{cx:${petal.cx},cy:${petal.cy},rx:${petal.rx},ry:${petal.ry},transform:"rotate(${petal.angle} ${petal.cx} ${petal.cy})",style:r},${index})`).join(",");
const LOADING_LOGO_AFTER = `function tOt({size:n,color:e="black",className:t}){const s=window.matchMedia("(prefers-reduced-motion: reduce)").matches,r={fill:MNe(e)};return p.jsx("svg",{"aria-hidden":"true",className:t,height:n,viewBox:"${LOADING_LOGO_VIEWBOX}",width:n,xmlns:"http://www.w3.org/2000/svg",children:p.jsxs("g",{children:[${LOADING_LOGO_PETALS},s?null:p.jsx("animateTransform",{attributeName:"transform",type:"rotate",from:"0 200 200",to:"360 200 200",dur:"${LOADING_LOGO_TURN_SECONDS}s",repeatCount:"indefinite"},"turn")]})})}`;
export const MARK_REPLACEMENTS = Object.freeze([
  ["landing-mark-cloud", LANDING_MARK_BEFORE, LANDING_MARK_AFTER],
  ["hero-mark-cloud", HERO_MARK_BEFORE, HERO_MARK_AFTER],
  ["idle-mark-ocean-cloud", IDLE_MARK_BEFORE, IDLE_MARK_AFTER],
  ["loading-logo-petals", LOADING_LOGO_BEFORE, LOADING_LOGO_AFTER],
]);
export const APP_ICON_ASSET = "app-icon-C7NKj2u7.png";
export const APP_ICON_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/runtime-assets", APP_ICON_ASSET);

export function patchOriginalMarks(source) {
  let out = source;
  for (const [label, before, after] of MARK_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * One shape: the cloud, in any of the twelve colours (26 September 2026: "i
 * want to remove all those shapes, and make the cloud the absolute main and
 * only shape. it just comes in different colors … apply it everywhere, even
 * in onboarding").
 *
 * The renderer draws every mark from one geometry table, `Jo` (18 shapes:
 * the animator, the static SVG `rOt`, the icon `Y9e`, the face placement
 * `sOt`), sizes it by one per-shape factor, `$de` over `ont`, and offers,
 * hashes and cycles shapes from one list, `Ij` (the editor's and
 * onboarding's shape pickers, `u4e` for an agent with no shape stored,
 * `gqn` for onboarding's teammates, the failure screen's cycle). So:
 *   1. every entry of `Jo` is the cloud's geometry, which makes a saved
 *      "pebble" or "hex" draw a cloud without touching anyone's data, and
 *      turns shape morphs into no-ops;
 *   2. `$de` returns the cloud's factor for every name, so a former blob is
 *      exactly today's cloud size (`lnt`, which divides by it, too);
 *   3. `Ij` is `["cloud"]`;
 *   4. onboarding's create-step default shape is the cloud.
 * The two shape pickers ("Character shape") are hidden by the stylesheet
 * rule below; the colour rows stay.
 */
export const SHAPE_REPLACEMENTS = Object.freeze([
  ["shapes-geometry-cloud", "Jo.wedge.face.leftDX=-6;const Qtt=Object.keys(Jo)", "Jo.wedge.face.leftDX=-6;for(const k of Object.keys(Jo))Jo[k]=Jo.cloud;const Qtt=Object.keys(Jo)"],
  ["shapes-scale-cloud", "function $de(n){return ont[n]??1}", "function $de(n){return ont.cloud}"],
  ["shapes-list-cloud", 'const Ij=["blob","pebble","squircle","tablet","wedge","hex","cloud","teardrop"];', 'const Ij=["cloud"];'],
  ["shapes-onboarding-default-cloud", 'mde={color:"blue",shape:"blob"}', 'mde={color:"blue",shape:"cloud"}'],
]);

export function patchOriginalShapes(source) {
  let out = source;
  for (const [label, before, after] of SHAPE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * Onboarding copy, 27 September 2026 (the founder's words): the sign-in
 * tagline, the sentence typed into the composer on the "meet" screen, and
 * the three example teammates' names. Their ids (`invoice-chaser`,
 * `weekly-standup`, `sales-forecast`) are layout keys and stay; only the
 * names drawn under them change. The access cover's own tagline ("… that
 * finish the work.") was not named and is left.
 */
export const COPY_REPLACEMENTS = Object.freeze([
  ["copy-signin-tagline", 'tagline:"Your team of always-on agents that you can give real work to."', 'tagline:"Your personal team of agents for whatever needs doing."'],
  ["copy-meet-typed", 'const H2e="Hand off any task to your team of agents"', 'const H2e="Put any task in the hands of your agents"'],
  ["copy-teammate-names", 'XBn={"invoice-chaser":"Invoice Chaser","weekly-standup":"Weekly Standup","sales-forecast":"Sales Forecast"}', 'XBn={"invoice-chaser":"Email Chaser","weekly-standup":"Flight Booker","sales-forecast":"Content Planner"}'],
]);

export function patchOriginalCopy(source) {
  let out = source;
  for (const [label, before, after] of COPY_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * Files and apps wear their real logos, 27 September 2026 (the founder: "anything
 * pdf use the svg we have for it, anything word, exel etc. for MDs use word
 * too"; "can plugings become this desing": "Connect apps" with Gmail,
 * Calendar and Drive tiles; then "you used the wrong svgs for the
 * microsofts … use these attached", and "whenever you mention an app, like
 * loom or miro, or any app, use their logo next to the name, and their color
 * logo for the text/name").
 *
 * The window draws a file's icon in one component (`OCe`), a tinted box
 * carrying `data-kind` with a glyph inside, the kind coming from the file's
 * mime type or name (`yAe` → `NHe`). The stylesheet paints the logo over
 * that box by kind: `pdf` the PDF artwork (the Word add-in's own), `document`
 * (Word) and `markdown` Word, `table` (xlsx, xls, csv, tsv) Excel, `slides`
 * PowerPoint; the three Microsoft logos are the web app's
 * (`clients/apps/web/public/icons`), the founder's pick, cut to 96 px.
 * PowerPoint had no kind (a `.pptx` fell through to `file`), so `NHe` names
 * `slides` for `.pptx`/`.ppt` and `document` for `.doc`/`.rtf`, only on its
 * unknown-extension branch, and the kind table `tin` gains `slides`; the
 * preview router (`gAe`) is untouched, so nothing new is offered a preview.
 * The sidebar's Plugins button keeps its action and becomes "Connect apps".
 * Slack's service tile, one flat aubergine glyph in the window's table, is
 * a white tile with the founder's full-colour Slack mark ("you using the
 * wrong slack logo"), found by the start of its glyph path; the same mark
 * sits beside "Slack" in a message. A file card's empty second line (size,
 * date) is dropped so the title centres on the download button ("the
 * titles be proportionate with the download icon").
 *
 * An app named in a message wears its logo and its colour: one rehype step
 * appended to the message pipeline (`yPn`, after the prose cards) wraps each
 * known name in a text node as `span.simeon-app[data-app]` with an empty
 * logo span before it; text under `a`, `code`, `pre` and `kbd` is left
 * alone and the words themselves are unchanged. Every element the message
 * renderer draws must carry the structure tag the prose-card step (`s1t`)
 * brands (`data.sandMarkdown`, checked by `ls`), so the new spans share
 * their parent's, and text whose parent carries none is not touched. The names, their colours and
 * logos are `brand/app-logos/apps.json`: the repository's colour logos where
 * it has one (Google, Microsoft, Zoom, Mailchimp) and Simple Icons (CC0,
 * brand hex included) for the rest, drawn as a mask in the text's colour.
 * Each colour is nudged darker in light mode until it holds 3:1 on the
 * message grey, and lighter in dark mode until it holds 4.5:1 on the
 * renderer's dark bubble, a near-black brand (Notion, Vercel, Miro) turning
 * near-white in dark mode the way its own dark-mode logo does; names that are common words (X, Box,
 * Render, Apple, a bare "Word") are not in the list.
 */
const BRAND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../brand");
export const FILE_ICON_SOURCES = Object.freeze({ pdf: "file-icons/pdf.svg", word: "file-icons/word.webp", excel: "file-icons/excel.webp", powerpoint: "file-icons/powerpoint.webp" });
export const APP_LOGO_SOURCES = Object.freeze({ gmail: "app-logos/gmail.webp", calendar: "app-logos/google-calendar.webp", drive: "app-logos/google-drive.svg" });
/** Service tiles the window draws as one flat colour that should carry the brand's full-colour logo instead, keyed by the start of the tile's glyph path. */
export const TILE_LOGO_SOURCES = Object.freeze({ slack: { file: "app-logos/slack.webp", pathStart: "M5.042 15.165" } });
export const APP_MENTIONS_MANIFEST = "app-logos/apps.json";
/** Extra spellings that name the same app as a manifest entry. */
const APP_MENTION_ALIASES = Object.freeze({ "Microsoft Word": "word", "Microsoft Excel": "excel", "Microsoft PowerPoint": "powerpoint", "Google Calendar": "google-calendar", "Microsoft Outlook": "outlook" });
/** Manifest names that are too often an ordinary word to mark on their own. */
const APP_MENTION_EXCLUDED_NAMES = new Set(["Word"]);
const PLUGINS_BUTTON_BEFORE = 'c=p.jsx("span",{"aria-hidden":!0,className:"sand-9f619 sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-gd8bvy sand-1fgtraw sand-1hc762m sand-13fuv20 sand-t8lcch sand-u6mfa5 sand-32b0ac sand-14px5p1 sand-1hkp6id sand-1q0q8m5 sand-19145p9 sand-1yxlikc sand-19ypqd9 sand-1hovq1a sand-149ho13 sand-10e981r",children:p.jsx(bt,{name:"plug",size:14})}),u=p.jsx("span",{className:"sand-1iyjqo2 sand-s83m0k sand-euugli sand-b3r6kr sand-lyipyv sand-uxw1ft",children:"Plugins"})';
const PLUGINS_BUTTON_AFTER = 'c=p.jsxs("span",{"aria-hidden":!0,className:"simeon-connect-apps__logos",children:[p.jsx("i",{"data-app":"gmail"}),p.jsx("i",{"data-app":"calendar"}),p.jsx("i",{"data-app":"drive"})]}),u=p.jsx("span",{className:"simeon-connect-apps__label",children:"Connect apps"})';
const MESSAGE_REHYPE_BEFORE = "function yPn(n,e=!0){return[...i1t,[s1t,{classifyProseCard:e?gPn:void 0,syntheticProseCards:n}]]}";

/** The rehype step, as source: `names` maps each spelling to its app key. */
export function appMentionsPluginSource(names) {
  if (Object.keys(names).length === 0) return "const __simeonAppMentions=()=>()=>{};";
  const escaped = Object.keys(names).sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = `(?<![\\w@/.-])(?:${escaped.join("|")})(?![\\w-])`;
  return `const __simeonAppMentions=(()=>{const A=${JSON.stringify(names)},R=new RegExp(${JSON.stringify(pattern)},"g"),S=new Set(["a","code","pre","kbd","script","style"]);const w=n=>{if(!n||!Array.isArray(n.children)||S.has(n.tagName))return;const o=[];let c=!1;const d=n.data&&n.data.sandMarkdown;for(const k of n.children){if(k.type!=="text"||d===void 0){w(k);o.push(k);continue}const v=k.value;let i=0,m;R.lastIndex=0;while((m=R.exec(v))!==null){c=!0;m.index>i&&o.push({type:"text",value:v.slice(i,m.index)});o.push({type:"element",tagName:"span",properties:{className:["simeon-app"],dataApp:A[m[0]]},data:{sandMarkdown:d},children:[{type:"element",tagName:"span",properties:{className:["simeon-app__logo"],ariaHidden:"true"},data:{sandMarkdown:d},children:[]},{type:"text",value:m[0]}]});i=m.index+m[0].length}i===0?o.push(k):i<v.length&&o.push({type:"text",value:v.slice(i)})}c&&(n.children=o)};return()=>t=>{w(t)}})();`;
}

export const LOGO_REPLACEMENTS = Object.freeze([
  ["connect-apps-button", PLUGINS_BUTTON_BEFORE, PLUGINS_BUTTON_AFTER],
  ["file-kind-slides", 'return r!=null&&A6n.has(r)?"archive":null', 'return r==="pptx"||r==="ppt"?"slides":r==="doc"||r==="rtf"?"document":r!=null&&A6n.has(r)?"archive":null'],
  ["file-kind-table-slides", "tin={markdown:", 'tin={slides:{icon24:"file",icon36:"file",tint:"neutral"},markdown:'],
  ["notion-tile-light", 'notion:{kind:"brand",hex:"#0F0F10",path:', 'notion:{kind:"brand",hex:"#FFFFFF",path:'],
  ["slack-tile-light", 'slack:{kind:"brand",hex:"#4A154B",path:', 'slack:{kind:"brand",hex:"#FFFFFF",path:'],
  ["approval-badge-marker", 'p.jsxs("span",{...Fe(lc.badge,N?lc.badgePending:FAn[y.kind]),role:"status",children:[N?p.jsx(bt,{"aria-hidden":!0,color:"yellow"', 'p.jsxs("span",{...Fe(lc.badge,N?lc.badgePending:FAn[y.kind]),"data-simeon-approval":N?"pending":void 0,role:"status",children:[N?p.jsx(bt,{"aria-hidden":!0,color:"yellow"'],
  ["message-app-mentions", MESSAGE_REHYPE_BEFORE, (names) => `${appMentionsPluginSource(names)}${MESSAGE_REHYPE_BEFORE.replace("syntheticProseCards:n}]]}", "syntheticProseCards:n}],__simeonAppMentions]}")}`],
]);

/** Spelling → app key for every name the messages mark. */
export function appMentionNames(mentions) {
  const names = {};
  for (const { name, key } of mentions) if (!APP_MENTION_EXCLUDED_NAMES.has(name)) names[name] = key;
  const keys = new Set(mentions.map(({ key }) => key));
  for (const [alias, key] of Object.entries(APP_MENTION_ALIASES)) if (keys.has(key)) names[alias] = key;
  return names;
}

export function patchOriginalLogos(source, names) {
  let out = source;
  for (const [label, before, after] of LOGO_REPLACEMENTS) out = replaceExactlyOnce(out, before, typeof after === "function" ? after(names) : after, label);
  return out;
}

const MIME = { ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
const dataUrl = (bytes, file) => `data:${MIME[path.extname(file)]};base64,${Buffer.from(bytes).toString("base64")}`;

export async function readLogoAssets(brandDir = BRAND_DIR) {
  const read = async (sources) => Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, file]) => [key, dataUrl(await readFile(path.join(brandDir, file)), file)])));
  const manifest = JSON.parse(await readFile(path.join(brandDir, APP_MENTIONS_MANIFEST), "utf8"));
  const mentions = await Promise.all(manifest.map(async (app) => ({ ...app, logo: dataUrl(await readFile(path.join(brandDir, "app-logos", app.logo)), app.logo) })));
  const tiles = await Promise.all(Object.entries(TILE_LOGO_SOURCES).map(async ([key, { file, pathStart }]) => ({ key, pathStart, logo: dataUrl(await readFile(path.join(brandDir, file)), file) })));
  return { files: await read(FILE_ICON_SOURCES), apps: await read(APP_LOGO_SOURCES), mentions, tiles };
}

const rgbOf = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const hexOf = (rgb) => `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
const luminance = (rgb) => { const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrastRatio = (a, b) => { const [hi, lo] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** The brand colour, mixed toward `toward` in 5% steps until it holds 3:1 on `background`. */
export function readableOn(hex, background, toward, minimum = 3) {
  const from = rgbOf(hex), to = rgbOf(toward);
  for (let step = 0; step <= 20; step += 1) {
    const candidate = hexOf(from.map((c, i) => c + (to[i] - c) * (step / 20)));
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return toward;
}
export const MESSAGE_GREY_LIGHT = "#eeeeee";
/** The renderer's own dark agent bubble; a dark-theme name must hold 4.5:1 on it, since a black brand lifted only to 3:1 reads as disabled grey. */
export const MESSAGE_GREY_DARK = "#262626";

export const LOGOS_MARKER = "/* Simeon: files and apps wear their real logos";
const HI = ":not(#\\#):not(#\\#):not(#\\#)";

export function logosCss({ files, apps, mentions = [], tiles = [] }) {
  const kinds = [["pdf", files.pdf], ["document", files.word], ["markdown", files.word], ["table", files.excel], ["slides", files.powerpoint]];
  const box = (kind) => `span[data-kind="${kind}"][data-size]${HI}`;
  return `${LOGOS_MARKER} (27 September 2026). */
${kinds.map(([kind]) => box(kind)).join(",")}{background:var(--simeon-file-logo) center/82% no-repeat;border-color:transparent;box-shadow:none}
${kinds.map(([kind]) => `${box(kind)}>*`).join(",")}{visibility:hidden}
${kinds.map(([kind, url]) => `${box(kind)}{--simeon-file-logo:url("${url}")}`).join("\n")}
.sand-agents-sidebar__plugins-entry${HI}{position:relative;z-index:1;height:40px;margin:0 0 -40px 40px;padding:0}
.sand-agents-sidebar__plugins${HI}{justify-content:flex-start;gap:6px;width:auto;height:40px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8);font-size:13px;font-weight:500}
.sand-agents-sidebar__plugins${HI}:hover{background:transparent;color:light-dark(#1b4a7d,#a9ccf0)}
.sand-agents-sidebar__account:not([data-collapsed="true"])${HI}{flex:0 0 auto;width:auto}
.sand-agents-sidebar__account:not([data-collapsed="true"])${HI}>button>span:nth-child(2){display:none}
.sand-agents-sidebar__rail-new .sand-agents-sidebar__new${HI}:not(#\\#){width:36px;height:36px;border-radius:999px;background:var(--sand-fill-neutral-subtle);box-shadow:inset 0 0 0 .5px var(--sand-border-default)}
.sand-agents-sidebar__rail-new .sand-agents-sidebar__new${HI} .ui-icon{--icon-size:18px!important;color:var(--sand-text-secondary)}
.simeon-connect-apps__label{white-space:nowrap}
.simeon-connect-apps__logos{order:1;display:inline-flex;align-items:center;margin-left:2px}
.simeon-connect-apps__logos>i{display:block;width:20px;height:20px;margin-left:-3px;border-radius:5px;background:#fff center/14px no-repeat;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.1)}
.simeon-connect-apps__logos>i:first-child{margin-left:0;transform:rotate(-7deg)}
.simeon-connect-apps__logos>i:last-child{transform:rotate(7deg)}
${Object.entries(apps).map(([app, url]) => `.simeon-connect-apps__logos>i[data-app="${app}"]{background-image:url("${url}")}`).join("\n")}
${tiles.map(({ pathStart, logo }) => `.sand-tool-icon:has(>svg path[d^="${pathStart}"])${HI}{background:#fff url("${logo}") center/62% no-repeat!important;box-shadow:inset 0 0 0 1px var(--sand-border-default)}\n.sand-tool-icon:has(>svg path[d^="${pathStart}"])${HI}>svg{visibility:hidden}`).join("\n")}
.sand-file-card__meta:empty${HI}{display:none}
.simeon-app{color:var(--simeon-app-color,inherit);font-weight:500;white-space:nowrap}
.simeon-app__logo{display:inline-block;width:1.05em;height:1.05em;margin:0 .26em 0 .04em;vertical-align:-.18em;background:center/contain no-repeat}
.sand-mvmkjj .simeon-app{color:inherit}
strong .simeon-app,b .simeon-app,h1 .simeon-app,h2 .simeon-app,h3 .simeon-app{font-weight:inherit}
${mentions.map(({ key, color, logo, mono }) => `.simeon-app[data-app="${key}"]{--simeon-app-color:light-dark(${readableOn(color, MESSAGE_GREY_LIGHT, "#000000")},${luminance(rgbOf(color)) < 0.03 ? "#ececec" : readableOn(color, MESSAGE_GREY_DARK, "#ffffff", 4.5)})}\n.simeon-app[data-app="${key}"]>.simeon-app__logo{${mono ? `background:currentColor;-webkit-mask:url("${logo}") center/contain no-repeat;mask:url("${logo}") center/contain no-repeat` : `background-image:url("${logo}")`}}`).join("\n")}
`;
}

/**
 * Cards speak in the chat's blue, 27 September 2026 ("design the approval/
 * permission - approval needed make it our blue, the button allow once and
 * any other main button in cards to always be the blue of the chat"). Every
 * primary button inside a message card (`.sand-message-card`, which wraps
 * the approval, email draft, connector and permission cards) is filled with
 * the bubble's blue, white text; the Auto-review card's pending badge,
 * orange in Grok Bot, is marked `data-simeon-approval="pending"` where it
 * is drawn and tinted blue with a blue spinner. Outline buttons (Always
 * allow, Deny, Discard) are untouched.
 *
 * Every card is white like the file card ("all cards literally all, should
 * be white background … because the artifact/attachment background are
 * white"): the choice, connector, email, approval and permission cards
 * paint with `--sand-fill-bubble-agent`, the agent bubble's grey, so inside
 * `.sand-message-card` that token points at the file card's
 * `--sand-fill-elevated`, and each card's surface takes the file card's
 * border; the agent's message bubbles, outside any card, stay grey. A white
 * service tile (Gmail, and Notion, which draws its light-mode logo: white
 * tile, dark mark, "i want the light mode logo") gets a hairline so it does
 * not vanish on the white card.
 *
 * The agent's bubble, outside cards, is the grey Messages gives a
 * received text (#E9E9EB, "like grey but KINDA blue ish", sampled from the
 * founder's screenshot; #3B3B3D in dark), set on the bubble token where the
 * theme sets it. Blue lines and a white bubble were tried the same day and
 * reverted ("not a fan").
 */
export const CARD_BLUE_MARKER = "/* Simeon: cards speak in the chat's blue";
/**
 * The agent's bubble in the light theme: the grey Messages gives a received
 * text, a touch blue (#E9E9EB). The dark theme keeps the renderer's own
 * bubble colour ("make sure all the changes apply to dark mode … but there
 * dont change the ai chat"), and a card takes whatever the bubble is in the
 * current theme through `--simeon-card-fill`, resolved where the theme sets
 * the bubble, before a card clears the bubble token for itself.
 */
export const AGENT_BUBBLE_LIGHT = "#e9e9eb";

/**
 * A card fades, 27 September 2026 (the founder, after trying Apple-style
 * glass panes and white "water glass" buttons: "the cards should not be
 * waterglass in box, but more like something fading", then "a is fine, but
 * dont forget to remove the liquid glass, that goes for the buttons too").
 * Buttons are flat again. The fade was then dropped too ("never mind for
 * the cards being fading etc. just put everything grey"): a card is the
 * agent bubble's Messages grey, solid, with no border, rim, shadow or blur.
 * The agent's name pill under its avatar in the chat header is white
 * Liquid Glass ("the names up center of the avatar, make that box white
 * liquid glass": a top-lit white fill, blur, a bright rim and a soft drop),
 * and the composer's send button is the chat's blue.
 * The header of an exchange between two agents ("the convo between two ais
 * up top with the avatars be centered") is a three-column grid: the pair in
 * the middle column, the computer control in the last.
 */
/**
 * The choice card's options sit on the card's grey instead of a white box,
 * and each option's A/B/C key is a round radio: an empty ring, blue on
 * hover or focus, and a blue dot on the chosen answer ("instead of a or b or
 * c have it being round picker. blue for the dot"). The keyboard shortcut
 * letters still work; only their drawing changed.
 */
const CHOICE_RADIO_CSS = () => `.sand-widget__options${HI}{background:var(--simeon-card-fill);border-color:transparent}
.sand-widget-option__key${HI}{box-sizing:border-box;width:18px;height:18px;min-width:18px;padding:0;border-radius:999px;border:1.5px solid light-dark(rgba(20,20,20,.3),rgba(255,255,255,.4));background:transparent}
.sand-widget-option__key${HI}>*{display:none}
.sand-widget-option:is(:hover,:focus-visible) .sand-widget-option__key${HI}{border-color:light-dark(${USER_BUBBLE_LIGHT},#5b9be0)}
.sand-widget-option--selected .sand-widget-option__key${HI}{opacity:1;border-color:light-dark(${USER_BUBBLE_LIGHT},#5b9be0);background:radial-gradient(circle,light-dark(${USER_BUBBLE_LIGHT},#5b9be0) 0 4px,transparent 4.5px)}
.sand-widget-option--selected [title="Selected"]${HI}{display:none}
`;

const GREY_CARD = [
  "background:var(--simeon-card-fill)",
  "border-color:transparent",
  "box-shadow:none",
].join(";");

export const cardBlueCss = () => `${CARD_BLUE_MARKER} (27 September 2026). */
[data-theme*="light"]:not(#\\#):not(#\\#),[data-theme*="light"] :is(.sand-1wuigm2,.ui-1lzgia1):not(#\\#):not(#\\#){--sand-fill-bubble-agent:${AGENT_BUBBLE_LIGHT}}
:root:not(#\\#):not(#\\#):not(#\\#),[data-theme]:not(#\\#):not(#\\#):not(#\\#),:is(.sand-1wuigm2,.ui-1lzgia1):not(#\\#):not(#\\#):not(#\\#){--simeon-card-fill:var(--sand-fill-bubble-agent)}
.sand-message-card{--sand-fill-bubble-agent:transparent}
.sand-message-card>:is(article,form,section)${HI},.sand-message-card :is(.sand-connector-card,.sand-widget--choices,.sand-email-composer,.sand-file-card)${HI}{${GREY_CARD}}
.sand-message-card .sand-tool-icon[style*="background-color: rgb(255, 255, 255)"]${HI}{box-shadow:inset 0 0 0 1px var(--sand-border-default)}
${CHOICE_RADIO_CSS()}.sand-agent-item[data-active="true"]${HI}:not(#\\#){background:light-dark(#fff,rgba(255,255,255,.12));box-shadow:0 0 0 .5px light-dark(rgba(20,20,20,.08),rgba(255,255,255,.08)),0 1px 2px light-dark(rgba(20,20,20,.06),rgba(0,0,0,.3))}
.sand-chat-header__name${HI}:not(#\\#){background:linear-gradient(180deg,light-dark(rgba(255,255,255,.92),rgba(255,255,255,.18)),light-dark(rgba(255,255,255,.72),rgba(255,255,255,.08)));-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);border:.5px solid light-dark(rgba(255,255,255,.9),rgba(255,255,255,.18));box-shadow:inset 0 1px 0 light-dark(#fff,rgba(255,255,255,.22)),0 0 0 .5px light-dark(rgba(20,20,40,.1),rgba(0,0,0,.45)),0 2px 8px -2px light-dark(rgba(20,20,40,.14),rgba(0,0,0,.5))}
.sand-prompt-send${HI}:not(#\\#){background-color:light-dark(${USER_BUBBLE_LIGHT},${USER_BUBBLE_DARK});color:#fff}
.sand-prompt-send${HI}:not(#\\#):hover:not(:disabled){background-color:light-dark(#1e4d80,#2a62a0)}
.sand-chat-header:has(>.sand-chat-header__exchange)${HI}{display:grid;grid-template-columns:1fr auto 1fr;align-items:center}
.sand-chat-header>.sand-chat-header__exchange${HI}{grid-column:2;justify-self:center}
.sand-chat-header:has(>.sand-chat-header__exchange)>.sand-chat-header__controls${HI}{grid-column:3;justify-self:end}
.sand-message-card button[data-variant="primary"]${HI}{background-color:light-dark(${USER_BUBBLE_LIGHT},${USER_BUBBLE_DARK});border-color:transparent;color:#fff}
.sand-message-card button[data-variant="primary"]${HI}:hover:not(:disabled){background-color:light-dark(#1e4d80,#2a62a0)}
.sand-message-card button[data-variant="primary"]${HI}:active:not(:disabled){background-color:light-dark(#1a4372,#1b4677)}
.sand-message-card button[data-variant="primary"]${HI}:focus-visible{outline:2px solid light-dark(rgba(37,90,147,.45),rgba(140,184,232,.55));outline-offset:2px}
[data-simeon-approval="pending"]${HI}{background-color:light-dark(rgba(37,90,147,.12),rgba(140,184,232,.16));color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8)}
[data-simeon-approval="pending"]${HI} .ui-icon{color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8)}
`;

export function patchOriginalLogosStylesheet(css, assets) {
  if (css.includes(LOGOS_MARKER)) throw new Error("Original renderer logos block is already present.");
  return `${css}\n${logosCss(assets)}${cardBlueCss()}`;
}

export const SHAPE_PICKER_MARKER = "/* Simeon: one shape, the cloud";
export const SHAPE_PICKER_CSS = `${SHAPE_PICKER_MARKER} (26 September 2026): the shape pickers in the agent editor and onboarding are gone; colour stays. */
[aria-label="Character shape"]{display:none!important}
`;

export function patchOriginalShapePickerStylesheet(css) {
  if (css.includes(SHAPE_PICKER_MARKER)) throw new Error("Original renderer shape-picker block is already present.");
  return `${css}\n${SHAPE_PICKER_CSS}`;
}

/**
 * The agents' colours, replaced whole on 23 September 2026 ("i wanna change
 * the color palettes choices of the bots. completely … replace all existing
 * colors with this"): twelve soft vertical gradients in the founder's
 * reference style (a grainy sunset, a sage sphere, a blue-lavender one),
 * previewed on the cloud and the blob in light and dark before this was
 * written. The renderer's eleven colour ids keep their names so every saved
 * agent still resolves; each now names one of the twelve palettes, and a
 * twelfth id, `mint`, is added. Slate replaces black, so the landing mark and
 * the onboarding hero (both `color:"black"`) are slate.
 *
 * How the mark is painted after this patch: the `sd` and mirror spans set
 * --ink-from / --ink-mid / --ink-to next to --fg (the palette's middle
 * colour, which rings, particles and glyphs still use); the animator's SVG
 * always defines a three-stop gradient on those variables and a film-grain
 * filter, and the body path is filled with the gradient through the grain.
 * The `inkGradient` prop path the animator had (two stops, never passed by
 * `sd`) is replaced by this. Colour is the same in light and dark.
 */
export const AGENT_PALETTES = Object.freeze([{"id": "yellow", "label": "Dusk", "top": "#8b8bea", "mid": "#f7a1b3", "bottom": "#ffb98a"}, {"id": "cyan", "label": "Sage", "top": "#2f6f72", "mid": "#6e9c95", "bottom": "#b8d1c5"}, {"id": "violet", "label": "Lagoon", "top": "#7cc0e0", "mid": "#d7a9dc", "bottom": "#2b4c92"}, {"id": "red", "label": "Ember", "top": "#ff9a76", "mid": "#ffd0a0", "bottom": "#6b3e8f"}, {"id": "green", "label": "Moss", "top": "#6f8f4f", "mid": "#a8c58a", "bottom": "#dfeacb"}, {"id": "brown", "label": "Sand", "top": "#f6e2c4", "mid": "#f2b48b", "bottom": "#c6754e"}, {"id": "magenta", "label": "Berry", "top": "#e07aa8", "mid": "#f4b7d0", "bottom": "#3e2a7a"}, {"id": "blue", "label": "Ocean", "top": "#1f3b73", "mid": "#3c7fb7", "bottom": "#7fd4d0"}, {"id": "gray", "label": "Rose", "top": "#f6c1c7", "mid": "#f0a4b8", "bottom": "#8f5c86"}, {"id": "black", "label": "Slate", "top": "#8c9db8", "mid": "#5e6d86", "bottom": "#d9dfe8"}, {"id": "orange", "label": "Peach", "top": "#ffd1a6", "mid": "#ffb0a3", "bottom": "#e56f8f"}, {"id": "mint", "label": "Mint", "top": "#bff0e2", "mid": "#8fd3c3", "bottom": "#3c8a86"}]);
const PALETTE_G_T_BEFORE = "G_t={black:{lightFrom:\"#585858\",lightTo:\"#000000\",darkFrom:\"#FFFFFF\",darkTo:\"#C2C2C2\"},brown:{lightFrom:\"#AE8968\",lightTo:\"#855C36\",darkFrom:\"#A27952\",darkTo:\"#604227\"},red:{lightFrom:\"#FF5667\",lightTo:\"#E02135\",darkFrom:\"#FF3E51\",darkTo:\"#A21826\"},orange:{lightFrom:\"#FF8838\",lightTo:\"#E05B00\",darkFrom:\"#FF781C\",darkTo:\"#C24E00\"},yellow:{lightFrom:\"#FFAF38\",lightTo:\"#E08600\",darkFrom:\"#FFA31C\",darkTo:\"#C27400\"},green:{lightFrom:\"#1CCF82\",lightTo:\"#009957\",darkFrom:\"#00C972\",darkTo:\"#008048\"},cyan:{lightFrom:\"#58D3C5\",lightTo:\"#00A592\",darkFrom:\"#1CC3B0\",darkTo:\"#007769\"},blue:{lightFrom:\"#459FFE\",lightTo:\"#0E74E0\",darkFrom:\"#2A92FE\",darkTo:\"#0C64C1\"},violet:{lightFrom:\"#B792FE\",lightTo:\"#804EE0\",darkFrom:\"#9159FE\",darkTo:\"#5C39A1\"},magenta:{lightFrom:\"#FF77BE\",lightTo:\"#E02A88\",darkFrom:\"#FF47A6\",darkTo:\"#A21E62\"},gray:{lightFrom:\"#A6A6A6\",lightTo:\"#696969\",darkFrom:\"#B7B7B7\",darkTo:\"#777777\"}}";
const PALETTE_G_T_AFTER = "G_t={" + AGENT_PALETTES.map((p) => `${p.id}:{lightFrom:"${p.top}",lightMid:"${p.mid}",lightTo:"${p.bottom}",darkFrom:"${p.top}",darkMid:"${p.mid}",darkTo:"${p.bottom}"}`).join(",") + "}";
const PALETTE_SNT_BEFORE = "const snt={black:{light:\"#000000\",dark:\"#FFFFFF\"},brown:{light:\"#A27952\",dark:\"#855C36\"},red:{light:\"#FF3E51\",dark:\"#E02135\"},orange:{light:\"#FF781C\",dark:\"#FF6700\"},yellow:{light:\"#FFAF38\",dark:\"#FF9800\"},green:{light:\"#00C972\",dark:\"#009957\"},cyan:{light:\"#1CC3B0\",dark:\"#00A592\"},blue:{light:\"#2A92FE\",dark:\"#0E74E0\"},violet:{light:\"#A97EFE\",dark:\"#804EE0\"},magenta:{light:\"#FF5EB1\",dark:\"#E02A88\"},gray:{light:\"#959595\",dark:\"#777777\"}};";
const PALETTE_SNT_AFTER = "const snt={" + AGENT_PALETTES.map((p) => `${p.id}:{light:"${p.mid}",dark:"${p.mid}"}`).join(",") + "};";
const PALETTE_PQ_BEFORE = "PQ=[{id:\"black\",label:\"Black\",value:\"#000\"},{id:\"brown\",label:\"Brown\",value:\"#936439\"},{id:\"red\",label:\"Red\",value:\"#FF263C\"},{id:\"orange\",label:\"Orange\",value:\"#FF6700\"},{id:\"yellow\",label:\"Yellow\",value:\"#FF9800\"},{id:\"green\",label:\"Green\",value:\"#00C972\"},{id:\"cyan\",label:\"Cyan\",value:\"#00BCA6\"},{id:\"blue\",label:\"Blue\",value:\"#1084FE\"},{id:\"violet\",label:\"Violet\",value:\"#9159FE\"},{id:\"magenta\",label:\"Magenta\",value:\"#FF309B\"},{id:\"gray\",label:\"Gray\",value:\"#777777\"}]";
const PALETTE_PQ_AFTER = "PQ=[" + AGENT_PALETTES.map((p) => `{id:"${p.id}",label:"${p.label}",value:"${p.mid}"}`).join(",") + "]";
const PALETTE_PICKER_BEFORE = 'const nnt=PQ.filter(n=>n.id!=="black")';
const PALETTE_PICKER_AFTER = "const nnt=PQ.slice()";
const PALETTE_K_T_BEFORE = "function K_t(n){const e=G_t[n];return{from:`light-dark(${e.lightFrom}, ${e.darkFrom})`,to:`light-dark(${e.lightTo}, ${e.darkTo})`,angle:W_t}}";
const PALETTE_K_T_AFTER = 'function OrbInk(n){const e=G_t[n]??G_t.black;return{from:`light-dark(${e.lightFrom}, ${e.darkFrom})`,mid:`light-dark(${e.lightMid}, ${e.darkMid})`,to:`light-dark(${e.lightTo}, ${e.darkTo})`}}function K_t(n){return{...OrbInk(n),angle:W_t}}';
const PALETTE_Y_T_BEFORE = "function Y_t(n){const{from:e,to:t,angle:s}=K_t(n);return`linear-gradient(${s+90}deg, ${e}, ${t})`}";
const PALETTE_Y_T_AFTER = "function Y_t(n){const{from:e,mid:r,to:t,angle:s}=K_t(n);return`linear-gradient(${s+90}deg, ${e}, ${r} 55%, ${t})`}";
const PALETTE_DEFS_BEFORE = "b&&(()=>{const Q=(b.angle??90)%360*Math.PI/180,ae=Math.cos(Q)/2,ce=Math.sin(Q)/2;return p.jsxs(\"linearGradient\",{id:`${N}-ink`,x1:.5-ae,y1:.5-ce,x2:.5+ae,y2:.5+ce,children:[p.jsx(\"stop\",{offset:b.fromPos??0,style:{stopColor:b.from}}),p.jsx(\"stop\",{offset:Math.max(b.toPos??1,b.fromPos??0),style:{stopColor:b.to}})]})})()]})";
const PALETTE_DEFS_AFTER = 'p.jsxs("linearGradient",{id:`${N}-ink`,x1:0,y1:0,x2:.15,y2:1,children:[p.jsx("stop",{offset:0,style:{stopColor:"var(--ink-from)"}}),p.jsx("stop",{offset:.55,style:{stopColor:"var(--ink-mid)"}}),p.jsx("stop",{offset:1,style:{stopColor:"var(--ink-to)"}})]}),p.jsxs("filter",{id:`${N}-grain`,x:0,y:0,width:1,height:1,children:[p.jsx("feTurbulence",{type:"fractalNoise",baseFrequency:.9,numOctaves:2,seed:7,result:"n"}),p.jsx("feColorMatrix",{in:"n",type:"matrix",values:"0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .35 0",result:"g"}),p.jsx("feBlend",{in:"SourceGraphic",in2:"g",mode:"overlay",result:"b"}),p.jsx("feComposite",{in:"b",in2:"SourceGraphic",operator:"in"})]})]})';
const PALETTE_BODY_BEFORE = 'p.jsx("path",{ref:G,style:b?{fill:`url(#${N}-ink)`}:Rke,d:le.path})';
const PALETTE_BODY_AFTER = 'p.jsx("path",{ref:G,style:{fill:`url(#${N}-ink)`,filter:`url(#${N}-grain)`},d:le.path})';
const PALETTE_SD_STYLE_BEFORE = 'D={...Z.style,width:J,height:J,"--fg":r?.flat??MNe(t),"--bg":f??String(nd["--sand-bg-base"])}';
const PALETTE_SD_STYLE_AFTER = 'D={...Z.style,width:J,height:J,"--fg":r?.flat??MNe(t),"--ink-from":r?.gradientFrom??OrbInk(t).from,"--ink-mid":r?.gradientFrom??OrbInk(t).mid,"--ink-to":r?.gradientTo??OrbInk(t).to,"--bg":f??String(nd["--sand-bg-base"])}';
const PALETTE_MIRROR_STYLE_BEFORE = 'f={...x.style,width:m,height:m,"--fg":i?.flat??MNe(s),"--bg":o??String(nd["--sand-bg-base"])}';
const PALETTE_MIRROR_STYLE_AFTER = 'f={...x.style,width:m,height:m,"--fg":i?.flat??MNe(s),"--ink-from":i?.gradientFrom??OrbInk(s).from,"--ink-mid":i?.gradientFrom??OrbInk(s).mid,"--ink-to":i?.gradientTo??OrbInk(s).to,"--bg":o??String(nd["--sand-bg-base"])}';
// The still marks (group avatars, and every place the window draws a mark as an image rather
// than the animator): _Ne gave the drawing one flat colour, the old palette's middle, as a
// from = to gradient, so the Launch squad's three clouds were pale single colours next to the
// agents' own three-stop marks (the founder, 28 September 2026: "make sure the message side bar
// group message use the real colors"). They take the palette's three stops now, and the
// drawing's gradient carries the middle stop when one is given.
const PALETTE_STILL_INK_BEFORE = "inkGradient:{light:{from:r,to:r},dark:{from:i,to:i}}";
const PALETTE_STILL_INK_AFTER = "inkGradient:(e=>e?{light:{from:e.lightFrom,mid:e.lightMid,to:e.lightTo},dark:{from:e.darkFrom,mid:e.darkMid,to:e.darkTo}}:{light:{from:r,to:r},dark:{from:i,to:i}})(G_t[s])";
const PALETTE_STILL_STOPS_BEFORE = '<stop offset="0" stop-color="${A.from}"/><stop offset="1" stop-color="${A.to}"/>';
const PALETTE_STILL_STOPS_AFTER = '<stop offset="0" stop-color="${A.from}"/>${A.mid?`<stop offset=".55" stop-color="${A.mid}"/>`:""}<stop offset="1" stop-color="${A.to}"/>';

export const PALETTE_REPLACEMENTS = Object.freeze([
  ["palette-gradients", PALETTE_G_T_BEFORE, PALETTE_G_T_AFTER],
  ["palette-flat", PALETTE_SNT_BEFORE, PALETTE_SNT_AFTER],
  ["palette-picker-entries", PALETTE_PQ_BEFORE, PALETTE_PQ_AFTER],
  ["palette-picker-all", PALETTE_PICKER_BEFORE, PALETTE_PICKER_AFTER],
  ["palette-ink-helper", PALETTE_K_T_BEFORE, PALETTE_K_T_AFTER],
  ["palette-css-gradient", PALETTE_Y_T_BEFORE, PALETTE_Y_T_AFTER],
  ["palette-svg-defs", PALETTE_DEFS_BEFORE, PALETTE_DEFS_AFTER],
  ["palette-body-fill", PALETTE_BODY_BEFORE, PALETTE_BODY_AFTER],
  ["palette-mark-vars", PALETTE_SD_STYLE_BEFORE, PALETTE_SD_STYLE_AFTER],
  ["palette-mirror-vars", PALETTE_MIRROR_STYLE_BEFORE, PALETTE_MIRROR_STYLE_AFTER],
  ["palette-still-ink", PALETTE_STILL_INK_BEFORE, PALETTE_STILL_INK_AFTER],
  ["palette-still-stops", PALETTE_STILL_STOPS_BEFORE, PALETTE_STILL_STOPS_AFTER],
]);

export function patchOriginalPalette(source) {
  let out = source;
  for (const [label, before, after] of PALETTE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * The person's own chat bubble. It was iMessage blue from 23 September 2026
 * ("copy imessage style and make it blue"); since 27 September it is the
 * founder's "Sky wash, deepest": a sky blue gradient under film grain and a
 * horizontal brush texture ("these are the main color i like. kinda grainy,
 * artistic, painting"; "sky wash deepest is fine"). It first carried a teal
 * and a dusty rose stroke at the tail; they came out the same day ("too
 * noisy. keep the blue color, remove the purple/green accents"). White text
 * holds 5.9:1 to 7.1:1 on it, which the lighter first drafts did not ("the
 * white of the text wont be seen").
 *
 * The renderer's theme variables are generated at runtime from a token list
 * in the chunk (`Ct("fill/bubble-user", El(light, dark, hcLight, hcDark))`,
 * emitted by `bzn` as `--sand-fill-bubble-user`); the stylesheet carries only
 * the light default for first paint. Both are patched to the painting's base
 * blue, which is also what `--cursor-foreground` (a checked checkbox) reads.
 * The painting itself is `USER_BUBBLE_PAINT_CSS`, appended to the stylesheet
 * on `.sand-mvmkjj`, the one atomic class that applies the bubble colour: it
 * occurs once in the pinned chunk, in the message's `user` style. It uses
 * `light-dark()` in the stops, the way the renderer's own palette does, so
 * dark mode runs one shade deeper. The text on the bubble is
 * `text/on-color`, white in every theme, and stays.
 */
export const USER_BUBBLE_LIGHT = "#255a93";
export const USER_BUBBLE_DARK = "#1f5087";
const BUBBLE_TOKEN_BEFORE = 'Ct("fill/bubble-user",El(va("gray","dark",1),va("gray","dark",8),va("gray","dark",1),va("gray","dark",11)))';
const BUBBLE_TOKEN_AFTER = `Ct("fill/bubble-user",El({value:"${USER_BUBBLE_LIGHT}",alias:"simeon/sky-wash"},{value:"${USER_BUBBLE_DARK}",alias:"simeon/sky-wash-dark"}))`;
export const BUBBLE_REPLACEMENTS = Object.freeze([["user-bubble-blue", BUBBLE_TOKEN_BEFORE, BUBBLE_TOKEN_AFTER]]);
const BUBBLE_CSS_BEFORE = "--sand-fill-bubble-user:#070707;";
const BUBBLE_CSS_AFTER = `--sand-fill-bubble-user:${USER_BUBBLE_LIGHT};`;
export const BUBBLE_CSS_REPLACEMENT = Object.freeze(["user-bubble-blue-stylesheet", BUBBLE_CSS_BEFORE, BUBBLE_CSS_AFTER]);

export function patchOriginalBubble(source) {
  let out = source;
  for (const [label, before, after] of BUBBLE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

const GRAIN_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>";
const BRUSH_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='120'><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='.012 .35' numOctaves='2'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .22 -.04'/></filter><rect width='100%' height='100%' filter='url(%23b)'/></svg>";
export const USER_BUBBLE_PAINT_MARKER = "/* Simeon: the person's bubble is painted, Sky wash";
export const USER_BUBBLE_PAINT_CSS = `${USER_BUBBLE_PAINT_MARKER} (27 September 2026): grain and brush over the blue, no accent strokes. */
.sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#){background-image:url("${GRAIN_SVG}"),url("${BRUSH_SVG}"),linear-gradient(165deg,light-dark(${USER_BUBBLE_LIGHT},${USER_BUBBLE_DARK}),light-dark(#2e679f,#285c93));background-size:160px 160px,300px 100%,100% 100%;background-blend-mode:soft-light,overlay,normal}
`;

/**
 * An agent's title tag ("Chief of staff") reads in the bubble's blue instead
 * of grey, in the sidebar and wherever the renderer draws
 * `.sand-agent-title-tag`, and since the same evening it is only that text:
 * no pill, no edge, no inset ("should not be in a box. just blue text").
 * Dark mode takes a lighter blue.
 */
export const TITLE_TAG_BLUE_MARKER = "/* Simeon: an agent's title tag is blue";
export const TITLE_TAG_BLUE_CSS = `${TITLE_TAG_BLUE_MARKER} (27 September 2026). */
.sand-agent-title-tag:not(#\\#):not(#\\#):not(#\\#),.sand-agent-title-tag *:not(#\\#):not(#\\#):not(#\\#){color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8)}
.sand-agent-title-tag:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background:none;border-color:transparent;box-shadow:none;padding-inline:0}
`;

export function patchOriginalBubbleStylesheet(css) {
  const [label, before, after] = BUBBLE_CSS_REPLACEMENT;
  if (css.includes(USER_BUBBLE_PAINT_MARKER)) throw new Error("Original renderer bubble paint block is already present.");
  return `${replaceExactlyOnce(css, before, after, label)}\n${USER_BUBBLE_PAINT_CSS}${TITLE_TAG_BLUE_CSS}`;
}

/**
 * The chat header is the agent's card (23 September 2026: "the name of the
 * agent are up top, left. i want to middle it … like muse. you might wanna
 * remove the line up there … it feels more apple ish"). CSS only, appended
 * to the pinned stylesheet: the toolbar's divider line is hidden, the
 * toolbar itself is translucent with a backdrop blur so messages scroll under
 * it the way Muse's do ("muse let it go all the way up. and lighten/darken/blur
 * the top while we scroll"); its bottom edge is a 30 px mask fade, not a line,
 * so the glass dissolves into the page ("there is still a visible line"), the identity row (avatar + name) is a centred column, the avatar is drawn at
 * 52 px (88 was "way too big" on the Mac) (the mark's inline 20 px is overridden on the span AND on the SVG
 * inside it, which carries its own inline width/height from the animator's
 * size prop; the first build missed the SVG and drew a 20 px mark at the
 * top of an 88 px box, "genuinely terrible"), so it is the same animated
 * mark, larger, the name is a pill, and the controls (computer, info)
 * stay at the right edge. Scoped with :has() to the identity variant of
 * the header, so the thread breadcrumb and the agent-exchange variants keep
 * their layout. The transcript already offsets by the toolbar's measured
 * height (`--sand-toolbar-height`), so a taller header pushes it down.
 */
export const HEADER_CARD_CSS = `
/* Simeon: the chat header is the agent's card, centred, without the divider (23 September 2026). */
.sand-toolbar-divider{display:none!important}
.sand-toolbar:has(.sand-chat-header__identity-row){padding-top:4px!important;padding-bottom:28px!important;border-bottom-width:0!important;background-color:color-mix(in srgb,var(--cursor-bg-editor) 78%,transparent)!important;-webkit-backdrop-filter:blur(22px) saturate(1.5)!important;backdrop-filter:blur(22px) saturate(1.5)!important;-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 30px),transparent 100%)!important;mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 30px),transparent 100%)!important}
.sand-chat-header:has(>.sand-chat-header__identity-row){justify-content:center!important;position:relative!important}
.sand-chat-header__identity-row{flex-direction:column!important;align-items:center!important;gap:6px!important}
.sand-chat-header__identity{flex-direction:column!important;align-items:center!important;gap:4px!important;padding:0 8px 2px!important;border-radius:16px!important}
.sand-chat-header__avatar .sand-agent-avatar,.sand-chat-header__avatar .sand-grok-bot-mark{width:52px!important;height:52px!important}
.sand-chat-header__avatar .sand-grok-bot-mark>svg{width:52px!important;height:52px!important}
.sand-chat-header__avatar img.sand-agent-avatar{border-radius:50%!important;object-fit:cover!important}
.sand-chat-header__title{align-items:center!important}
.sand-chat-header__name{font-size:13px!important;line-height:18px!important;padding:3px 12px!important;border-radius:999px!important;background-color:var(--sand-fill-bubble-agent)!important;font-weight:500!important}
.sand-chat-header__controls{position:absolute!important;right:0!important;top:50%!important;transform:translateY(-50%)!important}
`;
export const HEADER_CARD_MARKER = "/* Simeon: the chat header is the agent's card";

export function patchOriginalHeaderStylesheet(css) {
  if (css.includes(HEADER_CARD_MARKER)) throw new Error("Original renderer header card block is already present.");
  return `${css}\n${HEADER_CARD_CSS}`;
}

/**
 * Liquid Glass over the app's chrome (23 September 2026: "i want to bring
 * apple liquidglass design in the whole app"). The Figma the founder linked
 * could not be opened from the build container, so this follows Apple's own
 * description of the material: a translucent, blurred and saturated surface,
 * a thin specular highlight along the top edge, a soft ambient shadow, and
 * large continuous radii on floating controls. Content (messages, text)
 * stays as it is; the material goes on the chrome: the sidebar, the info
 * pane, the composer shell, popover menus, dialogs, floating pills, the
 * computer's top bar; not the message hover actions or reaction pills ("too
 * noisy"), and no window transparency (tried, "terrible", reverted). CSS only, appended to
 * the pinned stylesheet after the header card; every rule is !important so
 * it wins over the atom classes and inline styles the renderer sets.
 */
export const LIQUID_GLASS_CSS = `
/* Simeon: Liquid Glass on the chrome (23 September 2026), the agents sidebar only since 27 September 2026. */
html:has(.sand-agents-sidebar),html:has(.sand-agents-sidebar) body,[data-theme]:has(>.sand-agents-sidebar){background-color:transparent!important}
.sand-agents-sidebar{background-color:color-mix(in srgb,var(--cursor-bg-chrome) 93%,transparent)!important;-webkit-backdrop-filter:blur(30px) saturate(1.8)!important;backdrop-filter:blur(30px) saturate(1.8)!important;border-right:.5px solid color-mix(in srgb,var(--cursor-text-primary) 10%,transparent)!important}
.sand-agents-sidebar~.sand-chat,.sand-agents-sidebar~.sand-info-pane{background-color:var(--sand-bg-base)!important}
`;
export const LIQUID_GLASS_MARKER = "/* Simeon: Liquid Glass on the chrome";

export function patchOriginalGlassStylesheet(css) {
  if (css.includes(LIQUID_GLASS_MARKER)) throw new Error("Original renderer Liquid Glass block is already present.");
  return `${css}\n${LIQUID_GLASS_CSS}`;
}

/**
 * The two appended blocks name classes the pinned markup is supposed to
 * carry; a selector that misses no-ops silently (F-206, 25 September 2026).
 * So every class name in them is counted in the shipped stylesheet and in
 * every renderer chunk before the patch, and the counts go into the record
 * under `marks.styles`, with the names that appear nowhere listed as
 * `missing`. A miss does not stop the build (the material is cosmetic); it
 * is the line to read when a surface on the Mac looks unpatched.
 */
export function styleAnchorClasses(css) {
  const names = new Set();
  for (const match of css.matchAll(/\.((?:sand|simeon)-[A-Za-z0-9_-]+)/g)) names.add(match[1]);
  return [...names].sort();
}

export function countStyleAnchors(classes, sources) {
  const counts = {};
  for (const name of classes) {
    let count = 0;
    for (const source of sources) count += source.split(name).length - 1;
    counts[name] = count;
  }
  return { counts, missing: Object.entries(counts).filter(([, count]) => count === 0).map(([name]) => name) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) throw new Error(`Original renderer ${label} anchor is missing or ambiguous.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchOriginalSettingsRegistry(source) {
  return replaceExactlyOnce(source, REGISTRY_BEFORE, REGISTRY_AFTER, "settings registry");
}

export function patchOriginalSettingsPanel(source) {
  return source;
}

export async function applyOriginalRendererRouterPatch({ stageRoot }) {
  const assetsRoot = path.join(stageRoot, "dist", "renderer", "assets");
  const registryCandidates = [];
  const panelCandidates = [];
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const target = path.join(assetsRoot, name);
    const source = await readFile(target, "utf8");
    if (source.includes(REGISTRY_BEFORE)) registryCandidates.push({ name, target, source });
    if (source.includes(COMPONENT_ANCHOR) && source.includes(GENERAL_BEFORE) && source.includes(USAGE_BEFORE)) panelCandidates.push({ name, target, source });
  }
  if (registryCandidates.length !== 1 || panelCandidates.length !== 1) {
    throw new Error(`Expected one original Settings registry and panel chunk, found ${registryCandidates.length}/${panelCandidates.length}.`);
  }
  const changes = [];
  for (const [role, candidate, transform] of [
    ["registry", registryCandidates[0], patchOriginalSettingsRegistry],
    ["panel", panelCandidates[0], patchOriginalSettingsPanel],
  ]) {
    const patched = transform(candidate.source);
    // A transform that returns its input (the Settings panel since the Router
    // left the product) is not a change and is not recorded as one (F-199).
    if (patched === candidate.source) continue;
    await writeFile(candidate.target, patched);
    changes.push({
      role,
      path: `dist/renderer/assets/${candidate.name}`,
      original: { bytes: Buffer.byteLength(candidate.source), sha256: sha256(candidate.source) },
      patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) },
    });
  }
  // The marks: the landing and hero clouds and the loading logo live in one chunk.
  const markCandidates = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js")).map((name) => path.join(assetsRoot, name));
  const markChunks = [];
  for (const target of markCandidates) {
    const source = await readFile(target, "utf8");
    if (MARK_REPLACEMENTS.every(([, before]) => source.includes(before))) markChunks.push({ target, source });
  }
  if (markChunks.length !== 1) throw new Error(`Expected one original chunk carrying the landing mark, the onboarding hero and the loading logo, found ${markChunks.length}.`);
  if (!PALETTE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer palette anchors are not all in the mark chunk.");
  if (!BUBBLE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer user-bubble token is not in the mark chunk.");
  if (!SHAPE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer shape anchors are not all in the mark chunk.");
  if (!COPY_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer onboarding copy anchors are not all in the mark chunk.");
  if (!LOGO_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer file-kind and Plugins-button anchors are not all in the mark chunk.");
  const logoAssets = await readLogoAssets();
  const markPatched = patchOriginalLogos(patchOriginalCopy(patchOriginalShapes(patchOriginalBubble(patchOriginalPalette(patchOriginalMarks(markChunks[0].source))))), appMentionNames(logoAssets.mentions));
  // The stylesheet's light default of the same variable, for first paint.
  const stylesheets = (await readdir(assetsRoot)).filter((name) => name.endsWith(".css")).map((name) => path.join(assetsRoot, name));
  const bubbleSheets = [];
  for (const target of stylesheets) {
    const css = await readFile(target, "utf8");
    if (css.includes(BUBBLE_CSS_REPLACEMENT[1])) bubbleSheets.push({ target, css });
  }
  if (bubbleSheets.length !== 1) throw new Error(`Expected one stylesheet carrying the user bubble default, found ${bubbleSheets.length}.`);
  const stylesheetPatched = patchOriginalLogosStylesheet(patchOriginalShapePickerStylesheet(patchOriginalGlassStylesheet(patchOriginalHeaderStylesheet(patchOriginalBubbleStylesheet(bubbleSheets[0].css)))), logoAssets);
  const chunkSources = [];
  for (const target of markCandidates) chunkSources.push(await readFile(target, "utf8"));
  const styleAnchors = {
    header: countStyleAnchors(styleAnchorClasses(HEADER_CARD_CSS), [bubbleSheets[0].css, ...chunkSources]),
    glass: countStyleAnchors(styleAnchorClasses(LIQUID_GLASS_CSS), [bubbleSheets[0].css, ...chunkSources]),
  };
  for (const [block, result] of Object.entries(styleAnchors)) {
    if (result.missing.length > 0) console.warn(`renderer patch: ${result.missing.length} ${block} style anchor(s) appear nowhere in the pinned renderer: ${result.missing.join(", ")}`);
  }
  await writeFile(bubbleSheets[0].target, stylesheetPatched);
  await writeFile(markChunks[0].target, markPatched);
  const appIconTarget = path.join(assetsRoot, APP_ICON_ASSET);
  const appIconBefore = await readFile(appIconTarget).catch(() => null);
  await copyFile(APP_ICON_SOURCE, appIconTarget);
  const appIconAfter = await readFile(appIconTarget);
  const marks = {
    chunk: path.relative(stageRoot, markChunks[0].target),
    replacements: [...[...MARK_REPLACEMENTS, ...PALETTE_REPLACEMENTS, ...BUBBLE_REPLACEMENTS, ...SHAPE_REPLACEMENTS, ...COPY_REPLACEMENTS, ...LOGO_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT].map(([label]) => label), "chat-header-card", "liquid-glass-chrome", "shape-pickers-hidden", "title-tag-blue", "file-and-app-logos"],
    userBubble: { light: USER_BUBBLE_LIGHT, dark: USER_BUBBLE_DARK, stylesheet: path.relative(stageRoot, bubbleSheets[0].target) },
    // The stylesheet's hashes, so `npm run verify` can check the packaged
    // file against what this patch wrote (25 September 2026: verify read
    // only the pinned inventory and failed on the first patched file).
    stylesheet: { path: path.relative(stageRoot, bubbleSheets[0].target), original: { bytes: Buffer.byteLength(bubbleSheets[0].css), sha256: sha256(bubbleSheets[0].css) }, patched: { bytes: Buffer.byteLength(stylesheetPatched), sha256: sha256(stylesheetPatched) } },
    original: { bytes: Buffer.byteLength(markChunks[0].source), sha256: sha256(markChunks[0].source) },
    patched: { bytes: Buffer.byteLength(markPatched), sha256: sha256(markPatched) },
    appIcon: { path: `dist/renderer/assets/${APP_ICON_ASSET}`, original: appIconBefore == null ? null : { bytes: appIconBefore.length, sha256: sha256(appIconBefore) }, patched: { bytes: appIconAfter.length, sha256: sha256(appIconAfter) } },
    styles: styleAnchors,
  };
  // The name, over every chunk and the page, after the Settings patch landed.
  const brandFiles = [];
  const brandTotals = Object.fromEntries([...BRAND_REPLACEMENTS.map(([before]) => before), ...BRAND_WORD_REPLACEMENTS.map(([, , label]) => label)].map((key) => [key, 0]));
  const brandTargets = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js") || name.endsWith(".css")).map((name) => path.join(assetsRoot, name));
  brandTargets.push(path.join(stageRoot, "dist", "renderer", "index.html"));
  const brandSources = [];
  for (const target of brandTargets) {
    let source;
    try { source = await readFile(target, "utf8"); } catch { continue; }
    const { source: patched, counts } = patchOriginalBrandStrings(source);
    brandSources.push(patched);
    if (patched === source) continue;
    await writeFile(target, patched);
    for (const [before, count] of Object.entries(counts)) brandTotals[before] += count;
    brandFiles.push({ path: path.relative(stageRoot, target), counts, original: { bytes: Buffer.byteLength(source), sha256: sha256(source) }, patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) } });
  }
  if (brandTotals["Grok Bot"] === 0) throw new Error("Expected the original renderer to name Grok Bot at least once; the brand pass found none.");
  const brandResidue = countBrandResidue(brandSources);
  console.log(`renderer patch: brand residue after the pass ${JSON.stringify(brandResidue)}`);
  // Every renderer file this pass rewrote: its bytes before the first pass and
  // after the last. scripts/verify.mjs checks these files against `patched`.
  const firstOriginals = new Map();
  for (const [relative, original] of [
    ...changes.map((change) => [change.path, change.original]),
    [marks.chunk, marks.original],
    [marks.userBubble.stylesheet, { bytes: Buffer.byteLength(bubbleSheets[0].css), sha256: sha256(bubbleSheets[0].css) }],
    [marks.appIcon.path, marks.appIcon.original],
    ...brandFiles.map((file) => [file.path, file.original]),
  ]) if (!firstOriginals.has(relative)) firstOriginals.set(relative, original);
  const files = [];
  for (const [relative, original] of firstOriginals) {
    const bytes = await readFile(path.join(stageRoot, relative));
    files.push({ path: relative, original, patched: { bytes: bytes.length, sha256: sha256(bytes) } });
  }
  const record = {
    schemaVersion: 2,
    mode: "original-renderer-settings-extension",
    chunks: changes,
    marks,
    files,
    brand: { replacements: [...BRAND_REPLACEMENTS.map(([before, after]) => ({ before, after })), ...BRAND_WORD_REPLACEMENTS.map(([pattern, after, label]) => ({ before: label, pattern: String(pattern), after }))], totals: brandTotals, files: brandFiles, residue: brandResidue },
    // The router-provider and usage-panel features were listed here while
    // `patchOriginalSettingsPanel` returned its input (F-199): a no-op is
    // not a feature, and a chunk it did not change is not a chunk above.
    features: ["settings-local-docker-vm", "brand-simeon", "landing-mark-cloud", "hero-mark-cloud", "loading-logo-petals", "app-icon-simeon", "agent-palettes-twelve", "user-bubble-blue", "user-bubble-sky-wash", "chat-header-card", "liquid-glass-chrome", "marks-ocean", "shapes-cloud-only", "onboarding-copy", "title-tag-blue", "file-logos", "connect-apps-button", "app-mentions", "cards-blue", "cards-white", "notion-light", "agent-bubble-messages-grey", "cards-grey", "exchange-header-centred", "choice-radio", "sidebar-glass-only", "selected-row-white", "header-name-glass", "send-blue", "slack-logo", "file-title-centred"],
    transformations: ["settings-registry", "marks", "app-icon", "brand-strings"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-router-extension.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}

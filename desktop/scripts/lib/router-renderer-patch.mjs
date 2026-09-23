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
function RBoxRuntime(){const[s,e]=de.useState({mode:"local-docker",status:null,error:null,busy:!0});de.useEffect(()=>{let t=!0;window.desktop.agent.getBoxRuntime().then(n=>{t&&e({...n,error:null,busy:!1})}).catch(n=>{t&&e(r=>({...r,error:String(n?.message??n),busy:!1}))});return()=>{t=!1}},[]);const t=s.mode==="local-docker",n=async()=>{const r=t?"remote":"local-docker";e(i=>({...i,mode:r,busy:!0,error:null}));try{const i=await window.desktop.agent.setBoxRuntime(r);e({...i,error:null,busy:!1})}catch(i){e(o=>({...o,mode:t?"local-docker":"remote",error:String(i?.message??i),busy:!1}))}};return a.jsxs("div",{children:[a.jsx(ie,{description:t?(s.status?.detail??"Shell, files and computer use run in a Docker container on this Mac."):"Shell, files and computer use run on Simeon's remote computer.",label:"Use local Docker VM",variant:"card",children:a.jsx("button",{"aria-checked":t,"aria-label":"Use local Docker VM",disabled:s.busy,onClick:n,role:"switch",style:{appearance:"none",background:t?"var(--color-accent-primary, #4f8cff)":"rgba(255,255,255,.14)",border:0,borderRadius:999,cursor:s.busy?"wait":"pointer",height:22,opacity:s.busy?0.65:1,padding:2,position:"relative",transition:"background .15s ease",width:38},type:"button",children:a.jsx("span",{style:{background:"white",borderRadius:"50%",boxShadow:"0 1px 3px rgba(0,0,0,.35)",display:"block",height:18,transform:"translateX("+(t?16:0)+"px)",transition:"transform .15s ease",width:18}})})}),s.error?a.jsx(se,{as:"p",color:"red",size:"sm",children:s.error}):null]})}
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
 * Plus one file: the hand-off screen ("Waking your computer…") and About
 * draw `assets/app-icon-C7NKj2u7.png`, and the pinned renderer carries Grok
 * Bot's icon under that name. Nothing replaced it before 23 September; the
 * founder's icon from frontend/runtime-assets is written over it now.
 */
const LANDING_MARK_BEFORE = 'p.jsx(sd,{"aria-hidden":!0,color:"black",paused:N,sizePx:ujn,state:E})';
const LANDING_MARK_AFTER = 'p.jsx(sd,{"aria-hidden":!0,color:"black",paused:N,shape:"cloud",sizePx:ujn,state:E})';
const HERO_MARK_BEFORE = '{id:"hero",color:"black",shape:"blob",isGazing:!1,bob:null}';
const HERO_MARK_AFTER = '{id:"hero",color:"black",shape:"cloud",isGazing:!1,bob:null}';
const LOADING_LOGO_BEFORE = 'function tOt({size:n,color:e="black",className:t}){const s=window.matchMedia("(prefers-reduced-motion: reduce)").matches;return p.jsx("svg",{"aria-hidden":"true",className:t,height:n,viewBox:V_t,width:n,xmlns:"http://www.w3.org/2000/svg",children:p.jsx("path",{d:Q_t,fillRule:"evenodd",style:{fill:MNe(e)},children:s?null:p.jsx("animate",{attributeName:"d",calcMode:"discrete",dur:`${X_t}s`,repeatCount:"indefinite",values:eOt})})})}';
/** The petals fill the 80..320 window of the 400 box, so at 56 px the mark is as large as the logo it replaces. */
export const LOADING_LOGO_VIEWBOX = "80 80 240 240";
export const LOADING_LOGO_TURN_SECONDS = 14;
const LOADING_LOGO_PETALS = SIMEON_PETALS.map((petal, index) => `p.jsx("ellipse",{cx:${petal.cx},cy:${petal.cy},rx:${petal.rx},ry:${petal.ry},transform:"rotate(${petal.angle} ${petal.cx} ${petal.cy})",style:r},${index})`).join(",");
const LOADING_LOGO_AFTER = `function tOt({size:n,color:e="black",className:t}){const s=window.matchMedia("(prefers-reduced-motion: reduce)").matches,r={fill:MNe(e)};return p.jsx("svg",{"aria-hidden":"true",className:t,height:n,viewBox:"${LOADING_LOGO_VIEWBOX}",width:n,xmlns:"http://www.w3.org/2000/svg",children:p.jsxs("g",{children:[${LOADING_LOGO_PETALS},s?null:p.jsx("animateTransform",{attributeName:"transform",type:"rotate",from:"0 200 200",to:"360 200 200",dur:"${LOADING_LOGO_TURN_SECONDS}s",repeatCount:"indefinite"},"turn")]})})}`;
export const MARK_REPLACEMENTS = Object.freeze([
  ["landing-mark-cloud", LANDING_MARK_BEFORE, LANDING_MARK_AFTER],
  ["hero-mark-cloud", HERO_MARK_BEFORE, HERO_MARK_AFTER],
  ["loading-logo-petals", LOADING_LOGO_BEFORE, LOADING_LOGO_AFTER],
]);
export const APP_ICON_ASSET = "app-icon-C7NKj2u7.png";
export const APP_ICON_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/runtime-assets", APP_ICON_ASSET);

export function patchOriginalMarks(source) {
  let out = source;
  for (const [label, before, after] of MARK_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
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
  const markPatched = patchOriginalMarks(markChunks[0].source);
  await writeFile(markChunks[0].target, markPatched);
  const appIconTarget = path.join(assetsRoot, APP_ICON_ASSET);
  const appIconBefore = await readFile(appIconTarget).catch(() => null);
  await copyFile(APP_ICON_SOURCE, appIconTarget);
  const appIconAfter = await readFile(appIconTarget);
  const marks = {
    chunk: path.relative(stageRoot, markChunks[0].target),
    replacements: MARK_REPLACEMENTS.map(([label]) => label),
    original: { bytes: Buffer.byteLength(markChunks[0].source), sha256: sha256(markChunks[0].source) },
    patched: { bytes: Buffer.byteLength(markPatched), sha256: sha256(markPatched) },
    appIcon: { path: `dist/renderer/assets/${APP_ICON_ASSET}`, original: appIconBefore == null ? null : { bytes: appIconBefore.length, sha256: sha256(appIconBefore) }, patched: { bytes: appIconAfter.length, sha256: sha256(appIconAfter) } },
  };
  // The name, over every chunk and the page, after the Settings patch landed.
  const brandFiles = [];
  const brandTotals = Object.fromEntries([...BRAND_REPLACEMENTS.map(([before]) => before), ...BRAND_WORD_REPLACEMENTS.map(([, , label]) => label)].map((key) => [key, 0]));
  const brandTargets = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js") || name.endsWith(".css")).map((name) => path.join(assetsRoot, name));
  brandTargets.push(path.join(stageRoot, "dist", "renderer", "index.html"));
  for (const target of brandTargets) {
    let source;
    try { source = await readFile(target, "utf8"); } catch { continue; }
    const { source: patched, counts } = patchOriginalBrandStrings(source);
    if (patched === source) continue;
    await writeFile(target, patched);
    for (const [before, count] of Object.entries(counts)) brandTotals[before] += count;
    brandFiles.push({ path: path.relative(stageRoot, target), counts, original: { bytes: Buffer.byteLength(source), sha256: sha256(source) }, patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) } });
  }
  if (brandTotals["Grok Bot"] === 0) throw new Error("Expected the original renderer to name Grok Bot at least once; the brand pass found none.");
  const record = {
    schemaVersion: 2,
    mode: "original-renderer-settings-extension",
    chunks: changes,
    marks,
    brand: { replacements: [...BRAND_REPLACEMENTS.map(([before, after]) => ({ before, after })), ...BRAND_WORD_REPLACEMENTS.map(([pattern, after, label]) => ({ before: label, pattern: String(pattern), after }))], totals: brandTotals, files: brandFiles },
    features: ["settings-router-provider", "settings-local-docker-vm", "usage-current-provider", "brand-simeon", "landing-mark-cloud", "hero-mark-cloud", "loading-logo-petals", "app-icon-simeon"],
    transformations: ["settings-registry", "router-panel", "usage-panel", "marks", "app-icon", "brand-strings"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-router-extension.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}

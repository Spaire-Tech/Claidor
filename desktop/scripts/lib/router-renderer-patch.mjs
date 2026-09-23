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
]);

export function patchOriginalPalette(source) {
  let out = source;
  for (const [label, before, after] of PALETTE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * The person's own chat bubble is iMessage blue (23 September 2026: "the
 * default chat color is black. grey in dark mode. i want to copy imessage
 * style and make it blue", with Apple's numbers). The renderer's theme
 * variables are generated at runtime from a token list in the chunk
 * (`Ct("fill/bubble-user", El(light, dark, hcLight, hcDark))`, emitted by
 * `bzn` as `--sand-fill-bubble-user`); the stylesheet carries only the
 * light default for first paint. Both are patched. The text on the bubble
 * is `text/on-color`, white in every theme, and stays.
 */
export const USER_BUBBLE_LIGHT = "#007aff";
export const USER_BUBBLE_DARK = "#0a84ff";
const BUBBLE_TOKEN_BEFORE = 'Ct("fill/bubble-user",El(va("gray","dark",1),va("gray","dark",8),va("gray","dark",1),va("gray","dark",11)))';
const BUBBLE_TOKEN_AFTER = `Ct("fill/bubble-user",El({value:"${USER_BUBBLE_LIGHT}",alias:"imessage/blue"},{value:"${USER_BUBBLE_DARK}",alias:"imessage/blue-dark"}))`;
export const BUBBLE_REPLACEMENTS = Object.freeze([["user-bubble-blue", BUBBLE_TOKEN_BEFORE, BUBBLE_TOKEN_AFTER]]);
const BUBBLE_CSS_BEFORE = "--sand-fill-bubble-user:#070707;";
const BUBBLE_CSS_AFTER = `--sand-fill-bubble-user:${USER_BUBBLE_LIGHT};`;
export const BUBBLE_CSS_REPLACEMENT = Object.freeze(["user-bubble-blue-stylesheet", BUBBLE_CSS_BEFORE, BUBBLE_CSS_AFTER]);

export function patchOriginalBubble(source) {
  let out = source;
  for (const [label, before, after] of BUBBLE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export function patchOriginalBubbleStylesheet(css) {
  const [label, before, after] = BUBBLE_CSS_REPLACEMENT;
  return replaceExactlyOnce(css, before, after, label);
}

/**
 * The chat header is the agent's card (23 September 2026: "the name of the
 * agent are up top, left. i want to middle it … like muse. you might wanna
 * remove the line up there … it feels more apple ish"). CSS only, appended
 * to the pinned stylesheet: the toolbar's divider line is hidden, the
 * identity row (avatar + name) is a centred column, the avatar is drawn at
 * 88 px (the mark's inline 20 px is overridden on the span AND on the SVG
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
.sand-toolbar:has(.sand-chat-header__identity-row){padding-top:6px!important;padding-bottom:8px!important;border-bottom-width:0!important}
.sand-chat-header:has(>.sand-chat-header__identity-row){justify-content:center!important;position:relative!important}
.sand-chat-header__identity-row{flex-direction:column!important;align-items:center!important;gap:6px!important}
.sand-chat-header__identity{flex-direction:column!important;align-items:center!important;gap:6px!important;padding:2px 8px 4px!important;border-radius:16px!important}
.sand-chat-header__avatar .sand-agent-avatar,.sand-chat-header__avatar .sand-grok-bot-mark{width:88px!important;height:88px!important}
.sand-chat-header__avatar .sand-grok-bot-mark>svg{width:88px!important;height:88px!important}
.sand-chat-header__avatar img.sand-agent-avatar{border-radius:50%!important;object-fit:cover!important}
.sand-chat-header__title{align-items:center!important}
.sand-chat-header__name{font-size:15px!important;line-height:20px!important;padding:5px 14px!important;border-radius:999px!important;background-color:var(--sand-fill-bubble-agent)!important;font-weight:500!important}
.sand-chat-header__controls{position:absolute!important;right:0!important;top:50%!important;transform:translateY(-50%)!important}
`;
export const HEADER_CARD_MARKER = "/* Simeon: the chat header is the agent's card";

export function patchOriginalHeaderStylesheet(css) {
  if (css.includes(HEADER_CARD_MARKER)) throw new Error("Original renderer header card block is already present.");
  return `${css}\n${HEADER_CARD_CSS}`;
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
  if (!PALETTE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer palette anchors are not all in the mark chunk.");
  if (!BUBBLE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer user-bubble token is not in the mark chunk.");
  const markPatched = patchOriginalBubble(patchOriginalPalette(patchOriginalMarks(markChunks[0].source)));
  // The stylesheet's light default of the same variable, for first paint.
  const stylesheets = (await readdir(assetsRoot)).filter((name) => name.endsWith(".css")).map((name) => path.join(assetsRoot, name));
  const bubbleSheets = [];
  for (const target of stylesheets) {
    const css = await readFile(target, "utf8");
    if (css.includes(BUBBLE_CSS_REPLACEMENT[1])) bubbleSheets.push({ target, css });
  }
  if (bubbleSheets.length !== 1) throw new Error(`Expected one stylesheet carrying the user bubble default, found ${bubbleSheets.length}.`);
  await writeFile(bubbleSheets[0].target, patchOriginalHeaderStylesheet(patchOriginalBubbleStylesheet(bubbleSheets[0].css)));
  await writeFile(markChunks[0].target, markPatched);
  const appIconTarget = path.join(assetsRoot, APP_ICON_ASSET);
  const appIconBefore = await readFile(appIconTarget).catch(() => null);
  await copyFile(APP_ICON_SOURCE, appIconTarget);
  const appIconAfter = await readFile(appIconTarget);
  const marks = {
    chunk: path.relative(stageRoot, markChunks[0].target),
    replacements: [...[...MARK_REPLACEMENTS, ...PALETTE_REPLACEMENTS, ...BUBBLE_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT].map(([label]) => label), "chat-header-card"],
    userBubble: { light: USER_BUBBLE_LIGHT, dark: USER_BUBBLE_DARK, stylesheet: path.relative(stageRoot, bubbleSheets[0].target) },
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
    features: ["settings-router-provider", "settings-local-docker-vm", "usage-current-provider", "brand-simeon", "landing-mark-cloud", "hero-mark-cloud", "loading-logo-petals", "app-icon-simeon", "agent-palettes-twelve", "user-bubble-blue", "chat-header-card"],
    transformations: ["settings-registry", "router-panel", "usage-panel", "marks", "app-icon", "brand-strings"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-router-extension.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}

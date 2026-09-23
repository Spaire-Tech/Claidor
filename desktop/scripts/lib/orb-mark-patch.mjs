/**
 * The agents' marks become the founder's liquid orbs (23 September 2026:
 * "i prefer sphere/orbs. yes, no eyes but its okay. there is animation
 * inside the sphere. i still want it to appear in onboarding and follow the
 * animations and everything else in chat").
 *
 * This is a package-time patch over the checksum-pinned 0.18.0 renderer,
 * applied to the staged copy after the Settings and brand patches. It never
 * touches the bytes in the cache. Every anchor below is a string that occurs
 * exactly once in the pinned chunk (docs/product/avatar-animation-audit.md
 * names each by its role); a renderer where one is missing or ambiguous
 * fails the build instead of shipping half a change.
 *
 * What it changes, and why each piece is enough to keep every animation:
 *   1. The body path of the mark's SVG (`$_t`) is no longer filled. Next to
 *      it, inside the same face group `A` that the springs translate, rotate
 *      and scale every frame, a <foreignObject> clipped by the mark's own
 *      clipPath holds a <cloud-orb>. The clipPath's path is the one the
 *      morph code rewrites each frame, so the orb takes every shape the
 *      animator draws. Rings, particles, glyphs and dots still paint over it.
 *   2. The eyes are hidden ("no eyes but its okay").
 *   3. Mirrors are off: `wct` returns null, so every mark is its own animator
 *      instead of a <use> of the hidden engine's. A <use> clones its target
 *      into a closed shadow tree where the custom element never upgrades.
 *   4. The picker offers the founder's six shapes (disc, pill, squircle,
 *      square, blob, hex; the first three new, drawn by the renderer's own
 *      generators) and six colours whose swatches show the palette. Agents
 *      that already carry one of the other shapes or colours keep drawing.
 *   5. Each agent's orb gets its own seed (--orb-seed on the mark, hashed
 *      from the agent id with the renderer's FNV hash) so two blue discs do
 *      not move in step.
 *   6. index.html loads assets/cloud-orb.js before the renderer module; the
 *      page's CSP is script-src 'self', so the element cannot be inline.
 */
import { createHash } from "node:crypto";
import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ORB_ELEMENT_SOURCE = path.join(here, "orb-mark-element.js");
export const ORB_ELEMENT_ASSET = "cloud-orb.js";

export const ORB_SHAPE_IDS = Object.freeze(["disc", "pill", "squircle", "square", "blob", "hex"]);
export const ORB_COLOR_IDS = Object.freeze(["blue", "green", "orange", "violet", "cyan", "gray"]);
// The swatch each colour shows in the picker: the palette's second stop, the saturated mid.
export const ORB_SWATCHES = Object.freeze({ blue: "#6f9fe0", green: "#8cc26f", orange: "#f39a68", violet: "#ad8fe3", cyan: "#6fc9c0", gray: "#8ea1ba" });

const MIRROR_BEFORE = 'function wct(n){const e=he.c(2),t=S.useContext(tIe);if(t==null||n==null||!t.stagedAgentIds.has(n))return null;let s;return e[0]!==n?(s=kct(n),e[0]=n,e[1]=s):s=e[1],s}';
const MIRROR_AFTER = "function wct(n){return null}";

const EYES_BEFORE = 'WBe={fill:"var(--bg)"}';
const EYES_AFTER = 'WBe={fill:"var(--bg)",display:"none"},OrbBodyStyle={fill:"none"},OrbFrameStyle={overflow:"visible"},OrbElementStyle={width:"100%",height:"100%"}';

const BODY_BEFORE = 'p.jsxs("g",{ref:A,children:[p.jsx("path",{ref:G,style:b?{fill:`url(#${N}-ink)`}:Rke,d:le.path}),';
const BODY_AFTER = 'p.jsxs("g",{ref:A,children:[p.jsxs("g",{clipPath:`url(#${N})`,children:[p.jsx("path",{ref:G,style:OrbBodyStyle,d:le.path}),p.jsx("foreignObject",{x:J1.minX,y:J1.minY,width:J1.width,height:J1.height,style:OrbFrameStyle,children:p.jsx("cloud-orb",{shape:"none",style:OrbElementStyle})})]}),';

const SHAPES_BEFORE = 'leaf:Po("Leaf",i_t(88,113,1.5))}';
const SHAPES_AFTER = 'leaf:Po("Leaf",i_t(88,113,1.5)),disc:Po("Disc",zBe(113,113,2)),pill:Po("Pill",ZJt(113,62)),square:Po("Square",zBe(107,107,6))}';

const PICKER_SHAPES_BEFORE = 'Ij=["blob","pebble","squircle","tablet","wedge","hex","cloud","teardrop"]';
const PICKER_SHAPES_AFTER = `Ij=${JSON.stringify(ORB_SHAPE_IDS)}`;

const PICKER_COLORS_BEFORE = 'const nnt=PQ.filter(n=>n.id!=="black")';
const PICKER_COLORS_AFTER = `const OrbColorIds=new Set(${JSON.stringify(ORB_COLOR_IDS)}),nnt=PQ.filter(n=>OrbColorIds.has(n.id))`;

const SWATCHES = Object.freeze([
  ['{id:"blue",label:"Blue",value:"#1084FE"}', `{id:"blue",label:"Blue",value:"${ORB_SWATCHES.blue}"}`],
  ['{id:"green",label:"Green",value:"#00C972"}', `{id:"green",label:"Green",value:"${ORB_SWATCHES.green}"}`],
  ['{id:"orange",label:"Orange",value:"#FF6700"}', `{id:"orange",label:"Orange",value:"${ORB_SWATCHES.orange}"}`],
  ['{id:"violet",label:"Violet",value:"#9159FE"}', `{id:"violet",label:"Violet",value:"${ORB_SWATCHES.violet}"}`],
  ['{id:"cyan",label:"Cyan",value:"#00BCA6"}', `{id:"cyan",label:"Cyan",value:"${ORB_SWATCHES.cyan}"}`],
  ['{id:"gray",label:"Gray",value:"#777777"}', `{id:"gray",label:"Gray",value:"${ORB_SWATCHES.gray}"}`],
]);

const SEED_FN_BEFORE = "function Iee(n){const e=he.c(31),";
const SEED_FN_AFTER = "function orbSeedOf(n){return n==null?0:mOt(String(n))%991}function Iee(n){const e=he.c(31),";

const DISPATCHER_BEFORE = 'L=p.jsx(sd,{className:"sand-agent-avatar",color:_,paused:B,shape:R,sizePx:O,state:v,style:m,children:q})';
const DISPATCHER_AFTER = 'L=p.jsx(sd,{className:"sand-agent-avatar",color:_,paused:B,shape:R,sizePx:O,state:v,style:{...m,"--orb-seed":orbSeedOf(t)},children:q})';

const CHAT_BEFORE = "Ae=p.jsx(sd,{color:V.color,emphasis:ce,eyeColor:sSe,ref:fe,shape:V.shape,sizePx:DGe,state:ae})";
const CHAT_AFTER = 'Ae=p.jsx(sd,{color:V.color,emphasis:ce,eyeColor:sSe,ref:fe,shape:V.shape,sizePx:DGe,state:ae,style:{"--orb-seed":orbSeedOf(L)}})';

const PAGE_BEFORE = '<script type="module"';
const PAGE_AFTER = `<script src="./assets/${ORB_ELEMENT_ASSET}"></script>\n    <script type="module"`;

/** Every chunk anchor with its replacement and a name for the provenance record. */
export const ORB_CHUNK_REPLACEMENTS = Object.freeze([
  ["mirrors-off", MIRROR_BEFORE, MIRROR_AFTER],
  ["eyes-hidden", EYES_BEFORE, EYES_AFTER],
  ["body-orb", BODY_BEFORE, BODY_AFTER],
  ["shapes-added", SHAPES_BEFORE, SHAPES_AFTER],
  ["picker-shapes", PICKER_SHAPES_BEFORE, PICKER_SHAPES_AFTER],
  ["picker-colors", PICKER_COLORS_BEFORE, PICKER_COLORS_AFTER],
  ...SWATCHES.map(([before, after], index) => [`swatch-${ORB_COLOR_IDS[index]}`, before, after]),
  ["seed-helper", SEED_FN_BEFORE, SEED_FN_AFTER],
  ["seed-dispatcher", DISPATCHER_BEFORE, DISPATCHER_AFTER],
  ["seed-chat", CHAT_BEFORE, CHAT_AFTER],
]);

export const ORB_PAGE_REPLACEMENT = Object.freeze(["page-script", PAGE_BEFORE, PAGE_AFTER]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) throw new Error(`Orb mark ${label} anchor is missing or ambiguous in the pinned renderer.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

/** The chunk transform on its own, for tests and for reading. */
export function patchOrbMarkChunk(source) {
  let out = source;
  for (const [label, before, after] of ORB_CHUNK_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export function patchOrbMarkPage(html) {
  const [label, before, after] = ORB_PAGE_REPLACEMENT;
  if (html.includes(`assets/${ORB_ELEMENT_ASSET}`)) return html;
  return replaceExactlyOnce(html, before, after, label);
}

export async function applyOrbMarkPatch({ stageRoot }) {
  const rendererRoot = path.join(stageRoot, "dist", "renderer");
  const assetsRoot = path.join(rendererRoot, "assets");
  const candidates = [];
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const target = path.join(assetsRoot, name);
    const source = await readFile(target, "utf8");
    if (source.includes(MIRROR_BEFORE) && source.includes(BODY_BEFORE)) candidates.push({ name, target, source });
  }
  if (candidates.length !== 1) throw new Error(`Expected one renderer chunk carrying the agent mark animator, found ${candidates.length}.`);
  const [chunk] = candidates;
  const patched = patchOrbMarkChunk(chunk.source);
  await writeFile(chunk.target, patched);

  const pagePath = path.join(rendererRoot, "index.html");
  const page = await readFile(pagePath, "utf8");
  const patchedPage = patchOrbMarkPage(page);
  await writeFile(pagePath, patchedPage);

  const elementTarget = path.join(assetsRoot, ORB_ELEMENT_ASSET);
  await copyFile(ORB_ELEMENT_SOURCE, elementTarget);
  const element = await readFile(elementTarget);

  const record = {
    schemaVersion: 1,
    mode: "original-renderer-orb-marks",
    chunk: {
      path: `dist/renderer/assets/${chunk.name}`,
      original: { bytes: Buffer.byteLength(chunk.source), sha256: sha256(chunk.source) },
      patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) },
      replacements: ORB_CHUNK_REPLACEMENTS.map(([label]) => label),
    },
    page: {
      path: "dist/renderer/index.html",
      original: { bytes: Buffer.byteLength(page), sha256: sha256(page) },
      patched: { bytes: Buffer.byteLength(patchedPage), sha256: sha256(patchedPage) },
    },
    element: { path: `dist/renderer/assets/${ORB_ELEMENT_ASSET}`, bytes: element.length, sha256: sha256(element) },
    shapes: ORB_SHAPE_IDS,
    colors: ORB_COLOR_IDS,
    features: ["orb-marks", "orb-marks-no-eyes", "orb-marks-own-animators", "orb-marks-six-shapes", "orb-marks-six-colours"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-orb-marks.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}

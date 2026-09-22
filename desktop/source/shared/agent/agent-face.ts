/**
 * An agent's face: DiceBear's slice style (CC0 1.0, hand-authored vector),
 * generated on this machine, so the face needs no picture file and no
 * network. Chosen by the founder on 22 September 2026 after the clay faces.
 *
 * What the face is keyed on matters more than the style. Grok Bot persists
 * an avatar as a shape and a colour, writes both onto every mark
 * (`data-avatar-shape`, `data-avatar-color`) and onto every cell of its
 * "change avatar" picker. So the slice's shape follows Grok's shape, its
 * colour follows Grok's colour, and only the cut pattern follows the agent's
 * id. The picker then shows the real alternatives, a chosen avatar sticks
 * through Grok's own save, and a new agent looks like its own shape and
 * colour, never like another agent. (The first attempt keyed the face on
 * the agent id alone, fell back to the colour when the mark carried no id,
 * and painted one face for every agent of a colour.)
 *
 * The generated markup is reshaped for the overlay's motion loop: every id
 * is prefixed per instance (two marks of one agent share a document), the
 * placed cuts become the face group, and the canvas clip and background
 * tile are removed. The slice has no eyes, so the loop moves the body only.
 */
import { Avatar, Style } from "@dicebear/core";
import slice from "@dicebear/styles/slice.json" with { type: "json" };

export const CAISRA_FACE_ATTR = "data-caisra-face";
/** The slice canvas is 100 units; the shape fills most of it. */
export const FACE_CANVAS = "0 0 100 100";
/** What the mark shows: the shape with a little air, centred. */
export const FACE_VIEWBOX = "6 6 88 88";
/** Where the body turns. */
export const FACE_CENTER = { x: 50, y: 50 } as const;

/** Grok's eight shapes, each to the slice shape that reads closest. */
export const GROK_SHAPE_TO_SLICE: Readonly<Record<string, string>> = {
  blob: "lump",
  pebble: "egg",
  squircle: "squircle",
  tablet: "pill",
  wedge: "diamond",
  hex: "hexagon",
  cloud: "arch",
  teardrop: "lens",
};
export const SLICE_SHAPES = ["disc", "square", "squircle", "hexagon", "diamond", "pill", "egg", "arch", "lens", "lump"] as const;

/** Grok's eleven avatar colours (avatar-editor/model.ts, the shipped palette). */
export const GROK_AVATAR_COLORS: Readonly<Record<string, string>> = {
  black: "#000000",
  brown: "#936439",
  red: "#FF263C",
  orange: "#FF6700",
  yellow: "#FF9800",
  green: "#00C972",
  cyan: "#00BCA6",
  blue: "#1084FE",
  violet: "#9159FE",
  magenta: "#FF309B",
  gray: "#777777",
};

let style: Style | null = null;
function sliceStyle(): Style {
  style ??= new Style(slice);
  return style;
}

export interface FaceIdentity {
  /** Stable per agent: drives the cut pattern. Falls back to shape and colour. */
  readonly agentId?: string | null;
  /** Grok's shape id, or a slice shape id. */
  readonly shape?: string | null;
  /** Grok's colour id, or a hex colour. */
  readonly color?: string | null;
}

export interface AgentFace {
  /** The reshaped `<svg>` markup. */
  readonly svg: string;
  /** The id prefix this instance carries. */
  readonly prefix: string;
  /** The key that says whether a painted face is still the right one. */
  readonly key: string;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

let instance = 0;
function nextPrefix(key: string): string {
  instance = (instance + 1) % 1_000_000;
  return `af${hashString(key).toString(36)}-${instance.toString(36)}`;
}

export function resolveFaceShape(shape: string | null | undefined): string {
  const trimmed = shape?.trim() ?? "";
  if (Object.hasOwn(GROK_SHAPE_TO_SLICE, trimmed)) return GROK_SHAPE_TO_SLICE[trimmed]!;
  if ((SLICE_SHAPES as readonly string[]).includes(trimmed)) return trimmed;
  return "lump";
}

/** A colour the style can take: `RRGGBB`, or nothing so the style picks by seed. */
export function resolveFaceColor(color: string | null | undefined): string | null {
  const trimmed = color?.trim() ?? "";
  if (Object.hasOwn(GROK_AVATAR_COLORS, trimmed)) return GROK_AVATAR_COLORS[trimmed]!.slice(1);
  const hex = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  return hex == null ? null : hex[1]!.toUpperCase();
}

export function faceKey(identity: FaceIdentity): string {
  const agent = identity.agentId?.trim() ?? "";
  const shape = resolveFaceShape(identity.shape);
  const color = resolveFaceColor(identity.color) ?? "seed";
  return `${agent.length > 0 ? agent : "persona"}|${shape}|${color}`;
}

/** The raw DiceBear output: deterministic, no background tile, shape and colour forced. */
export function rawFaceSvg(identity: FaceIdentity): string {
  const agent = identity.agentId?.trim() ?? "";
  const shape = resolveFaceShape(identity.shape);
  const color = resolveFaceColor(identity.color);
  const seed = agent.length > 0 ? agent : `${shape}-${color ?? "seed"}`;
  return new Avatar(sliceStyle(), {
    seed,
    shapeVariant: shape,
    ...(color == null ? {} : { bodyColor: [color] }),
    backgroundColor: [],
    idRandomization: false,
  }).toString();
}

/** Every id in the markup, and every reference to one, carries `prefix-`. */
export function prefixIds(svg: string, prefix: string): string {
  return svg
    .replace(/(?<![\w-])id="([^"]+)"/g, (_match, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}-${id})`)
    .replace(/\bhref="#([^"]+)"/g, (_match, id: string) => `href="#${prefix}-${id}"`);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function agentFace(identity: FaceIdentity, options: { readonly prefix?: string } = {}): AgentFace {
  const key = faceKey(identity);
  const prefix = options.prefix ?? nextPrefix(key);
  let svg = rawFaceSvg(identity)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "");
  svg = prefixIds(svg, prefix);
  // The canvas clip would cut a turning shape at the square's edge; the
  // mark's box is not a tile, so the face may overflow it.
  svg = svg.replace(/ clip-path="url\(#[^)]*-clip-[0-9a-f]+\)"/, "");
  // The placed cuts are the body: wrap them as the face group the loop drives.
  svg = svg.replace(
    /(<use [^>]*href="#[^"]*-cuts-[^"]+"\/>)/,
    (match) => `<g class="caisra-face__face">${match}</g>`,
  );
  svg = svg
    .replace(
      /^<svg /,
      `<svg ${CAISRA_FACE_ATTR}="1" data-face-key="${escapeAttribute(key)}" preserveAspectRatio="xMidYMid meet" `,
    )
    .replace(`viewBox="${FACE_CANVAS}"`, `viewBox="${FACE_VIEWBOX}"`);
  return { svg, prefix, key };
}

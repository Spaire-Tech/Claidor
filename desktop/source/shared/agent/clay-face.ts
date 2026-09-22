/**
 * An agent's face: DiceBear's clay style (CC0 1.0, hand-authored vector),
 * generated on this machine from the agent's id, so the face is stable, needs
 * no picture file and no network, and two agents never look alike. Chosen by
 * the founder on 22 September 2026 over the cloud bodies, the glass pebble
 * and the Siri orb.
 *
 * The generated markup is reshaped for the overlay's motion loop: every id is
 * prefixed per instance (two marks of one agent share a document), the body
 * container is the face group, the eye placement is wrapped as the eye group
 * with its eye line recorded, and each pupil group is tagged. The style's own
 * idle animation is switched off; Grok Bot's table moves the face instead
 * (`face-motion.ts`).
 */
import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json" with { type: "json" };

export const CAISRA_FACE_ATTR = "data-caisra-face";
/** The clay canvas is 100 units; the face sits low with its top in the upper half. */
export const CLAY_FACE_CANVAS = "0 0 100 100";
/** What the mark shows: the body, its top, and a little air, bottom-aligned. */
export const CLAY_FACE_VIEWBOX = "16 18 68 78";
/** The eye whites sit ten units below the eye group's origin in every eye variant. */
export const CLAY_EYE_LINE_OFFSET = 10;
/** Where the body turns: the middle of a typical body. */
export const CLAY_FACE_CENTER = { x: 50, y: 62 } as const;

let style: Style | null = null;
function clayStyle(): Style {
  style ??= new Style(clay);
  return style;
}

export interface ClayFace {
  /** The reshaped `<svg>` markup. */
  readonly svg: string;
  /** The y of the eye whites' centre, in canvas units, for the openness scale. */
  readonly eyeY: number;
  /** The id prefix this instance carries. */
  readonly prefix: string;
}

export function clayFaceSeed(agentId: string): string {
  const trimmed = agentId.trim();
  return trimmed.length > 0 ? trimmed : "persona";
}

let instance = 0;
function nextPrefix(seed: string): string {
  instance = (instance + 1) % 1_000_000;
  return `cf${hashString(seed).toString(36)}-${instance.toString(36)}`;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** The raw DiceBear output for a seed: deterministic, no background tile, idle animation off. */
export function rawClayFaceSvg(seed: string): string {
  return new Avatar(clayStyle(), {
    seed,
    animationVariant: "none",
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

export function clayFace(agentId: string, options: { readonly prefix?: string } = {}): ClayFace {
  const seed = clayFaceSeed(agentId);
  const prefix = options.prefix ?? nextPrefix(seed);
  let svg = rawClayFaceSvg(seed)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "");
  svg = prefixIds(svg, prefix);
  // The canvas clip would cut a bouncing or turning face at the square's
  // edge; the mark's box is not a tile, so the face may overflow it.
  svg = svg.replace(/ clip-path="url\(#[^)]*-clip-[0-9a-f]+\)"/, "");
  // The eye placement inside the body: wrap it as the eye group, remember the eye line.
  let eyeY = 50;
  svg = svg.replace(
    /<use transform="translate\(([\d.]+) ([\d.]+)\)" href="(#[^"]*-eyes-[^"]+)"\/>/,
    (match, _x: string, y: string) => {
      eyeY = Math.round((Number(y) + CLAY_EYE_LINE_OFFSET) * 10) / 10;
      return `<g class="caisra-face__eyes" data-eye-y="${eyeY}">${match}</g>`;
    },
  );
  svg = svg
    .replace(/class="dbcl-c"/, 'class="dbcl-c caisra-face__face"')
    .replace(/class="dbcl-ep"/g, 'class="dbcl-ep caisra-face__pupil"')
    .replace(
      /^<svg /,
      `<svg ${CAISRA_FACE_ATTR}="1" data-agent-id="${escapeAttribute(agentId)}" data-eye-y="${eyeY}" preserveAspectRatio="xMidYMax meet" `,
    )
    .replace(`viewBox="${CLAY_FACE_CANVAS}"`, `viewBox="${CLAY_FACE_VIEWBOX}"`);
  return { svg, eyeY, prefix };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * What the shipped 0.18.0 renderer actually draws for an agent, read back
 * off the drawing. The reconstruction (`frontend/src/recovered/features/
 * onboarding/signed-in/character.tsx`, byte-evidenced) shows the face is an
 * `<svg data-source-id>` whose `<path d>` is one of eight shape paths and
 * whose `<linearGradient …-ink>` has two stops in one of eleven colours.
 * The `data-avatar-shape` / `data-avatar-color` attributes exist only on
 * the sidebar's wrapper span, and the shape one is absent when nothing was
 * persisted; the avatar editor's cells and the bot picker draw the bare
 * svg. So the drawing is the only thing every mark has, and this module
 * turns it back into Grok's shape id, colour id and default choices.
 *
 * The hash functions are the shipped ones (Eee/Cee, `character.tsx:26-58`),
 * so a mark with no colour and no shape gets exactly what Grok gives it.
 */
import shapePaths from "./grok-shape-paths.json" with { type: "json" };

export const GROK_SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"] as const;
export type GrokShape = (typeof GROK_SHAPES)[number];

/** The gradient stops the shipped face paints each colour with. */
export const GROK_COLORS: Readonly<Record<string, { readonly light: string; readonly dark: string }>> = {
  black: { light: "#000000", dark: "#FFFFFF" },
  brown: { light: "#A27952", dark: "#855C36" },
  red: { light: "#FF3E51", dark: "#E02135" },
  orange: { light: "#FF781C", dark: "#FF6700" },
  yellow: { light: "#FFAF38", dark: "#FF9800" },
  green: { light: "#00C972", dark: "#009957" },
  cyan: { light: "#1CC3B0", dark: "#00A592" },
  blue: { light: "#2A92FE", dark: "#0E74E0" },
  violet: { light: "#A97EFE", dark: "#804EE0" },
  magenta: { light: "#FF5EB1", dark: "#E02A88" },
  gray: { light: "#959595", dark: "#777777" },
};
const DEFAULT_COLOR_CYCLE = ["brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"] as const;

function shippedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = value + 1831565813 | 0;
    let next = Math.imul(value ^ value >>> 15, 1 | value);
    next = next + Math.imul(next ^ next >>> 7, 61 | next) ^ next;
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}
function shippedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}
function shippedColorIndex(value: string): number {
  const seed = (shippedHash(value) ^ Math.imul(1, 2654435769)) >>> 0;
  return Math.floor(shippedRandom((seed ^ 2654435769) >>> 0)() * 10);
}
function shippedShapeHash(value: string): number {
  let hash = shippedHash(value);
  hash = Math.imul(hash ^ hash >>> 16, 73244475);
  hash = Math.imul(hash ^ hash >>> 13, 3266489909);
  return (hash ^ hash >>> 16) >>> 0;
}

/** Grok's colour for an agent: the persisted one, else the shipped hash default. */
export function resolvePersonaColor(agentId: string, color?: string | null): string {
  if (color != null && Object.hasOwn(GROK_COLORS, color)) return color;
  return DEFAULT_COLOR_CYCLE[shippedColorIndex(agentId)] ?? "gray";
}
/** Grok's shape for an agent: the persisted one, else the shipped hash default. */
export function resolvePersonaShape(agentId: string, shape?: string | null): GrokShape {
  if (shape != null && (GROK_SHAPES as readonly string[]).includes(shape)) return shape as GrokShape;
  return GROK_SHAPES[shippedShapeHash(agentId) % GROK_SHAPES.length] ?? "blob";
}

const normalizePath = (d: string): string => d.replace(/\s+/g, " ").trim();
/** The first 48 characters of a path are enough to tell the eight apart, and survive rounding drift further along. */
const PATH_KEY_LENGTH = 48;
const pathKeys = new Map<string, GrokShape>();
for (const shape of GROK_SHAPES) {
  const d = (shapePaths as Record<string, string>)[shape];
  if (typeof d === "string") pathKeys.set(normalizePath(d).slice(0, PATH_KEY_LENGTH), shape);
}

/** The shape a shipped face draws, from its path data; `null` when it is not one of the eight. */
export function shapeFromPath(d: string | null | undefined): GrokShape | null {
  if (d == null) return null;
  return pathKeys.get(normalizePath(d).slice(0, PATH_KEY_LENGTH)) ?? null;
}

const stopIndex = new Map<string, string>();
for (const [id, stops] of Object.entries(GROK_COLORS)) {
  stopIndex.set(stops.light.toUpperCase(), id);
  stopIndex.set(stops.dark.toUpperCase(), id);
}

/** The colour a shipped face paints, from either gradient stop; `null` when neither is Grok's. */
export function colorFromStops(...stops: ReadonlyArray<string | null | undefined>): string | null {
  for (const stop of stops) {
    if (stop == null) continue;
    const hex = /^#?([0-9a-fA-F]{6})$/.exec(stop.trim());
    if (hex == null) continue;
    const id = stopIndex.get(`#${hex[1]!.toUpperCase()}`);
    if (id != null) return id;
  }
  return null;
}

/** `sand-agent-mark-source-<id>`, `<id>` or `<id>-<shape>` (an avatar editor cell) → the id and, for a cell, its shape. */
export function parseSourceId(raw: string | null | undefined): { agentId: string | null; shape: GrokShape | null } {
  if (raw == null) return { agentId: null, shape: null };
  let id = raw.trim().replace(/^sand-agent-mark-source-/, "");
  let shape: GrokShape | null = null;
  const suffix = /-(blob|pebble|squircle|tablet|wedge|hex|cloud|teardrop)$/.exec(id);
  if (suffix != null) { shape = suffix[1] as GrokShape; id = id.slice(0, -suffix[0].length); }
  return { agentId: id.length > 0 ? id : null, shape };
}

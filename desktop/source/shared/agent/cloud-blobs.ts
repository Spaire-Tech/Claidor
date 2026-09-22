export const CLOUD_BLOB_SHAPE = "cloud";

export const CLOUD_BLOB_COLORS = [
  { id: "mist", label: "Mist", top: "#cbd6f2", bottom: "#ccb2d6" },
  { id: "meadow", label: "Meadow", top: "#d6eec4", bottom: "#d1d99f" },
  { id: "lilac", label: "Lilac", top: "#e9d3f2", bottom: "#debed4" },
  { id: "peach", label: "Peach", top: "#fdd3be", bottom: "#e9a9a6" },
  { id: "periwinkle", label: "Periwinkle", top: "#bad5f2", bottom: "#a0ace0" },
  { id: "slate", label: "Slate", top: "#d1dbe8", bottom: "#a5b4c9" },
  { id: "apricot", label: "Apricot", top: "#fddcca", bottom: "#e9bba9" },
  { id: "sage", label: "Sage", top: "#c4e1ba", bottom: "#92bf90" },
  { id: "mauve", label: "Mauve", top: "#d3b6d1", bottom: "#a984a5" },
  { id: "sky", label: "Sky", top: "#b2ccf7", bottom: "#87bbe0" },
  { id: "tangerine", label: "Tangerine", top: "#f7c99a", bottom: "#d99769" },
  { id: "sea", label: "Sea", top: "#b2ded7", bottom: "#7dbab8" },
  { id: "violet", label: "Violet", top: "#e7c1ee", bottom: "#c09bda" },
  { id: "cream", label: "Cream", top: "#fae7bc", bottom: "#e7c59a" },
  { id: "steel", label: "Steel", top: "#c7dbea", bottom: "#98b2c8" },
  { id: "fog", label: "Fog", top: "#b5cbc5", bottom: "#859ca0" },
  { id: "iris", label: "Iris", top: "#d6cff4", bottom: "#acbbe3" },
  { id: "chartreuse", label: "Chartreuse", top: "#e0ecb0", bottom: "#d3d185" },
  { id: "blush", label: "Blush", top: "#f5b3bd", bottom: "#e1978e" },
] as const;

export type CloudBlobColorId = (typeof CLOUD_BLOB_COLORS)[number]["id"];

export const GROK_MARK_COLOR_TO_CLOUD = {
  black: "fog",
  brown: "cream",
  red: "blush",
  orange: "tangerine",
  yellow: "apricot",
  green: "sage",
  cyan: "sea",
  blue: "sky",
  violet: "violet",
  magenta: "mauve",
  gray: "slate",
} as const;

const GROK_MARK_HEX_TO_CLOUD = new Map<string, CloudBlobColorId>([
  ["#000000", "fog"],
  ["#ffffff", "fog"],
  ["#a27952", "cream"],
  ["#855c36", "cream"],
  ["#ff3e51", "blush"],
  ["#e02135", "blush"],
  ["#ff263c", "blush"],
  ["#ff781c", "tangerine"],
  ["#ff6700", "tangerine"],
  ["#ffaf38", "apricot"],
  ["#ff9800", "apricot"],
  ["#00c972", "sage"],
  ["#009957", "sage"],
  ["#1cc3b0", "sea"],
  ["#00a592", "sea"],
  ["#00bca6", "sea"],
  ["#2a92fe", "sky"],
  ["#0e74e0", "sky"],
  ["#1084fe", "sky"],
  ["#a97efe", "violet"],
  ["#804ee0", "violet"],
  ["#9159fe", "violet"],
  ["#ff5eb1", "mauve"],
  ["#e02a88", "mauve"],
  ["#ff309b", "mauve"],
  ["#959595", "slate"],
  ["#777777", "slate"],
]);

const GROK_MARK_RGB = [...GROK_MARK_HEX_TO_CLOUD.keys()].map((hex) => ({ hex, rgb: hexToRgb(hex)! }));
// Euclidean RGB distance. The 11 Grok inks are far apart (the closest pair,
// #ff3e51 and #ff263c, is under 30), so anything within this radius is a
// theme shade of one of them and not a colour of its own.
const NEAREST_GROK_INK_RADIUS = 96;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  if (match == null) return null;
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16)];
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

/** Every colour a mark can carry, as six-digit hex: `#rrggbb`, `#rgb`, and the `rgb()` / `rgba()` strings `getComputedStyle` returns. */
export function grokMarkHexes(value: string): string[] {
  const hexes: string[] = [];
  for (const hex of value.match(/#[0-9a-f]{6}\b/g) ?? []) hexes.push(hex);
  for (const short of value.match(/#[0-9a-f]{3}\b/g) ?? []) {
    if (short.length === 4) hexes.push(`#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`);
  }
  const rgbPattern = /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/g;
  for (const match of value.matchAll(rgbPattern)) {
    hexes.push(rgbToHex([Number(match[1]), Number(match[2]), Number(match[3])]));
  }
  return hexes;
}

function nearestGrokInk(hex: string): CloudBlobColorId | null {
  const rgb = hexToRgb(hex);
  if (rgb == null) return null;
  let best: { hex: string; distance: number } | null = null;
  for (const ink of GROK_MARK_RGB) {
    const distance = Math.hypot(rgb[0] - ink.rgb[0], rgb[1] - ink.rgb[1], rgb[2] - ink.rgb[2]);
    if (best == null || distance < best.distance) best = { hex: ink.hex, distance };
  }
  if (best == null || best.distance > NEAREST_GROK_INK_RADIUS) return null;
  return GROK_MARK_HEX_TO_CLOUD.get(best.hex) ?? null;
}

export function cloudBlobColorFromGrokMark(value: string | null | undefined): CloudBlobColorId | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (trimmed in GROK_MARK_COLOR_TO_CLOUD) {
    return GROK_MARK_COLOR_TO_CLOUD[trimmed as keyof typeof GROK_MARK_COLOR_TO_CLOUD];
  }
  if (isCloudBlobColor(trimmed)) return trimmed;
  const hexes = grokMarkHexes(trimmed);
  for (const hex of hexes) {
    const mapped = GROK_MARK_HEX_TO_CLOUD.get(hex);
    if (mapped != null) return mapped;
  }
  for (const hex of hexes) {
    const nearest = nearestGrokInk(hex);
    if (nearest != null) return nearest;
  }
  return null;
}

const COLOR_BY_ID = new Map<string, (typeof CLOUD_BLOB_COLORS)[number]>(
  CLOUD_BLOB_COLORS.map((color) => [color.id, color]),
);

export function isCloudBlobColor(value: string | null | undefined): value is CloudBlobColorId {
  return typeof value === "string" && COLOR_BY_ID.has(value);
}

export function cloudBlobSwatch(id: string | null | undefined): string {
  return COLOR_BY_ID.get(id ?? "")?.top ?? CLOUD_BLOB_COLORS[0].top;
}

export function pickRandomCloudBlobColor(random: () => number = Math.random): CloudBlobColorId {
  const index = Math.min(
    CLOUD_BLOB_COLORS.length - 1,
    Math.max(0, Math.floor(random() * CLOUD_BLOB_COLORS.length)),
  );
  return CLOUD_BLOB_COLORS[index]!.id;
}

function shippedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function resolveCloudBlobColor(agentId: string, color?: string | null): CloudBlobColorId {
  if (isCloudBlobColor(color)) return color;
  return cloudBlobColorFromGrokMark(color)
    ?? CLOUD_BLOB_COLORS[shippedHash(agentId) % CLOUD_BLOB_COLORS.length]!.id;
}

export function assignedCloudBlobFields(requestedColor?: string | null): {
  avatarShape: typeof CLOUD_BLOB_SHAPE;
  avatarColor: CloudBlobColorId;
} {
  return {
    avatarShape: CLOUD_BLOB_SHAPE,
    avatarColor: isCloudBlobColor(requestedColor) ? requestedColor : pickRandomCloudBlobColor(),
  };
}

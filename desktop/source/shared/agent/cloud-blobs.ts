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
  return CLOUD_BLOB_COLORS[shippedHash(agentId) % CLOUD_BLOB_COLORS.length]!.id;
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

import {
  CLOUD_BLOB_COLORS,
  CLOUD_BLOB_SHAPE,
  resolveCloudBlobColor,
  type CloudBlobColorId,
} from "./cloud-blobs.js";

export const CLOUD_BLOB_VIEWBOX = "-15 -10 259 275";
export const CLOUD_BLOB_CENTER = 114.2705;
export const CAISRA_CLOUD_BLOB_ATTR = "data-caisra-cloud-blob";

const TAU = Math.PI * 2;
const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, minimum: number, maximum: number) => (
  value < minimum ? minimum : value > maximum ? maximum : value
);

type Point = [number, number];

function smoothPath(points: readonly Point[]): string {
  const path = [`M${round2(points[0]![0])} ${round2(points[0]![1])}`];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const afterNext = points[(index + 2) % points.length]!;
    path.push(`C${round2(current[0] + (next[0] - previous[0]) / 6)} ${round2(current[1] + (next[1] - previous[1]) / 6)} ${round2(next[0] - (afterNext[0] - current[0]) / 6)} ${round2(next[1] - (afterNext[1] - current[1]) / 6)} ${round2(next[0])} ${round2(next[1])}`);
  }
  return `${path.join("")}Z`;
}

const CLOUD_FACE_LOBES: Array<[number, number, number]> = [
  [CLOUD_BLOB_CENTER, CLOUD_BLOB_CENTER + 4, 64],
  ...Array.from({ length: 7 }, (_, index): [number, number, number] => {
    const angle = -Math.PI / 2 + index / 7 * Math.PI * 2;
    return [CLOUD_BLOB_CENTER + Math.cos(angle) * 52, CLOUD_BLOB_CENTER + Math.sin(angle) * 47, 40];
  }),
];

function cloudOutline(count = 160): string {
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let radius = 0;
    for (const [x, y, circleRadius] of CLOUD_FACE_LOBES) {
      const dx = x - CLOUD_BLOB_CENTER;
      const dy = y - CLOUD_BLOB_CENTER;
      const projection = cos * dx + sin * dy;
      const discriminant = projection * projection - (dx * dx + dy * dy) + circleRadius * circleRadius;
      if (discriminant <= 0) continue;
      radius = Math.max(radius, projection + Math.sqrt(discriminant));
    }
    points.push([CLOUD_BLOB_CENTER + cos * radius, CLOUD_BLOB_CENTER + sin * radius]);
  }
  return smoothPath(points);
}

export const CLOUD_BLOB_PATH = cloudOutline();

export function cloudBlobPaint(agentId: string, color?: string | null): {
  readonly id: CloudBlobColorId;
  readonly top: string;
  readonly bottom: string;
} {
  const id = resolveCloudBlobColor(agentId, color);
  const swatch = CLOUD_BLOB_COLORS.find((entry) => entry.id === id) ?? CLOUD_BLOB_COLORS[0];
  return { id: swatch.id, top: swatch.top, bottom: swatch.bottom };
}

export function cloudBlobSvgMarkup(options: {
  readonly id: string;
  readonly agentId?: string;
  readonly color?: string | null;
  readonly sizePx?: number;
  readonly sleeping?: boolean;
}): string {
  const agentId = options.agentId ?? options.id;
  const paint = cloudBlobPaint(agentId, options.color);
  const ink = `${options.id}-ink`;
  const shade = `${options.id}-shade`;
  const cx = CLOUD_BLOB_CENTER;
  const size = options.sizePx;
  const sizeAttrs = size == null ? "" : ` width="${size}" height="${size}"`;
  const eyes = options.sleeping === true
    ? `<path d="M${cx - 36} ${cx - 4} Q${cx - 26} ${cx + 1} ${cx - 16} ${cx - 4}" fill="none" stroke="#2a3140" stroke-linecap="round" stroke-width="3"/><path d="M${cx + 16} ${cx - 4} Q${cx + 26} ${cx + 1} ${cx + 36} ${cx - 4}" fill="none" stroke="#2a3140" stroke-linecap="round" stroke-width="3"/>`
    : `<g class="caisra-cloud-blob__eye"><ellipse cx="${cx - 26}" cy="${cx - 4}" fill="#fff" rx="11" ry="13"/><circle cx="${cx - 26}" cy="${cx - 3}" fill="#1b1f27" r="5.4"/><circle cx="${cx - 23.6}" cy="${cx - 6.6}" fill="#fff" r="1.8"/></g><g class="caisra-cloud-blob__eye"><ellipse cx="${cx + 26}" cy="${cx - 4}" fill="#fff" rx="11" ry="13"/><circle cx="${cx + 26}" cy="${cx - 3}" fill="#1b1f27" r="5.4"/><circle cx="${cx + 28.4}" cy="${cx - 6.6}" fill="#fff" r="1.8"/></g>`;
  return `<svg aria-hidden="true" ${CAISRA_CLOUD_BLOB_ATTR}="1" data-avatar-color="${paint.id}" data-avatar-shape="${CLOUD_BLOB_SHAPE}" viewBox="${CLOUD_BLOB_VIEWBOX}" xmlns="http://www.w3.org/2000/svg"${sizeAttrs} style="display:block;height:100%;overflow:visible;width:100%">
    <defs>
      <linearGradient id="${ink}" x1="0.2" x2="0.35" y1="0" y2="1"><stop offset="0" stop-color="${paint.top}"/><stop offset="1" stop-color="${paint.bottom}"/></linearGradient>
      <radialGradient id="${shade}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#1b2430" stop-opacity=".28"/><stop offset="1" stop-color="#1b2430" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="${cx}" cy="${cx + 128}" fill="url(#${shade})" rx="58" ry="12"/>
    <g class="caisra-cloud-blob__face">
      <path d="${CLOUD_BLOB_PATH}" fill="url(#${ink})"/>
      <g class="caisra-cloud-blob__eyes">${eyes}</g>
    </g>
  </svg>`;
}

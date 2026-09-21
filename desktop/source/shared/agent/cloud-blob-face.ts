import { cloudBlobBodyDataUrl, CLOUD_BLOB_BODY_SIZE } from "./cloud-blob-bodies.js";
import {
  CLOUD_BLOB_COLORS,
  CLOUD_BLOB_SHAPE,
  resolveCloudBlobColor,
  type CloudBlobColorId,
} from "./cloud-blobs.js";

export const CLOUD_BLOB_VIEWBOX = `0 0 ${CLOUD_BLOB_BODY_SIZE} ${CLOUD_BLOB_BODY_SIZE}`;
export const LEGACY_CLOUD_BLOB_VIEWBOX = "-15 -10 259 275";
export const CAISRA_CLOUD_BLOB_ATTR = "data-caisra-cloud-blob";

export const CLOUD_BLOB_EYES = {
  left: { cx: 138, cy: 150.3 },
  right: { cx: 210, cy: 150.3 },
  scleraRx: 22,
  scleraRy: 24.5,
  pupilRx: 11.2,
  pupilRy: 12.6,
  highlightCx: -4.2,
  highlightCy: -5.2,
  highlightR: 3.2,
} as const;

export function cloudBlobPaint(agentId: string, color?: string | null): {
  readonly id: CloudBlobColorId;
  readonly top: string;
  readonly bottom: string;
} {
  const id = resolveCloudBlobColor(agentId, color);
  const swatch = CLOUD_BLOB_COLORS.find((entry) => entry.id === id) ?? CLOUD_BLOB_COLORS[0];
  return { id: swatch.id, top: swatch.top, bottom: swatch.bottom };
}

function sleepingEye(cx: number, cy: number): string {
  return `<path d="M${cx - 20} ${cy} Q${cx} ${cy + 9} ${cx + 20} ${cy}" fill="none" stroke="#2a3140" stroke-linecap="round" stroke-width="5"/>`;
}

function awakeEye(side: "left" | "right", cx: number, cy: number): string {
  const { scleraRx, scleraRy, pupilRx, pupilRy, highlightCx, highlightCy, highlightR } = CLOUD_BLOB_EYES;
  return `<g class="caisra-cloud-blob__eye" data-eye="${side}" style="transform-box:fill-box;transform-origin:${cx}px ${cy}px">
      <ellipse class="caisra-cloud-blob__sclera" cx="${cx}" cy="${cy}" fill="#fff" rx="${scleraRx}" ry="${scleraRy}"/>
      <g class="caisra-cloud-blob__pupil">
        <ellipse cx="${cx}" cy="${cy + 1}" fill="#1b1f27" rx="${pupilRx}" ry="${pupilRy}"/>
        <circle cx="${cx + highlightCx}" cy="${cy + highlightCy}" fill="#fff" opacity=".92" r="${highlightR}"/>
      </g>
    </g>`;
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
  const size = options.sizePx;
  const sizeAttrs = size == null ? "" : ` width="${size}" height="${size}"`;
  const { left, right } = CLOUD_BLOB_EYES;
  const eyes = options.sleeping === true
    ? `${sleepingEye(left.cx, left.cy)}${sleepingEye(right.cx, right.cy)}`
    : `${awakeEye("left", left.cx, left.cy)}${awakeEye("right", right.cx, right.cy)}`;
  return `<svg aria-hidden="true" ${CAISRA_CLOUD_BLOB_ATTR}="1" data-avatar-color="${paint.id}" data-avatar-shape="${CLOUD_BLOB_SHAPE}" viewBox="${CLOUD_BLOB_VIEWBOX}" xmlns="http://www.w3.org/2000/svg"${sizeAttrs} style="display:block;height:100%;overflow:visible;width:100%">
    <g class="caisra-cloud-blob__face">
      <image class="caisra-cloud-blob__body" height="${CLOUD_BLOB_BODY_SIZE}" href="${cloudBlobBodyDataUrl(paint.id)}" preserveAspectRatio="xMidYMid meet" width="${CLOUD_BLOB_BODY_SIZE}"/>
      <g class="caisra-cloud-blob__eyes">${eyes}</g>
    </g>
  </svg>`;
}

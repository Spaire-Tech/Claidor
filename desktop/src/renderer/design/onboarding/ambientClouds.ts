/**
 * The four colour clouds behind Yodo's first step, drawn once.
 *
 * The canvas of 16 September blurs each cloud with `filter: blur(90–100px)`
 * while it drifts and scales for half a minute. A CSS filter on a moving
 * element is applied again on every frame, over a surface the size of the
 * window, and the glass panel's `backdrop-filter: blur(40px)` blurred the
 * whole window a second time on top. Measured in the harness on this
 * machine's software GPU the greeting streamed at 8 frames a second; with
 * both blurs gone it streamed at 60 with no late frame, and the words
 * themselves cost nothing (`harness/onboarding-frames-variants.mjs`).
 *
 * So the blur is done once here: each cloud's radial gradient is drawn on
 * an offscreen canvas, blurred by the same standard deviation the canvas
 * asked for, and the panel's `saturate(1.15)` folded in, then handed to
 * the drifting element as a background image. The element carries the
 * same position, size, opacity and keyframes as before; only what it is
 * made of changed. The blur spills past the element's box as it did
 * before, so the image is drawn over a wider square (`pad` each side)
 * and sits on a child that overhangs the box by that much.
 */

export interface AmbientCloud {
  /** The cloud's colour, as `#rrggbb`. */
  readonly hex: string;
  /** The gradient's last stop, as a fraction of the farthest-corner radius. */
  readonly edge: number;
  /** The canvas's `blur(Npx)` standard deviation, in CSS px. */
  readonly blur: number;
  /** The element's width and height, in vw. */
  readonly vw: number;
  /** The element's opacity. */
  readonly opacity: number;
}

/** Pixels on each side of the canvas: three standard deviations holds the tail. */
export const CLOUD_PAD_SIGMAS = 3;
/** The offscreen canvas's side. A blurred blob has no detail to lose above this. */
export const CLOUD_IMAGE_PX = 512;
/** The glass panel's `saturate(1.15)`, now baked into the picture. */
export const CLOUD_SATURATE = 1.15;

export interface CloudGeometry {
  /** The element's box, in CSS px. */
  readonly box: number;
  /** How far the image overhangs the box on each side, in CSS px. */
  readonly pad: number;
  /** Canvas px per CSS px. */
  readonly scale: number;
  /** The gradient's farthest-corner radius, in canvas px. */
  readonly radius: number;
  /** The blur's standard deviation, in canvas px. */
  readonly sigma: number;
}

/** Where the gradient and blur land on the canvas, for a viewport this wide. */
export function cloudGeometry(cloud: AmbientCloud, viewportWidth: number, imagePx = CLOUD_IMAGE_PX): CloudGeometry {
  const box = (cloud.vw / 100) * viewportWidth;
  const pad = CLOUD_PAD_SIGMAS * cloud.blur;
  const scale = imagePx / (box + 2 * pad);
  return {
    box,
    pad,
    scale,
    // `radial-gradient(circle, …)` sizes to the farthest corner of a square box.
    radius: (box / Math.SQRT2) * scale,
    sigma: cloud.blur * scale,
  };
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

/** The unblurred cloud, for when no canvas can draw it (a test, or a browser without canvas filters). */
export function cloudGradient(cloud: AmbientCloud): string {
  const [r, g, b] = hexToRgb(cloud.hex);
  return `radial-gradient(circle, ${cloud.hex} 0%, rgba(${r},${g},${b},0) ${Math.round(cloud.edge * 100)}%)`;
}

/**
 * The cloud as a picture, blurred once, or undefined where a canvas
 * cannot draw it. Pure of React so it can run before the first paint.
 */
export function renderCloudImage(cloud: AmbientCloud, viewportWidth: number, imagePx = CLOUD_IMAGE_PX): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const geometry = cloudGeometry(cloud, viewportWidth, imagePx);
  const centre = imagePx / 2;

  const flat = document.createElement('canvas');
  flat.width = imagePx;
  flat.height = imagePx;
  const flatContext = flat.getContext('2d');
  if (!flatContext) return undefined;
  const [r, g, b] = hexToRgb(cloud.hex);
  const gradient = flatContext.createRadialGradient(centre, centre, 0, centre, centre, geometry.radius);
  gradient.addColorStop(0, cloud.hex);
  gradient.addColorStop(cloud.edge, `rgba(${r},${g},${b},0)`);
  flatContext.fillStyle = gradient;
  flatContext.fillRect(0, 0, imagePx, imagePx);

  const soft = document.createElement('canvas');
  soft.width = imagePx;
  soft.height = imagePx;
  const softContext = soft.getContext('2d');
  if (!softContext || !('filter' in softContext)) return undefined;
  softContext.filter = `blur(${geometry.sigma}px) saturate(${CLOUD_SATURATE})`;
  softContext.drawImage(flat, 0, 0);
  return soft.toDataURL('image/png');
}

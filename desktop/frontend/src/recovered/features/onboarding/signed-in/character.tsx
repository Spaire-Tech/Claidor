import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type CSSProperties } from "react";
import type { OnboardingCharacterVisualProps } from "./view";
import type { OnboardingCharacterState } from "./scene";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
// The shipped engine geometry is the inline 259px mark, not an image asset. The
// box, its centre, the eye line and the state table are kept; the drawing inside
// the box is the clay redesign of 23 September 2026
// (docs/product/faces-clay-measured.md): a round head with a hair shape on it,
// lit from the top left, matte, no outlines. Everything here is drawn from
// numbers; no image, no WebGL, and nothing outside this file paints the mark.
const VIEWBOX = "-15 -15 259 259";
const CENTER = 114.2705;

// Eleven hair colours, one pair each: the left value is the light theme, the
// right the dark theme. The keys are Grok Bot's and stay, so an agent whose
// persisted colour is "cyan" keeps being the cyan one.
const COLORS: Record<string, { light: string; dark: string }> = {
  black: { light: "#2E2C31", dark: "#46444D" },
  brown: { light: "#8B5A3C", dark: "#9E6D4D" },
  red: { light: "#D2493F", dark: "#E05E53" },
  orange: { light: "#E27A33", dark: "#EE8D48" },
  yellow: { light: "#E5B13B", dark: "#EFC252" },
  green: { light: "#3E9C61", dark: "#50B074" },
  cyan: { light: "#2FA49C", dark: "#41B9B0" },
  blue: { light: "#3C7ED4", dark: "#5092E5" },
  violet: { light: "#8868D2", dark: "#9B7DE3" },
  magenta: { light: "#D2558E", dark: "#E1689E" },
  gray: { light: "#8A8A91", dark: "#A3A3AB" },
};

// Five matte skin tones. There is no persisted tone field, and the editor's
// shape cells carry a composite source id, so the tone is a function of the
// hair colour rather than of the agent id: the same agent gets the same tone
// on every surface, and the picker's cells all share it.
export const SKIN_TONES = ["#F4DCC6", "#E9BD95", "#CD9466", "#9F6A47", "#63402B"] as const;
const TONE_BY_COLOR: Record<string, number> = { black: 2, brown: 3, red: 0, orange: 1, yellow: 0, green: 2, cyan: 4, blue: 1, violet: 3, magenta: 2, gray: 4 };
export function resolvePersonaTone(color: string): string {
  return SKIN_TONES[TONE_BY_COLOR[color] ?? 1] ?? SKIN_TONES[1];
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1412620
// Eee/Cee's deterministic fallback selectors, kept artifact-exact.
const SHIPPED_SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"] as const;
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
export function resolvePersonaColor(agentId: string, color?: string | null): string {
  if (color != null && COLORS[color] != null) return color;
  return ["brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"][shippedColorIndex(agentId)] ?? "gray";
}
export function resolvePersonaShape(agentId: string, shape?: string | null): string {
  if (shape != null && (SHIPPED_SHAPES as readonly string[]).includes(shape)) return shape;
  return SHIPPED_SHAPES[shippedShapeHash(agentId) % SHIPPED_SHAPES.length] ?? "blob";
}

type Point = [number, number];

// The head every hair style sits on. Its centre is 8 below the box centre so a
// hair shape has room above it inside the box; the eye line stays where the
// shipped mark put it (CENTER - 8), which is what the gaze and squint numbers
// in MOTION were tuned for.
const HEAD = { cx: CENTER, cy: CENTER + 8, r: 92 } as const;
const EYE_Y = CENTER - 8;
const EYE_X = 29;
const SCLERA_R = 13;
const PUPIL_R = 6.4;
const MOUTH_Y = CENTER + 36;
const BROW_Y = EYE_Y - 25;

const TAU = Math.PI * 2;
const round2 = (value: number) => Math.round(value * 100) / 100;
const rad = (degrees: number) => degrees * Math.PI / 180;
const onHead = (degrees: number, radius: number): Point => [HEAD.cx + Math.cos(rad(degrees)) * radius, HEAD.cy + Math.sin(rad(degrees)) * radius];

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=884671
// The shipped path builder (arc from cubic segments, rounded corners), kept so
// the hair shapes are constructed from numbers the way the bodies were.
class ArtifactPath {
  d = "";
  x = 0;
  y = 0;
  move(x: number, y: number) { this.d += `M${round2(x)} ${round2(y)}`; this.x = x; this.y = y; return this; }
  line(x: number, y: number) { this.d += `L${round2(x)} ${round2(y)}`; this.x = x; this.y = y; return this; }
  quad(x1: number, y1: number, x: number, y: number) {
    this.d += `Q${round2(x1)} ${round2(y1)} ${round2(x)} ${round2(y)}`;
    this.x = x; this.y = y; return this;
  }
  curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d += `C${round2(x1)} ${round2(y1)} ${round2(x2)} ${round2(y2)} ${round2(x)} ${round2(y)}`;
    this.x = x; this.y = y; return this;
  }
  corner(previous: Point, current: Point, next: Point, radius: number) {
    const unit = (from: Point, to: Point): Point => {
      const x = from[0] - to[0], y = from[1] - to[1], length = Math.hypot(x, y) || 1;
      return [x / length, y / length];
    };
    const before = unit(previous, current), after = unit(next, current);
    const start: Point = [current[0] + before[0] * radius, current[1] + before[1] * radius];
    const end: Point = [current[0] + after[0] * radius, current[1] + after[1] * radius];
    if (this.d) this.line(start[0], start[1]); else this.move(start[0], start[1]);
    this.d += `Q${round2(current[0])} ${round2(current[1])} ${round2(end[0])} ${round2(end[1])}`;
    this.x = end[0]; this.y = end[1]; return this;
  }
  arc(cx: number, cy: number, rx: number, ry: number, start: number, end: number) {
    const segments = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
    const step = (end - start) / segments;
    const control = 4 / 3 * Math.tan(step / 4);
    let angle = start;
    for (let index = 0; index < segments; index += 1) {
      const nextAngle = angle + step;
      const from: Point = [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
      const to: Point = [cx + rx * Math.cos(nextAngle), cy + ry * Math.sin(nextAngle)];
      this.curve(from[0] - control * rx * Math.sin(angle), from[1] + control * ry * Math.cos(angle), to[0] + control * rx * Math.sin(nextAngle), to[1] - control * ry * Math.cos(nextAngle), to[0], to[1]);
      angle = nextAngle;
    }
    return this;
  }
  close() { return `${this.d}Z`; }
}

function ellipseSubpath(cx: number, cy: number, rx: number, ry: number): string {
  return new ArtifactPath().move(cx + rx, cy).arc(cx, cy, rx, ry, 0, TAU).close();
}

// A cap: an outer arc over the head from the left temple angle to the right
// temple angle, closed by a fringe curve whose middle dips to `fringeY`.
function capPath(outerRadius: number, leftDegrees: number, rightDegrees: number, fringeY: number): string {
  const [leftX, leftY] = onHead(leftDegrees, outerRadius);
  const [rightX, rightY] = onHead(rightDegrees, outerRadius);
  const controlY = 2 * fringeY - (leftY + rightY) / 2;
  return new ArtifactPath().move(leftX, leftY).arc(HEAD.cx, HEAD.cy, outerRadius, outerRadius, rad(leftDegrees), rad(rightDegrees)).quad(HEAD.cx, controlY, leftX, leftY).close();
}

function bobPath(): string {
  const outer = HEAD.r + 10;
  const [leftX, leftY] = onHead(150, outer);
  const [rightX, rightY] = onHead(390, outer);
  const fringe = 80;
  return new ArtifactPath().move(leftX, leftY).arc(HEAD.cx, HEAD.cy, outer, outer, rad(150), rad(390))
    .curve(rightX - 14, rightY - 20, HEAD.cx + 66, fringe + 40, HEAD.cx + 62, fringe)
    .quad(HEAD.cx, fringe + 16, HEAD.cx - 62, fringe)
    .curve(HEAD.cx - 66, fringe + 40, leftX + 14, leftY - 20, leftX, leftY).close();
}

function flatTopPath(): string {
  const left = HEAD.cx - 82, right = HEAD.cx + 82, top = 14, bottom = 78;
  const corners: Point[] = [[left, top], [right, top], [right, bottom], [left, bottom]];
  const radii = [26, 26, 12, 12];
  const path = new ArtifactPath();
  for (let index = 0; index < 4; index += 1) path.corner(corners[(index + 3) % 4], corners[index], corners[(index + 1) % 4], radii[index]);
  return path.close();
}

function quiffPath(): string {
  const [leftX, leftY] = onHead(206, HEAD.r + 5);
  const [rightX, rightY] = onHead(338, HEAD.r + 9);
  return new ArtifactPath().move(leftX, leftY)
    .curve(HEAD.cx - 100, 40, HEAD.cx - 60, -4, HEAD.cx + 46, -2)
    .curve(HEAD.cx + 100, 0, HEAD.cx + 110, 40, rightX, rightY)
    .curve(HEAD.cx + 44, 100, HEAD.cx - 44, 60, leftX, leftY).close();
}

function curlsPath(): string {
  let d = "";
  for (const degrees of [198, 220, 242, 264, 286, 308, 330]) { const [x, y] = onHead(degrees, HEAD.r + 2); d += ellipseSubpath(x, y, 25, 25); }
  for (const degrees of [211, 233, 255, 277, 299, 321]) { const [x, y] = onHead(degrees, HEAD.r - 16); d += ellipseSubpath(x, y, 22, 22); }
  return d;
}

// Eight hair styles under Grok Bot's eight shape keys, so an agent whose
// persisted shape is "cloud" keeps being the one with that silhouette. A style
// is a front path drawn over the head and, for the puff, a back path drawn
// behind it. All of them lie inside the 259 box (a test measures it).
export interface HairStyle { readonly front: string; readonly back?: string; readonly name: string; readonly rim?: boolean }
const HAIR_STYLES: Record<string, HairStyle> = {
  blob: { name: "crop", front: capPath(HEAD.r + 7, 198, 342, 66) },
  pebble: { name: "bob", front: bobPath() },
  squircle: { name: "fringe", front: capPath(HEAD.r + 8, 194, 346, 93) },
  tablet: { name: "flat top", front: flatTopPath() },
  wedge: { name: "quiff", front: quiffPath() },
  hex: { name: "puff", front: capPath(HEAD.r + 4, 205, 335, 68), back: ellipseSubpath(HEAD.cx, 66, 108, 80) },
  cloud: { name: "curls", front: curlsPath(), rim: false },
  teardrop: { name: "bun", front: capPath(HEAD.r + 6, 200, 340, 66) + ellipseSubpath(HEAD.cx + 4, 15, 24, 24) },
};
export const PERSONA_HAIR_STYLES = HAIR_STYLES;
export const personaHairStyle = (shape: string): HairStyle => HAIR_STYLES[shape] ?? HAIR_STYLES.blob;
/** The front hair path per shape key; kept under the old name for anything that read the body path. */
export const PERSONA_SHAPE_PATHS: Record<string, string> = Object.fromEntries(Object.entries(HAIR_STYLES).map(([shape, style]) => [shape, style.front]));
export const personaShapePath = (shape: string) => personaHairStyle(shape).front;

// The theme is decided by CSS, not by JavaScript, so a face follows the
// `data-theme` of the shell it sits in (and the OS scheme where there is none)
// without a re-render. The sheet is installed once per document, from here.
const FACE_STYLE_ID = "sand-face-style";
const LIGHT_THEME = "--sand-face-hair:var(--sand-face-hair-light);--sand-face-sclera:#FCF9F4;--sand-face-ink:#2B2724;--sand-face-rim:rgba(255,255,255,.62);--sand-face-shadow:rgba(52,34,20,.34);--sand-face-ground:rgba(52,34,20,.24);--sand-face-blush:rgba(226,124,116,.26)";
const DARK_THEME = "--sand-face-hair:var(--sand-face-hair-dark);--sand-face-sclera:#EEEAE4;--sand-face-ink:#221F1D;--sand-face-rim:rgba(255,255,255,.36);--sand-face-shadow:rgba(0,0,0,.44);--sand-face-ground:rgba(0,0,0,.42);--sand-face-blush:rgba(226,124,116,.2)";
export const FACE_STYLE = `.sand-face{${LIGHT_THEME}}
[data-theme="cursor-dark"] .sand-face,[data-theme="dark"] .sand-face{${DARK_THEME}}
@media (prefers-color-scheme:dark){.sand-face:where(:not([data-theme="cursor-light"] *,[data-theme="light"] *)){${DARK_THEME}}}
.sand-face[data-surface-theme="light"]{${LIGHT_THEME}}`;
function installFaceStyle(): void {
  if (typeof document === "undefined" || document.getElementById(FACE_STYLE_ID) != null) return;
  const style = document.createElement("style");
  style.id = FACE_STYLE_ID;
  style.textContent = FACE_STYLE;
  document.head.appendChild(style);
}
installFaceStyle();

const mix = (variable: string, other: string, amount: number) => `color-mix(in oklab, var(${variable}), ${other} ${amount}%)`;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const MOTION: Record<OnboardingCharacterState, { amplitude: number; period: number; tilt: number; eye: number }> = {
  sleeping: { amplitude: 0, period: 6000, tilt: 0, eye: .12 }, waking: { amplitude: 2, period: 800, tilt: 0, eye: .35 }, idle: { amplitude: 1.5, period: 9000, tilt: 0, eye: 1 }, listening: { amplitude: 1.8, period: 2800, tilt: -2, eye: 1 },
  thinking: { amplitude: 1, period: 2000, tilt: 3, eye: .75 }, searching: { amplitude: 2, period: 1000, tilt: -4, eye: .9 }, working: { amplitude: 2, period: 1800, tilt: -3, eye: 1 }, loading: { amplitude: 2, period: 6000, tilt: 3, eye: .9 },
  excited: { amplitude: 5, period: 1100, tilt: 0, eye: 1.08 }, surprised: { amplitude: 3, period: 2500, tilt: 0, eye: 1.18 }, suspicious: { amplitude: 1, period: 2600, tilt: 7, eye: .75 }, angry: { amplitude: 1, period: 2200, tilt: -7, eye: .65 }, drowsy: { amplitude: .5, period: 4000, tilt: 0, eye: .25 },
  happy: { amplitude: 3, period: 2500, tilt: 0, eye: 1.08 }, curious: { amplitude: 2, period: 1800, tilt: 6, eye: 1 }, confused: { amplitude: 1, period: 2200, tilt: -5, eye: .8 }, bored: { amplitude: .4, period: 3500, tilt: -8, eye: .45 }, proud: { amplitude: 2, period: 3500, tilt: 4, eye: 1 }, shy: { amplitude: 1, period: 3000, tilt: -8, eye: .55 }, sad: { amplitude: 1, period: 4000, tilt: -4, eye: .6 }, laughing: { amplitude: 4, period: 1200, tilt: 0, eye: .8 }, scared: { amplitude: 3, period: 900, tilt: 0, eye: 1.1 }, playful: { amplitude: 4, period: 1500, tilt: 8, eye: 1.05 }, celebrate: { amplitude: 7, period: 1400, tilt: 0, eye: 1.12 },
  orbit: { amplitude: 2, period: 4000, tilt: 12, eye: 1 }, radar: { amplitude: 2, period: 4000, tilt: -12, eye: 1 }, progress: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, spawning: { amplitude: 5, period: 1200, tilt: 0, eye: 1 }, humming: { amplitude: 1.5, period: 5000, tilt: 0, eye: .9 }, dictating: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, writing: { amplitude: 2, period: 4000, tilt: -4, eye: 1 }, sending: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, receiving: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, uploading: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, notifying: { amplitude: 3, period: 1500, tilt: 0, eye: 1.1 }, alerting: { amplitude: 2, period: 2000, tilt: 0, eye: 1.1 }, dragging: { amplitude: 3, period: 1600, tilt: 5, eye: 1 }, bouncing: { amplitude: 7, period: 3000, tilt: 0, eye: 1 }, "powering-down": { amplitude: 0, period: 6000, tilt: 0, eye: .12 },
};
export const PERSONA_MOTION = MOTION;

// The per-state geometry. The shipped mark had one such part, the smile on
// excited, happy and celebrate; those three keep a smile. The rest is the
// clay face's own expression table and is read at render, not per frame.
type Mouth = "smile" | "grin" | "neutral" | "frown" | "o" | "flat";
const MOUTHS: Partial<Record<OnboardingCharacterState, Mouth>> = {
  excited: "smile", happy: "smile", celebrate: "smile", proud: "smile", playful: "smile", laughing: "grin",
  sad: "frown", bored: "frown", drowsy: "frown", surprised: "o", scared: "o", confused: "o",
  angry: "flat", suspicious: "flat", sleeping: "flat", "powering-down": "flat", shy: "flat",
};
const BROWS: Partial<Record<OnboardingCharacterState, { lift: number; angle: number }>> = {
  angry: { lift: 3, angle: 16 }, suspicious: { lift: 1, angle: 10 }, sad: { lift: -1, angle: -12 }, confused: { lift: -3, angle: -6 }, shy: { lift: -1, angle: -8 },
  surprised: { lift: -8, angle: 0 }, scared: { lift: -8, angle: 0 }, excited: { lift: -5, angle: 0 }, celebrate: { lift: -5, angle: 0 }, curious: { lift: -4, angle: -4 }, thinking: { lift: -2, angle: 4 },
};
const CLOSED_EYES = .3;

export interface OnboardingCharacterHandle { spin(): void; bounce(): void; burst(): void; }

export const OnboardingCharacter = forwardRef<OnboardingCharacterHandle, OnboardingCharacterVisualProps>(function OnboardingCharacter({ color, shape, sizePx, state, isFollowingPointer = false, paused = false, surfaceTheme, pointerShown = false, className, sourceId, emphasis = false, spinSignal = 0, followTarget = null }, ref) {
  const id = useId().replace(/:/g, "");
  const faceRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const gazeRef = useRef({ x: 0, y: 0 });
  const actionRef = useRef<"spin" | "bounce" | "burst" | null>(null);
  const resolvedColor = resolvePersonaColor(sourceId ?? "persona", color);
  const colors = COLORS[resolvedColor] ?? COLORS.black;
  const skin = resolvePersonaTone(resolvedColor);
  const hair = personaHairStyle(shape);
  const motion = MOTION[state] ?? MOTION.idle;
  useImperativeHandle(ref, () => ({
    spin: () => { actionRef.current = "spin"; },
    bounce: () => { actionRef.current = "bounce"; },
    burst: () => { actionRef.current = "burst"; },
  }), []);

  useEffect(() => {
    if ((!isFollowingPointer && followTarget == null) || typeof window === "undefined") return;
    const handlePointerMove = (event: PointerEvent) => {
      const node = faceRef.current?.ownerSVGElement;
      const rect = node?.getBoundingClientRect();
      if (rect == null || rect.width === 0 || rect.height === 0) return;
      gazeRef.current = {
        x: Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2))),
        y: Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2))),
      };
    };
    const clearPointer = () => { gazeRef.current = { x: 0, y: 0 }; };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", clearPointer);
    if (followTarget != null) {
      const node = faceRef.current?.ownerSVGElement;
      const rect = node?.getBoundingClientRect();
      if (rect != null && rect.width > 0 && rect.height > 0) gazeRef.current = {
        x: Math.max(-1, Math.min(1, (followTarget.x - (rect.left + rect.width / 2)) / (rect.width / 2))),
        y: Math.max(-1, Math.min(1, (followTarget.y - (rect.top + rect.height / 2)) / (rect.height / 2))),
      };
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", clearPointer);
      clearPointer();
    };
  }, [followTarget, isFollowingPointer]);

  useEffect(() => {
    const face = faceRef.current, eyes = eyesRef.current;
    if (spinSignal > 0) actionRef.current = "spin";
    if (face == null || eyes == null || reducedMotion() || paused) return;
    let frame = 0;
    const started = performance.now();
    const tick = (time: number) => {
      const elapsed = time - started;
      const action = actionRef.current;
      const phase = elapsed / motion.period * Math.PI * 2;
      const bounce = action === "bounce" ? Math.max(0, 1 - (elapsed % 700) / 700) * 8 : 0;
      const spin = action === "spin" ? (elapsed % 1000) / 1000 * 360 : 0;
      const bob = Math.sin(phase) * motion.amplitude;
      const gaze = gazeRef.current;
      face.setAttribute("transform", `translate(0 ${-bob - bounce}) rotate(${motion.tilt + spin} ${CENTER} ${CENTER})`);
      eyes.setAttribute("transform", `translate(${gaze.x * 4} ${gaze.y * 3}) scale(1 ${motion.eye})`);
      pupilsRef.current?.setAttribute("transform", `translate(${gaze.x * 7} ${gaze.y * 5})`);
      if (action === "bounce" && bounce === 0) actionRef.current = null;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion, paused, spinSignal, state]);

  const detailed = sizePx >= 36;
  const closed = motion.eye <= CLOSED_EYES;
  const mouth: Mouth = MOUTHS[state] ?? "neutral";
  const brow = BROWS[state] ?? { lift: 0, angle: 0 };
  const rootStyle = { display: "block", height: sizePx, overflow: "visible", userSelect: "none", WebkitUserSelect: "none", width: sizePx, "--sand-face-hair-light": colors.light, "--sand-face-hair-dark": colors.dark, "--sand-face-skin": skin } as CSSProperties;
  const skinFill = `url(#${id}-skin)`, hairFill = `url(#${id}-hair)`;
  const shade = mix("--sand-face-skin", "black", 18);
  const mouthInk = mix("--sand-face-skin", "black", 46);
  const browInk = mix("--sand-face-hair", "black", 22);
  const mouthPath = mouth === "smile" ? `M${CENTER - 20} ${MOUTH_Y - 3} Q${CENTER} ${MOUTH_Y + 16} ${CENTER + 20} ${MOUTH_Y - 3}`
    : mouth === "grin" ? `M${CENTER - 20} ${MOUTH_Y - 4} Q${CENTER} ${MOUTH_Y + 24} ${CENTER + 20} ${MOUTH_Y - 4}`
    : mouth === "frown" ? `M${CENTER - 10} ${MOUTH_Y + 6} Q${CENTER} ${MOUTH_Y - 2} ${CENTER + 10} ${MOUTH_Y + 6}`
    : mouth === "flat" ? `M${CENTER - 9} ${MOUTH_Y + 2} L${CENTER + 9} ${MOUTH_Y + 2}`
    : `M${CENTER - 9} ${MOUTH_Y} Q${CENTER} ${MOUTH_Y + 6} ${CENTER + 9} ${MOUTH_Y}`;
  return <svg aria-hidden="true" className={className == null ? "sand-face" : `sand-face ${className}`} data-avatar-hair={hair.name} data-emphasis={emphasis || undefined} data-grok-state={state} data-paused={paused || undefined} data-pointer-shown={pointerShown || undefined} data-reduced-motion={reducedMotion() ? "true" : "false"} data-source-id={sourceId || undefined} data-surface-theme={surfaceTheme} height={sizePx} style={rootStyle} viewBox={VIEWBOX} width={sizePx} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient cx={CENTER - 34} cy={CENTER - 30} gradientUnits="userSpaceOnUse" id={`${id}-skin`} r="128">
        <stop offset="0" style={{ stopColor: mix("--sand-face-skin", "white", 28) }} />
        <stop offset=".5" style={{ stopColor: "var(--sand-face-skin)" }} />
        <stop offset="1" style={{ stopColor: mix("--sand-face-skin", "black", 22) }} />
      </radialGradient>
      <radialGradient cx={CENTER - 30} cy="40" gradientUnits="userSpaceOnUse" id={`${id}-hair`} r="150">
        <stop offset="0" style={{ stopColor: mix("--sand-face-hair", "white", 22) }} />
        <stop offset=".45" style={{ stopColor: "var(--sand-face-hair)" }} />
        <stop offset="1" style={{ stopColor: mix("--sand-face-hair", "black", 26) }} />
      </radialGradient>
      <radialGradient id={`${id}-specular`}><stop offset="0" stopColor="#fff" stopOpacity=".42" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-ground`}><stop offset="0" style={{ stopColor: "var(--sand-face-ground)" }} /><stop offset="1" style={{ stopColor: "var(--sand-face-ground)" }} stopOpacity="0" /></radialGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id={`${id}-rim`} x1={CENTER - 70} x2={CENTER + 70} y1={CENTER - 70} y2={CENTER + 90}>
        <stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset="1" style={{ stopColor: "var(--sand-face-rim)" }} />
      </linearGradient>
      <filter height="150%" id={`${id}-soft`} width="140%" x="-20%" y="-25%"><feGaussianBlur stdDeviation="5" /></filter>
      <clipPath id={`${id}-head`}><circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} /></clipPath>
      <clipPath id={`${id}-sclera`}><circle cx={-EYE_X} cy="0" r={SCLERA_R} /><circle cx={EYE_X} cy="0" r={SCLERA_R} /></clipPath>
    </defs>
    <ellipse cx={HEAD.cx} cy={HEAD.cy + HEAD.r - 4} fill={`url(#${id}-ground)`} rx="66" ry="11" />
    <g ref={faceRef} transform="translate(0 0)">
      {hair.back == null ? null : <path d={hair.back} fill={hairFill} />}
      {detailed ? <g fill={skinFill}>
        <circle cx={HEAD.cx - 90} cy={HEAD.cy + 2} r="17" /><circle cx={HEAD.cx + 90} cy={HEAD.cy + 2} r="17" />
        <circle cx={HEAD.cx - 90} cy={HEAD.cy + 3} fill={shade} opacity=".7" r="8" /><circle cx={HEAD.cx + 90} cy={HEAD.cy + 3} fill={shade} opacity=".7" r="8" />
      </g> : null}
      <circle cx={HEAD.cx} cy={HEAD.cy} fill={skinFill} r={HEAD.r} />
      <g clipPath={`url(#${id}-head)`}><path d={hair.front} fill="var(--sand-face-shadow)" filter={`url(#${id}-soft)`} transform="translate(0 9)" /></g>
      <ellipse cx={HEAD.cx - 36} cy={HEAD.cy - 46} fill={`url(#${id}-specular)`} rx="28" ry="17" transform={`rotate(-28 ${HEAD.cx - 36} ${HEAD.cy - 46})`} />
      <circle cx={HEAD.cx} cy={HEAD.cy} fill="none" r={HEAD.r} stroke={`url(#${id}-rim)`} strokeWidth="3" />
      {detailed ? <>
        <ellipse cx={HEAD.cx - 54} cy={HEAD.cy + 16} fill="var(--sand-face-blush)" rx="15" ry="8" /><ellipse cx={HEAD.cx + 54} cy={HEAD.cy + 16} fill="var(--sand-face-blush)" rx="15" ry="8" />
        <ellipse cx={HEAD.cx} cy={HEAD.cy + 8} fill={shade} opacity=".55" rx="6" ry="7.5" />
        <g fill="none" stroke={browInk} strokeLinecap="round" strokeWidth="5">
          <path d={`M${CENTER - EYE_X - 11} ${BROW_Y + brow.lift} L${CENTER - EYE_X + 11} ${BROW_Y + brow.lift}`} transform={`rotate(${brow.angle} ${CENTER - EYE_X} ${BROW_Y + brow.lift})`} />
          <path d={`M${CENTER + EYE_X - 11} ${BROW_Y + brow.lift} L${CENTER + EYE_X + 11} ${BROW_Y + brow.lift}`} transform={`rotate(${-brow.angle} ${CENTER + EYE_X} ${BROW_Y + brow.lift})`} />
        </g>
      </> : null}
      <g transform={`translate(${CENTER} ${EYE_Y})`}>
        <g ref={eyesRef} transform="translate(0 0)">
          {closed ? <g fill="none" stroke="var(--sand-face-ink)" strokeLinecap="round" strokeWidth="4.5">
            <path d={`M${-EYE_X - 11} 0 Q${-EYE_X} 8 ${-EYE_X + 11} 0`} /><path d={`M${EYE_X - 11} 0 Q${EYE_X} 8 ${EYE_X + 11} 0`} />
          </g> : <>
            <circle cx={-EYE_X} cy="0" fill="var(--sand-face-sclera)" r={SCLERA_R} /><circle cx={EYE_X} cy="0" fill="var(--sand-face-sclera)" r={SCLERA_R} />
            <g clipPath={`url(#${id}-sclera)`}>
              <g ref={pupilsRef} transform="translate(0 0)">
                <circle cx={-EYE_X + 1} cy="1" fill="var(--sand-face-ink)" r={PUPIL_R} /><circle cx={EYE_X + 1} cy="1" fill="var(--sand-face-ink)" r={PUPIL_R} />
                <circle cx={-EYE_X - 1.5} cy="-1.5" fill="#fff" opacity=".85" r="2" /><circle cx={EYE_X - 1.5} cy="-1.5" fill="#fff" opacity=".85" r="2" />
              </g>
            </g>
          </>}
        </g>
      </g>
      {mouth === "o" ? <circle cx={CENTER} cy={MOUTH_Y + 3} fill="var(--sand-face-ink)" r="6" /> : <>
        {mouth === "grin" ? <path d={`${mouthPath}Z`} fill="var(--sand-face-ink)" /> : null}
        <path d={mouthPath} fill="none" stroke={mouth === "grin" ? "var(--sand-face-ink)" : mouthInk} strokeLinecap="round" strokeWidth={mouth === "smile" || mouth === "grin" ? 5.5 : 4} />
      </>}
      <path d={hair.front} fill={hairFill} />
      {hair.rim === false ? null : <path d={hair.front} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2.5" />}
    </g>
  </svg>;
});

export function defaultOnboardingCharacterRenderer(props: OnboardingCharacterVisualProps) {
  return <OnboardingCharacter {...props} />;
}

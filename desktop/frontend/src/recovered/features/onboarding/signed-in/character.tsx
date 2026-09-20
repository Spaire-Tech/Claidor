import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type CSSProperties } from "react";
import {
  CLOUD_BLOB_COLORS,
  CLOUD_BLOB_SHAPE,
  resolveCloudBlobColor,
} from "../../../../../../source/shared/agent/cloud-blobs";
import type { OnboardingCharacterVisualProps } from "./view";
import type { OnboardingCharacterState } from "./scene";

const VIEWBOX = "-15 -10 259 275";
const CENTER = 114.2705;
const BLOB_PATH = "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";
const COLORS: Record<string, { light: string; dark: string }> = Object.fromEntries(
  CLOUD_BLOB_COLORS.map((color) => [color.id, { light: color.top, dark: color.bottom }]),
);

export function resolvePersonaColor(agentId: string, color?: string | null): string {
  return resolveCloudBlobColor(agentId, color);
}
export function resolvePersonaShape(_agentId: string, _shape?: string | null): string {
  return CLOUD_BLOB_SHAPE;
}

type Point = [number, number];

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=884671
// These are the shipped shape constructors (Yse/Ztt/Xtt/FBe/YJt/zBe/ZJt/r_t),
// kept local so the renderer remains dependency-closed without inventing geometry.
const TAU = Math.PI * 2;
const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, minimum: number, maximum: number) => value < minimum ? minimum : value > maximum ? maximum : value;

function smoothPath(points: readonly Point[]): string {
  const path = [`M${round2(points[0][0])} ${round2(points[0][1])}`];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    path.push(`C${round2(current[0] + (next[0] - previous[0]) / 6)} ${round2(current[1] + (next[1] - previous[1]) / 6)} ${round2(next[0] - (afterNext[0] - current[0]) / 6)} ${round2(next[1] - (afterNext[1] - current[1]) / 6)} ${round2(next[0])} ${round2(next[1])}`);
  }
  return `${path.join("")}Z`;
}

class ArtifactPath {
  d = "";
  x = 0;
  y = 0;
  move(x: number, y: number) { this.d += `M${round2(x)} ${round2(y)}`; this.x = x; this.y = y; return this; }
  line(x: number, y: number) { this.d += `L${round2(x)} ${round2(y)}`; this.x = x; this.y = y; return this; }
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

function sampledPath(generator: (angle: number) => Point, count = 128): string {
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) points.push(generator(index / count * TAU));
  return smoothPath(points);
}

function roundedPolygon(radius: number, sides: number, cornerRadius: number, start = 0): string {
  const points = Array.from({ length: sides }, (_, index): Point => {
    const angle = start + index / sides * TAU;
    return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];
  });
  const path = new ArtifactPath();
  for (let index = 0; index < sides; index += 1) path.corner(points[(index - 1 + sides) % sides], points[index], points[(index + 1) % sides], cornerRadius);
  return path.close();
}

function cloudPath(points: readonly [number, number, number][], count = 160): string {
  return sampledPath((angle) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let radius = 0;
    for (const [x, y, circleRadius] of points) {
      const dx = x - CENTER, dy = y - CENTER, projection = cos * dx + sin * dy;
      const discriminant = projection * projection - (dx * dx + dy * dy) + circleRadius * circleRadius;
      if (discriminant <= 0) continue;
      radius = Math.max(radius, projection + Math.sqrt(discriminant));
    }
    return [CENTER + cos * radius, CENTER + sin * radius];
  }, count);
}

function squirclePath(width: number, height: number, exponent: number): string {
  return sampledPath((angle) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [CENTER + Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent) * width, CENTER + Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent) * height];
  });
}

function tabletPath(width: number, height: number): string {
  return new ArtifactPath().move(CENTER - width + height, CENTER - height).line(CENTER + width - height, CENTER - height)
    .arc(CENTER + width - height, CENTER, height, height, -Math.PI / 2, Math.PI / 2).line(CENTER - width + height, CENTER + height)
    .arc(CENTER - width + height, CENTER, height, height, Math.PI / 2, Math.PI * 3 / 2).close();
}

function teardropPath(width: number, top: number, bottom: number, cornerRadius: number): string {
  const ratio = clamp(width / (bottom - top), -1, 1), height = Math.sqrt(1 - ratio * ratio);
  const right: Point = [CENTER + width * height, bottom - width * ratio];
  const left: Point = [CENTER - width * height, bottom - width * ratio];
  const angle = Math.atan2(right[1] - bottom, right[0] - CENTER);
  return new ArtifactPath().corner(right, [CENTER, top], left, cornerRadius).line(left[0], left[1]).arc(CENTER, bottom, width, width, Math.PI - angle, angle).close();
}

function pathSamples(path: string): Point[] {
  const tokens = path.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const samples: Point[] = [];
  let index = 0, command = "", startX = 0, startY = 0, x = 0, y = 0;
  const number = () => Number(tokens[index++]);
  const addLine = (toX: number, toY: number) => {
    const length = Math.hypot(toX - x, toY - y), count = Math.max(2, Math.ceil(length / 4));
    for (let step = 1; step <= count; step += 1) samples.push([x + (toX - x) * step / count, y + (toY - y) * step / count]);
    x = toX; y = toY;
  };
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++].toUpperCase();
    if (command === "Z") { addLine(startX, startY); continue; }
    if (command === "M") { x = number(); y = number(); startX = x; startY = y; samples.push([x, y]); command = "L"; continue; }
    if (command === "L") { addLine(number(), number()); continue; }
    if (command === "Q") {
      const x1 = number(), y1 = number(), endX = number(), endY = number(), fromX = x, fromY = y;
      const count = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(endX - x1, endY - y1)) / 4));
      for (let step = 1; step <= count; step += 1) { const t = step / count, inverse = 1 - t; samples.push([inverse * inverse * fromX + 2 * inverse * t * x1 + t * t * endX, inverse * inverse * fromY + 2 * inverse * t * y1 + t * t * endY]); }
      x = endX; y = endY; continue;
    }
    if (command === "C") {
      const x1 = number(), y1 = number(), x2 = number(), y2 = number(), endX = number(), endY = number(), fromX = x, fromY = y;
      const count = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(endX - x2, endY - y2)) / 4));
      for (let step = 1; step <= count; step += 1) { const t = step / count, inverse = 1 - t; samples.push([inverse ** 3 * fromX + 3 * inverse ** 2 * t * x1 + 3 * inverse * t ** 2 * x2 + t ** 3 * endX, inverse ** 3 * fromY + 3 * inverse ** 2 * t * y1 + 3 * inverse * t ** 2 * y2 + t ** 3 * endY]); }
      x = endX; y = endY; continue;
    }
    index += 1;
  }
  return samples;
}

function normalizeArtifactPath(path: string): string {
  const samples = pathSamples(path);
  const xs = samples.map(([x]) => x), ys = samples.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const offsetX = CENTER - (minX + maxX) / 2, offsetY = CENTER - (minY + maxY) / 2;
  const scale = clamp(228.44 / Math.max(maxX - minX, maxY - minY), .9, 1.35);
  if (Math.abs(scale - 1) < .005 && Math.abs(offsetX) < .5 && Math.abs(offsetY) < .5) return path;
  let numberIndex = 0;
  return path.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (value) => {
    const coordinate = Number(value) + (numberIndex++ % 2 === 0 ? offsetX : offsetY);
    return String(round2(CENTER + (coordinate - CENTER) * scale));
  });
}

const CLOUD_FACE_LOBES: Array<[number, number, number]> = [
  [CENTER, CENTER + 4, 64],
  ...Array.from({ length: 7 }, (_, index): [number, number, number] => {
    const angle = -Math.PI / 2 + index / 7 * Math.PI * 2;
    return [CENTER + Math.cos(angle) * 52, CENTER + Math.sin(angle) * 47, 40];
  }),
];

const ARTIFACT_SHAPE_PATHS: Record<string, string> = {
  blob: normalizeArtifactPath(BLOB_PATH),
  pebble: normalizeArtifactPath(sampledPath((angle) => { const radius = 108 * (1 + .075 * (Math.sin(angle * 2 + 1.1) * .6 + Math.sin(angle * 3 - 1.1) * .4)); return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius * .98]; })),
  squircle: normalizeArtifactPath(squirclePath(107, 107, 4.2)),
  tablet: normalizeArtifactPath(tabletPath(114, 74)),
  wedge: normalizeArtifactPath(roundedPolygon(130, 3, 60, -Math.PI / 2)),
  hex: normalizeArtifactPath(roundedPolygon(114, 6, 20, Math.PI / 6)),
  cloud: normalizeArtifactPath(cloudPath(CLOUD_FACE_LOBES)),
  teardrop: normalizeArtifactPath(teardropPath(88, CENTER - 114, CENTER + 26, 18)),
};
export const PERSONA_SHAPE_PATHS = ARTIFACT_SHAPE_PATHS;
export const personaShapePath = (shape: string) => ARTIFACT_SHAPE_PATHS[shape] ?? ARTIFACT_SHAPE_PATHS.blob;

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

export interface OnboardingCharacterHandle { spin(): void; bounce(): void; burst(): void; }

export const OnboardingCharacter = forwardRef<OnboardingCharacterHandle, OnboardingCharacterVisualProps>(function OnboardingCharacter({ color, shape, sizePx, state, isFollowingPointer = false, paused = false, surfaceTheme, pointerShown = false, className, sourceId, emphasis = false, spinSignal = 0, followTarget = null }, ref) {
  const id = useId().replace(/:/g, "");
  const faceRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const gazeRef = useRef({ x: 0, y: 0 });
  const actionRef = useRef<"spin" | "bounce" | "burst" | null>(null);
  const resolvedColor = resolvePersonaColor(sourceId ?? "persona", color);
  const colors = COLORS[resolvedColor] ?? COLORS.mist ?? { light: "#cbd6f2", dark: "#ccb2d6" };
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
      if (action === "bounce" && bounce === 0) actionRef.current = null;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion, paused, spinSignal, state]);

  const rootStyle: CSSProperties = { display: "block", height: sizePx, overflow: "visible", userSelect: "none", WebkitUserSelect: "none", width: sizePx };
  const sleeping = state === "sleeping" || state === "drowsy";
  return <svg aria-hidden="true" className={className} data-avatar-color={resolvedColor} data-avatar-shape={CLOUD_BLOB_SHAPE} data-emphasis={emphasis || undefined} data-grok-state={state} data-paused={paused || undefined} data-pointer-shown={pointerShown || undefined} data-reduced-motion={reducedMotion() ? "true" : "false"} data-source-id={sourceId || undefined} height={sizePx} style={rootStyle} viewBox={VIEWBOX} width={sizePx} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={`${id}-ink`} x1="0.2" x2="0.35" y1="0" y2="1"><stop offset="0" stopColor={colors.light} /><stop offset="1" stopColor={colors.dark} /></linearGradient>
      <radialGradient id={`${id}-shade`} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#1b2430" stopOpacity=".28" /><stop offset="1" stopColor="#1b2430" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx={CENTER} cy={CENTER + 128} fill={`url(#${id}-shade)`} rx="58" ry="12" />
    <g ref={faceRef} transform="translate(0 0)">
      <path d={personaShapePath(CLOUD_BLOB_SHAPE)} fill={`url(#${id}-ink)`} />
      <g ref={eyesRef} transform="translate(0 0)">
        <CloudEye cx={CENTER - 26} cy={CENTER - 4} sleeping={sleeping} />
        <CloudEye cx={CENTER + 26} cy={CENTER - 4} sleeping={sleeping} />
      </g>
      {state === "excited" || state === "happy" || state === "celebrate" ? <path d={`M${CENTER - 16} ${CENTER + 28} Q${CENTER} ${CENTER + 40} ${CENTER + 16} ${CENTER + 28}`} fill="none" stroke="#2a3140" strokeLinecap="round" strokeWidth="4" /> : null}
    </g>
  </svg>;
});

function CloudEye({ cx, cy, sleeping }: { cx: number; cy: number; sleeping: boolean }) {
  if (sleeping) return <path d={`M${cx - 10} ${cy} Q${cx} ${cy + 5} ${cx + 10} ${cy}`} fill="none" stroke="#2a3140" strokeLinecap="round" strokeWidth="3" />;
  return <g>
    <ellipse cx={cx} cy={cy} fill="#fff" rx="11" ry="13" />
    <circle cx={cx} cy={cy + 1} fill="#1b1f27" r="5.4" />
    <circle cx={cx + 2.4} cy={cy - 2.6} fill="#fff" r="1.8" />
  </g>;
}

export function defaultOnboardingCharacterRenderer(props: OnboardingCharacterVisualProps) {
  return <OnboardingCharacter {...props} />;
}

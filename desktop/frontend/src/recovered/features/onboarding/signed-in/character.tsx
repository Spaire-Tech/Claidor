import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type CSSProperties } from "react";
import type { OnboardingCharacterVisualProps } from "./view";
import type { OnboardingCharacterState } from "./scene";
import { ADVENTURER_CREDIT, AVATAR_KEYS, AVATAR_SOURCE_BOX, AVATARS, type Avatar, type AvatarKey } from "./avatars.generated";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
// The shipped engine geometry is the inline 259px mark, not an image asset. The
// box, its centre and the state table are kept; what is drawn inside the box is
// one of the founder's twenty-one avatars (brand/avatars, DiceBear "Adventurer",
// decided 23 September 2026, docs/product/faces-adventurer-measured.md). An
// avatar is a finished drawing: no shape axis, no colour axis, no skin tone.
// Choosing a different one changes the whole face. Nothing outside this file
// paints the mark.
const VIEWBOX = "-15 -15 259 259";
const CENTER = 114.2705;
export { ADVENTURER_CREDIT, AVATAR_KEYS };

// The eleven colour names Grok Bot stored per agent. They are still resolved
// (the sidebar wrapper writes `data-avatar-color`) but draw nothing now.
const COLOR_KEYS = ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"] as const;
// Grok Bot's eight shape names map onto the first eight avatars, so a scene
// or a stored agent that still says "blob" keeps a face.
const LEGACY_SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"] as const;

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1412620
// Eee/Cee's deterministic fallback selectors, kept artifact-exact.
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
  if (color != null && (COLOR_KEYS as readonly string[]).includes(color)) return color;
  return ["brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"][shippedColorIndex(agentId)] ?? "gray";
}
/** The avatar an agent wears: the stored key if it is one of the twenty-one, a legacy shape name mapped onto the first eight, else one by hash of the id. */
export function resolvePersonaShape(agentId: string, shape?: string | null): AvatarKey {
  if (shape != null) {
    if (isAvatarKey(shape)) return shape;
    const legacy = (LEGACY_SHAPES as readonly string[]).indexOf(shape);
    if (legacy >= 0 && AVATAR_KEYS[legacy] != null) return AVATAR_KEYS[legacy];
  }
  return AVATAR_KEYS[shippedShapeHash(agentId) % AVATAR_KEYS.length] ?? AVATAR_KEYS[0];
}
export function isAvatarKey(value: string): value is AvatarKey {
  return Object.prototype.hasOwnProperty.call(AVATARS, value);
}
export const personaAvatar = (shape: string): Avatar => AVATARS[isAvatarKey(shape) ? shape : resolvePersonaShape("persona", shape)];

// The 762 source box sits in the 259 box at one scale for every avatar, with
// the shared head centred on the mark (the head is the same drawing in all
// twenty-one; only hair and features differ). Hair wider than the source box
// is clipped to the mark, as DiceBear's own export clips it.
const SCALE = 259 / AVATAR_SOURCE_BOX;
const HEAD_CENTER_SOURCE = { x: 143 + 500.9 / 2, y: 162.9 + 448.1 / 2 };
const OFFSET = { x: CENTER - HEAD_CENTER_SOURCE.x * SCALE, y: CENTER + 4 - HEAD_CENTER_SOURCE.y * SCALE };
const SOURCE_TRANSFORM = `matrix(${SCALE} 0 0 ${SCALE} ${OFFSET.x} ${OFFSET.y})`;
export const AVATAR_PLACEMENT = { scale: SCALE, offset: OFFSET } as const;

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

export interface OnboardingCharacterHandle { spin(): void; bounce(): void; burst(): void; }

export const OnboardingCharacter = forwardRef<OnboardingCharacterHandle, OnboardingCharacterVisualProps>(function OnboardingCharacter({ color, shape, sizePx, state, isFollowingPointer = false, paused = false, surfaceTheme, pointerShown = false, className, sourceId, emphasis = false, spinSignal = 0, followTarget = null }, ref) {
  const id = useId().replace(/:/g, "");
  const faceRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const gazeRef = useRef({ x: 0, y: 0 });
  const actionRef = useRef<"spin" | "bounce" | "burst" | null>(null);
  const resolvedColor = resolvePersonaColor(sourceId ?? "persona", color);
  const avatar = personaAvatar(shape);
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
  const eyesIndex = avatar.layers.findIndex((layer) => layer.part.startsWith("eyes-"));
  const below = avatar.layers.slice(0, eyesIndex);
  const eyesLayer = avatar.layers[eyesIndex];
  const above = avatar.layers.slice(eyesIndex + 1);
  // The eyes group is centred on the measured eye centre, so the loop's
  // scale(1, eye) closes the eyes in place and its translate moves them.
  const eyeCenter = { x: avatar.eyes.cx * SCALE + OFFSET.x, y: avatar.eyes.cy * SCALE + OFFSET.y };
  const eyesTransform = `matrix(${SCALE} 0 0 ${SCALE} ${-avatar.eyes.cx * SCALE} ${-avatar.eyes.cy * SCALE})`;
  return <svg aria-hidden="true" className={className == null ? "sand-face" : `sand-face ${className}`} data-avatar={avatar.key} data-avatar-color-key={resolvedColor} data-emphasis={emphasis || undefined} data-grok-state={state} data-paused={paused || undefined} data-pointer-shown={pointerShown || undefined} data-reduced-motion={reducedMotion() ? "true" : "false"} data-source-id={sourceId || undefined} data-surface-theme={surfaceTheme} height={sizePx} style={rootStyle} viewBox={VIEWBOX} width={sizePx} xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id={`${id}-mark`}><rect height="259" width="259" x="-15" y="-15" /></clipPath></defs>
    <g clipPath={`url(#${id}-mark)`}>
      <g ref={faceRef} transform="translate(0 0)">
        <g fill="none" transform={SOURCE_TRANSFORM}>
          {below.map((layer) => <g dangerouslySetInnerHTML={{ __html: layer.markup }} data-part={layer.part} key={layer.part} transform={`translate(${layer.x} ${layer.y})`} />)}
        </g>
        <g transform={`translate(${eyeCenter.x} ${eyeCenter.y})`}>
          <g ref={eyesRef} transform="translate(0 0)">
            {eyesLayer == null ? null : <g fill="none" transform={eyesTransform}><g dangerouslySetInnerHTML={{ __html: eyesLayer.markup }} data-part={eyesLayer.part} transform={`translate(${eyesLayer.x} ${eyesLayer.y})`} /></g>}
          </g>
        </g>
        <g fill="none" transform={SOURCE_TRANSFORM}>
          {above.map((layer) => <g dangerouslySetInnerHTML={{ __html: layer.markup }} data-part={layer.part} key={layer.part} transform={`translate(${layer.x} ${layer.y})`} />)}
        </g>
      </g>
    </g>
  </svg>;
});

export function defaultOnboardingCharacterRenderer(props: OnboardingCharacterVisualProps) {
  return <OnboardingCharacter {...props} />;
}

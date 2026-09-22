/**
 * How a face moves, by the agent's state — Grok Bot's motion, on our body.
 *
 * The 0.18.0 face is driven by one animation loop and a table of states
 * (`frontend/src/recovered/features/onboarding/signed-in/character.tsx`,
 * `MOTION`, recovered from the shipped bundle: the `OnboardingCharacter`
 * closure and its `MOTION` map). Each state is four numbers: how far the
 * face bobs, how fast, how many degrees it leans, and how open the eyes
 * are. Three one-off moves sit on top — spin (a full turn), bounce and
 * burst — and the eyes follow the pointer. The table below is that one,
 * verbatim; the geometry is rescaled from Grok's 228.5-unit blob to whatever
 * body is drawn (`FaceGeometry`), the clay face's 100-unit canvas today.
 *
 * Pure: no DOM, no clock of its own, so every frame can be checked in a test.
 */

export interface FaceMotionSpec {
  /** Bob amplitude, in Grok's viewBox units. */
  readonly amplitude: number;
  /** One bob cycle, in milliseconds. */
  readonly period: number;
  /** Lean, in degrees. */
  readonly tilt: number;
  /** Eye openness, 1 is open. */
  readonly eye: number;
}

export const FACE_MOTION_STATES: Readonly<Record<string, FaceMotionSpec>> = {
  sleeping: { amplitude: 0, period: 6000, tilt: 0, eye: .12 }, waking: { amplitude: 2, period: 800, tilt: 0, eye: .35 }, idle: { amplitude: 1.5, period: 9000, tilt: 0, eye: 1 }, listening: { amplitude: 1.8, period: 2800, tilt: -2, eye: 1 },
  thinking: { amplitude: 1, period: 2000, tilt: 3, eye: .75 }, searching: { amplitude: 2, period: 1000, tilt: -4, eye: .9 }, working: { amplitude: 2, period: 1800, tilt: -3, eye: 1 }, loading: { amplitude: 2, period: 6000, tilt: 3, eye: .9 },
  excited: { amplitude: 5, period: 1100, tilt: 0, eye: 1.08 }, surprised: { amplitude: 3, period: 2500, tilt: 0, eye: 1.18 }, suspicious: { amplitude: 1, period: 2600, tilt: 7, eye: .75 }, angry: { amplitude: 1, period: 2200, tilt: -7, eye: .65 }, drowsy: { amplitude: .5, period: 4000, tilt: 0, eye: .25 },
  happy: { amplitude: 3, period: 2500, tilt: 0, eye: 1.08 }, curious: { amplitude: 2, period: 1800, tilt: 6, eye: 1 }, confused: { amplitude: 1, period: 2200, tilt: -5, eye: .8 }, bored: { amplitude: .4, period: 3500, tilt: -8, eye: .45 }, proud: { amplitude: 2, period: 3500, tilt: 4, eye: 1 }, shy: { amplitude: 1, period: 3000, tilt: -8, eye: .55 }, sad: { amplitude: 1, period: 4000, tilt: -4, eye: .6 }, laughing: { amplitude: 4, period: 1200, tilt: 0, eye: .8 }, scared: { amplitude: 3, period: 900, tilt: 0, eye: 1.1 }, playful: { amplitude: 4, period: 1500, tilt: 8, eye: 1.05 }, celebrate: { amplitude: 7, period: 1400, tilt: 0, eye: 1.12 },
  orbit: { amplitude: 2, period: 4000, tilt: 12, eye: 1 }, radar: { amplitude: 2, period: 4000, tilt: -12, eye: 1 }, progress: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, spawning: { amplitude: 5, period: 1200, tilt: 0, eye: 1 }, humming: { amplitude: 1.5, period: 5000, tilt: 0, eye: .9 }, dictating: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, writing: { amplitude: 2, period: 4000, tilt: -4, eye: 1 }, sending: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, receiving: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, uploading: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, notifying: { amplitude: 3, period: 1500, tilt: 0, eye: 1.1 }, alerting: { amplitude: 2, period: 2000, tilt: 0, eye: 1.1 }, dragging: { amplitude: 3, period: 1600, tilt: 5, eye: 1 }, bouncing: { amplitude: 7, period: 3000, tilt: 0, eye: 1 }, "powering-down": { amplitude: 0, period: 6000, tilt: 0, eye: .12 },
};

/** Grok's blob is 228.541 units wide; every distance in the table is in those units. */
export const GROK_BLOB_WIDTH = 228.541;

export interface FaceGeometry {
  /** Units of the drawn body per Grok unit. */
  readonly scale: number;
  /** Where the body turns. */
  readonly centerX: number;
  readonly centerY: number;
  /** The eye whites' centre line, so openness scales about it. */
  readonly eyeY: number;
}

/** The clay face: a 100-unit canvas, the body turning about its middle. */
export function clayFaceGeometry(eyeY: number): FaceGeometry {
  return { scale: 100 / GROK_BLOB_WIDTH, centerX: 50, centerY: 62, eyeY };
}

export type FaceMotionActionKind = "spin" | "bounce";

export interface FaceMotionAction {
  readonly kind: FaceMotionActionKind;
  readonly startedAt: number;
}

/** A spin is one full turn; Grok turns 360° in a second. */
export const FACE_SPIN_MS = 1000;
/** A bounce is Grok's 700 ms decay, 8 units high. */
export const FACE_BOUNCE_MS = 700;

export function faceMotionFor(state: string | null | undefined): FaceMotionSpec {
  return FACE_MOTION_STATES[state ?? ""] ?? FACE_MOTION_STATES.idle!;
}

export function isFaceMotionState(state: string | null | undefined): boolean {
  return state != null && Object.hasOwn(FACE_MOTION_STATES, state);
}

const SPIN_ON = new Set(["sending", "spawning", "celebrate", "orbit"]);
const BOUNCE_ON = new Set(["excited", "happy", "notifying", "alerting", "bouncing", "receiving"]);

/**
 * The one-off move a change of state earns, if any. Grok fires spin and
 * bounce from its parent; the overlay has only the state to go on, so the
 * states that mean "something just happened" carry the move.
 */
export function faceActionForTransition(previous: string | null, next: string | null): FaceMotionActionKind | null {
  if (previous === next || next == null) return null;
  if (SPIN_ON.has(next)) return "spin";
  if (BOUNCE_ON.has(next)) return "bounce";
  return null;
}

export interface FaceMotionInput {
  readonly state: string | null | undefined;
  /** Milliseconds since this face was painted. */
  readonly elapsedMs: number;
  /** Milliseconds now, on the same clock as `action.startedAt`. */
  readonly nowMs?: number;
  readonly action?: FaceMotionAction | null;
  /** Pointer position relative to the face, each axis in -1..1. */
  readonly gaze?: { readonly x: number; readonly y: number };
  /** `prefers-reduced-motion`, or the mark is paused: hold the pose, no motion. */
  readonly still?: boolean;
}

export interface FaceMotionFrame {
  /** The `transform` attribute for the face group (body and eyes together). */
  readonly face: string;
  /** The `transform` attribute for the eyes group: openness about the eye line. */
  readonly eyes: string;
  /** The `transform` attribute for each pupil group: the gaze. */
  readonly pupils: string;
  /** The action has finished and can be dropped. */
  readonly actionDone: boolean;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function faceMotionFrame(input: FaceMotionInput, geometry: FaceGeometry): FaceMotionFrame {
  const spec = faceMotionFor(input.state);
  const now = input.nowMs ?? input.elapsedMs;
  const still = input.still === true;
  const phase = (input.elapsedMs / spec.period) * Math.PI * 2;
  const bob = still ? 0 : Math.sin(phase) * spec.amplitude;
  let spin = 0;
  let bounce = 0;
  let actionDone = false;
  if (input.action != null && !still) {
    const since = Math.max(0, now - input.action.startedAt);
    if (input.action.kind === "spin") {
      spin = Math.min(1, since / FACE_SPIN_MS) * 360;
      actionDone = since >= FACE_SPIN_MS;
      if (actionDone) spin = 0;
    } else {
      bounce = Math.max(0, 1 - since / FACE_BOUNCE_MS) * 8;
      actionDone = since >= FACE_BOUNCE_MS;
    }
  } else if (input.action != null) {
    actionDone = true;
  }
  const gaze = still ? { x: 0, y: 0 } : input.gaze ?? { x: 0, y: 0 };
  const lift = round(-(bob + bounce) * geometry.scale);
  const angle = round(spec.tilt + spin);
  const gazeX = round(gaze.x * 4 * geometry.scale);
  const gazeY = round(gaze.y * 3 * geometry.scale);
  return {
    face: `translate(0 ${lift}) rotate(${angle} ${geometry.centerX} ${geometry.centerY})`,
    eyes: `translate(0 ${geometry.eyeY}) scale(1 ${round(spec.eye)}) translate(0 ${-geometry.eyeY})`,
    pupils: `translate(${gazeX} ${gazeY})`,
    actionDone,
  };
}

/** Pointer position as Grok reads it: each axis -1..1 across the face's box. */
export function faceGazeFor(pointer: { readonly x: number; readonly y: number }, box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
  return {
    x: clamp((pointer.x - (box.left + box.width / 2)) / (box.width / 2)),
    y: clamp((pointer.y - (box.top + box.height / 2)) / (box.height / 2)),
  };
}

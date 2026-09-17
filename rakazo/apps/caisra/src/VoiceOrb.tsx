import type { Voice } from "@rakazo/core";
import "./voiceorb.css";

/**
 * A voice's sphere.
 *
 * **This is not the design's drawing, and that should be said plainly.** In the
 * founder's tree an orb is a WebGL custom element (`orb/cloudOrbElement.ts`)
 * running a shader that drifts clouds of the five colours with a grain over
 * them, and `Orb.tsx` only wraps it. Porting a shader is a piece of work of its
 * own and it is not this piece.
 *
 * So this keeps the rule that actually matters and drops the one that does not
 * yet. The rule that matters is the founder's own, after the first build broke
 * it: *a voice is a picture of its own*, drawn from the voice's five colours
 * and its own seed, never from the agent's face — *"pick a voice with a
 * different colour, get a default blue"* was the fault. Seven voices, seven
 * distinguishable spheres, the right one every time.
 *
 * What is missing is the motion and the grain. When the shader is ported this
 * file is what it replaces, and nothing else changes: every caller passes a
 * `Voice` and a size.
 */
export function VoiceOrb({
  voice,
  size,
  elevated,
}: {
  voice: Voice;
  size: number;
  /** A large sphere in the picker carries more shadow than a small one in a row. */
  elevated?: boolean;
}) {
  const [base, second, third, tint, mid] = voice.colors;
  // The seed decides where the lights sit, so two voices with similar colours
  // still read as two spheres. Kept to whole percents; it is decoration, not
  // arithmetic anybody depends on.
  const angle = voice.seed % 360;
  const x = 24 + (voice.seed % 23);
  const y = 18 + (voice.seed % 17);

  return (
    <span
      className={`voiceorb ${elevated ? "voiceorb--big" : ""}`}
      style={{
        width: size,
        height: size,
        background: [
          `radial-gradient(60% 55% at ${x}% ${y}%, ${tint} 0%, rgba(255,255,255,0) 62%)`,
          `radial-gradient(70% 65% at ${100 - x}% ${100 - y}%, ${third} 0%, rgba(255,255,255,0) 68%)`,
          `linear-gradient(${angle}deg, ${base} 0%, ${mid} 52%, ${second} 100%)`,
        ].join(", "),
      }}
      role="img"
      aria-label={voice.name}
    />
  );
}

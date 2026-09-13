import { type CSSProperties, useEffect, useMemo } from 'react';

import { motion, ORB_GRAIN, shadow } from '../tokens';
import { CLOUD_ORB_TAG, registerCloudOrb } from './cloudOrbElement';
import { orbIdentity } from './palette';

/**
 * An agent's orb, at a size.
 *
 * The motion a person sees on a small orb is this wrapper's scale pulse,
 * not the shader — which is why a small orb losing its WebGL context to
 * the budget still looks alive. The shader's own motion is the slow drift
 * of the clouds, and it only reads at size.
 */

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      [CLOUD_ORB_TAG]: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { colors?: string; seed?: number | string; grain?: number | string };
    }
  }
}

export const OrbMood = {
  /** Waiting. A slow breath, 7.5s. */
  Idle: 'idle',
  /** Speaking. Used on the voice orb only. */
  Speaking: 'speaking',
  /** No motion at all — a row in a list that is already busy enough. */
  Still: 'still',
} as const;
export type OrbMood = typeof OrbMood[keyof typeof OrbMood];

export interface OrbProps {
  /** The agent this orb belongs to. Decides the colours and the seed. */
  agentId: string;
  /** Side length in pixels. The design uses 26, 28, 30, 34, 40, 48, 56, 88, 104 and 176. */
  size: number;
  /** A stored or chosen palette, overriding the one derived from the id. */
  paletteId?: string;
  mood?: OrbMood;
  /** Orbs carry a shadow at every size in the design; larger ones carry more. */
  elevated?: boolean;
  className?: string;
  style?: CSSProperties;
  /** For a decorative orb beside a name that already says who this is. */
  label?: string;
}

const animationFor = (mood: OrbMood): string | undefined => {
  if (mood === OrbMood.Idle) {
    return `fsr-orb-idle ${motion.orbIdle.duration} ${motion.orbIdle.easing} infinite`;
  }
  if (mood === OrbMood.Speaking) {
    return `fsr-orb-speak ${motion.orbSpeak.duration} ${motion.orbSpeak.easing} infinite`;
  }
  return undefined;
};

export function Orb({
  agentId,
  size,
  paletteId,
  mood = OrbMood.Idle,
  elevated,
  className,
  style,
  label,
}: OrbProps): JSX.Element {
  useEffect(() => {
    registerCloudOrb();
  }, []);

  const identity = useMemo(
    () => orbIdentity(agentId, paletteId),
    [agentId, paletteId],
  );

  // An orb is the agent's face, not a picture of anything. Where a name
  // sits beside it the orb is decorative and says nothing; where it does
  // not, the caller passes a label.
  const aria = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'block',
        boxShadow: elevated ? shadow.orbLarge : shadow.orb,
        animation: animationFor(mood),
        ...style,
      }}
      {...aria}
    >
      <cloud-orb
        colors={identity.colors}
        seed={identity.seed}
        grain={ORB_GRAIN}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

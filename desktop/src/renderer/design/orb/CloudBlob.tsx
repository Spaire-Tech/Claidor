import { type CSSProperties, useId, useMemo } from 'react';

import {
  avatarColors,
  type AvatarIndex,
  avatarSeed,
} from '../../../shared/agent/avatars';

/**
 * `<cloud-blob>` — the agent's face, as a React component.
 *
 * A port of the founder's `cloud-blob.js`
 * (`docs/product/design/cloud-blob.js`), which is a custom element with a
 * shadow root. Ported rather than wrapped for three reasons that matter
 * in a list of agents:
 *
 *  - The element names its gradients with `Math.random()`, so every
 *    re-render draws fresh ids and the SVG is rebuilt from scratch. React
 *    keys them with `useId` and leaves the tree alone.
 *  - Its shape is decided by a seeded generator; the same seed must give
 *    the same cloud on every machine, on every launch. The generator is
 *    the element's, verbatim, and the seed is the avatar's — index × 5 + 2
 *    — so there are exactly twenty-five clouds and each is one face.
 *  - It is pure SVG. No WebGL context, no budget, no eviction; a sidebar
 *    of forty of these costs nothing the sphere's shader would notice.
 *
 * Everything drawn is the element's: the seven puffs around a core
 * ellipse, the gradient top-to-bottom through the avatar's three stops,
 * the highlight and the shade, the two eyes with drifting pupils, the
 * bob, the squish, the blink. Constants are not tidied. The keyframes
 * live in `tokens.css` as `fsr-blob-*` because a `<style>` per blob is
 * the one thing the element did that a page of blobs should not.
 */

export const BlobMood = {
  /** The pupils drift a little. */
  Calm: 'calm',
  /** They drift more — the element's `awake`. */
  Awake: 'awake',
} as const;
export type BlobMood = typeof BlobMood[keyof typeof BlobMood];

export interface CloudBlobProps {
  /** Which of the twenty-five. Decides the colours and the shape. */
  avatar: AvatarIndex;
  /** Side length in pixels. The design uses 26, 28, 34, 38, 40, 56, 76. */
  size: number;
  mood?: BlobMood;
  className?: string;
  style?: CSSProperties;
  /** For a blob beside no name. Otherwise it is decorative. */
  label?: string;
}

/** The element's generator, verbatim: mulberry32 over `seed * 977`. */
function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Lobe { cx: number; cy: number; rr: number }

interface BlobShape {
  lobes: readonly Lobe[];
  bobDur: string;
  blinkDur: string;
  driftDur: string;
  delay: string;
}

/** Everything the seed decides, in the order the element draws it from. */
function shapeFor(seed: number): BlobShape {
  const r = rng(Math.round(seed * 977));
  const lobes: Lobe[] = [];
  const n = 7;
  for (let i = 0; i < n; i += 1) {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.34;
    const rad = 38 + r() * 8;
    lobes.push({
      cx: 100 + Math.cos(ang) * rad,
      cy: 104 + Math.sin(ang) * rad * 0.82,
      rr: 27 + r() * 11,
    });
  }
  return {
    lobes,
    bobDur: (3.4 + r() * 1.6).toFixed(2),
    blinkDur: (4.6 + r() * 3.4).toFixed(2),
    driftDur: (5.2 + r() * 2.6).toFixed(2),
    delay: (r() * 2).toFixed(2),
  };
}

export function CloudBlob({
  avatar, size, mood = BlobMood.Calm, className, style, label,
}: CloudBlobProps): JSX.Element {
  const uid = useId().replace(/:/g, '');
  const colors = avatarColors(avatar);
  const shape = useMemo(() => shapeFor(avatarSeed(avatar)), [avatar]);
  const awake = mood === BlobMood.Awake;

  const aria = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  const bob = `fsr-blob-bob ${shape.bobDur}s ease-in-out ${shape.delay}s infinite`;
  const squish = `fsr-blob-squish ${shape.bobDur}s ease-in-out ${shape.delay}s infinite`;
  const blink = (extra: number): string =>
    `fsr-blob-blink ${shape.blinkDur}s ease-in-out ${(Number(shape.delay) + extra).toFixed(2)}s infinite`;
  const drift = `${awake ? 'fsr-blob-drift-awake' : 'fsr-blob-drift'} ${shape.driftDur}s ease-in-out ${shape.delay}s infinite`;
  const shade = `fsr-blob-shade ${shape.bobDur}s ease-in-out ${shape.delay}s infinite`;

  const eye = (cx: number, extraDelay: number): JSX.Element => (
    <g style={{ transformOrigin: `${cx}px 100px`, animation: blink(extraDelay) }}>
      <ellipse cx={cx} cy={100} rx={11.4} ry={14} fill="#fff" />
      <g style={{ animation: drift }}>
        <ellipse cx={cx + 1} cy={101} rx={6.8} ry={8.2} fill="#14181f" />
        <circle cx={cx - 1.6} cy={97} r={1.9} fill="#fff" opacity={0.9} />
      </g>
    </g>
  );

  return (
    <span
      className={className}
      style={{ width: size, height: size, flex: '0 0 auto', display: 'block', ...style }}
      {...aria}
    >
      <svg viewBox="16 26 168 168" style={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden' }}>
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0.25" y2="1">
            {colors.map((c, i) => (
              <stop key={c + i} offset={`${((i / Math.max(colors.length - 1, 1)) * 100).toFixed(0)}%`} stopColor={c} />
            ))}
          </linearGradient>
          <radialGradient id={`hi-${uid}`} cx="0.36" cy="0.24" r="0.52">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`lo-${uid}`} cx="0.62" cy="0.92" r="0.6">
            <stop offset="0%" stopColor="#2a2f3a" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#2a2f3a" stopOpacity={0} />
          </radialGradient>
          <mask id={`m-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
            <g fill="#fff">
              <ellipse cx={100} cy={106} rx={58} ry={48} />
              {shape.lobes.map((lobe, i) => (
                <circle key={i} cx={lobe.cx.toFixed(1)} cy={lobe.cy.toFixed(1)} r={lobe.rr.toFixed(1)} />
              ))}
            </g>
          </mask>
          <filter id={`soft-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={3.2} />
          </filter>
          <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={6} />
          </filter>
        </defs>

        <ellipse
          cx={102} cy={172} rx={46} ry={8} fill="#5b6478"
          filter={`url(#blur-${uid})`}
          style={{ animation: shade }}
        />

        <g style={{ transformOrigin: '100px 150px', animation: `${bob}, ${squish}` }}>
          <g mask={`url(#m-${uid})`} filter={`url(#soft-${uid})`}>
            <rect x={0} y={0} width={200} height={200} fill={`url(#g-${uid})`} />
            <rect x={0} y={0} width={200} height={200} fill={`url(#hi-${uid})`} />
            <rect x={0} y={0} width={200} height={200} fill={`url(#lo-${uid})`} />
          </g>
        </g>

        <g style={{ animation: bob }}>
          {eye(84, 0)}
          {eye(120, 0.04)}
        </g>
      </svg>
    </span>
  );
}

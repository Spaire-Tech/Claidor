import { useId, useMemo } from "react";
import "./blob.css";

/**
 * The agent's face.
 *
 * A port of `desktop/src/renderer/design/orb/CloudBlob.tsx`, which is itself a
 * port of the founder's `cloud-blob.js`. Nothing about the drawing is new: the
 * seven puffs around a core ellipse, the three-stop gradient, the highlight,
 * the shade, the two eyes with drifting pupils, the bob, the squish, the blink.
 * The constants are the canvas's and are not tidied.
 *
 * What changed is the way in. There it takes an avatar index, because the
 * desktop app stored one per agent and the rotation handed them out. Here a bot
 * is a string id from the backend, so the id is hashed to an index — the same
 * `avatarFallback` hash, moved across. The moment Caisra stores a chosen face,
 * this takes the stored index instead and the hash goes back to being a
 * fallback.
 */

/** The twenty-five gradients, exactly as the founder's canvas has them. */
const AVATARS: readonly string[] = [
  "#8fd3f4,#b9c4ee,#f7b2d9",
  "#a8e6cf,#c9e9a8,#f3e6a0",
  "#cdbdf5,#e3c2ee,#f9cfd6",
  "#ffd79a,#ffbfa3,#f7a3b4",
  "#9fe0e6,#9cc2ef,#b0a8ee",
  "#f2e2c9,#eec7a8,#e2a896",
  "#dbe3ee,#bccbdf,#9fb2cb",
  "#ffe3c7,#ffcdb2,#f7bfae",
  "#cfe6b8,#a9d49a,#87c08c",
  "#d8b8dd,#c095bb,#a3789d",
  "#a9c8ff,#8fb6f5,#86d4e8",
  "#ffd899,#f5b06a,#dd8a63",
  "#b4e4d6,#8fd0c6,#6fb9bd",
  "#f5b7e0,#dda5ea,#bd9ce6",
  "#e6e6e8,#cbcbd2,#adaebb",
  "#fdf0b4,#fbdd9d,#f6c6a0",
  "#e3e0bd,#c8c79b,#a9ab81",
  "#f7b6b6,#ef9a9f,#dd7d8c",
  "#cfe4f2,#aecbe2,#8fadc7",
  "#ffd2b0,#fbb6ad,#f2a2bb",
  "#b6cfc2,#93b3ab,#7e93a0",
  "#e0bdf0,#c3bcf2,#a8cdf3",
  "#e7d3c3,#d0b39f,#b4937f",
  "#e6efa8,#d2e58c,#f0d982",
  "#f7a8c4,#f2909e,#f0a785",
];

/** Yodo's face sits outside the twenty-five, and nobody else can wear it. */
const MAIN_COLORS = "#8ec9f0,#a9b8ea,#bfe0f5";
const MAIN_SEED = 22;
const MAIN_ID = "bot-yodo";

/** The desktop app's `avatarFallback`, moved across unchanged. */
function indexFor(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash % AVATARS.length;
}

/** The canvas's generator, verbatim: mulberry32 over `seed * 977`. */
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

interface Lobe {
  cx: number;
  cy: number;
  rr: number;
}

/** Everything the seed decides, in the order the canvas draws it from. */
function shapeFor(seed: number) {
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

/** How many faces there are. The create screen shows all of them. */
export const AVATAR_COUNT = AVATARS.length;

export function Blob({
  seed,
  size,
  label,
  avatar,
}: {
  seed: string;
  size: number;
  label?: string;
  /**
   * A chosen face, 0–24, overriding the one hashed from the id.
   *
   * The hash is a fallback for a bot the backend has not stored a face for.
   * Once somebody picks one on the create screen, this is what they picked,
   * and the face stops changing as they type the name.
   */
  avatar?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const main = avatar === undefined && seed === MAIN_ID;
  const index = avatar ?? indexFor(seed);
  const colors = useMemo(
    () => (main ? MAIN_COLORS : (AVATARS[index] ?? MAIN_COLORS)).split(","),
    [main, index],
  );
  const shape = useMemo(() => shapeFor(main ? MAIN_SEED : index * 5 + 2), [main, index]);

  const bob = `caisra-blob-bob ${shape.bobDur}s ease-in-out ${shape.delay}s infinite`;
  const squish = `caisra-blob-squish ${shape.bobDur}s ease-in-out ${shape.delay}s infinite`;
  const drift = `caisra-blob-drift ${shape.driftDur}s ease-in-out ${shape.delay}s infinite`;
  const blink = (extra: number) =>
    `caisra-blob-blink ${shape.blinkDur}s ease-in-out ${(Number(shape.delay) + extra).toFixed(2)}s infinite`;

  const eye = (cx: number, extraDelay: number) => (
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
      className="blob"
      style={{ width: size, height: size }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <svg viewBox="16 26 168 168">
        <title>{label ?? ""}</title>
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0.25" y2="1">
            {colors.map((colour, i) => (
              <stop
                key={colour}
                offset={`${((i / Math.max(colors.length - 1, 1)) * 100).toFixed(0)}%`}
                stopColor={colour}
              />
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
              {shape.lobes.map((lobe) => (
                <circle
                  key={`${lobe.cx}-${lobe.cy}`}
                  cx={lobe.cx.toFixed(1)}
                  cy={lobe.cy.toFixed(1)}
                  r={lobe.rr.toFixed(1)}
                />
              ))}
            </g>
          </mask>
          <filter id={`soft-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={3.2} />
          </filter>
        </defs>

        <g style={{ transformOrigin: "100px 150px", animation: `${bob}, ${squish}` }}>
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

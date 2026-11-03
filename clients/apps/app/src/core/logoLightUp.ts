// The SimeonLabs logo lighting up (ios/SimeonCore/Sources/SimeonCore/LogoLightUp.swift;
// the founder's video, 11 October 2026, measured frame by frame): nothing
// for 0.2 s; the four petals fade in to the ink at 40% by 1.0 s; a band of
// the full ink crosses them on the diagonal, top left to bottom right,
// twice (from 1.2 s and from 1.9 s, the second a little slower); then the
// whole logo comes to its true colour, the ink, by 2.85 s and stays. The
// Mac's sign-in, and the Windows app's, draw the logo in the ink at
// `logoInk(place, time)` along its diagonal.

/** Its length, in seconds: from here on it is the logo in its ink. */
export const logoLightUpDuration = 2.9

/** The eleven places a drawing samples, 0 to 1 by tenths. */
export const logoPlaces: readonly number[] = Array.from(
  { length: 11 },
  (_, i) => i / 10,
)

function ease(x: number): number {
  const v = Math.min(Math.max(x, 0), 1)
  return v * v * (3 - 2 * v)
}

/** One pass of the band: its brightest line moves from the top left (at `from`) to the bottom right in `across` seconds; sharp in front, a longer fall behind. */
function sweep(place: number, t: number, from: number, across: number): number {
  const x = place - (t - from) / across
  const width = x > 0 ? 0.23 : 0.48
  return 0.92 * Math.exp(-(x * x) / (width * width))
}

/** How much of the ink shows at `place` along the diagonal (0 the top left corner, 1 the bottom right), `time` seconds in. */
export function logoInk(place: number, time: number): number {
  const t = time
  let base: number
  if (t < 0.2) base = 0
  else if (t < 1.0) base = 0.4 * ease((t - 0.2) / 0.8)
  else if (t < 2.38) base = 0.4
  else if (t < 2.85) base = 0.4 + 0.6 * ease((t - 2.38) / 0.47)
  else base = 1
  if (!(base > 0 && base < 1)) return base
  const band = Math.max(
    sweep(place, t, 1.22, 0.31),
    sweep(place, t, 1.876, 0.44),
  )
  return base + (1 - base) * band
}

// The Windows icon, drawn (6 November 2026; the founder: "the window should
// have a bigger logo … inside the white background"). The Mac's icon is a
// tile in macOS's grid: room around it for its shadow, and the mark 60% of
// the picture. On Windows that reads small and odd, so here the white tile
// fills the picture, a hair of grey keeps its edge on a white taskbar, and
// the mark (the same outline as the tray's, src/main/surfaces/picture.ts)
// spans 78% of it. Every size is drawn at its own size, so the small ones
// stay sharp.

/** The tile's proportions and colours, as fractions of the picture. */
export const tile = {
  /** Clear room at each side. */
  margin: 0.02,
  /** The corners' radius, of the tile's side. */
  corner: 0.22,
  /** How much of the tile's side the mark spans. */
  mark: 0.78,
  /** White at the top to the Mac tile's soft grey at the foot. */
  top: [255, 255, 255],
  bottom: [236, 236, 237],
  /** The edge's hair: black at this opacity, this much of the picture wide (one pixel at least). */
  edge: 0.12,
  hair: 1 / 128,
  ink: [0, 0, 0],
}

/** The mark's drawn width in its file's units (its 300-unit box holds it with a little room). */
const markDrawn = 290

/** How much of each pixel a rounded square covers: `inset` from each side of a `size` picture, its corners `radius`, sampled `samples`² times a pixel. */
export function roundedSquare(size, inset, radius, samples = 4) {
  const out = new Float32Array(size * size)
  const low = inset
  const high = size - inset
  const r = Math.max(0, Math.min(radius, (high - low) / 2))
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      let inside = 0
      for (let sy = 0; sy < samples; sy += 1)
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples
          const py = y + (sy + 0.5) / samples
          if (px < low || px > high || py < low || py > high) continue
          const cx = Math.min(Math.max(px, low + r), high - r)
          const cy = Math.min(Math.max(py, low + r), high - r)
          const dx = px - cx
          const dy = py - cy
          if (dx * dx + dy * dy <= r * r) inside += 1
        }
      out[y * size + x] = inside / (samples * samples)
    }
  return out
}

/** The mark's 300-unit box placed so the mark spans `tile.mark` of a tile `side` wide, in the middle of a `size` picture (for `coverage`'s `box`). */
export function markBoxFor(size, side) {
  const across = (tile.mark * side * 300) / markDrawn
  const units = (300 * size) / across
  return { x: 200 - units / 2, y: 200 - units / 2, size: units }
}

/**
 * The icon at one size, as straight RGBA bytes. `markCoverage(size, box)`
 * says how much of each pixel the mark covers (picture.ts's `coverage` over
 * its `markPolygons`).
 */
export function drawIcon(size, markCoverage) {
  const inset = tile.margin * size
  const side = size - 2 * inset
  const radius = tile.corner * side
  const hair = Math.max(1, tile.hair * size)
  const outer = roundedSquare(size, inset, radius)
  const inner = roundedSquare(size, inset + hair, radius - hair)
  const mark = markCoverage(size, markBoxFor(size, side))
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    const t = Math.min(1, Math.max(0, (y + 0.5 - inset) / side))
    const ground = tile.top.map((top, c) => top + (tile.bottom[c] - top) * t)
    for (let x = 0; x < size; x += 1) {
      const at = y * size + x
      const a = outer[at]
      if (a <= 0) continue
      // The hair: the part of the tile outside its inner square, darkened a little.
      const ring = Math.max(0, a - inner[at]) / a
      const m = Math.min(1, mark[at])
      for (let c = 0; c < 3; c += 1) {
        const edged = ground[c] * (1 - tile.edge * ring)
        rgba[at * 4 + c] = Math.round(edged * (1 - m) + tile.ink[c] * m)
      }
      rgba[at * 4 + 3] = Math.round(a * 255)
    }
  }
  return { width: size, height: size, rgba }
}

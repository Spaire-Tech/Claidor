// The taskbar's number as Windows shows it (`setOverlayIcon`): the Mac's
// Dock badge (DockBadge.swift's `label`: the number in full, never "99+"),
// drawn by the page, which has the fonts, as a small red disc with white
// figures over the corner of Simeon's taskbar button. Windows' overlay is
// 16 points square: drawn at 32 for screens at twice the density, and
// Windows scales it.

/** The Mac's Dock badge red (`systemRed`). */
const badgeRed = '#ff3b30'

/** The overlay's picture for a number, a PNG data URL; undefined for 0, or where nothing can draw (the tests). */
export function badgePicture(count: number, size = 32): string | undefined {
  if (count <= 0 || typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const label = String(count)
  // Two figures fill the disc; more grow it into a pill as wide as the square, the figures smaller.
  let font = Math.round(size * (label.length === 1 ? 0.7 : 0.6))
  const face = (px: number) =>
    `700 ${px}px 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif`
  context.font = face(font)
  const room = size * 0.86
  while (font > 6 && context.measureText(label).width > room) {
    font -= 1
    context.font = face(font)
  }
  const height = label.length <= 2 ? size : Math.round(size * 0.72)
  const top = (size - height) / 2
  context.fillStyle = badgeRed
  context.beginPath()
  context.roundRect(0, top, size, height, height / 2)
  context.fill()
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  // Figures sit a hair high in their box: down by a twentieth to look centred.
  context.fillText(label, size / 2, size / 2 + font * 0.05)
  return canvas.toDataURL('image/png')
}

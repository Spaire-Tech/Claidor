// The Windows app's icon, drawn for Windows (6 November 2026; the founder:
// "the window should have a bigger logo … inside the white background"): a
// white tile that fills the picture, with Simeon's mark across 78% of it
// (scripts/lib/tile.mjs). The mark is the Mac's own outline, the one the
// tray draws (src/main/surfaces/picture.ts, from the Mac's
// MenuBarMark.imageset). Until then this was the Mac's icon as it is, which
// keeps macOS's room for a shadow and reads small on Windows.
//
//   node scripts/make-icon.mjs          (in windows/; writes resources/)
//   node scripts/make-icon.mjs --check  (fails when resources/ isn't what it makes)
//
// - resources/icon.ico: 16, 24, 32, 48, 64, 128 and 256, what Windows draws
//   in Explorer, the taskbar, the Start menu and the installer, each drawn at
//   its own size; the 256 as PNG, the others as bitmaps.
// - resources/icon.png: the 256, for whatever wants a picture.
//
// electron-builder finds icon.ico in resources/ (electron-builder.yml, `win.icon`).

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { bitmapEntry, iconFile } from './lib/icon.mjs'
import { drawIcon } from './lib/tile.mjs'

const here = fileURLToPath(new URL('..', import.meta.url))
const out = path.join(here, 'resources')

/** The mark's outline and its filling, read from the main process's own file (TypeScript, so built here first). */
async function markDrawing() {
  const built = await build({
    entryPoints: [path.join(here, 'src/main/surfaces/picture.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  const source = Buffer.from(built.outputFiles[0].text).toString('base64')
  return import(`data:text/javascript;base64,${source}`)
}

const picture = await markDrawing()
const polygons = picture.markPolygons(picture.markPath, 24)
const markCoverage = (size, box) => picture.coverage(polygons, size, box)

const sizes = [16, 24, 32, 48, 64, 128, 256]

/** A drawn picture as PNG bytes. */
function png(image) {
  return picture.encodePNG(image.width, image.height, (x, y) => {
    const at = (y * image.width + x) * 4
    return [image.rgba[at], image.rgba[at + 1], image.rgba[at + 2], image.rgba[at + 3]]
  })
}

const drawn = new Map(sizes.map((size) => [size, drawIcon(size, markCoverage)]))
const big = png(drawn.get(256))
const entries = sizes.map((size) => ({
  size,
  data: size === 256 ? big : bitmapEntry(drawn.get(size)),
}))

const made = {
  'icon.ico': iconFile(entries),
  'icon.png': big,
}

if (process.argv.includes('--check')) {
  const stale = Object.entries(made).filter(([name, bytes]) => {
    try {
      return !readFileSync(path.join(out, name)).equals(bytes)
    } catch {
      return true
    }
  })
  if (stale.length > 0) {
    console.error(`Not what the script draws: ${stale.map(([name]) => `resources/${name}`).join(', ')}. Run node scripts/make-icon.mjs.`)
    process.exit(1)
  }
  console.log('resources/icon.ico and icon.png are the drawn Windows icon.')
} else {
  for (const [name, bytes] of Object.entries(made)) writeFileSync(path.join(out, name), bytes)
  console.log(`Wrote resources/icon.ico (${sizes.join(', ')}) and resources/icon.png.`)
}

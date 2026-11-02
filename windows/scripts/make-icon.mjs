// The Windows app's icon, from the Mac app's own (mac/Simeon/Assets.xcassets/
// MacIcon.appiconset), so both apps show the same tile:
//
//   node scripts/make-icon.mjs          (in windows/; writes resources/)
//   node scripts/make-icon.mjs --check  (fails when resources/ isn't what it makes)
//
// - resources/icon.ico: 16, 24, 32, 48, 64, 128 and 256, what Windows draws
//   in Explorer, the taskbar, the Start menu and the installer. The Mac's own
//   16, 32, 64 (32@2x) and 128 are taken as they are; 24 and 48, which the Mac
//   has none of, are averaged down from its 256; 256 is the Mac's PNG itself.
// - resources/icon.png: the Mac's 256, for whatever wants a picture.
//
// electron-builder finds icon.ico in resources/ (electron-builder.yml, `win.icon`).

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bitmapEntry, decodePNG, downscale, iconFile } from './lib/icon.mjs'

const here = fileURLToPath(new URL('..', import.meta.url))
const set = path.resolve(here, '../mac/Simeon/Assets.xcassets/MacIcon.appiconset')
const out = path.join(here, 'resources')
const read = (name) => readFileSync(path.join(set, name))

/** Each size and where it comes from: the Mac's picture at that size, or its 256 drawn smaller. */
const sizes = [
  { size: 16, from: 'icon_16x16.png' },
  { size: 24, scaled: 'icon_256x256.png' },
  { size: 32, from: 'icon_32x32.png' },
  { size: 48, scaled: 'icon_256x256.png' },
  { size: 64, from: 'icon_32x32@2x.png' },
  { size: 128, from: 'icon_128x128.png' },
  { size: 256, png: 'icon_256x256.png' },
]

const entries = sizes.map(({ size, from, scaled, png }) => {
  if (png) {
    const image = decodePNG(read(png))
    if (image.width !== size || image.height !== size) throw new Error(`${png} is not ${size} square.`)
    return { size, data: read(png) }
  }
  const image = from ? decodePNG(read(from)) : downscale(decodePNG(read(scaled)), size)
  if (image.width !== size || image.height !== size) throw new Error(`${from ?? scaled} gives no ${size} square.`)
  return { size, data: bitmapEntry(image) }
})

const made = {
  'icon.ico': iconFile(entries),
  'icon.png': read('icon_256x256.png'),
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
    console.error(`Not what the Mac's icon makes: ${stale.map(([name]) => `resources/${name}`).join(', ')}. Run node scripts/make-icon.mjs.`)
    process.exit(1)
  }
  console.log("resources/icon.ico and icon.png are the Mac's icon.")
} else {
  for (const [name, bytes] of Object.entries(made)) writeFileSync(path.join(out, name), bytes)
  console.log(`Wrote resources/icon.ico (${sizes.map((s) => s.size).join(', ')}) and resources/icon.png.`)
}

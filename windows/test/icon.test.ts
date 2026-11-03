// The Windows icon (scripts/make-icon.mjs) is the Mac's: its own pictures in
// the sizes it has, the others averaged down, in a file Windows reads.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bitmapEntry,
  decodePNG,
  downscale,
  iconFile,
  readIconFile,
} from '../scripts/lib/icon.mjs'

const windows = path.resolve(__dirname, '..')
const macIcons = path.resolve(windows, '../mac/Simeon/Assets.xcassets/MacIcon.appiconset')

describe('the icon', () => {
  it('reads the Mac’s pictures', () => {
    const image = decodePNG(readFileSync(path.join(macIcons, 'icon_16x16.png')))
    expect([image.width, image.height, image.rgba.length]).toEqual([16, 16, 16 * 16 * 4])
    // The tile's corner all but clear (Xcode's 1), its middle opaque.
    expect(image.rgba[3]).toBe(1)
    expect(image.rgba[(8 * 16 + 8) * 4 + 3]).toBe(255)
    expect(() => decodePNG(Buffer.from('not a picture'))).toThrow()
  })

  it('averages down by opacity, so clear edges don’t darken', () => {
    const half = downscale(
      { width: 2, height: 2, rgba: Uint8Array.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]) },
      1,
    )
    expect(Array.from(half.rgba)).toEqual([255, 0, 0, 128])
    const big = decodePNG(readFileSync(path.join(macIcons, 'icon_256x256.png')))
    const small = downscale(big, 48)
    expect([small.width, small.height]).toEqual([48, 48])
    // Across its middle row: clear at the ends, the tile's edge soft over three pixels, then opaque.
    const row = Array.from({ length: 48 }, (_, x) => small.rgba[(24 * 48 + x) * 4 + 3])
    expect(row.slice(0, 4)).toEqual([1, 6, 106, 255])
    expect(row.slice(44)).toEqual([255, 106, 6, 1])
    expect(small.rgba[3]).toBe(0)
  })

  it('writes each size as Windows reads it, and reads it back', () => {
    const image = { width: 2, height: 2, rgba: Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 0, 7, 8, 9, 255, 10, 11, 12, 128]) }
    const entry = bitmapEntry(image)
    // The header (40), 2 × 2 × 4 bytes bottom row first in BGRA, then the mask (4 a row).
    expect(entry.readInt32LE(4)).toBe(2)
    expect(entry.readInt32LE(8)).toBe(4)
    expect(entry.readUInt16LE(14)).toBe(32)
    expect(Array.from(entry.subarray(40, 48))).toEqual([9, 8, 7, 255, 12, 11, 10, 128])
    expect(entry.subarray(56, 64).readUInt8(4)).toBe(0x40)
    const file = iconFile([{ size: 2, data: entry }])
    expect(readIconFile(file)).toMatchObject([{ size: 2, bitCount: 32, png: false }])
  })

  it('in the repository is what the script makes from the Mac’s icon', () => {
    const entries = readIconFile(readFileSync(path.join(windows, 'resources/icon.ico')))
    expect(entries.map((e) => e.size)).toEqual([16, 24, 32, 48, 64, 128, 256])
    const big = entries.at(-1)
    expect(big?.png).toBe(true)
    expect(big?.body.equals(readFileSync(path.join(macIcons, 'icon_256x256.png')))).toBe(true)
    // The Mac's own 16, pixel for pixel.
    const sixteen = decodePNG(readFileSync(path.join(macIcons, 'icon_16x16.png')))
    expect(entries[0]?.body.equals(bitmapEntry(sixteen))).toBe(true)
    execFileSync(process.execPath, [path.join(windows, 'scripts/make-icon.mjs'), '--check'], {
      stdio: 'pipe',
    })
  })
})

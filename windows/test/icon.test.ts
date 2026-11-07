// The Windows icon (scripts/make-icon.mjs), drawn for Windows since 6
// November 2026: a white tile that fills the picture with Simeon's mark
// across 78% of it (scripts/lib/tile.mjs), each size drawn at its own size,
// in a file Windows reads. The PNG reader and the averaging below stay for
// reading the Mac's pictures.

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
import { markBoxFor, roundedSquare, tile } from '../scripts/lib/tile.mjs'

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

  it('in the repository is what the script draws for Windows', () => {
    const entries = readIconFile(readFileSync(path.join(windows, 'resources/icon.ico')))
    expect(entries.map((e) => e.size)).toEqual([16, 24, 32, 48, 64, 128, 256])
    const big = entries.at(-1)
    expect(big?.png).toBe(true)
    expect(big?.body.equals(readFileSync(path.join(windows, 'resources/icon.png')))).toBe(true)
    execFileSync(process.execPath, [path.join(windows, 'scripts/make-icon.mjs'), '--check'], {
      stdio: 'pipe',
    })
    // Every icon and Store picture drawn again: 5.3 s on the Dell.
  }, 60_000)

  it('fills the picture with the tile, the mark big inside it', () => {
    const image = decodePNG(readFileSync(path.join(windows, 'resources/icon.png')))
    const at = (x: number, y: number) => Array.from(image.rgba.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4))
    // The corner clear, the edge's middle opaque (no macOS room for a shadow), the middle white.
    expect(at(0, 0)[3]).toBe(0)
    expect(at(8, 128)[3]).toBe(255)
    expect(at(128, 8)[3]).toBe(255)
    // The mark's ink spans about 78% of the tile (the Mac's icon: 68% of a smaller tile).
    let left = 256
    let right = -1
    for (let y = 0; y < 256; y += 1)
      for (let x = 0; x < 256; x += 1) {
        const [r, g, b, a] = at(x, y)
        if (a! > 200 && r! < 60 && g! < 60 && b! < 60) {
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
    const tileSide = 256 * (1 - 2 * tile.margin)
    expect((right - left + 1) / tileSide).toBeGreaterThan(0.74)
    expect((right - left + 1) / tileSide).toBeLessThan(0.8)
  })

  it('draws a rounded square with smooth edges', () => {
    const square = roundedSquare(20, 2, 4)
    expect(square[0]).toBe(0)
    expect(square[10 * 20 + 10]).toBe(1)
    // The edge pixel half covered, the corner cut round.
    expect(square[10 * 20 + 2]).toBeGreaterThan(0.9)
    expect(square[2 * 20 + 2]).toBeLessThan(0.5)
    const box = markBoxFor(256, 240)
    expect(box.x + box.size / 2).toBeCloseTo(200)
  })
})

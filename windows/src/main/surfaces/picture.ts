// Simeon's mark for Windows' tray and the menus' small pictures, drawn here
// from the Mac's own (mac/Simeon/Assets.xcassets/MenuBarMark.imageset,
// `menubar-mark.svg`: a template, which macOS draws in the menu bar's ink).
// Windows' tray wants a picture per screen density in the taskbar's own ink
// (black on a light taskbar, white on a dark one), so the path is filled
// here at each size, with its even-odd rule and smooth edges, and written as
// PNG. Nothing of Electron: the tests run it in Node.

import { deflateSync } from 'node:zlib'

/** The mark's outline, as the Mac's file has it (its `d`; the tests compare them). */
export const markPath = [
  'M107.96 341.69C105.53 341.37 102.92 340.96 102.15 340.79C96.58 339.52 95.93 339.34 92.86 ',
  '338.24C92.35 338.06 90.26 337.09 88.21 336.09C76.27 330.27 66.15 320.22 61.31 309.38C59.27 ',
  '304.79 59.25 304.75 58.27 301.03C56.22 293.22 55.82 289.67 56.04 280.85C56.23 273.36 56.41 ',
  '271.85 57.7 266.88C59.33 260.6 59.04 261.36 62.65 253.87C70.31 237.98 83.85 223.93 101.69 ',
  '213.36C104.36 211.78 114.5 206.7 114.99 206.7C115.22 206.7 116.29 206.29 117.38 205.79C118.46 ',
  '205.29 121.23 204.27 123.54 203.53C128.16 202.05 130.73 200.86 130.73 200.22C130.73 199.33 ',
  '127.94 197.87 124.41 196.91C119.72 195.63 111.11 192.22 106.33 189.74C93.64 183.17 84.5 175.94 ',
  '74.02 164.18C69.54 159.17 63.66 149.42 60.55 141.88C54.07 126.21 54.36 105.58 61.26 90.73C65.64 ',
  '81.29 72.45 73.22 80.78 67.6C84.81 64.88 90.71 61.73 91.78 61.73C92.14 61.73 92.64 61.56 92.88 ',
  '61.36C94.45 60.05 103.19 58.21 110.98 57.56C117.28 57.03 128.39 57.82 133.24 59.15C148.31 63.26 ',
  '162.66 71.83 174.87 84.02C185.61 94.73 192.04 104.2 197.19 116.89C198.04 118.99 199.03 120.82 ',
  '199.4 120.96C200.35 121.32 202.48 118.82 203.17 116.54C204.01 113.74 208.2 105.83 211.69 ',
  '100.46C224.66 80.48 244.9 65 265.25 59.5C277.05 56.31 293.35 56.69 304.28 60.42C305.77 60.92 ',
  '306.12 61.06 310.09 62.66C319.33 66.4 329.17 75.08 334.83 84.5C339.64 92.47 341.99 99.79 343.11 ',
  '110.28C346.13 138.38 329.89 166.14 299.6 184.65C295.57 187.11 284.6 192.75 283.81 192.76C283.54 ',
  '192.76 282.47 193.17 281.43 193.67C280.4 194.17 277.17 195.35 274.26 196.29C271.35 197.22 268.79 ',
  '198.15 268.57 198.35C268.36 198.55 268.31 199.12 268.47 199.63C268.7 200.34 270.33 201.06 275.6 ',
  '202.77C279.36 204 282.64 205.17 282.88 205.38C283.13 205.6 283.64 205.77 284.02 205.77C285.38 ',
  '205.77 297.16 211.87 302.53 215.36C321.89 227.91 335.9 245.75 341.15 264.55C344.43 276.26 344.24 ',
  '290.99 340.67 302.42C335.84 317.91 324.99 329.93 309.39 337.06C296.84 342.8 276.66 343.89 263.59 ',
  '339.53C262.17 339.06 260.76 338.67 260.45 338.67C258.97 338.67 248.14 333.3 242.84 329.94C236.45 ',
  '325.89 231.71 322.06 225.73 316.13C219.25 309.71 216.21 305.98 211.43 298.62C207.66 292.79 ',
  '204.97 287.65 203.02 282.55C201.78 279.3 200.56 277.93 199.32 278.41C199.01 278.53 198.16 280.16 ',
  '197.43 282.04C195.41 287.26 192.01 293.81 188.8 298.71C174.88 319.89 150.84 337.25 130.27 ',
  '340.96C122.23 342.41 115.15 342.64 107.96 341.69ZM123.3 314.72C139.48 313.27 157.05 301.52 ',
  '168.79 284.3C172.06 279.5 178.13 268.49 178.13 267.34C178.13 267.21 178.53 266.21 179.03 ',
  '265.13C180.81 261.23 183.78 251.11 184.58 246.2C185.85 238.39 186.02 235.7 186.02 224.44C186.02 ',
  '214.32 185.91 212.3 185.33 211.82C184.42 211.06 164.54 211.42 161.17 212.25C159.89 212.57 158.21 ',
  '212.99 157.45 213.19C144.7 216.49 132.96 221.81 121.41 229.51C116.48 232.8 107.98 239.73 105.15 ',
  '242.77C95.08 253.59 90.5 261.43 87.56 272.92C86.41 277.41 86.61 287.89 87.96 293.13C88.96 297.04 ',
  '92.07 302.73 94.84 305.73C97.69 308.81 102.36 312.04 105.41 313.03C106.43 313.36 107.68 313.82 ',
  '108.19 314.05C109.66 314.71 115.41 315.37 117.95 315.17C119.23 315.07 121.63 314.86 123.3 ',
  '314.72ZM286.26 314.93C291.44 314.2 296.07 312.5 299.64 310.03C302.02 308.37 306.9 303 308.16 ',
  '300.63C313.5 290.62 314.08 277.96 309.75 266.41C308.36 262.71 305.41 256.97 303.66 254.56C297.67 ',
  '246.33 295.97 244.37 290.22 239.12C277.68 227.66 257.87 217.03 242.02 213.24C240.74 212.94 ',
  '238.96 212.51 238.07 212.28C235.47 211.64 230.03 211.27 222.15 211.21C215.76 211.16 214.73 ',
  '211.25 214.02 211.96C213.32 212.66 213.18 213.96 213.04 221.47C212.66 240.91 215.59 254.67 ',
  '223.54 270.83C235.82 295.76 254.72 311.72 275.47 314.71C281.02 315.5 282.01 315.52 286.26 ',
  '314.93ZM184.6 188.06L186.1 187.54L185.86 173.77C185.57 156.36 185.06 152.61 181.63 142.29C179.54 ',
  '135.99 179.73 136.47 176.55 129.86C171.23 118.82 166.14 111.52 158.16 103.5C151.12 96.42 146.83 ',
  '93.29 139.09 89.55C132.12 86.18 129.49 85.41 121.74 84.49C117.32 83.96 113.67 84.18 108.89 ',
  '85.26C105.32 86.08 104.51 86.43 100.49 88.99C96.95 91.25 94.74 93.56 91.97 97.9C88.14 103.88 ',
  '86.91 108.69 86.9 117.72C86.89 126.39 88.23 132.08 92.07 139.56C99.85 154.75 114.12 167.93 ',
  '133.05 177.45C139.19 180.53 140.44 181.08 144.9 182.7C151.18 184.96 153.63 185.65 160.93 ',
  '187.16C167.2 188.45 181.86 189.01 184.6 188.06ZM235.05 187.71C236.58 187.44 238.98 187.02 240.39 ',
  '186.78C243.26 186.27 253.23 183.31 255.72 182.22C256.62 181.83 257.77 181.35 258.28 ',
  '181.14C269.89 176.41 283.14 167.9 291.9 159.54C303.03 148.91 309.3 138.5 311.7 126.65C313.24 ',
  '119.03 313.12 114.33 311.18 106.61C308.75 96.94 301.24 88.77 291.97 85.72C286.86 84.04 277.53 ',
  '83.93 271.29 85.46C251.69 90.28 234.59 105.76 223.08 129.1C215.59 144.28 212.97 156.48 212.98 ',
  '176.07C212.99 186.22 213.25 187.63 215.21 188.1C217.01 188.52 232.08 188.23 235.05 187.71Z ',]
  .join('')
  .trim()

/** The Mac's file's view box: the mark fills 300 × 300 from (50, 50). */
export const markBox = { x: 50, y: 50, size: 300 }

type Point = [number, number]

/** The outline as closed polygons, each curve cut into straight steps. */
export function markPolygons(d: string = markPath, steps = 12): Point[][] {
  const tokens = d.match(/[MCLZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []
  const polygons: Point[][] = []
  let current: Point[] = []
  let at: Point = [0, 0]
  let index = 0
  const number = () => Number(tokens[index++])
  while (index < tokens.length) {
    const command = tokens[index++]
    switch (command) {
      case 'M':
        if (current.length > 0) polygons.push(current)
        at = [number(), number()]
        current = [at]
        break
      case 'L':
        at = [number(), number()]
        current.push(at)
        break
      case 'C': {
        const c1: Point = [number(), number()]
        const c2: Point = [number(), number()]
        const end: Point = [number(), number()]
        const from = at
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps
          const u = 1 - t
          current.push([
            u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
            u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
          ])
        }
        at = end
        break
      }
      case 'Z':
        if (current.length > 0) polygons.push(current)
        current = []
        break
      default:
        throw new Error(`The mark's path has a command this does not draw: ${command}`)
    }
  }
  if (current.length > 0) polygons.push(current)
  return polygons
}

/**
 * How much of each pixel the polygons cover (0 to 1), by the even-odd rule:
 * `rows` lines across each pixel, each line's spans measured exactly.
 */
export function coverage(
  polygons: readonly Point[][],
  size: number,
  box = markBox,
  rows = 16,
): Float32Array {
  const scale = size / box.size
  const edges: [number, number, number, number][] = []
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i]!
      const b = polygon[(i + 1) % polygon.length]!
      edges.push([
        (a[0] - box.x) * scale,
        (a[1] - box.y) * scale,
        (b[0] - box.x) * scale,
        (b[1] - box.y) * scale,
      ])
    }
  }
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y += 1) {
    for (let row = 0; row < rows; row += 1) {
      const line = y + (row + 0.5) / rows
      const crossings: number[] = []
      for (const [x0, y0, x1, y1] of edges) {
        if (y0 <= line === y1 <= line) continue
        crossings.push(x0 + ((line - y0) / (y1 - y0)) * (x1 - x0))
      }
      crossings.sort((a, b) => a - b)
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, crossings[i]!)
        const to = Math.min(size, crossings[i + 1]!)
        for (let x = Math.floor(from); x < Math.ceil(to); x += 1) {
          const covered = Math.min(to, x + 1) - Math.max(from, x)
          if (covered > 0) out[y * size + x]! += covered / rows
        }
      }
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i] = Math.min(1, out[i]!)
  return out
}

/** A colour as red, green, blue (0 to 255). */
export type RGB = [number, number, number]

export function rgb(hex: string): RGB {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) as RGB
}

/** A square picture being drawn: straight (not premultiplied) colour and alpha, 0 to 1. */
export class Canvas {
  readonly pixels: Float32Array

  constructor(readonly size: number) {
    this.pixels = new Float32Array(size * size * 4)
  }

  /** Paints a colour over the picture where `mask` covers (source over). */
  paint(mask: Float32Array, colour: RGB, opacity = 1): void {
    for (let i = 0; i < mask.length; i += 1) {
      const a = mask[i]! * opacity
      if (a <= 0) continue
      const at = i * 4
      const below = this.pixels[at + 3]!
      const alpha = a + below * (1 - a)
      for (let c = 0; c < 3; c += 1) {
        const top = colour[c]! / 255
        this.pixels[at + c] =
          (top * a + this.pixels[at + c]! * below * (1 - a)) / alpha
      }
      this.pixels[at + 3] = alpha
    }
  }

  /** Takes the picture away where `mask` covers. */
  clear(mask: Float32Array): void {
    for (let i = 0; i < mask.length; i += 1)
      this.pixels[i * 4 + 3] = this.pixels[i * 4 + 3]! * (1 - mask[i]!)
  }

  /** The picture as PNG (8 bits a channel, with alpha). */
  png(): Buffer {
    return encodePNG(this.size, this.size, (x, y) => {
      const at = (y * this.size + x) * 4
      return [0, 1, 2, 3].map((c) =>
        Math.round(Math.max(0, Math.min(1, this.pixels[at + c]!)) * 255),
      ) as [number, number, number, number]
    })
  }
}

/** A disc's coverage on a square of `size`: centre and radius in pixels, smooth edged. */
export function disc(size: number, cx: number, cy: number, radius: number): Float32Array {
  const out = new Float32Array(size * size)
  const samples = 4
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      let inside = 0
      for (let sy = 0; sy < samples; sy += 1)
        for (let sx = 0; sx < samples; sx += 1) {
          const dx = x + (sx + 0.5) / samples - cx
          const dy = y + (sy + 0.5) / samples - cy
          if (dx * dx + dy * dy <= radius * radius) inside += 1
        }
      out[y * size + x] = inside / (samples * samples)
    }
  return out
}

// MARK: PNG

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const body = Buffer.concat([head.subarray(4), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([head.subarray(0, 4), body, tail])
}

/** A PNG of `width` × `height`, each pixel's red, green, blue and alpha from `pixel`. */
export function encodePNG(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let at = 0
  for (let y = 0; y < height; y += 1) {
    raw[at++] = 0
    for (let x = 0; x < width; x += 1) for (const value of pixel(x, y)) raw[at++] = value
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ])
}

// MARK: The pictures

/** The densities Windows draws the tray at (100 % to 300 %), each a picture of its own. */
export const trayScales = [1, 1.25, 1.5, 2, 2.5, 3] as const

/** The taskbar's ink: near black on a light taskbar, white on a dark one (as Windows' own tray icons). */
export const trayInk = { light: '#1a1a1a', dark: '#ffffff' } as const

/** The Mac's Dock badge red (`systemRed`), for the mark's unread dot. */
export const unreadRed = '#ff3b30'

/**
 * The tray's mark at one size, in the taskbar's ink; with `unread`, the
 * Dock's red dot over its lower right corner (the window may be hidden,
 * and with it the taskbar button and its number), cut out of the mark by a
 * clear ring so it reads against it.
 */
export function trayMark(
  size: number,
  dark: boolean,
  unread: boolean,
  polygons: readonly Point[][] = markPolygons(),
): Buffer {
  const canvas = new Canvas(size)
  canvas.paint(coverage(polygons, size), rgb(dark ? trayInk.dark : trayInk.light))
  if (unread) {
    const radius = size * 0.23
    const centre = size - radius - size * 0.02
    canvas.clear(disc(size, centre, centre, radius + Math.max(1, size * 0.07)))
    canvas.paint(disc(size, centre, centre, radius), rgb(unreadRed))
  }
  return canvas.png()
}

/** A menu item's unread mark (`circle.fill` in the Mac's menu): a disc in the menu's ink, 16 points square. */
export function menuDot(size: number, ink: string): Buffer {
  const canvas = new Canvas(size)
  canvas.paint(disc(size, size / 2, size / 2, size * 0.22), rgb(ink))
  return canvas.png()
}

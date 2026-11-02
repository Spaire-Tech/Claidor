// Windows' icon file (.ico) from the Mac's own icon pictures, with nothing
// but Node: the PNGs read (8-bit RGBA, as Xcode's are), the sizes Windows
// wants that the Mac has none of drawn smaller by averaging, and each size
// written as Windows reads it (32-bit pictures under 256, PNG at 256).

import { inflateSync } from 'node:zlib'

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A PNG's pixels: 8-bit RGBA, not interlaced (the Mac's icon set); anything else is refused. */
export function decodePNG(bytes) {
  const data = Buffer.from(bytes)
  if (!signature.every((byte, index) => data[index] === byte)) throw new Error('Not a PNG.')
  let offset = 8
  let width = 0
  let height = 0
  const compressed = []
  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    const type = data.toString('latin1', offset + 4, offset + 8)
    const body = data.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [depth, colour, , , interlace] = body.subarray(8, 13)
      if (depth !== 8 || colour !== 6 || interlace !== 0)
        throw new Error('Only 8-bit RGBA PNGs without interlacing are read.')
    } else if (type === 'IDAT') compressed.push(body)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (width === 0 || height === 0) throw new Error('The PNG has no size.')
  const raw = inflateSync(Buffer.concat(compressed))
  const stride = width * 4
  const rgba = new Uint8Array(width * height * 4)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4] : 0
      const b = previous[x]
      const c = x >= 4 ? previous[x - 4] : 0
      let value = line[x]
      switch (filter) {
        case 0:
          break
        case 1:
          value += a
          break
        case 2:
          value += b
          break
        case 3:
          value += (a + b) >> 1
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default:
          throw new Error(`Unknown PNG filter ${filter}.`)
      }
      row[x] = value & 0xff
    }
    rgba.set(row, y * stride)
    previous = row
  }
  return { width, height, rgba }
}

/** One axis of an averaging resize: each new pixel is the mean of the old ones it covers, by how much of each. */
function weights(from, to) {
  const scale = from / to
  return Array.from({ length: to }, (_, index) => {
    const start = index * scale
    const end = start + scale
    const parts = []
    for (let source = Math.floor(start); source < Math.ceil(end); source++) {
      const cover = Math.min(end, source + 1) - Math.max(start, source)
      if (cover > 0) parts.push([source, cover / scale])
    }
    return parts
  })
}

/** The picture drawn smaller, square, averaging with the colours weighted by their opacity (so clear edges don't darken). */
export function downscale(image, size) {
  const { width, height, rgba } = image
  if (size > width || size > height) throw new Error('Only smaller.')
  // Premultiplied, as floats.
  const source = new Float64Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const alpha = rgba[i * 4 + 3] / 255
    source[i * 4] = rgba[i * 4] * alpha
    source[i * 4 + 1] = rgba[i * 4 + 1] * alpha
    source[i * 4 + 2] = rgba[i * 4 + 2] * alpha
    source[i * 4 + 3] = rgba[i * 4 + 3]
  }
  const across = weights(width, size)
  const down = weights(height, size)
  const wide = new Float64Array(size * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < size; x++)
      for (const [sx, weight] of across[x])
        for (let k = 0; k < 4; k++) wide[(y * size + x) * 4 + k] += source[(y * width + sx) * 4 + k] * weight
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0]
      for (const [sy, weight] of down[y])
        for (let k = 0; k < 4; k++) sum[k] += wide[(sy * size + x) * 4 + k] * weight
      const alpha = sum[3]
      const at = (y * size + x) * 4
      out[at + 3] = Math.round(Math.min(255, alpha))
      for (let k = 0; k < 3; k++)
        out[at + k] = alpha > 0 ? Math.round(Math.min(255, (sum[k] * 255) / alpha)) : 0
    }
  return { width: size, height: size, rgba: out }
}

/** A size as Windows' icon files keep it under 256: a 32-bit picture, bottom row first, then the mask (set where it is clear). */
export function bitmapEntry(image) {
  const { width, height, rgba } = image
  const maskStride = Math.ceil(width / 32) * 4
  const pixels = width * height * 4
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(height * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(pixels + maskStride * height, 20)
  const body = Buffer.alloc(pixels)
  const mask = Buffer.alloc(maskStride * height)
  for (let y = 0; y < height; y++) {
    const row = height - 1 - y
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4
      const to = (row * width + x) * 4
      body[to] = rgba[from + 2]
      body[to + 1] = rgba[from + 1]
      body[to + 2] = rgba[from]
      body[to + 3] = rgba[from + 3]
      if (rgba[from + 3] === 0) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return Buffer.concat([header, body, mask])
}

/** The icon file: its sizes, smallest first, each `{ size, data }` (a bitmap entry, or PNG bytes at 256). */
export function iconFile(entries) {
  const head = Buffer.alloc(6 + entries.length * 16)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(entries.length, 4)
  let offset = head.length
  entries.forEach(({ size, data }, index) => {
    const at = 6 + index * 16
    head.writeUInt8(size >= 256 ? 0 : size, at)
    head.writeUInt8(size >= 256 ? 0 : size, at + 1)
    head.writeUInt8(0, at + 2)
    head.writeUInt8(0, at + 3)
    head.writeUInt16LE(1, at + 4)
    head.writeUInt16LE(32, at + 6)
    head.writeUInt32LE(data.length, at + 8)
    head.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...entries.map((entry) => Buffer.from(entry.data))])
}

/** What an icon file holds: each size, where it is, and whether it is a PNG. */
export function readIconFile(bytes) {
  const data = Buffer.from(bytes)
  if (data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) throw new Error('Not an icon file.')
  const count = data.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    const at = 6 + index * 16
    const size = data.readUInt8(at) || 256
    const length = data.readUInt32LE(at + 8)
    const offset = data.readUInt32LE(at + 12)
    const body = data.subarray(offset, offset + length)
    return {
      size,
      bitCount: data.readUInt16LE(at + 6),
      png: signature.every((byte, i) => body[i] === byte),
      body,
    }
  })
}

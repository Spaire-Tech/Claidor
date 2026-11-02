// A picture read for the agent, made small enough (mac/Simeon/MacLocalHands.swift's
// `ImageShrinker`, `resizeImageBufferIfNeeded`): at most 1,024 on its long
// side (a WebP 1,280) and 1 MiB, made a fifth smaller until it fits.
// Electron's `nativeImage` reads PNG and JPEG on every Windows; a picture
// it can't read is given as it is. It writes PNG and JPEG only, so a WebP
// or a GIF made smaller comes back as PNG (the Mac's WebP does too).

import { nativeImage } from 'electron'

const maxBytes = 1024 * 1024

function isWebP(data: Buffer): boolean {
  return data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
}

function isJPEG(data: Buffer): boolean {
  return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
}

export function shrinkImage(data: Buffer): Buffer {
  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) return data
  const { width, height } = image.getSize()
  if (width <= 0 || height <= 0) return data
  const limit = isWebP(data) ? 1280 : 1024
  const longest = Math.max(width, height)
  if (longest <= limit && data.length <= maxBytes) return data
  const jpeg = isJPEG(data)
  const encode = (side: number): Buffer => {
    const smaller =
      width >= height
        ? image.resize({ width: side, quality: 'best' })
        : image.resize({ height: side, quality: 'best' })
    return jpeg ? smaller.toJPEG(85) : smaller.toPNG()
  }
  let side = Math.min(longest, limit)
  let result = encode(side)
  while (result.length > maxBytes && side > 1) {
    side = Math.max(1, Math.round(side * 0.8))
    result = encode(side)
  }
  return result
}

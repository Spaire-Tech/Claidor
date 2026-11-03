// The types of icon.mjs, for the tests (test/icon.test.ts).

export interface Picture {
  width: number
  height: number
  /** Red, green, blue, opacity: four bytes a pixel, the top row first. */
  rgba: Uint8Array
}

export function decodePNG(bytes: Uint8Array): Picture
export function downscale(image: Picture, size: number): Picture
export function bitmapEntry(image: Picture): Buffer
export function iconFile(entries: { size: number; data: Uint8Array }[]): Buffer
export function readIconFile(
  bytes: Uint8Array,
): { size: number; bitCount: number; png: boolean; body: Buffer }[]

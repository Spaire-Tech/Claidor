// The types of tile.mjs, for the tests (test/icon.test.ts).

import type { Picture } from './icon.mjs'

export const tile: {
  margin: number
  corner: number
  mark: number
  top: [number, number, number]
  bottom: [number, number, number]
  edge: number
  hair: number
  ink: [number, number, number]
}

export function roundedSquare(size: number, inset: number, radius: number, samples?: number): Float32Array
export function markBoxFor(size: number, side: number): { x: number; y: number; size: number }
export function drawIcon(
  size: number,
  markCoverage: (size: number, box: { x: number; y: number; size: number }) => Float32Array,
): Picture

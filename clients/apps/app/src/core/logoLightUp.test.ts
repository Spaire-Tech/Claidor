// The shared core's `LogoLightUpTests`: the logo lighting up, checked against
// the founder's video as measured (darkness 0 the ground, 1 the ink; five
// bands along the diagonal).

import { describe, expect, it } from 'vitest'
import { logoInk, logoLightUpDuration, logoPlaces } from './logoLightUp'

const ink = logoInk
const near = (value: number, expected: number, accuracy: number) =>
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(accuracy)

describe('LogoLightUp', () => {
  it('shows nothing, then fades to forty percent', () => {
    expect(ink(0.5, 0.1)).toBe(0)
    near(ink(0.5, 1.0), 0.4, 0.01)
    near(ink(0.1, 1.05), 0.4, 0.01)
    near(ink(0.9, 1.05), 0.4, 0.01)
  })

  it('crosses with the first band from the top left to the bottom right', () => {
    // The video at 1.25 s: 0.95 0.66 0.43 0.40 0.40; at 1.40 s: 0.61 0.79 0.92 0.84 0.45; at 1.50 s: … 0.80 0.96.
    near(ink(0.1, 1.25), 0.95, 0.05)
    near(ink(0.9, 1.25), 0.4, 0.03)
    near(ink(0.5, 1.4), 0.92, 0.05)
    near(ink(0.1, 1.4), 0.61, 0.05)
    near(ink(0.9, 1.5), 0.96, 0.05)
    // Gone again before the second.
    near(ink(0.5, 1.78), 0.4, 0.03)
  })

  it('crosses more slowly with the second band', () => {
    // The video: the brightest at the top left about 1.92 s, at the bottom right about 2.27 s.
    expect(ink(0.1, 1.92)).toBeGreaterThan(0.85)
    expect(ink(0.9, 2.28)).toBeGreaterThan(0.85)
    expect(ink(0.9, 1.92)).toBeLessThan(0.45)
  })

  it('ends in its true colour', () => {
    near(ink(0.5, 2.6), 0.67, 0.1)
    for (const place of logoPlaces) {
      expect(ink(place, 2.85)).toBe(1)
      expect(ink(place, logoLightUpDuration)).toBe(1)
    }
    expect(logoPlaces).toHaveLength(11)
  })
})

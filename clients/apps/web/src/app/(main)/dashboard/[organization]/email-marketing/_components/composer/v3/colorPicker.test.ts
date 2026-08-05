import { describe, expect, it } from 'vitest'

import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  rgbToHex,
  rgbToHsv,
} from './colorPicker'

describe('colour maths', () => {
  it('hex ↔ rgb round-trips and rejects junk', () => {
    expect(hexToRgb('#0066cc')).toEqual([0, 102, 204])
    expect(hexToRgb('0066cc')).toEqual([0, 102, 204])
    expect(hexToRgb('#f00')).toEqual([255, 0, 0]) // shorthand expands
    expect(hexToRgb('nope')).toBeNull()
    expect(hexToRgb('#12')).toBeNull()
    expect(rgbToHex(0, 102, 204)).toBe('#0066cc')
    expect(rgbToHex(300, -5, 128)).toBe('#ff0080') // clamps out-of-range
  })

  it('rgb ↔ hsv maps the canonical hues', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv(0, 255, 0)).toMatchObject({ h: 120, s: 1, v: 1 })
    expect(rgbToHsv(0, 0, 255)).toMatchObject({ h: 240, s: 1, v: 1 })
    expect(rgbToHsv(255, 255, 255)).toMatchObject({ s: 0, v: 1 })
    expect(rgbToHsv(0, 0, 0)).toMatchObject({ s: 0, v: 0 })
  })

  it('hsv → rgb hits primary corners', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 }).map(Math.round)).toEqual([255, 0, 0])
    expect(hsvToRgb({ h: 240, s: 1, v: 1 }).map(Math.round)).toEqual([0, 0, 255])
  })

  it('hex → hsv → hex is stable for the design presets', () => {
    for (const hex of ['#1d1d1f', '#0066cc', '#127c2b', '#c0392b', '#8e44ad']) {
      const hsv = hexToHsv(hex)
      expect(hsv).not.toBeNull()
      expect(hsvToHex(hsv!)).toBe(hex)
    }
  })
})

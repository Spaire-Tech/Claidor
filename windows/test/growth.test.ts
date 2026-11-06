// The window growing for the agent's pane and giving it back (src/main/growth.ts,
// AgentPane.swift's `growWindowIfNeeded` and `shrinkWindowIfGrown`).

import { describe, expect, it } from 'vitest'
import { grownBounds, shrunkBounds } from '../src/main/growth'

const area = { x: 0, y: 0, width: 1920, height: 1040 }

describe('the window growing for the pane', () => {
  it('grows by what is missing, where it is', () => {
    expect(grownBounds({ x: 100, y: 50, width: 900, height: 700 }, area, 92)).toEqual({
      x: 100,
      y: 50,
      width: 992,
      height: 700,
    })
  })

  it('does not grow when nothing is missing', () => {
    const bounds = { x: 100, y: 50, width: 1200, height: 700 }
    expect(grownBounds(bounds, area, 0)).toBeUndefined()
    expect(grownBounds(bounds, area, -40)).toBeUndefined()
    expect(grownBounds(bounds, area, Number.NaN)).toBeUndefined()
  })

  it('moves left to stay on its screen, and is never wider than it', () => {
    expect(grownBounds({ x: 1000, y: 0, width: 800, height: 700 }, area, 300)).toEqual({
      x: 820,
      y: 0,
      width: 1100,
      height: 700,
    })
    expect(grownBounds({ x: 200, y: 0, width: 1800, height: 700 }, area, 400)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 700,
    })
    // Already as wide as its screen: nothing to do.
    expect(grownBounds({ x: 0, y: 0, width: 1920, height: 700 }, area, 100)).toBeUndefined()
  })

  it('keeps to a second screen on the left', () => {
    const left = { x: -1280, y: 0, width: 1280, height: 1000 }
    expect(grownBounds({ x: -900, y: 10, width: 800, height: 600 }, left, 300)).toEqual({
      x: -1100,
      y: 10,
      width: 1100,
      height: 600,
    })
  })

  it('gives back what it grew while the width is still that', () => {
    const grew = { by: 92, widthAfter: 992 }
    expect(shrunkBounds({ x: 100, y: 50, width: 992, height: 700 }, grew)).toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 700,
    })
    expect(shrunkBounds({ x: 100, y: 50, width: 994, height: 700 }, grew)?.width).toBe(902)
    // The person changed the width since: left as it is.
    expect(shrunkBounds({ x: 100, y: 50, width: 1100, height: 700 }, grew)).toBeUndefined()
  })

  it('never gives back below the window’s least width', () => {
    expect(shrunkBounds({ x: 0, y: 0, width: 600, height: 700 }, { by: 300, widthAfter: 600 })?.width).toBe(
      512,
    )
  })
})

// The window growing for the agent's pane, and giving it back as the pane
// closes (AgentPane.swift's `growWindowIfNeeded`, `makeRoomForSidebar`,
// `shrinkWindowIfGrown`): the frames worked out here, without Electron, so
// the tests read them; window.ts moves the window.

import type { Rectangle } from 'electron'

/** The window's least size (window.ts's `smallestSize`): never given back narrower. */
const narrowest = 512

/**
 * The window's frame grown by `missing` across, within its screen's work
 * area: no wider than the area, moved left when its right edge would leave
 * it. Undefined when it would not grow.
 */
export function grownBounds(
  bounds: Rectangle,
  area: Rectangle,
  missing: number,
): Rectangle | undefined {
  if (!(missing > 0)) return undefined
  const width = Math.min(bounds.width + Math.ceil(missing), area.width)
  if (width <= bounds.width) return undefined
  let x = bounds.x
  if (x + width > area.x + area.width) x = Math.max(area.x, area.x + area.width - width)
  return { x, y: bounds.y, width, height: bounds.height }
}

/** What the window grew by for the pane, and its width after: closing gives it back if the width is still that (within 2). */
export interface Grew {
  by: number
  widthAfter: number
}

/** The frame given back on closing, or undefined when the width was changed since the growing. */
export function shrunkBounds(bounds: Rectangle, grew: Grew): Rectangle | undefined {
  if (Math.abs(bounds.width - grew.widthAfter) > 2) return undefined
  return { ...bounds, width: Math.max(narrowest, bounds.width - grew.by) }
}

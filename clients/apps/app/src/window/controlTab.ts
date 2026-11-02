// Control-Tab and Control-Shift-Tab (mac/Simeon/MainWindow.swift's key
// monitor, SidebarState.swift's `cycle` and `step`): a walk through the
// sidebar's rows in its order (the pins, then the list or the open
// sections), a ring on the row it would open; letting go of Control opens
// it, Escape or the window going behind ends the walk. Not behind Settings,
// Connectors or About, not over the computer or search, and only where no
// browser's tabs are around the page (the Windows app): a browser keeps
// Control-Tab for its tabs (keys.ts's `browserAround`).

import { useEffect, useRef, useState } from 'react'
import type { AppStore } from '../core/store'
import { somethingOver } from './Dialogs'
import { browserAround } from './keys'
import { listOrder } from './Sidebar'
import type { WindowModel } from './windowModel'

/** Control-Tab's walk: the row it would open on letting go of Control, and the order it walks, as it was at the first press (`SidebarState.Cycle`). */
export interface Cycle {
  next: string
  order: readonly string[]
}

/**
 * One press of Control-Tab (1) or Control-Shift-Tab (-1) (`step`): the next
 * row after the open one, or after the row it is on, wrapping round; with
 * nothing open, the first (or the last). Nothing with fewer than two rows.
 */
export function cycleStep(
  cycle: Cycle | undefined,
  direction: 1 | -1,
  order: readonly string[],
  current: string | undefined,
): Cycle | undefined {
  const walk = cycle?.order ?? order
  if (walk.length <= 1) return undefined
  const from = cycle?.next ?? current
  const index = from != null ? walk.indexOf(from) : -1
  const next =
    index >= 0
      ? (index + direction + walk.length) % walk.length
      : direction === 1
        ? 0
        : walk.length - 1
  return { next: walk[next]!, order: walk }
}

/** In MainWindow: the walk, its keys, and the row it is on (for the sidebar's ring). */
export function useControlTab(
  store: AppStore,
  model: WindowModel,
  shown: string | undefined,
): string | undefined {
  const [cycle, setCycle] = useState<Cycle>()
  const open = useRef(shown)
  useEffect(() => {
    open.current = shown
  }, [shown])
  useEffect(() => {
    if (browserAround()) return
    let walking: Cycle | undefined
    const set = (next: Cycle | undefined) => {
      walking = next
      setCycle(next)
    }
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && walking) {
        // Escape: Control-Tab's walk first.
        event.preventDefault()
        event.stopPropagation()
        set(undefined)
        return
      }
      if (
        event.key !== 'Tab' ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      )
        return
      // The computer's screen and search keep their keys; not behind Settings, Connectors or About, nor under a sheet.
      if (
        model.computerShowing ||
        model.searchOpen ||
        model.overlayShowing ||
        somethingOver()
      )
        return
      event.preventDefault()
      event.stopPropagation()
      set(
        cycleStep(
          walking,
          event.shiftKey ? -1 : 1,
          listOrder(store),
          open.current,
        ),
      )
    }
    // Control let go: the row opens (`flags`).
    const up = (event: KeyboardEvent) => {
      if (event.key !== 'Control' || !walking) return
      const next = walking.next
      set(undefined)
      model.openChat(next)
    }
    const away = () => set(undefined)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', away)
    }
  }, [store, model])
  return cycle?.next
}

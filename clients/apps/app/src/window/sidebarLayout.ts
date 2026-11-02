// The sidebar's width (mac/Simeon/Sidebar.swift, `SidebarLayout`, as the
// Electron window's `ui-layout` keeps it): 320 at first, dragged between 240
// and 400, its rail 88 wide. It folds to its rail when the person folds it
// (⌘B, or dragging it under 210), and by itself whenever the chat beside it
// would be narrower than 424. Kept in the browser under the Mac's own names.

export const firstWidth = 320
export const narrowest = 240
export const widest = 400
export const railWidth = 88
/** The chat is never narrower than this while the sidebar is open. */
export const chatMinimum = 424
/** Dragged under this, the sidebar folds; folded, it opens again from 10 more. */
export const foldBelow = 210

export interface SidebarSize {
  /** The width when open. */
  expandedWidth: number
  /** Folded to its rail by the person. */
  isCollapsed: boolean
}

/** Shown as its rail: folded, or the window too narrow for it open. */
export function showsRail(size: SidebarSize, windowWidth: number): boolean {
  return size.isCollapsed || windowWidth < size.expandedWidth + chatMinimum
}

export function sidebarWidth(size: SidebarSize, windowWidth: number): number {
  return showsRail(size, windowWidth) ? railWidth : size.expandedWidth
}

/** The edge dragged to `x` from the sidebar's left (`kan`). */
export function dragTo(
  size: SidebarSize,
  x: number,
  windowWidth: number,
): SidebarSize {
  const room = windowWidth - chatMinimum
  const rail = showsRail(size, windowWidth)
  if (rail ? x < foldBelow + 10 || room < foldBelow + 10 : x < foldBelow)
    return rail ? size : { ...size, isCollapsed: true }
  if (room < narrowest) return size
  const width = Math.max(narrowest, Math.min(widest, Math.min(x, room)))
  if (width === size.expandedWidth && !size.isCollapsed) return size
  return { expandedWidth: width, isCollapsed: false }
}

/** ⌘B (Control-B on Windows). */
export function toggled(size: SidebarSize): SidebarSize {
  return { ...size, isCollapsed: !size.isCollapsed }
}

const widthKey = 'simeon.sidebar.width.320'
const collapsedKey = 'simeon.sidebar.collapsed'

/** The width and the fold as this browser kept them; 320 and open at first. */
export function readSize(): SidebarSize {
  try {
    const saved = Number(localStorage.getItem(widthKey))
    return {
      expandedWidth:
        Number.isFinite(saved) && saved > 0
          ? Math.min(Math.max(saved, narrowest), widest)
          : firstWidth,
      isCollapsed: localStorage.getItem(collapsedKey) === 'true',
    }
  } catch {
    return { expandedWidth: firstWidth, isCollapsed: false }
  }
}

export function keepSize(size: SidebarSize): void {
  try {
    localStorage.setItem(widthKey, String(size.expandedWidth))
    localStorage.setItem(collapsedKey, String(size.isCollapsed))
  } catch {
    // A private window, or storage refused: kept for this visit only.
  }
}

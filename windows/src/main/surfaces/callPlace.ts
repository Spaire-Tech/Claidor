// Where the call's own window goes (mac/Simeon/CallBannerWindow.swift): the
// card 360 wide, with clear room around it for its shadow (`margin`), 12
// under the top of the work area of the screen the pointer is on and 16
// from its right (`CallBanner.insetTop`, `insetRight`); its height follows
// the card's, 40 to 480 (78 before the card measures itself), its top kept
// where it is. Nothing of Electron: the tests check the sums.

/** A place on the screens, in Windows' points (Electron's `Rectangle`). */
export interface Place {
  x: number
  y: number
  width: number
  height: number
}

/** Clear room around the card for its shadow (`BANNER_MARGIN`). */
export const callMargin = { top: 10, left: 28, bottom: 46, right: 28 }
/** The card's width and its place on the screen (`CallBanner.width`, `insetTop`, `insetRight`). */
export const callCard = { width: 360, insetTop: 12, insetRight: 16 }
/** The window's height follows the card's, within these (`MIN/MAX_BANNER_HEIGHT`). */
export const callHeights = { least: 40, most: 480, first: 78 }

/** The card's height as the window takes it: rounded up, 40 to 480. */
export function callHeight(asked: number): number {
  return Math.min(callHeights.most, Math.max(callHeights.least, Math.ceil(asked)))
}

/** The window for a card of `cardHeight` on a screen's work area (`frame(for:on:)`). */
export function callFrame(area: Place, cardHeight: number): Place {
  const width = callCard.width + callMargin.left + callMargin.right
  const x =
    area.x + area.width - callCard.insetRight - callCard.width - callMargin.left
  const y = area.y + callCard.insetTop - callMargin.top
  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height: cardHeight + callMargin.top + callMargin.bottom,
  }
}

/** The window grown or shrunk for a card of `cardHeight`, its top where it is (`resize(to:)`). */
export function callResized(frame: Place, cardHeight: number): Place {
  return {
    ...frame,
    height: cardHeight + callMargin.top + callMargin.bottom,
  }
}

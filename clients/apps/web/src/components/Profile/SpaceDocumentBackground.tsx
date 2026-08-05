'use client'

import { useEffect } from 'react'

/**
 * Match the document (html + body) background to the Space theme and disable
 * overscroll bounce.
 *
 * The Space content sits in a `.space-dark` wrapper that paints itself dark, but
 * the browser's root canvas stays white — so rubber-banding past the top/bottom
 * (or content shorter than the viewport) flashes white behind a dark Space.
 * Setting the html/body background + `overscroll-behavior: none` kills that, the
 * same way the course landing page does (PublicPortalView).
 *
 * Mounted in the storefront's (header) layout, so it covers the Space page AND
 * the product pages that share that layout. Restores the previous values on
 * unmount so other routes are unaffected.
 */
export function SpaceDocumentBackground({ dark }: { dark: boolean }) {
  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const bg = dark ? '#0c0c10' : '#ffffff'
    const prev = {
      rootBg: root.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      rootOver: root.style.overscrollBehaviorY,
      bodyOver: body.style.overscrollBehaviorY,
    }
    root.style.backgroundColor = bg
    body.style.backgroundColor = bg
    root.style.overscrollBehaviorY = 'none'
    body.style.overscrollBehaviorY = 'none'
    return () => {
      root.style.backgroundColor = prev.rootBg
      body.style.backgroundColor = prev.bodyBg
      root.style.overscrollBehaviorY = prev.rootOver
      body.style.overscrollBehaviorY = prev.bodyOver
    }
  }, [dark])

  return null
}

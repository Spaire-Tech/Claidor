'use client'

import * as React from 'react'

// Website-style nav: hide the bar when scrolling down, reveal it when
// scrolling back up (and always show it near the very top). The portal shell
// is `min-height: 100vh` with no inner scroll container, so the window is what
// scrolls — we read `window.scrollY`, rAF-throttled to stay smooth. Shared by
// the desktop TopBar and the mobile bottom tab bar.
export function useHideOnScroll(): boolean {
  const [hidden, setHidden] = React.useState(false)
  React.useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    const DELTA = 6 // ignore trackpad/sub-pixel jitter
    const TOP_ZONE = 72 // always reveal near the top of the page
    const update = () => {
      const y = Math.max(0, window.scrollY)
      if (y <= TOP_ZONE) {
        setHidden(false)
      } else if (Math.abs(y - lastY) > DELTA) {
        setHidden(y > lastY) // scrolling down → hide; up → reveal
      }
      lastY = y
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        window.requestAnimationFrame(update)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return hidden
}

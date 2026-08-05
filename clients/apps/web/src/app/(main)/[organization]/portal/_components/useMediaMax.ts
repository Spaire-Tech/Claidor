'use client'

import * as React from 'react'

// Matches CSS `(max-width: <px>px)`. SSR-safe: false on the server and the
// first client render, then syncs to the real viewport. Use the same pixel
// values as portal.css breakpoints (720 for the mobile layout switch).
export function useMediaMax(px: number): boolean {
  const [match, setMatch] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`)
    const update = () => setMatch(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [px])
  return match
}

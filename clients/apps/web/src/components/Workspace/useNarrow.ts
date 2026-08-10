'use client'

/**
 * The design's one breakpoint.
 *
 * `window.innerWidth < 1240`, measured on the window rather than on any
 * container — which matters, because the chat column's own width is one of
 * the things it decides, and a container query on the chat would be
 * circular.
 *
 * It starts **false** and corrects on mount, exactly as the design does.
 * That is not laziness about server rendering: there is no window on the
 * server, and guessing would make the first paint disagree with the second.
 * Starting wide and narrowing is the one order that never renders a layout
 * the viewport contradicts for more than a frame.
 */

import { useEffect, useState } from 'react'

import { NARROW } from './design'

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    // `matchMedia` rather than a resize listener: it fires on the crossing
    // and not on every pixel of a drag, and `max-width: 1239.98px` is the
    // media-query spelling of `innerWidth < 1240` — the .98 because a media
    // query is inclusive and a viewport can be a fraction of a pixel wide
    // on a scaled display.
    const query = window.matchMedia(`(max-width: ${NARROW - 0.02}px)`)
    const read = () => setNarrow(query.matches)
    read()
    query.addEventListener('change', read)
    return () => query.removeEventListener('change', read)
  }, [])

  return narrow
}

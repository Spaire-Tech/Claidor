// The call's own window's page in the Windows app (`facts.window` is "call";
// mac/Simeon/CallBannerWindow.swift): only the banner, as the Mac's panel
// holds only its card, with clear room around it for its shadow (28 each
// side, 10 above, 46 below). The window's size follows the card's (the main
// process keeps its top where it is); it takes clicks only over the card,
// so the clear room never stands in the way of what is under it; Control-W
// on it ends a call that is on, or puts away one that is over (the Mac's
// File › Close Window on the panel). Light and dark as the main window's
// theme, followed as it changes.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../l10n'
import { BannerCard } from '../window/Call'
import { applyTheme, themeKey } from '../window/theme'
import { useWatched } from '../window/useStore'
import { CallMirror } from './callWindow'
import './callWindow.css'
import type { Desktop } from './desktop'
import { keyLetter } from './surfaces'

export function CallWindowPage({ host }: { host: Desktop }) {
  const [mirror] = useState(() => new CallMirror(host))
  useWatched(mirror)
  useEffect(() => mirror.start(), [mirror])
  useEffect(() => {
    document.title = t('Simeon call')
    // The theme chosen in the main window (the same storage): followed as it changes.
    const changed = (event: StorageEvent) => {
      if (event.key === themeKey || event.key === null) applyTheme()
    }
    window.addEventListener('storage', changed)
    // Control-W on it ends a call that is on or puts away one that is over (`closing`); Control-Q quits, whichever window has the keys.
    const keys = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return
      const letter = keyLetter(event)
      if (letter === 'w') {
        event.preventDefault()
        mirror.close()
      } else if (letter === 'q') {
        event.preventDefault()
        void host.call('quit').catch(() => {})
      }
    }
    window.addEventListener('keydown', keys)
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('keydown', keys)
    }
  }, [mirror, host])
  // The main window's zoom reaches this page too (Chromium zooms every page of the app's origin): drawn back at its own size.
  const zoom = mirror.zoom
  useLayoutEffect(() => {
    document.documentElement.style.zoom = zoom === 1 ? '' : String(1 / zoom)
  }, [zoom])
  // The card measured itself: the window follows (`resize`), in Windows' points.
  const room = useRef<HTMLDivElement>(null)
  const call = mirror.call
  const shownId = call?.agentId
  useLayoutEffect(() => {
    const card = room.current?.querySelector<HTMLElement>('.call-banner')
    if (!card) return
    const tell = () =>
      void host
        .call(
          'callWindowHeight',
          // To the hundredth: the zoom's sums leave a trace past it, which would round a point up.
          Math.round(card.getBoundingClientRect().height * mirror.zoom * 100) /
            100,
        )
        .catch(() => {})
    const watch = new ResizeObserver(tell)
    watch.observe(card)
    tell()
    return () => watch.disconnect()
  }, [host, shownId, zoom, mirror])
  return (
    <div ref={room} className="call-window">
      {call && (
        // Its Transcript closed at each call's start.
        <BannerCard
          key={call.agentId}
          store={mirror}
          call={call}
          onPointer={(inside) =>
            void host.call('callWindowPointer', inside).catch(() => {})
          }
        />
      )}
    </div>
  )
}

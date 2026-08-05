import type { Viewport } from 'next'
import React from 'react'

// viewportFit: 'cover' lets the mobile hero break out of the wrapper's
// padding and extend edge-to-edge (and behind the iOS status-bar safe
// area). The hero section uses 100vw + negative margins to achieve
// the visual effect; this just unlocks the safe-area inset so iOS
// allows it.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function ProductDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <style>{`
        [data-profile-card] { display: none !important; }
      `}</style>
      {children}
    </>
  )
}

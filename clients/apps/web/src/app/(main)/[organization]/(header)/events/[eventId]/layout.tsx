import type { Viewport } from 'next'
import React from 'react'

// Mirror the product-detail layout — hide the org profile card so the
// event takes the full canvas. `viewportFit: 'cover'` matches products
// so iOS gives us the same edge-to-edge headroom for the cover image.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function EventDetailLayout({
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

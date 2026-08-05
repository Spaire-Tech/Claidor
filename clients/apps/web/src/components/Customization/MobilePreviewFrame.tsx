'use client'

import React from 'react'

/**
 * iPhone-shaped chrome around the public-Space components.
 *
 *  • 390 × 844 logical (9 : 19.5 aspect ratio), 11 px black bezel
 *  • Dynamic island pill + home-indicator bar
 *  • Inner content clips to a rounded rectangle and scrolls
 *    vertically with native momentum
 *
 * Tailwind's `md:` utilities fire on viewport width, so they'll
 * activate inside this chrome on a desktop browser. The CSS in
 * editor.css (scoped to .mobile-frame-scroll) cancels the
 * layout-affecting `md:` modifiers so the rendering collapses to
 * the real mobile layout.
 */
export const MobilePreviewFrame = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="mobile-frame" aria-label="Mobile preview (iPhone)">
      <div className="mobile-frame-island" aria-hidden />
      <div className="mobile-frame-screen">
        <div className="mobile-frame-scroll">{children}</div>
      </div>
      <div className="mobile-frame-home" aria-hidden />
    </div>
  )
}

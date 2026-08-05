'use client'

// Real mobile preview — an actual <iframe> of the public Space inside an
// iPhone-shaped bezel. Because the iframe has its OWN viewport, the Space's
// real responsive breakpoints (Tailwind `md:` etc.) fire at phone width, so
// this shows the genuine mobile rendering — not a CSS-faked approximation.
//
// The iframe loads the storefront at a SAME-ORIGIN path (`/{slug}`). The
// storefront sends `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'`,
// so it can only be embedded from its own origin — the public vanity domain
// (space.spairehq.com) is a different origin and refuses to be framed. The same
// Next app serves the storefront at `/{slug}` on the editor's origin with no
// redirect, so the relative URL renders the real page and is allowed to frame.

import { schemas } from '@spaire/client'

export const MobileSpacePreview = ({
  organization,
  enabled,
}: {
  organization: schemas['Organization']
  enabled: boolean
}) => {
  const url = `/${organization.slug}/`

  return (
    <div className="mobile-frame" aria-label="Mobile preview of your Space">
      <div className="mobile-frame-island" aria-hidden />
      <div className="mobile-frame-screen">
        {enabled ? (
          <iframe
            key={url}
            src={url}
            title="Mobile preview of your Space"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-sm font-medium text-gray-900">
              Enable your Space to preview it
            </p>
            <p className="text-xs text-gray-500">
              The mobile preview loads your live published Space.
            </p>
          </div>
        )}
      </div>
      <div className="mobile-frame-home" aria-hidden />
    </div>
  )
}

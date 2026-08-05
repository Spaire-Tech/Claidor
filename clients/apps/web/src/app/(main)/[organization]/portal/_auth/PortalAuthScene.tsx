'use client'

import { schemas } from '@spaire/client'
import './portal-auth.css'

/**
 * The persistent shell for the customer portal sign-in flow.
 *
 * Left: the creator's photo (org-level `customer_portal_sign_in_image_url`,
 * which the API already resolves to the most recent course thumbnail when the
 * creator hasn't uploaded one) with the org name top-left. It stays put across
 * every step. Right: the active step (email / code / success), as `children`.
 *
 * Light/dark is the creator's design choice (applied by PortalShell from the
 * org setting) — there's no customer-facing theme toggle here.
 */
export const PortalAuthScene = ({
  organization,
  children,
}: {
  organization: schemas['CustomerOrganization']
  children: React.ReactNode
}) => {
  const imageUrl = organization.customer_portal_sign_in_image_url
  const imagePosition =
    organization.customer_portal_sign_in_image_position ?? undefined

  return (
    <div className="spauth">
      <div
        className="spauth-visual"
        {...(imageUrl ? { 'data-filled': '' } : {})}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="spauth-visual-img"
            src={imageUrl}
            alt=""
            aria-hidden="true"
            style={
              imagePosition ? { objectPosition: imagePosition } : undefined
            }
          />
        )}
        <div className="spauth-scrim" />
        <div className="spauth-brand">{organization.name}</div>
      </div>

      <div className="spauth-panel">
        <div className="spauth-stage">
          <div className="spauth-inner">{children}</div>
        </div>
      </div>
    </div>
  )
}

'use client'

// The portal's single loading treatment — black screen with the blue→white
// gradient ring (styles in portal.css, unscoped so surfaces outside the
// .spaire-portal wrapper can render it too).
//
//   screen — fixed full-viewport black overlay; the portal boot state and
//            cinematic surfaces (lesson viewer, community) use this.
//   inline — same ring centered in the routed area while the portal chrome
//            stays up; page-level fetches (Masterclasses, Overview…) use it.
export const PortalLoading = ({
  variant = 'screen',
}: {
  variant?: 'screen' | 'inline'
}) => (
  <div
    className={`sp-boot${variant === 'inline' ? ' sp-boot--inline' : ''}`}
    role="status"
    aria-label="Loading"
  >
    <span className="sp-boot-ring" aria-hidden />
  </div>
)

export default PortalLoading

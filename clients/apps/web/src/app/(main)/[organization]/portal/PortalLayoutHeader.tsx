'use client'

import { schemas } from '@spaire/client'

// The redesigned customer portal renders its own sticky top bar inside
// PortalShell (`<TopBar />`). The old "logo above content" header is no
// longer needed, but the layout still mounts this component, so keep it
// as a no-op so we don't have to restructure the layout file.
export const PortalLayoutHeader = (_: {
  organization: schemas['CustomerOrganization']
}) => null

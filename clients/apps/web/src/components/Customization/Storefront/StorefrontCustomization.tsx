'use client'

import { schemas } from '@spaire/client'
import { StorefrontLivePreview } from './StorefrontPreview'

export const StorefrontCustomization = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  return <StorefrontLivePreview organization={organization} />
}

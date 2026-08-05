'use client'

import { schemas } from '@claidor/client'
import { StorefrontLivePreview } from './StorefrontPreview'

export const StorefrontCustomization = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  return <StorefrontLivePreview organization={organization} />
}

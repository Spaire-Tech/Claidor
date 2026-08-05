'use client'

import { useProducts } from '@/hooks/queries'
import { schemas } from '@spaire/client'
import { useFormContext } from 'react-hook-form'
import { ProfileCard } from '../../Profile/ProfileCard'

export const StorefrontLivePreview = ({
  organization: org,
}: {
  organization: schemas['Organization']
}) => {
  const { watch } = useFormContext<schemas['OrganizationUpdate']>()
  const organizationUpdate = watch()
  const storefrontSettings = watch('storefront_settings')

  const organization = {
    ...org,
    ...organizationUpdate,
    storefront_settings: storefrontSettings ?? org.storefront_settings,
  } as schemas['Organization']

  const allProducts =
    useProducts(organization.id, { is_archived: false }).data?.items ?? []

  // Scoping happens inside ProfileCard via the shared resolver — pass
  // every active product so the resolver can filter to whatever the
  // creator has actually placed on their Space.
  return (
    <ProfileCard organization={organization} products={allProducts} preview />
  )
}

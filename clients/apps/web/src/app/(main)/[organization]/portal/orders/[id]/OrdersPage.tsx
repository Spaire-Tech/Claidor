'use client'

import CustomerPortalOrder from '@/components/CustomerPortal/CustomerPortalOrder'
import { createClientSideAPI } from '@/utils/client'
import { schemas } from '@spaire/client'
import { getThemePreset } from '@spaire/ui/hooks/theming'
import { usePortalTheme } from '../../usePortalTheme'

const ClientPage = ({
  organization,
  order,
  customerSessionToken,
}: {
  organization: schemas['CustomerOrganization']
  order: schemas['CustomerOrder']
  customerSessionToken: string
}) => {
  // Match the embedded Stripe payment-retry form to the portal's theme.
  const { dark } = usePortalTheme(organization.slug, customerSessionToken)
  const themingPreset = getThemePreset(
    organization.slug,
    dark ? 'dark' : 'light',
  )
  const api = createClientSideAPI(customerSessionToken)

  return (
    <CustomerPortalOrder
      api={api}
      order={order}
      customerSessionToken={customerSessionToken}
      themingPreset={themingPreset}
      modalWrapperClassName={'spaire-portal' + (dark ? ' sp-dark' : '')}
    />
  )
}

export default ClientPage

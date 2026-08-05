'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import RemixIcon from '@/components/Icons/frameworks/remix'
import { REMIX_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={REMIX_INTEGRATION}
      icon={<RemixIcon size={40} />}
    />
  )
}

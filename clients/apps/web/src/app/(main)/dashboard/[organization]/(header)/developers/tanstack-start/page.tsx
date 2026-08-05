'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import TanStackIcon from '@/components/Icons/frameworks/tanstack'
import { TANSTACK_START_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={TANSTACK_START_INTEGRATION}
      icon={<TanStackIcon size={40} />}
    />
  )
}

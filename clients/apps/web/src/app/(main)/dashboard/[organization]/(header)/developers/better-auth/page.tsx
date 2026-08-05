'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import BetterAuthIcon from '@/components/Icons/frameworks/better-auth'
import { BETTERAUTH_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={BETTERAUTH_INTEGRATION}
      icon={<BetterAuthIcon size={40} />}
    />
  )
}

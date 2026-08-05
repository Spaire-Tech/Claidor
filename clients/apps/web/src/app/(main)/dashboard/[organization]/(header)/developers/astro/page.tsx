'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import AstroIcon from '@/components/Icons/frameworks/astro'
import { ASTRO_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={ASTRO_INTEGRATION}
      icon={<AstroIcon size={40} />}
    />
  )
}

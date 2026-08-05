'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import NuxtIcon from '@/components/Icons/frameworks/nuxt'
import { NUXT_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={NUXT_INTEGRATION}
      icon={<NuxtIcon size={40} />}
    />
  )
}

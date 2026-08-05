'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import SvelteKitIcon from '@/components/Icons/frameworks/sveltekit'
import { SVELTEKIT_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={SVELTEKIT_INTEGRATION}
      icon={<SvelteKitIcon size={40} />}
    />
  )
}

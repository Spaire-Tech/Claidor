'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import PhpIcon from '@/components/Icons/frameworks/php'
import { PHP_SDK_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={PHP_SDK_INTEGRATION}
      icon={<PhpIcon />}
    />
  )
}

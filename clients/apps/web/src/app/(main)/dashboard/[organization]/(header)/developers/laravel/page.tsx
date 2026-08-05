'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import LaravelIcon from '@/components/Icons/frameworks/laravel'
import { LARAVEL_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={LARAVEL_INTEGRATION}
      icon={<LaravelIcon size={40} />}
    />
  )
}

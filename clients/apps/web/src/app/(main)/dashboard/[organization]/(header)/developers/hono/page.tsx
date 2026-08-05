'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import HonoIcon from '@/components/Icons/frameworks/hono'
import { HONO_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={HONO_INTEGRATION}
      icon={<HonoIcon size={40} />}
    />
  )
}

'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import ElysiaIcon from '@/components/Icons/frameworks/elysia'
import { ELYSIA_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={ELYSIA_INTEGRATION}
      icon={<ElysiaIcon size={40} />}
    />
  )
}

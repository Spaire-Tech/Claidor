'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import FastifyIcon from '@/components/Icons/frameworks/fastify'
import { FASTIFY_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={FASTIFY_INTEGRATION}
      icon={<FastifyIcon size={40} />}
    />
  )
}

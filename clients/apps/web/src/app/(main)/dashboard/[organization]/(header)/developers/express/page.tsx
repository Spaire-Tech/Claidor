'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import ExpressIcon from '@/components/Icons/frameworks/express'
import { EXPRESS_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={EXPRESS_INTEGRATION}
      icon={<ExpressIcon size={40} />}
    />
  )
}

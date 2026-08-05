'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import NextJsIcon from '@/components/Icons/frameworks/nextjs'
import { NEXTJS_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={NEXTJS_INTEGRATION}
      icon={<NextJsIcon size={40} />}
    />
  )
}

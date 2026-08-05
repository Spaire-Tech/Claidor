'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import TypeScriptIcon from '@/components/Icons/frameworks/typescript'
import { TYPESCRIPT_SDK_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={TYPESCRIPT_SDK_INTEGRATION}
      icon={<TypeScriptIcon size={40} />}
    />
  )
}

'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import PythonIcon from '@/components/Icons/frameworks/python'
import { PYTHON_SDK_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={PYTHON_SDK_INTEGRATION}
      icon={<PythonIcon size={40} />}
    />
  )
}

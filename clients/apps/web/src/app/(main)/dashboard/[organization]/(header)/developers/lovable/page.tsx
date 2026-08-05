'use client'

import IntegrationDetailPage from '@/components/Integrations/IntegrationDetailPage'
import LovableIcon from '@/components/Icons/frameworks/lovable'
import { LOVABLE_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationDetailPage
      integration={LOVABLE_INTEGRATION}
      icon={<LovableIcon size={40} />}
    />
  )
}

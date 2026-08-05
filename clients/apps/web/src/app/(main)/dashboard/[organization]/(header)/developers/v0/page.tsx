'use client'

import IntegrationDetailPage from '@/components/Integrations/IntegrationDetailPage'
import V0Icon from '@/components/Icons/frameworks/v0'
import { V0_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationDetailPage
      integration={V0_INTEGRATION}
      icon={<V0Icon size={40} />}
    />
  )
}

'use client'

import IntegrationDetailPage from '@/components/Integrations/IntegrationDetailPage'
import BoltIcon from '@/components/Icons/frameworks/bolt'
import { BOLT_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationDetailPage
      integration={BOLT_INTEGRATION}
      icon={<BoltIcon size={40} />}
    />
  )
}

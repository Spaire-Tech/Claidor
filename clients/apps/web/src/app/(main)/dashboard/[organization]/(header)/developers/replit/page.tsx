'use client'

import IntegrationDetailPage from '@/components/Integrations/IntegrationDetailPage'
import ReplitIcon from '@/components/Icons/frameworks/replit'
import { REPLIT_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationDetailPage
      integration={REPLIT_INTEGRATION}
      icon={<ReplitIcon size={40} />}
    />
  )
}

'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import SupabaseIcon from '@/components/Icons/frameworks/supabase'
import { SUPABASE_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={SUPABASE_INTEGRATION}
      icon={<SupabaseIcon size={40} />}
    />
  )
}

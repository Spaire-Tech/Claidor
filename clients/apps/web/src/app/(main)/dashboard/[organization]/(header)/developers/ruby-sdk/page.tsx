'use client'

import IntegrationSdkPage from '@/components/Integrations/IntegrationSdkPage'
import RubyIcon from '@/components/Icons/frameworks/ruby'
import { RUBY_SDK_INTEGRATION } from '@/components/Integrations/integrations'

export default function Page() {
  return (
    <IntegrationSdkPage
      integration={RUBY_SDK_INTEGRATION}
      icon={<RubyIcon size={40} />}
    />
  )
}

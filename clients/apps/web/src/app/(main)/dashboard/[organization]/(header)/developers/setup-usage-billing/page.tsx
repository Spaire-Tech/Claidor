'use client'

import AgentCommandDetailPage from '@/components/ClaudeCode/AgentCommandDetailPage'
import { USAGE_BILLING_COMMAND } from '@/components/ClaudeCode/agentCommands'

export default function Page() {
  return <AgentCommandDetailPage command={USAGE_BILLING_COMMAND} />
}

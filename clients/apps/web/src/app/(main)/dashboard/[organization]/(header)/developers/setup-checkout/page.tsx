'use client'

import AgentCommandDetailPage from '@/components/ClaudeCode/AgentCommandDetailPage'
import { CHECKOUT_COMMAND } from '@/components/ClaudeCode/agentCommands'

export default function Page() {
  return <AgentCommandDetailPage command={CHECKOUT_COMMAND} />
}

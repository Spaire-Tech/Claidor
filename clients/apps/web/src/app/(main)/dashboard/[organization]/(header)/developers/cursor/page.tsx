'use client'

import AgentPlatformDetailPage from '@/components/ClaudeCode/AgentPlatformDetailPage'
import { CURSOR_PLATFORM } from '@/components/ClaudeCode/agentPlatforms'

export default function Page() {
  return <AgentPlatformDetailPage platform={CURSOR_PLATFORM} />
}

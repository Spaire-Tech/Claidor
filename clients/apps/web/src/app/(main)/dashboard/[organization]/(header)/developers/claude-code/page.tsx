'use client'

import AgentPlatformDetailPage from '@/components/ClaudeCode/AgentPlatformDetailPage'
import { CLAUDE_CODE_PLATFORM } from '@/components/ClaudeCode/agentPlatforms'

export default function Page() {
  return <AgentPlatformDetailPage platform={CLAUDE_CODE_PLATFORM} />
}

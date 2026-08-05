'use client'

import AgentPlatformDetailPage from '@/components/ClaudeCode/AgentPlatformDetailPage'
import { CODEX_PLATFORM } from '@/components/ClaudeCode/agentPlatforms'

export default function Page() {
  return <AgentPlatformDetailPage platform={CODEX_PLATFORM} />
}

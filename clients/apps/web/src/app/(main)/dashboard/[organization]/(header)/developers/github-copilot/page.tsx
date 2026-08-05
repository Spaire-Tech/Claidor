'use client'

import AgentPlatformDetailPage from '@/components/ClaudeCode/AgentPlatformDetailPage'
import { GITHUB_COPILOT_PLATFORM } from '@/components/ClaudeCode/agentPlatforms'

export default function Page() {
  return <AgentPlatformDetailPage platform={GITHUB_COPILOT_PLATFORM} />
}

// Step 4b: an agent's channels in its pane (mac/Simeon/ChannelsPage.swift):
// Discord and Slack, reached from "Channels" in ⌘K and "/". Drawn by
// AgentPane.tsx.

import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'

/** Channels (`ChannelsBody`, step 4b). */
export function ChannelsBody({
  store,
  agent,
}: {
  store: AppStore
  agent: Agent
}) {
  void store
  void agent
  return null
}

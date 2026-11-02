// Step 4b: the avatar editor under the avatar's button in the pane
// (mac/Simeon/AvatarEditor.swift). Drawn by AgentPane.tsx while
// `WindowModel.avatarEditorFor` is the agent.

import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'

/** The avatar editor's popover (`AvatarEditorPopover`, step 4b). */
export function AvatarEditorPopover({
  store,
  agent,
  width,
  close,
}: {
  store: AppStore
  agent: Agent
  width: number
  close: () => void
}) {
  void store
  void agent
  void width
  void close
  return null
}

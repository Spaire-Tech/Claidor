// Step 5b: an agent's computer (mac/Simeon/ComputerView.swift,
// ComputerPreview.swift; SimeonCore's CloudComputer.swift and
// StoreComputer.swift): the Computer tab of the agent's pane, and the full
// view over the window. 5b's screens go in this file (and its own CSS);
// the window places them (App.tsx, AgentPane.tsx).

import type { ReactNode } from 'react'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'

/** The computer over the whole window (`ComputerLayer`), while `WindowModel.computer` names one. */
export function ComputerLayer({ store }: { store: AppStore }): ReactNode {
  void store
  return null
}

/** The Computer tab of an agent's pane (`ComputerPreview`). */
export function ComputerPreview({
  store,
  agent,
}: {
  store: AppStore
  agent: Agent
}): ReactNode {
  void store
  void agent
  return null
}

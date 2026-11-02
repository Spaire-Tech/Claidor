// Step 4c: an agent's routines in its pane (mac/Simeon/RoutinesPage.swift,
// RoutineTriggerCard.swift): the list, New Routine, a routine's editor
// taking the whole page. Drawn by AgentPane.tsx.

import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'

/** Routines (`RoutinesBody`): the agent's routines, New Routine (step 4c). */
export function RoutinesBody({
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

/** A routine's editor (`RoutineEditorPage`), over the whole page, its own bars included (step 4c). */
export function RoutineEditorPage({
  store,
  agent,
  width,
}: {
  store: AppStore
  agent: Agent
  width: number
}) {
  void store
  void agent
  void width
  return null
}

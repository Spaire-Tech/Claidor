// Step 5c: the computer's states (mac/Simeon/ComputerStates.swift;
// SimeonCore's ComputerRebuild.swift, RebuildDriver.swift,
// StoreRebuild.swift, MigrationWatch.swift): the computer's dialogs (the
// rebuild, "Couldn't Reach Simeon's Computer", recovery, Update), the pills
// at the window's top, low disk under the chat's head, the sidebar's
// update pill. 5c's screens go in this file (and its own CSS); the window
// places them (App.tsx, ChatPane.tsx, Sidebar.tsx).

import type { ReactNode } from 'react'
import type { AppStore } from '../core/store'

/** The computer's one dialog at a time over the window (`ComputerDialogLayer`). */
export function ComputerDialogLayer({ store }: { store: AppStore }): ReactNode {
  void store
  return null
}

/** The pills at the window's top (`ComputerPills`). */
export function ComputerPills({ store }: { store: AppStore }): ReactNode {
  void store
  return null
}

/** Low disk, 8 under the chat's head or a thread's (`DiskBanner`): `top` is where it starts. */
export function DiskBanner({
  store,
  top,
}: {
  store: AppStore
  top: number
}): ReactNode {
  void store
  void top
  return null
}

/** The sidebar's "Update Simeon's Computer" pill (`ComputerUpdatePill`). */
export function ComputerUpdatePill({ store }: { store: AppStore }): ReactNode {
  void store
  return null
}

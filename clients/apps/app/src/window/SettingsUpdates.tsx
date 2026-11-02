// Settings › Updates in the Windows app (mac/Simeon/SettingsPages.swift,
// `SettingsUpdatesPage`): the version, the last check, Check Now, the two
// switches. Listed only in the Windows app (SettingsWindow.tsx); step 7e
// fills it from the main process's updater.

import type { AppStore } from '../core/store'

export function SettingsUpdatesPage({ store }: { store: AppStore }) {
  void store
  return null
}

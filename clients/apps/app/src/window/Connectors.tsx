// Connectors (mac/Simeon/PluginsWindow.swift, `overlay:plugins`): in
// Settings' place over the whole window (`model.overlay`, kind
// `connectors`), the same dim and panel. Step 6c (the list), 6d (an app's
// pages).

import type { AppStore } from '../core/store'

export function ConnectorsLayer({ store }: { store: AppStore }) {
  void store
  return null
}

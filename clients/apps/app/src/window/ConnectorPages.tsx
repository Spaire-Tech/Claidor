// Connectors' pages (mac/Simeon/PluginsWindow.swift 1126-2035,
// `PluginPages`): a plugin's page, an installed server's page, the setup
// page, a skill's page. Step 6d's; the frame of them (step 6c) is the
// panel in Connectors.tsx, which shows the page on top of `model.path`
// over the list, with Back and its title in the head.
//
// The panel gives a page the area under the head, scrolling
// (`.connectors-page`), drawn afresh for each page; the page draws its own
// room and width (the Mac's 16 above, 24 a side, 32 at the foot, at most
// 720 in the middle). A section of Available on its own page (`category`)
// is 6c's, drawn by Connectors.tsx: it never comes here.

import type { AppStore } from '../core/store'
import type { PluginsModel, PluginsPage } from './pluginsModel'

/** The page on top of the stack (`PluginPages`): a plugin's, a server's, the setup page, a skill's; one whose thing has gone closes itself (`model.closePage`). */
export function PluginPages({
  page,
  model,
  store,
}: {
  page: PluginsPage
  model: PluginsModel
  store: AppStore
}) {
  void page
  void model
  void store
  return null
}

/** The page's name in the head (`PluginPages.title`); a section's is 6c's. */
export function pluginPageTitle(
  page: PluginsPage,
  model: PluginsModel,
): string {
  void page
  void model
  return ''
}

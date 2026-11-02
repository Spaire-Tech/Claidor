// The tray's menu (mac/Simeon/MenuBar.swift's `MenuBarMenu`): Open Simeon;
// signed in, New Agent and the agents most recently at work, a mark on
// those with something unread; Quit Simeon. Windows has no menu bar for
// the Mac's app menu, so its own items that have no other place are here
// too, where Windows people look for them (SimeonMacApp.swift's
// `SimeonCommands`): Agent › Call <name>, About Simeon, and Check for
// Updates… in a packaged build (the Mac's "only in a released build").
// Nothing of Electron's here but its types: the tests read the template.

import type { MenuItemConstructorOptions, NativeImage } from 'electron'
import type { TrayMenu } from '../../../../clients/apps/app/src/desktop/contract'

/** What the tray's items do (parts/surfaces.ts). */
export interface TrayActions {
  open(): void
  newChat(): void
  openAgent(agentId: string): void
  call(): void
  about(): void
  checkForUpdates(): void
  quit(): void
}

/** Before the page has said its words: the Mac's English (its catalogue's), Open and Quit only. */
export const firstTray: TrayMenu = {
  words: {
    openSimeon: 'Open Simeon',
    newChat: 'New Agent',
    aboutSimeon: 'About Simeon',
    checkForUpdates: 'Check for Updates…',
    quitSimeon: 'Quit Simeon',
  },
  signedIn: false,
  agents: [],
}

/** An agent's name as a menu item's label: `&` is Windows' mnemonic sign, so it is doubled to show as itself. */
export function menuLabel(text: string): string {
  return text.replace(/&/g, '&&')
}

export function trayTemplate(
  tray: TrayMenu,
  options: { checksForUpdates: boolean; unreadMark?: NativeImage },
  act: TrayActions,
): MenuItemConstructorOptions[] {
  const groups: MenuItemConstructorOptions[][] = []
  const first: MenuItemConstructorOptions[] = [
    { label: menuLabel(tray.words.openSimeon), click: () => act.open() },
  ]
  if (tray.signedIn)
    first.push({
      label: menuLabel(tray.words.newChat),
      click: () => act.newChat(),
    })
  groups.push(first)
  if (tray.signedIn && tray.agents.length > 0)
    groups.push(
      tray.agents.map((agent) => ({
        label: menuLabel(agent.name),
        ...(agent.unread && options.unreadMark
          ? { icon: options.unreadMark }
          : {}),
        click: () => act.openAgent(agent.id),
      })),
    )
  if (tray.signedIn && tray.call)
    groups.push([
      {
        label: menuLabel(tray.call.title),
        enabled: tray.call.enabled,
        click: () => act.call(),
      },
    ])
  if (tray.signedIn) {
    const app: MenuItemConstructorOptions[] = [
      { label: menuLabel(tray.words.aboutSimeon), click: () => act.about() },
    ]
    if (options.checksForUpdates)
      app.push({
        label: menuLabel(tray.words.checkForUpdates),
        click: () => act.checkForUpdates(),
      })
    groups.push(app)
  }
  groups.push([
    {
      label: menuLabel(tray.words.quitSimeon),
      // The Mac's ⌘Q, as Windows writes it; the key itself is the page's (src/desktop/surfaces.ts).
      accelerator: 'Ctrl+Q',
      registerAccelerator: false,
      click: () => act.quit(),
    },
  ])
  return groups.flatMap((group, index) =>
    index === 0 ? group : [{ type: 'separator' as const }, ...group],
  )
}

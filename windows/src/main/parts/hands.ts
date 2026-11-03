// Step 7f, the agent's hands on this PC: commands run on this PC for the agents, asked first, never in the sensitive folders (MacLocalHands.swift, MacLocalPermission.swift, SimeonMacCore's LocalExec*).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section. The work is
// in ../hands/; here every call from the page is checked (it comes from a
// page), only the app's own window may drive the hands, and the hands stop
// before the app quits.

import os from 'node:os'
import path from 'node:path'
import { type WebContents, app, net, safeStorage } from 'electron'
import type { HandsApproval } from '../../../../clients/apps/app/src/desktop/contract'
import { handle } from '../bridge'
import type { AppContext } from '../context'
import { approvalActions } from '../hands/approvals'
import { Hands } from '../hands/hands'
import { shrinkImage } from '../hands/images'
import { isPermission } from '../hands/permission'
import type { Permission } from '../hands/rules'
import { checkTarget } from '../hands/target'
import { fetchTransport } from '../hands/transport'

function choiceOf(value: unknown): Permission {
  if (!isPermission(value)) throw new Error('A setting was expected.')
  return value
}

function accountOf(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 320) throw new Error('An account was expected.')
  return value.trim().toLowerCase()
}

function approvalOf(value: unknown): HandsApproval {
  if (typeof value !== 'object' || value == null) throw new Error('An answer was expected.')
  const { id, action, target } = value as Record<string, unknown>
  if (typeof id !== 'string' || id === '' || id.length > 256) throw new Error('An answer was expected.')
  if (typeof action !== 'string' || !approvalActions.has(action)) throw new Error('An answer was expected.')
  if (typeof target !== 'string' || target.length > 262_144) throw new Error('An answer was expected.')
  return { id, action, target }
}

export function register(context: AppContext): void {
  const made = new Hands({
    dataFolder: context.dataFolder,
    env: process.env,
    home: os.homedir(),
    platform: process.platform,
    transport: fetchTransport((input, init) => net.fetch(input, init)),
    shrinkImage,
    // The app as installed (for this person only, so any of their programs could change it): refused as its data folder is.
    installFolder: app.isPackaged ? path.dirname(app.getPath('exe')) : undefined,
    // The setting and the "Allow once" answers signed with a key Windows seals, as the page's kept values are (main.ts).
    sealer: {
      available: () => safeStorage.isEncryptionAvailable(),
      seal: (value) => safeStorage.encryptString(value),
      open: (sealed) => safeStorage.decryptString(sealed),
    },
  })

  // Only the app's own window drives the hands (not the call's window, not anything else).
  const fromWindow = (from: WebContents) => {
    if (context.mainWindow()?.webContents !== from) throw new Error('Only the app’s window may do this.')
  }
  // The page that reads the stream going (a reload, the window gone): the stream ends; what runs goes on until the next page says.
  const watched = new WeakSet<WebContents>()
  const watch = (from: WebContents) => {
    if (watched.has(from)) return
    watched.add(from)
    from.on('did-navigate', () => made.end())
    from.once('destroyed', () => made.end())
  }

  handle('handsStream', (from, target) => {
    fromWindow(from)
    watch(from)
    return made.stream(checkTarget(target, context.facts.apiBase))
  })
  handle('handsEnd', (from) => {
    fromWindow(from)
    made.end()
  })
  handle('handsStop', async (from) => {
    fromWindow(from)
    await made.stop()
  })
  handle('handsSignedOut', async (from) => {
    fromWindow(from)
    await made.signedOut()
  })
  handle('handsPermission', (from, account) => {
    fromWindow(from)
    return made.permission(accountOf(account))
  })
  handle('handsChoose', (from, choice) => {
    fromWindow(from)
    return made.choose(choiceOf(choice))
  })
  handle('handsCeiling', (from, ceiling) => {
    fromWindow(from)
    return made.ceiling(ceiling === null ? null : choiceOf(ceiling))
  })
  handle('handsAllowOnce', (from, approval) => {
    fromWindow(from)
    made.allowOnce(approvalOf(approval))
  })
  handle('handsForgetOnce', (from) => {
    fromWindow(from)
    made.forgetOnce()
  })

  // Quitting stops the hands: the commands they hold are stopped and waited for (a second at most, the app's own).
  context.beforeQuit(() => made.stop())
}

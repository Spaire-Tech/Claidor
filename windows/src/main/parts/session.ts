// Step 7b, signing in and the session: the browser's sign-in, Relaunch, the logs, the chats kept on disk (mac/Simeon/MacSession.swift, SignInScreen.swift; core SignIn.swift, SavedChats.swift).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section.
//
// The sign-in itself runs in the page (core/signIn.ts): it opens the
// server's page in the default browser through the frame's `openExternal`
// and polls `/auth/poll`; the pair it gets is kept sealed by the frame
// (../kept.ts). Here:
// - Relaunch (Settings › General's, after a new language; the Mac's
//   `relaunch`): the app starts again, after the page's own work, as at any
//   quit.
// - The logs (`computer-stream.log`, emptied at launch, and
//   `voice-call.log`) in the app's data folder, and their last 256 KB for a
//   report; this PC's model for a report.
// - The agents and chats kept on this PC (the Mac's `SavedChats`), in the
//   app's local folder; what goes in them, and whose they are, is the
//   page's (its store's "Step 7b" section).

import { handle, text } from '../bridge'
import type { AppContext } from '../context'
import { deviceModel } from '../session/device'
import { AppLogs, isLogName } from '../session/logs'
import {
  SavedChatsFolder,
  agentIdArgument,
  isSavedName,
  recordText,
  savedChatsFolder,
  savedLimits,
} from '../session/savedChats'

/** The most agents the page may name at once (`keepSavedChats`). */
const mostAgents = 10_000

export function register(context: AppContext): void {
  const logs = new AppLogs(context.dataFolder)
  void logs.startStreamLog().then(() => logs.trimCallLog())
  const saved = new SavedChatsFolder(
    savedChatsFolder({
      dataFolder: context.dataFolder,
      platform: context.app.platform,
      env: context.app.env,
    }),
  )

  // As the Mac's: a new instance with no link (main.ts; the updater's installer opens it instead when one runs).
  handle('relaunch', () => context.relaunch())

  handle('writeLog', (_from, name, line) => {
    if (!isLogName(name)) throw new Error('No such log.')
    void logs.write(name, text(line, 1_000_000))
  })
  handle('readLogs', () => logs.readTails())
  handle('deviceModel', () => deviceModel(context.app.platform))

  handle('readSaved', () => saved.read())
  handle('readSavedChat', (_from, agentId) =>
    saved.readChat(agentIdArgument(agentId)),
  )
  handle('writeSaved', (_from, name, record) => {
    if (!isSavedName(name)) throw new Error('No such file.')
    return saved.write(name, recordText(record, savedLimits[name]))
  })
  handle('writeSavedChat', (_from, agentId, record) => {
    const id = agentIdArgument(agentId)
    return saved.writeChat(
      id,
      record == null ? null : recordText(record, savedLimits.chat),
    )
  })
  handle('keepSavedChats', (_from, agentIds) => {
    if (!Array.isArray(agentIds) || agentIds.length > mostAgents)
      throw new Error('A list of agents was expected.')
    return saved.keepChats(agentIds.map(agentIdArgument))
  })
  handle('forgetSaved', () => saved.forget())

  // The page keeps what changed as it quits (`quitting`); the files it asked for are written before the app goes.
  context.beforeQuit(() => saved.settled())
}

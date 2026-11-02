// Where the Windows app keeps the agents and chats (core/savedChats.ts): its
// own folder on this PC, read and written by its main process
// (windows/src/main/session/savedChats.ts), the Mac's `SavedChats` files.

import type { JSONValue } from '../core/json'
import { SavedChats, type SavedChatsPlace } from '../core/savedChats'
import type { Desktop } from './desktop'

export function desktopSavedPlace(desktop: Desktop): SavedChatsPlace {
  return {
    read: () => desktop.call('readSaved'),
    readChat: (agentId) => desktop.call('readSavedChat', agentId),
    write: (name, record: JSONValue) =>
      desktop.call('writeSaved', name, record),
    writeChat: (agentId, record: JSONValue | null) =>
      desktop.call('writeSavedChat', agentId, record),
    keepChats: (agentIds) => desktop.call('keepSavedChats', agentIds),
    forget: () => desktop.call('forgetSaved'),
  }
}

export function desktopSavedChats(desktop: Desktop): SavedChats {
  return new SavedChats(desktopSavedPlace(desktop))
}

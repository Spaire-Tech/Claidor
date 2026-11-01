// Where the person's computer answered last time
// (ios/SimeonCore/Sources/SimeonCore/SavedGateway.swift): the broker's answer,
// for one account (its token's `sub`), for seven days. At launch the app goes
// straight to it while the broker is asked again (`Gateway`). It holds the
// box's tokens, so it lives where the session's own pair lives: on the web,
// the tab's storage; signing out forgets it.

import { GatewayConnection } from './gatewayConnection'
import { type JSONObject, field, num, parseJSON, str } from './json'

export const savedGatewayVersion = 1
/** Seven days, in seconds. */
export const savedGatewayMaxAge = 7 * 24 * 60 * 60

/** The record kept: the broker's own field names, so it reads back through `GatewayConnection.fromBox`. */
export function encodeSavedGateway(
  connection: GatewayConnection,
  accountScope: string,
  savedAt: Date,
): string {
  const box: JSONObject = { gatewayUrl: connection.baseURL }
  if (connection.token != null) box.gatewayToken = connection.token
  if (connection.networkToken != null)
    box.networkToken = connection.networkToken
  if (connection.screenURL != null) box.vncUrl = connection.screenURL
  if (connection.forkScreenBase != null)
    box.forkVncBaseUrl = connection.forkScreenBase
  // Whether the server let the box sleep: the next launch asks the record before it wakes the box.
  if (connection.letsSleep) box.letsSleep = true
  return JSON.stringify({
    version: savedGatewayVersion,
    accountScope,
    savedAtMs: savedAt.getTime(),
    box,
  })
}

/** The address kept for this account; undefined when none, another account's, another version's, or older than seven days. */
export function decodeSavedGateway(
  data: string | null | undefined,
  accountScope: string,
  now: Date,
): GatewayConnection | undefined {
  if (data == null) return undefined
  const record = parseJSON(data)
  const savedAtMs = num(field(record, 'savedAtMs'))
  const box = field(record, 'box')
  if (
    num(field(record, 'version')) !== savedGatewayVersion ||
    str(field(record, 'accountScope')) !== accountScope ||
    savedAtMs == null ||
    now.getTime() - savedAtMs > savedGatewayMaxAge * 1000 ||
    box === undefined
  ) {
    return undefined
  }
  try {
    return GatewayConnection.fromBox(box)
  } catch {
    return undefined
  }
}

/** Where the record is kept. */
export interface SavedGatewayStore {
  read(): string | null
  /** Null forgets it. */
  write(data: string | null): void
}

export class MemorySavedGateway implements SavedGatewayStore {
  constructor(private data: string | null = null) {}
  read() {
    return this.data
  }
  write(data: string | null) {
    this.data = data
  }
}

export const savedGatewayKey = 'simeon.web.gateway'

/** The record in the tab's storage, beside the session's pair. */
export function sessionSavedGateway(
  storage: Storage = sessionStorage,
): SavedGatewayStore {
  return {
    read() {
      try {
        return storage.getItem(savedGatewayKey)
      } catch {
        return null
      }
    },
    write(data) {
      try {
        if (data == null) storage.removeItem(savedGatewayKey)
        else storage.setItem(savedGatewayKey, data)
      } catch {
        // Blocked storage: the next load asks the broker.
      }
    },
  }
}

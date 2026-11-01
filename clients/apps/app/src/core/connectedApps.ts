// The connected apps, as the computer's manager lists them (SimeonCore's
// `ConnectedApp` in Store.swift, `McpServerSummary`): what "@" offers as
// connectors. The Connectors page itself comes with step 6.

import { bool, field, int, str, text } from './json'

export interface ConnectedApp {
  /** The computer lists one row per account, all under the app's server id. */
  serverId: string
  name: string
  pluginId?: string
  accountKey: string
  /** `connected`, or what stops it (`error`, a sign-in still to do). */
  status: string
  toolCount: number
  /** The name tools are called under (`serverIdentifier`), the id "@" keys its row by. */
  serverIdentifier: string
  url?: string
  /** One the person's team added, not the person. */
  isTeamServer: boolean
}

export function connectedApp(json: unknown): ConnectedApp | undefined {
  const serverId = text(field(json, 'id'))
  if (serverId == null) return undefined
  const name = str(field(json, 'name')) ?? serverId
  return {
    serverId,
    name,
    pluginId: text(field(json, 'pluginId')),
    accountKey: text(field(json, 'accountKey')) ?? 'default',
    status: str(field(json, 'status')) ?? '',
    toolCount: int(field(json, 'toolCount')) ?? 0,
    serverIdentifier: text(field(json, 'serverIdentifier')) ?? name,
    url: text(field(json, 'url')),
    isTeamServer: bool(field(json, 'isTeamServer')) ?? false,
  }
}

/** A test's or a stand-in's app, with the core's defaults. */
export function makeApp(
  values: Partial<ConnectedApp> & { serverId: string; name: string },
): ConnectedApp {
  return {
    accountKey: 'default',
    status: '',
    toolCount: 0,
    serverIdentifier: values.name,
    isTeamServer: false,
    ...values,
  }
}

// An agent's messaging channels (Slack through Simeon's own Slack app since
// 12 November 2026; Discord, a bot the person owns, when the computer offers
// it), as the computer's `getAgentChannels` answers and the
// window's Channels view draws them (SimeonCore's Channels.swift: `_0n`,
// `B0n`, `A0n`, `P0n`, `O0n`). The calls themselves are the store's
// (`channels`, `connectChannel`, `refreshChannel`, `disconnectChannel`).

import { arr, field, str } from './json'
import { t, tk } from './l10n'

/** A platform the computer offers (`Manifest`). */
export interface ChannelManifest {
  platform: string
  displayName: string
  blurb: string
  credentialLabel: string
  availability: string
  /** `token`: + opens a field for the bot's token. `app`: + opens Slack's own sign-in for Simeon's Slack app, no token (12 November 2026). */
  connect: string
}

/** A platform connected, or on its way (`Connection`). */
export interface ChannelConnection {
  platform: string
  label: string
  /** `configured`, `connecting`, `connected`, `pending`, `error`. */
  status: string
  detail?: string
}

/** The computer's answer (`ChannelsView`): its platforms and this agent's connections. */
export interface ChannelsView {
  manifests: ChannelManifest[]
  connections: ChannelConnection[]
}

/** The answer read; undefined without both lists (`init?(json:)`). */
export function channelsFrom(json: unknown): ChannelsView | undefined {
  const manifests = arr(field(json, 'manifests'))
  const connections = arr(field(json, 'connections'))
  if (!manifests || !connections) return undefined
  return {
    manifests: manifests.flatMap((row) => {
      const platform = str(field(row, 'platform'))
      if (platform === undefined) return []
      return [
        {
          platform,
          displayName: str(field(row, 'displayName')) ?? platform,
          blurb: str(field(row, 'blurb')) ?? '',
          credentialLabel: str(field(row, 'credentialLabel')) ?? '',
          availability: str(field(row, 'availability')) ?? 'coming-soon',
          connect: str(field(row, 'connect')) ?? 'token',
        },
      ]
    }),
    connections: connections.flatMap((row) => {
      const platform = str(field(row, 'platform'))
      if (platform === undefined) return []
      return [
        {
          platform,
          label: str(field(row, 'label')) ?? '',
          status: str(field(row, 'status')) ?? '',
          detail: str(field(row, 'detail')),
        },
      ]
    }),
  }
}

/** "Channels" is offered when a platform is open or a connection exists (`hasChannels`, `mmt`). */
export function hasChannels(view: ChannelsView): boolean {
  return (
    view.manifests.some((manifest) => manifest.availability === 'available') ||
    view.connections.length > 0
  )
}

export function connectionOf(
  view: ChannelsView,
  manifest: ChannelManifest,
): ChannelConnection | undefined {
  return view.connections.find(
    (connection) => connection.platform === manifest.platform,
  )
}

/** A row's state (`RowState`). */
export type RowState =
  | { kind: 'comingSoon' }
  | { kind: 'available' }
  | { kind: 'connected' }
  | { kind: 'error'; detail?: string }
  | { kind: 'connecting' }

/** A row's state (`state`, `A0n`): pending and configured read as Connecting. */
export function rowState(
  view: ChannelsView,
  manifest: ChannelManifest,
): RowState {
  if (manifest.availability === 'coming-soon') return { kind: 'comingSoon' }
  const connection = connectionOf(view, manifest)
  if (!connection) return { kind: 'available' }
  switch (connection.status) {
    case 'connected':
      return { kind: 'connected' }
    case 'error':
      return { kind: 'error', detail: connection.detail }
    default:
      return { kind: 'connecting' }
  }
}

/**
 * The line under the name, a few words (`subtitle`; the founder, 28
 * October 2026: "too many words"): what it reaches, the account once
 * connected, what went wrong.
 */
export function channelSubtitle(
  view: ChannelsView,
  manifest: ChannelManifest,
): string {
  const state = rowState(view, manifest)
  switch (state.kind) {
    case 'connected': {
      const label = connectionOf(view, manifest)?.label
      return label ? label : channelReach(manifest)
    }
    case 'error':
      return state.detail ?? t("Couldn't connect")
    default:
      return channelReach(manifest)
  }
}

/** What a platform reaches; the computer's own line for one the app doesn't know (`reach`). */
export function channelReach(manifest: ChannelManifest): string {
  switch (manifest.platform) {
    case 'discord':
      return t('Servers and DMs')
    case 'slack':
      return t('Channels and DMs')
    default:
      return manifest.blurb
  }
}

/** The row's state in a word, for the ear and the pointer (the mark says it to the eye); none to connect (`chip`). */
export function channelChip(state: RowState): string | undefined {
  switch (state.kind) {
    case 'comingSoon':
      return t('Coming soon')
    case 'connected':
      return t('Connected')
    case 'error':
      return t('Needs attention')
    case 'connecting':
      return tk('channel.connecting')
    case 'available':
      return undefined
  }
}

/** Said when the computer offers no platform (`none`). */
export function noChannels(): string {
  return t('No connectors available.')
}

/** The field's words: the token it takes (`placeholder`). */
export function channelPlaceholder(manifest: ChannelManifest): string {
  switch (manifest.platform) {
    case 'discord':
      return t('Bot token')
    case 'slack':
      return t('App token and bot token')
    default: {
      const [first = '', ...rest] = Array.from(manifest.credentialLabel)
      return first.toUpperCase() + rest.join('')
    }
  }
}

/** Connected through Slack's sign-in in the browser, not a token typed here (`connectsInBrowser`). */
export function connectsInBrowser(manifest: ChannelManifest): boolean {
  return manifest.connect === 'app'
}

/** How long a row waits, after its sign-in opened in the browser, for the computer to say it is connected; asked every `channelConnectPollSeconds` (`connectWaitSeconds`). */
export const channelConnectWaitSeconds = 300
export const channelConnectPollSeconds = 3

/** The row's line when the sign-in could not be opened (`couldNotConnect`). */
export function couldNotConnect(): string {
  return t("Couldn't connect")
}

/** How long a channel call may take, in seconds (`channelDeadline`, `I$n`). */
export const channelDeadline = 15

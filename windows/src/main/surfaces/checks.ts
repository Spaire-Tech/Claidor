// What the page hands 7c's part, checked before anything is done with it
// (it comes from a page): types, sizes, allowed values. A value that is not
// what the contract says is refused whole. Nothing of Electron: the tests
// run these in Node.

import type {
  AgentNote,
  CallAction,
  ShownCall,
  TaskbarBadge,
  TrayMenu,
} from '../../../../clients/apps/app/src/desktop/contract'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function words(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

/** A notification (`notify`): an agent's id, its title and body as the Mac's (the body at most 140, the title a name and a few words). */
export function readNote(value: unknown): AgentNote | undefined {
  if (!isObject(value)) return undefined
  const { agentId, title, body, sound } = value
  if (!words(agentId, 256) || !words(title, 512) || !words(body, 512))
    return undefined
  if (typeof sound !== 'boolean') return undefined
  return { agentId, title, body, sound }
}

/** The overlay's picture: a PNG data URL, small. */
export const badgeImagePrefix = 'data:image/png;base64,'
const badgeImageLength = 64 * 1024

/** The taskbar's number (`setBadge`): a whole number, 0 to a million; its picture a PNG data URL when given. */
export function readBadge(value: unknown): TaskbarBadge | undefined {
  if (!isObject(value)) return undefined
  const { count, image, description } = value
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 1_000_000
  )
    return undefined
  if (typeof description !== 'string' || description.length > 64)
    return undefined
  if (image !== undefined) {
    if (
      typeof image !== 'string' ||
      !image.startsWith(badgeImagePrefix) ||
      image.length > badgeImageLength ||
      !/^[A-Za-z0-9+/]+=*$/.test(image.slice(badgeImagePrefix.length))
    )
      return undefined
    return { count, image, description }
  }
  return { count, description }
}

/** At most the Mac's eight agents in the tray's menu. */
export const trayAgentsMost = 8

/** The tray's menu (`setTray`): its five words, signed in or not, up to eight agents, the call's item. */
export function readTray(value: unknown): TrayMenu | undefined {
  if (!isObject(value) || !isObject(value.words)) return undefined
  const w = value.words
  const keys = [
    'openSimeon',
    'newChat',
    'aboutSimeon',
    'checkForUpdates',
    'quitSimeon',
  ] as const
  if (!keys.every((key) => words(w[key], 128))) return undefined
  if (typeof value.signedIn !== 'boolean') return undefined
  if (!Array.isArray(value.agents) || value.agents.length > trayAgentsMost)
    return undefined
  const agents: TrayMenu['agents'] = []
  for (const agent of value.agents) {
    if (!isObject(agent)) return undefined
    const { id, name, unread } = agent
    if (!words(id, 256) || typeof name !== 'string' || name.length > 256)
      return undefined
    if (typeof unread !== 'boolean') return undefined
    agents.push({ id, name, unread })
  }
  let call: TrayMenu['call']
  if (value.call !== undefined) {
    if (!isObject(value.call)) return undefined
    const { title, enabled } = value.call
    if (!words(title, 300) || typeof enabled !== 'boolean') return undefined
    call = { title, enabled }
  }
  return {
    words: {
      openSimeon: w.openSimeon as string,
      newChat: w.newChat as string,
      aboutSimeon: w.aboutSimeon as string,
      checkForUpdates: w.checkForUpdates as string,
      quitSimeon: w.quitSimeon as string,
    },
    signedIn: value.signedIn,
    agents,
    ...(call ? { call } : {}),
  }
}

/** A call as the page sends it can carry its agent's own picture (a data URL): 4 MB at most in all. */
export const shownCallMost = 4 * 1024 * 1024

/** The call (`showCall`): its state and its agent's row, plain JSON, under 4 MB; null for none. */
export function readShownCall(value: unknown): ShownCall | null | undefined {
  if (value === null) return null
  if (!isObject(value) || !isObject(value.call)) return undefined
  if (typeof value.call.agentId !== 'string') return undefined
  if (value.agent !== undefined && !isObject(value.agent)) return undefined
  let size: number
  try {
    size = JSON.stringify(value).length
  } catch {
    return undefined
  }
  if (size > shownCallMost) return undefined
  return value.agent !== undefined
    ? { call: value.call, agent: value.agent }
    : { call: value.call }
}

/** The waveform (`showCallLevels`): at most 64 numbers, each 0 to 1. */
export function readLevels(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length > 64) return undefined
  if (
    !value.every(
      (level) =>
        typeof level === 'number' &&
        Number.isFinite(level) &&
        level >= 0 &&
        level <= 1,
    )
  )
    return undefined
  return [...(value as number[])]
}

/** The card's height (`callWindowHeight`): a number of points, 0 to 2,000. */
export function readHeight(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 2_000
    ? value
    : undefined
}

const actions: readonly CallAction[] = [
  'mute',
  'unmute',
  'hangUp',
  'dismiss',
  'close',
]

/** A button of the call's window (`callWindowAction`). */
export function readAction(value: unknown): CallAction | undefined {
  return actions.includes(value as CallAction)
    ? (value as CallAction)
    : undefined
}

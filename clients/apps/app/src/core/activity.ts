// What an agent is doing right now, in words (SimeonCore's Activity.swift):
// the line beside its picture under the chat while it works, and how long
// each activity's words are held so quick steps do not flicker.

import { t } from './l10n'
import type { Agent } from './models'

/** The line's picture: one of the window's glyphs, a connected app's logo, or the agent being messaged. */
export type ActivityIcon =
  | { kind: 'glyph'; name: string }
  | { kind: 'connector'; service: string }
  | { kind: 'agent'; id: string }

/**
 * What an agent is doing, as the Mac's chat writes it beside the working
 * picture (`ActivityLine`, the window's `dse`, from the roster's
 * `currentActivity`): "Thinking", "Searching the web", "Messaging Iris"…
 */
export class ActivityLine {
  readonly text: string

  constructor(
    readonly verb: string,
    text: string,
    readonly icon: ActivityIcon,
  ) {
    this.text = ActivityLine.cut(text)
  }

  /** The label comes in again only when this changes (`kbe`: the verb and the picture, not the words). */
  get key(): string {
    switch (this.icon.kind) {
      case 'glyph':
        return `${this.verb}:glyph:${this.icon.name}`
      case 'connector':
        return `${this.verb}:connector:${this.icon.service}`
      case 'agent':
        return `${this.verb}:agent:${this.icon.id}`
    }
  }

  /** At most 60 characters, the spaces run together (`XCe`). */
  static cut(text: string): string {
    const flat = text.split(/\s+/).filter(Boolean).join(' ')
    const characters = [...flat]
    if (characters.length <= 60) return flat
    return characters.slice(0, 59).join('').trimEnd() + '…'
  }

  /** The window's table (`dse`), for `{kind: "thinking"}` or `{kind: "tool", tool, detail, target}`. */
  static of(
    kind: string | undefined,
    tool: string | undefined,
    detail: string | undefined,
    target?: string,
    targetName?: string,
  ): ActivityLine {
    const glyph = (verb: string, words: string, name: string) =>
      new ActivityLine(verb, words, { kind: 'glyph', name })
    if (kind === 'thinking')
      return glyph('thinking', t('Thinking'), 'thinking-medium')
    if (!tool) return glyph('working', t('Working'), 'wrench')
    const named = detail?.trim() ? detail.trim() : undefined
    switch (tool) {
      case 'WebSearch':
        return glyph('searching', t('Searching the web'), 'magnifying-glass')
      case 'WebFetch':
        return glyph('browsing', t('Reading the web'), 'globe')
      case 'Read':
      case 'ExternalRead':
      case 'BoxRead':
        return glyph('reading', t('Reading file'), 'book-open')
      case 'ExternalShell':
        return named != null
          ? glyph('writing', t('Drafting the file'), 'pencil')
          : glyph('on-your-computer', t('On your computer'), 'laptop')
      case 'Shell':
      case 'BoxShell':
        return named != null
          ? glyph('writing', t('Drafting the file'), 'pencil')
          : glyph('running-commands', t('Running commands'), 'terminal')
      case 'CopyToBox':
      case 'CopyFromBox':
        return glyph('on-your-computer', t('Organizing files'), 'laptop')
      case 'Await':
      case 'AwaitShell':
      case 'AwaitExternalShell':
        return glyph('waiting', t('Waiting on a command'), 'hourglass')
      case 'GenerateImage':
        return glyph('generating', t('Generating a photo'), 'image')
      case 'CloudAgent':
        return glyph('coding', t('Coding'), 'cursor-logo')
      case 'Task':
        return glyph('waiting', t('Waiting on another agent'), 'hourglass')
      case 'Screenshot':
      case 'Computer':
      case 'request_box_help':
        return glyph('on-its-computer', t('On its computer'), 'device-desktop')
      case 'SendToAgent':
      case 'UpdateAgent': {
        const name = targetName?.trim()
        const words = name
          ? t`Messaging ${name}`
          : t('Messaging another assistant')
        if (target)
          return new ActivityLine('messaging', words, {
            kind: 'agent',
            id: target,
          })
        return glyph('messaging', words, 'person-chat-bubble')
      }
      case 'CreateAgent':
      case 'ReactToMessage':
        return glyph('messaging', t('Messaging'), 'person-chat-bubble')
      default:
        if (tool === 'CallMcpTool' || connecting.has(tool)) {
          if (named == null)
            return glyph(
              'connecting',
              t('Connecting to a third party app'),
              'plug',
            )
          const app = named.slice(0, 1).toUpperCase() + named.slice(1)
          return new ActivityLine('connecting', t`Connecting to ${app}`, {
            kind: 'connector',
            service: named,
          })
        }
        if (subagentWaits.has(tool))
          return glyph('waiting', t('Waiting on another agent'), 'hourglass')
        if (tool.startsWith('browser_'))
          return glyph('browsing', t('Browsing the web'), 'globe')
        return glyph('working', t('Working'), 'wrench')
    }
  }

  /** The time it has been at it, once past a minute ("3m", "1h", "1h 5m"), as the window adds it. */
  static elapsed(seconds: number): string | undefined {
    if (seconds < 60) return undefined
    const minutes = Math.max(1, Math.floor(seconds / 60))
    if (minutes < 60) return t`${minutes}m`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest === 0 ? t`${hours}h` : t`${hours}h ${rest}m`
  }
}

/** Tools the window shows as connecting to an app (`Jon`). */
const connecting = new Set([
  'GetMcpTools',
  'McpAuth',
  'SearchPlugins',
  'GetPlugin',
  'InstallPlugin',
  'UninstallPlugin',
  'GetMcpServerStatus',
  'AddMcpServer',
  'UninstallMcpServer',
  'AuthenticateMcpServer',
  'RestartMcpServers',
  'SetMcpInstructions',
  'SearchMcpServers',
  'InstallMcpServer',
  'EnableTeamServer',
])

/** Tools the window shows as "Waiting on another agent" (`Qon`). */
const subagentWaits = new Set([
  'CheckSubagent',
  'MessageSubagent',
  'StopSubagent',
])

/**
 * The words beside its working picture in the chat (`Agent.activityLine`):
 * "Typing…" while it writes, else what it is doing, or "Iris is working"
 * before it says what (`gJn`); none when it is not at work.
 */
export function activityLine(
  agent: Agent,
  named: (id: string) => string | undefined = () => undefined,
): ActivityLine | undefined {
  if (agent.isComposing)
    return new ActivityLine('typing', t('Typing…'), {
      kind: 'glyph',
      name: 'thinking-medium',
    })
  if (!(agent.isRunning || agent.isRunningTurn) || agent.awaitingUserResponse)
    return undefined
  if (agent.activityKind == null) {
    const who = agent.name.trim()
    return new ActivityLine(
      'working',
      who === '' ? t('Working…') : t`${who} is working`,
      { kind: 'glyph', name: 'working' },
    )
  }
  return ActivityLine.of(
    agent.activityKind,
    agent.activityTool,
    agent.activityDetail,
    agent.activityTarget,
    agent.activityTarget != null ? named(agent.activityTarget) : undefined,
  )
}

/**
 * What the working line shows while the agent works (`ActivityHold`, the
 * window's `EJn`): a new activity takes the place of the one shown only once
 * that one has had 0.8 s (`Apt`), so quick steps do not flicker; the same
 * words swap in place; and once one activity has shown for a minute, its
 * time joins it (`eJn`). Times are in seconds.
 */
export class ActivityHold {
  static readonly hold = 0.8
  shown: ActivityLine | undefined
  shownAt: number
  /** A newer line waiting for the shown one's 0.8 s. */
  queued: ActivityLine | undefined

  constructor(line: ActivityLine | undefined, now: number) {
    this.shown = line
    this.shownAt = now
  }

  private static same(a?: ActivityLine, b?: ActivityLine): boolean {
    if (!a || !b) return !a && !b
    return a.key === b.key && a.text === b.text
  }

  /** The line the agent's activity gives now (`XMn`). */
  want(line: ActivityLine | undefined, now: number): void {
    if (ActivityHold.same(this.shown, line)) {
      this.shown = line
      this.queued = undefined
    } else if (!this.shown || now - this.shownAt >= ActivityHold.hold) {
      this.shown = line
      this.shownAt = now
      this.queued = undefined
    } else {
      this.queued = line
    }
  }

  /** When the waiting line may take over (`QMn`). */
  get due(): number | undefined {
    return this.queued ? this.shownAt + ActivityHold.hold : undefined
  }

  /** The time on the shown line, once it has shown a minute. */
  elapsed(now: number): string | undefined {
    if (!this.shown) return undefined
    return ActivityLine.elapsed(now - this.shownAt)
  }

  /** The next whole minute on the shown line, when its time changes (`tJn`). */
  nextMinute(now: number): number | undefined {
    if (!this.shown) return undefined
    const minutes = Math.max(1, Math.floor((now - this.shownAt) / 60) + 1)
    return this.shownAt + minutes * 60
  }
}

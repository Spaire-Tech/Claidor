// The computer's notices for the window (the core's Trays.swift: `Tray`,
// `TrayList`; the box's `trays-service.ts`): "Agent failed to respond",
// "Message not delivered", "Routines paused while you were away". The Mac
// reads them only for the credits' line over the message field (an open
// agent's notice carrying the server's sentence for spent credits); the
// window drew an open agent's over its composer.

import { type JSONValue, arr, field, int, str, text } from './json'
import { t } from './l10n'
import { isInternal, noAnswer, plainError } from './plainWords'

/** A button on a notice (`kzn`): only these two kinds; the box's `switch-model` is dropped, as the window drops it. */
export type TrayAction =
  | { kind: 'openURL'; label: string; url: string }
  | {
      kind: 'dashboard'
      label: string
      action: string
      args: Record<string, string>
      successMessage?: string
    }

function actionFrom(json: JSONValue): TrayAction | undefined {
  const label = str(field(json, 'label')) ?? ''
  switch (str(field(json, 'kind'))) {
    case 'open-url': {
      const url = str(field(json, 'url'))
      return url === undefined ? undefined : { kind: 'openURL', label, url }
    }
    case 'dashboard-action': {
      const action = str(field(json, 'action'))
      if (action === undefined) return undefined
      const args: Record<string, string> = {}
      const given = field(json, 'args')
      if (given && typeof given === 'object' && !Array.isArray(given))
        for (const [key, value] of Object.entries(given))
          if (typeof value === 'string') args[key] = value
      return {
        kind: 'dashboard',
        label,
        action,
        args,
        successMessage: str(field(json, 'successMessage')),
      }
    }
    default:
      return undefined
  }
}

export interface Tray {
  id: string
  /** `error` is the only kind drawn. */
  kind: string
  /** The agent it is about: only an open agent's show, and one with none never does. */
  agentId?: string
  title: string
  detail: string
  requestId?: string
  errorKind?: string
  /** How many times it happened (the box counts repeats): "×3" past one. */
  count?: number
  actions: TrayAction[]
}

/** A notice as the box sends it; none without an id. */
export function trayFrom(json: JSONValue | undefined): Tray | undefined {
  const id = text(field(json, 'id'))
  if (id === undefined) return undefined
  return {
    id,
    kind: str(field(json, 'kind')) ?? '',
    agentId: str(field(json, 'agentId')),
    title: str(field(json, 'title')) ?? '',
    detail: str(field(json, 'detail')) ?? '',
    requestId: str(field(json, 'requestId')),
    errorKind: str(field(json, 'errorKind')),
    count: int(field(json, 'count')),
    actions: (arr(field(json, 'actions')) ?? [])
      .map(actionFrom)
      .filter((one): one is TrayAction => one !== undefined),
  }
}

/** "×3" when it happened more than once (`countLabel`). */
export function trayCountLabel(tray: Tray): string | undefined {
  return (tray.count ?? 0) > 1 ? `×${tray.count}` : undefined
}

/** The request id to copy, when there is one (`copyableRequestId`). */
export function copyableRequestId(tray: Tray): string | undefined {
  return tray.requestId === '' ? undefined : tray.requestId
}

/** The title as the person reads it (`shownTitle`): nothing behind Simeon named. */
export function shownTrayTitle(tray: Tray): string {
  return plainError(tray.title, t('Something went wrong'))
}

/** The words under it (`shownDetail`). */
export function shownTrayDetail(tray: Tray): string {
  return plainError(tray.detail, noAnswer())
}

/** Its links, only while its words are its own (`shownActions`). */
export function shownTrayActions(tray: Tray): TrayAction[] {
  return isInternal(tray.detail) || isInternal(tray.title) ? [] : tray.actions
}

/**
 * The notices as the window keeps them (`TrayList`, `hVn`, `EKe`): read
 * with `getTrays`, the `tray` events (snapshot, pushed, dismissed, cleared)
 * applied as they come, and those that arrive during a read applied again
 * over its answer.
 */
export class TrayList {
  trays: Tray[] = []
  /** A read or a snapshot has come: until then a change has nothing to apply to. */
  private loaded = false
  /** A read is on its way: the events since it started, to apply over its answer. */
  private buffered?: JSONValue[]
  private readSeq = 0

  /** One `tray` event's change (`applying`). */
  static applying(event: JSONValue, trays: readonly Tray[]): Tray[] {
    switch (str(field(event, 'type'))) {
      case 'snapshot':
        return (arr(field(event, 'trays')) ?? [])
          .map(trayFrom)
          .filter((one): one is Tray => one !== undefined)
      case 'pushed': {
        const tray = trayFrom(field(event, 'tray'))
        if (!tray) return [...trays]
        const index = trays.findIndex((one) => one.id === tray.id)
        if (index < 0) return [...trays, tray]
        const next = [...trays]
        next[index] = tray
        return next
      }
      case 'dismissed': {
        const id = text(field(event, 'id'))
        return id === undefined
          ? [...trays]
          : trays.filter((one) => one.id !== id)
      }
      case 'cleared':
        return []
      default:
        return [...trays]
    }
  }

  take(event: JSONValue): void {
    this.buffered?.push(event)
    if (!this.loaded && str(field(event, 'type')) !== 'snapshot') return
    this.loaded = true
    this.trays = TrayList.applying(event, this.trays)
  }

  /** A read begins: its number, to match its answer. A read already on its way is forgotten. */
  beginRead(): number {
    this.readSeq += 1
    this.buffered = []
    return this.readSeq
  }

  /** The answer to read `seq`, with the events since it began applied over it; a stale answer is dropped, a failed read keeps what was shown. */
  finishRead(seq: number, answer: JSONValue | undefined): void {
    const events = this.buffered
    if (seq !== this.readSeq || !events) return
    this.buffered = undefined
    const rows = arr(answer)
    if (!rows) return
    let next = rows
      .map(trayFrom)
      .filter((one): one is Tray => one !== undefined)
    for (const event of events) next = TrayList.applying(event, next)
    this.trays = next
    this.loaded = true
  }

  /** What an open agent's composer shows: its own error notices, in the box's order. */
  shown(agentId: string | undefined): Tray[] {
    if (agentId === undefined) return []
    return this.trays.filter(
      (one) => one.kind === 'error' && one.agentId === agentId,
    )
  }

  remove(id: string): void {
    this.trays = this.trays.filter((one) => one.id !== id)
  }

  removeAll(): void {
    this.trays = []
  }
}

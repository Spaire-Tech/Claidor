// The agents' computer as the screens see it (`AgentBackend`, `BackendEvent`
// and `LiveBackend` in ios/SimeonCore/Sources/SimeonCore/Backend.swift): the
// roster, the host's events in the screens' terms, commands, and calls to
// Simeon Labs' server.
//
// Translated so far: what the window and its agents list need (step 1d).
// The chat's lines (`transcript`, `TranscriptChange`), the computer's screen,
// calls, files and the rebuild come with their screens (docs/web-app/PROGRESS.md).

import type { SimeonAPI } from './api'
import { SimeonAPIError } from './api'
import { Gateway, type GatewayEvent, type Rest } from './gateway'
import { type JSONValue, arr, field, isObject, str, text } from './json'
import { t } from './l10n'
import { type Agent, agentFrom } from './models'

export type BackendEvent =
  | { kind: 'agents'; agents: Agent[] }
  | { kind: 'agentUpserted'; agent: Agent }
  /** A step the agent is on ("Checking Linear"), or done with. */
  | {
      kind: 'step'
      agentId: string
      id: string
      summary: string
      running: boolean
    }
  | { kind: 'connection'; live: boolean }
  /** The box sleeps, and the app waits for it without waking it; false once it runs again. */
  | { kind: 'computerAsleep'; asleep: boolean }
  /** A connected app changed (`mcp-auth`, `mcp-servers`). */
  | { kind: 'appsChanged' }
  /** The host's settings changed on some device (`host-settings`: the names of the fields). */
  | { kind: 'settingsChanged'; fields: string[] }
  /** An agent's routines changed (`agents-automation`: the whole list). */
  | { kind: 'automations'; agentId: string; automations: JSONValue[] }
  /** An agent's computer changed (`forever-box`: its whole status). */
  | { kind: 'computer'; status: JSONValue }
  /** The computer's disk (`box-disk-pressure`: `{level}`, or null when it has room again). */
  | { kind: 'diskPressure'; pressure: JSONValue | null }
  /** The agent moved or clicked on its computer (`computer-action`). */
  | { kind: 'computerAction'; action: JSONValue }
  /** An agent's subagents changed (`subagents`: the whole list). */
  | { kind: 'subagents'; parentId: string; subagents: JSONValue[] }
  /** The computer's notices changed (`tray`). */
  | { kind: 'tray'; tray: JSONValue }

export interface AgentBackend {
  listAgents(): Promise<Agent[]>
  /** One call to Simeon Labs' server (`/desktop/api/…`). */
  server(path: string, method?: string, body?: JSONValue): Promise<JSONValue>
  /** One command to the host; `wakes` false lets a computer that rests rest. */
  command(
    method: string,
    args?: JSONValue,
    options?: { wakes?: boolean },
  ): Promise<JSONValue>
  /** Where the computer rests, when the server lets it sleep. */
  computerRest(): Promise<Rest | null>
  /** The host's events until `signal` aborts. */
  events(
    onEvent: (event: BackendEvent) => void,
    signal: AbortSignal,
  ): Promise<void>
  /** Forgets where the computer was, so the next call asks the broker again (a restarted box can move). */
  invalidate?(): void
}

const signInFirst = () => new SimeonAPIError(t('Sign in to Simeon first.'), 401)

export class LiveBackend implements AgentBackend {
  constructor(
    readonly gateway: Gateway,
    readonly api?: SimeonAPI,
  ) {}

  /** The list (`listAgents`): read without waking a computer that rests; the server's copy shows meanwhile. */
  async listAgents(): Promise<Agent[]> {
    const answer = await this.gateway.command(
      'listAgents',
      {},
      { wakes: false },
    )
    const rows = arr(answer) ?? arr(field(answer, 'agents')) ?? []
    return rows.map(agentFrom).filter((agent): agent is Agent => agent != null)
  }

  async server(
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> {
    if (!this.api) throw signInFirst()
    return this.api.data(path, { method, json: body })
  }

  command(
    method: string,
    args: JSONValue = {},
    options: { wakes?: boolean } = {},
  ): Promise<JSONValue> {
    return this.gateway.command(method, args, options)
  }

  computerRest(): Promise<Rest | null> {
    return this.gateway.restAtLaunch()
  }

  invalidate(): void {
    this.gateway.invalidate()
  }

  events(
    onEvent: (event: BackendEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    return this.gateway.events({
      onEvent: (event) => LiveBackend.map(event).forEach(onEvent),
      onState: (live) => onEvent({ kind: 'connection', live }),
      onAsleep: (asleep) => onEvent({ kind: 'computerAsleep', asleep }),
      signal,
    })
  }

  /** The host's events, as the screens want them. */
  static map(event: GatewayEvent): BackendEvent[] {
    const payload = event.payload
    switch (event.channel) {
      case 'agents': {
        const rows = arr(payload) ?? arr(field(payload, 'agents')) ?? []
        return [
          {
            kind: 'agents',
            agents: rows.map(agentFrom).filter((a): a is Agent => a != null),
          },
        ]
      }
      case 'agent-upserted': {
        const agent = agentFrom(field(payload, 'agent'))
        return agent ? [{ kind: 'agentUpserted', agent }] : []
      }
      case 'mcp-auth':
      case 'mcp-servers':
      case 'sand:mcp-auth-event':
        return [{ kind: 'appsChanged' }]
      case 'host-settings':
        return [
          {
            kind: 'settingsChanged',
            fields: (arr(field(payload, 'fields')) ?? [])
              .map(text)
              .filter((f): f is string => !!f),
          },
        ]
      case 'agents-automation': {
        const agentId = text(field(payload, 'agentId'))
        return agentId
          ? [
              {
                kind: 'automations',
                agentId,
                automations: arr(field(payload, 'automations')) ?? [],
              },
            ]
          : []
      }
      case 'forever-box':
        return isObject(payload) ? [{ kind: 'computer', status: payload }] : []
      case 'box-disk-pressure':
        return [{ kind: 'diskPressure', pressure: payload ?? null }]
      case 'computer-action':
        return field(payload, 'agentId') == null
          ? []
          : [{ kind: 'computerAction', action: payload }]
      case 'subagents': {
        const parentId = text(field(payload, 'parentAgentId'))
        return parentId
          ? [
              {
                kind: 'subagents',
                parentId,
                subagents: arr(field(payload, 'subagents')) ?? [],
              },
            ]
          : []
      }
      case 'tray':
        return isObject(payload) ? [{ kind: 'tray', tray: payload }] : []
      case 'outline': {
        const agentId = text(field(payload, 'agentId'))
        if (!agentId) return []
        const item = field(payload, 'item')
        const items =
          item !== undefined ? [item] : (arr(field(payload, 'items')) ?? [])
        return items.flatMap((entry): BackendEvent[] => {
          const id = text(field(entry, 'id'))
          if (str(field(entry, 'kind')) !== 'tool-call' || !id) return []
          return [
            {
              kind: 'step',
              agentId,
              id,
              summary:
                text(field(entry, 'summary')) ??
                text(field(entry, 'name')) ??
                '',
              running: str(field(entry, 'status')) === 'running',
            },
          ]
        })
      }
      default:
        return []
    }
  }
}

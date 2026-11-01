// The agents' computer as the screens see it (`AgentBackend`, `BackendEvent`
// and `LiveBackend` in ios/SimeonCore/Sources/SimeonCore/Backend.swift): the
// roster, the host's events in the screens' terms, commands, and calls to
// Simeon Labs' server.
//
// Translated so far: the agents list (step 1d) and the chat's lines, sending
// and reading (step 2a). The computer's screen, calls, files and the rebuild
// come with their screens (docs/web-app/PROGRESS.md).

import type { SimeonAPI } from './api'
import { SimeonAPIError } from './api'
import { Entry, type TranscriptChange, transcriptChangeFrom } from './entry'
import { Gateway, GatewayError, type GatewayEvent, type Rest } from './gateway'
import {
  type JSONObject,
  type JSONValue,
  arr,
  field,
  int,
  isObject,
  str,
  text,
} from './json'
import { t } from './l10n'
import { type Agent, agentFrom } from './models'

/** A file the composer put on the agent's computer, by its path there and its name. */
export interface AttachmentRef {
  path: string
  name: string
}

/**
 * What goes with a message besides its words and files, as `sendPrompt`
 * takes it (host-gateway-api.ts).
 */
export interface SendOptions {
  /** The message this one answers (`replyToId`). */
  replyTo?: string
  /** A reply in a thread (`isFork`, with `replyTo` the thread's first message). */
  isFork?: boolean
  /** The composer's document (TipTap's JSON, `richText`). */
  richText?: string
  /** When it was written, for a message held while the computer was out of reach (`composedAtMs`). */
  composedAtMs?: number
}

/** Lines of a chat, newest last, and where the lines before them start (`nextBeforeSeq`), when there are more. */
export interface TranscriptPage {
  entries: Entry[]
  olderBefore?: number
}

/** A message's own id before it is sent: the nonce that makes a resent message land once. */
export function newMessageId(): string {
  return `ios-${crypto.randomUUID().toLowerCase()}`
}

export type BackendEvent =
  | { kind: 'agents'; agents: Agent[] }
  | { kind: 'agentUpserted'; agent: Agent }
  /** A line of a chat written, changed or taken away (`transcript`). */
  | { kind: 'transcript'; change: TranscriptChange }
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
  /** The newest lines (`before` undefined), or the hundred before `before`. */
  transcriptPage(agentId: string, before?: number): Promise<TranscriptPage>
  /** A chat's newest lines, read without opening it on the host: a preview, which must not mark it read. */
  tail(agentId: string, limit: number): Promise<Entry[]>
  /** A message, with the files already on the agent's computer (`uploadAttachment`), and what goes with it. */
  send(
    agentId: string,
    words: string,
    attachments: AttachmentRef[],
    options: SendOptions,
    nonce?: string,
  ): Promise<void>
  markRead(agentId: string): Promise<void>
  /** The server is waking the computer (a message handed to it): reach it now, not at the next look. */
  computerWaking?(): void
  /** One call to Simeon Labs' server (`/desktop/api/…`). */
  server(path: string, method?: string, body?: JSONValue): Promise<JSONValue>
  /** One command to the host; `wakes` false lets a computer that rests rest. */
  command(
    method: string,
    args?: JSONValue,
    options?: { wakes?: boolean },
  ): Promise<JSONValue>
  /** A read that waits for a computer that rests, without waking it (`commandWhenAwake`); ended with `signal`. */
  commandWhenAwake?(
    method: string,
    args?: JSONValue,
    signal?: AbortSignal,
  ): Promise<JSONValue>
  /** What was said in a recording (dictation, `transcribeAudio`). */
  transcribe?(audio: Uint8Array, mimeType: string): Promise<string>
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

  commandWhenAwake(
    method: string,
    args: JSONValue = {},
    signal?: AbortSignal,
  ): Promise<JSONValue> {
    return this.gateway.commandWhenAwake(method, args, signal)
  }

  transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    if (!this.api) throw signInFirst()
    return this.api.transcribe(audio, mimeType)
  }

  computerRest(): Promise<Rest | null> {
    return this.gateway.restAtLaunch()
  }

  computerWaking(): void {
    this.gateway.waking()
  }

  /**
   * A chat opened as the window opens one (`openAgentTail`, the last 500
   * lines): the host makes it the chat on screen, so its new lines stream to
   * the app as they are written. Read without waking a computer that rests;
   * the server's copy shows meanwhile. Older lines, scrolled up to, are asked
   * for, so they wake it.
   */
  async transcriptPage(
    agentId: string,
    before?: number,
  ): Promise<TranscriptPage> {
    let page: JSONValue
    if (before != null) {
      page = await this.gateway.command('getAgentTranscriptTail', {
        id: agentId,
        limit: 100,
        beforeSeq: before,
      })
    } else {
      try {
        page = await this.gateway.command(
          'openAgentTail',
          { id: agentId, limit: 500 },
          { wakes: false },
        )
      } catch (error) {
        if (GatewayError.isResting(error)) throw error
        page = await this.gateway.command(
          'getAgentTranscriptTail',
          { id: agentId, limit: 500 },
          { wakes: false },
        )
      }
    }
    return {
      entries: Entry.list(arr(field(page, 'entries')) ?? arr(page) ?? []),
      olderBefore: int(field(page, 'nextBeforeSeq')),
    }
  }

  async tail(agentId: string, limit: number): Promise<Entry[]> {
    const page = await this.gateway.command(
      'getAgentTranscriptTail',
      { id: agentId, limit },
      { wakes: false },
    )
    return Entry.list(arr(field(page, 'entries')) ?? arr(page) ?? [])
  }

  async send(
    agentId: string,
    words: string,
    attachments: AttachmentRef[],
    options: SendOptions,
    nonce?: string,
  ): Promise<void> {
    await this.gateway.command(
      'sendPrompt',
      LiveBackend.sendArguments(agentId, words, attachments, options, nonce),
    )
  }

  /**
   * `sendPrompt`'s arguments, in the host's names (host-gateway-api.ts). The
   * nonce lets a resent message land once, and the host keeps it on the line
   * it writes (`clientNonce`). `composedAtMs` only for a message held offline.
   */
  static sendArguments(
    agentId: string,
    words: string,
    attachments: AttachmentRef[],
    options: SendOptions,
    nonce?: string,
  ): JSONObject {
    const args: JSONObject = {
      agentId,
      prompt: words,
      attachmentPaths: attachments.map((file) => file.path),
      attachmentNames: attachments.map((file) => file.name),
      clientNonce: nonce ?? newMessageId(),
      directAddressedAcceptance: true,
    }
    if (options.replyTo != null) {
      args.replyToId = options.replyTo
      if (options.isFork) args.isFork = true
    }
    if (options.richText) args.richText = options.richText
    if (options.composedAtMs != null) args.composedAtMs = options.composedAtMs
    return args
  }

  async markRead(agentId: string): Promise<void> {
    try {
      await this.gateway.command(
        'setAgentUnread',
        { id: agentId, isUnread: false, atMs: Date.now() },
        { wakes: false },
      )
    } catch {
      // Read here; the host hears it next time.
    }
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
      case 'transcript': {
        const change = transcriptChangeFrom(payload)
        return change ? [{ kind: 'transcript', change }] : []
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

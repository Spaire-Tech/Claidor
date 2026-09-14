import { verbForTool } from './toolVerbs';
import {
  type AuthItem,
  Speaker,
  type StatusItem,
  type TextItem,
  type ThreadItem,
  ThreadItemKind,
} from './types';

/**
 * The engine's messages, turned into the five things a thread may show.
 *
 * This is where most of the design's discipline actually lives. The
 * engine emits thinking blocks, tool calls, tool results, streaming
 * partials, token counts and errors; the design has a bubble, a grey
 * line, a shimmer, a question and a permission. Everything else is
 * dropped here, on purpose, and this file is the one place to argue about
 * what a person sees.
 *
 * What is dropped, and why:
 *
 * | Engine | Becomes | Why |
 * |---|---|---|
 * | `assistant` with `isThinking` | nothing | The design has no thinking block. Watching a model think is not company. |
 * | `tool_use` | a `status` | One shimmering verb. Never the tool's name. |
 * | `tool_result` | nothing | It ends the status. Its content is the agent's to summarise in its own words, not ours to dump. |
 * | an empty `assistant` | nothing | A bubble with nothing in it is a bug wearing a design. |
 *
 * What is kept but changed:
 *
 * - **Errors become `system` lines**, not red banners. A failure is
 *   something that happened, said plainly and centred, in the same place
 *   as "Perrin can run commands from now on". A banner would be the only
 *   shouting in an app that never shouts.
 * - **A long reply becomes up to three short bubbles.** "The text come
 *   like texts. not ai." A four-paragraph memo is split on blank lines
 *   and the rest is kept in the last bubble rather than thrown away.
 */

/** The engine's message, as the renderer already types it. */
export interface EngineMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    toolName?: string;
    toolUseId?: string | null;
    isThinking?: boolean;
    isStreaming?: boolean;
    isError?: boolean;
    error?: string;
    agentName?: string;
    [key: string]: unknown;
  };
}

/** A permission the engine is waiting on. */
export interface EnginePermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId?: string | null;
}

export interface ToThreadOptions {
  /**
   * The agent this thread belongs to, for the orb beside a bubble.
   *
   * An identity key, never shown. It is what the palette is hashed from,
   * and it is whatever the store uses — `main`, a uuid, `engineering-lead`.
   */
  agentId?: string;
  /**
   * What the agent is called, for the one sentence that names it.
   *
   * Separate from `agentId` on purpose. The first build passed the id here
   * and an approval card read "Allow juno to continue" — the person is
   * being asked to trust something that cannot even say its own name
   * properly. Absent, the card says "this agent", which is honest.
   */
  agentName?: string;
  /** Permissions currently waiting. Each becomes an approval card. */
  pending?: readonly EnginePermissionRequest[];
  /** Names the machine on an approval card. */
  deviceId?: string;
  /** True in a group thread, where every bubble needs a sender. */
  group?: boolean;
}

/** At most this many bubbles from one reply. Three is the canvas's number. */
export const MAX_BUBBLES = 3;

/**
 * Split a reply the way a person texts: on blank lines, longest-first
 * order preserved, at most three.
 *
 * The remainder is not dropped. A reply with five paragraphs becomes two
 * bubbles and a third holding the rest — losing the tail to a formatting
 * rule would be the app quietly eating an answer.
 */
export function splitIntoBubbles(content: string): string[] {
  const parts = content
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length <= MAX_BUBBLES) return parts;
  return [
    ...parts.slice(0, MAX_BUBBLES - 1),
    parts.slice(MAX_BUBBLES - 1).join('\n\n'),
  ];
}

/**
 * The command an approval card shows.
 *
 * Whatever the tool was actually asked to do, verbatim. A `command` or
 * `script` field is the usual shape; anything else is shown as the
 * pretty-printed input, because something exact beats a summary.
 */
export function commandFromToolInput(input: Record<string, unknown>): string | undefined {
  for (const key of ['command', 'script', 'cmd', 'query', 'path', 'url']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const keys = Object.keys(input);
  if (!keys.length) return undefined;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return undefined;
  }
}

/**
 * The sentence on an approval card.
 *
 * Names the agent and what it wants, and says nothing about tools. The
 * canvas's wording, generalised: "Allow Perrin and all agents to run
 * commands on your local computer?"
 */
export function authQuestion(agentName: string | undefined, toolName: string): string {
  const who = agentName?.trim() || 'this agent';
  const what = verbForTool(toolName).toLowerCase();
  return `Allow ${who} to continue — ${what} on your computer?`;
}

const isBlank = (value: string): boolean => !value.trim();

/**
 * Turn a session's messages into what the thread shows.
 *
 * Order is preserved. A `tool_use` with no matching `tool_result` stays
 * as a live status; once its result arrives, both disappear — which is
 * the design's "removed when the work finishes".
 */
export function toThreadItems(
  messages: readonly EngineMessage[],
  options: ToThreadOptions = {},
): ThreadItem[] {
  const { agentId, group, pending = [], deviceId } = options;

  // Which tool calls have already come back. A status only survives while
  // its work is still in flight.
  const finished = new Set<string>();
  for (const message of messages) {
    if (message.type === 'tool_result') {
      const id = message.metadata?.toolUseId;
      if (typeof id === 'string') finished.add(id);
    }
  }

  const items: ThreadItem[] = [];

  for (const message of messages) {
    const meta = message.metadata ?? {};
    const at = message.timestamp;

    switch (message.type) {
      case 'user': {
        if (isBlank(message.content)) break;
        items.push({
          kind: ThreadItemKind.Text,
          id: message.id,
          from: Speaker.Person,
          text: message.content.trim(),
          at,
        } satisfies TextItem);
        break;
      }

      case 'assistant': {
        // Thinking is not shown. The design has no block for it, and the
        // voice brief says not to narrate.
        if (meta.isThinking) break;

        if (meta.isError || meta.error) {
          const text = (meta.error ?? message.content).trim();
          if (text) items.push({ kind: ThreadItemKind.System, id: message.id, text, at });
          break;
        }
        if (isBlank(message.content)) break;

        // A streaming reply stays whole: splitting a half-arrived answer
        // would make bubbles appear and then re-split as more lands.
        const parts = meta.isStreaming
          ? [message.content.trim()]
          : splitIntoBubbles(message.content);

        parts.forEach((text, index) => {
          items.push({
            kind: ThreadItemKind.Text,
            id: parts.length > 1 ? `${message.id}:${index}` : message.id,
            from: Speaker.Agent,
            text,
            ...(group && agentId ? { agentId } : {}),
            ...(group && agentId && options.agentName ? { agentName: options.agentName } : {}),
            ...(meta.isStreaming ? { streaming: true } : {}),
            at,
          } satisfies TextItem);
        });
        break;
      }

      case 'tool_use': {
        const id = meta.toolUseId;
        if (typeof id === 'string' && finished.has(id)) break;
        items.push({
          kind: ThreadItemKind.Status,
          id: message.id,
          verb: verbForTool(meta.toolName),
          ...(agentId ? { agentId } : {}),
          at,
        } satisfies StatusItem);
        break;
      }

      case 'tool_result':
        // Nothing. Its arrival is what removed the status above; its
        // content belongs to the agent to say in its own words.
        break;

      case 'system': {
        if (isBlank(message.content)) break;
        items.push({
          kind: ThreadItemKind.System,
          id: message.id,
          text: message.content.trim(),
          at,
        });
        break;
      }
    }
  }

  // Approvals last: the thread is waiting on them, so they belong at the
  // bottom where the person is looking.
  for (const request of pending) {
    items.push({
      kind: ThreadItemKind.Auth,
      id: `auth:${request.requestId}`,
      text: authQuestion(options.agentName, request.toolName),
      ...(deviceId ? { deviceId } : {}),
      ...(commandFromToolInput(request.toolInput)
        ? { command: commandFromToolInput(request.toolInput) }
        : {}),
      at: Date.now(),
    } satisfies AuthItem);
  }

  return items;
}

/**
 * The line left behind when an approval is answered.
 *
 * Answering consumes the card — the prompt is replaced by this, so a
 * thread never accumulates dead controls. The wording is the canvas's.
 */
export function decisionNote(
  agentName: string,
  decision: 'always' | 'once' | 'never',
): string {
  if (decision === 'always') {
    return `${agentName} can run commands on your computer from now on.`;
  }
  if (decision === 'once') {
    return `${agentName} can run commands on your computer this time.`;
  }
  return `Declined. ${agentName} can't run commands on your computer.`;
}

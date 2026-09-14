import { extractUserMessageFileAttachments } from '../../utils/userMessageFileAttachments';
import type { EngineMessage, EnginePermissionRequest } from '../thread/fromEngine';
import { toThreadItems } from '../thread/fromEngine';
import type { ThreadItem } from '../thread/types';
import type { SidebarAgent } from './Sidebar';

/**
 * Turning what the app already knows into what the shell shows.
 *
 * Kept apart from the hook that reads Redux, and pure, so the decisions
 * here can be tested without Electron, a store, or a render. The hook
 * beside this does nothing but fetch and call these.
 */

/** The agent shape the store already holds. */
export interface StoreAgent {
  id: string;
  name: string;
  enabled: boolean;
  pinned?: boolean;
  pinOrder?: number | null;
  sortOrder?: number | null;
}

/** The session shape the store already holds, reduced to what a row needs. */
export interface StoreSession {
  id: string;
  agentId: string;
  updatedAt?: number;
  /**
   * The last thing said, from the session list.
   *
   * Every row has this. `messages` only ever arrives for the open
   * conversation, so a preview read from `messages` alone was blank on
   * every other row in the sidebar — which is what shipped.
   */
  lastMessage?: string;
  messages?: readonly EngineMessage[];
}

/**
 * A clock-time for today and a weekday for this week, as Messages does
 * it. Older than that is a date, because "Tuesday" three weeks ago is a
 * lie dressed as helpfulness.
 */
export function whenLabel(at: number | undefined, now: number = Date.now()): string {
  if (!at) return '';
  const then = new Date(at);
  const today = new Date(now);
  const sameDay = then.toDateString() === today.toDateString();
  if (sameDay) {
    return then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const days = Math.floor((now - at) / 86_400_000);
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' });
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The one-line preview under an agent's name.
 *
 * The last thing actually *said* — not the last event. A thread whose
 * newest entry is a tool call would otherwise preview as blank, or worse,
 * as the tool's name.
 */
/**
 * One line of a message, as a list row shows it.
 *
 * The canvas strips its own file marker here —
 * `last.text.replace(/\[\[(.+?)\]\]/g, "$1")` — because a chip is a
 * bubble's idea and a row is one line of grey text. The attachment lines
 * the app appends to a person's own prompt come off for the same reason:
 * "Input Files: /Users/…" is not what anybody said.
 */
export function plainPreview(content: string): string {
  return extractUserMessageFileAttachments(content).text
    .replace(/\[\[(.+?)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function previewOf(messages: readonly EngineMessage[] | undefined): string {
  if (!messages?.length) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.type !== 'user' && message.type !== 'assistant') continue;
    if (message.metadata?.isThinking) continue;
    const text = plainPreview(message.content);
    if (text) return text;
  }
  return '';
}

export interface SidebarInput {
  agents: readonly StoreAgent[];
  /** The newest session per agent, keyed by agent id. */
  sessionsByAgent: Readonly<Record<string, StoreSession | undefined>>;
  /** Agent ids with something unread. */
  unread?: ReadonlySet<string>;
  now?: number;
}

/**
 * The sidebar rows, newest conversation first.
 *
 * Pinned agents stay at the top — that is what pinning is for — and
 * everything else falls in order of when it last said something. An agent
 * that has never been spoken to sorts last rather than being hidden: a
 * freshly installed role agent has to be findable before it has a
 * history.
 */
export function sidebarAgents(input: SidebarInput): SidebarAgent[] {
  const { agents, sessionsByAgent, unread, now = Date.now() } = input;

  return agents
    .filter(agent => agent.enabled)
    .map(agent => {
      const session = sessionsByAgent[agent.id];
      return {
        agent,
        session,
        row: {
          id: agent.id,
          name: agent.name,
          // The open conversation has its messages, and they are newer
          // than the list — a reply that just arrived is in `messages`
          // before the summary catches up. Every other row falls back to
          // the summary, which is the only thing it has.
          preview: previewOf(session?.messages) || plainPreview(session?.lastMessage ?? ''),
          when: whenLabel(session?.updatedAt, now),
          unread: unread?.has(agent.id) ?? false,
        } satisfies SidebarAgent,
      };
    })
    .sort((a, b) => {
      if (!!a.agent.pinned !== !!b.agent.pinned) return a.agent.pinned ? -1 : 1;
      if (a.agent.pinned && b.agent.pinned) {
        return (a.agent.pinOrder ?? 0) - (b.agent.pinOrder ?? 0);
      }
      return (b.session?.updatedAt ?? 0) - (a.session?.updatedAt ?? 0);
    })
    .map(entry => entry.row);
}

export interface ThreadInput {
  agentId: string;
  /** What the agent is called. Shown; the id never is. */
  agentName?: string;
  session: StoreSession | undefined;
  /** Everything the engine is waiting on, across all sessions. */
  pendingPermissions: readonly (EnginePermissionRequest & { sessionId: string })[];
  deviceName?: string;
}

/**
 * What this thread shows.
 *
 * Only this session's permissions reach it. The store keeps one queue for
 * the whole app, and an approval raised in another conversation appearing
 * here would be asking a person to agree to something they cannot see the
 * context for.
 */
export function threadItems(input: ThreadInput): ThreadItem[] {
  const { agentId, agentName, session, pendingPermissions, deviceName } = input;
  const mine = session
    ? pendingPermissions.filter(request => request.sessionId === session.id)
    : [];
  return toThreadItems(session?.messages ?? [], {
    agentId,
    ...(agentName ? { agentName } : {}),
    pending: mine,
    ...(deviceName ? { deviceId: deviceName } : {}),
  });
}

/** "Today", "Friday", "3 March" — one stamp at the top of a thread. */
export function dayStamp(messages: readonly EngineMessage[] | undefined, now = Date.now()): string | undefined {
  const first = messages?.[0]?.timestamp;
  if (!first) return undefined;
  const then = new Date(first);
  if (then.toDateString() === new Date(now).toDateString()) return 'Today';
  return whenLabel(first, now);
}

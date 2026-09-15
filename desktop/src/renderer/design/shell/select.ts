import { AgentId } from '../../../shared/agent';
import { avatarFallback } from '../../../shared/agent/avatars';
import type { Room } from '../../../shared/rooms/constants';
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
  /**
   * When it was made. Optional only because older callers predate it;
   * without it a new agent sorts as though it were ancient.
   */
  createdAt?: number;
  /** The face, 0–24. Stored on the agent; see `shared/agent/avatars.ts`. */
  avatar?: number;
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

/** Every session an agent has, newest first. */
function groupByAgent(sessions: readonly StoreSession[]): Map<string, StoreSession[]> {
  const byAgent = new Map<string, StoreSession[]>();
  for (const session of sessions) {
    if (!session.agentId) continue;
    const list = byAgent.get(session.agentId);
    if (list) list.push(session);
    else byAgent.set(session.agentId, [session]);
  }
  for (const list of byAgent.values()) {
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }
  return byAgent;
}

/** The last thing said with somebody, and when. */
export interface Standing {
  text: string;
  at?: number;
}

/**
 * The newest session that actually has something to show.
 *
 * **Not the newest session.** That was the bug. A row stands for an
 * agent, not for a session — the sidebar has one line per agent and the
 * fact that a conversation is stored as several sessions is an
 * implementation detail nobody outside this file should meet. Taking the
 * newest session meant that starting a fresh conversation, which creates
 * an empty session with a brand-new timestamp, threw away the session
 * holding every word the two of you had ever exchanged. The row then drew
 * a time with no text under it: the blank the founder kept seeing.
 *
 * Walking back to the newest session that has words in it costs one loop
 * and is the only thing a person would call correct.
 *
 * The time comes back with the text on purpose. A row that shows "now"
 * over an empty line is the same lie in a smaller font, so when nothing
 * has been said there is no timestamp either — a new agent is its name
 * and nothing else until it speaks.
 */
export function standingFor(sessions: readonly StoreSession[] | undefined): Standing {
  for (const session of sessions ?? []) {
    // The open conversation has its messages loaded, and they are newer
    // than the list — a reply that just arrived is in `messages` before
    // the summary catches up. Every other session has only the summary.
    const text = previewOf(session.messages) || plainPreview(session.lastMessage ?? '');
    if (text) return { text, at: session.updatedAt };
  }
  return { text: '' };
}

export interface SidebarInput {
  agents: readonly StoreAgent[];
  /** Every session the app knows about, in any order. */
  sessions: readonly StoreSession[];
  /** Agent ids with something unread. */
  unread?: ReadonlySet<string>;
  now?: number;
}

/**
 * The sidebar rows, most recent first.
 *
 * Pinned agents stay at the top — that is what pinning is for — and
 * everything else falls in order of when it was last *active*.
 *
 * **Making an agent counts as activity**, which is the whole of the
 * second fix. The old rule sorted on "when did it last speak" alone, so
 * an agent with no conversation scored zero and landed at the bottom of
 * the list, under every agent spoken to at any point in history. The
 * comment there said this was to keep it findable. It buried it instead:
 * you make a thing and it goes to the last place you would look.
 *
 * One rule now, `max(last spoke, was made)`, and every case falls out of
 * it: a new agent is at the top because it was just made, an old agent
 * you talked to this morning is above it if it spoke more recently, and
 * a role agent installed months ago and never used sinks on its own.
 */
export function sidebarAgents(input: SidebarInput): SidebarAgent[] {
  const { agents, sessions, unread, now = Date.now() } = input;
  const byAgent = groupByAgent(sessions);

  return agents
    .filter(agent => agent.enabled)
    .map(agent => {
      const standing = standingFor(byAgent.get(agent.id));
      return {
        agent,
        at: Math.max(standing.at ?? 0, agent.createdAt ?? 0),
        row: {
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar ?? avatarFallback(agent.id),
          preview: standing.text,
          when: whenLabel(standing.at, now),
          unread: unread?.has(agent.id) ?? false,
          // The main agent is the one conversation that always exists;
          // offering to remove it would mean an app with no way in.
          deletable: agent.id !== AgentId.Main,
        } satisfies SidebarAgent,
      };
    })
    .sort((a, b) => {
      if (!!a.agent.pinned !== !!b.agent.pinned) return a.agent.pinned ? -1 : 1;
      if (a.agent.pinned && b.agent.pinned) {
        return (a.agent.pinOrder ?? 0) - (b.agent.pinOrder ?? 0);
      }
      // Sort is stable, so agents that tie — every preset on a fresh
      // install shares a creation time — keep the order the store gave.
      return b.at - a.at;
    })
    .map(entry => entry.row);
}

/**
 * Rooms in the sidebar, alongside the agents.
 *
 * A room sorts by the most recent thing any of its members said, so it
 * moves up the list when somebody talks in it — the same rule every other
 * row follows. Its preview names who spoke last, because in a room that
 * is half the information: "Design Lead: not my end" tells you more than
 * "not my end".
 */
export function sidebarRooms(input: {
  rooms: readonly Room[];
  agents: readonly { id: string; name: string }[];
  /** Every session the app knows about, in any order. */
  sessions: readonly StoreSession[];
  now?: number;
}): SidebarAgent[] {
  const { rooms, agents, sessions, now = Date.now() } = input;
  const byAgent = groupByAgent(sessions);

  return rooms.map(room => {
    // The newest thing any member actually said — same rule as an agent
    // row, applied per seat, so an empty session belonging to one member
    // cannot silence the whole room.
    let said: { text: string; at?: number; name?: string } | undefined;
    for (const id of room.memberIds) {
      const standing = standingFor(byAgent.get(id));
      if (!standing.text) continue;
      if (said && (said.at ?? 0) >= (standing.at ?? 0)) continue;
      said = { ...standing, name: agents.find(agent => agent.id === id)?.name };
    }

    return {
      row: {
        id: room.id,
        name: room.name,
        // A room has no face of its own in the canvas. A stable one from
        // its id, so it does not change between launches.
        avatar: avatarFallback(room.id),
        preview: said?.name ? `${said.name}: ${said.text}` : (said?.text ?? ''),
        when: whenLabel(said?.at, now),
        // The trash opens the agent panel, and a room has no panel yet —
        // there is nothing for the question to be asked in. Until there
        // is, a room shows no trash rather than deleting on one click.
        deletable: false,
      } satisfies SidebarAgent,
      // Making a room counts as activity, for the same reason making an
      // agent does: a room nobody has spoken in yet still just happened.
      at: Math.max(said?.at ?? 0, room.createdAt),
    };
  })
    .sort((a, b) => b.at - a.at)
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
  /** Questions already answered, by request id and then question text. */
  answered?: Readonly<Record<string, Readonly<Record<string, string>>>>;
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
  const { agentId, agentName, session, pendingPermissions, deviceName, answered } = input;
  const mine = session
    ? pendingPermissions.filter(request => request.sessionId === session.id)
    : [];
  return toThreadItems(session?.messages ?? [], {
    agentId,
    ...(agentName ? { agentName } : {}),
    pending: mine,
    ...(deviceName ? { deviceId: deviceName } : {}),
    ...(answered ? { answered } : {}),
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

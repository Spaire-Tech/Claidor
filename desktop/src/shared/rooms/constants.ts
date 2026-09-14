/**
 * A conversation with more than one agent in it.
 *
 * **Why this is ours to build.** The engine has no room. `sessions_send`
 * is one agent, with a timeout, waiting for one reply
 * (`openclaw/src/agents/tools/sessions-send-tool.ts`) — agent-to-agent
 * messaging, not a place several of them sit. So a room is a Faiser
 * construct: one name, a few members, and a thread that merges what each
 * of them said.
 *
 * **What it is underneath.** One session per member, not one shared
 * session. Two reasons, and the second is the one that matters:
 *
 *  - Each agent keeps its own memory, skills, working folder and
 *    approval state. Pooling them into a single session would mean the
 *    Design Lead answering out of the Engineering Lead's context, which
 *    is not a room, it is one agent wearing hats.
 *  - Nothing in the thread is invented. Every bubble is a real reply from
 *    a real session, and clicking through to that agent shows the same
 *    words. A merged view that could not be reconciled with the
 *    underlying conversations would be a nice screen and a lie.
 *
 * `grok-bot-chat.md` §12 for the turn rules — short, at most about three
 * messages, silence is fine — and §11.5 for what a room cannot draw.
 */

/**
 * Ids are prefixed so a room and an agent can share one selection.
 *
 * The sidebar, the shell and the composer all pass a single "what is
 * open" id around. Prefixing is what lets that stay one value instead of
 * a value plus a kind, which is the sort of pair that gets out of step.
 */
export const ROOM_ID_PREFIX = 'room:';

/** Renderer ↔ main. */
export const RoomIpc = {
  List: 'rooms:list',
  Create: 'rooms:create',
  Update: 'rooms:update',
  Delete: 'rooms:delete',
} as const;
export type RoomIpc = typeof RoomIpc[keyof typeof RoomIpc];

export interface Room {
  /** Always starts `room:`. */
  id: string;
  name: string;
  /** Agent ids, in the order they were seated. */
  memberIds: readonly string[];
  createdAt: number;
}

export function isRoomId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(ROOM_ID_PREFIX);
}

export function roomId(raw: string): string {
  return isRoomId(raw) ? raw : `${ROOM_ID_PREFIX}${raw}`;
}

/**
 * Two, because one agent is a conversation and this is not that.
 *
 * Creating a "room" with a single member would make two ways to do the
 * same thing, and the one with a name and a member list is the worse of
 * the two.
 */
export const ROOM_MIN_MEMBERS = 2;

/**
 * Six.
 *
 * Every member is a model call on every message, so a room of twelve
 * costs twelve replies to read and twelve turns to pay for. The point of
 * a room is a few people who need to hear each other, and past about six
 * a person stops reading and starts skimming — at which point the room is
 * costing money to produce something nobody reads.
 */
export const ROOM_MAX_MEMBERS = 6;

export const RoomError = {
  TooFew: 'too-few',
  TooMany: 'too-many',
  NoName: 'no-name',
  Duplicate: 'duplicate-member',
  Unknown: 'unknown-member',
} as const;
export type RoomError = typeof RoomError[keyof typeof RoomError];

export interface RoomDraft {
  name: string;
  memberIds: readonly string[];
}

/**
 * Whether a room can be made, and why not.
 *
 * Returns the reason rather than a boolean so the screen can say which
 * thing is wrong. "That did not work" is the least useful sentence in
 * software.
 */
export function roomProblem(
  draft: RoomDraft,
  knownAgentIds: readonly string[],
): RoomError | undefined {
  if (!draft.name.trim()) return RoomError.NoName;
  if (new Set(draft.memberIds).size !== draft.memberIds.length) return RoomError.Duplicate;
  if (draft.memberIds.length < ROOM_MIN_MEMBERS) return RoomError.TooFew;
  if (draft.memberIds.length > ROOM_MAX_MEMBERS) return RoomError.TooMany;
  if (draft.memberIds.some(id => !knownAgentIds.includes(id))) return RoomError.Unknown;
  return undefined;
}

/** What to tell somebody, in their words rather than the code's. */
export function roomProblemText(problem: RoomError, names: { min: number; max: number } = {
  min: ROOM_MIN_MEMBERS, max: ROOM_MAX_MEMBERS,
}): string {
  switch (problem) {
    case RoomError.NoName:
      return 'Give it a name.';
    case RoomError.TooFew:
      return `Pick at least ${names.min} — one agent on its own is just a conversation.`;
    case RoomError.TooMany:
      return `That is more than ${names.max}. Everybody answers every message, so a big room is a lot to read.`;
    case RoomError.Duplicate:
      return 'One of those is in twice.';
    case RoomError.Unknown:
    default:
      return 'One of those agents is no longer here.';
  }
}

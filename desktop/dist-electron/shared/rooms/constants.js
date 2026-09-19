"use strict";
/**
 * A conversation with more than one agent in it.
 *
 * **Why this is ours to build.** The engine has no room. `sessions_send`
 * is one agent, with a timeout, waiting for one reply
 * (`openclaw/src/agents/tools/sessions-send-tool.ts`) — agent-to-agent
 * messaging, not a place several of them sit. So a room is a Caisra
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomError = exports.ROOM_MAX_MEMBERS = exports.ROOM_MIN_MEMBERS = exports.RoomIpc = exports.ROOM_ID_PREFIX = void 0;
exports.isRoomId = isRoomId;
exports.roomId = roomId;
exports.roomProblem = roomProblem;
exports.roomProblemText = roomProblemText;
/**
 * Ids are prefixed so a room and an agent can share one selection.
 *
 * The sidebar, the shell and the composer all pass a single "what is
 * open" id around. Prefixing is what lets that stay one value instead of
 * a value plus a kind, which is the sort of pair that gets out of step.
 */
exports.ROOM_ID_PREFIX = 'room:';
/** Renderer ↔ main. */
exports.RoomIpc = {
    List: 'rooms:list',
    Create: 'rooms:create',
    Update: 'rooms:update',
    Delete: 'rooms:delete',
};
function isRoomId(id) {
    return typeof id === 'string' && id.startsWith(exports.ROOM_ID_PREFIX);
}
function roomId(raw) {
    return isRoomId(raw) ? raw : `${exports.ROOM_ID_PREFIX}${raw}`;
}
/**
 * Two, because one agent is a conversation and this is not that.
 *
 * Creating a "room" with a single member would make two ways to do the
 * same thing, and the one with a name and a member list is the worse of
 * the two.
 */
exports.ROOM_MIN_MEMBERS = 2;
/**
 * Six.
 *
 * Every member is a model call on every message, so a room of twelve
 * costs twelve replies to read and twelve turns to pay for. The point of
 * a room is a few people who need to hear each other, and past about six
 * a person stops reading and starts skimming — at which point the room is
 * costing money to produce something nobody reads.
 */
exports.ROOM_MAX_MEMBERS = 6;
exports.RoomError = {
    TooFew: 'too-few',
    TooMany: 'too-many',
    NoName: 'no-name',
    Duplicate: 'duplicate-member',
    Unknown: 'unknown-member',
};
/**
 * Whether a room can be made, and why not.
 *
 * Returns the reason rather than a boolean so the screen can say which
 * thing is wrong. "That did not work" is the least useful sentence in
 * software.
 */
function roomProblem(draft, knownAgentIds) {
    if (!draft.name.trim())
        return exports.RoomError.NoName;
    if (new Set(draft.memberIds).size !== draft.memberIds.length)
        return exports.RoomError.Duplicate;
    if (draft.memberIds.length < exports.ROOM_MIN_MEMBERS)
        return exports.RoomError.TooFew;
    if (draft.memberIds.length > exports.ROOM_MAX_MEMBERS)
        return exports.RoomError.TooMany;
    if (draft.memberIds.some(id => !knownAgentIds.includes(id)))
        return exports.RoomError.Unknown;
    return undefined;
}
/** What to tell somebody, in their words rather than the code's. */
function roomProblemText(problem, names = {
    min: exports.ROOM_MIN_MEMBERS, max: exports.ROOM_MAX_MEMBERS,
}) {
    switch (problem) {
        case exports.RoomError.NoName:
            return 'Give it a name.';
        case exports.RoomError.TooFew:
            return `Pick at least ${names.min} — one agent on its own is just a conversation.`;
        case exports.RoomError.TooMany:
            return `That is more than ${names.max}. Everybody answers every message, so a big room is a lot to read.`;
        case exports.RoomError.Duplicate:
            return 'One of those is in twice.';
        case exports.RoomError.Unknown:
        default:
            return 'One of those agents is no longer here.';
    }
}
//# sourceMappingURL=constants.js.map
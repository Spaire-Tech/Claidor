"use strict";
/**
 * IM conversation ID parsing shared by main and renderer.
 *
 * Conversation IDs persisted in `im_session_mappings` derive from OpenClaw
 * session keys (see parseChannelSessionKey in openclawChannelSessionSync) and
 * come in three shapes:
 *   - "{peerKind}:{peerId}"                  e.g. "direct:alice@corp.example.com"
 *   - "{accountId}:{peerKind}:{peerId}"      e.g. "cebef798:direct:8368898190"
 *   - plain id                               e.g. "oc_a1b2c3" or "123456789"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImPeerKind = void 0;
exports.parseImConversationId = parseImConversationId;
exports.imConversationDisplayName = imConversationDisplayName;
exports.ImPeerKind = {
    Direct: 'direct',
    Group: 'group',
    Channel: 'channel',
};
const PEER_KINDS = new Set(Object.values(exports.ImPeerKind));
/** Split a stored conversation ID into accountId / peerKind / peerId segments. */
function parseImConversationId(conversationId) {
    const raw = conversationId.trim();
    const segments = raw.split(':');
    for (let i = 0; i < segments.length - 1; i++) {
        if (PEER_KINDS.has(segments[i])) {
            const peerId = segments.slice(i + 1).join(':');
            if (!peerId)
                break;
            return {
                ...(i > 0 ? { accountId: segments.slice(0, i).join(':') } : {}),
                peerKind: segments[i],
                peerId,
            };
        }
    }
    return { peerId: raw };
}
/**
 * Human-oriented rendering of a conversation ID: the peer identifier without
 * account prefix, peer-kind segment, or email-style domain suffix.
 * Falls back to the trimmed input when nothing recognizable is left.
 */
function imConversationDisplayName(conversationId) {
    const { peerId } = parseImConversationId(conversationId);
    const stripped = peerId.replace(/@[^:]+/g, '');
    return stripped || peerId || conversationId.trim();
}
//# sourceMappingURL=conversationId.js.map
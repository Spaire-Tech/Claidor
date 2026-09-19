"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCoworkSessionIdByOpenClawSessionKey = resolveCoworkSessionIdByOpenClawSessionKey;
exports.getCoworkParentSessionId = getCoworkParentSessionId;
exports.isCoworkSessionBoundToIm = isCoworkSessionBoundToIm;
exports.resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey = resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey;
const openclawChannelSessionSync_1 = require("./openclawChannelSessionSync");
const MAX_PARENT_LOOKUP_DEPTH = 16;
const getSessionRowById = (db, sessionId) => {
    const normalized = sessionId.trim();
    if (!normalized)
        return null;
    const row = db
        .prepare('SELECT id, parent_session_id FROM cowork_sessions WHERE id = ? LIMIT 1')
        .get(normalized);
    return row ?? null;
};
const getSessionRowByClaudeSessionId = (db, sessionKey) => {
    const normalized = sessionKey.trim();
    if (!normalized)
        return null;
    const row = db
        .prepare('SELECT id, parent_session_id FROM cowork_sessions WHERE claude_session_id = ? LIMIT 1')
        .get(normalized);
    return row ?? null;
};
function resolveCoworkSessionIdByOpenClawSessionKey(db, sessionKey) {
    const normalized = (sessionKey ?? '').trim();
    if (!normalized)
        return null;
    const persisted = getSessionRowByClaudeSessionId(db, normalized);
    if (persisted)
        return persisted.id;
    const managed = (0, openclawChannelSessionSync_1.parseManagedSessionKey)(normalized);
    if (!managed)
        return null;
    const session = getSessionRowById(db, managed.sessionId);
    return session?.id ?? null;
}
function getCoworkParentSessionId(db, sessionId) {
    const normalized = (sessionId ?? '').trim();
    if (!normalized)
        return null;
    return getSessionRowById(db, normalized)?.parent_session_id ?? null;
}
function isCoworkSessionBoundToIm(db, sessionId) {
    let current = sessionId.trim();
    const seen = new Set();
    for (let depth = 0; current && depth < MAX_PARENT_LOOKUP_DEPTH; depth++) {
        if (seen.has(current))
            return false;
        seen.add(current);
        const mapping = db
            .prepare('SELECT 1 FROM im_session_mappings WHERE cowork_session_id = ? LIMIT 1')
            .get(current);
        if (mapping)
            return true;
        current = getCoworkParentSessionId(db, current);
    }
    return false;
}
function resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey(db, sessionKey) {
    const sessionId = resolveCoworkSessionIdByOpenClawSessionKey(db, sessionKey);
    if (!sessionId)
        return null;
    return isCoworkSessionBoundToIm(db, sessionId) ? null : sessionId;
}
//# sourceMappingURL=openclawLocalSessionResolver.js.map
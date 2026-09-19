"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findCronRunHistoryLocalIndexMatch = exports.findCronRunHistoryLocalMatch = exports.shouldReplaceLocalConversationWithCronHistory = exports.isLocalConversationCoveredByCronHistory = exports.hasCronRunHistoryForSession = exports.buildCronRunLocalHistoryEntries = exports.buildCronRunHistoryEntries = exports.getCronRunHistoryEntryIndex = exports.getCronRunHistorySessionKey = void 0;
const openclawCronSessionKey_1 = require("../../../shared/cowork/openclawCronSessionKey");
const openclawHistory_1 = require("../openclawHistory");
const openclawConversationReconciliation_1 = require("./openclawConversationReconciliation");
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const getCronRunHistorySessionKey = (metadata) => {
    if (!isRecord(metadata))
        return null;
    const value = metadata[openclawCronSessionKey_1.OpenClawCronRunMetadataKey.SessionKey];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
};
exports.getCronRunHistorySessionKey = getCronRunHistorySessionKey;
const getCronRunHistoryEntryIndex = (metadata) => {
    if (!isRecord(metadata))
        return null;
    const value = metadata[openclawCronSessionKey_1.OpenClawCronRunMetadataKey.EntryIndex];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
};
exports.getCronRunHistoryEntryIndex = getCronRunHistoryEntryIndex;
const withCronRunHistoryMetadata = (entry, sessionKey, entryIndex) => ({
    ...entry,
    metadata: {
        ...(entry.metadata ?? {}),
        [openclawCronSessionKey_1.OpenClawCronRunMetadataKey.SessionKey]: sessionKey,
        [openclawCronSessionKey_1.OpenClawCronRunMetadataKey.EntryIndex]: entryIndex,
    },
});
const buildCronRunHistoryEntries = (historyMessages, sessionKey) => {
    const entries = [];
    for (const entry of (0, openclawHistory_1.extractGatewayHistoryEntries)(historyMessages)) {
        const role = entry.role;
        if (role !== 'user' && role !== 'assistant')
            continue;
        const text = entry.text.trim();
        if (!text || (0, openclawHistory_1.shouldSuppressHeartbeatText)(role, text))
            continue;
        let metadata;
        if (role === 'assistant' && (entry.usage || entry.model)) {
            metadata = {};
            if (entry.usage) {
                metadata.usage = {
                    ...(entry.usage.input != null && { inputTokens: entry.usage.input }),
                    ...(entry.usage.output != null && { outputTokens: entry.usage.output }),
                };
            }
            if (entry.model) {
                metadata.model = entry.model;
            }
        }
        entries.push(withCronRunHistoryMetadata({
            role,
            text,
            ...(metadata && { metadata }),
            ...(entry.timestamp != null && { timestamp: entry.timestamp }),
        }, sessionKey, entries.length));
    }
    return entries;
};
exports.buildCronRunHistoryEntries = buildCronRunHistoryEntries;
const buildCronRunLocalHistoryEntries = (messages) => {
    return messages
        .filter((message) => message.type === 'user' || message.type === 'assistant')
        .map((message) => ({
        id: message.id,
        role: message.type,
        text: message.content.trim(),
        metadata: isRecord(message.metadata) ? message.metadata : undefined,
        timestamp: message.timestamp,
    }))
        .filter((entry) => entry.text && !(0, openclawHistory_1.shouldSuppressHeartbeatText)(entry.role, entry.text));
};
exports.buildCronRunLocalHistoryEntries = buildCronRunLocalHistoryEntries;
const hasCronRunHistoryForSession = (messages, sessionKey) => {
    return messages.some((message) => (0, exports.getCronRunHistorySessionKey)(message.metadata) === sessionKey);
};
exports.hasCronRunHistoryForSession = hasCronRunHistoryForSession;
const isLocalConversationCoveredByCronHistory = (localEntries, authoritativeEntries) => {
    if (localEntries.length > authoritativeEntries.length)
        return false;
    let authIdx = 0;
    for (const local of localEntries) {
        let matched = false;
        while (authIdx < authoritativeEntries.length) {
            const authoritative = authoritativeEntries[authIdx++];
            if ((0, openclawConversationReconciliation_1.isSameHistoryEntry)(local, authoritative)) {
                matched = true;
                break;
            }
        }
        if (!matched)
            return false;
    }
    return true;
};
exports.isLocalConversationCoveredByCronHistory = isLocalConversationCoveredByCronHistory;
const shouldReplaceLocalConversationWithCronHistory = (localEntries, authoritativeEntries, sessionKey) => {
    const hasOtherCronRunHistory = localEntries.some((entry) => {
        const importedSessionKey = (0, exports.getCronRunHistorySessionKey)(entry.metadata);
        return Boolean(importedSessionKey && importedSessionKey !== sessionKey);
    });
    return !hasOtherCronRunHistory
        && (0, exports.isLocalConversationCoveredByCronHistory)(localEntries, authoritativeEntries);
};
exports.shouldReplaceLocalConversationWithCronHistory = shouldReplaceLocalConversationWithCronHistory;
const findCronRunHistoryLocalMatch = (authoritative, localEntries, usedLocalMessageIds, sessionKey) => {
    return localEntries.find((entry) => {
        if (usedLocalMessageIds.has(entry.id))
            return false;
        if (!(0, openclawConversationReconciliation_1.isSameHistoryEntry)(entry, authoritative))
            return false;
        const importedSessionKey = (0, exports.getCronRunHistorySessionKey)(entry.metadata);
        return !importedSessionKey || importedSessionKey === sessionKey;
    });
};
exports.findCronRunHistoryLocalMatch = findCronRunHistoryLocalMatch;
const findCronRunHistoryLocalIndexMatch = (authoritative, localEntries, usedLocalMessageIds, sessionKey) => {
    const authoritativeIndex = (0, exports.getCronRunHistoryEntryIndex)(authoritative.metadata);
    if (authoritativeIndex === null)
        return undefined;
    return localEntries.find((entry) => (!usedLocalMessageIds.has(entry.id)
        && entry.role === authoritative.role
        && (0, exports.getCronRunHistorySessionKey)(entry.metadata) === sessionKey
        && (0, exports.getCronRunHistoryEntryIndex)(entry.metadata) === authoritativeIndex));
};
exports.findCronRunHistoryLocalIndexMatch = findCronRunHistoryLocalIndexMatch;
//# sourceMappingURL=openclawCronRunHistorySync.js.map
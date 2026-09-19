"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSubagentChildHistorySyncPlan = exports.normalizeSubagentVisibleUserText = void 0;
const openclawHistory_1 = require("../../openclawHistory");
const historyParser_1 = require("./historyParser");
const normalizeMetadata = (metadata) => (metadata ? { ...metadata } : undefined);
const sortForStableJson = (value) => {
    if (Array.isArray(value)) {
        return value.map(sortForStableJson);
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
        sorted[key] = sortForStableJson(value[key]);
    }
    return sorted;
};
const stableJson = (value) => JSON.stringify(sortForStableJson(value));
const isSameHistoryMessage = (left, right) => (left.type === right.type
    && left.content === right.content
    && stableJson(left.metadata ?? null) === stableJson(right.metadata ?? null));
const buildLocalEntries = (localMessages) => {
    let normalizedLocalUserContent = false;
    const entries = localMessages
        .filter((message) => message.type !== 'system')
        .map((message) => {
        const content = message.type === 'user'
            ? (0, exports.normalizeSubagentVisibleUserText)(message.content)
            : message.content;
        if (message.type === 'user' && content !== message.content) {
            normalizedLocalUserContent = true;
        }
        return {
            type: message.type,
            content,
            timestamp: message.timestamp,
            metadata: normalizeMetadata(message.metadata),
        };
    })
        .filter((entry) => entry.type === 'tool_use' || entry.content.trim());
    return { entries, normalizedLocalUserContent };
};
const toStoredEntry = (message) => {
    if (message.type !== 'tool_use' && !message.content.trim()) {
        return null;
    }
    if (message.type === 'user') {
        const content = (0, exports.normalizeSubagentVisibleUserText)(message.content).trim();
        if (!content || (0, openclawHistory_1.shouldSuppressHeartbeatText)('user', content)) {
            return null;
        }
        return {
            type: 'user',
            content,
            timestamp: message.timestamp,
            metadata: normalizeMetadata(message.metadata),
        };
    }
    if (message.type === 'assistant') {
        const content = message.content.trim();
        if (!content || (0, openclawHistory_1.shouldSuppressHeartbeatText)('assistant', content)) {
            return null;
        }
        return {
            type: 'assistant',
            content,
            timestamp: message.timestamp,
            metadata: {
                isStreaming: false,
                isFinal: true,
                ...(message.metadata ?? {}),
            },
        };
    }
    if (message.type === 'system')
        return null;
    return {
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        metadata: normalizeMetadata(message.metadata),
    };
};
const normalizeSubagentVisibleUserText = (text) => {
    const currentRequestMarker = '[Current user request]';
    const currentRequestIndex = text.lastIndexOf(currentRequestMarker);
    if (currentRequestIndex >= 0) {
        const visible = text.slice(currentRequestIndex + currentRequestMarker.length).trim();
        if (visible)
            return visible;
    }
    const taskMarker = '[Subagent Task]';
    const taskIndex = text.lastIndexOf(taskMarker);
    if (taskIndex >= 0) {
        const taskStart = taskIndex + taskMarker.length;
        const taskTail = text.slice(taskStart);
        const beginMatch = /\n\s*Begin\. Execute the assigned task to completion\./.exec(taskTail);
        const visible = (beginMatch ? taskTail.slice(0, beginMatch.index) : taskTail).trim();
        if (visible)
            return visible;
    }
    return text;
};
exports.normalizeSubagentVisibleUserText = normalizeSubagentVisibleUserText;
const buildSubagentChildHistorySyncPlan = (localMessages, historyMessages) => {
    const { entries: localEntries, normalizedLocalUserContent } = buildLocalEntries(localMessages);
    const localUsers = localEntries.filter((entry) => entry.type === 'user');
    let localUserIndex = 0;
    const mergedEntries = [];
    for (const message of (0, historyParser_1.parseSubagentGatewayHistoryMessages)(historyMessages)) {
        if (message.type === 'user') {
            const localUser = localUsers[localUserIndex++];
            if (localUser) {
                mergedEntries.push(localUser);
                continue;
            }
            const visibleText = (0, exports.normalizeSubagentVisibleUserText)(message.content).trim();
            if (visibleText && !(0, openclawHistory_1.shouldSuppressHeartbeatText)('user', visibleText)) {
                mergedEntries.push({
                    type: 'user',
                    content: visibleText,
                    timestamp: message.timestamp,
                    metadata: normalizeMetadata(message.metadata),
                });
            }
            continue;
        }
        const storedEntry = toStoredEntry(message);
        if (storedEntry)
            mergedEntries.push(storedEntry);
    }
    for (; localUserIndex < localUsers.length; localUserIndex += 1) {
        mergedEntries.push(localUsers[localUserIndex]);
    }
    if (mergedEntries.length === 0) {
        return {
            changed: false,
            cursor: 0,
            entriesToStore: [],
            localEntries,
        };
    }
    const isInSync = !normalizedLocalUserContent
        && localEntries.length === mergedEntries.length
        && localEntries.every((entry, index) => isSameHistoryMessage(entry, mergedEntries[index]));
    return {
        changed: !isInSync,
        cursor: mergedEntries.length,
        entriesToStore: mergedEntries,
        localEntries,
    };
};
exports.buildSubagentChildHistorySyncPlan = buildSubagentChildHistorySyncPlan;
//# sourceMappingURL=childHistorySync.js.map
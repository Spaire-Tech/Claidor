"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOpenClawDeliveryRoute = extractOpenClawDeliveryRoute;
exports.findOpenClawDeliveryRouteForSession = findOpenClawDeliveryRouteForSession;
exports.resolveOpenClawDeliveryRouteForSessionKeys = resolveOpenClawDeliveryRouteForSessionKeys;
exports.resolveManagedSessionDeliveryRoute = resolveManagedSessionDeliveryRoute;
exports.buildDingTalkSendParamsFromRoute = buildDingTalkSendParamsFromRoute;
exports.buildDingTalkSessionKeyCandidates = buildDingTalkSessionKeyCandidates;
const openclawChannelSessionSync_1 = require("../libs/openclawChannelSessionSync");
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const readTrimmedString = (value) => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim();
    return normalized || undefined;
};
function extractOpenClawDeliveryRoute(entry) {
    if (!isRecord(entry)) {
        return null;
    }
    const typedEntry = entry;
    const deliveryContext = isRecord(typedEntry.deliveryContext)
        ? typedEntry.deliveryContext
        : null;
    const channel = readTrimmedString(deliveryContext?.channel) ?? readTrimmedString(typedEntry.lastChannel);
    const to = readTrimmedString(deliveryContext?.to) ?? readTrimmedString(typedEntry.lastTo);
    const accountId = readTrimmedString(deliveryContext?.accountId) ?? readTrimmedString(typedEntry.lastAccountId);
    if (!channel || !to) {
        return null;
    }
    return {
        channel,
        to,
        ...(accountId ? { accountId } : {}),
    };
}
function findOpenClawDeliveryRouteForSession(sessionKey, sessions) {
    const normalizedSessionKey = sessionKey.trim();
    if (!normalizedSessionKey) {
        return null;
    }
    for (const entry of sessions) {
        if (!isRecord(entry)) {
            continue;
        }
        const entryKey = readTrimmedString(entry.key);
        if (entryKey !== normalizedSessionKey) {
            continue;
        }
        return extractOpenClawDeliveryRoute(entry);
    }
    return null;
}
function resolveOpenClawDeliveryRouteForSessionKeys(sessionKeys, sessions) {
    const seen = new Set();
    for (const rawSessionKey of sessionKeys) {
        const sessionKey = rawSessionKey.trim();
        if (!sessionKey || seen.has(sessionKey)) {
            continue;
        }
        seen.add(sessionKey);
        const route = findOpenClawDeliveryRouteForSession(sessionKey, sessions);
        if (route) {
            return { sessionKey, route };
        }
    }
    return null;
}
function resolveManagedSessionDeliveryRoute(coworkSessionId, sessions) {
    return resolveOpenClawDeliveryRouteForSessionKeys([(0, openclawChannelSessionSync_1.buildManagedSessionKey)(coworkSessionId)], sessions);
}
function buildDingTalkSendParamsFromRoute(route) {
    const channel = route.channel.trim().toLowerCase();
    if (channel !== 'dingtalk-connector' && channel !== 'dingtalk') {
        return null;
    }
    return {
        target: route.to,
        ...(route.accountId ? { accountId: route.accountId } : {}),
    };
}
function buildDingTalkSessionKeyCandidates(conversationId, agentId) {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
        return [];
    }
    const effectiveAgentId = agentId || openclawChannelSessionSync_1.DEFAULT_MANAGED_AGENT_ID;
    return [
        `agent:${effectiveAgentId}:openai-user:dingtalk-connector:${normalizedConversationId}`,
        `agent:${effectiveAgentId}:dingtalk-connector:${normalizedConversationId}`,
        `dingtalk-connector:${normalizedConversationId}`,
    ];
}
//# sourceMappingURL=imDeliveryRoute.js.map
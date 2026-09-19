"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initScheduledTaskHelpers = initScheduledTaskHelpers;
exports.listScheduledTaskChannels = listScheduledTaskChannels;
exports.resolveImDeliveryHintsFromSessions = resolveImDeliveryHintsFromSessions;
exports.resolveGroupDeliveryTargetFromSessions = resolveGroupDeliveryTargetFromSessions;
exports.resolveWecomGroupDeliveryTargetFromSessions = resolveWecomGroupDeliveryTargetFromSessions;
exports.resolveConversationAgentIdFromMappings = resolveConversationAgentIdFromMappings;
exports.dedupeConversationMappings = dedupeConversationMappings;
exports.filterConversationMappingsForSelectedAccount = filterConversationMappingsForSelectedAccount;
const platform_1 = require("../../../shared/platform");
const openclawChannelSessionSync_1 = require("../../libs/openclawChannelSessionSync");
let deps = null;
const WECOM_PLATFORM = 'wecom';
function initScheduledTaskHelpers(d) {
    deps = d;
}
const MULTI_INSTANCE_CONFIG_KEYS = new Set(['dingtalk', 'feishu', 'nim', 'qq', 'wecom', 'telegram', 'discord', 'popo']);
function deriveNimRuntimeAccountId(value) {
    if (!value || typeof value !== 'object')
        return null;
    const inst = value;
    const nimToken = inst.nimToken?.trim();
    if (nimToken) {
        const delimiter = nimToken.includes('|') ? '|' : '-';
        const parts = nimToken.split(delimiter).map((part) => part.trim());
        if (parts.length === 3 && parts[0] && parts[1]) {
            return `${parts[0]}:${parts[1]}`;
        }
    }
    if (inst.appKey?.trim() && inst.account?.trim()) {
        return `${inst.appKey.trim()}:${inst.account.trim()}`;
    }
    return null;
}
function isConfigKeyEnabled(key, value) {
    if (!value || typeof value !== 'object')
        return false;
    if (MULTI_INSTANCE_CONFIG_KEYS.has(key)) {
        const instances = value.instances;
        if (!Array.isArray(instances) || instances.length === 0)
            return false;
        return instances.some((inst) => inst && typeof inst === 'object' && inst.enabled);
    }
    return value.enabled === true;
}
function listScheduledTaskChannels() {
    const manager = deps?.getIMGatewayManager();
    const config = manager?.getConfig();
    if (!config) {
        return [...platform_1.PlatformRegistry.channelOptions()];
    }
    const configRecord = config;
    const enabledPlatforms = new Set();
    // For multi-instance platforms: collect per-instance info (accountId + name).
    const instancesByPlatform = new Map();
    for (const [key, value] of Object.entries(configRecord)) {
        if (!isConfigKeyEnabled(key, value))
            continue;
        enabledPlatforms.add(key);
        if (MULTI_INSTANCE_CONFIG_KEYS.has(key)) {
            const instances = value.instances ?? [];
            const entries = instances
                .filter((inst) => inst && typeof inst === 'object' && inst.enabled)
                .map((inst) => {
                const i = inst;
                const nimAccountId = key === 'nim'
                    ? ((i.instanceId ?? '').slice(0, 8) || deriveNimRuntimeAccountId(inst))
                    : null;
                const accountId = nimAccountId ?? (i.instanceId ?? '').slice(0, 8);
                return {
                    accountId,
                    // Leave unnamed instances empty; the renderer falls back to an
                    // ordinal label instead of exposing an account id fragment.
                    instanceName: (i.instanceName ?? '').trim(),
                    filterAccountId: accountId || undefined,
                };
            })
                .filter((e) => e.accountId);
            if (entries.length > 0)
                instancesByPlatform.set(key, entries);
        }
    }
    const result = [];
    for (const option of platform_1.PlatformRegistry.channelOptions()) {
        const platform = platform_1.PlatformRegistry.platformOfChannel(option.value);
        if (platform === undefined || !enabledPlatforms.has(platform))
            continue;
        const instances = instancesByPlatform.get(platform);
        if (instances && instances.length > 0) {
            // Multi-instance: one option per enabled instance, each carrying its accountId.
            for (const inst of instances) {
                result.push({
                    value: option.value,
                    label: inst.instanceName,
                    accountId: inst.accountId,
                    filterAccountId: inst.filterAccountId,
                });
            }
        }
        else {
            result.push(option);
        }
    }
    return result;
}
function asNonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function isAccountlessGroupOrChannel(parsed) {
    return !parsed.accountId && (parsed.peerKind === platform_1.ImPeerKind.Group ||
        parsed.peerKind === platform_1.ImPeerKind.Channel);
}
/**
 * Restores the channel-native delivery target from gateway session rows.
 *
 * Conversation ids in `im_session_mappings` derive from OpenClaw session keys,
 * which are canonicalized to lowercase. Some channels (e.g. weixin) route by
 * case-sensitive peer ids and echo per-conversation context tokens keyed by
 * the original id, so a lowercased `delivery.to` is accepted by the provider
 * but never reaches the user. Session entries keep the original casing in
 * `lastTo`/`deliveryContext`, so match the peer case-insensitively and return
 * the stored casing plus the account that owns the conversation.
 */
function resolveImDeliveryHintsFromSessions(params) {
    const platform = platform_1.PlatformRegistry.platformOfChannel(params.channel);
    const requestedPeer = (0, platform_1.parseImConversationId)(params.peerId);
    const peerLower = requestedPeer.peerId.trim().toLowerCase();
    if (!platform || !peerLower)
        return null;
    const candidates = [];
    for (const row of params.sessions) {
        if (!row || typeof row !== 'object')
            continue;
        const session = row;
        const context = session.deliveryContext;
        const rowChannel = asNonEmptyString(session.lastChannel) ??
            asNonEmptyString(context?.channel) ??
            asNonEmptyString(session.channel);
        if (!rowChannel || platform_1.PlatformRegistry.platformOfChannel(rowChannel) !== platform)
            continue;
        const to = asNonEmptyString(session.lastTo) ?? asNonEmptyString(context?.to);
        const toPeer = to ? (0, platform_1.parseImConversationId)(to).peerId : '';
        if (!to || toPeer.toLowerCase() !== peerLower)
            continue;
        candidates.push({
            to,
            accountId: asNonEmptyString(session.lastAccountId) ?? asNonEmptyString(context?.accountId),
            updatedAt: typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt)
                ? session.updatedAt
                : 0,
        });
    }
    if (candidates.length === 0)
        return null;
    const preferred = params.preferredAccountId
        ? candidates.filter(candidate => candidate.accountId === params.preferredAccountId)
        : [];
    const pool = preferred.length > 0 ? preferred : candidates;
    // Inbound activity keeps the live conversation session freshest; sessions
    // from replaced bot accounts stop updating once the account is gone.
    pool.sort((a, b) => b.updatedAt - a.updatedAt);
    const best = pool[0];
    return { to: best.to, ...(best.accountId ? { accountId: best.accountId } : {}) };
}
/**
 * Restores a case-sensitive native group id from inbound session origin
 * metadata. OpenClaw lowercases channel peer ids in session keys, but providers
 * such as WeCom and DingTalk require their opaque group ids unchanged.
 *
 * This is deliberately narrower than `resolveImDeliveryHintsFromSessions`:
 * only group origins from the requested platform are considered, an explicitly
 * selected account must match, and conflicting native ids are rejected.
 */
function resolveGroupDeliveryTargetFromSessions(params) {
    const requestedPeer = (0, platform_1.parseImConversationId)(params.peerId).peerId.trim().toLowerCase();
    const preferredAccountId = params.preferredAccountId?.trim();
    if (!requestedPeer)
        return null;
    const nativeTargets = new Set();
    for (const row of params.sessions) {
        if (!row || typeof row !== 'object')
            continue;
        const origin = row.origin;
        if (!origin || origin.chatType !== platform_1.ImPeerKind.Group)
            continue;
        const originChannel = asNonEmptyString(origin.provider) ?? asNonEmptyString(origin.surface);
        if (!originChannel || platform_1.PlatformRegistry.platformOfChannel(originChannel) !== params.platform) {
            continue;
        }
        const originAccountId = asNonEmptyString(origin.accountId);
        if (preferredAccountId && originAccountId !== preferredAccountId)
            continue;
        const originTo = asNonEmptyString(origin.to);
        if (!originTo)
            continue;
        const colonIndex = originTo.indexOf(':');
        const prefix = colonIndex > 0 ? originTo.slice(0, colonIndex) : '';
        const withoutChannel = prefix && platform_1.PlatformRegistry.platformOfChannel(prefix) === params.platform
            ? originTo.slice(colonIndex + 1)
            : originTo;
        const parsedTarget = (0, platform_1.parseImConversationId)(withoutChannel);
        if (parsedTarget.peerKind && parsedTarget.peerKind !== platform_1.ImPeerKind.Group)
            continue;
        const nativePeer = parsedTarget.peerId.trim();
        if (!nativePeer || nativePeer.toLowerCase() !== requestedPeer)
            continue;
        nativeTargets.add(nativePeer);
    }
    return nativeTargets.size === 1 ? [...nativeTargets][0] : null;
}
/** Backward-compatible WeCom wrapper for existing callers and tests. */
function resolveWecomGroupDeliveryTargetFromSessions(params) {
    return resolveGroupDeliveryTargetFromSessions({
        ...params,
        platform: WECOM_PLATFORM,
    });
}
/**
 * Resolves the agent bound to a delivery-target conversation from IM session
 * mappings (sorted by lastActiveAt DESC). IM conversations can be bound to a
 * non-main agent; a scheduled delivery must run under that agent so the
 * gateway mirrors the result into the same conversation session the LobsterAI
 * record maps to, instead of a main-agent shadow session.
 */
function resolveConversationAgentIdFromMappings(mappings, to, preferredAccountId, options) {
    const peer = (0, platform_1.parseImConversationId)(to).peerId.trim().toLowerCase();
    if (!peer)
        return null;
    const preferredAgentId = preferredAccountId && options?.platform
        ? (0, openclawChannelSessionSync_1.resolveAgentBinding)(options.platformAgentBindings, options.platform, preferredAccountId)
        : null;
    if (preferredAgentId) {
        for (const mapping of mappings) {
            const parsed = (0, platform_1.parseImConversationId)(mapping.imConversationId);
            if (parsed.peerId.trim().toLowerCase() !== peer)
                continue;
            if (!isAccountlessGroupOrChannel(parsed))
                continue;
            const agentId = mapping.agentId?.trim();
            if (agentId === preferredAgentId)
                return agentId;
        }
    }
    let firstMatch = null;
    for (const mapping of mappings) {
        const parsed = (0, platform_1.parseImConversationId)(mapping.imConversationId);
        if (parsed.peerId.trim().toLowerCase() !== peer)
            continue;
        const agentId = mapping.agentId?.trim();
        if (!agentId)
            continue;
        if (preferredAccountId && parsed.accountId === preferredAccountId)
            return agentId;
        if (preferredAgentId &&
            isAccountlessGroupOrChannel(parsed) &&
            agentId === preferredAgentId) {
            return agentId;
        }
        firstMatch = firstMatch ?? agentId;
    }
    return firstMatch;
}
/**
 * Collapses duplicate peer conversations for the notify-target list: bot
 * accounts get replaced over time but their mappings persist per account
 * prefix, and OpenClaw heartbeat pseudo-conversations are not valid delivery
 * targets. Input must be sorted by lastActiveAt DESC (listSessionMappings
 * order); the first (most recent) row per peer wins.
 */
function dedupeConversationMappings(mappings) {
    const seen = new Set();
    const result = [];
    for (const mapping of mappings) {
        const parsed = (0, platform_1.parseImConversationId)(mapping.imConversationId);
        if (parsed.peerId.toLowerCase().endsWith(':heartbeat'))
            continue;
        const key = `${mapping.agentId ?? ''}:${parsed.peerKind ?? ''}:${parsed.peerId.toLowerCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(mapping);
    }
    return result;
}
/**
 * Narrows account-less group mappings for a selected multi-instance bot.
 *
 * OpenClaw's canonical group session keys are scoped by agent + channel +
 * group id, e.g. `agent:<agentId>:feishu:group:<chatId>`. They intentionally
 * do not include accountId, so persisted group conversation ids cannot be
 * filtered by account prefix like direct chats. When the scheduled-task form
 * already selected a bot instance, use that instance's current agent binding
 * as the best available group ownership signal.
 */
function filterConversationMappingsForSelectedAccount(mappings, platform, accountId, platformAgentBindings) {
    const selectedAccountId = accountId?.trim();
    if (!selectedAccountId)
        return [...mappings];
    if (!platformAgentBindings)
        return [...mappings];
    const selectedAgentId = (0, openclawChannelSessionSync_1.resolveAgentBinding)(platformAgentBindings, platform, selectedAccountId);
    const filtered = mappings.filter((mapping) => {
        const parsed = (0, platform_1.parseImConversationId)(mapping.imConversationId);
        if (parsed.accountId)
            return true;
        if (parsed.peerKind !== platform_1.ImPeerKind.Group &&
            parsed.peerKind !== platform_1.ImPeerKind.Channel) {
            return true;
        }
        const mappingAgentId = mapping.agentId?.trim();
        return !mappingAgentId || mappingAgentId === selectedAgentId;
    });
    const accountlessGroupPeers = new Set(filtered
        .map((mapping) => (0, platform_1.parseImConversationId)(mapping.imConversationId))
        .filter(isAccountlessGroupOrChannel)
        .map(parsed => parsed.peerId.trim().toLowerCase())
        .filter(Boolean));
    if (accountlessGroupPeers.size === 0)
        return filtered;
    return filtered.filter((mapping) => {
        const parsed = (0, platform_1.parseImConversationId)(mapping.imConversationId);
        if (!parsed.accountId || parsed.peerKind !== platform_1.ImPeerKind.Direct)
            return true;
        return !accountlessGroupPeers.has(parsed.peerId.trim().toLowerCase());
    });
}
//# sourceMappingURL=helpers.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOpenClawCronSessionKey = exports.parseOpenClawCronSessionKey = exports.OpenClawCronRunMetadataKey = void 0;
exports.OpenClawCronRunMetadataKey = {
    SessionKey: 'openclawCronRunSessionKey',
    EntryIndex: 'openclawCronRunEntryIndex',
};
const LEGACY_CRON_SESSION_KEY_RE = /^cron:([^:\s]+)$/i;
const AGENT_CRON_SESSION_KEY_RE = /^agent:([^:]+):cron:([^:\s]+)(?::run:.+)?$/i;
/** Parse the OpenClaw session keys used for isolated scheduled-task runs. */
const parseOpenClawCronSessionKey = (sessionKey) => {
    const legacyMatch = sessionKey.match(LEGACY_CRON_SESSION_KEY_RE);
    if (legacyMatch) {
        const scheduledTaskId = legacyMatch[1];
        return {
            agentId: null,
            scheduledTaskId,
            cacheKey: `cron:${scheduledTaskId}`,
        };
    }
    const agentMatch = sessionKey.match(AGENT_CRON_SESSION_KEY_RE);
    if (!agentMatch)
        return null;
    const agentId = agentMatch[1];
    const scheduledTaskId = agentMatch[2];
    return {
        agentId,
        scheduledTaskId,
        cacheKey: `agent:${agentId}:cron:${scheduledTaskId}`,
    };
};
exports.parseOpenClawCronSessionKey = parseOpenClawCronSessionKey;
const isOpenClawCronSessionKey = (sessionKey) => ((0, exports.parseOpenClawCronSessionKey)(sessionKey) !== null);
exports.isOpenClawCronSessionKey = isOpenClawCronSessionKey;
//# sourceMappingURL=openclawCronSessionKey.js.map
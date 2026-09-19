"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServerModelCapabilityHeaders = void 0;
exports.runStartupCacheWarmup = runStartupCacheWarmup;
const modelRuntimeProfiles_1 = require("../../shared/providers/modelRuntimeProfiles");
const authQuota_1 = require("../authQuota");
const claudeSettings_1 = require("./claudeSettings");
const WARMUP_TIMEOUT = 5000;
const buildServerModelCapabilityHeaders = (clientVersion) => ({
    Accept: 'application/json',
    [modelRuntimeProfiles_1.LOBSTERAI_CLIENT_CAPABILITIES_HEADER]: modelRuntimeProfiles_1.LOBSTERAI_CLIENT_CAPABILITIES,
    [modelRuntimeProfiles_1.LOBSTERAI_CLIENT_VERSION_HEADER]: clientVersion,
});
exports.buildServerModelCapabilityHeaders = buildServerModelCapabilityHeaders;
/**
 * Pre-warm quota and model caches so provider resolution and config sync
 * see real server data instead of empty defaults.
 *
 * Without this, cachedSubscriptionStatus starts as 'free' and serverModelMetadataCache
 * is empty. resolveMatchedProvider then falls back to tryLobsteraiServerFallback
 * for every call, and the renderer's subsequent auth responses trigger redundant
 * syncOpenClawConfig calls during the gateway startup window.
 */
async function runStartupCacheWarmup(deps) {
    const { serverBaseUrl, fetchWithAuth, appendKeyfromQuery, cachedSubscriptionStatus, clientVersion, t, } = deps;
    let subscriptionStatus = cachedSubscriptionStatus;
    let mediaGenerationEntitled = false;
    await Promise.allSettled([
        (async () => {
            try {
                const resp = await fetchWithAuth(`${serverBaseUrl}/api/user/quota`, {
                    signal: AbortSignal.timeout(WARMUP_TIMEOUT),
                });
                if (!resp.ok)
                    return;
                const body = (await resp.json());
                if (body.code !== 0 || !body.data)
                    return;
                const quota = (0, authQuota_1.normalizeAuthQuota)(body.data, {
                    freePlanName: t('authPlanFree'),
                    standardPlanName: t('authPlanStandard'),
                    fallbackSubscriptionStatus: cachedSubscriptionStatus,
                });
                const gateState = (0, authQuota_1.authQuotaGateStateFromQuota)(quota);
                subscriptionStatus = gateState.subscriptionStatus;
                mediaGenerationEntitled = gateState.mediaGenerationEntitled;
                console.log(`[Main] startup cache warmup: subscription=${gateState.subscriptionStatus}, mediaEntitled=${gateState.mediaGenerationEntitled}`);
            }
            catch (err) {
                console.debug('[Main] startup cache warmup: quota fetch failed (non-fatal):', err);
            }
        })(),
        (async () => {
            try {
                const url = appendKeyfromQuery(`${serverBaseUrl}/api/models/available`);
                const resp = await fetchWithAuth(url, {
                    headers: (0, exports.buildServerModelCapabilityHeaders)(clientVersion),
                    signal: AbortSignal.timeout(WARMUP_TIMEOUT),
                });
                if (!resp.ok)
                    return;
                const data = (await resp.json());
                if (data.code !== 0 || !data.data)
                    return;
                (0, claudeSettings_1.updateServerModelMetadata)(data.data);
                console.log(`[Main] startup cache warmup: loaded ${data.data.length} server models`);
            }
            catch (err) {
                console.debug('[Main] startup cache warmup: models fetch failed (non-fatal):', err);
            }
        })(),
    ]);
    return { subscriptionStatus, mediaGenerationEntitled };
}
//# sourceMappingURL=startupCacheWarmup.js.map
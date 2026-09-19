"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAuthQuota = exports.authQuotaGateStateFromQuota = exports.createDefaultAuthQuotaGateState = exports.hasPublishingEntitlement = exports.hasMediaGenerationEntitlement = exports.AuthSubscriptionStatus = void 0;
const constants_1 = require("../shared/auth/constants");
Object.defineProperty(exports, "AuthSubscriptionStatus", { enumerable: true, get: function () { return constants_1.AuthSubscriptionStatus; } });
const readNumber = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const readString = (value, fallback) => (typeof value === 'string' && value.trim() ? value : fallback);
const hasMediaGenerationEntitlement = (quota) => {
    if (typeof quota.mediaGenerationEntitled === 'boolean') {
        return quota.mediaGenerationEntitled;
    }
    const subscriptionStatus = typeof quota.subscriptionStatus === 'string'
        ? quota.subscriptionStatus
        : constants_1.AuthSubscriptionStatus.Free;
    if (subscriptionStatus === constants_1.AuthSubscriptionStatus.Enterprise) {
        return false;
    }
    return quota.hasPaidCredits === true || subscriptionStatus === constants_1.AuthSubscriptionStatus.Active;
};
exports.hasMediaGenerationEntitlement = hasMediaGenerationEntitlement;
const hasPublishingEntitlement = (quota, field) => {
    if (typeof quota[field] === 'boolean') {
        return quota[field];
    }
    const subscriptionStatus = typeof quota.subscriptionStatus === 'string'
        ? quota.subscriptionStatus
        : constants_1.AuthSubscriptionStatus.Free;
    if (subscriptionStatus === constants_1.AuthSubscriptionStatus.Enterprise) {
        return false;
    }
    return subscriptionStatus === constants_1.AuthSubscriptionStatus.Active;
};
exports.hasPublishingEntitlement = hasPublishingEntitlement;
const createDefaultAuthQuotaGateState = () => ({
    subscriptionStatus: constants_1.AuthSubscriptionStatus.Free,
    mediaGenerationEntitled: false,
});
exports.createDefaultAuthQuotaGateState = createDefaultAuthQuotaGateState;
const authQuotaGateStateFromQuota = (quota) => {
    const subscriptionStatus = typeof quota.subscriptionStatus === 'string'
        ? quota.subscriptionStatus
        : constants_1.AuthSubscriptionStatus.Free;
    return {
        subscriptionStatus,
        mediaGenerationEntitled: (0, exports.hasMediaGenerationEntitlement)(quota),
    };
};
exports.authQuotaGateStateFromQuota = authQuotaGateStateFromQuota;
const normalizeAuthQuota = (raw, labels) => {
    let creditsLimit = 0;
    let creditsUsed = 0;
    let planName = labels.freePlanName;
    let subscriptionStatus = constants_1.AuthSubscriptionStatus.Free;
    if (typeof raw.limit === 'number') {
        creditsLimit = raw.limit;
        creditsUsed = readNumber(raw.used);
        planName = readString(raw.planName, 'Team');
        subscriptionStatus = readString(raw.subscriptionStatus, constants_1.AuthSubscriptionStatus.Enterprise);
    }
    else if (typeof raw.freeCreditsTotal === 'number') {
        creditsLimit = raw.freeCreditsTotal;
        creditsUsed = readNumber(raw.freeCreditsUsed);
        planName = readString(raw.planName, labels.freePlanName);
        subscriptionStatus = readString(raw.subscriptionStatus, constants_1.AuthSubscriptionStatus.Free);
    }
    else if (typeof raw.monthlyCreditsLimit === 'number') {
        creditsLimit = raw.monthlyCreditsLimit;
        creditsUsed = readNumber(raw.monthlyCreditsUsed);
        planName = readString(raw.planName, labels.standardPlanName);
        subscriptionStatus = readString(raw.subscriptionStatus, constants_1.AuthSubscriptionStatus.Active);
    }
    else if (typeof raw.dailyCreditsLimit === 'number') {
        creditsLimit = raw.dailyCreditsLimit;
        creditsUsed = readNumber(raw.dailyCreditsUsed);
        planName = readString(raw.planName, labels.freePlanName);
        subscriptionStatus = readString(raw.subscriptionStatus, constants_1.AuthSubscriptionStatus.Free);
    }
    else if (typeof raw.creditsLimit === 'number') {
        subscriptionStatus = readString(raw.subscriptionStatus, labels.fallbackSubscriptionStatus ?? constants_1.AuthSubscriptionStatus.Free);
        creditsLimit = readNumber(raw.creditsLimit);
        creditsUsed = readNumber(raw.creditsUsed);
        const hasPaidCredits = raw.hasPaidCredits === true
            || subscriptionStatus === constants_1.AuthSubscriptionStatus.Active;
        const normalizedRaw = {
            ...raw,
            planName: readString(raw.planName, subscriptionStatus === constants_1.AuthSubscriptionStatus.Enterprise ? 'Team' : labels.freePlanName),
            subscriptionStatus,
            creditsLimit,
            creditsUsed,
            creditsRemaining: typeof raw.creditsRemaining === 'number'
                ? raw.creditsRemaining
                : Math.max(0, creditsLimit - creditsUsed),
            hasPaidCredits,
            mediaGenerationEntitled: (0, exports.hasMediaGenerationEntitlement)({
                ...raw,
                subscriptionStatus,
                hasPaidCredits,
            }),
            shareEntitled: (0, exports.hasPublishingEntitlement)({ ...raw, subscriptionStatus }, 'shareEntitled'),
            deploymentEntitled: (0, exports.hasPublishingEntitlement)({ ...raw, subscriptionStatus }, 'deploymentEntitled'),
        };
        return normalizedRaw;
    }
    const hasPaidCredits = raw.hasPaidCredits === true || subscriptionStatus === constants_1.AuthSubscriptionStatus.Active;
    return {
        ...raw,
        planName,
        subscriptionStatus,
        creditsLimit,
        creditsUsed,
        creditsRemaining: Math.max(0, creditsLimit - creditsUsed),
        hasPaidCredits,
        mediaGenerationEntitled: (0, exports.hasMediaGenerationEntitlement)({
            ...raw,
            subscriptionStatus,
            hasPaidCredits,
        }),
        shareEntitled: (0, exports.hasPublishingEntitlement)({ ...raw, subscriptionStatus }, 'shareEntitled'),
        deploymentEntitled: (0, exports.hasPublishingEntitlement)({ ...raw, subscriptionStatus }, 'deploymentEntitled'),
    };
};
exports.normalizeAuthQuota = normalizeAuthQuota;
//# sourceMappingURL=authQuota.js.map
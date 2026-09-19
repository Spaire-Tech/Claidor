"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePublishingTrialPolicy = exports.normalizePublishingQuotaErrorData = exports.PublishingCountMode = exports.normalizePublishingSubscriptionRecoveryMode = exports.PublishingSubscriptionRecoveryMode = exports.PublishingIdentityType = exports.PublishingResourceKind = void 0;
exports.PublishingResourceKind = {
    File: 'file',
    Site: 'site',
};
exports.PublishingIdentityType = {
    Free: 'free',
    Subscription: 'subscription',
    Enterprise: 'enterprise',
};
exports.PublishingSubscriptionRecoveryMode = {
    None: 'none',
    Automatic: 'automatic',
    RedeployRequired: 'redeploy_required',
};
const normalizePublishingSubscriptionRecoveryMode = (value) => (Object.values(exports.PublishingSubscriptionRecoveryMode).includes(value)
    ? value
    : exports.PublishingSubscriptionRecoveryMode.None);
exports.normalizePublishingSubscriptionRecoveryMode = normalizePublishingSubscriptionRecoveryMode;
exports.PublishingCountMode = {
    Total: 'total',
    Active: 'active',
};
const isFiniteNonNegativeNumber = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const normalizePublishingQuotaErrorData = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const record = value;
    if (!Object.values(exports.PublishingResourceKind).includes(record.resourceKind)
        || !Object.values(exports.PublishingIdentityType).includes(record.identityType)
        || !Object.values(exports.PublishingCountMode).includes(record.countMode)
        || !isFiniteNonNegativeNumber(record.used)
        || !isFiniteNonNegativeNumber(record.limit)
        || typeof record.canReleaseByClosing !== 'boolean') {
        return undefined;
    }
    return {
        resourceKind: record.resourceKind,
        identityType: record.identityType,
        countMode: record.countMode,
        used: record.used,
        limit: record.limit,
        canReleaseByClosing: record.canReleaseByClosing,
    };
};
exports.normalizePublishingQuotaErrorData = normalizePublishingQuotaErrorData;
const normalizePublishingTrialResourcePolicy = (value, expectedResourceKind) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const record = value;
    if (record.resourceKind !== expectedResourceKind
        || record.countMode !== exports.PublishingCountMode.Total
        || !isFiniteNonNegativeNumber(record.limit)
        || record.limit <= 0
        || !isFiniteNonNegativeNumber(record.accessTtlSeconds)
        || record.accessTtlSeconds <= 0
        || record.canReleaseByClosing !== false) {
        return undefined;
    }
    return {
        resourceKind: expectedResourceKind,
        countMode: exports.PublishingCountMode.Total,
        limit: record.limit,
        accessTtlSeconds: record.accessTtlSeconds,
        canReleaseByClosing: false,
    };
};
const normalizePublishingTrialPolicy = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const record = value;
    if (record.identityType !== exports.PublishingIdentityType.Free)
        return undefined;
    const file = normalizePublishingTrialResourcePolicy(record.file, exports.PublishingResourceKind.File);
    const site = normalizePublishingTrialResourcePolicy(record.site, exports.PublishingResourceKind.Site);
    return file && site
        ? { identityType: exports.PublishingIdentityType.Free, file, site }
        : undefined;
};
exports.normalizePublishingTrialPolicy = normalizePublishingTrialPolicy;
//# sourceMappingURL=constants.js.map
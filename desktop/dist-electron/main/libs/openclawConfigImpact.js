"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyPluginConfigChange = exports.classifyImOpenClawConfigChange = exports.classifyCoworkConfigChange = exports.classifyAppConfigChange = exports.removeImpactDecisionReasons = exports.mergeImpactDecision = exports.createStableConfigFingerprint = exports.OpenClawPluginChangeAction = exports.OpenClawConfigImpactReason = exports.OpenClawConfigImpact = void 0;
const providers_1 = require("../../shared/providers");
exports.OpenClawConfigImpact = {
    None: 'none',
    Sync: 'sync',
    Restart: 'restart',
};
exports.OpenClawConfigImpactReason = {
    AppUseSystemProxy: 'app.useSystemProxy',
    AppModelConfig: 'app.model',
    AppProviderConfig: 'app.providers.config',
    AppProviderSecret: 'app.providers.secret',
    /** What the person said they do in step one; it sits in Yodo's brief. */
    AppOnboardingWorkType: 'app.onboardingWorkType',
    CoworkRuntimeConfig: 'cowork.runtime',
    CoworkOpenClawConfig: 'cowork.openclaw',
    CoworkDreamingConfig: 'cowork.dreaming',
    ImConfig: 'im.config',
    ImForceRestart: 'im.forceRestart',
    PluginInstall: 'plugin.install',
    PluginUninstall: 'plugin.uninstall',
    PluginToggle: 'plugin.toggle',
    PluginConfig: 'plugin.config',
    McpConfig: 'mcp.config',
};
exports.OpenClawPluginChangeAction = {
    Install: 'install',
    Uninstall: 'uninstall',
    Toggle: 'toggle',
    Config: 'config',
};
const IMPACT_ORDER = {
    [exports.OpenClawConfigImpact.None]: 0,
    [exports.OpenClawConfigImpact.Sync]: 1,
    [exports.OpenClawConfigImpact.Restart]: 2,
};
const PROVIDER_SECRET_FIELDS = new Set([
    'apiKey',
    'oauthAccessToken',
    'oauthRefreshToken',
]);
const COWORK_SYNC_FIELDS = new Set([
    'executionMode',
    'agentEngine',
    'workingDirectory',
    'skipMissedJobs',
    'openClawHeartbeatEnabled',
    'embeddingEnabled',
    'embeddingProvider',
    'embeddingModel',
    'embeddingLocalModelPath',
    'embeddingVectorWeight',
    'embeddingRemoteBaseUrl',
    'embeddingRemoteApiKey',
]);
const COWORK_RESTART_FIELDS = new Set([
    'dreamingEnabled',
    'dreamingFrequency',
    'dreamingModel',
    'dreamingTimezone',
]);
const noImpact = () => ({
    impact: exports.OpenClawConfigImpact.None,
    reasons: [],
});
const decision = (impact, reason) => ({
    impact,
    reasons: [reason],
});
const isPlainObject = (value) => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};
const normalizeStable = (value) => {
    if (Array.isArray(value)) {
        return value.map(normalizeStable);
    }
    if (!isPlainObject(value)) {
        return value;
    }
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
        const nextValue = value[key];
        if (nextValue !== undefined) {
            sorted[key] = normalizeStable(nextValue);
        }
    }
    return sorted;
};
const createStableConfigFingerprint = (value) => {
    return JSON.stringify(normalizeStable(value));
};
exports.createStableConfigFingerprint = createStableConfigFingerprint;
const mergeImpactDecision = (...decisions) => {
    let mergedImpact = exports.OpenClawConfigImpact.None;
    const mergedReasons = [];
    for (const nextDecision of decisions) {
        if (IMPACT_ORDER[nextDecision.impact] > IMPACT_ORDER[mergedImpact]) {
            mergedImpact = nextDecision.impact;
        }
        for (const reason of nextDecision.reasons) {
            if (!mergedReasons.includes(reason)) {
                mergedReasons.push(reason);
            }
        }
    }
    return {
        impact: mergedReasons.length > 0 ? mergedImpact : exports.OpenClawConfigImpact.None,
        reasons: mergedReasons,
    };
};
exports.mergeImpactDecision = mergeImpactDecision;
const removeImpactDecisionReasons = (source, reasonsToRemove) => {
    const remainingReasons = source.reasons.filter(reason => !reasonsToRemove.includes(reason));
    if (remainingReasons.length === source.reasons.length) {
        return source;
    }
    const decisions = remainingReasons.map(reason => {
        if (reason === exports.OpenClawConfigImpactReason.AppUseSystemProxy
            || reason === exports.OpenClawConfigImpactReason.AppProviderSecret
            || reason === exports.OpenClawConfigImpactReason.CoworkDreamingConfig
            || reason === exports.OpenClawConfigImpactReason.ImConfig
            || reason === exports.OpenClawConfigImpactReason.ImForceRestart
            || reason === exports.OpenClawConfigImpactReason.PluginInstall
            || reason === exports.OpenClawConfigImpactReason.PluginUninstall
            || reason === exports.OpenClawConfigImpactReason.PluginToggle
            || reason === exports.OpenClawConfigImpactReason.PluginConfig
            || reason === exports.OpenClawConfigImpactReason.McpConfig) {
            return decision(exports.OpenClawConfigImpact.Restart, reason);
        }
        return decision(exports.OpenClawConfigImpact.Sync, reason);
    });
    return (0, exports.mergeImpactDecision)(...decisions);
};
exports.removeImpactDecisionReasons = removeImpactDecisionReasons;
const providerConfigWithoutSecrets = (provider) => {
    if (!isPlainObject(provider)) {
        return provider;
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(provider)) {
        if (!PROVIDER_SECRET_FIELDS.has(key)) {
            sanitized[key] = value;
        }
    }
    return sanitized;
};
const providersWithoutSecrets = (providers) => {
    if (!isPlainObject(providers)) {
        return providers;
    }
    const sanitized = {};
    for (const [providerName, provider] of Object.entries(providers)) {
        sanitized[providerName] = providerConfigWithoutSecrets(provider);
    }
    return sanitized;
};
const providerSecretsOnly = (providers) => {
    if (!isPlainObject(providers)) {
        return providers;
    }
    const secrets = {};
    for (const [providerName, provider] of Object.entries(providers)) {
        if (providerName === providers_1.ProviderName.Copilot) {
            continue;
        }
        if (!isPlainObject(provider)) {
            continue;
        }
        const providerSecrets = {};
        for (const field of PROVIDER_SECRET_FIELDS) {
            const secretValue = provider[field];
            if (typeof secretValue === 'string' && secretValue.trim().length === 0) {
                continue;
            }
            if (secretValue !== undefined && secretValue !== null) {
                providerSecrets[field] = secretValue;
            }
        }
        if (Object.keys(providerSecrets).length > 0) {
            secrets[providerName] = providerSecrets;
        }
    }
    return secrets;
};
const changed = (previous, next) => {
    return (0, exports.createStableConfigFingerprint)(previous) !== (0, exports.createStableConfigFingerprint)(next);
};
const classifyAppConfigChange = (previousConfig, nextConfig) => {
    const previous = isPlainObject(previousConfig) ? previousConfig : {};
    const next = isPlainObject(nextConfig) ? nextConfig : {};
    const decisions = [];
    if ((previous.useSystemProxy === true) !== (next.useSystemProxy === true)) {
        decisions.push(decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.AppUseSystemProxy));
    }
    if (changed(previous.model, next.model)) {
        decisions.push(decision(exports.OpenClawConfigImpact.Sync, exports.OpenClawConfigImpactReason.AppModelConfig));
    }
    if (changed(providerSecretsOnly(previous.providers), providerSecretsOnly(next.providers))) {
        decisions.push(decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.AppProviderSecret));
    }
    if (changed(providersWithoutSecrets(previous.providers), providersWithoutSecrets(next.providers))) {
        decisions.push(decision(exports.OpenClawConfigImpact.Sync, exports.OpenClawConfigImpactReason.AppProviderConfig));
    }
    // The work type reaches Yodo's managed brief, so it has to be written
    // out when it changes; nothing running has to restart for it.
    if (changed(previous.onboardingWorkType, next.onboardingWorkType)) {
        decisions.push(decision(exports.OpenClawConfigImpact.Sync, exports.OpenClawConfigImpactReason.AppOnboardingWorkType));
    }
    // `composioConnected` is the renderer's own note of which cards are
    // signed in through Composio; it reaches nothing in the engine.
    return (0, exports.mergeImpactDecision)(...decisions);
};
exports.classifyAppConfigChange = classifyAppConfigChange;
const classifyCoworkConfigChange = (previousConfig, nextConfig) => {
    const previous = isPlainObject(previousConfig) ? previousConfig : {};
    const next = isPlainObject(nextConfig) ? nextConfig : {};
    const decisions = [];
    for (const field of COWORK_SYNC_FIELDS) {
        if (changed(previous[field], next[field])) {
            decisions.push(decision(exports.OpenClawConfigImpact.Sync, exports.OpenClawConfigImpactReason.CoworkOpenClawConfig));
            break;
        }
    }
    for (const field of COWORK_RESTART_FIELDS) {
        if (changed(previous[field], next[field])) {
            decisions.push(decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.CoworkDreamingConfig));
            break;
        }
    }
    return (0, exports.mergeImpactDecision)(...decisions);
};
exports.classifyCoworkConfigChange = classifyCoworkConfigChange;
const classifyImOpenClawConfigChange = (previousFingerprint, nextFingerprint, options = {}) => {
    if (options.forceRestart) {
        return decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.ImForceRestart);
    }
    if (previousFingerprint === null || previousFingerprint === nextFingerprint) {
        return noImpact();
    }
    return decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.ImConfig);
};
exports.classifyImOpenClawConfigChange = classifyImOpenClawConfigChange;
const classifyPluginConfigChange = (action) => {
    switch (action) {
        case exports.OpenClawPluginChangeAction.Install:
            return decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.PluginInstall);
        case exports.OpenClawPluginChangeAction.Uninstall:
            return decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.PluginUninstall);
        case exports.OpenClawPluginChangeAction.Toggle:
            return decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.PluginToggle);
        case exports.OpenClawPluginChangeAction.Config:
            return decision(exports.OpenClawConfigImpact.Restart, exports.OpenClawConfigImpactReason.PluginConfig);
    }
};
exports.classifyPluginConfigChange = classifyPluginConfigChange;
//# sourceMappingURL=openclawConfigImpact.js.map
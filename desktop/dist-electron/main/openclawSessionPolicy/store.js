"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveOpenClawSessionPolicyConfig = exports.loadOpenClawSessionPolicyConfig = exports.buildOpenClawSessionConfig = exports.mapKeepAliveToSessionReset = exports.normalizeOpenClawSessionPolicyConfig = void 0;
const constants_1 = require("./constants");
const normalizeOpenClawSessionPolicyConfig = (value) => {
    const keepAlive = value?.keepAlive;
    const validValues = new Set(Object.values(constants_1.OpenClawSessionKeepAlive));
    if (keepAlive && validValues.has(keepAlive)) {
        return { keepAlive: keepAlive };
    }
    return constants_1.DEFAULT_OPENCLAW_SESSION_POLICY_CONFIG;
};
exports.normalizeOpenClawSessionPolicyConfig = normalizeOpenClawSessionPolicyConfig;
const mapKeepAliveToSessionReset = (keepAlive) => {
    switch (keepAlive) {
        case constants_1.OpenClawSessionKeepAlive.OneDay:
            return { mode: 'idle', idleMinutes: 1440 };
        case constants_1.OpenClawSessionKeepAlive.SevenDays:
            return { mode: 'idle', idleMinutes: 10080 };
        case constants_1.OpenClawSessionKeepAlive.OneYear:
            return { mode: 'idle', idleMinutes: 525600 };
        case constants_1.OpenClawSessionKeepAlive.ThirtyDays:
        default:
            return { mode: 'idle', idleMinutes: 43200 };
    }
};
exports.mapKeepAliveToSessionReset = mapKeepAliveToSessionReset;
const buildOpenClawSessionConfig = (policy = constants_1.DEFAULT_OPENCLAW_SESSION_POLICY_CONFIG) => ({
    dmScope: 'per-account-channel-peer',
    reset: (0, exports.mapKeepAliveToSessionReset)(policy.keepAlive),
    maintenance: { ...constants_1.OPENCLAW_SESSION_MAINTENANCE },
});
exports.buildOpenClawSessionConfig = buildOpenClawSessionConfig;
const loadOpenClawSessionPolicyConfig = (store) => {
    return (0, exports.normalizeOpenClawSessionPolicyConfig)(store.get(constants_1.OPENCLAW_SESSION_POLICY_STORE_KEY));
};
exports.loadOpenClawSessionPolicyConfig = loadOpenClawSessionPolicyConfig;
const saveOpenClawSessionPolicyConfig = (store, value) => {
    const normalized = (0, exports.normalizeOpenClawSessionPolicyConfig)(value);
    store.set(constants_1.OPENCLAW_SESSION_POLICY_STORE_KEY, normalized);
    return normalized;
};
exports.saveOpenClawSessionPolicyConfig = saveOpenClawSessionPolicyConfig;
//# sourceMappingURL=store.js.map
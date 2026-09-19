"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawSessionPolicyIpc = exports.OPENCLAW_SESSION_MAINTENANCE = exports.DEFAULT_OPENCLAW_SESSION_POLICY_CONFIG = exports.OPENCLAW_SESSION_POLICY_STORE_KEY = exports.OpenClawSessionKeepAlive = void 0;
exports.OpenClawSessionKeepAlive = {
    OneDay: '1d',
    SevenDays: '7d',
    ThirtyDays: '30d',
    OneYear: '365d',
};
exports.OPENCLAW_SESSION_POLICY_STORE_KEY = 'openclaw_session_policy';
exports.DEFAULT_OPENCLAW_SESSION_POLICY_CONFIG = {
    keepAlive: exports.OpenClawSessionKeepAlive.ThirtyDays,
};
exports.OPENCLAW_SESSION_MAINTENANCE = {
    pruneAfter: '365d',
    maxEntries: 1000000,
    rotateBytes: '1gb',
};
exports.OpenClawSessionPolicyIpc = {
    Get: 'openclaw:sessionPolicy:get',
    Set: 'openclaw:sessionPolicy:set',
};
//# sourceMappingURL=constants.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthSubscriptionStatus = exports.AuthLifecycleEventType = exports.AuthRefreshReason = exports.AuthRefreshFailureKind = exports.AuthRefreshOutcome = exports.AuthSessionChangeReason = exports.AuthSessionStatus = exports.AuthIpcChannel = void 0;
exports.AuthIpcChannel = {
    Callback: 'auth:callback',
    ClaimCreditsFinalReward: 'auth:claimCreditsFinalReward',
    Exchange: 'auth:exchange',
    GetAccessToken: 'auth:getAccessToken',
    GetActiveClientBanner: 'auth:getActiveClientBanner',
    GetActiveClientBanners: 'auth:getActiveClientBanners',
    GetClientBannerSnapshot: 'auth:getClientBannerSnapshot',
    GetModels: 'auth:getModels',
    GetPricingCatalog: 'auth:getPricingCatalog',
    GetProfileSummary: 'auth:getProfileSummary',
    GetPendingCallback: 'auth:getPendingCallback',
    GetQuota: 'auth:getQuota',
    GetUser: 'auth:getUser',
    LifecycleEvent: 'auth:lifecycleEvent',
    Login: 'auth:login',
    Logout: 'auth:logout',
    QuotaChanged: 'auth:quotaChanged',
    RefreshToken: 'auth:refreshToken',
    SessionChanged: 'auth:sessionChanged',
};
exports.AuthSessionStatus = {
    Authenticated: 'authenticated',
    Expired: 'expired',
    TemporarilyUnavailable: 'temporarily_unavailable',
    Unauthenticated: 'unauthenticated',
};
exports.AuthSessionChangeReason = {
    EnterpriseMembershipRevoked: 'enterprise_membership_revoked',
    RefreshRejected: 'refresh_rejected',
    UserLogout: 'user_logout',
};
exports.AuthRefreshOutcome = {
    NoTokens: 'no_tokens',
    Success: 'success',
    TerminalFailure: 'terminal_failure',
    TransientFailure: 'transient_failure',
};
exports.AuthRefreshFailureKind = {
    Http: 'http_error',
    InvalidResponse: 'invalid_response',
    Network: 'network',
    Rejected: 'rejected',
    Timeout: 'timeout',
};
exports.AuthRefreshReason = {
    CompatProxy: 'compat-proxy',
    Manual: 'manual',
    OpenClawProxy: 'openclaw-proxy',
    Passive: 'passive',
    Proactive: 'proactive',
};
exports.AuthLifecycleEventType = {
    Restore: 'auth_restore',
    TerminalExpired: 'auth_terminal_expired',
    TokenRefresh: 'token_refresh',
};
exports.AuthSubscriptionStatus = {
    Active: 'active',
    Enterprise: 'enterprise',
    Free: 'free',
};
//# sourceMappingURL=constants.js.map
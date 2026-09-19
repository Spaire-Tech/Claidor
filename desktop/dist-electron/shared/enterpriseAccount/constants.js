"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterpriseQuotaMessageMetadataKey = exports.EnterpriseAccountRequestHeader = exports.EnterpriseAccountStoreKey = exports.EnterpriseAccountIpcChannel = exports.EnterpriseApiErrorCode = exports.EnterpriseQuotaRequestType = exports.EnterpriseQuotaReason = exports.EnterpriseMemberRole = exports.EnterpriseAccountMode = void 0;
exports.EnterpriseAccountMode = {
    Personal: 'personal',
    Enterprise: 'enterprise',
};
exports.EnterpriseMemberRole = {
    SuperAdmin: 'super_admin',
    Member: 'member',
};
exports.EnterpriseQuotaReason = {
    MemberMonthlyQuotaExhausted: 'member_monthly_quota_exhausted',
    EnterprisePoolExhausted: 'enterprise_pool_exhausted',
    EnterpriseCreditBatchesExpired: 'enterprise_credit_batches_expired',
};
exports.EnterpriseQuotaRequestType = {
    MemberQuota: 'member_quota',
    EnterprisePool: 'enterprise_pool',
};
exports.EnterpriseApiErrorCode = {
    NotFound: 41600,
    Unavailable: 41601,
    NotMember: 41602,
    PermissionDenied: 41603,
    EnterpriseLimitReached: 41604,
    MemberLimitReached: 41605,
    MemberMonthlyQuotaExhausted: 41606,
    EnterprisePoolExhausted: 41607,
    EnterpriseCreditBatchesExpired: 41608,
    DuplicateInvitation: 41609,
    InvalidPackAmount: 41610,
    InvalidAdminTransferTarget: 41611,
    AccountModeMismatch: 41612,
};
exports.EnterpriseAccountIpcChannel = {
    GetContext: 'enterpriseAccount:getContext',
    GetIdentities: 'enterpriseAccount:getIdentities',
    RequestQuotaIncrease: 'enterpriseAccount:requestQuotaIncrease',
    ContextInvalidated: 'enterpriseAccount:contextInvalidated',
};
exports.EnterpriseAccountStoreKey = {
    Context: 'enterprise_account_context',
};
exports.EnterpriseAccountRequestHeader = {
    AccountMode: 'X-LobsterAI-Account-Mode',
    EnterpriseId: 'X-LobsterAI-Enterprise-Id',
};
exports.EnterpriseQuotaMessageMetadataKey = {
    ErrorCode: 'enterpriseErrorCode',
    Reason: 'enterpriseQuotaReason',
};
//# sourceMappingURL=constants.js.map
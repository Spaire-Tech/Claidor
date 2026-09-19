"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEnterpriseApiErrorCode = normalizeEnterpriseApiErrorCode;
exports.resolveEnterpriseQuotaError = resolveEnterpriseQuotaError;
exports.isEnterpriseQuotaReason = isEnterpriseQuotaReason;
const constants_1 = require("./constants");
const ENTERPRISE_QUOTA_REASON_BY_CODE = {
    [constants_1.EnterpriseApiErrorCode.MemberMonthlyQuotaExhausted]: constants_1.EnterpriseQuotaReason.MemberMonthlyQuotaExhausted,
    [constants_1.EnterpriseApiErrorCode.EnterprisePoolExhausted]: constants_1.EnterpriseQuotaReason.EnterprisePoolExhausted,
    [constants_1.EnterpriseApiErrorCode.EnterpriseCreditBatchesExpired]: constants_1.EnterpriseQuotaReason.EnterpriseCreditBatchesExpired,
};
function normalizeEnterpriseApiErrorCode(value) {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        return Number(value.trim());
    }
    return null;
}
function resolveEnterpriseQuotaError(code, message = '') {
    const normalizedCode = normalizeEnterpriseApiErrorCode(code)
        ?? normalizeEnterpriseApiErrorCode(message.match(/\b4160[678]\b/)?.[0]);
    if (normalizedCode === null)
        return null;
    const reason = ENTERPRISE_QUOTA_REASON_BY_CODE[normalizedCode];
    return reason ? { code: normalizedCode, reason } : null;
}
function isEnterpriseQuotaReason(value) {
    return Object.values(constants_1.EnterpriseQuotaReason).some(reason => reason === value);
}
//# sourceMappingURL=quotaError.js.map
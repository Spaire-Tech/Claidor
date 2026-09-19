"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEnterpriseAccountOwnerKey = exports.createAccountOwnerKey = exports.resolveAccountOwnerUserId = exports.AccountOwnerKeyPrefix = void 0;
const constants_1 = require("../enterpriseAccount/constants");
exports.AccountOwnerKeyPrefix = {
    Personal: 'personal:',
    Enterprise: 'enterprise:',
};
const normalizeAccountOwnerPart = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }
    return null;
};
const resolveAccountOwnerUserId = (user) => (normalizeAccountOwnerPart(user?.userId)
    ?? normalizeAccountOwnerPart(user?.id)
    ?? normalizeAccountOwnerPart(user?.yid));
exports.resolveAccountOwnerUserId = resolveAccountOwnerUserId;
const createAccountOwnerKey = (input) => {
    const userId = (0, exports.resolveAccountOwnerUserId)(input.user);
    if (!userId)
        return null;
    if (typeof input.enterpriseId === 'number' && Number.isFinite(input.enterpriseId)) {
        return `${exports.AccountOwnerKeyPrefix.Enterprise}${userId}:${input.enterpriseId}`;
    }
    const accountMode = typeof input.user?.accountMode === 'string'
        ? input.user.accountMode.trim().toLowerCase()
        : '';
    return accountMode === constants_1.EnterpriseAccountMode.Enterprise
        ? null
        : `${exports.AccountOwnerKeyPrefix.Personal}${userId}`;
};
exports.createAccountOwnerKey = createAccountOwnerKey;
const isEnterpriseAccountOwnerKey = (ownerAccountKey) => ownerAccountKey?.startsWith(exports.AccountOwnerKeyPrefix.Enterprise) === true;
exports.isEnterpriseAccountOwnerKey = isEnterpriseAccountOwnerKey;
//# sourceMappingURL=accountOwner.js.map
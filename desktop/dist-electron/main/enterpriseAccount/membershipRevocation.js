"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnterpriseMembershipRevocationSource = exports.readEnterpriseApiErrorCode = exports.createEnterpriseMembershipRevocationHandler = exports.createEnterpriseAuthSessionSnapshot = exports.EnterpriseMembershipRevocationSource = void 0;
const constants_1 = require("../../shared/enterpriseAccount/constants");
exports.EnterpriseMembershipRevocationSource = {
    EnterpriseContext: 'enterprise_context',
    JsonApi: 'json_api',
    LlmSse: 'llm_sse',
    Models: 'models',
    Profile: 'profile',
    Quota: 'quota',
    Refresh: 'refresh',
};
const isPositiveInteger = (value) => (typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0);
const createEnterpriseAuthSessionSnapshot = (accountScope, enterpriseId) => {
    if (!accountScope
        || !isPositiveInteger(enterpriseId)
        || !accountScope.ownerAccountKey.startsWith('enterprise:')
        || !accountScope.ownerAccountKey.endsWith(`:${enterpriseId}`)) {
        return null;
    }
    return {
        ...accountScope,
        enterpriseId,
    };
};
exports.createEnterpriseAuthSessionSnapshot = createEnterpriseAuthSessionSnapshot;
const isSameEnterpriseAuthSession = (expected, current) => (expected !== null
    && current !== null
    && expected.enterpriseId === current.enterpriseId
    && expected.ownerAccountKey === current.ownerAccountKey
    && expected.accountGeneration === current.accountGeneration);
const getEnterpriseAuthSessionKey = (session) => (`${session.ownerAccountKey}:${session.enterpriseId}:${session.accountGeneration}`);
const createEnterpriseMembershipRevocationHandler = (deps) => {
    let invalidatedSessionKey = null;
    return (event) => {
        if (event.code !== constants_1.EnterpriseApiErrorCode.NotMember) {
            return false;
        }
        const currentSession = deps.getCurrentSession();
        if (!isSameEnterpriseAuthSession(event.requestSession, currentSession)) {
            return false;
        }
        const sessionKey = getEnterpriseAuthSessionKey(currentSession);
        if (invalidatedSessionKey === sessionKey) {
            return false;
        }
        invalidatedSessionKey = sessionKey;
        try {
            deps.invalidateCurrentSession(event);
            return true;
        }
        catch (error) {
            invalidatedSessionKey = null;
            throw error;
        }
    };
};
exports.createEnterpriseMembershipRevocationHandler = createEnterpriseMembershipRevocationHandler;
const readEnterpriseApiErrorCode = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }
    const code = body.code;
    if (typeof code === 'number' && Number.isSafeInteger(code)) {
        return code;
    }
    if (typeof code === 'string' && /^-?\d+$/.test(code.trim())) {
        const parsed = Number(code.trim());
        return Number.isSafeInteger(parsed) ? parsed : null;
    }
    return null;
};
exports.readEnterpriseApiErrorCode = readEnterpriseApiErrorCode;
const resolveEnterpriseMembershipRevocationSource = (requestUrl) => {
    let pathname = requestUrl;
    try {
        pathname = new URL(requestUrl).pathname;
    }
    catch {
        pathname = requestUrl.split('?')[0] ?? requestUrl;
    }
    if (pathname === '/api/enterprise/context') {
        return exports.EnterpriseMembershipRevocationSource.EnterpriseContext;
    }
    if (pathname.includes('/api/user/profile')) {
        return exports.EnterpriseMembershipRevocationSource.Profile;
    }
    if (pathname.includes('/api/user/quota')) {
        return exports.EnterpriseMembershipRevocationSource.Quota;
    }
    if (pathname.includes('/api/models/') || pathname.endsWith('/models')) {
        return exports.EnterpriseMembershipRevocationSource.Models;
    }
    return exports.EnterpriseMembershipRevocationSource.JsonApi;
};
exports.resolveEnterpriseMembershipRevocationSource = resolveEnterpriseMembershipRevocationSource;
//# sourceMappingURL=membershipRevocation.js.map
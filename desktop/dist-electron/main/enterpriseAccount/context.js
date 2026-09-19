"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAccountMode = readAccountMode;
exports.normalizeEnterpriseAccountContext = normalizeEnterpriseAccountContext;
exports.normalizeEnterpriseAccountIdentities = normalizeEnterpriseAccountIdentities;
exports.getPersistedEnterpriseAccountContext = getPersistedEnterpriseAccountContext;
exports.persistEnterpriseAccountContext = persistEnterpriseAccountContext;
exports.clearEnterpriseAccountContext = clearEnterpriseAccountContext;
exports.buildEnterpriseAccountRequestHeaders = buildEnterpriseAccountRequestHeaders;
exports.fetchEnterpriseAccountContext = fetchEnterpriseAccountContext;
exports.fetchEnterpriseAccountIdentities = fetchEnterpriseAccountIdentities;
exports.requestEnterpriseQuotaIncrease = requestEnterpriseQuotaIncrease;
const constants_1 = require("../../shared/enterpriseAccount/constants");
const DEFAULT_ENTERPRISE_CONTEXT_REQUEST_TIMEOUT_MS = 10_000;
function resolveRequestTimeoutMs(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : DEFAULT_ENTERPRISE_CONTEXT_REQUEST_TIMEOUT_MS;
}
function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function readTimestamp(value) {
    const timestamp = readString(value);
    return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}
function readNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, value)
        : 0;
}
function readEnterpriseId(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
}
function readInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return Number.isSafeInteger(parsed) ? parsed : null;
    }
    return null;
}
function readRole(value) {
    const normalized = readString(value).toLowerCase();
    if (normalized === constants_1.EnterpriseMemberRole.SuperAdmin) {
        return constants_1.EnterpriseMemberRole.SuperAdmin;
    }
    if (normalized === constants_1.EnterpriseMemberRole.Member) {
        return constants_1.EnterpriseMemberRole.Member;
    }
    return null;
}
function readPermissions(value, role) {
    const record = isRecord(value) ? value : {};
    const isSuperAdmin = role === constants_1.EnterpriseMemberRole.SuperAdmin;
    return {
        manageEnterprise: typeof record.manageEnterprise === 'boolean'
            ? record.manageEnterprise
            : isSuperAdmin,
        adjustMemberQuota: typeof record.adjustMemberQuota === 'boolean'
            ? record.adjustMemberQuota
            : isSuperAdmin,
        rechargeEnterprise: typeof record.rechargeEnterprise === 'boolean'
            ? record.rechargeEnterprise
            : isSuperAdmin,
    };
}
function readMemberQuota(value) {
    const record = isRecord(value) ? value : {};
    const refreshCycle = record.refreshCycle === 'natural_week'
        ? 'natural_week'
        : record.refreshCycle === 'natural_month'
            ? 'natural_month'
            : null;
    const periodStart = readTimestamp(record.periodStart);
    const periodEndExclusive = readTimestamp(record.periodEndExclusive);
    return {
        limit: readNonNegativeNumber(record.limit),
        used: readNonNegativeNumber(record.used),
        remaining: readNonNegativeNumber(record.remaining),
        ...(record.reserved != null ? { reserved: readNonNegativeNumber(record.reserved) } : {}),
        ...(refreshCycle ? { refreshCycle } : {}),
        ...(periodStart ? { periodStart } : {}),
        ...(periodEndExclusive ? { periodEndExclusive } : {}),
    };
}
function readEnterprisePool(value) {
    const record = isRecord(value) ? value : {};
    return {
        total: readNonNegativeNumber(record.total),
        used: readNonNegativeNumber(record.used),
        remaining: readNonNegativeNumber(record.remaining),
    };
}
function readQuotaStatus(value) {
    const record = isRecord(value) ? value : {};
    const normalizedReason = readString(record.reason);
    const reason = Object.values(constants_1.EnterpriseQuotaReason).find(item => item === normalizedReason) ?? null;
    return {
        available: typeof record.available === 'boolean' ? record.available : reason === null,
        reason,
        errorCode: readInteger(record.errorCode),
    };
}
function findContextCandidate(value) {
    if (!isRecord(value))
        return null;
    const directMode = readString(value.accountMode).toLowerCase();
    if (directMode === constants_1.EnterpriseAccountMode.Personal) {
        return null;
    }
    if (value.enterpriseId != null
        && readString(value.enterpriseName)
        && readRole(value.role) !== null) {
        return value;
    }
    for (const key of [
        'enterpriseContext',
        'accountContext',
        'organizationContext',
        'context',
        'user',
        'data',
    ]) {
        const candidate = findContextCandidate(value[key]);
        if (candidate)
            return candidate;
    }
    return directMode === constants_1.EnterpriseAccountMode.Enterprise ? value : null;
}
function readAccountMode(value) {
    if (!isRecord(value))
        return null;
    const direct = readString(value.accountMode).toLowerCase();
    if (direct)
        return direct;
    for (const key of ['enterpriseContext', 'accountContext', 'organizationContext', 'context', 'user', 'data']) {
        const nested = readAccountMode(value[key]);
        if (nested)
            return nested;
    }
    return null;
}
function normalizeEnterpriseAccountContext(value) {
    const candidate = findContextCandidate(value);
    if (!candidate)
        return null;
    const enterpriseId = readEnterpriseId(candidate.enterpriseId);
    const memberId = readEnterpriseId(candidate.memberId);
    const enterpriseName = readString(candidate.enterpriseName);
    const role = readRole(candidate.role);
    if (enterpriseId === null || memberId === null || !enterpriseName || role === null) {
        return null;
    }
    return {
        accountMode: constants_1.EnterpriseAccountMode.Enterprise,
        enterpriseId,
        memberId,
        enterpriseName,
        role,
        permissions: readPermissions(candidate.permissions, role),
        memberQuota: readMemberQuota(candidate.memberQuota),
        enterprisePool: readEnterprisePool(candidate.enterprisePool),
        quotaStatus: readQuotaStatus(candidate.quotaStatus),
    };
}
function normalizeEnterpriseAccountIdentities(value) {
    if (!isRecord(value) || !Array.isArray(value.enterprises))
        return [];
    return value.enterprises.flatMap((item) => {
        if (!isRecord(item))
            return [];
        const enterpriseId = readEnterpriseId(item.enterpriseId);
        const enterpriseName = readString(item.enterpriseName);
        const role = readRole(item.role);
        if (enterpriseId === null || !enterpriseName || role === null)
            return [];
        return [{ enterpriseId, enterpriseName, role }];
    });
}
function getPersistedEnterpriseAccountContext(store) {
    try {
        const persisted = store.get(constants_1.EnterpriseAccountStoreKey.Context);
        return normalizeEnterpriseAccountContext(persisted);
    }
    catch (error) {
        console.warn('[EnterpriseAccount] failed to read persisted account context', error);
        return null;
    }
}
function persistEnterpriseAccountContext(store, context) {
    store.set(constants_1.EnterpriseAccountStoreKey.Context, context);
}
function clearEnterpriseAccountContext(store) {
    store.delete(constants_1.EnterpriseAccountStoreKey.Context);
}
function buildEnterpriseAccountRequestHeaders(context) {
    if (!context)
        return {};
    return {
        [constants_1.EnterpriseAccountRequestHeader.AccountMode]: context.accountMode,
        [constants_1.EnterpriseAccountRequestHeader.EnterpriseId]: String(context.enterpriseId),
    };
}
async function fetchEnterpriseAccountContext(deps) {
    const url = `${deps.getServerBaseUrl()}/api/enterprise/context`;
    const requestTimeoutMs = resolveRequestTimeoutMs(deps.requestTimeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
        console.debug('[EnterpriseAccount] refreshing account context');
        const response = await deps.fetchWithAuth(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        const rawBody = await response.json();
        const body = isRecord(rawBody) ? rawBody : {};
        const code = readInteger(body.code);
        const message = readString(body.message);
        if (deps.isRequestCurrent?.() === false) {
            console.debug('[EnterpriseAccount] discarded context response after auth state changed');
            return {
                success: false,
                context: getPersistedEnterpriseAccountContext(deps.store),
                error: 'Authentication state changed during enterprise context refresh',
            };
        }
        if (!response.ok || code !== 0) {
            if (code === constants_1.EnterpriseApiErrorCode.NotFound
                || code === constants_1.EnterpriseApiErrorCode.NotMember
                || code === constants_1.EnterpriseApiErrorCode.AccountModeMismatch) {
                if (code === constants_1.EnterpriseApiErrorCode.AccountModeMismatch) {
                    deps.onAccountModeMismatch?.();
                }
                if (code === constants_1.EnterpriseApiErrorCode.NotMember) {
                    deps.onMembershipRevoked?.();
                }
                clearEnterpriseAccountContext(deps.store);
                console.log(`[EnterpriseAccount] cleared stale account context after server code ${code}`);
            }
            else {
                console.warn(`[EnterpriseAccount] context refresh rejected (HTTP ${response.status}, code ${code ?? 'unknown'})`);
            }
            return {
                success: false,
                context: getPersistedEnterpriseAccountContext(deps.store),
                error: message || `HTTP ${response.status}`,
            };
        }
        const context = normalizeEnterpriseAccountContext(body.data);
        if (context) {
            persistEnterpriseAccountContext(deps.store, context);
            console.debug(`[EnterpriseAccount] refreshed context for enterprise ${context.enterpriseId} with role ${context.role}`);
        }
        else if (readAccountMode(body.data) === constants_1.EnterpriseAccountMode.Enterprise) {
            console.warn('[EnterpriseAccount] rejected incomplete enterprise account context; preserving the last valid context');
            return {
                success: false,
                context: getPersistedEnterpriseAccountContext(deps.store),
                error: 'Enterprise account context response was incomplete',
            };
        }
        else {
            clearEnterpriseAccountContext(deps.store);
            console.debug('[EnterpriseAccount] refreshed personal account context');
        }
        return { success: true, context };
    }
    catch (error) {
        const timedOut = controller.signal.aborted;
        console.warn(timedOut
            ? `[EnterpriseAccount] context refresh timed out after ${requestTimeoutMs}ms`
            : '[EnterpriseAccount] context refresh failed', error);
        return {
            success: false,
            context: getPersistedEnterpriseAccountContext(deps.store),
            error: timedOut
                ? 'Enterprise account context request timed out'
                : error instanceof Error
                    ? error.message
                    : 'Failed to load enterprise account context',
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
async function fetchEnterpriseAccountIdentities(deps) {
    const url = `${deps.getServerBaseUrl()}/api/enterprise/identities`;
    const requestTimeoutMs = resolveRequestTimeoutMs(deps.requestTimeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
        console.debug('[EnterpriseAccount] refreshing enterprise identities');
        const response = await deps.fetchWithAuth(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        const rawBody = await response.json();
        const body = isRecord(rawBody) ? rawBody : {};
        const code = readInteger(body.code);
        const message = readString(body.message);
        if (deps.isRequestCurrent?.() === false) {
            return {
                success: false,
                identities: [],
                error: 'Authentication state changed during enterprise identity refresh',
            };
        }
        if (!response.ok || code !== 0) {
            console.warn(`[EnterpriseAccount] identity refresh rejected (HTTP ${response.status}, code ${code ?? 'unknown'})`);
            return {
                success: false,
                identities: [],
                error: message || `HTTP ${response.status}`,
            };
        }
        const identities = normalizeEnterpriseAccountIdentities(body.data);
        console.debug(`[EnterpriseAccount] refreshed ${identities.length} enterprise identities`);
        return {
            success: true,
            identities,
        };
    }
    catch (error) {
        const timedOut = controller.signal.aborted;
        console.warn(timedOut
            ? `[EnterpriseAccount] identity refresh timed out after ${requestTimeoutMs}ms`
            : '[EnterpriseAccount] identity refresh failed', error);
        return {
            success: false,
            identities: [],
            error: timedOut
                ? 'Enterprise account identities request timed out'
                : error instanceof Error
                    ? error.message
                    : 'Failed to load enterprise account identities',
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
async function requestEnterpriseQuotaIncrease(deps, enterpriseId, requestType) {
    const normalizedEnterpriseId = readEnterpriseId(enterpriseId);
    if (normalizedEnterpriseId === null) {
        console.warn('[EnterpriseAccount] rejected quota request with invalid enterprise id');
        return { success: false, error: 'Invalid enterprise ID' };
    }
    if (!Object.values(constants_1.EnterpriseQuotaRequestType).some(type => type === requestType)) {
        console.warn('[EnterpriseAccount] rejected quota request with invalid request type');
        return { success: false, error: 'Invalid enterprise quota request type' };
    }
    const url = `${deps.getServerBaseUrl()}/api/enterprise/${normalizedEnterpriseId}/quota-requests`;
    const requestTimeoutMs = resolveRequestTimeoutMs(deps.requestTimeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
        console.debug(`[EnterpriseAccount] submitting ${requestType} quota request for enterprise ${normalizedEnterpriseId}`);
        const response = await deps.fetchWithAuth(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requestType }),
            signal: controller.signal,
        });
        const rawBody = await response.json();
        const body = isRecord(rawBody) ? rawBody : {};
        const code = readInteger(body.code);
        const message = readString(body.message);
        const data = isRecord(body.data) ? body.data : {};
        if (deps.isRequestCurrent?.() === false) {
            console.debug('[EnterpriseAccount] discarded quota request response after auth state changed');
            return { success: false, error: 'Authentication state changed during quota request' };
        }
        if (!response.ok || code !== 0) {
            console.warn(`[EnterpriseAccount] quota request rejected (HTTP ${response.status}, code ${code ?? 'unknown'})`);
            return { success: false, error: message || `HTTP ${response.status}` };
        }
        const result = {
            success: true,
            requestId: readEnterpriseId(data.requestId) ?? undefined,
            requestType,
            status: 'pending',
            created: data.created === true,
        };
        console.debug(`[EnterpriseAccount] quota request accepted (request ${result.requestId ?? 'unknown'}, created ${result.created === true})`);
        return result;
    }
    catch (error) {
        const timedOut = controller.signal.aborted;
        console.warn(timedOut
            ? `[EnterpriseAccount] quota request timed out after ${requestTimeoutMs}ms`
            : '[EnterpriseAccount] quota request failed', error);
        return {
            success: false,
            error: timedOut
                ? 'Enterprise quota request timed out'
                : error instanceof Error
                    ? error.message
                    : 'Failed to submit enterprise quota request',
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=context.js.map
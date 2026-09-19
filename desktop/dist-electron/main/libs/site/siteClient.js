"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseSiteQuotaReservation = exports.createSiteQuotaReservation = exports.getSiteDeploymentQuota = exports.getSiteAnalytics = exports.deleteSite = exports.updateSiteAccessStatus = exports.updateSiteAccessMode = exports.updateSiteTitle = exports.getSite = exports.listSites = void 0;
const constants_1 = require("../../../shared/publishing/constants");
const readResponse = async (response) => {
    const body = (await response.json().catch(() => null));
    if (response.ok && body?.code === 0 && body.data !== undefined) {
        return { success: true, data: body.data };
    }
    const quota = (0, constants_1.normalizePublishingQuotaErrorData)(body?.data);
    return {
        success: false,
        code: body?.code ?? response.status,
        error: body?.message || response.statusText || 'Site request failed',
        ...(quota ? { quota } : {}),
    };
};
const request = async (serverBaseUrl, fetchWithAuth, path, options) => {
    try {
        return await readResponse(await fetchWithAuth(`${serverBaseUrl}${path}`, options));
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Site request failed',
        };
    }
};
const jsonOptions = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});
const normalizeSiteRecoveryMode = (site) => {
    const subscriptionRecoveryMode = (0, constants_1.normalizePublishingSubscriptionRecoveryMode)(site.subscriptionRecoveryMode);
    const normalized = { ...site };
    if (subscriptionRecoveryMode === undefined) {
        delete normalized.subscriptionRecoveryMode;
    }
    else {
        normalized.subscriptionRecoveryMode = subscriptionRecoveryMode;
    }
    return normalized;
};
const normalizeSiteResult = (result) => (result.success && result.data
    ? { ...result, data: normalizeSiteRecoveryMode(result.data) }
    : result);
const listSites = async (serverBaseUrl, fetchWithAuth, options) => {
    const query = new URLSearchParams({
        page: String(options.page ?? 1),
        pageSize: String(options.pageSize ?? 10),
    });
    if (options.keyword?.trim())
        query.set('keyword', options.keyword.trim());
    if (options.siteStatus)
        query.set('siteStatus', options.siteStatus);
    if (options.accessMode)
        query.set('accessMode', options.accessMode);
    if (options.siteKind)
        query.set('siteKind', options.siteKind);
    const result = await request(serverBaseUrl, fetchWithAuth, `/api/sites?${query.toString()}`);
    return result.success && result.data
        ? { ...result, data: { ...result.data, list: result.data.list.map(normalizeSiteRecoveryMode) } }
        : result;
};
exports.listSites = listSites;
const getSite = async (serverBaseUrl, fetchWithAuth, shareId) => normalizeSiteResult(await request(serverBaseUrl, fetchWithAuth, `/api/sites/${encodeURIComponent(shareId)}`));
exports.getSite = getSite;
const updateSiteTitle = async (serverBaseUrl, fetchWithAuth, shareId, title) => normalizeSiteResult(await request(serverBaseUrl, fetchWithAuth, `/api/sites/${encodeURIComponent(shareId)}`, jsonOptions('PATCH', { title })));
exports.updateSiteTitle = updateSiteTitle;
const updateSiteAccessMode = async (serverBaseUrl, fetchWithAuth, shareId, accessMode) => normalizeSiteResult(await request(serverBaseUrl, fetchWithAuth, `/api/sites/${encodeURIComponent(shareId)}/access-mode`, jsonOptions('PUT', { accessMode })));
exports.updateSiteAccessMode = updateSiteAccessMode;
const updateSiteAccessStatus = async (serverBaseUrl, fetchWithAuth, shareId, status) => normalizeSiteResult(await request(serverBaseUrl, fetchWithAuth, `/api/sites/${encodeURIComponent(shareId)}/access-status`, jsonOptions('PATCH', { status })));
exports.updateSiteAccessStatus = updateSiteAccessStatus;
const deleteSite = (serverBaseUrl, fetchWithAuth, shareId) => request(serverBaseUrl, fetchWithAuth, `/api/sites/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
});
exports.deleteSite = deleteSite;
const getSiteAnalytics = (serverBaseUrl, fetchWithAuth, shareId, options) => {
    const query = new URLSearchParams();
    if (options.from)
        query.set('from', options.from);
    if (options.to)
        query.set('to', options.to);
    if (options.limit)
        query.set('limit', String(options.limit));
    const suffix = query.size ? `?${query.toString()}` : '';
    return request(serverBaseUrl, fetchWithAuth, `/api/sites/${encodeURIComponent(shareId)}/analytics${suffix}`);
};
exports.getSiteAnalytics = getSiteAnalytics;
const getSiteDeploymentQuota = (serverBaseUrl, fetchWithAuth, options) => {
    const query = new URLSearchParams({
        page: String(options.page ?? 1),
        pageSize: String(options.pageSize ?? 10),
    });
    if (options.targetShareId)
        query.set('targetShareId', options.targetShareId);
    if (options.keyword?.trim())
        query.set('keyword', options.keyword.trim());
    return request(serverBaseUrl, fetchWithAuth, `/api/sites/deployment-quota?${query.toString()}`);
};
exports.getSiteDeploymentQuota = getSiteDeploymentQuota;
const createSiteQuotaReservation = (serverBaseUrl, fetchWithAuth, input) => request(serverBaseUrl, fetchWithAuth, '/api/sites/deployment-quota/reservations', jsonOptions('POST', input));
exports.createSiteQuotaReservation = createSiteQuotaReservation;
const releaseSiteQuotaReservation = (serverBaseUrl, fetchWithAuth, reservationId) => request(serverBaseUrl, fetchWithAuth, `/api/sites/deployment-quota/reservations/${encodeURIComponent(reservationId)}`, { method: 'DELETE' });
exports.releaseSiteQuotaReservation = releaseSiteQuotaReservation;
//# sourceMappingURL=siteClient.js.map
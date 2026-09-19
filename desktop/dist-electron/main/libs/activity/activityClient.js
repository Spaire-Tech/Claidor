"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityAuthMode = void 0;
exports.getActivitySlot = getActivitySlot;
exports.getActivityContext = getActivityContext;
exports.executeActivityAction = executeActivityAction;
exports.ActivityAuthMode = {
    Optional: 'optional',
    Required: 'required',
};
async function readResponse(response) {
    const body = await response.json().catch(() => null);
    if (response.ok && body?.code === 0 && body.data !== undefined) {
        return { success: true, data: body.data };
    }
    return {
        success: false,
        code: body?.code,
        httpStatus: response.status,
        error: body?.message || response.statusText || 'Activity request failed',
    };
}
async function request(serverBaseUrl, activityFetch, path, authMode, init) {
    try {
        const headers = new Headers(init?.headers);
        headers.set('Cache-Control', 'no-store');
        const response = await activityFetch(`${serverBaseUrl}${path}`, { ...init, headers }, authMode);
        return await readResponse(response);
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Activity request failed',
        };
    }
}
function getActivitySlot(serverBaseUrl, activityFetch, input) {
    const query = new URLSearchParams({
        placement: input.placement,
        clientVersion: input.clientVersion,
        containerApiVersion: String(input.containerApiVersion),
        platform: input.platform,
    });
    return request(serverBaseUrl, activityFetch, `/api/client-activities/slot?${query.toString()}`, exports.ActivityAuthMode.Optional);
}
function getActivityContext(serverBaseUrl, activityFetch, activityCode, configRevision) {
    const query = new URLSearchParams({ configRevision: String(configRevision) });
    return request(serverBaseUrl, activityFetch, `/api/client-activities/${encodeURIComponent(activityCode)}/context?${query.toString()}`, exports.ActivityAuthMode.Optional);
}
function executeActivityAction(serverBaseUrl, activityFetch, input) {
    return request(serverBaseUrl, activityFetch, `/api/client-activities/${encodeURIComponent(input.activityCode)}/actions/`
        + encodeURIComponent(input.actionId), exports.ActivityAuthMode.Required, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            configRevision: input.configRevision,
            idempotencyKey: input.idempotencyKey,
            payload: {},
        }),
    });
}
//# sourceMappingURL=activityClient.js.map
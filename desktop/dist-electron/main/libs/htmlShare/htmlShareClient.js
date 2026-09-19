"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHtmlSharePublicUrl = buildHtmlSharePublicUrl;
exports.uploadHtmlShare = uploadHtmlShare;
exports.updateHtmlShare = updateHtmlShare;
exports.updateHtmlShareStatus = updateHtmlShareStatus;
exports.updateHtmlShareAccessMode = updateHtmlShareAccessMode;
exports.deleteHtmlSharePermanently = deleteHtmlSharePermanently;
exports.getHtmlShareBySource = getHtmlShareBySource;
exports.getGeneratedVideoShareSource = getGeneratedVideoShareSource;
exports.createGeneratedVideoShare = createGeneratedVideoShare;
exports.resolveLegacyGeneratedVideoSource = resolveLegacyGeneratedVideoSource;
exports.getHtmlShareAnalytics = getHtmlShareAnalytics;
exports.getHtmlShareQuota = getHtmlShareQuota;
exports.getPublishingTrialPolicy = getPublishingTrialPolicy;
const fs_1 = __importDefault(require("fs"));
const constants_1 = require("../../../shared/htmlShare/constants");
const constants_2 = require("../../../shared/publishing/constants");
function buildHtmlSharePublicUrl(publicBaseUrl, shareId) {
    const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/+$/, '');
    return `${normalizedBaseUrl}/${encodeURIComponent(shareId)}/`;
}
function appendHtmlShareFormData(form, input, buffer) {
    const archiveBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    if (input.clientSourceKey)
        form.set('clientSourceKey', input.clientSourceKey);
    if (input.sessionId)
        form.set('sessionId', input.sessionId);
    if (input.artifactId)
        form.set('artifactId', input.artifactId);
    form.set('title', input.title);
    form.set('entryFile', input.entryFile);
    if (input.accessMode)
        form.set('accessMode', input.accessMode);
    form.set('sourceSha256', input.sourceSha256);
    form.set('archive', new Blob([archiveBuffer], { type: 'application/zip' }), 'share.zip');
}
function buildHtmlShareResult(payload, publicBaseUrl) {
    if (!payload.data)
        return null;
    const responseShareUrl = payload.data.url?.trim();
    const shareUrl = responseShareUrl ||
        (payload.data.shareId ? buildHtmlSharePublicUrl(publicBaseUrl, payload.data.shareId) : undefined);
    if (!shareUrl)
        return null;
    return {
        success: true,
        shareId: payload.data.shareId,
        url: shareUrl,
        accessMode: payload.data.accessMode,
        shareCode: payload.data.shareCode,
        shareCodeUnavailable: payload.data.shareCodeUnavailable,
        status: payload.data.status,
        moderationStatus: payload.data.moderationStatus,
        updatedAt: payload.data.updatedAt,
        contentUpdatedAt: payload.data.contentUpdatedAt,
        ...(Object.prototype.hasOwnProperty.call(payload.data, 'accessExpiresAt')
            ? { accessExpiresAt: payload.data.accessExpiresAt }
            : {}),
        subscriptionRecoveryMode: (0, constants_2.normalizePublishingSubscriptionRecoveryMode)(payload.data.subscriptionRecoveryMode),
        disabledAt: payload.data.disabledAt,
        disabledReason: payload.data.disabledReason,
        disabledSource: payload.data.disabledSource,
        restoredByUpdate: payload.data.restoredByUpdate,
    };
}
function buildHtmlShareFailure(payload, fallbackError) {
    const quota = (0, constants_2.normalizePublishingQuotaErrorData)(payload?.data);
    const sizeDetails = payload?.code === constants_1.HtmlShareErrorCode.TooLarge
        ? {
            ...(typeof payload.data?.limitBytes === 'number'
                ? { limitBytes: payload.data.limitBytes }
                : {}),
            ...(typeof payload.data?.actualBytes === 'number'
                ? { actualBytes: payload.data.actualBytes }
                : {}),
        }
        : undefined;
    return {
        success: false,
        error: payload?.message || fallbackError,
        code: payload?.code,
        ...(sizeDetails
            ? {
                failureKind: constants_1.HtmlShareFailureKind.FileTooLarge,
                details: sizeDetails,
            }
            : {}),
        ...(quota ? { quota } : {}),
    };
}
function buildGeneratedVideoSourceResult(payload, publicBaseUrl) {
    const share = payload.data?.share
        ? buildHtmlShareResult({ code: payload.code, data: payload.data.share }, publicBaseUrl)
        : null;
    return {
        success: payload.code === 0,
        share,
        state: payload.data?.state,
        taskId: payload.data?.taskId === undefined ? undefined : String(payload.data.taskId),
        outputIndex: payload.data?.outputIndex,
        assetStatus: payload.data?.assetStatus,
        retryAfterMs: payload.data?.retryAfterMs,
        failureReason: payload.data?.failureReason,
        limitBytes: payload.data?.limitBytes,
        error: payload.code === 0 ? undefined : payload.message,
        code: payload.code,
    };
}
function generatedVideoTerminalCode(result) {
    if (result.failureReason === 'too_large') {
        return constants_1.HtmlShareErrorCode.TooLarge;
    }
    if (result.assetStatus === 'source_unavailable' || result.failureReason === 'source_unavailable') {
        return constants_1.HtmlShareErrorCode.VideoSourceUnavailable;
    }
    if (result.assetStatus === 'invalid' || result.failureReason === 'prepare_failed') {
        return constants_1.HtmlShareErrorCode.VideoPrepareFailed;
    }
    return undefined;
}
function wait(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}
function getRecordString(record, fieldName) {
    const value = record[fieldName];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function getNestedRecord(record, fieldName) {
    const value = record[fieldName];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function getHtmlShareListItems(data) {
    const source = (() => {
        if (Array.isArray(data))
            return data;
        if (!data || typeof data !== 'object')
            return [];
        const record = data;
        for (const fieldName of ['items', 'shares', 'list', 'records', 'rows']) {
            const value = record[fieldName];
            if (Array.isArray(value))
                return value;
        }
        return [];
    })();
    return source.filter((item) => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
}
function getShareRecordSourceType(record) {
    return getRecordString(record, 'sourceType') ?? getRecordString(getNestedRecord(record, 'source') ?? {}, 'type');
}
function getShareRecordClientSourceKey(record) {
    return (getRecordString(record, 'clientSourceKey') ??
        getRecordString(record, 'sourceKey') ??
        getRecordString(getNestedRecord(record, 'source') ?? {}, 'clientSourceKey') ??
        getRecordString(getNestedRecord(record, 'source') ?? {}, 'key'));
}
function findHtmlShareByClientSourceKey(data, sourceType, clientSourceKey) {
    return (getHtmlShareListItems(data).find(item => {
        const itemSourceType = getShareRecordSourceType(item);
        const itemClientSourceKey = getShareRecordClientSourceKey(item);
        return itemSourceType === sourceType && itemClientSourceKey === clientSourceKey;
    }) ?? null);
}
async function uploadHtmlShare(serverBaseUrl, publicBaseUrl, fetchWithAuth, input) {
    const buffer = await fs_1.default.promises.readFile(input.archivePath);
    console.debug(`[HtmlShare] prepared ${buffer.length} bytes for ${input.sourceType} upload to ${serverBaseUrl}`);
    console.debug(`[HtmlShare] upload request uses access mode ${input.accessMode ?? 'server-default'}, entry ${input.entryFile}, and hash ${input.sourceSha256}`);
    const form = new FormData();
    form.set('sourceType', input.sourceType);
    appendHtmlShareFormData(form, input, buffer);
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares`, {
        method: 'POST',
        body: form,
    });
    console.debug(`[HtmlShare] upload response returned HTTP ${response.status} with content type ${response.headers.get('content-type') || 'unknown'}`);
    let payload = null;
    try {
        payload = (await response.json());
    }
    catch {
        console.debug('[HtmlShare] upload response did not contain JSON');
        // Non-JSON errors are handled below.
    }
    console.debug(`[HtmlShare] upload response API code was ${payload?.code ?? 'missing'} and message was ${payload?.message || 'empty'}`);
    const result = payload ? buildHtmlShareResult(payload, publicBaseUrl) : null;
    if (!response.ok || payload?.code !== 0 || !result) {
        console.debug(`[HtmlShare] upload failed with HTTP ${response.status}, API code ${payload?.code ?? 'missing'}, and share URL ${result?.url ? 'present' : 'missing'}`);
        return buildHtmlShareFailure(payload, `Share upload failed: ${response.status}`);
    }
    console.debug(`[HtmlShare] upload succeeded with share ${payload.data.shareId || 'missing'} and status ${payload.data.status || 'missing'}`);
    return result;
}
async function updateHtmlShare(serverBaseUrl, publicBaseUrl, fetchWithAuth, shareId, input) {
    const buffer = await fs_1.default.promises.readFile(input.archivePath);
    const form = new FormData();
    form.set('sourceType', input.sourceType);
    appendHtmlShareFormData(form, input, buffer);
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/${encodeURIComponent(shareId)}`, {
        method: 'PUT',
        body: form,
    });
    const payload = (await response.json().catch(() => null));
    const result = payload ? buildHtmlShareResult(payload, publicBaseUrl) : null;
    if (!response.ok || payload?.code !== 0 || !result) {
        return buildHtmlShareFailure(payload, `Share update failed: ${response.status}`);
    }
    return result;
}
async function updateHtmlShareStatus(serverBaseUrl, publicBaseUrl, fetchWithAuth, shareId, status) {
    if (status !== constants_1.HtmlShareStatus.Live && status !== constants_1.HtmlShareStatus.Disabled) {
        return {
            success: false,
            error: 'HTML share status must be live or disabled.',
        };
    }
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/${encodeURIComponent(shareId)}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
    });
    const payload = (await response.json().catch(() => null));
    const result = payload ? buildHtmlShareResult(payload, publicBaseUrl) : null;
    if (!response.ok || payload?.code !== 0 || !result) {
        return buildHtmlShareFailure(payload, `Share status update failed: ${response.status}`);
    }
    return result;
}
async function updateHtmlShareAccessMode(serverBaseUrl, publicBaseUrl, fetchWithAuth, shareId, accessMode) {
    if (accessMode !== constants_1.HtmlShareAccessMode.Code && accessMode !== constants_1.HtmlShareAccessMode.Public) {
        return {
            success: false,
            error: 'Invalid share access mode.',
        };
    }
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/${encodeURIComponent(shareId)}/access-mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessMode }),
    });
    const payload = (await response.json().catch(() => null));
    const result = payload ? buildHtmlShareResult(payload, publicBaseUrl) : null;
    if (!response.ok || payload?.code !== 0 || !result) {
        return buildHtmlShareFailure(payload, `Share access mode update failed: ${response.status}`);
    }
    return result;
}
async function deleteHtmlSharePermanently(serverBaseUrl, fetchWithAuth, shareId) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/${encodeURIComponent(shareId)}/permanent`, { method: 'DELETE' });
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.code !== 0) {
        return {
            success: false,
            error: payload?.message || `Share deletion failed: ${response.status}`,
            code: payload?.code,
            httpStatus: response.status,
        };
    }
    return { success: true, httpStatus: response.status };
}
async function getHtmlShareBySource(serverBaseUrl, publicBaseUrl, fetchWithAuth, sourceType, clientSourceKey) {
    const params = new URLSearchParams({
        sourceType,
        clientSourceKey,
        includeDisabled: 'true',
    });
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/source?${params.toString()}`);
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.code !== 0) {
        return {
            success: false,
            error: payload?.message || `Share lookup failed: ${response.status}`,
            code: payload?.code,
        };
    }
    const share = payload ? buildHtmlShareResult(payload, publicBaseUrl) : null;
    if (share) {
        return {
            success: true,
            share,
        };
    }
    const listResponse = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/my`);
    const listPayload = (await listResponse.json().catch(() => null));
    if (!listResponse.ok || listPayload?.code !== 0) {
        return {
            success: false,
            error: listPayload?.message || `Share list failed: ${listResponse.status}`,
            code: listPayload?.code,
        };
    }
    const fallbackShare = listPayload
        ? buildHtmlShareResult({
            code: 0,
            data: findHtmlShareByClientSourceKey(listPayload.data, sourceType, clientSourceKey),
        }, publicBaseUrl)
        : null;
    return {
        success: true,
        share: fallbackShare,
    };
}
async function getGeneratedVideoShareSource(serverBaseUrl, publicBaseUrl, fetchWithAuth, taskId, outputIndex) {
    const params = new URLSearchParams({
        taskId,
        outputIndex: String(outputIndex),
    });
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/generated-videos/source?${params.toString()}`, { cache: 'no-store' });
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.code !== 0) {
        return {
            success: false,
            error: payload?.message || `Generated video share lookup failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return buildGeneratedVideoSourceResult(payload, publicBaseUrl);
}
async function prepareGeneratedVideoShare(serverBaseUrl, publicBaseUrl, fetchWithAuth, input) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/generated-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null));
    if ((!response.ok && response.status !== 202) || payload?.code !== 0) {
        return buildHtmlShareFailure(payload, `Generated video share failed: ${response.status}`);
    }
    if (!payload) {
        return {
            success: false,
            code: constants_1.HtmlShareErrorCode.VideoPrepareFailed,
            error: 'Generated video share returned an empty response.',
        };
    }
    return buildGeneratedVideoSourceResult(payload, publicBaseUrl);
}
async function createGeneratedVideoShare(serverBaseUrl, publicBaseUrl, fetchWithAuth, input) {
    const deadline = Date.now() + 3 * 60 * 1000;
    let shouldPrepare = true;
    while (Date.now() < deadline) {
        const result = shouldPrepare
            ? await prepareGeneratedVideoShare(serverBaseUrl, publicBaseUrl, fetchWithAuth, input)
            : await getGeneratedVideoShareSource(serverBaseUrl, publicBaseUrl, fetchWithAuth, input.taskId, input.outputIndex);
        if (!result.success)
            return result;
        if ('share' in result && result.share?.success)
            return result.share;
        const source = result;
        const terminalCode = generatedVideoTerminalCode(source);
        if (terminalCode) {
            return {
                success: false,
                code: terminalCode,
                error: source.failureReason || 'Generated video is unavailable for sharing.',
                ...(terminalCode === constants_1.HtmlShareErrorCode.TooLarge
                    ? {
                        failureKind: constants_1.HtmlShareFailureKind.FileTooLarge,
                        details: typeof source.limitBytes === 'number'
                            ? { limitBytes: source.limitBytes }
                            : undefined,
                    }
                    : {}),
            };
        }
        shouldPrepare = source.state === 'prepared' || source.assetStatus === 'persisted';
        await wait(Math.max(250, Math.min(5000, source.retryAfterMs ?? 1500)));
    }
    return {
        success: false,
        code: constants_1.HtmlShareErrorCode.VideoPrepareFailed,
        error: 'Generated video is still being prepared. Please try again.',
    };
}
async function resolveLegacyGeneratedVideoSource(serverBaseUrl, fetchWithAuth, resultUrlSha256) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/generated-videos/resolve-legacy-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultUrlSha256 }),
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.code !== 0 || payload.data?.taskId === undefined
        || !Number.isInteger(payload.data.outputIndex)) {
        return {
            success: false,
            error: payload?.message || `Generated video source resolution failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return {
        success: true,
        taskId: String(payload.data.taskId),
        outputIndex: payload.data.outputIndex,
    };
}
async function getHtmlShareAnalytics(serverBaseUrl, fetchWithAuth, shareId, options = {}) {
    const params = new URLSearchParams();
    if (options.from)
        params.set('from', options.from);
    if (options.to)
        params.set('to', options.to);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/${encodeURIComponent(shareId)}/analytics${query}`);
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.code !== 0 || !payload.data) {
        return {
            success: false,
            error: payload?.message || `Share analytics request failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return {
        success: true,
        analytics: payload.data,
    };
}
async function getHtmlShareQuota(serverBaseUrl, fetchWithAuth) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/quota`);
    const payload = (await response.json().catch(() => null));
    const normalized = (0, constants_2.normalizePublishingQuotaErrorData)(payload?.data);
    if (!response.ok
        || payload?.code !== 0
        || !normalized
        || typeof payload.data?.allowed !== 'boolean'
        || typeof payload.data.remaining !== 'number') {
        return {
            success: false,
            error: payload?.message || `Share quota request failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return {
        success: true,
        data: {
            ...normalized,
            allowed: payload.data.allowed,
            remaining: payload.data.remaining,
            ...(payload.data.planName ? { planName: payload.data.planName } : {}),
            ...(payload.data.planDisplayName
                ? { planDisplayName: payload.data.planDisplayName }
                : {}),
        },
    };
}
async function getPublishingTrialPolicy(serverBaseUrl, fetchWithAuth) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/publishing/trial-policy`, {
        cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null));
    const policy = (0, constants_2.normalizePublishingTrialPolicy)(payload?.data);
    if (!response.ok || payload?.code !== 0 || !policy) {
        return {
            success: false,
            error: payload?.message || `Publishing trial policy request failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return { success: true, data: policy };
}
//# sourceMappingURL=htmlShareClient.js.map
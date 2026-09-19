"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NIM_QR_POLL_INTERVAL = exports.DEFAULT_NIM_QR_EXPIRES_IN = exports.DEFAULT_NIM_QR_BASE_URL = exports.NimQrLoginErrorCode = exports.NimQrLoginStatus = void 0;
exports.buildQrPayload = buildQrPayload;
exports.isPendingBindResult = isPendingBindResult;
exports.normalizeBindResult = normalizeBindResult;
exports.NimQrLoginStatus = {
    Pending: 'pending',
    Success: 'success',
    Failed: 'failed',
};
exports.NimQrLoginErrorCode = {
    RequestFailed: 'request_failed',
    InvalidPayload: 'invalid_payload',
    InvalidUserAgent: 'invalid_user_agent',
    Timeout: 'timeout',
};
exports.DEFAULT_NIM_QR_BASE_URL = 'https://lbs.netease.im';
exports.DEFAULT_NIM_QR_EXPIRES_IN = 180;
exports.DEFAULT_NIM_QR_POLL_INTERVAL = 3000;
function buildQrPayload(uuid, template = '') {
    const effectiveTemplate = template.trim();
    if (!effectiveTemplate) {
        return uuid;
    }
    return effectiveTemplate.includes('{uuid}')
        ? effectiveTemplate.replace(/\{uuid\}/g, uuid)
        : `${effectiveTemplate}${uuid}`;
}
function isPendingBindResult(raw) {
    if (!raw || typeof raw !== 'object')
        return false;
    const candidate = raw;
    return ((candidate.code === 200 && candidate.data === 'not found')
        || (candidate.code === 404 && candidate.msg === 'not found'));
}
function normalizeBindResult(raw) {
    const candidate = raw && typeof raw === 'object' ? raw : {};
    const payload = candidate.data && typeof candidate.data === 'object'
        ? candidate.data
        : null;
    if (candidate.data === 'invalid user-agent' || candidate.msg === 'invalid user-agent') {
        throw new Error(exports.NimQrLoginErrorCode.InvalidUserAgent);
    }
    if (candidate.code !== 200) {
        throw new Error(typeof candidate.msg === 'string' ? candidate.msg : exports.NimQrLoginErrorCode.RequestFailed);
    }
    if (payload?.appkey && payload?.accid && payload?.token) {
        return {
            appKey: String(payload.appkey).trim(),
            account: String(payload.accid).trim(),
            token: String(payload.token).trim(),
        };
    }
    throw new Error(exports.NimQrLoginErrorCode.InvalidPayload);
}
//# sourceMappingURL=nimQrLogin.js.map
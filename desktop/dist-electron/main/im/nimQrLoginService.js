"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNimQrLogin = startNimQrLogin;
exports.pollNimQrLogin = pollNimQrLogin;
const nimQrLogin_1 = require("../../shared/im/nimQrLogin");
function normalizeBaseUrl(baseUrl) {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
        throw new Error('QR binding base URL is required.');
    }
    return trimmed.replace(/\/+$/, '');
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function requestJson(url, body, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 10_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'YUNXIN-AI-BOT-SDK',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        return response.json();
    }
    catch (error) {
        if (isAbortError(error)) {
            throw new Error(nimQrLogin_1.NimQrLoginErrorCode.Timeout);
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
async function startNimQrLogin(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? nimQrLogin_1.DEFAULT_NIM_QR_BASE_URL);
    const rawResult = await requestJson(`${baseUrl}/lbs/getQrCode`, {}, options);
    const result = rawResult && typeof rawResult === 'object' ? rawResult : {};
    const uuid = String(result.data?.uuid || result.data?.qrCode || '').trim();
    if (result.code !== 200 || !uuid) {
        console.warn('[NimQrLogin] start request returned unexpected payload:', result);
        throw new Error(typeof result.msg === 'string' ? result.msg : nimQrLogin_1.NimQrLoginErrorCode.RequestFailed);
    }
    const expireAt = Number(result.data?.expireAt || 0);
    const expiresIn = expireAt > 0
        ? Math.max(Math.ceil((expireAt - Date.now()) / 1000), 1)
        : (options.expiresIn ?? nimQrLogin_1.DEFAULT_NIM_QR_EXPIRES_IN);
    return {
        uuid,
        qrValue: result.data ? JSON.stringify(result.data) : (0, nimQrLogin_1.buildQrPayload)(uuid, options.payloadTemplate),
        expiresIn,
        pollInterval: options.pollInterval ?? nimQrLogin_1.DEFAULT_NIM_QR_POLL_INTERVAL,
        credentialKind: 'split',
        rawData: result.data ?? null,
    };
}
async function pollNimQrLogin(qrCode, options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? nimQrLogin_1.DEFAULT_NIM_QR_BASE_URL);
    const encodedQrCode = encodeURIComponent(String(qrCode));
    try {
        const result = await requestJson(`${baseUrl}/lbs/queryBindAiAccountByQrCode?qrCode=${encodedQrCode}`, null, options);
        if ((0, nimQrLogin_1.isPendingBindResult)(result)) {
            return { status: nimQrLogin_1.NimQrLoginStatus.Pending };
        }
        return {
            status: nimQrLogin_1.NimQrLoginStatus.Success,
            credentials: (0, nimQrLogin_1.normalizeBindResult)(result),
        };
    }
    catch (error) {
        const message = toErrorMessage(error);
        console.warn('[NimQrLogin] poll request failed for qr code:', qrCode, message);
        const errorCode = Object.values(nimQrLogin_1.NimQrLoginErrorCode).includes(message)
            ? message
            : nimQrLogin_1.NimQrLoginErrorCode.RequestFailed;
        return {
            status: nimQrLogin_1.NimQrLoginStatus.Failed,
            errorCode,
            error: message,
        };
    }
}
//# sourceMappingURL=nimQrLoginService.js.map
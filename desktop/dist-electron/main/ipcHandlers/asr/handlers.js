"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAsrIpcHandlers = registerAsrIpcHandlers;
const electron_1 = require("electron");
const constants_1 = require("../../../shared/asr/constants");
const readAsrResponseBody = async (resp) => await resp.json().catch(() => null);
const getAsrResponseMessage = (body, resp) => (body?.message || resp.statusText || 'No response message');
const getSafeWebSocketEndpoint = (wsUrl) => {
    try {
        const url = new URL(wsUrl);
        return `${url.origin}${url.pathname}`;
    }
    catch {
        return 'unknown';
    }
};
function registerAsrIpcHandlers({ getAuthTokens, fetchWithAuth, getServerApiBaseUrl, }) {
    electron_1.ipcMain.handle(constants_1.AsrIpcChannel.CreateRealtimeSession, async (_event, options) => {
        try {
            const tokens = getAuthTokens();
            if (!tokens) {
                console.warn('[ASR] realtime session request was rejected because no auth tokens are available');
                return { success: false, code: constants_1.AsrApiCode.Unauthorized, error: 'Unauthorized' };
            }
            const params = new URLSearchParams();
            if (options?.langType) {
                params.set('langType', options.langType);
            }
            const serverBaseUrl = getServerApiBaseUrl();
            const requestUrl = `${serverBaseUrl}/api/asr/realtime/sessions`;
            console.log(`[ASR] realtime session request started for ${requestUrl} with langType=${options?.langType || 'default'}`);
            const resp = await fetchWithAuth(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                },
                body: params.toString(),
            });
            const body = await readAsrResponseBody(resp);
            if (resp.ok && body?.code === 0 && body.data) {
                const data = body.data;
                console.log(`[ASR] realtime session request succeeded; requestId=${data.requestId}, wsEndpoint=${getSafeWebSocketEndpoint(data.wsUrl)}, maxSessionSeconds=${data.maxSessionSeconds}, remainingSecondsToday=${data.remainingSecondsToday}`);
                return { success: true, data };
            }
            console.warn(`[ASR] realtime session request to ${requestUrl} was rejected with code ${body?.code ?? resp.status}, HTTP status ${resp.status}, and message: ${getAsrResponseMessage(body, resp)}`);
            return {
                success: false,
                code: body?.code ?? resp.status,
                error: body?.message || resp.statusText || 'ASR realtime session request failed',
                message: body?.message,
            };
        }
        catch (error) {
            console.warn('[ASR] realtime session request failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'ASR realtime session request failed',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map
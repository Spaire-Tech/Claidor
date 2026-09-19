"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__openClawTokenProxyTestUtils = void 0;
exports.startOpenClawTokenProxy = startOpenClawTokenProxy;
exports.stopOpenClawTokenProxy = stopOpenClawTokenProxy;
exports.getOpenClawTokenProxyPort = getOpenClawTokenProxyPort;
exports.consumeRecentOpenClawTokenProxyQuotaError = consumeRecentOpenClawTokenProxyQuotaError;
exports.copyResponseHeaders = copyResponseHeaders;
const electron_1 = require("electron");
const http_1 = __importDefault(require("http"));
const coworkErrorClassify_1 = require("../../common/coworkErrorClassify");
const constants_1 = require("../../shared/auth/constants");
const constants_2 = require("../../shared/enterpriseAccount/constants");
const modelRuntimeProfiles_1 = require("../../shared/providers/modelRuntimeProfiles");
const PROXY_BIND_HOST = '127.0.0.1';
const RECENT_QUOTA_ERROR_TTL_MS = 30_000;
const MAX_PROXY_SSE_SCAN_BUFFER_CHARS = 1_048_576;
const GEMINI_FALLBACK_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';
let proxyServer = null;
let proxyPort = null;
let recentQuotaError = null;
// Injected dependencies
let tokenGetter = null;
let tokenRefresher = null;
let serverBaseUrlGetter = null;
let accountContextHeadersGetter = null;
let sessionKeyGetter = null;
let clientVersionGetter = null;
let enterpriseAuthSessionSnapshotGetter = null;
let enterpriseMembershipRevokedHandler = null;
function startOpenClawTokenProxy(config) {
    tokenGetter = config.getAuthTokens;
    tokenRefresher = config.refreshToken;
    serverBaseUrlGetter = config.getServerBaseUrl;
    accountContextHeadersGetter = config.getAccountContextHeaders ?? null;
    sessionKeyGetter = config.getSessionKey ?? null;
    clientVersionGetter = config.getClientVersion;
    enterpriseAuthSessionSnapshotGetter = config.getEnterpriseAuthSessionSnapshot ?? null;
    enterpriseMembershipRevokedHandler = config.onEnterpriseMembershipRevoked ?? null;
    return new Promise((resolve, reject) => {
        if (proxyServer) {
            if (proxyPort) {
                resolve({ port: proxyPort });
                return;
            }
            reject(new Error('Token proxy is starting'));
            return;
        }
        const server = http_1.default.createServer(handleRequest);
        server.listen(0, PROXY_BIND_HOST, () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                proxyPort = addr.port;
                proxyServer = server;
                console.log(`[EngineTokenProxy] started on ${PROXY_BIND_HOST}:${proxyPort}`);
                resolve({ port: proxyPort });
            }
            else {
                server.close();
                reject(new Error('Failed to bind token proxy'));
            }
        });
        server.on('error', (err) => {
            console.error('[EngineTokenProxy] server error:', err);
            reject(err);
        });
    });
}
function stopOpenClawTokenProxy() {
    if (proxyServer) {
        proxyServer.close();
        console.log('[EngineTokenProxy] stopped');
    }
    proxyServer = null;
    proxyPort = null;
    recentQuotaError = null;
    tokenGetter = null;
    tokenRefresher = null;
    serverBaseUrlGetter = null;
    accountContextHeadersGetter = null;
    sessionKeyGetter = null;
    clientVersionGetter = null;
    enterpriseAuthSessionSnapshotGetter = null;
    enterpriseMembershipRevokedHandler = null;
}
function getOpenClawTokenProxyPort() {
    return proxyPort;
}
function consumeRecentOpenClawTokenProxyQuotaError(now = Date.now()) {
    const error = recentQuotaError;
    recentQuotaError = null;
    if (!error) {
        return null;
    }
    if (now - error.capturedAt > RECENT_QUOTA_ERROR_TTL_MS) {
        return null;
    }
    return error;
}
function collectRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
function shouldRefreshLobsterAIToken(status) {
    return status === 401;
}
function isTemporaryAuthRefreshFailure(result) {
    return result.outcome === constants_1.AuthRefreshOutcome.TransientFailure;
}
function writeTemporaryAuthRefreshFailure(res) {
    res.writeHead(503, {
        'Content-Type': 'application/json',
        'Retry-After': '1',
    });
    res.end(JSON.stringify({
        error: {
            message: 'Login verification is temporarily unavailable. Please retry.',
            type: 'service_unavailable',
            code: 'auth_refresh_temporarily_unavailable',
        },
    }));
}
function isProxySessionKeyCurrent(expectedSessionKey, getCurrentSessionKey) {
    return getCurrentSessionKey === null || getCurrentSessionKey() === expectedSessionKey;
}
function writeAuthSessionChanged(res) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: {
            message: 'The authenticated account changed while the request was running.',
            type: 'authentication_error',
            code: 'auth_session_changed',
        },
    }));
}
async function handleRequest(req, res) {
    try {
        const tokens = tokenGetter?.();
        const serverBaseUrl = serverBaseUrlGetter?.();
        const requestSessionKey = sessionKeyGetter?.() ?? null;
        const requestEnterpriseSession = enterpriseAuthSessionSnapshotGetter?.() ?? null;
        const inspectionContext = requestEnterpriseSession && enterpriseMembershipRevokedHandler
            ? {
                requestEnterpriseSession,
                onEnterpriseMembershipRevoked: enterpriseMembershipRevokedHandler,
            }
            : undefined;
        if (!tokens?.accessToken || !serverBaseUrl) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No auth tokens available' }));
            return;
        }
        const body = await collectRequestBody(req);
        const upstreamBody = shouldHydrateGeminiChatCompletionsBody(req.url)
            ? hydrateGeminiChatCompletionsBody(body)
            : body;
        // Build upstream URL: serverBaseUrl + request path
        // OpenClaw sends to /v1/chat/completions, upstream is /api/proxy/v1/chat/completions
        const upstreamPath = `/api/proxy${req.url || '/'}`;
        const upstreamUrl = `${serverBaseUrl}${upstreamPath}`;
        const clientVersion = clientVersionGetter?.() ?? '';
        let result = await forwardRequest(upstreamUrl, req.method || 'POST', tokens.accessToken, upstreamBody, req.headers, clientVersion);
        if (!isProxySessionKeyCurrent(requestSessionKey, sessionKeyGetter)) {
            cancelUpstreamResult(result);
            writeAuthSessionChanged(res);
            return;
        }
        if (shouldRefreshLobsterAIToken(result.status) && tokenRefresher) {
            const latestAccessToken = tokenGetter?.()?.accessToken;
            if (latestAccessToken && latestAccessToken !== tokens.accessToken) {
                result = await forwardRequest(upstreamUrl, req.method || 'POST', latestAccessToken, upstreamBody, req.headers, clientVersion);
                if (!isProxySessionKeyCurrent(requestSessionKey, sessionKeyGetter)) {
                    cancelUpstreamResult(result);
                    writeAuthSessionChanged(res);
                    return;
                }
                if (result.status !== 401) {
                    pipeResponse(result, res, inspectionContext);
                    return;
                }
            }
            console.log('[EngineTokenProxy] received 401, attempting token refresh');
            const refreshResult = await tokenRefresher(constants_1.AuthRefreshReason.OpenClawProxy);
            if (!isProxySessionKeyCurrent(requestSessionKey, sessionKeyGetter)) {
                writeAuthSessionChanged(res);
                return;
            }
            if (refreshResult.accessToken) {
                const retryResult = await forwardRequest(upstreamUrl, req.method || 'POST', refreshResult.accessToken, upstreamBody, req.headers, clientVersion);
                if (!isProxySessionKeyCurrent(requestSessionKey, sessionKeyGetter)) {
                    cancelUpstreamResult(retryResult);
                    writeAuthSessionChanged(res);
                    return;
                }
                pipeResponse(retryResult, res, inspectionContext);
                return;
            }
            if (isTemporaryAuthRefreshFailure(refreshResult)) {
                writeTemporaryAuthRefreshFailure(res);
                return;
            }
        }
        pipeResponse(result, res, inspectionContext);
    }
    catch (err) {
        console.error('[EngineTokenProxy] request handling error:', err);
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Token proxy upstream error' }));
        }
    }
}
function cancelUpstreamResult(result) {
    if (Buffer.isBuffer(result.body))
        return;
    const body = result.body;
    try {
        if (typeof body.destroy === 'function' && !body.destroyed) {
            body.destroy();
            return;
        }
        if (typeof body.cancel === 'function') {
            void body.cancel('Authenticated account changed').catch(error => {
                console.debug('[EngineTokenProxy] stale upstream cancellation failed:', error);
            });
        }
    }
    catch (error) {
        console.debug('[EngineTokenProxy] stale upstream cancellation failed:', error);
    }
}
function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function toArray(value) {
    return Array.isArray(value) ? value : [];
}
function toOptionalRecord(value) {
    return isRecord(value) ? value : null;
}
function isGeminiModel(model) {
    return typeof model === 'string' && model.toLowerCase().includes('gemini');
}
function shouldHydrateGeminiChatCompletionsBody(url) {
    const path = url?.split('?')[0] ?? '';
    return path.endsWith('/chat/completions');
}
function toNonEmptyString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function getGoogleThoughtSignatureFromExtraContent(extraContent) {
    const extraContentObj = toOptionalRecord(extraContent);
    const googleObj = toOptionalRecord(extraContentObj?.google);
    return toNonEmptyString(googleObj?.thought_signature);
}
function getGeminiThoughtSignature(toolCallObj) {
    const functionObj = toOptionalRecord(toolCallObj.function);
    return getGoogleThoughtSignatureFromExtraContent(toolCallObj.extra_content)
        ?? getGoogleThoughtSignatureFromExtraContent(functionObj?.extra_content)
        ?? toNonEmptyString(functionObj?.thought_signature);
}
function withGoogleThoughtSignature(extraContent, signature) {
    const extraContentObj = toOptionalRecord(extraContent);
    const nextExtraContent = extraContentObj ? { ...extraContentObj } : {};
    const googleObj = toOptionalRecord(nextExtraContent.google);
    nextExtraContent.google = {
        ...(googleObj ?? {}),
        thought_signature: signature,
    };
    return nextExtraContent;
}
function ensureGeminiToolCallThoughtSignature(toolCallObj) {
    const functionObj = toOptionalRecord(toolCallObj.function);
    const signature = getGeminiThoughtSignature(toolCallObj)
        ?? GEMINI_FALLBACK_THOUGHT_SIGNATURE;
    let changed = false;
    if (getGoogleThoughtSignatureFromExtraContent(toolCallObj.extra_content) !== signature) {
        toolCallObj.extra_content = withGoogleThoughtSignature(toolCallObj.extra_content, signature);
        changed = true;
    }
    if (functionObj) {
        if (getGoogleThoughtSignatureFromExtraContent(functionObj.extra_content) !== signature) {
            functionObj.extra_content = withGoogleThoughtSignature(functionObj.extra_content, signature);
            changed = true;
        }
        if (functionObj.thought_signature !== signature) {
            functionObj.thought_signature = signature;
            changed = true;
        }
    }
    return changed;
}
function hydrateGeminiToolCallThoughtSignatures(body) {
    const bodyObj = toOptionalRecord(body);
    if (!bodyObj || !isGeminiModel(bodyObj.model)) {
        return false;
    }
    let changed = false;
    for (const message of toArray(bodyObj.messages)) {
        const messageObj = toOptionalRecord(message);
        if (!messageObj) {
            continue;
        }
        for (const toolCall of toArray(messageObj.tool_calls)) {
            const toolCallObj = toOptionalRecord(toolCall);
            if (!toolCallObj) {
                continue;
            }
            changed = ensureGeminiToolCallThoughtSignature(toolCallObj) || changed;
        }
    }
    return changed;
}
function hydrateGeminiChatCompletionsBody(body) {
    if (body.length === 0) {
        return body;
    }
    try {
        const parsed = JSON.parse(body.toString('utf8'));
        if (!hydrateGeminiToolCallThoughtSignatures(parsed)) {
            return body;
        }
        return Buffer.from(JSON.stringify(parsed));
    }
    catch {
        return body;
    }
}
function getErrorMessage(value) {
    const nestedError = value.error;
    if (isRecord(nestedError) && typeof nestedError.message === 'string') {
        return nestedError.message;
    }
    if (typeof value.message === 'string') {
        return value.message;
    }
    return '';
}
function getErrorCode(value) {
    const nestedError = value.error;
    if (isRecord(nestedError)
        && (typeof nestedError.code === 'string' || typeof nestedError.code === 'number')) {
        return nestedError.code;
    }
    if (typeof value.code === 'string' || typeof value.code === 'number') {
        return value.code;
    }
    return undefined;
}
function parseProxySSEPacket(packet) {
    const lines = packet.split(/\r?\n/);
    const dataLines = [];
    let event = '';
    for (const line of lines) {
        if (line.startsWith('event:')) {
            event = line.slice(6).trimStart();
            continue;
        }
        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    }
    return {
        event,
        payload: dataLines.join('\n'),
    };
}
const ProxySSETerminalKind = {
    Done: 'done',
    FinishReason: 'finish_reason',
    MessageStop: 'message_stop',
    Error: 'error',
};
const PROXY_SSE_TERMINAL_KIND_PRIORITY = {
    [ProxySSETerminalKind.FinishReason]: 1,
    [ProxySSETerminalKind.MessageStop]: 2,
    [ProxySSETerminalKind.Done]: 3,
    [ProxySSETerminalKind.Error]: 4,
};
function createProxySSEStreamScanState(now = Date.now(), inspectionContext) {
    return {
        sawTerminalPacket: false,
        terminalKind: null,
        eventCount: 0,
        startedAt: now,
        downstreamClosedAt: null,
        downstreamCancellationRequested: false,
        upstreamSettled: false,
        inspectionContext,
        membershipRevocationNotified: false,
    };
}
function classifyTerminalProxySSEPacket(packet) {
    const { event, payload } = packet;
    if (!payload) {
        return null;
    }
    if (event === 'error') {
        return ProxySSETerminalKind.Error;
    }
    if (payload === '[DONE]') {
        return ProxySSETerminalKind.Done;
    }
    // Explicit upstream error payloads must pass through untouched so the client
    // receives the error details instead of a connection reset.
    if (event === 'message_stop') {
        return ProxySSETerminalKind.MessageStop;
    }
    try {
        const parsed = JSON.parse(payload);
        if (!isRecord(parsed)) {
            return null;
        }
        if (parsed.type === 'error' || parsed.error != null) {
            return ProxySSETerminalKind.Error;
        }
        if (parsed.type === 'message_stop') {
            return ProxySSETerminalKind.MessageStop;
        }
        for (const choice of toArray(parsed.choices)) {
            if (isRecord(choice) && choice.finish_reason != null && choice.finish_reason !== '') {
                return ProxySSETerminalKind.FinishReason;
            }
        }
    }
    catch {
        return null;
    }
    return null;
}
function isTerminalProxySSEPacket(packet) {
    return classifyTerminalProxySSEPacket(packet) !== null;
}
function recordProxySSETerminalKind(scanState, terminalKind) {
    scanState.sawTerminalPacket = true;
    if (scanState.terminalKind === null
        || PROXY_SSE_TERMINAL_KIND_PRIORITY[terminalKind]
            > PROXY_SSE_TERMINAL_KIND_PRIORITY[scanState.terminalKind]) {
        scanState.terminalKind = terminalKind;
    }
}
function findSSEPacketBoundary(buffer) {
    const match = /\r?\n\r?\n/.exec(buffer);
    if (!match || typeof match.index !== 'number') {
        return null;
    }
    return {
        index: match.index,
        separatorLength: match[0].length,
    };
}
function extractStructuredProxyError(payload, event = '') {
    if (!payload || payload === '[DONE]') {
        return null;
    }
    try {
        const parsed = JSON.parse(payload);
        if (!isRecord(parsed)) {
            return null;
        }
        const message = getErrorMessage(parsed);
        const code = getErrorCode(parsed);
        const isErrorPayload = event === 'error'
            || parsed.type === 'error'
            || parsed.error != null
            || (!event && code !== undefined && String(code) !== '0');
        if (!isErrorPayload) {
            return null;
        }
        return {
            message: message || payload,
            ...(code !== undefined ? { code } : {}),
        };
    }
    catch {
        return null;
    }
}
function extractQuotaErrorFromProxyErrorPayload(payload, event = '') {
    const proxyError = extractStructuredProxyError(payload, event);
    if (proxyError) {
        const searchable = `${proxyError.message} ${proxyError.code ?? ''} ${payload}`;
        return (0, coworkErrorClassify_1.isLobsterAIQuotaExhaustedError)(searchable) ? proxyError : null;
    }
    return event === 'error' && (0, coworkErrorClassify_1.isLobsterAIQuotaExhaustedError)(payload)
        ? { message: payload }
        : null;
}
function isEnterpriseMembershipRevocationError(error) {
    if (!error || error.code === undefined) {
        return false;
    }
    if (typeof error.code === 'number') {
        return error.code === constants_2.EnterpriseApiErrorCode.NotMember;
    }
    if (/^\d+$/.test(error.code.trim())) {
        return Number(error.code.trim()) === constants_2.EnterpriseApiErrorCode.NotMember;
    }
    return false;
}
function notifyEnterpriseMembershipRevoked(error, scanState) {
    if (!isEnterpriseMembershipRevocationError(error)
        || !scanState?.inspectionContext
        || scanState.membershipRevocationNotified) {
        return;
    }
    scanState.membershipRevocationNotified = true;
    try {
        scanState.inspectionContext.onEnterpriseMembershipRevoked({
            code: constants_2.EnterpriseApiErrorCode.NotMember,
            requestSession: scanState.inspectionContext.requestEnterpriseSession,
        });
    }
    catch (error) {
        console.warn('[EngineTokenProxy] failed to invalidate revoked enterprise session:', error);
    }
}
function extractQuotaErrorFromProxySSEPacket(packet) {
    const parsed = parseProxySSEPacket(packet);
    return extractQuotaErrorFromProxyErrorPayload(parsed.payload, parsed.event);
}
function rememberQuotaError(error, now = Date.now()) {
    recentQuotaError = {
        ...error,
        capturedAt: now,
    };
}
function inspectProxySSEPacket(packet, now, scanState) {
    const parsed = parseProxySSEPacket(packet);
    const proxyError = extractStructuredProxyError(parsed.payload, parsed.event);
    const quotaError = extractQuotaErrorFromProxyErrorPayload(parsed.payload, parsed.event);
    if (quotaError) {
        rememberQuotaError(quotaError, now);
    }
    notifyEnterpriseMembershipRevoked(proxyError, scanState);
    if (!scanState) {
        return;
    }
    if (parsed.event || parsed.payload) {
        scanState.eventCount += 1;
    }
    const terminalKind = classifyTerminalProxySSEPacket(parsed);
    if (terminalKind) {
        recordProxySSETerminalKind(scanState, terminalKind);
    }
}
function scanProxySSEBufferForQuotaError(buffer, now = Date.now(), scanState) {
    let remaining = buffer;
    let boundary = findSSEPacketBoundary(remaining);
    while (boundary) {
        const packet = remaining.slice(0, boundary.index);
        remaining = remaining.slice(boundary.index + boundary.separatorLength);
        inspectProxySSEPacket(packet, now, scanState);
        boundary = findSSEPacketBoundary(remaining);
    }
    return remaining.length <= MAX_PROXY_SSE_SCAN_BUFFER_CHARS
        ? remaining
        : remaining.slice(-MAX_PROXY_SSE_SCAN_BUFFER_CHARS);
}
function flushProxySSEBufferForQuotaError(buffer, now = Date.now(), scanState) {
    const remaining = scanProxySSEBufferForQuotaError(buffer, now, scanState);
    if (!remaining.trim()) {
        return;
    }
    inspectProxySSEPacket(remaining, now, scanState);
}
function scanProxyBodyForQuotaError(body, now = Date.now(), inspectionContext) {
    const text = body.toString('utf8');
    const proxyError = extractStructuredProxyError(text);
    const quotaError = extractQuotaErrorFromProxyErrorPayload(text);
    if (quotaError) {
        rememberQuotaError(quotaError, now);
    }
    if (isEnterpriseMembershipRevocationError(proxyError) && inspectionContext) {
        try {
            inspectionContext.onEnterpriseMembershipRevoked({
                code: constants_2.EnterpriseApiErrorCode.NotMember,
                requestSession: inspectionContext.requestEnterpriseSession,
            });
        }
        catch (error) {
            console.warn('[EngineTokenProxy] failed to invalidate revoked enterprise session:', error);
        }
    }
}
async function forwardRequest(url, method, accessToken, body, incomingHeaders, clientVersion) {
    let accountContextHeaders = {};
    try {
        accountContextHeaders = accountContextHeadersGetter?.() ?? {};
    }
    catch (error) {
        console.warn('[EngineTokenProxy] failed to read account context headers; forwarding with token only:', error);
    }
    const headers = buildUpstreamRequestHeaders(accessToken, incomingHeaders, clientVersion, accountContextHeaders);
    const resp = await electron_1.net.fetch(url, {
        method,
        headers,
        body: body.length > 0 ? new Uint8Array(body) : undefined,
    });
    const contentType = resp.headers.get('content-type') || '';
    const isStream = contentType.includes('text/event-stream');
    const responseHeaders = copyResponseHeaders(resp.headers);
    if (isStream && resp.body) {
        return {
            status: resp.status,
            headers: responseHeaders,
            body: resp.body,
            isStream: true,
        };
    }
    const respBuffer = Buffer.from(await resp.arrayBuffer());
    return {
        status: resp.status,
        headers: responseHeaders,
        body: respBuffer,
        isStream: false,
    };
}
/**
 * Headers that must not be copied from the upstream response onto ours.
 *
 * **This is what made every connector fail with "terminated".** Electron's
 * `net.fetch` decodes the body for us: a gzipped answer arrives here as
 * plain bytes, while `resp.headers` still says `content-encoding: gzip`
 * and carries the *compressed* `content-length`. Copying both onto a
 * decoded body hands the app a length that does not match and an encoding
 * that is no longer there, and Node's fetch gives up mid-body with
 * `TypeError: terminated`.
 *
 * It never showed on the model routes because those answer
 * `text/event-stream`, which nothing compresses. Composio answers JSON,
 * which the edge compresses, so Apps was the first thing to hit it: the
 * key was set, the request reached Composio, and the reply was destroyed
 * on the last hop home (18 September).
 *
 * The rest are hop-by-hop headers (RFC 9110 §7.6.1), which belong to one
 * connection and are never forwarded.
 */
const DROPPED_RESPONSE_HEADERS = new Set([
    'content-encoding',
    'content-length',
    'transfer-encoding',
    'connection',
    'keep-alive',
    'upgrade',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
]);
function copyResponseHeaders(headers) {
    const copied = {};
    headers.forEach((value, key) => {
        if (DROPPED_RESPONSE_HEADERS.has(key.toLowerCase()))
            return;
        copied[key] = value;
    });
    return copied;
}
function buildUpstreamRequestHeaders(accessToken, incomingHeaders, clientVersion, accountContextHeaders = {}) {
    const headers = {
        ...accountContextHeaders,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': incomingHeaders['content-type'] || 'application/json',
        [modelRuntimeProfiles_1.LOBSTERAI_CLIENT_CAPABILITIES_HEADER]: modelRuntimeProfiles_1.LOBSTERAI_CLIENT_CAPABILITIES,
        [modelRuntimeProfiles_1.LOBSTERAI_CLIENT_VERSION_HEADER]: clientVersion,
    };
    // Forward accept header for SSE streaming
    if (incomingHeaders.accept) {
        headers['Accept'] = incomingHeaders.accept;
    }
    return headers;
}
function pipeResponse(result, res, inspectionContext) {
    res.writeHead(result.status, result.headers);
    if (result.isStream) {
        pipeStreamingResponseWithQuotaScan(result.body, res, inspectionContext);
    }
    else if (Buffer.isBuffer(result.body)) {
        scanProxyBodyForQuotaError(result.body, Date.now(), inspectionContext);
        res.end(result.body);
    }
    else {
        pipeWebReadableResponseWithQuotaScan(result.body, res);
    }
}
function isNodeReadableStream(body) {
    return Boolean(body
        && typeof body === 'object'
        && typeof body.on === 'function');
}
function pipeStreamingResponseWithQuotaScan(body, res, inspectionContext) {
    if (Buffer.isBuffer(body)) {
        scanProxyBodyForQuotaError(body, Date.now(), inspectionContext);
        res.end(body);
        return;
    }
    // SSE responses must end with a terminal packet ([DONE], finish_reason, or an
    // error payload). Anything else is a truncated stream and must not be
    // presented to the client as a cleanly completed response.
    const scanState = createProxySSEStreamScanState(Date.now(), inspectionContext);
    if (isNodeReadableStream(body)) {
        pipeNodeReadableResponseWithQuotaScan(body, res, scanState);
        return;
    }
    pipeWebReadableResponseWithQuotaScan(body, res, scanState);
}
// Destroying the response mid-stream aborts the chunked encoding, so the
// client observes a network error instead of a clean end and can retry or
// surface the failure. res.destroy() must stay argument-less: passing an error
// would re-emit it on the response with no listener attached.
function abortProxyResponse(res) {
    if (res.destroyed) {
        return;
    }
    res.destroy();
}
function formatProxySSEOutcome(outcome, scanState, now = Date.now()) {
    const durationMs = Math.max(0, now - scanState.startedAt);
    const downstreamClosedAfterMs = scanState.downstreamClosedAt === null
        ? 'none'
        : Math.max(0, scanState.downstreamClosedAt - scanState.startedAt);
    return `[EngineTokenProxy] upstream SSE outcome=${outcome}`
        + ` terminal=${scanState.terminalKind ?? 'none'}`
        + ` events=${scanState.eventCount}`
        + ` durationMs=${durationMs}`
        + ` downstreamClosedAfterMs=${downstreamClosedAfterMs}`;
}
function observeProxyResponseClose(res, cancelUpstream, scanState) {
    res.on('close', () => {
        if (scanState
            && (scanState.upstreamSettled || scanState.downstreamClosedAt !== null)) {
            return;
        }
        if (scanState) {
            scanState.downstreamClosedAt = Date.now();
        }
        const cancellationRequested = cancelUpstream();
        if (scanState && cancellationRequested) {
            scanState.downstreamCancellationRequested = true;
            console.debug(formatProxySSEOutcome('downstream_closed_upstream_cancelled', scanState));
        }
    });
}
function writeProxyResponseChunk(res, chunk) {
    if (!res.destroyed && !res.writableEnded) {
        res.write(chunk);
    }
}
function endProxyResponseAfterScan(res, scanState) {
    if (scanState) {
        scanState.upstreamSettled = true;
    }
    if (scanState?.downstreamCancellationRequested) {
        return;
    }
    if (scanState && scanState.downstreamClosedAt !== null) {
        if (scanState.terminalKind === ProxySSETerminalKind.Error) {
            console.error(formatProxySSEOutcome('late_error_after_downstream_close', scanState));
        }
        else if (scanState.sawTerminalPacket) {
            console.warn(formatProxySSEOutcome('late_completion_after_downstream_close', scanState));
        }
        else {
            console.error(formatProxySSEOutcome('incomplete_end_after_downstream_close', scanState));
        }
        return;
    }
    if (scanState && !scanState.sawTerminalPacket) {
        console.error(formatProxySSEOutcome('unexpected_eof', scanState));
        abortProxyResponse(res);
        return;
    }
    if (!res.destroyed && !res.writableEnded) {
        res.end();
    }
}
function abortProxyResponseAfterReadError(res, error, scanState) {
    if (scanState) {
        scanState.upstreamSettled = true;
        if (scanState.downstreamCancellationRequested) {
            return;
        }
        const outcome = scanState.downstreamClosedAt === null
            ? 'transport_error'
            : 'transport_error_after_downstream_close';
        console.error(formatProxySSEOutcome(outcome, scanState), error);
    }
    else {
        console.error('[EngineTokenProxy] upstream stream read error', error);
    }
    abortProxyResponse(res);
}
function pipeNodeReadableResponseWithQuotaScan(stream, res, scanState) {
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let upstreamSettled = false;
    observeProxyResponseClose(res, () => {
        if (upstreamSettled) {
            return false;
        }
        const destroyableStream = stream;
        if (typeof destroyableStream.destroy !== 'function' || destroyableStream.destroyed) {
            return false;
        }
        try {
            destroyableStream.destroy();
            return true;
        }
        catch (error) {
            console.debug('[EngineTokenProxy] upstream stream cancellation failed:', error);
            return false;
        }
    }, scanState);
    res.on('error', (err) => {
        console.debug('[EngineTokenProxy] response write error:', err);
    });
    stream.on('data', (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sseBuffer = scanProxySSEBufferForQuotaError(sseBuffer + decoder.decode(buffer, { stream: true }), Date.now(), scanState);
        writeProxyResponseChunk(res, buffer);
    });
    stream.on('end', () => {
        upstreamSettled = true;
        const tail = decoder.decode();
        flushProxySSEBufferForQuotaError(sseBuffer + tail, Date.now(), scanState);
        endProxyResponseAfterScan(res, scanState);
    });
    stream.on('error', (err) => {
        upstreamSettled = true;
        flushProxySSEBufferForQuotaError(sseBuffer + decoder.decode(), Date.now(), scanState);
        abortProxyResponseAfterReadError(res, err, scanState);
    });
}
function pipeWebReadableResponseWithQuotaScan(webStream, res, scanState) {
    const reader = webStream.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let upstreamSettled = false;
    observeProxyResponseClose(res, () => {
        if (upstreamSettled) {
            return false;
        }
        void reader.cancel('Downstream response closed').catch((error) => {
            console.debug('[EngineTokenProxy] upstream stream cancellation failed:', error);
        });
        return true;
    }, scanState);
    res.on('error', (err) => {
        console.debug('[EngineTokenProxy] response write error:', err);
    });
    const pump = () => {
        reader.read().then(({ done, value }) => {
            if (done) {
                upstreamSettled = true;
                const tail = decoder.decode();
                flushProxySSEBufferForQuotaError(sseBuffer + tail, Date.now(), scanState);
                endProxyResponseAfterScan(res, scanState);
                return;
            }
            sseBuffer = scanProxySSEBufferForQuotaError(sseBuffer + decoder.decode(value, { stream: true }), Date.now(), scanState);
            writeProxyResponseChunk(res, value);
            pump();
        }).catch((err) => {
            upstreamSettled = true;
            flushProxySSEBufferForQuotaError(sseBuffer + decoder.decode(), Date.now(), scanState);
            abortProxyResponseAfterReadError(res, err, scanState);
        });
    };
    pump();
}
exports.__openClawTokenProxyTestUtils = {
    extractStructuredProxyError,
    extractQuotaErrorFromProxyErrorPayload,
    extractQuotaErrorFromProxySSEPacket,
    hydrateGeminiChatCompletionsBody,
    hydrateGeminiToolCallThoughtSignatures,
    buildUpstreamRequestHeaders,
    scanProxySSEBufferForQuotaError,
    flushProxySSEBufferForQuotaError,
    rememberQuotaError,
    isEnterpriseMembershipRevocationError,
    ProxySSETerminalKind,
    classifyTerminalProxySSEPacket,
    createProxySSEStreamScanState,
    isTerminalProxySSEPacket,
    parseProxySSEPacket,
    pipeNodeReadableResponseWithQuotaScan,
    pipeWebReadableResponseWithQuotaScan,
    pipeStreamingResponseWithQuotaScan,
    isTemporaryAuthRefreshFailure,
    isProxySessionKeyCurrent,
    shouldRefreshLobsterAIToken,
};
//# sourceMappingURL=openclawTokenProxy.js.map
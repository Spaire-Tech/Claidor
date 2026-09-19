"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SENSITIVE_LOG_KEY_PATTERN = void 0;
exports.truncateForLog = truncateForLog;
exports.serializeForLog = serializeForLog;
exports.isAnalyticsEndpointUrl = isAnalyticsEndpointUrl;
exports.sanitizeUrlForLog = sanitizeUrlForLog;
exports.looksLikeTransportErrorText = looksLikeTransportErrorText;
const constants_1 = require("../../shared/analytics/constants");
const LOG_PREVIEW_MAX_CHARS = 400;
const MAX_LOG_ARRAY_ITEMS = 10;
const MAX_LOG_OBJECT_KEYS = 20;
const REDACTED_VALUE = '[redacted]';
const CIRCULAR_VALUE = '[circular]';
const TRUNCATED_ITEMS_KEY = '__truncatedItems';
const TRUNCATED_KEYS_KEY = '__truncatedKeys';
exports.SENSITIVE_LOG_KEY_PATTERN = /(api[-_]?key|token|secret|password|authorization|cookie|session|refresh[-_]?token|access[-_]?token)/i;
const TRANSPORT_ERROR_TEXT_PATTERNS = [
    /fetch failed/i,
    /\bECONN(?:ABORTED|REFUSED|RESET)\b/i,
    /\bENOTFOUND\b/i,
    /\bEAI_AGAIN\b/i,
    /\bETIMEDOUT\b/i,
    /network error/i,
    /socket hang up/i,
    /connection refused/i,
    /connection reset/i,
    /timed out/i,
    /certificate/i,
    /tls/i,
];
function sanitizeForLogInternal(value, seen, keyName) {
    if (typeof value === 'string') {
        return exports.SENSITIVE_LOG_KEY_PATTERN.test(keyName || '')
            ? REDACTED_VALUE
            : truncateForLog(value);
    }
    if (value === null
        || value === undefined
        || typeof value === 'number'
        || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (Array.isArray(value)) {
        const next = value
            .slice(0, MAX_LOG_ARRAY_ITEMS)
            .map((item) => sanitizeForLogInternal(item, seen));
        if (value.length > MAX_LOG_ARRAY_ITEMS) {
            next.push(`${TRUNCATED_ITEMS_KEY}:${value.length - MAX_LOG_ARRAY_ITEMS}`);
        }
        return next;
    }
    if (typeof value === 'object') {
        if (seen.has(value)) {
            return CIRCULAR_VALUE;
        }
        seen.add(value);
        const entries = Object.entries(value);
        const next = {};
        for (const [entryKey, entryValue] of entries.slice(0, MAX_LOG_OBJECT_KEYS)) {
            next[entryKey] = sanitizeForLogInternal(entryValue, seen, entryKey);
        }
        if (entries.length > MAX_LOG_OBJECT_KEYS) {
            next[TRUNCATED_KEYS_KEY] = entries.length - MAX_LOG_OBJECT_KEYS;
        }
        return next;
    }
    return String(value);
}
function truncateForLog(value, maxChars = LOG_PREVIEW_MAX_CHARS) {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;
}
function serializeForLog(value, maxChars = LOG_PREVIEW_MAX_CHARS) {
    try {
        const sanitized = sanitizeForLogInternal(value, new WeakSet());
        return truncateForLog(JSON.stringify(sanitized), maxChars);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return truncateForLog(`"[log-serialization-failed:${message}]"`, maxChars);
    }
}
// Usage-analytics beacons are fire-and-forget and arrive dozens to hundreds of
// times a day; the reporter already writes its own one-line trace per event,
// so the generic request/response logging would only duplicate it.
const ANALYTICS_ENDPOINT = new URL(constants_1.LogReporterEndpoint.YoudaoAnalyzer);
function isAnalyticsEndpointUrl(value) {
    try {
        const url = new URL(value);
        return url.origin === ANALYTICS_ENDPOINT.origin && url.pathname === ANALYTICS_ENDPOINT.pathname;
    }
    catch {
        return false;
    }
}
function sanitizeUrlForLog(value) {
    try {
        const url = new URL(value);
        const hasQuery = Boolean(url.search);
        const hasHash = Boolean(url.hash);
        url.search = '';
        url.hash = '';
        return `${url.href}${hasQuery ? '?[redacted]' : ''}${hasHash ? '#[redacted]' : ''}`;
    }
    catch {
        return '[invalid-url]';
    }
}
function looksLikeTransportErrorText(text) {
    const normalized = text.trim();
    if (!normalized) {
        return false;
    }
    return TRANSPORT_ERROR_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}
//# sourceMappingURL=sanitizeForLog.js.map
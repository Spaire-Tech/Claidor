"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_NO_PROXY_ENTRIES = void 0;
exports.mergeNoProxyValue = mergeNoProxyValue;
/**
 * Loopback destinations that must always bypass an injected system proxy.
 * Gateway child processes health-check local skill bridge servers over HTTP
 * (e.g. web-search on 127.0.0.1:8923); routing those requests through the
 * system proxy makes the checks fail intermittently and triggers duplicate
 * server startups (EADDRINUSE) and self-repair loops.
 */
exports.LOCAL_NO_PROXY_ENTRIES = ['localhost', '127.0.0.1', '::1'];
/**
 * Merge existing no_proxy/NO_PROXY values with the required loopback entries.
 * Existing entries keep their order and casing; loopback entries are appended
 * once, deduplicated case-insensitively.
 */
function mergeNoProxyValue(...existingValues) {
    const entries = [];
    const seen = new Set();
    const push = (raw) => {
        const entry = raw.trim();
        if (!entry) {
            return;
        }
        const key = entry.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        entries.push(entry);
    };
    for (const value of existingValues) {
        for (const item of (value ?? '').split(',')) {
            push(item);
        }
    }
    for (const entry of exports.LOCAL_NO_PROXY_ENTRIES) {
        push(entry);
    }
    return entries.join(',');
}
//# sourceMappingURL=noProxyEnv.js.map
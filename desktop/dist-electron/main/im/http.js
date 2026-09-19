"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithSystemProxy = fetchWithSystemProxy;
exports.fetchJsonWithTimeout = fetchJsonWithTimeout;
const electron_1 = require("electron");
function linkAbortSignal(source, controller) {
    if (source.aborted) {
        controller.abort();
        return;
    }
    source.addEventListener('abort', () => controller.abort(), { once: true });
}
async function fetchWithSystemProxy(url, options = {}) {
    if (electron_1.app.isReady()) {
        try {
            return await electron_1.session.defaultSession.fetch(url, options);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[IM HTTP] session fetch failed, fallback to global fetch: ${message}`);
        }
    }
    return fetch(url, options);
}
async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10_000) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    if (options.signal) {
        linkAbortSignal(options.signal, timeoutController);
    }
    try {
        const response = await fetchWithSystemProxy(url, {
            ...options,
            signal: timeoutController.signal,
        });
        const rawText = await response.text();
        let data = null;
        if (rawText) {
            try {
                data = JSON.parse(rawText);
            }
            catch {
                throw new Error(`Expected JSON response but got: ${rawText.slice(0, 120)}`);
            }
        }
        if (!response.ok) {
            const payload = data;
            const detail = payload?.description || payload?.message || rawText || response.statusText || 'request failed';
            throw new Error(`HTTP ${response.status}: ${detail}`);
        }
        return data;
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
//# sourceMappingURL=http.js.map
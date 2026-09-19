"use strict";
/**
 * Copilot Token Manager — manages automatic refresh of GitHub Copilot API tokens.
 *
 * GitHub Copilot API tokens are short-lived (~30 min). This service:
 * 1. Tracks the current token's expiry time
 * 2. Schedules proactive refresh before expiry (5 min margin)
 * 3. Handles on-demand refresh when auth errors are detected
 * 4. Pushes updated tokens to all renderer windows via IPC
 *
 * Modeled after OpenClaw's RuntimeAuthState + scheduleRuntimeAuthRefresh mechanism.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCopilotTokenManager = initCopilotTokenManager;
exports.setCopilotTokenState = setCopilotTokenState;
exports.clearCopilotTokenState = clearCopilotTokenState;
exports.getCurrentCopilotToken = getCurrentCopilotToken;
exports.isCopilotTokenExpired = isCopilotTokenExpired;
exports.refreshCopilotTokenNow = refreshCopilotTokenNow;
exports.isCopilotAuthError = isCopilotAuthError;
exports.onCopilotTokenRefreshed = onCopilotTokenRefreshed;
const electron_1 = require("electron");
const githubCopilotAuth_1 = require("./githubCopilotAuth");
/** Refresh 5 minutes before expiry (same as OpenClaw's RUNTIME_AUTH_REFRESH_MARGIN_MS). */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Minimum delay between refresh attempts to avoid tight loops. */
const MIN_REFRESH_DELAY_MS = 10 * 1000;
/** Retry delay after a failed refresh attempt. */
const RETRY_DELAY_MS = 60 * 1000;
let tokenState = null;
let refreshTimer;
let refreshInFlight;
let getStoreFn = null;
let onTokenRefreshCallbacks = [];
/**
 * Initialize the token manager with a store accessor.
 * Must be called once during app startup.
 */
function initCopilotTokenManager(getStore) {
    getStoreFn = getStore;
}
/**
 * Set the token state after a successful login or manual refresh.
 * Starts the automatic refresh schedule.
 */
function setCopilotTokenState(params) {
    tokenState = {
        copilotToken: params.copilotToken,
        baseUrl: params.baseUrl,
        expiresAt: params.expiresAt,
        githubToken: params.githubToken,
    };
    scheduleRefresh();
}
/**
 * Clear token state and stop refresh timer (e.g. on sign-out).
 */
function clearCopilotTokenState() {
    tokenState = null;
    clearRefreshTimer();
}
/**
 * Get the current Copilot token if available and not expired.
 * Returns null if no token or if expired.
 */
function getCurrentCopilotToken() {
    if (!tokenState) {
        return null;
    }
    // Still return it even if "close" to expiry — the scheduled refresh handles proactive renewal.
    return tokenState;
}
/**
 * Check if the current token is expired or close to expiry.
 */
function isCopilotTokenExpired() {
    if (!tokenState) {
        return true;
    }
    return tokenState.expiresAt - Date.now() < MIN_REFRESH_DELAY_MS;
}
/**
 * Attempt to refresh the Copilot token on demand (e.g. after an auth error).
 * Returns the new token state, or throws if refresh fails.
 * Deduplicates concurrent refresh requests.
 */
async function refreshCopilotTokenNow() {
    if (!tokenState?.githubToken) {
        // Try to recover from store
        const stored = getStoreFn?.()?.get('github_copilot_github_token');
        if (!stored) {
            throw new Error('No GitHub token available for Copilot token refresh');
        }
        if (!tokenState) {
            // Bootstrap minimal state
            tokenState = {
                copilotToken: '',
                baseUrl: '',
                expiresAt: 0,
                githubToken: stored,
            };
        }
        else {
            tokenState.githubToken = stored;
        }
    }
    if (refreshInFlight) {
        await refreshInFlight;
        if (!tokenState) {
            throw new Error('Token refresh completed but state was cleared');
        }
        return tokenState;
    }
    refreshInFlight = (async () => {
        const githubToken = tokenState.githubToken;
        console.log('[CopilotTokenManager] refreshing Copilot API token...');
        try {
            const { token, expiresAt, baseUrl } = await (0, githubCopilotAuth_1.getCopilotToken)(githubToken);
            tokenState = {
                copilotToken: token,
                baseUrl,
                expiresAt,
                githubToken,
            };
            console.log(`[CopilotTokenManager] token refreshed, expires in ${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}s`);
            // Push updated token to all renderer windows
            broadcastTokenUpdate(token, baseUrl);
            // Notify external listeners (e.g. OpenClaw cache sync)
            for (const cb of onTokenRefreshCallbacks) {
                try {
                    cb(tokenState);
                }
                catch (cbErr) {
                    console.warn('[CopilotTokenManager] onTokenRefresh callback error:', cbErr);
                }
            }
            // Reschedule the next refresh
            scheduleRefresh();
        }
        finally {
            refreshInFlight = undefined;
        }
    })();
    await refreshInFlight;
    return tokenState;
}
/**
 * Detect if an error message indicates a Copilot auth failure that warrants token refresh.
 */
function isCopilotAuthError(errorText) {
    if (!errorText)
        return false;
    const lower = errorText.toLowerCase();
    return (lower.includes('401')
        || lower.includes('unauthorized')
        || lower.includes('token expired')
        || lower.includes('invalid token')
        || lower.includes('authentication')
        || lower.includes('auth')
        // GitHub Copilot specific
        || lower.includes('editor-version')
        || lower.includes('ide auth'));
}
/**
 * Register a callback to be invoked whenever the Copilot token is refreshed.
 * Returns an unsubscribe function.
 */
function onCopilotTokenRefreshed(callback) {
    onTokenRefreshCallbacks.push(callback);
    return () => {
        onTokenRefreshCallbacks = onTokenRefreshCallbacks.filter(cb => cb !== callback);
    };
}
// ── Internal helpers ──
function clearRefreshTimer() {
    if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
    }
}
function scheduleRefresh() {
    clearRefreshTimer();
    if (!tokenState?.expiresAt || !tokenState.githubToken) {
        return;
    }
    const now = Date.now();
    const refreshAt = tokenState.expiresAt - REFRESH_MARGIN_MS;
    const delayMs = Math.max(MIN_REFRESH_DELAY_MS, refreshAt - now);
    console.log(`[CopilotTokenManager] scheduling token refresh in ${Math.round(delayMs / 1000)}s`);
    refreshTimer = setTimeout(async () => {
        try {
            await refreshCopilotTokenNow();
        }
        catch (err) {
            console.warn('[CopilotTokenManager] scheduled refresh failed, retrying in 60s:', err);
            // Retry once after RETRY_DELAY_MS
            refreshTimer = setTimeout(async () => {
                try {
                    await refreshCopilotTokenNow();
                }
                catch (retryErr) {
                    console.error('[CopilotTokenManager] retry refresh also failed:', retryErr);
                }
            }, RETRY_DELAY_MS);
        }
    }, delayMs);
}
function broadcastTokenUpdate(newToken, newBaseUrl) {
    const windows = electron_1.BrowserWindow.getAllWindows();
    for (const win of windows) {
        if (!win.isDestroyed()) {
            win.webContents.send('github-copilot:token-updated', { token: newToken, baseUrl: newBaseUrl });
        }
    }
}
//# sourceMappingURL=copilotTokenManager.js.map
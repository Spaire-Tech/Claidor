"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthSessionManager = exports.AuthSessionRequestError = void 0;
exports.resolveAuthSessionStatusFromError = resolveAuthSessionStatusFromError;
const constants_1 = require("../../shared/auth/constants");
const constants_2 = require("../../shared/enterpriseAccount/constants");
const DEFAULT_REFRESH_TIMEOUT_MS = 15_000;
const TERMINAL_REFRESH_ERROR_CODES = new Set([
    40100,
    40101,
    constants_2.EnterpriseApiErrorCode.NotMember,
]);
function readNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function readAccessToken(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const accessToken = value.accessToken;
    return typeof accessToken === 'string' && accessToken.trim() ? accessToken : undefined;
}
function readRefreshToken(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const refreshToken = value.refreshToken;
    return typeof refreshToken === 'string' && refreshToken.trim() ? refreshToken : undefined;
}
async function readRefreshResponseBody(response) {
    try {
        const value = await response.json();
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : null;
    }
    catch {
        return null;
    }
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
class AuthSessionRequestError extends Error {
    status;
    failureKind;
    originalError;
    constructor(status, message, options = {}) {
        super(message);
        this.name = 'AuthSessionRequestError';
        this.status = status;
        this.failureKind = options.failureKind;
        this.originalError = options.originalError;
    }
}
exports.AuthSessionRequestError = AuthSessionRequestError;
function resolveAuthSessionStatusFromError(error) {
    return error instanceof AuthSessionRequestError
        ? error.status
        : constants_1.AuthSessionStatus.TemporarilyUnavailable;
}
class AuthSessionManager {
    options;
    pendingRefresh = null;
    constructor(options) {
        this.options = {
            ...options,
            timeoutMs: options.timeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS,
            now: options.now ?? Date.now,
        };
    }
    async waitForPendingRefresh() {
        await this.pendingRefresh?.promise;
    }
    refresh(reason) {
        const sessionKey = this.getSessionKey();
        if (this.pendingRefresh?.sessionKey === sessionKey) {
            this.pendingRefresh.joinedRequests += 1;
            return this.pendingRefresh.promise;
        }
        const startedAt = this.options.now();
        const pending = {
            joinedRequests: 0,
            sessionKey,
            promise: Promise.resolve({
                outcome: constants_1.AuthRefreshOutcome.NoTokens,
                reason,
                durationMs: 0,
                joinedRequests: 0,
            }),
        };
        const promise = this.performRefresh(reason, sessionKey)
            .then(result => {
            const completed = {
                ...result,
                durationMs: Math.max(0, this.options.now() - startedAt),
                joinedRequests: pending.joinedRequests,
            };
            this.emitLifecycleEvent(completed);
            return completed;
        })
            .finally(() => {
            if (this.pendingRefresh?.promise === promise) {
                this.pendingRefresh = null;
            }
        });
        pending.promise = promise;
        this.pendingRefresh = pending;
        return promise;
    }
    async fetchWithAuth(url, options) {
        const initialTokens = this.options.getTokens();
        if (!initialTokens) {
            throw new AuthSessionRequestError(constants_1.AuthSessionStatus.Unauthenticated, 'No auth tokens are available');
        }
        const sessionKey = this.getSessionKey();
        const doFetch = async (accessToken) => {
            if (this.getSessionKey() !== sessionKey) {
                throw new AuthSessionRequestError(constants_1.AuthSessionStatus.TemporarilyUnavailable, 'Auth session changed before the authenticated request was sent');
            }
            const headers = new Headers(options?.headers);
            headers.set('Authorization', `Bearer ${accessToken}`);
            try {
                const response = await this.options.fetch(url, {
                    ...options,
                    headers,
                });
                if (this.getSessionKey() !== sessionKey) {
                    throw new AuthSessionRequestError(constants_1.AuthSessionStatus.TemporarilyUnavailable, 'Auth session changed while the authenticated request was running');
                }
                return response;
            }
            catch (error) {
                if (error instanceof AuthSessionRequestError) {
                    throw error;
                }
                throw new AuthSessionRequestError(constants_1.AuthSessionStatus.TemporarilyUnavailable, 'Authenticated request failed', {
                    failureKind: constants_1.AuthRefreshFailureKind.Network,
                    originalError: error,
                });
            }
        };
        let rejectedAccessToken = initialTokens.accessToken;
        let response = await doFetch(rejectedAccessToken);
        if (response.status !== 401) {
            return response;
        }
        const latestTokens = this.options.getTokens();
        if (latestTokens?.accessToken && latestTokens.accessToken !== rejectedAccessToken) {
            rejectedAccessToken = latestTokens.accessToken;
            response = await doFetch(rejectedAccessToken);
            if (response.status !== 401) {
                return response;
            }
        }
        const refreshResult = await this.refresh(constants_1.AuthRefreshReason.Passive);
        if (refreshResult.outcome === constants_1.AuthRefreshOutcome.Success && refreshResult.accessToken) {
            return doFetch(refreshResult.accessToken);
        }
        if (refreshResult.outcome === constants_1.AuthRefreshOutcome.TerminalFailure) {
            throw new AuthSessionRequestError(constants_1.AuthSessionStatus.Expired, 'Refresh token was rejected', { failureKind: refreshResult.failureKind });
        }
        if (refreshResult.outcome === constants_1.AuthRefreshOutcome.NoTokens) {
            throw new AuthSessionRequestError(constants_1.AuthSessionStatus.Unauthenticated, 'Auth tokens were cleared before refresh');
        }
        throw new AuthSessionRequestError(constants_1.AuthSessionStatus.TemporarilyUnavailable, 'Token refresh is temporarily unavailable', { failureKind: refreshResult.failureKind });
    }
    async performRefresh(reason, sessionKey) {
        const tokens = this.options.getTokens();
        if (!tokens?.refreshToken) {
            return {
                outcome: constants_1.AuthRefreshOutcome.NoTokens,
                reason,
            };
        }
        const controller = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, this.options.timeoutMs);
        try {
            const refreshUrl = this.options.getRefreshUrl();
            this.options.log?.info(`[Auth] requesting token refresh (reason: ${reason})`);
            const response = await this.options.fetch(refreshUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: this.options.buildRefreshRequestBody(tokens.refreshToken),
                signal: controller.signal,
            });
            const body = await readRefreshResponseBody(response);
            const errorCode = readNumber(body?.code);
            const data = body?.data;
            const accessToken = readAccessToken(data);
            const currentTokens = this.options.getTokens();
            if (!currentTokens || this.getSessionKey() !== sessionKey) {
                this.options.log?.info(`[Auth] ignored token refresh response after the auth session changed (reason: ${reason})`);
                if (currentTokens) {
                    return {
                        outcome: constants_1.AuthRefreshOutcome.Success,
                        reason,
                        accessToken: currentTokens.accessToken,
                    };
                }
                return {
                    outcome: constants_1.AuthRefreshOutcome.NoTokens,
                    reason,
                };
            }
            if (currentTokens.refreshToken !== tokens.refreshToken) {
                this.options.log?.info(`[Auth] ignored token refresh response for a superseded session (reason: ${reason})`);
                return {
                    outcome: constants_1.AuthRefreshOutcome.Success,
                    reason,
                    accessToken: currentTokens.accessToken,
                };
            }
            if (response.ok && errorCode === 0 && accessToken) {
                const nextTokens = {
                    accessToken,
                    refreshToken: readRefreshToken(data) ?? tokens.refreshToken,
                };
                this.options.saveTokens(nextTokens);
                const result = {
                    outcome: constants_1.AuthRefreshOutcome.Success,
                    reason,
                    accessToken,
                    httpStatus: response.status,
                    errorCode,
                };
                this.invokeSafely(this.options.onRefreshSuccess, result);
                this.options.log?.info(`[Auth] token refresh succeeded (reason: ${reason})`);
                return result;
            }
            const isTerminalFailure = response.status === 401
                || (errorCode !== undefined && TERMINAL_REFRESH_ERROR_CODES.has(errorCode));
            const result = {
                outcome: isTerminalFailure
                    ? constants_1.AuthRefreshOutcome.TerminalFailure
                    : constants_1.AuthRefreshOutcome.TransientFailure,
                reason,
                failureKind: isTerminalFailure
                    ? constants_1.AuthRefreshFailureKind.Rejected
                    : response.ok
                        ? constants_1.AuthRefreshFailureKind.InvalidResponse
                        : constants_1.AuthRefreshFailureKind.Http,
                httpStatus: response.status,
                errorCode,
            };
            if (result.outcome === constants_1.AuthRefreshOutcome.TerminalFailure) {
                this.invokeSafely(this.options.onTerminalFailure, result);
            }
            this.options.log?.warn(`[Auth] token refresh rejected (reason: ${reason}, status: ${response.status}, code: ${errorCode ?? 'unknown'})`);
            return result;
        }
        catch (error) {
            const failureKind = timedOut || isAbortError(error)
                ? constants_1.AuthRefreshFailureKind.Timeout
                : constants_1.AuthRefreshFailureKind.Network;
            this.options.log?.warn(`[Auth] token refresh failed (reason: ${reason}, kind: ${failureKind})`, error);
            return {
                outcome: constants_1.AuthRefreshOutcome.TransientFailure,
                reason,
                failureKind,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    emitLifecycleEvent(result) {
        this.invokeSafely(this.options.onLifecycleEvent, {
            eventType: constants_1.AuthLifecycleEventType.TokenRefresh,
            outcome: result.outcome,
            reason: result.reason,
            durationMs: result.durationMs,
            failureKind: result.failureKind,
            httpStatus: result.httpStatus,
            errorCode: result.errorCode,
            joinedRequests: result.joinedRequests,
        });
    }
    getSessionKey() {
        return this.options.getSessionKey?.() ?? null;
    }
    invokeSafely(callback, value) {
        try {
            callback?.(value);
        }
        catch (error) {
            this.options.log?.warn('[Auth] lifecycle callback failed', error);
        }
    }
}
exports.AuthSessionManager = AuthSessionManager;
//# sourceMappingURL=authSessionManager.js.map
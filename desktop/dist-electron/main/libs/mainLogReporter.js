"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainLogReporter = exports.buildMainLogUrl = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../../shared/analytics/constants");
const keyfromAttribution_1 = require("./keyfromAttribution");
const logCommons = {
    _npid: constants_1.LogReporterProduct.LobsterAI,
    _ncat: constants_1.LogReporterCategory.Actions,
};
const MAIN_LOG_REPORTER_REQUEST_TIMEOUT_MS = 10_000;
const MAIN_LOG_REPORTER_MAX_CONCURRENT_REQUESTS = 20;
const getTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');
const getErrorName = (error) => {
    if (error instanceof Error && error.name.trim())
        return error.name.trim();
    return 'UnknownError';
};
const buildMainLogUrl = (params, context) => {
    const url = new URL(constants_1.LogReporterEndpoint.YoudaoAnalyzer);
    const logParams = {
        ...params,
        ...logCommons,
        app_version: context.appVersion,
        os_platform: context.platform,
        os_arch: context.arch,
        language: context.language,
        uuid: context.installationId,
        firstKeyfrom: context.firstKeyfrom,
        latestKeyfrom: context.latestKeyfrom,
        is_logged_in: context.userId.length > 0,
        log_Usid: context.userId,
        uts: context.timestamp,
    };
    Object.entries(logParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    });
    return url.href;
};
exports.buildMainLogUrl = buildMainLogUrl;
class MainLogReporter {
    options;
    activeRequestCount = 0;
    constructor(options) {
        this.options = options;
    }
    async report(params) {
        if (!this.isUsageAnalyticsEnabled()) {
            console.debug(`[MainLogReporter] skipped event ${params.action} because usage analytics is disabled`);
            return false;
        }
        if (!params.action.trim()) {
            console.warn('[MainLogReporter] skipped an event without an action');
            return false;
        }
        if (!params.action.startsWith(constants_1.LogReporterActionPrefix.LobsterAI)) {
            console.warn('[MainLogReporter] skipped an event without the LobsterAI action prefix');
            return false;
        }
        if (this.activeRequestCount >= this.getMaxConcurrentRequests()) {
            console.warn(`[MainLogReporter] skipped event ${params.action} because the request limit was reached`);
            return false;
        }
        this.activeRequestCount += 1;
        try {
            const context = this.buildContext();
            const requestTimeoutMs = this.getRequestTimeoutMs();
            const abortController = new AbortController();
            const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);
            console.debug(`[MainLogReporter] sending event ${params.action}`);
            let response;
            try {
                response = await this.options.fetch((0, exports.buildMainLogUrl)(params, context), abortController.signal);
            }
            finally {
                clearTimeout(timeout);
            }
            if (!response.ok) {
                console.warn(`[MainLogReporter] event ${params.action} failed with status ${response.status}`);
                return false;
            }
            console.debug(`[MainLogReporter] sent event ${params.action} successfully`);
            return true;
        }
        catch (error) {
            console.warn(`[MainLogReporter] event ${params.action} failed (${getErrorName(error)})`);
            return false;
        }
        finally {
            this.activeRequestCount -= 1;
        }
    }
    getMaxConcurrentRequests() {
        const configuredLimit = this.options.maxConcurrentRequests;
        return typeof configuredLimit === 'number'
            && Number.isInteger(configuredLimit)
            && configuredLimit > 0
            ? configuredLimit
            : MAIN_LOG_REPORTER_MAX_CONCURRENT_REQUESTS;
    }
    getRequestTimeoutMs() {
        const configuredTimeout = this.options.requestTimeoutMs;
        return typeof configuredTimeout === 'number'
            && Number.isFinite(configuredTimeout)
            && configuredTimeout > 0
            ? configuredTimeout
            : MAIN_LOG_REPORTER_REQUEST_TIMEOUT_MS;
    }
    isUsageAnalyticsEnabled() {
        try {
            const config = this.options.store.get(constants_1.LogReporterStoreKey.AppConfig);
            return config?.usageAnalyticsEnabled !== false;
        }
        catch (error) {
            console.warn(`[MainLogReporter] failed to read usage analytics setting; skipped event (${getErrorName(error)})`);
            return false;
        }
    }
    buildContext() {
        const config = this.options.store.get(constants_1.LogReporterStoreKey.AppConfig);
        const authUser = this.options.store.get(constants_1.LogReporterStoreKey.AuthUser);
        const userId = getTrimmedString(authUser?.yid) || getTrimmedString(authUser?.userId);
        const { firstKeyfrom, latestKeyfrom } = (0, keyfromAttribution_1.getKeyfromAttribution)(this.options.store);
        return {
            appVersion: this.options.appVersion,
            arch: this.options.arch ?? process.arch,
            firstKeyfrom,
            installationId: this.getOrCreateInstallationId(),
            language: getTrimmedString(config?.language),
            latestKeyfrom,
            platform: this.options.platform ?? process.platform,
            timestamp: this.options.now?.() ?? Date.now(),
            userId,
        };
    }
    getOrCreateInstallationId() {
        try {
            const existing = getTrimmedString(this.options.store.get(constants_1.LogReporterStoreKey.InstallationUuid));
            if (existing)
                return existing;
            const installationId = this.options.createInstallationId?.() ?? (0, crypto_1.randomUUID)();
            this.options.store.set(constants_1.LogReporterStoreKey.InstallationUuid, installationId);
            return installationId;
        }
        catch (error) {
            console.warn(`[MainLogReporter] failed to get installation uuid (${getErrorName(error)})`);
            return null;
        }
    }
}
exports.MainLogReporter = MainLogReporter;
//# sourceMappingURL=mainLogReporter.js.map
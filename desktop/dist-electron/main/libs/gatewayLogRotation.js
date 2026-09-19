"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_GATEWAY_LOG_FILE_NAME = exports.GATEWAY_LOG_SUFFIX = exports.GATEWAY_LOG_PREFIX = exports.GATEWAY_LOG_RETENTION_DAYS = void 0;
exports.formatGatewayLogDateKey = formatGatewayLogDateKey;
exports.getGatewayLogPath = getGatewayLogPath;
exports.getRecentGatewayLogEntries = getRecentGatewayLogEntries;
exports.pruneGatewayLogs = pruneGatewayLogs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.GATEWAY_LOG_RETENTION_DAYS = 3;
exports.GATEWAY_LOG_PREFIX = 'gateway';
exports.GATEWAY_LOG_SUFFIX = '.log';
exports.LEGACY_GATEWAY_LOG_FILE_NAME = 'gateway.log';
const GATEWAY_DAILY_LOG_RE = /^gateway-\d{4}-\d{2}-\d{2}\.log$/;
function formatGatewayLogDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getGatewayLogPath(logsDir, date = new Date()) {
    return path_1.default.join(logsDir, `${exports.GATEWAY_LOG_PREFIX}-${formatGatewayLogDateKey(date)}${exports.GATEWAY_LOG_SUFFIX}`);
}
function getRecentGatewayLogEntries(logsDir, now = new Date()) {
    if (!fs_1.default.existsSync(logsDir))
        return [];
    const cutoffMs = now.getTime() - exports.GATEWAY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return fs_1.default.readdirSync(logsDir)
        .filter((fileName) => GATEWAY_DAILY_LOG_RE.test(fileName))
        .map((fileName) => ({ archiveName: fileName, filePath: path_1.default.join(logsDir, fileName) }))
        .filter(({ filePath }) => {
        try {
            return fs_1.default.statSync(filePath).mtimeMs >= cutoffMs;
        }
        catch {
            return false;
        }
    })
        .sort((a, b) => a.archiveName.localeCompare(b.archiveName));
}
function pruneGatewayLogs(logsDir, now = new Date()) {
    if (!fs_1.default.existsSync(logsDir))
        return;
    const cutoffMs = now.getTime() - exports.GATEWAY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const fileName of fs_1.default.readdirSync(logsDir)) {
        const isLegacyGatewayLog = fileName === exports.LEGACY_GATEWAY_LOG_FILE_NAME;
        const isExpiredDailyGatewayLog = GATEWAY_DAILY_LOG_RE.test(fileName)
            && isFileOlderThan(path_1.default.join(logsDir, fileName), cutoffMs);
        if (!isLegacyGatewayLog && !isExpiredDailyGatewayLog)
            continue;
        try {
            fs_1.default.unlinkSync(path_1.default.join(logsDir, fileName));
        }
        catch {
            // Best effort cleanup only.
        }
    }
}
function isFileOlderThan(filePath, cutoffMs) {
    try {
        return fs_1.default.statSync(filePath).mtimeMs < cutoffMs;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=gatewayLogRotation.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENCLAW_GATEWAY_REPAIR_BUSY_ERROR = void 0;
exports.getOpenClawGatewayRepairBusyError = getOpenClawGatewayRepairBusyError;
exports.formatOpenClawBackupTimestamp = formatOpenClawBackupTimestamp;
exports.resolveOpenClawConfigBackupPath = resolveOpenClawConfigBackupPath;
exports.backupOpenClawConfig = backupOpenClawConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.OPENCLAW_GATEWAY_REPAIR_BUSY_ERROR = 'Caisra has active sessions or scheduled tasks. Stop them before repairing the engine state.';
function getOpenClawGatewayRepairBusyError(hasActiveWorkloads) {
    return hasActiveWorkloads ? exports.OPENCLAW_GATEWAY_REPAIR_BUSY_ERROR : null;
}
const padDatePart = (value) => String(value).padStart(2, '0');
function formatOpenClawBackupTimestamp(date) {
    return [
        date.getFullYear(),
        padDatePart(date.getMonth() + 1),
        padDatePart(date.getDate()),
    ].join('')
        + '-'
        + [
            padDatePart(date.getHours()),
            padDatePart(date.getMinutes()),
            padDatePart(date.getSeconds()),
        ].join('');
}
function resolveOpenClawConfigBackupPath(configPath, fileExists = fs_1.default.existsSync, now = new Date()) {
    const configDir = path_1.default.dirname(configPath);
    const preferredBackupPath = path_1.default.join(configDir, 'openclaw-bak.json');
    if (!fileExists(preferredBackupPath)) {
        return preferredBackupPath;
    }
    const timestamp = formatOpenClawBackupTimestamp(now);
    const timestampedBackupPath = path_1.default.join(configDir, `openclaw-bak-${timestamp}.json`);
    if (!fileExists(timestampedBackupPath)) {
        return timestampedBackupPath;
    }
    for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
        const candidatePath = path_1.default.join(configDir, `openclaw-bak-${timestamp}-${index}.json`);
        if (!fileExists(candidatePath)) {
            return candidatePath;
        }
    }
    throw new Error('Unable to allocate an engine config backup path.');
}
function backupOpenClawConfig(configPath) {
    if (!fs_1.default.existsSync(configPath)) {
        return { originalPath: configPath };
    }
    const backupPath = resolveOpenClawConfigBackupPath(configPath);
    fs_1.default.renameSync(configPath, backupPath);
    return {
        originalPath: configPath,
        backupPath,
    };
}
//# sourceMappingURL=openclawGatewayRepair.js.map
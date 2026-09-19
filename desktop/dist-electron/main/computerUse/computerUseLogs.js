"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComputerUseLogDir = getComputerUseLogDir;
exports.ensureComputerUseLogDir = ensureComputerUseLogDir;
exports.getComputerUseLogRetentionDays = getComputerUseLogRetentionDays;
exports.getRecentComputerUseLogEntries = getRecentComputerUseLogEntries;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const COMPUTER_USE_LOG_RETENTION_DAYS = 7;
const COMPUTER_USE_DAILY_LOG_RE = /^computer-use-(js|helper)-\d{4}-\d{2}-\d{2}\.log$/;
function getComputerUseLogDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'computer-use', 'logs');
}
function ensureComputerUseLogDir() {
    const logDir = getComputerUseLogDir();
    fs_1.default.mkdirSync(logDir, { recursive: true });
    return logDir;
}
function getComputerUseLogRetentionDays() {
    return COMPUTER_USE_LOG_RETENTION_DAYS;
}
function getRecentComputerUseLogEntries(logDir = getComputerUseLogDir(), now = new Date()) {
    if (!fs_1.default.existsSync(logDir))
        return [];
    const cutoffMs = now.getTime() - COMPUTER_USE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return fs_1.default.readdirSync(logDir)
        .filter(fileName => COMPUTER_USE_DAILY_LOG_RE.test(fileName))
        .map(fileName => ({ archiveName: fileName, filePath: path_1.default.join(logDir, fileName) }))
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
//# sourceMappingURL=computerUseLogs.js.map
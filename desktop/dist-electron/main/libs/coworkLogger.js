"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.coworkLog = coworkLog;
exports.getCoworkLogPath = getCoworkLogPath;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
let logFilePath = null;
function getLogFilePath() {
    if (!logFilePath) {
        const logDir = path_1.default.join(electron_1.app.getPath('userData'), 'logs');
        if (!fs_1.default.existsSync(logDir)) {
            fs_1.default.mkdirSync(logDir, { recursive: true });
        }
        logFilePath = path_1.default.join(logDir, 'cowork.log');
    }
    return logFilePath;
}
function rotateIfNeeded() {
    try {
        const filePath = getLogFilePath();
        if (!fs_1.default.existsSync(filePath))
            return;
        const stat = fs_1.default.statSync(filePath);
        if (stat.size > MAX_LOG_SIZE) {
            const backupPath = filePath + '.old';
            if (fs_1.default.existsSync(backupPath)) {
                fs_1.default.unlinkSync(backupPath);
            }
            fs_1.default.renameSync(filePath, backupPath);
        }
    }
    catch {
        // ignore rotation errors
    }
}
function formatTimestamp() {
    const date = new Date();
    const pad = (value, length = 2) => value.toString().padStart(length, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    const millisecond = pad(date.getMilliseconds(), 3);
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offsetHour = pad(Math.floor(absOffset / 60));
    const offsetMinute = pad(absOffset % 60);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}${sign}${offsetHour}:${offsetMinute}`;
}
function coworkLog(level, tag, message, extra) {
    try {
        rotateIfNeeded();
        const parts = [`[${formatTimestamp()}] [${level}] [${tag}] ${message}`];
        if (extra) {
            for (const [key, value] of Object.entries(extra)) {
                const serialized = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
                parts.push(`  ${key}: ${serialized}`);
            }
        }
        parts.push('');
        fs_1.default.appendFileSync(getLogFilePath(), parts.join('\n'), 'utf-8');
    }
    catch {
        // Logging should never throw
    }
}
function getCoworkLogPath() {
    return getLogFilePath();
}
//# sourceMappingURL=coworkLogger.js.map
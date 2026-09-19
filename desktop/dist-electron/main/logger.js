"use strict";
/**
 * Logger module using electron-log
 * Intercepts console.* methods and writes to file + console simultaneously.
 *
 * Log file locations. The directory is the app's name, and the app was
 * renamed — `app.setName(APP_NAME)` runs in `main.ts` before this, and
 * electron-log reads `electron.app.name`:
 *
 *   macOS:   ~/Library/Logs/Caisra/main-YYYY-MM-DD.log
 *   Windows: %USERPROFILE%\AppData\Roaming\Caisra\logs\main-YYYY-MM-DD.log
 *   Linux:   ~/.config/Caisra/logs/main-YYYY-MM-DD.log
 *
 * This comment said `LobsterAI` long after the rename, and it cost the
 * founder an evening: every instruction to "check the log" sent them to a
 * directory that does not exist, so three separate faults looked like
 * "the log shows nothing". Hence the startup line below — the log now
 * says where the log is, and nobody has to trust a comment again.
 *
 * Rotation policy:
 *   - Daily log files (one file per calendar day)
 *   - Max 80 MB per file; on overflow electron-log rotates to .old.log
 *   - Files older than 7 days are pruned on startup
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
exports.initLogger = initLogger;
exports.getLogFilePath = getLogFilePath;
exports.getRecentMainLogEntries = getRecentMainLogEntries;
const main_1 = __importDefault(require("electron-log/main"));
exports.log = main_1.default;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const appConstants_1 = require("./appConstants");
const LOG_RETENTION_DAYS = 7;
const LOG_MAX_SIZE = 80 * 1024 * 1024; // 80 MB
/** Captured on first resolvePathFn call; used for pruning and export. */
let _logDir;
function todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function logDir() {
    return _logDir ?? path_1.default.dirname(main_1.default.transports.file.getFile().path);
}
/**
 * Initialize logging system.
 * Must be called early in main process, before any console output.
 */
function initLogger() {
    // Daily rotation: one file per calendar day
    main_1.default.transports.file.resolvePathFn = (vars) => {
        _logDir = vars.libraryDefaultDir;
        return path_1.default.join(vars.libraryDefaultDir, `main-${todayStr()}.log`);
    };
    // File transport config
    main_1.default.transports.file.level = 'debug';
    main_1.default.transports.file.maxSize = LOG_MAX_SIZE;
    main_1.default.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    // Console transport config
    main_1.default.transports.console.level = 'debug';
    main_1.default.transports.console.format = '{text}';
    // Intercept console.* methods so all existing console.log/error/warn
    // across 25+ files are automatically captured without any code changes.
    // electron-log correctly serializes Error objects (with stack traces),
    // unlike JSON.stringify which outputs '{}' for Error instances.
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    console.log = (...args) => {
        originalLog.apply(console, args);
        main_1.default.info(...args);
    };
    console.error = (...args) => {
        originalError.apply(console, args);
        main_1.default.error(...args);
    };
    console.warn = (...args) => {
        originalWarn.apply(console, args);
        main_1.default.warn(...args);
    };
    console.info = (...args) => {
        originalInfo.apply(console, args);
        main_1.default.info(...args);
    };
    console.debug = (...args) => {
        originalDebug.apply(console, args);
        main_1.default.debug(...args);
    };
    // Disable electron-log's own console transport to avoid double printing
    // (we already call originalLog above, so electron-log only needs to write to file)
    main_1.default.transports.console.level = false;
    // Remove log files older than retention window
    pruneOldLogs();
    // Log startup marker
    main_1.default.info('='.repeat(60));
    main_1.default.info(`${appConstants_1.APP_NAME} started (${process.platform} ${process.arch})`);
    main_1.default.info(`Log directory: ${logDir()}`);
    main_1.default.info('='.repeat(60));
}
/** Delete daily main-*.log files whose mtime exceeds the retention window. */
function pruneOldLogs() {
    const dir = logDir();
    if (!fs_1.default.existsSync(dir))
        return;
    const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of fs_1.default.readdirSync(dir)) {
        if (!/^main-\d{4}-\d{2}-\d{2}(\.old)?\.log$/.test(file))
            continue;
        const filePath = path_1.default.join(dir, file);
        try {
            if (fs_1.default.statSync(filePath).mtimeMs < cutoffMs) {
                fs_1.default.unlinkSync(filePath);
            }
        }
        catch {
            // ignore individual failures
        }
    }
}
/**
 * Get today's log file path (for display / open-in-folder).
 */
function getLogFilePath() {
    return main_1.default.transports.file.getFile().path;
}
/**
 * Return archive entries for all daily main log files within the last 7 days.
 * Suitable for passing directly to exportLogsZip.
 */
function getRecentMainLogEntries() {
    const dir = logDir();
    if (!fs_1.default.existsSync(dir))
        return [];
    const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return fs_1.default.readdirSync(dir)
        .filter((f) => /^main-\d{4}-\d{2}-\d{2}(\.old)?\.log$/.test(f))
        .map((f) => ({ archiveName: f, filePath: path_1.default.join(dir, f) }))
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
//# sourceMappingURL=logger.js.map
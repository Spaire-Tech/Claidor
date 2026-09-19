"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safelyReplaceTextFileSync = safelyReplaceTextFileSync;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const WINDOWS_REPLACE_FALLBACK_ERROR_CODES = new Set(['EACCES', 'EEXIST', 'EPERM']);
const isReplaceFallbackError = (error) => (error instanceof Error
    && 'code' in error
    && typeof error.code === 'string'
    && WINDOWS_REPLACE_FALLBACK_ERROR_CODES.has(error.code));
const removeFileBestEffort = (filePath) => {
    try {
        if (fs_1.default.existsSync(filePath))
            fs_1.default.unlinkSync(filePath);
    }
    catch {
        // A leftover temp/backup is safer than masking the write result.
    }
};
const writeFileAndSync = (filePath, content, mode, flag = 'w') => {
    const fileDescriptor = fs_1.default.openSync(filePath, flag, mode);
    try {
        fs_1.default.writeFileSync(fileDescriptor, content, 'utf8');
        fs_1.default.fsyncSync(fileDescriptor);
    }
    finally {
        fs_1.default.closeSync(fileDescriptor);
    }
    fs_1.default.chmodSync(filePath, mode);
};
/**
 * Replace an existing text file atomically where the platform permits it.
 * Windows can reject rename-over-existing with EEXIST/EPERM/EACCES; in that
 * case retain a recovery copy while performing a flushed direct overwrite,
 * and restore the original content if the overwrite fails.
 */
function safelyReplaceTextFileSync(params) {
    const token = `${process.pid}-${Date.now()}-${crypto_1.default.randomUUID()}`;
    const tempPath = `${params.filePath}.${params.tempLabel}-temp-${token}`;
    const backupPath = `${params.filePath}.${params.tempLabel}-backup-${token}`;
    let preserveBackup = false;
    try {
        writeFileAndSync(tempPath, params.content, params.mode, 'wx');
        try {
            fs_1.default.renameSync(tempPath, params.filePath);
            return;
        }
        catch (error) {
            if (!isReplaceFallbackError(error) || !fs_1.default.existsSync(params.filePath)) {
                throw error;
            }
        }
        const originalMode = fs_1.default.statSync(params.filePath).mode & 0o777;
        fs_1.default.copyFileSync(params.filePath, backupPath, fs_1.default.constants.COPYFILE_EXCL);
        const backupDescriptor = fs_1.default.openSync(backupPath, 'r+');
        try {
            fs_1.default.fsyncSync(backupDescriptor);
        }
        finally {
            fs_1.default.closeSync(backupDescriptor);
        }
        const originalContent = fs_1.default.readFileSync(backupPath, 'utf8');
        try {
            writeFileAndSync(params.filePath, params.content, params.mode);
        }
        catch (writeError) {
            try {
                writeFileAndSync(params.filePath, originalContent, originalMode);
            }
            catch (restoreError) {
                preserveBackup = true;
                const writeMessage = writeError instanceof Error ? writeError.message : String(writeError);
                const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
                throw new Error(`File replacement failed (${writeMessage}) and backup restoration failed (${restoreMessage}); recovery copy: ${backupPath}`, { cause: writeError });
            }
            throw writeError;
        }
    }
    finally {
        removeFileBestEffort(tempPath);
        if (!preserveBackup)
            removeFileBestEffort(backupPath);
    }
}
//# sourceMappingURL=safeFileReplace.js.map
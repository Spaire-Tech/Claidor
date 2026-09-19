"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSessionDiagnosticsHandlers = registerSessionDiagnosticsHandlers;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../../shared/cowork/constants");
const archive_1 = require("../../sessionDiagnostics/archive");
const repository_1 = require("../../sessionDiagnostics/repository");
const ensureZipFileName = (value) => (value.toLowerCase().endsWith('.zip') ? value : `${value}.zip`);
function registerSessionDiagnosticsHandlers(deps) {
    electron_1.ipcMain.handle(constants_1.CoworkIpcChannel.ExportSessionDiagnostics, async (event, options) => {
        try {
            const sessionId = typeof options?.sessionId === 'string' ? options.sessionId.trim() : '';
            if (!sessionId) {
                return { success: false, error: 'Session id is required' };
            }
            const diagnosticsData = (0, repository_1.readSessionDiagnosticsData)(deps.getDatabase(), sessionId);
            if (!diagnosticsData) {
                return { success: false, error: 'Session not found' };
            }
            const defaultName = (0, archive_1.buildSessionDiagnosticsDefaultFileName)({
                title: diagnosticsData.session.title,
                sessionId,
            });
            const ownerWindow = electron_1.BrowserWindow.fromWebContents(event.sender);
            const saveOptions = {
                defaultPath: path_1.default.join(deps.getDownloadsPath(), defaultName),
                filters: [{ name: 'ZIP', extensions: ['zip'] }],
            };
            const saveResult = ownerWindow
                ? await electron_1.dialog.showSaveDialog(ownerWindow, saveOptions)
                : await electron_1.dialog.showSaveDialog(saveOptions);
            if (saveResult.canceled || !saveResult.filePath) {
                return { success: true, canceled: true };
            }
            const outputPath = ensureZipFileName(saveResult.filePath);
            await (0, archive_1.exportSessionDiagnosticsZip)(outputPath, {
                data: diagnosticsData,
                appVersion: deps.getAppVersion(),
                exportedAt: new Date().toISOString(),
            });
            return { success: true, canceled: false, path: outputPath };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to export session diagnostics',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map
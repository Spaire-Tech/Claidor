"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBrowserCredentialHandlers = void 0;
const constants_1 = require("../../../shared/browserCredentials/constants");
const errorMessage = (error) => (error instanceof Error ? error.message : 'Browser credential operation failed.');
const registerBrowserCredentialHandlers = ({ ipcMain, getService, }) => {
    ipcMain.handle(constants_1.BrowserCredentialIpc.GetAvailability, () => {
        try {
            return { success: true, availability: getService().getAvailability() };
        }
        catch (error) {
            console.error('[BrowserCredentials] Failed to check availability:', error);
            return { success: false, error: errorMessage(error) };
        }
    });
    ipcMain.handle(constants_1.BrowserCredentialIpc.List, () => {
        try {
            return { success: true, credentials: getService().list() };
        }
        catch (error) {
            console.error('[BrowserCredentials] Failed to list credentials:', error);
            return { success: false, error: errorMessage(error) };
        }
    });
    ipcMain.handle(constants_1.BrowserCredentialIpc.Save, (_event, request) => {
        try {
            if (!request || typeof request !== 'object') {
                throw new Error('Browser credential details are required.');
            }
            return { success: true, credential: getService().save(request) };
        }
        catch (error) {
            console.error('[BrowserCredentials] Failed to save credential:', error);
            return { success: false, error: errorMessage(error) };
        }
    });
    ipcMain.handle(constants_1.BrowserCredentialIpc.Delete, (_event, request) => {
        try {
            if (!request || typeof request.id !== 'string' || !request.id.trim()) {
                throw new Error('A browser credential ID is required.');
            }
            if (!getService().delete(request.id)) {
                throw new Error('The saved browser credential no longer exists.');
            }
            return { success: true };
        }
        catch (error) {
            console.error('[BrowserCredentials] Failed to delete credential:', error);
            return { success: false, error: errorMessage(error) };
        }
    });
};
exports.registerBrowserCredentialHandlers = registerBrowserCredentialHandlers;
//# sourceMappingURL=handlers.js.map
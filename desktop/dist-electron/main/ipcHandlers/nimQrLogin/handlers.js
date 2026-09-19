"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerNimQrLoginHandlers = registerNimQrLoginHandlers;
const electron_1 = require("electron");
const constants_1 = require("./constants");
function registerNimQrLoginHandlers(deps) {
    electron_1.ipcMain.handle(constants_1.NimQrLoginIpc.Start, async () => {
        try {
            return await deps.startNimQrLogin();
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to start NIM QR login');
        }
    });
    electron_1.ipcMain.handle(constants_1.NimQrLoginIpc.Poll, async (_event, uuid) => {
        try {
            return await deps.pollNimQrLogin(uuid);
        }
        catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Failed to poll NIM QR login',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map
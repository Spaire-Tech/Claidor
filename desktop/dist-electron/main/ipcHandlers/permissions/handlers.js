"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPermissionIpcHandlers = registerPermissionIpcHandlers;
const constants_1 = require("../../../shared/permissions/constants");
const calendarPermission_1 = require("../../permissions/calendarPermission");
function registerPermissionIpcHandlers({ ipcMain, isDev }) {
    ipcMain.handle(constants_1.PermissionIpcChannel.CheckCalendar, async () => {
        try {
            const status = await (0, calendarPermission_1.checkCalendarPermission)();
            if (isDev && status === constants_1.SystemPermissionStatus.NotDetermined && process.platform === 'darwin') {
                console.log('[Permissions] Development mode: Auto-requesting calendar permission...');
                try {
                    await (0, calendarPermission_1.requestCalendarPermission)();
                    const newStatus = await (0, calendarPermission_1.checkCalendarPermission)();
                    console.log('[Permissions] Development mode: Permission status after request:', newStatus);
                    return { success: true, status: newStatus, autoRequested: true };
                }
                catch (requestError) {
                    console.warn('[Permissions] Development mode: Auto-request failed:', requestError);
                }
            }
            return { success: true, status };
        }
        catch (error) {
            console.error('[Main] Error checking calendar permission:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to check permission',
            };
        }
    });
    ipcMain.handle(constants_1.PermissionIpcChannel.RequestCalendar, async () => {
        try {
            const granted = await (0, calendarPermission_1.requestCalendarPermission)();
            const status = await (0, calendarPermission_1.checkCalendarPermission)();
            return { success: true, granted, status };
        }
        catch (error) {
            console.error('[Main] Error requesting calendar permission:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to request permission',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map
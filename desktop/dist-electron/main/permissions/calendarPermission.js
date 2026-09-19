"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCalendarPermission = checkCalendarPermission;
exports.requestCalendarPermission = requestCalendarPermission;
const child_process_1 = require("child_process");
const util_1 = require("util");
const constants_1 = require("../../shared/permissions/constants");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function checkCalendarPermission() {
    if (process.platform === 'darwin') {
        try {
            await execAsync('osascript -l JavaScript -e \'Application("Calendar").name()\'', {
                timeout: 5000,
            });
            console.log('[Permissions] macOS Calendar access: authorized');
            return constants_1.SystemPermissionStatus.Authorized;
        }
        catch (error) {
            const stderr = typeof error === 'object' && error && 'stderr' in error
                ? String(error.stderr ?? '')
                : '';
            if (stderr.includes('不能获取对象') ||
                stderr.includes('not authorized') ||
                stderr.includes('Permission denied')) {
                console.log('[Permissions] macOS Calendar access: not-determined (needs permission)');
                return constants_1.SystemPermissionStatus.NotDetermined;
            }
            console.warn('[Permissions] Failed to check macOS calendar permission:', error);
            return constants_1.SystemPermissionStatus.NotDetermined;
        }
    }
    if (process.platform === 'win32') {
        try {
            const checkScript = `
        try {
          $Outlook = New-Object -ComObject Outlook.Application
          $Outlook.Version
        } catch { exit 1 }
      `;
            await execAsync(`powershell -Command "${checkScript}"`, { timeout: 10000 });
            console.log('[Permissions] Windows Outlook is available');
            return constants_1.SystemPermissionStatus.Authorized;
        }
        catch {
            console.log('[Permissions] Windows Outlook not available or not accessible');
            return constants_1.SystemPermissionStatus.NotDetermined;
        }
    }
    return constants_1.SystemPermissionStatus.NotSupported;
}
async function requestCalendarPermission() {
    if (process.platform === 'darwin') {
        try {
            await execAsync('osascript -l JavaScript -e \'Application("Calendar").calendars()[0].name()\'', { timeout: 10000 });
            return true;
        }
        catch (error) {
            console.warn('[Permissions] Failed to request macOS calendar permission:', error);
            return false;
        }
    }
    if (process.platform === 'win32') {
        const status = await checkCalendarPermission();
        return status === constants_1.SystemPermissionStatus.Authorized;
    }
    return false;
}
//# sourceMappingURL=calendarPermission.js.map
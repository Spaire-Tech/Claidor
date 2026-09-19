"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAutoLaunchStatus = getAutoLaunchStatus;
exports.setAutoLaunchEnabled = setAutoLaunchEnabled;
exports.isAutoLaunched = isAutoLaunched;
const electron_1 = require("electron");
const AUTO_LAUNCH_ARGS = ['--auto-launched'];
const getLoginItemSettings = () => {
    if (process.platform === 'win32') {
        // Windows: must pass the same args used in setLoginItemSettings,
        // otherwise openAtLogin defaults to comparing against [] which
        // won't match the registered ['--auto-launched'] and returns false.
        return electron_1.app.getLoginItemSettings({
            args: AUTO_LAUNCH_ARGS,
        });
    }
    return electron_1.app.getLoginItemSettings();
};
function getAutoLaunchStatus() {
    const settings = getLoginItemSettings();
    const status = typeof settings.status === 'string' ? settings.status : undefined;
    const enabled = process.platform === 'darwin' && status
        ? status === 'enabled'
        : process.platform === 'win32'
            ? Boolean(settings.executableWillLaunchAtLogin)
            : settings.openAtLogin;
    return {
        enabled,
        openAtLogin: settings.openAtLogin,
        status,
        executableWillLaunchAtLogin: settings.executableWillLaunchAtLogin,
        launchItems: Array.isArray(settings.launchItems)
            ? settings.launchItems.map(item => ({
                name: item.name,
                path: item.path,
                args: item.args,
                enabled: item.enabled,
                scope: item.scope,
            }))
            : undefined,
    };
}
const disableWindowsLoginItems = () => {
    const settings = getLoginItemSettings();
    const launchItems = Array.isArray(settings.launchItems) ? settings.launchItems : [];
    const currentExecutablePath = process.execPath.toLowerCase();
    const matchingLaunchItems = launchItems.filter(item => item.path.toLowerCase() === currentExecutablePath);
    for (const item of matchingLaunchItems) {
        electron_1.app.setLoginItemSettings({
            openAtLogin: false,
            path: item.path,
            args: item.args,
            name: item.name,
        });
    }
    electron_1.app.setLoginItemSettings({
        openAtLogin: false,
        args: AUTO_LAUNCH_ARGS,
    });
    electron_1.app.setLoginItemSettings({
        openAtLogin: false,
        args: [],
    });
};
function setAutoLaunchEnabled(enabled) {
    const isMac = process.platform === 'darwin';
    const isWindows = process.platform === 'win32';
    try {
        if (isWindows && !enabled) {
            disableWindowsLoginItems();
            return;
        }
        electron_1.app.setLoginItemSettings({
            openAtLogin: enabled,
            // macOS: kept for older versions; Electron marks this deprecated on macOS 13+.
            openAsHidden: isMac ? enabled : false,
            // Windows: 通过命令行参数标记自启动
            args: isWindows ? AUTO_LAUNCH_ARGS : [],
        });
    }
    catch (error) {
        console.error('Failed to set auto-launch settings:', error);
        throw error;
    }
}
function isAutoLaunched() {
    try {
        if (process.platform === 'darwin') {
            const settings = electron_1.app.getLoginItemSettings();
            return settings.wasOpenedAtLogin || false;
        }
        // Windows: 检查命令行参数
        return process.argv.includes('--auto-launched');
    }
    catch (error) {
        console.error('Failed to check auto-launch status:', error);
        return false;
    }
}
//# sourceMappingURL=autoLaunchManager.js.map
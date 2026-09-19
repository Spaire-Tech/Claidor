"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTray = createTray;
exports.updateTrayMenu = updateTrayMenu;
exports.updateTrayReminder = updateTrayReminder;
exports.destroyTray = destroyTray;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const appConstants_1 = require("./appConstants");
const i18n_1 = require("./i18n");
let tray = null;
let contextMenu = null;
let clickHandler = null;
let rightClickHandler = null;
let trayReminder = { count: 0 };
function getTrayIconPath() {
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';
    const basePath = electron_1.app.isPackaged
        ? path_1.default.join(process.resourcesPath, 'tray')
        : path_1.default.join(__dirname, '..', 'resources', 'tray');
    if (isMac) {
        return path_1.default.join(basePath, 'tray-icon-mac.png');
    }
    if (isWin) {
        return path_1.default.join(basePath, 'tray-icon.ico');
    }
    // Linux
    return path_1.default.join(basePath, 'tray-icon.png');
}
function getLabels() {
    return {
        showWindow: (0, i18n_1.t)('trayShowWindow'),
        newTask: (0, i18n_1.t)('trayNewTask'),
        viewCompletedTask: (0, i18n_1.t)('trayViewCompletedTask'),
        settings: (0, i18n_1.t)('traySettings'),
        quit: (0, i18n_1.t)('trayQuit'),
    };
}
function buildContextMenu(getWindow) {
    const labels = getLabels();
    return electron_1.Menu.buildFromTemplate([
        ...(trayReminder.count > 0
            ? [
                {
                    label: labels.viewCompletedTask,
                    click: () => trayReminder.onClick?.(),
                },
                { type: 'separator' },
            ]
            : []),
        {
            label: labels.showWindow,
            click: () => {
                const win = getWindow();
                if (win && !win.isDestroyed()) {
                    if (!win.isVisible())
                        win.show();
                    if (!win.isFocused())
                        win.focus();
                }
            },
        },
        {
            label: labels.newTask,
            click: () => {
                const win = getWindow();
                if (win && !win.isDestroyed()) {
                    if (!win.isVisible())
                        win.show();
                    if (!win.isFocused())
                        win.focus();
                    win.webContents.send('app:newTask');
                }
            },
        },
        { type: 'separator' },
        {
            label: labels.settings,
            click: () => {
                const win = getWindow();
                if (win && !win.isDestroyed()) {
                    if (!win.isVisible())
                        win.show();
                    if (!win.isFocused())
                        win.focus();
                    win.webContents.send('app:openSettings');
                }
            },
        },
        { type: 'separator' },
        {
            label: labels.quit,
            click: () => {
                electron_1.app.quit();
            },
        },
    ]);
}
function createTray(getWindow) {
    if (tray) {
        return tray;
    }
    const iconPath = getTrayIconPath();
    let icon = electron_1.nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') {
        icon.setTemplateImage(false);
        // Keep the tray icon within macOS menu bar bounds.
        if (icon.getSize().height > 18) {
            icon = icon.resize({ height: 18 });
            icon.setTemplateImage(false);
        }
    }
    tray = new electron_1.Tray(icon);
    tray.setToolTip(resolveTrayTooltip());
    contextMenu = buildContextMenu(getWindow);
    clickHandler = () => {
        if (trayReminder.count > 0) {
            trayReminder.onClick?.();
            return;
        }
        const win = getWindow();
        if (!win || win.isDestroyed())
            return;
        if (!win.isVisible())
            win.show();
        if (!win.isFocused())
            win.focus();
    };
    rightClickHandler = () => {
        if (contextMenu) {
            tray?.popUpContextMenu(contextMenu);
        }
    };
    tray.on('click', clickHandler);
    tray.on('right-click', rightClickHandler);
    return tray;
}
function updateTrayMenu(getWindow) {
    if (!tray)
        return;
    contextMenu = buildContextMenu(getWindow);
    tray.setToolTip(resolveTrayTooltip());
}
function updateTrayReminder(getWindow, reminder) {
    trayReminder = reminder;
    updateTrayMenu(getWindow);
}
function destroyTray() {
    if (tray) {
        if (clickHandler)
            tray.removeListener('click', clickHandler);
        if (rightClickHandler)
            tray.removeListener('right-click', rightClickHandler);
        tray.destroy();
        tray = null;
        contextMenu = null;
        clickHandler = null;
        rightClickHandler = null;
        trayReminder = { count: 0 };
    }
}
function resolveTrayTooltip() {
    if (trayReminder.count > 0) {
        return (0, i18n_1.t)('trayCompletedTaskTooltip', { count: trayReminder.count });
    }
    return appConstants_1.APP_NAME;
}
//# sourceMappingURL=trayManager.js.map
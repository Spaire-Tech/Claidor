"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifySkinChanged = exports.SKIN_PRIVILEGED_SCHEME = void 0;
exports.registerSkinElectronIntegration = registerSkinElectronIntegration;
const electron_1 = require("electron");
const constants_1 = require("../../shared/skin/constants");
const skinPresentation_1 = require("./skinPresentation");
const skinProtocol_1 = require("./skinProtocol");
exports.SKIN_PRIVILEGED_SCHEME = {
    scheme: constants_1.SkinProtocol.Scheme,
    privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
    },
};
const notifySkinChanged = () => {
    electron_1.BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed())
            window.webContents.send(constants_1.SkinIpc.Changed);
    });
};
exports.notifySkinChanged = notifySkinChanged;
function registerSkinElectronIntegration(store) {
    electron_1.protocol.handle(constants_1.SkinProtocol.Scheme, (0, skinProtocol_1.createSkinProtocolHandler)({
        rootDir: store.rootDir,
        resolveAsset: (skinId, slot) => store.resolveProtocolAsset(skinId, slot),
    }));
    electron_1.ipcMain.handle(constants_1.SkinIpc.GetActive, async () => {
        try {
            const activeSkin = await store.getActive();
            return {
                success: true,
                activeSkin: activeSkin ? (0, skinPresentation_1.presentSkin)(activeSkin) : null,
            };
        }
        catch (error) {
            console.error('[Skin] failed to load active skin:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to load active skin',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.SkinIpc.List, async () => {
        try {
            const skins = await store.listSkins();
            return {
                success: true,
                skins: skins
                    .filter(skin => skin.status === constants_1.SkinRecordStatus.Ready)
                    .map(skinPresentation_1.presentSkin),
            };
        }
        catch (error) {
            console.error('[Skin] failed to list skins:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list skins',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.SkinIpc.Apply, async (_event, skinId, boundThemeId) => {
        try {
            const activeSkin = await store.apply(skinId, boundThemeId);
            (0, exports.notifySkinChanged)();
            return {
                success: true,
                activeSkin: (0, skinPresentation_1.presentSkin)(activeSkin),
            };
        }
        catch (error) {
            console.error('[Skin] failed to apply skin:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to apply skin',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.SkinIpc.BindTheme, async (_event, skinId, themeId) => {
        try {
            const skin = await store.bindTheme(skinId, themeId);
            (0, exports.notifySkinChanged)();
            return {
                success: true,
                skin: (0, skinPresentation_1.presentSkin)(skin),
            };
        }
        catch (error) {
            console.error('[Skin] failed to bind skin theme:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to bind skin theme',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.SkinIpc.Deactivate, async () => {
        try {
            await store.deactivate();
            (0, exports.notifySkinChanged)();
            return { success: true };
        }
        catch (error) {
            console.error('[Skin] failed to deactivate skin:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to deactivate skin',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.SkinIpc.Delete, async (_event, skinId) => {
        try {
            const result = await store.deleteSkin(skinId);
            (0, exports.notifySkinChanged)();
            return {
                success: true,
                wasActive: result.wasActive,
            };
        }
        catch (error) {
            console.error('[Skin] failed to delete skin:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete skin',
            };
        }
    });
}
//# sourceMappingURL=registerSkinElectron.js.map
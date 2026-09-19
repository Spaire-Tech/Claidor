"use strict";
// IPC + lifecycle wiring for the experimental DeepSeek Harness feature:
// enable/disable flag, engine state queries, and the workbench window. dsh
// stays independent from the main agent: it is never registered as an MCP
// server and no task is forwarded to it through LobsterAI. Keeps all dsh
// wiring out of main.ts except one register call.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDshFeatureEnabled = isDshFeatureEnabled;
exports.ensureDshEngineReady = ensureDshEngineReady;
exports.stopDshFeatureRuntimes = stopDshFeatureRuntimes;
exports.registerDshHandlers = registerDshHandlers;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const constants_1 = require("../../../shared/dshEngine/constants");
const dshConfigSync_1 = require("../../libs/dshConfigSync");
const dshEngineManager_1 = require("../../libs/dshEngineManager");
const dshSharedHome_1 = require("../../libs/dshSharedHome");
let moduleDeps = null;
let workbenchWindow = null;
// The canonical dsh home. Using it directly — rather than a private copy —
// is what makes installed plugins, credentials, agent presets, settings, and
// history identical to a standalone `npx @deepseek-ai/dsh`.
function standaloneDshHome() {
    return path.join(os.homedir(), '.dsh');
}
// Earlier builds wrote a composition patch that switched shipped rows off.
// That home is exclusively ours, so any patch file left there is a leftover
// from that version and would keep disabling capabilities on the fallback
// path. The machine's own ~/.dsh patch layer is the user's and never touched.
function removeLegacyPrivatePatchLayer(privateHome) {
    const legacyPatch = path.join(privateHome, 'cordis.patch.yml');
    try {
        if (fs.existsSync(legacyPatch)) {
            fs.rmSync(legacyPatch);
            console.log('[DSH] Removed a legacy composition patch from the private home');
        }
    }
    catch (error) {
        console.warn('[DSH] Could not remove the legacy private patch layer', error);
    }
}
function readDshFeatureConfig(store) {
    return { enabled: store.get(constants_1.DSH_CONFIG_STORE_KEY)?.enabled === true };
}
function isDshFeatureEnabled(store) {
    return readDshFeatureConfig(store).enabled;
}
function computeManagedSettings() {
    if (!moduleDeps)
        return null;
    const providers = moduleDeps.getProviders();
    const firstUsable = Object.entries(providers).find(([, config]) => config?.enabled !== false && !!config?.apiKey && (config?.models?.length ?? 0) > 0);
    const planProvider = moduleDeps.getPlanProvider();
    // Only prefer a user provider as the default when there is no plan; the plan
    // needs no key of the user's own, so it is the safer out-of-the-box default.
    const preferredDefault = !planProvider && firstUsable && firstUsable[1].models?.[0]?.id
        ? { providerId: firstUsable[0], modelId: firstUsable[1].models[0].id }
        : undefined;
    return (0, dshConfigSync_1.renderDshManagedSettings)(providers, { preferredDefault, planProvider });
}
// Starts the engine on demand (settings sync included) and resolves the web
// URL for the workbench window.
async function ensureDshEngineReady() {
    const manager = (0, dshEngineManager_1.getDshEngineManager)();
    // The workbench runs against the machine's dsh home so plugins, credentials,
    // settings, and history are the same ones a standalone dsh uses. dsh allows
    // one live writer per session, so a conflicting writer downgrades this run to
    // a private home instead of risking a corrupt log.
    const sharedHome = standaloneDshHome();
    const resolution = await (0, dshSharedHome_1.resolveSharedDataHome)(sharedHome);
    if (resolution.decision !== dshSharedHome_1.DshSharedHomeDecision.Shared) {
        console.warn(`[DSH] Another dsh is using ${sharedHome} (${resolution.decision}); falling back to a private home.`);
    }
    removeLegacyPrivatePatchLayer(manager.getPrivateDshHomeDir());
    // Packaged builds carry no runtime; it is fetched on first use from the URL
    // recorded for this platform in package.json `dsh.runtimes`. That first fetch
    // is a ~40s one-off, so the manager publishes its progress on the engine
    // state and the settings card renders it.
    await manager.ensureRuntimeInstalled();
    manager.setHomeDirectorySource(() => resolution.dataHome);
    manager.setManagedSettingsSource(computeManagedSettings);
    manager.setWorkingDirectorySource(() => moduleDeps?.getDefaultCwd() ?? '');
    manager.setSharedHomeLock(resolution.dataHome
        ? { claim: (port) => (0, dshSharedHome_1.writeWriterLock)(sharedHome, port), release: () => (0, dshSharedHome_1.clearWriterLock)(sharedHome) }
        : null);
    const state = await manager.start();
    const url = manager.getWebUrl();
    if (!url) {
        throw new Error(`DeepSeek Harness engine failed to start (phase=${state.phase}, error=${state.errorCode ?? 'none'})`);
    }
    return url;
}
function closeWorkbenchWindow() {
    if (workbenchWindow && !workbenchWindow.isDestroyed()) {
        workbenchWindow.close();
    }
    workbenchWindow = null;
}
function openOrFocusWorkbench(url, title) {
    if (workbenchWindow && !workbenchWindow.isDestroyed()) {
        if (workbenchWindow.webContents.getURL() !== url) {
            void workbenchWindow.loadURL(url);
        }
        if (workbenchWindow.isMinimized())
            workbenchWindow.restore();
        workbenchWindow.focus();
        return;
    }
    workbenchWindow = new electron_1.BrowserWindow({
        width: 1320,
        height: 880,
        title,
        autoHideMenuBar: true,
        webPreferences: {
            // The dsh web UI is a plain same-origin page: no preload, no Node, and a
            // dedicated persistent partition so its storage stays out of the app's.
            partition: 'persist:dsh',
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    workbenchWindow.on('closed', () => {
        workbenchWindow = null;
    });
    void workbenchWindow.loadURL(url);
}
async function stopDshFeatureRuntimes() {
    closeWorkbenchWindow();
    await (0, dshEngineManager_1.getDshEngineManager)().stop();
}
function registerDshHandlers(deps) {
    moduleDeps = deps;
    electron_1.ipcMain.handle(constants_1.DshIpcChannel.GetState, () => (0, dshEngineManager_1.getDshEngineManager)().getState());
    electron_1.ipcMain.handle(constants_1.DshIpcChannel.GetConfig, () => readDshFeatureConfig(deps.getStore()));
    electron_1.ipcMain.handle(constants_1.DshIpcChannel.SetEnabled, async (_event, enabled) => {
        const store = deps.getStore();
        const next = enabled === true;
        store.set(constants_1.DSH_CONFIG_STORE_KEY, { enabled: next });
        if (!next) {
            await stopDshFeatureRuntimes();
        }
        // Nothing in OpenClaw's config depends on this flag, so the toggle never
        // touches openclaw.json and never restarts the gateway.
        return { enabled: next };
    });
    electron_1.ipcMain.handle(constants_1.DshIpcChannel.Stop, async () => {
        await stopDshFeatureRuntimes();
        return (0, dshEngineManager_1.getDshEngineManager)().getState();
    });
    electron_1.ipcMain.handle(constants_1.DshIpcChannel.OpenWorkbench, async () => {
        if (!isDshFeatureEnabled(deps.getStore())) {
            throw new Error('DeepSeek Harness is not enabled');
        }
        const url = await ensureDshEngineReady();
        openOrFocusWorkbench(url, deps.getWorkbenchTitle());
        return { url };
    });
}
//# sourceMappingURL=handlers.js.map
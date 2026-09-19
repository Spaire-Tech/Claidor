"use strict";
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
exports.registerPluginHandlers = registerPluginHandlers;
const electron_1 = require("electron");
const openclawConfigImpact_1 = require("../../libs/openclawConfigImpact");
function registerPluginHandlers(deps) {
    const { getCoworkStore, syncOpenClawConfig } = deps;
    electron_1.ipcMain.handle('plugins:list', async () => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            return { success: true, plugins: await manager.listPlugins() };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to list plugins' };
        }
    });
    electron_1.ipcMain.handle('plugins:sync', async () => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            const result = await manager.syncPluginsFromOpenClaw();
            return result;
        }
        catch (error) {
            console.error('[plugins:sync] error:', error);
            return { synced: [], error: error instanceof Error ? error.message : 'Failed to sync plugins' };
        }
    });
    electron_1.ipcMain.handle('plugins:detect', async () => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            const result = manager.detectPluginsFromOpenClaw();
            return result;
        }
        catch (error) {
            console.error('[plugins:detect] error:', error);
            return { plugins: [], error: error instanceof Error ? error.message : 'Failed to detect plugins' };
        }
    });
    electron_1.ipcMain.handle('plugins:install', async (event, params) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            const sender = event.sender;
            const sendLog = (line) => {
                try {
                    sender.send('plugins:install-log', line);
                }
                catch { /* window closed */ }
            };
            const result = await manager.installPlugin(params, sendLog);
            if (result.ok) {
                sendLog('Syncing gateway config...\n');
                const impactDecision = (0, openclawConfigImpact_1.classifyPluginConfigChange)(openclawConfigImpact_1.OpenClawPluginChangeAction.Install);
                await syncOpenClawConfig({
                    reason: 'plugin-install',
                    restartGatewayIfRunning: impactDecision.impact === openclawConfigImpact_1.OpenClawConfigImpact.Restart,
                });
                sendLog('Gateway config synced.\n');
            }
            return result;
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Failed to install plugin' };
        }
    });
    electron_1.ipcMain.handle('plugins:uninstall', async (_event, pluginId) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            const result = await manager.uninstallPlugin(pluginId);
            if (result.ok) {
                const impactDecision = (0, openclawConfigImpact_1.classifyPluginConfigChange)(openclawConfigImpact_1.OpenClawPluginChangeAction.Uninstall);
                await syncOpenClawConfig({
                    reason: 'plugin-uninstall',
                    restartGatewayIfRunning: impactDecision.impact === openclawConfigImpact_1.OpenClawConfigImpact.Restart,
                });
            }
            return result;
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Failed to uninstall plugin' };
        }
    });
    electron_1.ipcMain.handle('plugins:set-enabled', async (_event, pluginId, enabled) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            manager.setPluginEnabled(pluginId, enabled);
            const impactDecision = (0, openclawConfigImpact_1.classifyPluginConfigChange)(openclawConfigImpact_1.OpenClawPluginChangeAction.Toggle);
            await syncOpenClawConfig({
                reason: 'plugin-toggle',
                restartGatewayIfRunning: impactDecision.impact === openclawConfigImpact_1.OpenClawConfigImpact.Restart,
            });
            return { ok: true };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Failed to toggle plugin' };
        }
    });
    electron_1.ipcMain.handle('plugins:get-config-schema', async (_event, pluginId) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            const schema = manager.getPluginConfigSchema(pluginId);
            const config = manager.getPluginConfig(pluginId);
            return { success: true, schema, config };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to get config schema' };
        }
    });
    electron_1.ipcMain.handle('plugins:save-config', async (_event, pluginId, config) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            manager.savePluginConfig(pluginId, config);
            const impactDecision = (0, openclawConfigImpact_1.classifyPluginConfigChange)(openclawConfigImpact_1.OpenClawPluginChangeAction.Config);
            await syncOpenClawConfig({
                reason: 'plugin-config',
                restartGatewayIfRunning: impactDecision.impact === openclawConfigImpact_1.OpenClawConfigImpact.Restart,
            });
            return { ok: true };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Failed to save plugin config' };
        }
    });
    electron_1.ipcMain.handle('plugins:batch-save', async (_event, changes) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            for (const { pluginId, enabled } of changes.toggles ?? []) {
                manager.setPluginEnabled(pluginId, enabled);
            }
            for (const { pluginId, config } of changes.configs ?? []) {
                manager.savePluginConfig(pluginId, config);
            }
            const hasChanges = (changes.toggles?.length ?? 0) > 0 || (changes.configs?.length ?? 0) > 0;
            if (hasChanges) {
                await syncOpenClawConfig({
                    reason: 'plugin-batch-save',
                    restartGatewayIfRunning: true,
                });
            }
            return { ok: true };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Failed to batch save plugin changes' };
        }
    });
    electron_1.ipcMain.handle('plugins:check-updates', async (_event, pluginIds) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            const updates = await manager.checkPluginUpdates(pluginIds);
            return { success: true, updates };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to check plugin updates' };
        }
    });
    electron_1.ipcMain.handle('plugins:update', async (event, pluginId) => {
        try {
            const { PluginManager } = await Promise.resolve().then(() => __importStar(require('../../plugins/pluginManager')));
            const manager = new PluginManager(getCoworkStore());
            // Find plugin info to determine source/spec/registry
            const plugins = getCoworkStore().listUserPlugins();
            const plugin = plugins.find(p => p.pluginId === pluginId);
            if (!plugin) {
                return { ok: false, error: `Plugin "${pluginId}" not found` };
            }
            if (plugin.source !== 'npm' && plugin.source !== 'clawhub') {
                return { ok: false, error: `Update not supported for source "${plugin.source}"` };
            }
            const previousEnabled = plugin.enabled;
            const sender = event.sender;
            const sendLog = (line) => {
                try {
                    sender.send('plugins:install-log', line);
                }
                catch { /* window closed */ }
            };
            // Reinstall without version constraint to get latest
            const result = await manager.installPlugin({
                source: plugin.source,
                spec: plugin.spec,
                registry: plugin.registry,
            }, sendLog);
            if (result.ok) {
                // Restore previous enabled state (installPlugin always sets enabled=true)
                if (!previousEnabled) {
                    manager.setPluginEnabled(pluginId, false);
                }
                sendLog('Syncing gateway config...\n');
                const impactDecision = (0, openclawConfigImpact_1.classifyPluginConfigChange)(openclawConfigImpact_1.OpenClawPluginChangeAction.Install);
                await syncOpenClawConfig({
                    reason: 'plugin-update',
                    restartGatewayIfRunning: impactDecision.impact === openclawConfigImpact_1.OpenClawConfigImpact.Restart,
                });
                sendLog('Gateway config synced.\n');
            }
            return result;
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Failed to update plugin' };
        }
    });
}
//# sourceMappingURL=handlers.js.map
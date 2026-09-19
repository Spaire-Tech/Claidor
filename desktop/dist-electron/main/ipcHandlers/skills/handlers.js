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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSkillHandlers = registerSkillHandlers;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const skills_1 = require("../../skills");
function registerSkillHandlers(deps) {
    const { getSkillManager, getSkillStoreUrl, getOpenClawRuntimeAdapter } = deps;
    electron_1.ipcMain.handle('skills:list', () => {
        try {
            const skills = getSkillManager().listSkills();
            return { success: true, skills };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to load skills' };
        }
    });
    electron_1.ipcMain.handle('skills:setEnabled', async (_event, options) => {
        try {
            const skills = getSkillManager().setSkillEnabled(options.id, options.enabled);
            // Best-effort sync to OpenClaw
            try {
                const adapter = getOpenClawRuntimeAdapter();
                if (adapter) {
                    await adapter.connectGatewayIfNeeded();
                    const client = adapter.getGatewayClient();
                    if (client) {
                        await client.request('skills.update', { skillKey: options.id, enabled: options.enabled }, { timeoutMs: 10_000 });
                    }
                }
            }
            catch (ocError) {
                console.warn('[skills] Failed to sync enabled state to OpenClaw:', ocError);
            }
            return { success: true, skills };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to update skill' };
        }
    });
    electron_1.ipcMain.handle('skills:delete', async (_event, id) => {
        try {
            // Read _meta.json before deletion to get OpenClaw source path
            let openclawSourceDir = null;
            try {
                const skillRoot = getSkillManager().getSkillsRoot();
                const metaPath = path_1.default.join(skillRoot, id, '_meta.json');
                if (fs_1.default.existsSync(metaPath)) {
                    const meta = JSON.parse(fs_1.default.readFileSync(metaPath, 'utf8'));
                    if (meta.openclawSourceDir) {
                        openclawSourceDir = meta.openclawSourceDir;
                    }
                }
            }
            catch { /* best-effort */ }
            const skills = await getSkillManager().deleteSkill(id);
            // Also remove from OpenClaw workspace so the skill won't reappear on next sync
            if (openclawSourceDir && fs_1.default.existsSync(openclawSourceDir)) {
                try {
                    await fs_1.default.promises.rm(openclawSourceDir, { recursive: true, force: true });
                    console.log('[skills] Also removed OpenClaw workspace skill:', openclawSourceDir);
                }
                catch (ocError) {
                    console.warn('[skills] Failed to remove skill from OpenClaw workspace:', ocError);
                }
            }
            return { success: true, skills };
        }
        catch (error) {
            console.error('[skills] Failed to delete skill:', id, error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to delete skill' };
        }
    });
    electron_1.ipcMain.handle('skills:download', async (_event, source) => {
        return getSkillManager().downloadSkill(source);
    });
    electron_1.ipcMain.handle('skills:upgrade', async (_event, skillId, downloadUrl) => {
        return getSkillManager().upgradeSkill(skillId, downloadUrl);
    });
    electron_1.ipcMain.handle('skills:confirmInstall', async (_event, pendingId, action) => {
        const validActions = ['install', 'installDisabled', 'cancel'];
        if (!validActions.includes(action)) {
            return { success: false, error: 'Invalid action' };
        }
        return getSkillManager().confirmPendingInstall(pendingId, action);
    });
    electron_1.ipcMain.handle('skills:getRoot', () => {
        try {
            const root = getSkillManager().getSkillsRoot();
            return { success: true, path: root };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to resolve skills root' };
        }
    });
    electron_1.ipcMain.handle('skills:autoRoutingPrompt', () => {
        try {
            const prompt = getSkillManager().buildAutoRoutingPrompt();
            return { success: true, prompt };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to build auto-routing prompt' };
        }
    });
    electron_1.ipcMain.handle('skills:getConfig', (_event, skillId) => {
        return getSkillManager().getSkillConfig(skillId);
    });
    electron_1.ipcMain.handle('skills:setConfig', (_event, skillId, config) => {
        return getSkillManager().setSkillConfig(skillId, config);
    });
    electron_1.ipcMain.handle('skills:getEmailAccountsConfig', (_event, skillId) => {
        return getSkillManager().getEmailAccountsConfig(skillId);
    });
    electron_1.ipcMain.handle('skills:setEmailAccountsConfig', (_event, skillId, config) => {
        return getSkillManager().setEmailAccountsConfig(skillId, config);
    });
    electron_1.ipcMain.handle('skills:testEmailAccountConnectivity', async (_event, skillId, account) => {
        return getSkillManager().testEmailAccountConnectivity(skillId, account);
    });
    electron_1.ipcMain.handle('skills:testEmailConnectivity', async (_event, skillId, config) => {
        return getSkillManager().testEmailConnectivity(skillId, config);
    });
    electron_1.ipcMain.handle('skills:fetchMarketplace', async () => {
        const url = getSkillStoreUrl();
        console.log(`[SkillMarketplace] fetching from: ${url}`);
        try {
            const https = await Promise.resolve().then(() => __importStar(require('https')));
            const data = await new Promise((resolve, reject) => {
                const req = https.get(url, { timeout: 10000 }, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        res.resume();
                        return;
                    }
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { body += chunk; });
                    res.on('end', () => resolve(body));
                    res.on('error', reject);
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
            });
            return { success: true, data };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch skill marketplace' };
        }
    });
    electron_1.ipcMain.handle('skills:detectFromOpenClaw', async () => {
        try {
            const adapter = getOpenClawRuntimeAdapter();
            if (!adapter) {
                return { skills: [], error: 'The engine is not running' };
            }
            await adapter.connectGatewayIfNeeded();
            const client = adapter.getGatewayClient();
            if (!client) {
                return { skills: [], error: 'Gateway client not connected' };
            }
            const report = await client.request('skills.status', {}, { timeoutMs: 10_000 });
            const sm = getSkillManager();
            (0, skills_1.updatePluginSkillIdsFromReport)(sm, report);
            return sm.detectSkillsFromOpenClaw(report);
        }
        catch (error) {
            return { skills: [], error: error instanceof Error ? error.message : 'Detection failed' };
        }
    });
    electron_1.ipcMain.handle('skills:syncFromOpenClaw', async () => {
        try {
            const adapter = getOpenClawRuntimeAdapter();
            if (!adapter) {
                return { synced: [], error: 'The engine is not running' };
            }
            await adapter.connectGatewayIfNeeded();
            const client = adapter.getGatewayClient();
            if (!client) {
                return { synced: [], error: 'Gateway client not connected' };
            }
            const report = await client.request('skills.status', {}, { timeoutMs: 10_000 });
            const sm = getSkillManager();
            (0, skills_1.updatePluginSkillIdsFromReport)(sm, report);
            return sm.syncSkillsFromOpenClaw(report);
        }
        catch (error) {
            return { synced: [], error: error instanceof Error ? error.message : 'Sync failed' };
        }
    });
    electron_1.ipcMain.handle('skills:refreshPluginSkillIds', async () => {
        try {
            const adapter = getOpenClawRuntimeAdapter();
            if (!adapter) {
                return { success: false, error: 'The engine is not running' };
            }
            await adapter.connectGatewayIfNeeded();
            const client = adapter.getGatewayClient();
            if (!client) {
                return { success: false, error: 'Gateway client not connected' };
            }
            const report = await client.request('skills.status', {}, { timeoutMs: 10_000 });
            const sm = getSkillManager();
            (0, skills_1.updatePluginSkillIdsFromReport)(sm, report);
            return { success: true, pluginSkillIds: [...sm.getPluginSkillIds()] };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Refresh failed' };
        }
    });
}
//# sourceMappingURL=handlers.js.map
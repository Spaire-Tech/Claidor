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
exports.registerKitHandlers = registerKitHandlers;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const extract_zip_1 = __importDefault(require("extract-zip"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../../shared/computerUse/constants");
const constants_2 = require("../../../shared/kit/constants");
const computerUseKit_1 = require("../../computerUse/computerUseKit");
const computerUseRuntime_1 = require("../../computerUse/computerUseRuntime");
const fsCompat_1 = require("../../fsCompat");
const openclawConfigImpact_1 = require("../../libs/openclawConfigImpact");
const skinPackKitLifecycle_1 = require("../../skins/skinPackKitLifecycle");
const KITS_INSTALLED_KEY = constants_2.KitStoreKey.Installed;
const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_FILE_NAME = 'SKILL.md';
function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https_1.default : http_1.default;
        const req = mod.get(url, { timeout: 60000 }, (res) => {
            // Follow redirects
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadBuffer(res.headers.location).then(resolve, reject);
                res.resume();
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Download failed (HTTP ${res.statusCode})`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    });
}
function sha256Buffer(buffer) {
    return crypto_1.default.createHash('sha256').update(buffer).digest('hex');
}
const normalizeCapabilityList = (value) => (Array.isArray(value) ? value : []);
const normalizeLocalizedText = (value) => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const record = value;
    const en = typeof record.en === 'string' ? record.en.trim() : '';
    const zh = typeof record.zh === 'string' ? record.zh.trim() : '';
    if (!en && !zh)
        return undefined;
    return {
        en: en || zh,
        zh: zh || en,
    };
};
const normalizeKitSkillMetadataList = (value) => {
    const metadata = new Map();
    if (!Array.isArray(value))
        return metadata;
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const record = item;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        if (!id)
            continue;
        const name = normalizeLocalizedText(record.name);
        const description = normalizeLocalizedText(record.description);
        metadata.set(id, {
            id,
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
        });
    }
    return metadata;
};
function getSkillsRoot() {
    return path_1.default.resolve(electron_1.app.getPath('userData'), SKILLS_DIR_NAME);
}
function ensureSkillsRoot() {
    const root = getSkillsRoot();
    if (!fs_1.default.existsSync(root)) {
        fs_1.default.mkdirSync(root, { recursive: true });
    }
    return root;
}
function normalizeFolderName(name) {
    return name.replace(/[^a-zA-Z0-9_\-\.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'skill';
}
function normalizeWindowsAttrs(targetDir) {
    if (process.platform !== 'win32')
        return;
    const { spawnSync } = require('child_process');
    const escapedPath = targetDir.replace(/"/g, '""');
    spawnSync('cmd.exe', ['/d', '/s', '/c', `attrib -r -s -h "${escapedPath}" /s /d`], {
        stdio: 'pipe',
        windowsHide: true,
        timeout: 10000,
    });
}
function collectSkillDirs(source) {
    const resolved = path_1.default.resolve(source);
    // Direct SKILL.md at root
    if (fs_1.default.existsSync(path_1.default.join(resolved, SKILL_FILE_NAME))) {
        return [resolved];
    }
    // Check skills/ subdirectory
    const nestedRoot = path_1.default.join(resolved, 'skills');
    if (fs_1.default.existsSync(nestedRoot) && fs_1.default.statSync(nestedRoot).isDirectory()) {
        const dirs = listSkillDirs(nestedRoot);
        if (dirs.length > 0)
            return dirs;
    }
    // Check SKILLs/ subdirectory
    const nestedRoot2 = path_1.default.join(resolved, SKILLS_DIR_NAME);
    if (fs_1.default.existsSync(nestedRoot2) && fs_1.default.statSync(nestedRoot2).isDirectory()) {
        const dirs = listSkillDirs(nestedRoot2);
        if (dirs.length > 0)
            return dirs;
    }
    // Direct children
    return listSkillDirs(resolved);
}
function listSkillDirs(root) {
    if (!fs_1.default.existsSync(root))
        return [];
    return fs_1.default.readdirSync(root)
        .sort((a, b) => a.localeCompare(b))
        .map(entry => path_1.default.join(root, entry))
        .filter(entryPath => {
        try {
            return fs_1.default.statSync(entryPath).isDirectory()
                && fs_1.default.existsSync(path_1.default.join(entryPath, SKILL_FILE_NAME));
        }
        catch {
            return false;
        }
    });
}
function notifySkillsChanged() {
    electron_1.BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('skills:changed');
        }
    });
}
function registerKitHandlers(deps) {
    const { getStore, getKitStoreUrl, getSkillManager, syncOpenClawConfig } = deps;
    const skinPackKitLifecycle = (0, skinPackKitLifecycle_1.createSkinPackKitLifecycle)({
        getStore,
        getSkillManager,
        notifySkillsChanged,
        syncOpenClawConfig,
    });
    const getAdditionalBuiltInKits = () => ((0, computerUseKit_1.isComputerUseKitSupportedPlatform)() ? [(0, computerUseKit_1.buildComputerUseMarketplaceKit)()] : []);
    // Fetch kit store catalog from overmind
    electron_1.ipcMain.handle('kits:fetchStore', async () => {
        const url = getKitStoreUrl();
        console.log(`[KitStore] fetching from: ${url}`);
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
            return {
                success: true,
                data: skinPackKitLifecycle.appendToStoreResponse(data, getAdditionalBuiltInKits()),
            };
        }
        catch (error) {
            console.error('[KitStore] fetch failed:', error);
            return {
                success: true,
                data: skinPackKitLifecycle.buildOfflineStoreResponse(getAdditionalBuiltInKits()),
                warning: error instanceof Error ? error.message : 'Failed to fetch kit store',
            };
        }
    });
    // List installed kits
    electron_1.ipcMain.handle('kits:listInstalled', () => {
        try {
            const map = getStore().get(KITS_INSTALLED_KEY) ?? {};
            return { success: true, installed: map };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to list installed kits' };
        }
    });
    // Install a kit
    electron_1.ipcMain.handle('kits:install', async (_event, params) => {
        const { kitId, bundleUrl, version, skillListIds: _skillListIds } = params;
        const isComputerUseKit = kitId === constants_1.ComputerUseKitId.BuiltIn;
        console.log(`[KitStore] Installing kit "${kitId}" v${version} from ${bundleUrl}`);
        let tempRoot = null;
        let skillWatchingStopped = false;
        let skillWatchingRestarted = false;
        try {
            if (isComputerUseKit && bundleUrl !== constants_1.ComputerUseKitBundle.BuiltIn) {
                throw new Error('Computer Use kit bundle URL does not match the built-in catalog entry');
            }
            if (isComputerUseKit && !(0, computerUseKit_1.isComputerUseKitSupportedPlatform)()) {
                throw new Error('Computer Use kit is only available on Windows x64.');
            }
            const skinPackInstallResult = await skinPackKitLifecycle.installIfHandled({ kitId, bundleUrl });
            if (skinPackInstallResult !== undefined) {
                return skinPackInstallResult;
            }
            // 1. Download zip
            tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-kit-'));
            const buffer = await downloadBuffer(bundleUrl);
            if (isComputerUseKit) {
                if (buffer.length !== constants_1.ComputerUseKitBundleIntegrity.SizeBytes) {
                    throw new Error('Computer Use kit bundle size verification failed');
                }
                if (sha256Buffer(buffer) !== constants_1.ComputerUseKitBundleIntegrity.Sha256) {
                    throw new Error('Computer Use kit bundle checksum verification failed');
                }
            }
            const zipPath = path_1.default.join(tempRoot, 'kit-bundle.zip');
            const extractRoot = path_1.default.join(tempRoot, 'extracted');
            fs_1.default.writeFileSync(zipPath, buffer);
            fs_1.default.mkdirSync(extractRoot, { recursive: true });
            // 2. Extract
            await (0, extract_zip_1.default)(zipPath, { dir: extractRoot });
            // Handle single-directory wrapper (e.g. zip contains one root folder)
            let sourceRoot = extractRoot;
            const extractedEntries = fs_1.default.readdirSync(extractRoot)
                .map(entry => path_1.default.join(extractRoot, entry))
                .filter(p => { try {
                return fs_1.default.statSync(p).isDirectory();
            }
            catch {
                return false;
            } });
            if (extractedEntries.length === 1) {
                sourceRoot = extractedEntries[0];
            }
            // 3. Discover skill directories
            const skillDirs = collectSkillDirs(sourceRoot);
            if (skillDirs.length === 0) {
                throw new Error('No skills found in kit bundle (no SKILL.md detected)');
            }
            if (isComputerUseKit) {
                const runtimeResult = await (0, computerUseRuntime_1.installComputerUseRuntime)();
                if (!runtimeResult.success) {
                    throw new Error(runtimeResult.error || 'Computer Use runtime installation failed');
                }
            }
            const skillManager = getSkillManager();
            skillManager.stopWatching();
            skillWatchingStopped = true;
            if (isComputerUseKit) {
                (0, computerUseKit_1.removeComputerUseSkillArtifacts)(getStore());
            }
            // 4. Copy skills to user SKILLs directory
            const root = ensureSkillsRoot();
            const installedSkillIds = [];
            const installedSkillMetadata = {};
            const sourceSkillMetadata = normalizeKitSkillMetadataList(params.skillList);
            for (const skillDir of skillDirs) {
                const folderName = normalizeFolderName(path_1.default.basename(skillDir));
                let targetDir = path_1.default.resolve(root, folderName);
                let suffix = 1;
                while (fs_1.default.existsSync(targetDir)) {
                    targetDir = path_1.default.resolve(root, `${folderName}-${suffix}`);
                    suffix += 1;
                }
                (0, fsCompat_1.cpRecursiveSync)(skillDir, targetDir);
                normalizeWindowsAttrs(targetDir);
                const installedSkillId = path_1.default.basename(targetDir);
                installedSkillIds.push(installedSkillId);
                const sourceSkillId = path_1.default.basename(skillDir);
                const metadata = sourceSkillMetadata.get(sourceSkillId) ?? sourceSkillMetadata.get(folderName);
                if (metadata?.name || metadata?.description) {
                    installedSkillMetadata[installedSkillId] = {
                        id: installedSkillId,
                        ...(metadata.name ? { name: metadata.name } : {}),
                        ...(metadata.description ? { description: metadata.description } : {}),
                    };
                }
            }
            // 5. Enable installed skills
            const stateMap = getStore().get('skills_state') ?? {};
            for (const skillId of installedSkillIds) {
                stateMap[skillId] = { enabled: true };
            }
            getStore().set('skills_state', stateMap);
            // 6. Persist kit installation record
            const installedMap = (0, computerUseKit_1.getInstalledKitsMap)(getStore());
            installedMap[kitId] = isComputerUseKit
                ? (0, computerUseKit_1.buildInstalledComputerUseKitRecord)(installedSkillIds, installedSkillMetadata)
                : {
                    id: kitId,
                    version,
                    installedAt: Date.now(),
                    skills: installedSkillIds.length > 0
                        ? {
                            skillIds: installedSkillIds,
                            ...(Object.keys(installedSkillMetadata).length > 0 ? { metadata: installedSkillMetadata } : {}),
                        }
                        : null,
                    mcpServers: normalizeCapabilityList(params.mcpServers),
                    connectors: normalizeCapabilityList(params.connectors),
                };
            getStore().set(KITS_INSTALLED_KEY, installedMap);
            if (isComputerUseKit) {
                const syncResult = await syncOpenClawConfig({
                    reason: 'computer-use-kit-installed',
                    restartGatewayIfRunning: true,
                    expectedImpact: openclawConfigImpact_1.OpenClawConfigImpact.Restart,
                });
                if (!syncResult.success) {
                    throw new Error(syncResult.error || 'Engine config sync failed after Computer Use install');
                }
            }
            // 7. Notify after all installation work and Computer Use config sync are complete.
            skillManager.startWatching();
            skillWatchingRestarted = true;
            notifySkillsChanged();
            console.log(`[KitStore] Kit "${kitId}" installed successfully with skills: ${installedSkillIds.join(', ')}`);
            return { success: true, skillIds: installedSkillIds };
        }
        catch (error) {
            console.error(`[KitStore] Install failed for kit "${kitId}":`, error);
            return { success: false, error: error instanceof Error ? error.message : 'Kit installation failed' };
        }
        finally {
            // Cleanup temp
            if (tempRoot) {
                try {
                    fs_1.default.rmSync(tempRoot, { recursive: true, force: true });
                }
                catch { /* ignore cleanup errors */ }
            }
            if (skillWatchingStopped && !skillWatchingRestarted) {
                try {
                    getSkillManager().startWatching();
                }
                catch (error) {
                    console.warn('[KitStore] failed to restart skill watcher after install:', error);
                }
            }
        }
    });
    // Uninstall a kit
    electron_1.ipcMain.handle('kits:uninstall', async (_event, kitId) => {
        console.log(`[KitStore] Uninstalling kit "${kitId}"`);
        let skillWatchingStopped = false;
        let skillWatchingRestarted = false;
        try {
            const skinPackUninstallResult = await skinPackKitLifecycle.uninstallIfHandled(kitId);
            if (skinPackUninstallResult !== undefined) {
                return skinPackUninstallResult;
            }
            const installedMap = (0, computerUseKit_1.getInstalledKitsMap)(getStore());
            const kitRecord = installedMap[kitId];
            if (!kitRecord) {
                return { success: false, error: `Kit "${kitId}" is not installed` };
            }
            const skillManager = getSkillManager();
            skillManager.stopWatching();
            skillWatchingStopped = true;
            // Delete skill directories
            const root = getSkillsRoot();
            const stateMap = getStore().get('skills_state') ?? {};
            for (const skillId of kitRecord.skills?.skillIds ?? []) {
                const skillDir = path_1.default.resolve(root, skillId);
                if (fs_1.default.existsSync(skillDir)) {
                    try {
                        fs_1.default.rmSync(skillDir, { recursive: true, force: true });
                    }
                    catch (err) {
                        console.warn(`[KitStore] Failed to delete skill dir "${skillId}":`, err);
                    }
                }
                delete stateMap[skillId];
            }
            // Update skills state
            getStore().set('skills_state', stateMap);
            // Remove kit record
            delete installedMap[kitId];
            getStore().set(KITS_INSTALLED_KEY, installedMap);
            if (kitId === constants_1.ComputerUseKitId.BuiltIn) {
                (0, computerUseKit_1.removeComputerUseSkillArtifacts)(getStore());
                await (0, computerUseRuntime_1.uninstallComputerUseRuntime)();
                const syncResult = await syncOpenClawConfig({
                    reason: 'computer-use-kit-uninstalled',
                    restartGatewayIfRunning: true,
                    expectedImpact: openclawConfigImpact_1.OpenClawConfigImpact.Restart,
                });
                if (!syncResult.success) {
                    throw new Error(syncResult.error || 'Engine config sync failed after Computer Use uninstall');
                }
            }
            // Notify
            skillManager.startWatching();
            skillWatchingRestarted = true;
            notifySkillsChanged();
            console.log(`[KitStore] Kit "${kitId}" uninstalled successfully`);
            return { success: true };
        }
        catch (error) {
            console.error(`[KitStore] Uninstall failed for kit "${kitId}":`, error);
            return { success: false, error: error instanceof Error ? error.message : 'Kit uninstallation failed' };
        }
        finally {
            if (skillWatchingStopped && !skillWatchingRestarted) {
                try {
                    getSkillManager().startWatching();
                }
                catch (error) {
                    console.warn('[KitStore] failed to restart skill watcher after uninstall:', error);
                }
            }
        }
    });
}
//# sourceMappingURL=handlers.js.map
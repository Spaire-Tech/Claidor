"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishStagedPluginDirectory = exports.cleanupPluginInstallStagingDir = exports.createPluginInstallStagingDir = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PLUGIN_INSTALL_STAGING_DIR = 'plugin-install-staging';
const pathExists = async (targetPath) => {
    try {
        await fs_1.default.promises.lstat(targetPath);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
};
const readPluginManifestId = async (pluginDir) => {
    try {
        const raw = await fs_1.default.promises.readFile(path_1.default.join(pluginDir, 'openclaw.plugin.json'), 'utf8');
        const manifest = JSON.parse(raw);
        return typeof manifest.id === 'string' && manifest.id.trim() ? manifest.id.trim() : null;
    }
    catch {
        return null;
    }
};
const getPluginInstallStagingRoot = (extensionsDir) => (path_1.default.join(path_1.default.dirname(extensionsDir), PLUGIN_INSTALL_STAGING_DIR));
const createPluginInstallStagingDir = (extensionsDir) => {
    const stagingRoot = getPluginInstallStagingRoot(extensionsDir);
    fs_1.default.mkdirSync(stagingRoot, { recursive: true });
    return fs_1.default.mkdtempSync(path_1.default.join(stagingRoot, 'install-'));
};
exports.createPluginInstallStagingDir = createPluginInstallStagingDir;
const cleanupPluginInstallStagingDir = async (stagingDir) => {
    await fs_1.default.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => { });
    await fs_1.default.promises.rmdir(path_1.default.dirname(stagingDir)).catch(() => { });
};
exports.cleanupPluginInstallStagingDir = cleanupPluginInstallStagingDir;
/**
 * Publish a plugin without copying its dependency junctions/symlinks.
 *
 * The OpenClaw installer creates peer dependency links inside node_modules.
 * Because the staging directory is on the same volume as the extensions
 * directory, rename preserves those links without requiring Windows symlink
 * privileges. Existing valid plugins are restored if the swap fails, while
 * incomplete directories are discarded so they cannot break gateway startup.
 */
const publishStagedPluginDirectory = async (stagedPluginDir, targetPluginDir, expectedPluginId) => {
    const stagedManifestId = await readPluginManifestId(stagedPluginDir);
    if (stagedManifestId !== expectedPluginId) {
        throw new Error(`Installed plugin manifest mismatch: expected "${expectedPluginId}", found "${stagedManifestId || 'missing'}"`);
    }
    const extensionsDir = path_1.default.dirname(targetPluginDir);
    const stagingRoot = getPluginInstallStagingRoot(extensionsDir);
    await fs_1.default.promises.mkdir(extensionsDir, { recursive: true });
    await fs_1.default.promises.mkdir(stagingRoot, { recursive: true });
    let backupPath = null;
    let restorePreviousOnFailure = false;
    if (await pathExists(targetPluginDir)) {
        restorePreviousOnFailure = await readPluginManifestId(targetPluginDir) !== null;
        backupPath = path_1.default.join(stagingRoot, `backup-${path_1.default.basename(targetPluginDir)}-${(0, crypto_1.randomUUID)()}`);
        await fs_1.default.promises.rename(targetPluginDir, backupPath);
    }
    try {
        await fs_1.default.promises.rename(stagedPluginDir, targetPluginDir);
    }
    catch (publishError) {
        if (backupPath) {
            if (restorePreviousOnFailure) {
                try {
                    await fs_1.default.promises.rename(backupPath, targetPluginDir);
                    backupPath = null;
                }
                catch (rollbackError) {
                    const publishMessage = publishError instanceof Error ? publishError.message : String(publishError);
                    const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                    throw new Error(`Failed to publish plugin (${publishMessage}) and restore the previous version (${rollbackMessage}); `
                        + `previous plugin preserved at ${backupPath}`);
                }
            }
            else {
                await fs_1.default.promises.rm(backupPath, { recursive: true, force: true }).catch(() => { });
                backupPath = null;
            }
        }
        throw publishError;
    }
    if (backupPath) {
        try {
            await fs_1.default.promises.rm(backupPath, { recursive: true, force: true });
        }
        catch (error) {
            console.warn(`[PluginManager] Failed to remove plugin install backup at ${backupPath}.`, error);
        }
    }
};
exports.publishStagedPluginDirectory = publishStagedPluginDirectory;
//# sourceMappingURL=pluginInstallPublisher.js.map
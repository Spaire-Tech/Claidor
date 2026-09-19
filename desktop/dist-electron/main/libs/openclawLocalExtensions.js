"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupStaleThirdPartyPluginsFromBundledDir = exports.findThirdPartyExtensionsDir = exports.hasBundledOpenClawExtension = exports.resolveOpenClawExtensionPluginId = exports.listAvailableOpenClawExtensionManifests = exports.listBundledOpenClawExtensionManifests = exports.listBundledOpenClawExtensionIds = exports.listLocalOpenClawExtensionManifests = exports.listLocalOpenClawExtensionIds = exports.syncLocalOpenClawExtensionsIntoRuntime = exports.hasRuntimeBundledOpenClawExtension = exports.findRuntimeBundledExtensionsDir = exports.findBundledExtensionsDir = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOCAL_EXTENSIONS_DIR = 'openclaw-extensions';
const THIRD_PARTY_EXTENSIONS_DIR = 'third-party-extensions';
const readExtensionManifest = (baseDir, directoryId, source) => {
    const directory = path_1.default.join(baseDir, directoryId);
    const manifestPath = path_1.default.join(directory, 'openclaw.plugin.json');
    try {
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf8'));
        const pluginId = typeof manifest.id === 'string' ? manifest.id.trim() : '';
        if (!pluginId) {
            return null;
        }
        return {
            directoryId,
            pluginId,
            directory,
            manifestPath,
            source,
        };
    }
    catch {
        return null;
    }
};
const listExtensionManifests = (extensionsDir, source) => {
    if (!extensionsDir) {
        return [];
    }
    try {
        return fs_1.default.readdirSync(extensionsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => readExtensionManifest(extensionsDir, entry.name, source))
            .filter((entry) => entry !== null);
    }
    catch {
        return [];
    }
};
const findLocalExtensionsSourceDir = () => {
    if (electron_1.app.isPackaged) {
        return null;
    }
    const candidates = [
        path_1.default.join(electron_1.app.getAppPath(), LOCAL_EXTENSIONS_DIR),
        path_1.default.join(process.cwd(), LOCAL_EXTENSIONS_DIR),
    ];
    for (const candidate of candidates) {
        try {
            if (fs_1.default.statSync(candidate).isDirectory()) {
                return candidate;
            }
        }
        catch {
            // Ignore missing candidates.
        }
    }
    return null;
};
const listRuntimeRootCandidates = () => (electron_1.app.isPackaged
    ? [path_1.default.join(process.resourcesPath, 'cfmind')]
    : [
        path_1.default.join(electron_1.app.getAppPath(), 'vendor', 'openclaw-runtime', 'current'),
        path_1.default.join(process.cwd(), 'vendor', 'openclaw-runtime', 'current'),
    ]);
const firstExistingDir = (candidates) => {
    for (const candidate of candidates) {
        try {
            if (fs_1.default.statSync(candidate).isDirectory()) {
                return candidate;
            }
        }
        catch {
            // Ignore missing candidates.
        }
    }
    return null;
};
const findBundledExtensionsDir = () => (firstExistingDir(listRuntimeRootCandidates().map(root => path_1.default.join(root, THIRD_PARTY_EXTENSIONS_DIR))));
exports.findBundledExtensionsDir = findBundledExtensionsDir;
/**
 * Directory of OpenClaw's own runtime-bundled extensions (dist/extensions/…),
 * as opposed to the third-party dir above which holds LobsterAI-synced local
 * plugins. Bundled extensions surviving prune-openclaw-runtime.cjs live here.
 */
const findRuntimeBundledExtensionsDir = () => (firstExistingDir(listRuntimeRootCandidates().map(root => path_1.default.join(root, 'dist', 'extensions'))));
exports.findRuntimeBundledExtensionsDir = findRuntimeBundledExtensionsDir;
const hasRuntimeBundledOpenClawExtension = (extensionId) => {
    const dir = (0, exports.findRuntimeBundledExtensionsDir)();
    if (!dir) {
        return false;
    }
    return fs_1.default.existsSync(path_1.default.join(dir, extensionId, 'openclaw.plugin.json'));
};
exports.hasRuntimeBundledOpenClawExtension = hasRuntimeBundledOpenClawExtension;
const syncLocalOpenClawExtensionsIntoRuntime = (runtimeRoot) => {
    const sourceDir = findLocalExtensionsSourceDir();
    if (!sourceDir) {
        return { sourceDir: null, copied: [] };
    }
    const targetExtensionsDir = path_1.default.join(runtimeRoot, THIRD_PARTY_EXTENSIONS_DIR);
    try {
        if (!fs_1.default.statSync(targetExtensionsDir).isDirectory()) {
            return { sourceDir, copied: [] };
        }
    }
    catch {
        return { sourceDir, copied: [] };
    }
    const copied = [];
    for (const entry of fs_1.default.readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            continue;
        }
        fs_1.default.cpSync(path_1.default.join(sourceDir, entry.name), path_1.default.join(targetExtensionsDir, entry.name), { recursive: true, force: true });
        copied.push(entry.name);
    }
    return { sourceDir, copied };
};
exports.syncLocalOpenClawExtensionsIntoRuntime = syncLocalOpenClawExtensionsIntoRuntime;
const listLocalOpenClawExtensionIds = () => {
    const sourceDir = findLocalExtensionsSourceDir();
    if (!sourceDir) {
        return [];
    }
    try {
        return fs_1.default.readdirSync(sourceDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .filter((entry) => fs_1.default.existsSync(path_1.default.join(sourceDir, entry.name, 'openclaw.plugin.json')))
            .map((entry) => entry.name);
    }
    catch {
        return [];
    }
};
exports.listLocalOpenClawExtensionIds = listLocalOpenClawExtensionIds;
const listLocalOpenClawExtensionManifests = () => (listExtensionManifests(findLocalExtensionsSourceDir(), 'local'));
exports.listLocalOpenClawExtensionManifests = listLocalOpenClawExtensionManifests;
const listBundledOpenClawExtensionIds = () => {
    const extensionsDir = (0, exports.findBundledExtensionsDir)();
    if (!extensionsDir) {
        return [];
    }
    try {
        return fs_1.default.readdirSync(extensionsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .filter((entry) => fs_1.default.existsSync(path_1.default.join(extensionsDir, entry.name, 'openclaw.plugin.json')))
            .map((entry) => entry.name);
    }
    catch {
        return [];
    }
};
exports.listBundledOpenClawExtensionIds = listBundledOpenClawExtensionIds;
const listBundledOpenClawExtensionManifests = () => (listExtensionManifests((0, exports.findBundledExtensionsDir)(), 'bundled'));
exports.listBundledOpenClawExtensionManifests = listBundledOpenClawExtensionManifests;
const listAvailableOpenClawExtensionManifests = () => [
    ...(0, exports.listBundledOpenClawExtensionManifests)(),
    ...(0, exports.listLocalOpenClawExtensionManifests)(),
];
exports.listAvailableOpenClawExtensionManifests = listAvailableOpenClawExtensionManifests;
const resolveOpenClawExtensionPluginId = (extensionId) => {
    const normalized = extensionId.trim();
    if (!normalized) {
        return null;
    }
    const manifest = (0, exports.listAvailableOpenClawExtensionManifests)()
        .find((entry) => entry.directoryId === normalized || entry.pluginId === normalized);
    return manifest?.pluginId ?? null;
};
exports.resolveOpenClawExtensionPluginId = resolveOpenClawExtensionPluginId;
const hasBundledOpenClawExtension = (extensionId) => {
    return (0, exports.resolveOpenClawExtensionPluginId)(extensionId) !== null;
};
exports.hasBundledOpenClawExtension = hasBundledOpenClawExtension;
/**
 * Returns the absolute path to the third-party plugins directory.
 *
 * Third-party plugins (declared in package.json openclaw.plugins) are placed
 * in a separate `extensions/` directory — NOT in `dist/extensions/` which is
 * reserved for runtime-bundled plugins that satisfy the bundled-channel-entry
 * contract.  The gateway discovers these via `plugins.load.paths`.
 *
 * The directory is located under userData so that user-installed plugins
 * persist across application upgrades / reinstalls.
 */
const findThirdPartyExtensionsDir = () => {
    const dir = path_1.default.join(electron_1.app.getPath('userData'), THIRD_PARTY_EXTENSIONS_DIR);
    try {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    catch {
        return null;
    }
    return dir;
};
exports.findThirdPartyExtensionsDir = findThirdPartyExtensionsDir;
/**
 * Remove third-party plugins that may linger in directories scanned by the
 * gateway's bundled-channel metadata loader.  Two locations are cleaned:
 *
 * 1. `dist/extensions/{id}` — legacy overlay installs placed plugins here.
 * 2. `extensions/{id}` — prior versions of LobsterAI installed plugins here.
 *    Because gateway-bundle.mjs runs from the package root (not dist/),
 *    `RUNNING_FROM_BUILT_ARTIFACT` is false and `resolveBundledPluginScanDir`
 *    falls back to `extensions/`.  Third-party plugins there fail the
 *    bundled-channel-entry contract check and waste startup time.
 */
const cleanupStaleThirdPartyPluginsFromBundledDir = (runtimeRoot, thirdPartyPluginIds) => {
    const staleDirs = [
        path_1.default.join(runtimeRoot, 'dist', 'extensions'),
        path_1.default.join(runtimeRoot, 'extensions'),
    ];
    const removed = [];
    for (const id of thirdPartyPluginIds) {
        for (const baseDir of staleDirs) {
            const staleDir = path_1.default.join(baseDir, id);
            try {
                if (fs_1.default.statSync(staleDir).isDirectory()) {
                    fs_1.default.rmSync(staleDir, { recursive: true, force: true });
                    removed.push(id);
                }
            }
            catch {
                // Directory doesn't exist or can't be accessed — nothing to clean up.
            }
        }
    }
    return removed;
};
exports.cleanupStaleThirdPartyPluginsFromBundledDir = cleanupStaleThirdPartyPluginsFromBundledDir;
//# sourceMappingURL=openclawLocalExtensions.js.map
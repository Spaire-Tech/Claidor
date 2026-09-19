"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__pluginManagerTestUtils = exports.PluginManager = void 0;
exports.isHiddenUserPluginId = isHiddenUserPluginId;
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const nodeRuntime_1 = require("../libs/nodeRuntime");
const openclawLocalExtensions_1 = require("../libs/openclawLocalExtensions");
const pluginInstallPublisher_1 = require("./pluginInstallPublisher");
function getOpenClawMjsPath() {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, 'cfmind', 'openclaw.mjs');
    }
    return path_1.default.join(electron_1.app.getAppPath(), 'vendor', 'openclaw-runtime', 'current', 'openclaw.mjs');
}
function getExtensionsDir() {
    return (0, openclawLocalExtensions_1.findThirdPartyExtensionsDir)();
}
/** OpenClaw's own extensions directory (CONFIG_DIR/extensions) where its UI/CLI installs plugins. */
function getOpenClawStateExtensionsDir() {
    const dir = path_1.default.join(electron_1.app.getPath('userData'), 'openclaw', 'state', 'extensions');
    try {
        if (fs_1.default.statSync(dir).isDirectory())
            return dir;
    }
    catch {
        // directory doesn't exist
    }
    return null;
}
function readPluginManifest(pluginDir) {
    const manifestPath = path_1.default.join(pluginDir, 'openclaw.plugin.json');
    try {
        return JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf8'));
    }
    catch {
        return null;
    }
}
function readPluginVersion(pluginDir) {
    const pkgPath = path_1.default.join(pluginDir, 'package.json');
    try {
        const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf8'));
        return pkg.version || undefined;
    }
    catch {
        return undefined;
    }
}
function runAsync(command, args, opts) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: opts.cwd || process.cwd(),
            env: opts.env || process.env,
            shell: opts.shell || false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            if (opts.onLog)
                opts.onLog(text);
        });
        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            if (opts.onLog)
                opts.onLog(text);
        });
        const timer = opts.timeout
            ? setTimeout(() => { child.kill(); reject(new Error('Process timed out')); }, opts.timeout)
            : null;
        child.on('close', (code) => {
            if (timer)
                clearTimeout(timer);
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
        child.on('error', (err) => {
            if (timer)
                clearTimeout(timer);
            reject(err);
        });
    });
}
/** Resolve npm command and base args, preferring the bundled npm-cli.js. */
function resolveNpmCommand() {
    return (0, nodeRuntime_1.resolveNodePackageCliCommand)('npm');
}
/** Humanize a camelCase/snake_case key into a label */
function humanizeKey(key) {
    return key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
/**
 * Walk a JSON Schema `properties` tree and generate uiHint entries for any
 * property that doesn't already have one.  Produces dot-separated paths
 * (e.g. "embedding.apiKey") that SchemaForm expects.
 */
function generateHintsFromSchema(schema, existingHints, prefix = '') {
    const hints = { ...existingHints };
    const properties = (schema.properties ?? schema);
    for (const [key, prop] of Object.entries(properties)) {
        if (!prop || typeof prop !== 'object')
            continue;
        const dotPath = prefix ? `${prefix}.${key}` : key;
        if (prop.type === 'object' && prop.properties) {
            // Add a group hint if missing
            if (!hints[dotPath]) {
                hints[dotPath] = { label: humanizeKey(key) };
            }
            // Recurse into nested object properties
            const nested = generateHintsFromSchema(prop, hints, dotPath);
            Object.assign(hints, nested);
        }
        else if (prop.type && prop.type !== 'object') {
            // Leaf property — add hint if missing
            if (!hints[dotPath]) {
                const isSensitive = /key|secret|token|password/i.test(key);
                hints[dotPath] = {
                    label: humanizeKey(key),
                    ...(isSensitive ? { sensitive: true } : {}),
                    ...(typeof prop.default !== 'undefined' ? { placeholder: String(prop.default) } : {}),
                };
            }
        }
    }
    return hints;
}
class PluginManager {
    store;
    constructor(store) {
        this.store = store;
    }
    async listPlugins() {
        const hiddenIds = getHiddenPluginIds();
        const userPlugins = this.store.listUserPlugins();
        const dirsToSearch = [
            getExtensionsDir(),
            getOpenClawStateExtensionsDir(),
        ].filter((d) => d !== null);
        const items = [];
        for (const plugin of userPlugins) {
            if (isHiddenPlugin(plugin.pluginId, hiddenIds))
                continue;
            let description;
            let version = plugin.version;
            let hasConfig = false;
            for (const dir of dirsToSearch) {
                const pluginDir = path_1.default.join(dir, plugin.pluginId);
                const manifest = readPluginManifest(pluginDir);
                if (manifest) {
                    description = manifest.description || manifest.name;
                    hasConfig = !!(manifest.configSchema
                        && typeof manifest.configSchema === 'object'
                        && manifest.configSchema.properties
                        && Object.keys(manifest.configSchema.properties).length > 0);
                    if (!version) {
                        version = readPluginVersion(pluginDir);
                    }
                    break;
                }
            }
            items.push({
                pluginId: plugin.pluginId,
                version,
                description,
                source: plugin.source,
                enabled: plugin.enabled,
                canUninstall: true,
                hasConfig,
            });
        }
        return items;
    }
    async installPlugin(params, onLog) {
        const extensionsDir = getExtensionsDir();
        if (!extensionsDir) {
            return { ok: false, error: 'Extensions directory not found' };
        }
        const openclawMjs = getOpenClawMjsPath();
        if (!fs_1.default.existsSync(openclawMjs)) {
            return { ok: false, error: `Engine CLI not found at ${openclawMjs}` };
        }
        let stagingDir = null;
        try {
            let installSpec;
            switch (params.source) {
                case 'clawhub':
                    installSpec = `clawhub:${params.spec}`;
                    break;
                case 'npm':
                    onLog?.(`Packing ${params.spec}${params.version ? '@' + params.version : ''} from npm...\n`);
                    installSpec = await this.packNpmPlugin(params, onLog);
                    break;
                case 'git':
                    onLog?.(`Cloning ${params.spec}...\n`);
                    installSpec = await this.packGitPlugin(params, onLog);
                    break;
                case 'local':
                    installSpec = params.spec;
                    break;
                default:
                    return { ok: false, error: `Unknown source: ${params.source}` };
            }
            // Run openclaw plugins install into an isolated staging directory, then
            // atomically publish it to the actual extensions dir. This avoids:
            // 1. EPERM from gateway locking the target directory
            // 2. Recreating OpenClaw peer dependency links during a recursive copy
            // 3. Path mismatch (openclaw creates extensions/ subdir under STATE_DIR)
            stagingDir = (0, pluginInstallPublisher_1.createPluginInstallStagingDir)(extensionsDir);
            onLog?.(`Installing plugin from ${installSpec}...\n`);
            const installEnv = {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1',
                OPENCLAW_STATE_DIR: stagingDir,
            };
            // Pass custom registry to npm (used by openclaw's internal npm install)
            if (params.registry) {
                installEnv.npm_config_registry = params.registry;
            }
            const result = await runAsync(process.execPath, [openclawMjs, 'plugins', 'install', installSpec, '--force'], {
                cwd: stagingDir,
                env: installEnv,
                timeout: 5 * 60 * 1000,
                onLog,
            });
            if (result.code !== 0) {
                return { ok: false, error: result.stderr || `Install exited with code ${result.code}` };
            }
            // Discover the plugin in staging before publishing it to the final location.
            const stagedExtDir = path_1.default.join(stagingDir, 'extensions');
            const pluginId = this.discoverInstalledPluginId(fs_1.default.existsSync(stagedExtDir) ? stagedExtDir : stagingDir, params);
            if (!pluginId) {
                return { ok: false, error: 'Plugin installed but could not determine plugin ID' };
            }
            const stagedPluginDir = path_1.default.join(stagedExtDir, pluginId);
            const targetPluginDir = path_1.default.join(extensionsDir, pluginId);
            // Publish with same-volume renames so OpenClaw peer dependency junctions
            // are preserved without requiring Windows symlink privileges.
            onLog?.(`Publishing ${pluginId} to extensions directory...\n`);
            await (0, pluginInstallPublisher_1.publishStagedPluginDirectory)(stagedPluginDir, targetPluginDir, pluginId);
            onLog?.(`Done.\n`);
            const version = readPluginVersion(targetPluginDir) || params.version;
            // Record in store
            this.store.addUserPlugin({
                pluginId,
                source: params.source,
                spec: params.spec,
                registry: params.registry,
                version,
                enabled: true,
                installedAt: Date.now(),
            });
            onLog?.(`Plugin ${pluginId}@${version || 'unknown'} installed successfully.\n`);
            return { ok: true, pluginId, version };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
        }
        finally {
            if (stagingDir) {
                await (0, pluginInstallPublisher_1.cleanupPluginInstallStagingDir)(stagingDir);
            }
        }
    }
    async uninstallPlugin(pluginId) {
        const extensionsDir = getExtensionsDir();
        if (!extensionsDir) {
            return { ok: false, error: 'Extensions directory not found' };
        }
        const pluginDir = path_1.default.join(extensionsDir, pluginId);
        try {
            if (fs_1.default.existsSync(pluginDir)) {
                await fs_1.default.promises.rm(pluginDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: `Failed to remove plugin directory: ${message}` };
        }
        // Also remove from OpenClaw state extensions dir (plugins installed via Web UI/CLI)
        const stateExtDir = getOpenClawStateExtensionsDir();
        if (stateExtDir) {
            const statePluginDir = path_1.default.join(stateExtDir, pluginId);
            try {
                if (fs_1.default.existsSync(statePluginDir)) {
                    await fs_1.default.promises.rm(statePluginDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
                }
            }
            catch {
                // Best-effort: state dir cleanup failure is non-fatal
            }
        }
        this.store.removeUserPlugin(pluginId);
        removeOpenClawConfigEntry(pluginId);
        return { ok: true };
    }
    setPluginEnabled(pluginId, enabled) {
        this.store.setUserPluginEnabled(pluginId, enabled);
    }
    getPluginConfigSchema(pluginId) {
        const dirsToSearch = [
            getExtensionsDir(),
            getOpenClawStateExtensionsDir(),
        ].filter((d) => d !== null);
        if (dirsToSearch.length === 0)
            return null;
        for (const dir of dirsToSearch) {
            const pluginDir = path_1.default.join(dir, pluginId);
            const manifest = readPluginManifest(pluginDir);
            if (!manifest)
                continue;
            const schemaProps = manifest.configSchema?.properties;
            if (!schemaProps || Object.keys(schemaProps).length === 0) {
                continue;
            }
            const uiHints = manifest.uiHints ?? {};
            // Auto-generate uiHints from configSchema properties when not provided
            const mergedHints = generateHintsFromSchema(manifest.configSchema, uiHints);
            return {
                configSchema: manifest.configSchema,
                uiHints: mergedHints,
            };
        }
        return null;
    }
    getPluginConfig(pluginId) {
        return this.store.getUserPluginConfig(pluginId);
    }
    savePluginConfig(pluginId, config) {
        this.store.setUserPluginConfig(pluginId, config);
    }
    async packNpmPlugin(params, onLog) {
        const tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'lobsterai-plugin-'));
        const spec = params.version ? `${params.spec}@${params.version}` : params.spec;
        const npm = resolveNpmCommand();
        const args = [...npm.baseArgs, 'pack', spec, '--pack-destination', tmpDir];
        if (params.registry) {
            args.push(`--registry=${params.registry}`);
        }
        const result = await runAsync(npm.command, args, {
            cwd: tmpDir,
            env: {
                ...npm.env,
                npm_config_prefer_offline: '',
                npm_config_prefer_online: '',
            },
            timeout: 3 * 60 * 1000,
            shell: npm.shell,
            onLog,
        });
        if (result.code !== 0) {
            throw new Error(`npm pack ${spec} failed: ${result.stderr}`);
        }
        const tgzName = result.stdout.split('\n').pop();
        if (!tgzName) {
            throw new Error('npm pack produced no output');
        }
        return path_1.default.join(tmpDir, tgzName);
    }
    async packGitPlugin(params, onLog) {
        const tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'lobsterai-plugin-git-'));
        const sourceDir = path_1.default.join(tmpDir, 'source');
        const gitUrl = params.spec;
        const ref = params.version;
        const cloneArgs = ['clone', '--depth', '1'];
        if (ref) {
            cloneArgs.push('--branch', ref);
        }
        cloneArgs.push(gitUrl, sourceDir);
        const cloneResult = await runAsync('git', cloneArgs, {
            cwd: tmpDir,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            timeout: 5 * 60 * 1000,
            onLog,
        });
        if (cloneResult.code !== 0) {
            throw new Error(`git clone failed: ${cloneResult.stderr}`);
        }
        // Pack the cloned source
        const npm = resolveNpmCommand();
        const packResult = await runAsync(npm.command, [...npm.baseArgs, 'pack', sourceDir, '--pack-destination', tmpDir], {
            cwd: tmpDir,
            env: npm.env,
            timeout: 3 * 60 * 1000,
            shell: npm.shell,
            onLog,
        });
        if (packResult.code !== 0) {
            throw new Error(`npm pack (git source) failed: ${packResult.stderr}`);
        }
        const tgzName = packResult.stdout.split('\n').pop();
        if (!tgzName) {
            throw new Error('npm pack produced no output for git source');
        }
        return path_1.default.join(tmpDir, tgzName);
    }
    discoverInstalledPluginId(extensionsDir, params) {
        // Try to find the plugin by scanning the extensions directory for recently added entries
        try {
            const entries = fs_1.default.readdirSync(extensionsDir, { withFileTypes: true })
                .filter(e => e.isDirectory());
            for (const entry of entries) {
                const manifest = readPluginManifest(path_1.default.join(extensionsDir, entry.name));
                if (manifest?.id) {
                    // Check if this could be the plugin we just installed
                    const specLower = params.spec.toLowerCase();
                    const idLower = manifest.id.toLowerCase();
                    if (idLower.includes(specLower) || specLower.includes(idLower) || entry.name === params.spec) {
                        return manifest.id;
                    }
                }
            }
            // Fallback: use the spec as plugin ID (common for clawhub/npm packages)
            const lastSegment = params.spec.split('/').pop() || params.spec;
            const candidateDir = path_1.default.join(extensionsDir, lastSegment);
            if (fs_1.default.existsSync(candidateDir)) {
                const manifest = readPluginManifest(candidateDir);
                return manifest?.id || lastSegment;
            }
        }
        catch {
            // ignore
        }
        return null;
    }
    /**
     * Detect plugins present in OpenClaw's extensions directories or registered
     * in openclaw.json config but missing from the local SQLite store.
     * Returns a read-only list without writing anything.
     */
    detectPluginsFromOpenClaw() {
        const hiddenIds = getHiddenPluginIds();
        const existingPlugins = this.store.listUserPlugins();
        const existingIds = new Set(existingPlugins.map(p => p.pluginId));
        const discovered = new Set();
        // Scan directories on disk
        const dirsToScan = [
            getExtensionsDir(),
            getOpenClawStateExtensionsDir(),
        ].filter((d) => d !== null);
        for (const dir of dirsToScan) {
            try {
                const entries = fs_1.default.readdirSync(dir, { withFileTypes: true })
                    .filter(e => e.isDirectory());
                for (const entry of entries) {
                    const pluginDir = path_1.default.join(dir, entry.name);
                    const manifest = readPluginManifest(pluginDir);
                    const pluginId = manifest?.id || entry.name;
                    if (existingIds.has(pluginId))
                        continue;
                    if (isHiddenPlugin(pluginId, hiddenIds))
                        continue;
                    discovered.add(pluginId);
                }
            }
            catch (err) {
                console.warn(`[PluginManager.detect] readdir error for ${dir}:`, err);
            }
        }
        // Also check plugins.entries in openclaw.json for config-only plugins
        // (registered via web UI but maybe installed to a path we don't scan)
        const configEntries = readOpenClawConfigEntries();
        for (const pluginId of Object.keys(configEntries)) {
            if (existingIds.has(pluginId))
                continue;
            if (isHiddenPlugin(pluginId, hiddenIds))
                continue;
            if (discovered.has(pluginId))
                continue;
            discovered.add(pluginId);
        }
        return { plugins: [...discovered] };
    }
    /**
     * Sync plugins from OpenClaw's extensions directories and config into the
     * local SQLite store. Discovers plugins installed outside of LobsterAI
     * (via AI conversation, CLI, or OpenClaw Web UI) and adds them so they
     * appear in the plugin management UI.
     */
    async syncPluginsFromOpenClaw() {
        const hiddenIds = getHiddenPluginIds();
        const existingPlugins = this.store.listUserPlugins();
        const existingIds = new Set(existingPlugins.map(p => p.pluginId));
        // Read openclaw.json to get enabled state for each plugin
        const configEntries = readOpenClawConfigEntries();
        const synced = [];
        // Scan directories on disk
        const dirsToScan = [
            getExtensionsDir(),
            getOpenClawStateExtensionsDir(),
        ].filter((d) => d !== null);
        const syncedIds = new Set();
        for (const dir of dirsToScan) {
            try {
                const entries = fs_1.default.readdirSync(dir, { withFileTypes: true })
                    .filter(e => e.isDirectory());
                for (const entry of entries) {
                    const pluginDir = path_1.default.join(dir, entry.name);
                    const manifest = readPluginManifest(pluginDir);
                    const pluginId = manifest?.id || entry.name;
                    if (existingIds.has(pluginId))
                        continue;
                    if (isHiddenPlugin(pluginId, hiddenIds))
                        continue;
                    if (syncedIds.has(pluginId))
                        continue;
                    const configEntry = configEntries[pluginId];
                    const enabled = configEntry?.enabled !== false;
                    const version = readPluginVersion(pluginDir);
                    this.store.addUserPlugin({
                        pluginId,
                        source: 'openclaw',
                        spec: pluginId,
                        version,
                        enabled,
                        installedAt: Date.now(),
                    });
                    // Sync config values from openclaw.json if present
                    if (configEntry?.config && typeof configEntry.config === 'object'
                        && Object.keys(configEntry.config).length > 0) {
                        this.store.setUserPluginConfig(pluginId, configEntry.config);
                    }
                    synced.push(pluginId);
                    syncedIds.add(pluginId);
                }
            }
            catch (err) {
                console.warn(`[PluginManager.sync] readdir error for ${dir}:`, err);
            }
        }
        // Also sync plugins from openclaw.json config that aren't on disk
        for (const pluginId of Object.keys(configEntries)) {
            if (existingIds.has(pluginId))
                continue;
            if (isHiddenPlugin(pluginId, hiddenIds))
                continue;
            if (syncedIds.has(pluginId))
                continue;
            const configEntry = configEntries[pluginId];
            const enabled = configEntry?.enabled !== false;
            this.store.addUserPlugin({
                pluginId,
                source: 'openclaw',
                spec: pluginId,
                version: undefined,
                enabled,
                installedAt: Date.now(),
            });
            // Sync config values from openclaw.json if present
            if (configEntry?.config && typeof configEntry.config === 'object'
                && Object.keys(configEntry.config).length > 0) {
                this.store.setUserPluginConfig(pluginId, configEntry.config);
            }
            synced.push(pluginId);
            syncedIds.add(pluginId);
        }
        if (synced.length > 0) {
            console.log(`[PluginManager] synced ${synced.length} plugin(s) from OpenClaw: ${synced.join(', ')}`);
        }
        return { synced };
    }
    /**
     * Check for available updates for installed plugins (npm and clawhub sources).
     */
    async checkPluginUpdates(pluginIds) {
        const userPlugins = this.store.listUserPlugins();
        const candidates = userPlugins.filter(p => {
            if (p.source !== 'npm' && p.source !== 'clawhub')
                return false;
            if (pluginIds && pluginIds.length > 0 && !pluginIds.includes(p.pluginId))
                return false;
            return true;
        });
        if (candidates.length === 0)
            return [];
        const results = await Promise.allSettled(candidates.map(async (plugin) => {
            const currentVersion = plugin.version || null;
            try {
                let latestVersion = null;
                if (plugin.source === 'npm') {
                    latestVersion = await this.checkNpmLatestVersion(plugin.spec, plugin.registry);
                }
                else if (plugin.source === 'clawhub') {
                    latestVersion = await this.checkClawHubLatestVersion(plugin.spec);
                }
                const hasUpdate = latestVersion !== null
                    && (currentVersion === null || currentVersion !== latestVersion);
                return {
                    pluginId: plugin.pluginId,
                    currentVersion,
                    latestVersion,
                    hasUpdate,
                };
            }
            catch (err) {
                return {
                    pluginId: plugin.pluginId,
                    currentVersion,
                    latestVersion: null,
                    hasUpdate: false,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        }));
        return results.map(r => r.status === 'fulfilled'
            ? r.value
            : { pluginId: '', currentVersion: null, latestVersion: null, hasUpdate: false, error: 'Unknown error' }).filter(r => r.pluginId !== '');
    }
    async checkNpmLatestVersion(spec, registry) {
        const npm = resolveNpmCommand();
        const args = [...npm.baseArgs, 'view', spec, 'version', '--json'];
        if (registry) {
            args.push(`--registry=${registry}`);
        }
        const result = await runAsync(npm.command, args, {
            env: npm.env,
            timeout: 30_000,
            shell: npm.shell,
        });
        if (result.code !== 0) {
            throw new Error(`npm view failed: ${result.stderr || `exit code ${result.code}`}`);
        }
        // npm view --json returns version as a JSON string (e.g. "2.2.0")
        const output = result.stdout.trim();
        try {
            const parsed = JSON.parse(output);
            if (typeof parsed === 'string')
                return parsed;
            // In case of multiple versions (dist-tags), take the first
            if (Array.isArray(parsed))
                return parsed[0];
            return output.replace(/"/g, '');
        }
        catch {
            // Fallback: raw output without quotes
            return output.replace(/"/g, '');
        }
    }
    async checkClawHubLatestVersion(spec) {
        const baseUrl = process.env.OPENCLAW_CLAWHUB_URL || 'https://clawhub.ai';
        const url = `${baseUrl}/api/v1/packages/${encodeURIComponent(spec)}`;
        const data = await new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? require('https') : require('http');
            const req = protocol.get(url, { timeout: 30_000 }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`ClawHub API returned HTTP ${res.statusCode}`));
                    return;
                }
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => resolve(body));
                res.on('error', reject);
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('ClawHub request timeout')); });
        });
        const detail = JSON.parse(data);
        const latestVersion = detail?.package?.latestVersion ?? detail?.package?.tags?.latest ?? null;
        if (!latestVersion) {
            throw new Error(`No latest version found for ClawHub package "${spec}"`);
        }
        return latestVersion;
    }
}
exports.PluginManager = PluginManager;
exports.__pluginManagerTestUtils = {
    resolveNpmCommand,
};
/** Plugins that should never appear in the user-managed plugin list. */
const INTERNAL_PLUGIN_IDS = [
    // Core internal plugins
    'ask-user-question',
    'memory-core',
    'qwen-portal-auth',
    'qqbot',
    'acpx',
    'browser',
    'llm-task',
    'thread-ownership',
    // Provider plugins auto-injected by OpenClaw runtime — not user-installable.
    // Keep in sync with OpenClawProviderId in src/shared/providers/constants.ts.
    'google',
    'xai',
    'anthropic',
    'openai',
    'openai-codex',
    'deepseek',
    'moonshot',
    'minimax',
    'minimax-portal',
    'volcengine',
    'qianfan',
    'qwen',
    'qwen-portal',
    'zai',
    'youdaozhiyun',
    'stepfun',
    'xiaomi',
    'openrouter',
    'ollama',
    'lm-studio',
    'lobsterai-server',
    'github-copilot',
    'lobsterai-copilot',
    'lobster',
    'kimi',
    // Aliases / legacy IDs for preinstalled channel plugins.
    // The canonical IDs are in package.json openclaw.plugins and get hidden
    // via readPreinstalledPluginIdsFromPackageJson(); these are alt names that
    // may appear in openclaw.json entries on some installations.
    'dingtalk',
    'feishu',
    'feishu-openclaw-plugin',
    'openclaw-nim',
    'nim',
    'nimsuite-openclaw-nim-channel',
    'email',
    // OpenClaw runtime-bundled channel and optional backend plugins.
    'discord',
    'telegram',
    'talk-voice',
    'memory-lancedb',
    'memory-wiki',
];
/** Read preinstalled plugin IDs from package.json openclaw.plugins field. */
function readPreinstalledPluginIdsFromPackageJson() {
    try {
        const pkgPath = path_1.default.join(electron_1.app.getAppPath(), 'package.json');
        const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf8'));
        const plugins = pkg.openclaw?.plugins;
        if (!Array.isArray(plugins))
            return [];
        return plugins
            .map((p) => p.id)
            .filter((id) => typeof id === 'string' && id.length > 0);
    }
    catch {
        return [];
    }
}
/** Build the set of plugin IDs that should be hidden from the user. */
function getHiddenPluginIds() {
    const hidden = new Set();
    // Preinstalled (IM channel) plugins from package.json
    for (const id of readPreinstalledPluginIdsFromPackageJson()) {
        hidden.add(id);
    }
    // Bundled extensions shipped with the runtime
    for (const manifest of (0, openclawLocalExtensions_1.listBundledOpenClawExtensionManifests)()) {
        hidden.add(manifest.pluginId);
    }
    // Hardcoded internal plugins
    for (const id of INTERNAL_PLUGIN_IDS) {
        hidden.add(id);
    }
    return hidden;
}
/** Check if a plugin should be hidden from the user. */
function isHiddenPlugin(pluginId, hiddenIds) {
    return hiddenIds.has(pluginId);
}
function isHiddenUserPluginId(pluginId) {
    return isHiddenPlugin(pluginId, getHiddenPluginIds());
}
/** Read plugins.entries from the openclaw.json config file. */
function readOpenClawConfigEntries() {
    try {
        const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'openclaw', 'state', 'openclaw.json');
        const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
        return (config?.plugins?.entries ?? {});
    }
    catch {
        return {};
    }
}
/** Remove a plugin entry from openclaw.json plugins.entries so it won't be re-discovered. */
function removeOpenClawConfigEntry(pluginId) {
    try {
        const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'openclaw', 'state', 'openclaw.json');
        const raw = fs_1.default.readFileSync(configPath, 'utf8');
        const config = JSON.parse(raw);
        if (config?.plugins?.entries && pluginId in config.plugins.entries) {
            delete config.plugins.entries[pluginId];
            fs_1.default.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        }
    }
    catch {
        // Config file missing or unreadable — nothing to clean up
    }
}
//# sourceMappingURL=pluginManager.js.map
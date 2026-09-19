"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__mcpLaunchResolverTestUtils = exports.McpLaunchResolverManager = void 0;
exports.packageRootFromInstallDir = packageRootFromInstallDir;
exports.isStaleInstallingResolution = isStaleInstallingResolution;
exports.isRecoverableNodeRuntimeResolutionError = isRecoverableNodeRuntimeResolutionError;
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const nodeRuntime_1 = require("../libs/nodeRuntime");
const mcpLaunchResolution_1 = require("./mcpLaunchResolution");
const INSTALL_TIMEOUT_MS = 120_000;
const NPM_VIEW_TIMEOUT_MS = 20_000;
const STALE_INSTALLING_MS = INSTALL_TIMEOUT_MS + 30_000;
function log(level, message, error) {
    const prefix = `[McpLaunchResolver] ${message}`;
    if (level === 'ERROR') {
        console.error(prefix, error);
    }
    else if (level === 'WARN') {
        if (error !== undefined)
            console.warn(prefix, error);
        else
            console.warn(prefix);
    }
    else {
        console.log(prefix);
    }
}
function sanitizeForPath(value) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp';
}
function prependPathEntries(env, entries) {
    const next = { ...env };
    const pathKeys = Object.keys(next).filter(key => key.toLowerCase() === 'path');
    const pathKey = pathKeys.find(key => key === 'PATH') || pathKeys[0] || 'PATH';
    const pathValues = pathKeys
        .map(key => next[key])
        .filter((value) => Boolean(value));
    const mergedPath = [...entries.filter(Boolean), ...pathValues]
        .filter(Boolean)
        .join(path_1.default.delimiter);
    for (const key of pathKeys) {
        delete next[key];
    }
    if (mergedPath) {
        next[pathKey] = mergedPath;
    }
    return next;
}
function parsePackageSpec(spec) {
    const trimmed = spec.trim();
    if (!trimmed
        || trimmed.startsWith('.')
        || trimmed.startsWith('/')
        || trimmed.startsWith('\\')
        || trimmed.startsWith('file:')
        || trimmed.startsWith('http:')
        || trimmed.startsWith('https:')
        || trimmed.startsWith('git+')) {
        return null;
    }
    if (trimmed.startsWith('@')) {
        const slash = trimmed.indexOf('/');
        if (slash < 0)
            return null;
        const versionAt = trimmed.indexOf('@', slash + 1);
        if (versionAt < 0) {
            return { packageName: trimmed, requestedVersion: 'latest' };
        }
        return {
            packageName: trimmed.slice(0, versionAt),
            requestedVersion: trimmed.slice(versionAt + 1) || 'latest',
        };
    }
    const versionAt = trimmed.indexOf('@');
    if (versionAt < 0) {
        return { packageName: trimmed, requestedVersion: 'latest' };
    }
    return {
        packageName: trimmed.slice(0, versionAt),
        requestedVersion: trimmed.slice(versionAt + 1) || 'latest',
    };
}
function parseNpxArgs(args) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-y' || arg === '--yes')
            continue;
        if (arg === '--') {
            if (i + 1 >= args.length)
                return null;
            const parsed = parsePackageSpec(args[i + 1]);
            if (!parsed)
                return null;
            return {
                ...parsed,
                installSpec: `${parsed.packageName}@${parsed.requestedVersion}`,
                extraArgs: args.slice(i + 2),
            };
        }
        if (arg === '-p' || arg === '--package' || arg.startsWith('--package=')) {
            return null;
        }
        if (arg.startsWith('-'))
            continue;
        const parsed = parsePackageSpec(arg);
        if (!parsed)
            return null;
        return {
            ...parsed,
            installSpec: `${parsed.packageName}@${parsed.requestedVersion}`,
            extraArgs: args.slice(i + 1),
        };
    }
    return null;
}
function packageRootFromInstallDir(installDir, packageName) {
    const parts = packageName.startsWith('@')
        ? packageName.split('/')
        : [packageName];
    return path_1.default.join(installDir, 'node_modules', ...parts);
}
function isStaleInstallingResolution(resolution, now = Date.now()) {
    return (resolution?.status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Installing
        && now - resolution.updatedAt > STALE_INSTALLING_MS);
}
function isRecoverableNodeRuntimeResolutionError(resolution) {
    if (resolution?.status !== mcpLaunchResolution_1.McpLaunchResolutionStatus.Failed)
        return false;
    const error = resolution.error || '';
    return /spawn\s+.*cowork[\\/]+bin[\\/]+node\s+ENOENT/i.test(error);
}
function resolvePackageBin(packageRoot, packageName) {
    const packageJsonPath = path_1.default.join(packageRoot, 'package.json');
    const pkg = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf8'));
    if (typeof pkg.bin === 'string' && pkg.bin.trim()) {
        return path_1.default.join(packageRoot, pkg.bin);
    }
    if (pkg.bin && typeof pkg.bin === 'object') {
        const shortName = packageName.split('/').pop() || packageName;
        const preferred = pkg.bin[shortName] || pkg.bin[packageName] || Object.values(pkg.bin)[0];
        if (preferred)
            return path_1.default.join(packageRoot, preferred);
    }
    throw new Error(`Package "${packageName}" does not declare a runnable bin entry.`);
}
function readInstalledVersion(packageRoot) {
    const packageJsonPath = path_1.default.join(packageRoot, 'package.json');
    const pkg = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf8'));
    return pkg.version || 'unknown';
}
async function runCommand(command, args, options) {
    const startedAt = Date.now();
    const childEnv = prependPathEntries({ ...process.env, ...(options.env || {}) }, []);
    return await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: options.cwd,
            env: childEnv,
            shell: options.shell || false,
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command}`));
        }, options.timeoutMs);
        child.stdout?.on('data', chunk => { stdout += String(chunk); });
        child.stderr?.on('data', chunk => { stderr += String(chunk); });
        child.on('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({
                code,
                stdout,
                stderr,
                durationMs: Date.now() - startedAt,
            });
        });
    });
}
function resolveNpmCommand() {
    return (0, nodeRuntime_1.resolveNodePackageCliCommand)('npm');
}
function resolveNodeCommand() {
    const runtime = (0, nodeRuntime_1.resolveNodeRuntimeForSpawn)();
    return { command: runtime.command, env: runtime.env };
}
class McpLaunchResolverManager {
    store;
    onChanged;
    onResolutionReady;
    inFlight = new Map();
    constructor(store, onChanged, onResolutionReady) {
        this.store = store;
        this.onChanged = onChanged;
        this.onResolutionReady = onResolutionReady;
    }
    canOptimize(server) {
        return server.transportType === 'stdio' && (0, mcpLaunchResolution_1.isNpxMcpServer)(server);
    }
    getReadyResolution(server) {
        const resolution = this.store.getLaunchResolution(server.id);
        if (!resolution)
            return undefined;
        if (resolution.sourceFingerprint !== (0, mcpLaunchResolution_1.createMcpLaunchSourceFingerprint)(server))
            return undefined;
        if (resolution.status !== mcpLaunchResolution_1.McpLaunchResolutionStatus.Ready)
            return undefined;
        if (!resolution.command || !resolution.args?.length)
            return undefined;
        return resolution;
    }
    shouldStartResolution(server, status) {
        if (status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Failed) {
            const resolution = this.store.getLaunchResolution(server.id);
            if (resolution?.sourceFingerprint === (0, mcpLaunchResolution_1.createMcpLaunchSourceFingerprint)(server)
                && isRecoverableNodeRuntimeResolutionError(resolution)) {
                log('WARN', `retrying recoverable Node runtime resolution failure for server "${server.name}"`);
                return true;
            }
            return false;
        }
        if (status !== mcpLaunchResolution_1.McpLaunchResolutionStatus.Installing)
            return true;
        if (this.inFlight.has(server.id))
            return false;
        const resolution = this.store.getLaunchResolution(server.id);
        if (!isStaleInstallingResolution(resolution))
            return false;
        log('WARN', `retrying stale MCP launch installation for server "${server.name}"`);
        return true;
    }
    ensureResolved(serverId, reason) {
        if (this.inFlight.has(serverId))
            return;
        const task = this.resolveServer(serverId, reason)
            .catch(error => {
            log('ERROR', `background resolution failed for server ${serverId}`, error);
        })
            .finally(() => {
            this.inFlight.delete(serverId);
        });
        this.inFlight.set(serverId, task);
    }
    async retry(serverId) {
        if (this.inFlight.has(serverId)) {
            await this.inFlight.get(serverId);
            return;
        }
        const task = this.resolveServer(serverId, 'manual-retry')
            .finally(() => {
            this.inFlight.delete(serverId);
        });
        this.inFlight.set(serverId, task);
        await task;
    }
    async resolveServer(serverId, reason) {
        const server = this.store.getServer(serverId);
        if (!server || !server.enabled)
            return;
        const startedAt = Date.now();
        const fingerprint = (0, mcpLaunchResolution_1.createMcpLaunchSourceFingerprint)(server);
        const existing = this.store.getLaunchResolution(server.id);
        if (existing?.sourceFingerprint === fingerprint
            && existing.status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Ready
            && existing.command
            && existing.args?.length) {
            log('INFO', `server "${server.name}" already has a ready launch resolution`);
            return;
        }
        if (!this.canOptimize(server)) {
            this.store.upsertLaunchResolution({
                serverId: server.id,
                resolverKind: mcpLaunchResolution_1.McpLaunchResolverKind.Raw,
                sourceFingerprint: fingerprint,
                status: mcpLaunchResolution_1.McpLaunchResolutionStatus.Unsupported,
                error: 'Only standard npx stdio MCP servers are optimized in this version.',
                updatedAt: Date.now(),
            });
            this.onChanged();
            return;
        }
        const parsed = parseNpxArgs(server.args || []);
        if (!parsed) {
            this.store.upsertLaunchResolution({
                serverId: server.id,
                resolverKind: mcpLaunchResolution_1.McpLaunchResolverKind.Npx,
                sourceFingerprint: fingerprint,
                status: mcpLaunchResolution_1.McpLaunchResolutionStatus.Unsupported,
                error: 'This npx command shape is not supported for managed installation.',
                updatedAt: Date.now(),
            });
            this.onChanged();
            return;
        }
        const installDir = path_1.default.join(electron_1.app.getPath('userData'), 'openclaw', 'mcp-packages', `${sanitizeForPath(server.id)}-${sanitizeForPath(parsed.packageName)}`);
        fs_1.default.mkdirSync(installDir, { recursive: true });
        this.store.upsertLaunchResolution({
            serverId: server.id,
            resolverKind: mcpLaunchResolution_1.McpLaunchResolverKind.Npx,
            sourceFingerprint: fingerprint,
            status: mcpLaunchResolution_1.McpLaunchResolutionStatus.Installing,
            packageName: parsed.packageName,
            requestedVersion: parsed.requestedVersion,
            installDir,
            updatedAt: Date.now(),
        });
        this.onChanged();
        log('INFO', `installing MCP server "${server.name}" package ${parsed.installSpec} (reason=${reason})`);
        try {
            const npm = resolveNpmCommand();
            const viewStartedAt = Date.now();
            const viewResult = await runCommand(npm.command, [...npm.baseArgs, 'view', parsed.installSpec, 'version', '--json'], { env: npm.env, shell: npm.shell, timeoutMs: NPM_VIEW_TIMEOUT_MS });
            log('INFO', `resolved npm metadata for "${server.name}" in ${Date.now() - viewStartedAt}ms (exit=${viewResult.code})`);
            if (viewResult.code !== 0) {
                throw new Error(viewResult.stderr.trim() || `npm view exited with code ${viewResult.code}`);
            }
            const installStartedAt = Date.now();
            const installResult = await runCommand(npm.command, [
                ...npm.baseArgs,
                'install',
                '--prefix',
                installDir,
                '--omit=dev',
                '--no-audit',
                '--no-fund',
                parsed.installSpec,
            ], { env: npm.env, shell: npm.shell, timeoutMs: INSTALL_TIMEOUT_MS });
            log('INFO', `installed package for "${server.name}" in ${Date.now() - installStartedAt}ms (exit=${installResult.code})`);
            if (installResult.code !== 0) {
                throw new Error(installResult.stderr.trim() || `npm install exited with code ${installResult.code}`);
            }
            const packageRoot = packageRootFromInstallDir(installDir, parsed.packageName);
            const binPath = resolvePackageBin(packageRoot, parsed.packageName);
            const resolvedVersion = readInstalledVersion(packageRoot);
            const node = resolveNodeCommand();
            const resolvedAt = Date.now();
            this.store.upsertLaunchResolution({
                serverId: server.id,
                resolverKind: mcpLaunchResolution_1.McpLaunchResolverKind.Npx,
                sourceFingerprint: fingerprint,
                status: mcpLaunchResolution_1.McpLaunchResolutionStatus.Ready,
                packageName: parsed.packageName,
                requestedVersion: parsed.requestedVersion,
                resolvedVersion,
                installDir,
                command: node.command,
                args: [binPath, ...parsed.extraArgs],
                env: node.env,
                installedAt: resolvedAt,
                resolvedAt,
                updatedAt: resolvedAt,
            });
            log('INFO', `MCP server "${server.name}" launch path is ready in ${Date.now() - startedAt}ms; version=${resolvedVersion}`);
            this.onChanged();
            this.onResolutionReady(`mcp-launch-ready:${server.name}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.store.upsertLaunchResolution({
                serverId: server.id,
                resolverKind: mcpLaunchResolution_1.McpLaunchResolverKind.Npx,
                sourceFingerprint: fingerprint,
                status: mcpLaunchResolution_1.McpLaunchResolutionStatus.Failed,
                packageName: parsed.packageName,
                requestedVersion: parsed.requestedVersion,
                installDir,
                error: message,
                updatedAt: Date.now(),
            });
            log('WARN', `failed to resolve MCP server "${server.name}" after ${Date.now() - startedAt}ms: ${message}`);
            this.onChanged();
            this.onResolutionReady(`mcp-launch-failed:${server.name}`);
        }
    }
}
exports.McpLaunchResolverManager = McpLaunchResolverManager;
exports.__mcpLaunchResolverTestUtils = {
    resolveNpmCommand,
    resolveNodeCommand,
};
//# sourceMappingURL=mcpLaunchResolverManager.js.map
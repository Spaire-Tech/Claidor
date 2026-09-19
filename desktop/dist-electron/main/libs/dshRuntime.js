"use strict";
// Pure helpers for locating, validating, and spawning the bundled DeepSeek
// Harness (dsh) runtime. No Electron imports here so the logic stays unit
// testable; dshEngineManager.ts owns process/Electron concerns.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DSH_NODE_EXEC_ARGV = exports.DSH_RUNTIME_ENTRY_RELPATH = void 0;
exports.parseDshRuntimeBuildInfo = parseDshRuntimeBuildInfo;
exports.classifyDshStartupError = classifyDshStartupError;
exports.resolveDshRuntimeCandidates = resolveDshRuntimeCandidates;
exports.validateDshRuntimeLayout = validateDshRuntimeLayout;
exports.dshInstallPercent = dshInstallPercent;
exports.shouldPublishInstallProgress = shouldPublishInstallProgress;
exports.buildDshSpawnEnv = buildDshSpawnEnv;
exports.buildDshWebArgs = buildDshWebArgs;
exports.resolveDshWorkingDirectory = resolveDshWorkingDirectory;
const constants_1 = require("../../shared/dshEngine/constants");
exports.DSH_RUNTIME_ENTRY_RELPATH = 'lib/bin.js';
// The Cordis loader needs Node internals for its HMR/entry machinery. Its
// preferred supply (the node-addon-require-builtin native addon) loads but
// fails under Electron's Node build ("no compatible
// GetAlignedPointerFromEmbedderData symbol"), so every dsh child we spawn must
// carry this flag. dshProcessLauncher inserts it before the entry script while
// running Electron in Node mode on every platform.
exports.DSH_NODE_EXEC_ARGV = ['--expose-internals'];
const DSH_PLUGIN_LOAD_FAILURE_PATTERN = /(?:Cannot find package|ERR_MODULE_NOT_FOUND)[\s\S]{0,500}cordis-plugin-loader/i;
const REQUIRED_RUNTIME_PATHS = [
    exports.DSH_RUNTIME_ENTRY_RELPATH,
    'node_modules',
    'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html',
];
function parseDshRuntimeBuildInfo(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return null;
        const record = parsed;
        if (typeof record.target !== 'string' || typeof record.dshVersion !== 'string' || typeof record.patchHash !== 'string') {
            return null;
        }
        return {
            target: record.target,
            dshVersion: record.dshVersion,
            patchHash: record.patchHash,
            builtAt: typeof record.builtAt === 'string' ? record.builtAt : undefined,
        };
    }
    catch {
        return null;
    }
}
function classifyDshStartupError(output, fallback) {
    return DSH_PLUGIN_LOAD_FAILURE_PATTERN.test(output) ? constants_1.DshEngineErrorCode.PluginLoadFailed : fallback;
}
// Mirrors the OpenClaw runtime resolution order: packaged apps read the
// extraResources copy; dev builds read vendor/dsh-runtime/current.
function resolveDshRuntimeCandidates(context) {
    const { isPackaged, resourcesPath, appPath, cwd, joinPath } = context;
    if (isPackaged) {
        return [joinPath(resourcesPath, 'dsh')];
    }
    const candidates = [joinPath(appPath, 'vendor', 'dsh-runtime', 'current')];
    const fromCwd = joinPath(cwd, 'vendor', 'dsh-runtime', 'current');
    if (!candidates.includes(fromCwd))
        candidates.push(fromCwd);
    return candidates;
}
function validateDshRuntimeLayout(runtimeRoot, exists, joinPath) {
    const missing = REQUIRED_RUNTIME_PATHS.filter((relPath) => !exists(joinPath(runtimeRoot, ...relPath.split('/'))));
    return { ok: missing.length === 0, missing };
}
function dshInstallPercent(progress) {
    if (!progress || progress.totalBytes <= 0)
        return 0;
    return Math.min(100, Math.floor((progress.receivedBytes / progress.totalBytes) * 100));
}
// A 36MB download reports progress per chunk — thousands of events. Publishing
// each one would push that many state updates through the IPC-facing listeners
// and repeat the same line in the log (the old 25% log printed 15 times), so a
// report only counts as news when the stage or the whole percent changed.
function shouldPublishInstallProgress(previous, next) {
    if (!previous)
        return true;
    if (previous.stage !== next.stage)
        return true;
    return dshInstallPercent(previous) !== dshInstallPercent(next);
}
// Environment shared with the dsh child process. The process launcher adds
// ELECTRON_RUN_AS_NODE because that flag is part of how Electron itself is
// invoked, not dsh's application environment.
function buildDshSpawnEnv(options) {
    const { baseEnv, dshHome, telemetryDisabled = true, timeZone } = options;
    const env = {};
    for (const [key, value] of Object.entries(baseEnv)) {
        if (typeof value === 'string')
            env[key] = value;
    }
    env.DSH_HOME = dshHome;
    if (telemetryDisabled)
        env.DSH_TELEMETRY_DISABLED = '1';
    if (timeZone && !env.TZ)
        env.TZ = timeZone;
    return env;
}
function buildDshWebArgs(entryPath, port) {
    return [entryPath, 'web', '--port', String(port)];
}
// The child's cwd becomes the workbench's default session directory and the
// root for project-level skills, so it must be a real directory the user
// actually works in — never the runtime install directory, which would put new
// sessions outside every workspace and aim a workspace-write agent at our own
// vendored runtime. Candidates are tried in order; `fallback` is last resort.
function resolveDshWorkingDirectory(candidates, isDirectory, fallback) {
    for (const candidate of candidates) {
        const trimmed = candidate?.trim();
        if (!trimmed)
            continue;
        if (isDirectory(trimmed))
            return trimmed;
    }
    return fallback;
}
//# sourceMappingURL=dshRuntime.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasLegacyPluginInstallConfig = exports.OpenClawPluginInstallMigrationStatus = void 0;
exports.runOpenClawPluginInstallMigrationProcess = runOpenClawPluginInstallMigrationProcess;
exports.migrateLegacyOpenClawPluginInstalls = migrateLegacyOpenClawPluginInstalls;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const safeFileReplace_1 = require("./safeFileReplace");
const LEGACY_PLUGIN_INSTALL_CONFIG_PATH = 'plugins.installs';
const LEGACY_PLUGIN_INSTALL_MIGRATION_TIMEOUT_MS = 2 * 60_000;
const PROCESS_KILL_GRACE_MS = 2_000;
const PROCESS_OUTPUT_TAIL_LIMIT = 4_000;
exports.OpenClawPluginInstallMigrationStatus = {
    NotNeeded: 'not_needed',
    Migrated: 'migrated',
    Failed: 'failed',
};
const appendOutputTail = (current, chunk) => {
    const next = current + String(chunk);
    return next.length <= PROCESS_OUTPUT_TAIL_LIMIT
        ? next
        : next.slice(next.length - PROCESS_OUTPUT_TAIL_LIMIT);
};
function runOpenClawPluginInstallMigrationProcess(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = (options.spawnProcess ?? child_process_1.spawn)(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timeoutError = null;
        let timeout = null;
        let killGraceTimeout = null;
        const finish = (callback) => {
            if (settled)
                return;
            settled = true;
            if (timeout)
                clearTimeout(timeout);
            if (killGraceTimeout)
                clearTimeout(killGraceTimeout);
            callback();
        };
        timeout = setTimeout(() => {
            const error = new Error(`Engine plugin install migration timed out after ${options.timeoutMs}ms`);
            timeoutError = error;
            if (!child.kill()) {
                finish(() => reject(error));
                return;
            }
            killGraceTimeout = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                    // The child may have exited without delivering close yet.
                }
                finish(() => reject(error));
            }, options.killGraceMs ?? PROCESS_KILL_GRACE_MS);
        }, options.timeoutMs);
        child.stdout?.on('data', (chunk) => {
            stdout = appendOutputTail(stdout, chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr = appendOutputTail(stderr, chunk);
        });
        child.on('close', (code) => {
            finish(() => {
                if (timeoutError) {
                    reject(timeoutError);
                    return;
                }
                resolve({ code, stdout, stderr });
            });
        });
        child.on('error', (error) => {
            finish(() => reject(error));
        });
    });
}
const isRecord = (value) => (typeof value === 'object' && value !== null && !Array.isArray(value));
const inspectLegacyPluginInstallConfig = (raw) => {
    try {
        const config = JSON.parse(raw);
        if (!isRecord(config))
            return { valid: false, hasLegacyInstalls: false };
        if (!isRecord(config.plugins))
            return { valid: true, hasLegacyInstalls: false };
        return {
            valid: true,
            hasLegacyInstalls: Object.hasOwn(config.plugins, 'installs'),
        };
    }
    catch {
        return { valid: false, hasLegacyInstalls: false };
    }
};
const hasLegacyPluginInstallConfig = (raw) => (inspectLegacyPluginInstallConfig(raw).hasLegacyInstalls);
exports.hasLegacyPluginInstallConfig = hasLegacyPluginInstallConfig;
const resolveOpenClawCliPath = (runtimeRoot) => {
    const candidates = [
        path_1.default.join(runtimeRoot, 'openclaw.mjs'),
        path_1.default.join(runtimeRoot, 'gateway.asar', 'openclaw.mjs'),
    ];
    return candidates.find(candidate => fs_1.default.existsSync(candidate)) ?? null;
};
const restoreOriginalConfig = (configPath, originalRaw, originalMode) => {
    let currentRaw = null;
    try {
        currentRaw = fs_1.default.readFileSync(configPath, 'utf8');
    }
    catch {
        // Missing or unreadable output still needs restoration below.
    }
    if (currentRaw === originalRaw)
        return;
    (0, safeFileReplace_1.safelyReplaceTextFileSync)({
        filePath: configPath,
        content: originalRaw,
        mode: originalMode,
        tempLabel: 'legacy-plugin-installs-restore',
    });
};
const describeProcessFailure = (result) => {
    const output = result.stderr.trim() || result.stdout.trim();
    const suffix = output ? `: ${output}` : '';
    return `Engine config migration exited with code ${String(result.code)}${suffix}`;
};
/**
 * Move the deprecated openclaw.json `plugins.installs` records through
 * OpenClaw's public config write path before LobsterAI overwrites the file.
 * OpenClaw persists those records in its installed-plugin SQLite index before
 * removing the legacy key. On any failure, the exact original config is put
 * back and LobsterAI's config sync must stop.
 */
async function migrateLegacyOpenClawPluginInstalls(params) {
    let originalRaw;
    let originalMode = 0o600;
    try {
        originalRaw = fs_1.default.readFileSync(params.configPath, 'utf8');
        originalMode = fs_1.default.statSync(params.configPath).mode & 0o777;
    }
    catch {
        return { status: exports.OpenClawPluginInstallMigrationStatus.NotNeeded };
    }
    if (!(0, exports.hasLegacyPluginInstallConfig)(originalRaw)) {
        return { status: exports.OpenClawPluginInstallMigrationStatus.NotNeeded };
    }
    const restoreAndFail = (message) => {
        try {
            restoreOriginalConfig(params.configPath, originalRaw, originalMode);
            return { status: exports.OpenClawPluginInstallMigrationStatus.Failed, error: message };
        }
        catch (restoreError) {
            const detail = restoreError instanceof Error ? restoreError.message : String(restoreError);
            return {
                status: exports.OpenClawPluginInstallMigrationStatus.Failed,
                error: `${message}; failed to restore original config: ${detail}`,
            };
        }
    };
    if (!params.runtimeRoot) {
        return restoreAndFail('The engine is unavailable for legacy plugin install migration');
    }
    const cliPath = resolveOpenClawCliPath(params.runtimeRoot);
    if (!cliPath) {
        return restoreAndFail(`Engine CLI is unavailable in runtime: ${params.runtimeRoot}`);
    }
    const runner = params.runner ?? runOpenClawPluginInstallMigrationProcess;
    const env = {
        ...params.env,
        ...params.secretEnvVars,
        OPENCLAW_HOME: path_1.default.dirname(params.stateDir),
        OPENCLAW_STATE_DIR: params.stateDir,
        OPENCLAW_CONFIG_PATH: params.configPath,
        ELECTRON_RUN_AS_NODE: '1',
    };
    const args = [cliPath, 'config', 'unset', LEGACY_PLUGIN_INSTALL_CONFIG_PATH];
    console.log('[Engine] Legacy plugins.installs detected; running official config migration.');
    try {
        const result = await runner(params.electronNodeRuntimePath, args, {
            cwd: params.runtimeRoot,
            env,
            timeoutMs: LEGACY_PLUGIN_INSTALL_MIGRATION_TIMEOUT_MS,
        });
        if (result.code !== 0) {
            return restoreAndFail(describeProcessFailure(result));
        }
        let migratedRaw;
        try {
            migratedRaw = fs_1.default.readFileSync(params.configPath, 'utf8');
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return restoreAndFail(`Engine config migration output is unreadable: ${detail}`);
        }
        const migratedInspection = inspectLegacyPluginInstallConfig(migratedRaw);
        if (!migratedInspection.valid) {
            return restoreAndFail('Engine config migration produced invalid JSON');
        }
        if (migratedInspection.hasLegacyInstalls) {
            return restoreAndFail('Engine config migration completed without removing plugins.installs');
        }
        console.log('[Engine] Legacy plugins.installs migrated into the plugin index.');
        return { status: exports.OpenClawPluginInstallMigrationStatus.Migrated };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return restoreAndFail(`Engine config migration failed: ${detail}`);
    }
}
//# sourceMappingURL=openclawPluginInstallMigration.js.map
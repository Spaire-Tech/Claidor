"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLegacyCronStorePath = resolveLegacyCronStorePath;
exports.hasLegacyCronStorage = hasLegacyCronStorage;
exports.archiveLegacyCronStorage = archiveLegacyCronStorage;
exports.runProcess = runProcess;
exports.migrateLegacyCronStorageWithDoctor = migrateLegacyCronStorageWithDoctor;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LEGACY_CRON_DOCTOR_TIMEOUT_MS = 180_000;
const LOG_TAIL_LIMIT = 4_000;
function resolveLegacyCronStorePath(stateDir) {
    return path_1.default.join(stateDir, 'cron', 'jobs.json');
}
function resolveLegacyCronStatePath(stateDir) {
    return path_1.default.join(stateDir, 'cron', 'jobs-state.json');
}
function listLegacyCronRunLogPaths(stateDir) {
    const runsDir = path_1.default.join(stateDir, 'cron', 'runs');
    try {
        return fs_1.default.readdirSync(runsDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
            .map((entry) => path_1.default.join(runsDir, entry.name));
    }
    catch {
        return [];
    }
}
function legacyCronRunLogsExist(stateDir) {
    return listLegacyCronRunLogPaths(stateDir).length > 0;
}
function hasLegacyCronStorage(stateDir) {
    return (fs_1.default.existsSync(resolveLegacyCronStorePath(stateDir)) ||
        fs_1.default.existsSync(resolveLegacyCronStatePath(stateDir)) ||
        legacyCronRunLogsExist(stateDir));
}
const LEGACY_CRON_ARCHIVE_SUFFIX = '.migrated';
function resolveLegacyCronArchivePath(filePath) {
    const preferred = `${filePath}${LEGACY_CRON_ARCHIVE_SUFFIX}`;
    if (!fs_1.default.existsSync(preferred)) {
        return preferred;
    }
    return `${preferred}-${Date.now()}`;
}
// The pinned OpenClaw runtime keeps cron jobs in its shared SQLite state
// (the configured cron.store path only acts as the store key); the legacy
// JSON/JSONL files are read solely by the doctor migration. Rename them after
// a successful doctor run so hasLegacyCronStorage() stops re-triggering the
// doctor on every startup.
function archiveLegacyCronStorage(stateDir) {
    const candidates = [
        resolveLegacyCronStorePath(stateDir),
        resolveLegacyCronStatePath(stateDir),
        ...listLegacyCronRunLogPaths(stateDir),
    ];
    const archived = [];
    for (const filePath of candidates) {
        try {
            if (!fs_1.default.existsSync(filePath)) {
                continue;
            }
            const archivePath = resolveLegacyCronArchivePath(filePath);
            fs_1.default.renameSync(filePath, archivePath);
            archived.push(archivePath);
        }
        catch (error) {
            console.warn(`[Engine] Failed to archive legacy cron file: ${filePath}`, error);
        }
    }
    return archived;
}
function tailLog(text) {
    if (text.length <= LOG_TAIL_LIMIT) {
        return text;
    }
    return text.slice(text.length - LOG_TAIL_LIMIT);
}
function resolveDoctorConfigPath(stateDir) {
    return path_1.default.join(stateDir, '.lobsterai-cron-doctor-openclaw.json');
}
function writeDoctorCronConfig(stateDir) {
    const configPath = resolveDoctorConfigPath(stateDir);
    const storePath = resolveLegacyCronStorePath(stateDir);
    fs_1.default.writeFileSync(configPath, JSON.stringify({
        gateway: { mode: 'local' },
        cron: {
            enabled: true,
            store: storePath,
        },
    }, null, 2) + '\n', 'utf8');
    return configPath;
}
function runProcess(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Legacy cron migration timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs);
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
async function migrateLegacyCronStorageWithDoctor(params) {
    if (!hasLegacyCronStorage(params.stateDir)) {
        return { status: 'skipped', reason: 'no-legacy-cron-files' };
    }
    const openclawCliPath = path_1.default.join(params.runtimeRoot, 'openclaw.mjs');
    if (!fs_1.default.existsSync(openclawCliPath)) {
        console.warn(`[Engine] Legacy cron storage detected but OpenClaw CLI is missing: ${openclawCliPath}`);
        return { status: 'skipped', reason: 'missing-openclaw-cli' };
    }
    const runner = params.runner ?? runProcess;
    const doctorConfigPath = writeDoctorCronConfig(params.stateDir);
    const env = {
        ...params.env,
        OPENCLAW_HOME: path_1.default.dirname(params.stateDir),
        OPENCLAW_STATE_DIR: params.stateDir,
        OPENCLAW_CONFIG_PATH: doctorConfigPath,
        ELECTRON_RUN_AS_NODE: '1',
    };
    const args = [openclawCliPath, 'doctor', '--non-interactive', '--fix'];
    console.log(`[Engine] Legacy cron storage detected; running official doctor migration: ${JSON.stringify(args.slice(1))}`);
    try {
        const result = await runner(params.electronNodeRuntimePath, args, {
            cwd: params.runtimeRoot,
            env,
            timeoutMs: LEGACY_CRON_DOCTOR_TIMEOUT_MS,
        });
        if (result.code === 0) {
            const archived = archiveLegacyCronStorage(params.stateDir);
            if (archived.length > 0) {
                console.log('[Engine] Legacy cron doctor migration completed; archived: '
                    + archived.map((filePath) => path_1.default.basename(filePath)).join(', '));
            }
            else {
                console.log('[Engine] Legacy cron doctor migration completed.');
            }
            return { status: 'migrated', code: result.code };
        }
        console.warn([
            `[Engine] Legacy cron doctor migration failed with exit code ${result.code}.`,
            result.stderr ? `stderr tail:\n${tailLog(result.stderr)}` : '',
            result.stdout ? `stdout tail:\n${tailLog(result.stdout)}` : '',
        ].filter(Boolean).join('\n'));
        return { status: 'failed', code: result.code };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Engine] Legacy cron doctor migration failed before gateway startup:', error);
        return { status: 'failed', code: null, error: message };
    }
}
//# sourceMappingURL=openclawCronLegacyMigration.js.map
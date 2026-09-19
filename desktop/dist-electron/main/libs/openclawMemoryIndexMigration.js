"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMemoryIndexPath = resolveMemoryIndexPath;
exports.resolveFtsOnlyMemoryIndexMigrationNeed = resolveFtsOnlyMemoryIndexMigrationNeed;
exports.runProcess = runProcess;
exports.migrateAllFtsOnlyMemoryIndexes = migrateAllFtsOnlyMemoryIndexes;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const MEMORY_INDEX_REBUILD_TIMEOUT_MS = 180_000;
const LOG_TAIL_LIMIT = 4_000;
const MEMORY_INDEX_META_KEY = 'memory_index_meta_v1';
const DEFAULT_AGENT_ID = 'main';
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function readJsonFile(filePath) {
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function resolveConfiguredAgentEntries(config) {
    const agents = isRecord(config.agents) ? config.agents : null;
    const list = Array.isArray(agents?.list) ? agents.list : [];
    const entries = list.filter((entry) => (isRecord(entry) && typeof entry.id === 'string' && Boolean(entry.id.trim())));
    return entries.length > 0 ? entries : [{ id: DEFAULT_AGENT_ID }];
}
function resolveDefaultMemorySearchConfig(config) {
    const agents = isRecord(config.agents) ? config.agents : null;
    const defaults = isRecord(agents?.defaults) ? agents.defaults : null;
    return isRecord(defaults?.memorySearch) ? defaults.memorySearch : null;
}
function mergeMemorySearchConfig(defaults, agentEntry) {
    const overrides = isRecord(agentEntry.memorySearch) ? agentEntry.memorySearch : null;
    if (!overrides) {
        return defaults;
    }
    const defaultStore = isRecord(defaults?.store) ? defaults.store : {};
    const overrideStore = isRecord(overrides.store) ? overrides.store : {};
    const defaultFts = isRecord(defaultStore.fts) ? defaultStore.fts : {};
    const overrideFts = isRecord(overrideStore.fts) ? overrideStore.fts : {};
    const defaultVector = isRecord(defaultStore.vector) ? defaultStore.vector : {};
    const overrideVector = isRecord(overrideStore.vector) ? overrideStore.vector : {};
    return {
        ...(defaults ?? {}),
        ...overrides,
        store: {
            ...defaultStore,
            ...overrideStore,
            fts: { ...defaultFts, ...overrideFts },
            vector: { ...defaultVector, ...overrideVector },
        },
    };
}
function isFtsOnlyMemorySearch(memorySearch) {
    if (!memorySearch) {
        return false;
    }
    const store = isRecord(memorySearch.store) ? memorySearch.store : {};
    const vector = isRecord(store.vector) ? store.vector : {};
    return memorySearch.provider === 'none' && vector.enabled === false;
}
function resolveFtsTokenizer(memorySearch) {
    const store = isRecord(memorySearch.store) ? memorySearch.store : {};
    const fts = isRecord(store.fts) ? store.fts : {};
    return typeof fts.tokenizer === 'string' && fts.tokenizer.trim()
        ? fts.tokenizer.trim()
        : undefined;
}
function resolveUserPath(filePath) {
    if (filePath === '~') {
        return os_1.default.homedir();
    }
    if (filePath.startsWith(`~${path_1.default.sep}`) || filePath.startsWith('~/') || filePath.startsWith('~\\')) {
        return path_1.default.join(os_1.default.homedir(), filePath.slice(2));
    }
    return path_1.default.resolve(filePath);
}
function resolveMemoryIndexPath(params) {
    const store = isRecord(params.memorySearch.store) ? params.memorySearch.store : {};
    const configuredPath = typeof store.path === 'string' && store.path.trim()
        ? store.path.trim().replace(/\{agentId\}/g, params.agentId)
        : null;
    if (configuredPath) {
        return resolveUserPath(configuredPath);
    }
    return path_1.default.join(params.stateDir, 'memory', `${params.agentId}.sqlite`);
}
function readMemoryIndexMeta(dbPath) {
    const db = new better_sqlite3_1.default(dbPath, { readonly: true, fileMustExist: true });
    try {
        let row;
        try {
            row = db
                .prepare('SELECT value FROM meta WHERE key = ?')
                .get(MEMORY_INDEX_META_KEY);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/no such table: meta/i.test(message)) {
                return null;
            }
            throw error;
        }
        if (typeof row?.value !== 'string' || !row.value.trim()) {
            return null;
        }
        const parsed = JSON.parse(row.value);
        return isRecord(parsed) ? parsed : null;
    }
    finally {
        db.close();
    }
}
function isMemoryIndexMetaCurrent(meta, expectedTokenizer) {
    return Boolean(meta?.model === 'fts-only' &&
        meta.provider === 'none' &&
        (!expectedTokenizer || meta.ftsTokenizer === expectedTokenizer));
}
function describeMemoryIndexMismatch(meta, expectedTokenizer) {
    return meta
        ? `index meta is ${JSON.stringify({
            model: meta.model,
            provider: meta.provider,
            ftsTokenizer: meta.ftsTokenizer,
        })}, expected fts-only/${expectedTokenizer ?? 'default'}`
        : 'index metadata is missing';
}
function resolveFtsOnlyMemoryIndexMigrationNeed(params) {
    if (!fs_1.default.existsSync(params.configPath)) {
        return { shouldMigrate: false, reason: 'missing-config' };
    }
    const config = readJsonFile(params.configPath);
    if (!config) {
        return { shouldMigrate: false, reason: 'invalid-config' };
    }
    const defaultMemorySearch = resolveDefaultMemorySearchConfig(config);
    const agentEntries = resolveConfiguredAgentEntries(config);
    const resolvedAgents = agentEntries.map((entry) => ({
        agentId: String(entry.id).trim(),
        memorySearch: mergeMemorySearchConfig(defaultMemorySearch, entry),
    }));
    if (resolvedAgents.some(({ memorySearch }) => !isFtsOnlyMemorySearch(memorySearch))) {
        return { shouldMigrate: false, reason: 'not-fts-only-config' };
    }
    let existingIndexCount = 0;
    const targets = [];
    for (const { agentId, memorySearch } of resolvedAgents) {
        if (!memorySearch) {
            continue;
        }
        const dbPath = resolveMemoryIndexPath({
            agentId,
            memorySearch,
            stateDir: params.stateDir,
        });
        if (!fs_1.default.existsSync(dbPath)) {
            continue;
        }
        existingIndexCount += 1;
        const expectedTokenizer = resolveFtsTokenizer(memorySearch);
        const meta = readMemoryIndexMeta(dbPath);
        if (isMemoryIndexMetaCurrent(meta, expectedTokenizer)) {
            continue;
        }
        targets.push({
            agentId,
            dbPath,
            expectedTokenizer,
            reason: describeMemoryIndexMismatch(meta, expectedTokenizer),
        });
    }
    if (targets.length === 0) {
        return {
            shouldMigrate: false,
            reason: existingIndexCount === 0 ? 'no-index-db' : 'index-meta-current',
        };
    }
    const reason = targets
        .map((target) => `${target.agentId}: ${target.reason}`)
        .join('; ');
    return { shouldMigrate: true, targets, reason };
}
function tailLog(text) {
    if (text.length <= LOG_TAIL_LIMIT) {
        return text;
    }
    return text.slice(text.length - LOG_TAIL_LIMIT);
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
            reject(new Error(`Memory index migration timed out after ${options.timeoutMs}ms`));
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
function findStaleTargets(targets) {
    return targets.filter((target) => {
        if (!fs_1.default.existsSync(target.dbPath)) {
            return true;
        }
        return !isMemoryIndexMetaCurrent(readMemoryIndexMeta(target.dbPath), target.expectedTokenizer);
    });
}
async function migrateAllFtsOnlyMemoryIndexes(params) {
    let need;
    try {
        need = resolveFtsOnlyMemoryIndexMigrationNeed({
            configPath: params.configPath,
            stateDir: params.stateDir,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Engine] Failed to inspect memory index metadata before migration:', error);
        return { status: 'failed', code: null, error: message };
    }
    if (need.shouldMigrate === false) {
        return { status: 'skipped', reason: need.reason };
    }
    const openclawCliPath = path_1.default.join(params.runtimeRoot, 'openclaw.mjs');
    if (!fs_1.default.existsSync(openclawCliPath)) {
        console.warn(`[Engine] Memory index migration needed but OpenClaw CLI is missing: ${openclawCliPath}`);
        return { status: 'skipped', reason: 'missing-openclaw-cli' };
    }
    const runner = params.runner ?? runProcess;
    const env = {
        ...params.env,
        OPENCLAW_HOME: path_1.default.dirname(params.stateDir),
        OPENCLAW_STATE_DIR: params.stateDir,
        OPENCLAW_CONFIG_PATH: params.configPath,
        ELECTRON_RUN_AS_NODE: '1',
    };
    const args = [openclawCliPath, 'memory', 'index', '--force'];
    const targetAgentIds = need.targets.map((target) => target.agentId);
    console.log(`[Engine] FTS-only memory index migration needed for agents ${JSON.stringify(targetAgentIds)}; running official all-agent reindex: ${JSON.stringify(args.slice(1))}`);
    try {
        const result = await runner(params.electronNodeRuntimePath, args, {
            cwd: params.runtimeRoot,
            env,
            timeoutMs: MEMORY_INDEX_REBUILD_TIMEOUT_MS,
        });
        if (result.code === 0) {
            const staleTargets = findStaleTargets(need.targets);
            if (staleTargets.length > 0) {
                const staleAgentIds = staleTargets.map((target) => target.agentId);
                const error = `post-reindex verification failed for agents ${JSON.stringify(staleAgentIds)}`;
                console.warn(`[Engine] FTS-only memory index migration ${error}.`);
                return { status: 'failed', code: result.code, error };
            }
            console.log(`[Engine] FTS-only memory index migration completed: ${need.reason}`);
            return { status: 'migrated', code: result.code, reason: need.reason };
        }
        console.warn([
            `[Engine] FTS-only memory index migration failed with exit code ${result.code}.`,
            result.stderr ? `stderr tail:\n${tailLog(result.stderr)}` : '',
            result.stdout ? `stdout tail:\n${tailLog(result.stdout)}` : '',
        ].filter(Boolean).join('\n'));
        return { status: 'failed', code: result.code };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Engine] FTS-only memory index migration failed before gateway startup:', error);
        return { status: 'failed', code: null, error: message };
    }
}
//# sourceMappingURL=openclawMemoryIndexMigration.js.map
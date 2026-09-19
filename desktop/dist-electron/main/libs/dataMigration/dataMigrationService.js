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
exports.performPendingDataMigrationRestoreSync = exports.performDataMigrationRestoreSync = exports.consumeLastRestoreResultSync = exports.writePendingRestoreRequestSync = exports.inspectMigrationArchive = exports.inspectMigrationArchiveSync = exports.createMigrationArchive = exports.createMigrationArchiveSync = exports.assertDataMigrationSqliteSnapshotMatchesLiveSync = exports.getLastRestoreResultPath = exports.getPendingRestoreRequestPath = exports.ensureTarGzFileName = exports.buildDataMigrationRollbackFileName = exports.buildDataMigrationBackupFileName = exports.formatDataMigrationTimestamp = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const tar = __importStar(require("tar"));
const constants_1 = require("../../../shared/dataMigration/constants");
const appConstants_1 = require("../../appConstants");
const constants_2 = require("../sqliteBackup/constants");
const CURRENT_ARCHIVE_ROOT = appConstants_1.APP_NAME;
const MANIFEST_FILE_NAME = `.${appConstants_1.APP_ID}-migration.json`;
const PENDING_RESTORE_FILE_NAME = `.${appConstants_1.APP_ID}-data-migration-restore-pending.json`;
const LAST_RESTORE_RESULT_FILE_NAME = `.${appConstants_1.APP_ID}-data-migration-restore-result.json`;
const ARCHIVE_FORMAT = `${appConstants_1.APP_ID}-data-migration`;
const ARCHIVE_FORMAT_VERSION = 1;
const SQLITE_BACKUP_TOP_LEVEL_DIR_NAME = constants_2.SQLITE_BACKUP_DIR_NAME.split('/')[0] || 'backups';
const SQLITE_RESTORE_FILE_NAMES = [
    appConstants_1.DB_FILENAME,
    `${appConstants_1.DB_FILENAME}-wal`,
    `${appConstants_1.DB_FILENAME}-shm`,
];
const SQLITE_REPLACE_RETRY_DELAYS_MS = [
    50,
    100,
    250,
    500,
    1_000,
];
const SQLITE_MIGRATION_TABLES = [
    'kv',
    'cowork_sessions',
    'cowork_messages',
    'cowork_config',
    'agents',
    'mcp_servers',
    'mcp_launch_resolutions',
    'user_plugins',
    'user_memories',
    'user_memory_sources',
    'subagent_runs',
    'subagent_messages',
    'im_config',
    'im_session_mappings',
    'scheduled_task_meta',
    'scheduled_tasks',
    'scheduled_task_runs',
];
const SQLITE_MIGRATION_KV_KEYS = [
    'auth_tokens',
    'auth_user',
    'app_config',
    'skills_state',
    'openclaw_session_policy',
    'installation_uuid',
];
const SQLITE_CRITICAL_CONTENT_TABLES = [
    ...SQLITE_MIGRATION_TABLES,
];
const OPENCLAW_STATE_RELATIVE_PATH = 'openclaw/state';
const OPENCLAW_STATE_SUMMARY_EXCLUDED_SEGMENTS = new Set([
    '.compile-cache',
    'bin',
]);
const OPENCLAW_STATE_SUMMARY_EXCLUDED_RELATIVE_PATHS = [
    'logs',
];
const OPENCLAW_STATE_SUMMARY_EXCLUDED_FILE_NAMES = new Set([
    'gateway-port.json',
    'gateway-token',
]);
const SOURCE_EXCLUDED_TOP_LEVEL_NAMES = new Set([
    'Cache',
    'Code Cache',
    'cowork',
    'Dictionaries',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'Local State',
    'Local Storage',
    'Network',
    'Preferences',
    'Service Worker',
    'Session Storage',
    'Shared Dictionary',
    'SharedStorage',
    'SharedStorage-shm',
    'SharedStorage-wal',
    'SingletonCookie',
    'SingletonLock',
    'SingletonSocket',
    'blob_storage',
    'Crashpad',
    'install-timing.log',
    SQLITE_BACKUP_TOP_LEVEL_DIR_NAME,
    'logs',
    'lockfile',
    'runtimes',
    'skill-migrate.log',
    'sqlite-backups',
    PENDING_RESTORE_FILE_NAME,
    LAST_RESTORE_RESULT_FILE_NAME,
]);
const RESTORE_PRESERVED_TOP_LEVEL_NAMES = new Set([
    'Cache',
    'Code Cache',
    'cowork',
    'Dictionaries',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'Local State',
    'Local Storage',
    'Network',
    'Preferences',
    'Service Worker',
    'Session Storage',
    'Shared Dictionary',
    'SharedStorage',
    'SharedStorage-shm',
    'SharedStorage-wal',
    'SingletonCookie',
    'SingletonLock',
    'SingletonSocket',
    'blob_storage',
    'Crashpad',
    'install-timing.log',
    SQLITE_BACKUP_TOP_LEVEL_DIR_NAME,
    'logs',
    'lockfile',
    'runtimes',
    'skill-migrate.log',
    'sqlite-backups',
    PENDING_RESTORE_FILE_NAME,
    LAST_RESTORE_RESULT_FILE_NAME,
]);
const SOURCE_EXCLUDED_TOP_LEVEL_PREFIXES = [
    'Cookies',
    'DIPS',
    '.com.github.Electron.',
];
const RESTORE_PRESERVED_TOP_LEVEL_PREFIXES = SOURCE_EXCLUDED_TOP_LEVEL_PREFIXES;
const EXCLUDED_RELATIVE_PATHS = [
    'openclaw/logs',
    'openclaw/mcp-packages',
    'openclaw/state/logs',
];
const RESTORE_PRESERVED_RELATIVE_PATHS = [
    'openclaw/logs',
    'openclaw/mcp-packages',
    'openclaw/state/logs',
];
const ALLOWED_ENTRY_TYPES = new Set([
    'File',
    'OldFile',
    'Directory',
]);
const pad = (value, width = 2) => String(value).padStart(width, '0');
const formatDataMigrationTimestamp = (date = new Date()) => (`${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`);
exports.formatDataMigrationTimestamp = formatDataMigrationTimestamp;
const buildDataMigrationBackupFileName = (date = new Date()) => `${appConstants_1.APP_ID}-backup-${(0, exports.formatDataMigrationTimestamp)(date)}.tar.gz`;
exports.buildDataMigrationBackupFileName = buildDataMigrationBackupFileName;
const buildDataMigrationRollbackFileName = (date = new Date()) => `${appConstants_1.APP_ID}-rollback-${(0, exports.formatDataMigrationTimestamp)(date)}.tar.gz`;
exports.buildDataMigrationRollbackFileName = buildDataMigrationRollbackFileName;
const ensureTarGzFileName = (filePath) => {
    const trimmed = filePath.trim();
    return /\.tar\.gz$/i.test(trimmed) ? trimmed : `${trimmed}.tar.gz`;
};
exports.ensureTarGzFileName = ensureTarGzFileName;
const isSupportedMigrationArchivePath = (filePath) => /\.tar\.gz$/i.test(filePath) || /\.tgz$/i.test(filePath);
const getPendingRestoreRequestPath = (userDataPath) => path_1.default.join(userDataPath, PENDING_RESTORE_FILE_NAME);
exports.getPendingRestoreRequestPath = getPendingRestoreRequestPath;
const getLastRestoreResultPath = (userDataPath) => path_1.default.join(userDataPath, LAST_RESTORE_RESULT_FILE_NAME);
exports.getLastRestoreResultPath = getLastRestoreResultPath;
const resolvePath = (value) => path_1.default.resolve(value);
const isPathInside = (candidatePath, parentPath) => {
    const relative = path_1.default.relative(resolvePath(parentPath), resolvePath(candidatePath));
    return relative === '' || (!relative.startsWith('..') && !path_1.default.isAbsolute(relative));
};
const isTopLevelEntryMatch = (relativePosixPath, names, prefixes) => {
    const firstSegment = relativePosixPath.split('/')[0] || '';
    return names.has(firstSegment)
        || prefixes.some(prefix => firstSegment.startsWith(prefix));
};
const isExcludedSourceTopLevelEntry = (relativePosixPath) => isTopLevelEntryMatch(relativePosixPath, SOURCE_EXCLUDED_TOP_LEVEL_NAMES, SOURCE_EXCLUDED_TOP_LEVEL_PREFIXES);
const isPreservedRestoreTopLevelEntry = (relativePosixPath) => isTopLevelEntryMatch(relativePosixPath, RESTORE_PRESERVED_TOP_LEVEL_NAMES, RESTORE_PRESERVED_TOP_LEVEL_PREFIXES);
const isExcludedMigrationEntry = (relativePosixPath) => {
    if (!relativePosixPath)
        return false;
    if (isExcludedSourceTopLevelEntry(relativePosixPath))
        return true;
    return EXCLUDED_RELATIVE_PATHS.some(excludedPath => (relativePosixPath === excludedPath
        || relativePosixPath.startsWith(`${excludedPath}/`)));
};
const isPreservedRestoreRelativeEntry = (relativePosixPath) => (RESTORE_PRESERVED_RELATIVE_PATHS.some(preservedPath => (relativePosixPath === preservedPath
    || relativePosixPath.startsWith(`${preservedPath}/`))));
const hasPreservedRestoreRelativeDescendant = (relativePosixPath) => (RESTORE_PRESERVED_RELATIVE_PATHS.some(preservedPath => preservedPath.startsWith(`${relativePosixPath}/`)));
const isTopLevelSqliteRestoreEntry = (relativePosixPath) => {
    const firstSegment = relativePosixPath.split('/')[0] || '';
    return SQLITE_RESTORE_FILE_NAMES.includes(firstSegment);
};
const getExclusionManifestFields = (archiveKind) => {
    if (archiveKind === 'rollback') {
        return {
            excludedTopLevelNames: [...RESTORE_PRESERVED_TOP_LEVEL_NAMES].sort(),
            excludedTopLevelPrefixes: [...RESTORE_PRESERVED_TOP_LEVEL_PREFIXES].sort(),
            excludedRelativePaths: [...RESTORE_PRESERVED_RELATIVE_PATHS].sort(),
        };
    }
    return {
        excludedTopLevelNames: [...SOURCE_EXCLUDED_TOP_LEVEL_NAMES].sort(),
        excludedTopLevelPrefixes: [...SOURCE_EXCLUDED_TOP_LEVEL_PREFIXES].sort(),
        excludedRelativePaths: [...EXCLUDED_RELATIVE_PATHS].sort(),
    };
};
const shouldExcludeSourcePath = (relativePosixPath, absolutePath, input) => {
    if (!relativePosixPath)
        return false;
    const archiveKind = input.archiveKind ?? 'backup';
    if (archiveKind === 'rollback') {
        if (isPreservedRestoreTopLevelEntry(relativePosixPath))
            return true;
        if (isPreservedRestoreRelativeEntry(relativePosixPath))
            return true;
    }
    else if (isExcludedMigrationEntry(relativePosixPath)) {
        return true;
    }
    const firstSegment = relativePosixPath.split('/')[0] || '';
    if (input.sqliteSnapshotPath) {
        if (firstSegment === appConstants_1.DB_FILENAME
            || firstSegment === `${appConstants_1.DB_FILENAME}-wal`
            || firstSegment === `${appConstants_1.DB_FILENAME}-shm`) {
            return true;
        }
    }
    return isPathInside(absolutePath, input.outputPath);
};
const ensureDirSync = (dirPath) => {
    fs_1.default.mkdirSync(dirPath, { recursive: true });
};
const removeDirIfExistsSync = (dirPath) => {
    fs_1.default.rmSync(dirPath, { recursive: true, force: true });
};
const waitSync = (delayMs) => {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(signal, 0, 0, delayMs);
};
const isRetryableFileSystemError = (error) => {
    if (!error || typeof error !== 'object')
        return false;
    const code = 'code' in error ? String(error.code) : '';
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTEMPTY';
};
const retryFileSystemOperationSync = (operationName, operation) => {
    let lastError;
    for (let attempt = 0; attempt <= SQLITE_REPLACE_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            operation();
            return;
        }
        catch (error) {
            lastError = error;
            if (!isRetryableFileSystemError(error) || attempt >= SQLITE_REPLACE_RETRY_DELAYS_MS.length) {
                break;
            }
            waitSync(SQLITE_REPLACE_RETRY_DELAYS_MS[attempt]);
        }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${operationName} failed: ${message}`);
};
const removePathWithRetrySync = (targetPath) => {
    retryFileSystemOperationSync(`Remove ${path_1.default.basename(targetPath)}`, () => {
        fs_1.default.rmSync(targetPath, { recursive: true, force: true });
    });
};
const computeFileSha256Sync = (filePath) => {
    const hash = crypto_1.default.createHash('sha256');
    hash.update(fs_1.default.readFileSync(filePath));
    return hash.digest('hex');
};
const copyFileSync = (sourcePath, targetPath) => {
    ensureDirSync(path_1.default.dirname(targetPath));
    fs_1.default.copyFileSync(sourcePath, targetPath);
};
const copyFileReplacingWithRetrySync = (sourcePath, targetPath) => {
    ensureDirSync(path_1.default.dirname(targetPath));
    const tempTargetPath = path_1.default.join(path_1.default.dirname(targetPath), `.${path_1.default.basename(targetPath)}.restore-${crypto_1.default.randomUUID()}.tmp`);
    try {
        copyFileSync(sourcePath, tempTargetPath);
        retryFileSystemOperationSync(`Replace ${path_1.default.basename(targetPath)}`, () => {
            fs_1.default.renameSync(tempTargetPath, targetPath);
        });
    }
    finally {
        try {
            fs_1.default.rmSync(tempTargetPath, { force: true });
        }
        catch {
            // Ignore temporary cleanup failures; the final target has already been verified later.
        }
    }
};
const copyDirectorySync = (sourceRoot, targetRoot, shouldExclude) => {
    const copyEntry = (sourcePath, targetPath, relativePosixPath) => {
        if (shouldExclude?.(relativePosixPath, sourcePath))
            return;
        const stat = fs_1.default.lstatSync(sourcePath);
        if (stat.isSymbolicLink())
            return;
        if (stat.isDirectory()) {
            ensureDirSync(targetPath);
            for (const entry of fs_1.default.readdirSync(sourcePath)) {
                const childRelative = relativePosixPath
                    ? `${relativePosixPath}/${entry}`
                    : entry;
                copyEntry(path_1.default.join(sourcePath, entry), path_1.default.join(targetPath, entry), childRelative);
            }
            return;
        }
        if (stat.isFile()) {
            copyFileSync(sourcePath, targetPath);
        }
    };
    copyEntry(sourceRoot, targetRoot, '');
};
const writeJsonSync = (filePath, value) => {
    ensureDirSync(path_1.default.dirname(filePath));
    fs_1.default.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const readJsonFileSync = (filePath) => {
    try {
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
};
const tableExists = (db, tableName) => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    return Boolean(row);
};
const quoteSqliteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;
const getTableColumns = (db, tableName) => (db.pragma(`table_info(${quoteSqliteIdentifier(tableName)})`)
    .map(column => column.name));
const readApplicationTableNames = (db) => (db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all()
    .map(row => row.name)
    .filter(name => name.trim().length > 0));
const normalizeSqliteValueForHash = (value) => {
    if (Buffer.isBuffer(value)) {
        return {
            type: 'buffer',
            sha256: crypto_1.default.createHash('sha256').update(value).digest('hex'),
            sizeBytes: value.length,
        };
    }
    return value;
};
const computeTableContentChecksum = (db, tableName) => {
    if (!tableExists(db, tableName))
        return undefined;
    const columns = getTableColumns(db, tableName);
    if (columns.length === 0)
        return undefined;
    const rows = db
        .prepare(`SELECT ${columns.map(quoteSqliteIdentifier).join(', ')} FROM ${quoteSqliteIdentifier(tableName)}`)
        .all();
    const serializedRows = rows
        .map(row => JSON.stringify(columns.map(column => normalizeSqliteValueForHash(row[column]))))
        .sort();
    const hash = crypto_1.default.createHash('sha256');
    hash.update(tableName);
    hash.update('\0');
    hash.update(columns.join('\0'));
    hash.update('\0');
    for (const row of serializedRows) {
        hash.update(row);
        hash.update('\n');
    }
    return hash.digest('hex');
};
const readTableRowCounts = (db, tableNames) => {
    const rowCounts = {};
    for (const tableName of tableNames) {
        const count = db
            .prepare(`SELECT COUNT(*) FROM ${quoteSqliteIdentifier(tableName)}`)
            .pluck()
            .get();
        rowCounts[tableName] = Number(count) || 0;
    }
    return rowCounts;
};
const readTableContentChecksums = (db) => {
    const checksums = {};
    for (const tableName of SQLITE_CRITICAL_CONTENT_TABLES) {
        const checksum = computeTableContentChecksum(db, tableName);
        if (checksum) {
            checksums[tableName] = checksum;
        }
    }
    return checksums;
};
const readKvValueChecksums = (db) => {
    if (!tableExists(db, 'kv'))
        return {};
    const rows = db
        .prepare(`SELECT key, value FROM kv WHERE key IN (${SQLITE_MIGRATION_KV_KEYS.map(() => '?').join(', ')})`)
        .all(...SQLITE_MIGRATION_KV_KEYS);
    return Object.fromEntries(rows
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(row => [row.key, crypto_1.default.createHash('sha256').update(row.value).digest('hex')]));
};
const readAgentIds = (db) => {
    if (!tableExists(db, 'agents'))
        return [];
    return db.prepare('SELECT id FROM agents ORDER BY id').all()
        .map(row => row.id)
        .filter(id => id.trim().length > 0);
};
const readSessionCountsByAgentId = (db) => {
    if (!tableExists(db, 'cowork_sessions'))
        return {};
    const columns = new Set(getTableColumns(db, 'cowork_sessions'));
    const sql = columns.has('agent_id')
        ? `
      SELECT COALESCE(NULLIF(TRIM(agent_id), ''), 'main') as agent_id, COUNT(*) as count
      FROM cowork_sessions
      GROUP BY COALESCE(NULLIF(TRIM(agent_id), ''), 'main')
      ORDER BY agent_id
    `
        : `
      SELECT 'main' as agent_id, COUNT(*) as count
      FROM cowork_sessions
    `;
    const rows = db.prepare(sql).all();
    return Object.fromEntries(rows.map(row => [row.agent_id, Number(row.count) || 0]));
};
const readAppConfigProviderSummary = (db) => {
    if (!tableExists(db, 'kv')) {
        return {
            primaryApiKeyPresent: false,
            providerKeys: [],
            enabledProviderKeys: [],
            providerKeysWithApiKey: [],
            customProviderKeys: [],
        };
    }
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('app_config');
    if (!row?.value) {
        return {
            primaryApiKeyPresent: false,
            providerKeys: [],
            enabledProviderKeys: [],
            providerKeysWithApiKey: [],
            customProviderKeys: [],
        };
    }
    try {
        const config = JSON.parse(row.value);
        const providers = config.providers && typeof config.providers === 'object'
            ? config.providers
            : {};
        const providerKeys = Object.keys(providers).sort();
        return {
            appConfigChecksumSha256: crypto_1.default.createHash('sha256').update(row.value).digest('hex'),
            primaryApiKeyPresent: typeof config.api?.key === 'string' && config.api.key.trim().length > 0,
            providerKeys,
            enabledProviderKeys: providerKeys
                .filter(key => providers[key]?.enabled === true)
                .sort(),
            providerKeysWithApiKey: providerKeys
                .filter(key => typeof providers[key]?.apiKey === 'string' && providers[key].apiKey.trim().length > 0)
                .sort(),
            customProviderKeys: providerKeys
                .filter(key => key.startsWith('custom_') || key === 'custom')
                .sort(),
        };
    }
    catch {
        return {
            appConfigChecksumSha256: crypto_1.default.createHash('sha256').update(row.value).digest('hex'),
            primaryApiKeyPresent: false,
            providerKeys: [],
            enabledProviderKeys: [],
            providerKeysWithApiKey: [],
            customProviderKeys: [],
        };
    }
};
const readImConfigSummary = (db) => {
    if (!tableExists(db, 'im_config')) {
        return { imConfigKeys: [], imConfigValueChecksums: {} };
    }
    const rows = db
        .prepare('SELECT key, value FROM im_config ORDER BY key')
        .all();
    return {
        imConfigKeys: rows.map(row => row.key),
        imConfigValueChecksums: Object.fromEntries(rows.map(row => [
            row.key,
            crypto_1.default.createHash('sha256').update(row.value ?? '').digest('hex'),
        ])),
    };
};
const readScheduledTaskMetaIds = (db) => {
    if (!tableExists(db, 'scheduled_task_meta'))
        return [];
    return db.prepare('SELECT task_id FROM scheduled_task_meta ORDER BY task_id').all()
        .map(row => row.task_id)
        .filter(id => id.trim().length > 0);
};
const readSqliteMigrationSummarySync = (dbPath) => {
    if (!fs_1.default.existsSync(dbPath))
        return { exists: false };
    const stat = fs_1.default.statSync(dbPath);
    let db = null;
    try {
        db = new better_sqlite3_1.default(dbPath, { readonly: true, fileMustExist: true });
        const quickCheck = String(db.prepare('PRAGMA quick_check').pluck().get() ?? '');
        const tableNames = readApplicationTableNames(db);
        const rowCounts = readTableRowCounts(db, tableNames);
        const kvKeys = tableExists(db, 'kv')
            ? SQLITE_MIGRATION_KV_KEYS.filter((key) => {
                const row = db?.prepare('SELECT key FROM kv WHERE key = ?').get(key);
                return Boolean(row);
            })
            : [];
        const providerSummary = readAppConfigProviderSummary(db);
        const imConfigSummary = readImConfigSummary(db);
        return {
            exists: true,
            sizeBytes: stat.size,
            checksumSha256: computeFileSha256Sync(dbPath),
            quickCheck,
            tableNames,
            rowCounts,
            tableContentChecksums: readTableContentChecksums(db),
            kvKeys,
            kvValueChecksums: readKvValueChecksums(db),
            agentIds: readAgentIds(db),
            sessionCountsByAgentId: readSessionCountsByAgentId(db),
            scheduledTaskMetaIds: readScheduledTaskMetaIds(db),
            ...providerSummary,
            ...imConfigSummary,
        };
    }
    catch (error) {
        return {
            exists: true,
            sizeBytes: stat.size,
            error: error instanceof Error ? error.message : String(error),
        };
    }
    finally {
        db?.close();
    }
};
const assertMigrationSqliteReadySync = (dbPath, label) => {
    const summary = readSqliteMigrationSummarySync(dbPath);
    if (!summary.exists) {
        throw new Error(`${label} is missing ${appConstants_1.DB_FILENAME}.`);
    }
    if (summary.error) {
        throw new Error(`${label} contains an unreadable ${appConstants_1.DB_FILENAME}: ${summary.error}`);
    }
    if (summary.quickCheck !== 'ok') {
        throw new Error(`${label} ${appConstants_1.DB_FILENAME} failed quick_check: ${summary.quickCheck || 'empty result'}`);
    }
    return summary;
};
const arraysEqual = (left = [], right = []) => (left.length === right.length && left.every((value, index) => value === right[index]));
const recordsEqual = (left = {}, right = {}) => {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return arraysEqual(leftKeys, rightKeys)
        && leftKeys.every(key => left[key] === right[key]);
};
const stringRecordsEqual = (left = {}, right = {}) => {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return arraysEqual(leftKeys, rightKeys)
        && leftKeys.every(key => left[key] === right[key]);
};
const assertStringArraySummaryFieldMatches = (sourceSummary, targetSummary, fieldName, label) => {
    const sourceValues = sourceSummary[fieldName] ?? [];
    const targetValues = targetSummary[fieldName] ?? [];
    if (!arraysEqual(sourceValues, targetValues)) {
        throw new Error(`${label} ${fieldName} mismatch: expected [${sourceValues.join(', ')}], got [${targetValues.join(', ')}].`);
    }
};
const assertSqliteCriticalSummaryMatches = (sourceSummary, targetSummary, label) => {
    for (const fieldName of [
        'tableNames',
        'kvKeys',
        'agentIds',
        'providerKeys',
        'enabledProviderKeys',
        'providerKeysWithApiKey',
        'customProviderKeys',
        'imConfigKeys',
        'scheduledTaskMetaIds',
    ]) {
        assertStringArraySummaryFieldMatches(sourceSummary, targetSummary, fieldName, label);
    }
    if (!recordsEqual(sourceSummary.rowCounts, targetSummary.rowCounts)) {
        throw new Error(`${label} rowCounts mismatch: expected ${JSON.stringify(sourceSummary.rowCounts ?? {})}, got ${JSON.stringify(targetSummary.rowCounts ?? {})}.`);
    }
    if (!stringRecordsEqual(sourceSummary.tableContentChecksums, targetSummary.tableContentChecksums)) {
        throw new Error(`${label} tableContentChecksums mismatch.`);
    }
    if (!stringRecordsEqual(sourceSummary.kvValueChecksums, targetSummary.kvValueChecksums)) {
        throw new Error(`${label} kvValueChecksums mismatch.`);
    }
    if (!stringRecordsEqual(sourceSummary.imConfigValueChecksums, targetSummary.imConfigValueChecksums)) {
        throw new Error(`${label} imConfigValueChecksums mismatch.`);
    }
    if (sourceSummary.appConfigChecksumSha256 !== targetSummary.appConfigChecksumSha256) {
        throw new Error(`${label} appConfigChecksumSha256 mismatch.`);
    }
    if (sourceSummary.primaryApiKeyPresent !== targetSummary.primaryApiKeyPresent) {
        throw new Error(`${label} primaryApiKeyPresent mismatch.`);
    }
    if (!recordsEqual(sourceSummary.sessionCountsByAgentId, targetSummary.sessionCountsByAgentId)) {
        throw new Error(`${label} sessionCountsByAgentId mismatch: expected ${JSON.stringify(sourceSummary.sessionCountsByAgentId ?? {})}, got ${JSON.stringify(targetSummary.sessionCountsByAgentId ?? {})}.`);
    }
};
const assertDataMigrationSqliteSnapshotMatchesLiveSync = (liveDbPath, snapshotDbPath) => {
    const liveSummary = assertMigrationSqliteReadySync(liveDbPath, 'Live data');
    const snapshotSummary = assertMigrationSqliteReadySync(snapshotDbPath, 'Backup snapshot');
    assertSqliteCriticalSummaryMatches(liveSummary, snapshotSummary, 'Backup snapshot');
};
exports.assertDataMigrationSqliteSnapshotMatchesLiveSync = assertDataMigrationSqliteSnapshotMatchesLiveSync;
const checkpointSqliteDatabaseSync = (dbPath, label) => {
    for (const fileName of SQLITE_RESTORE_FILE_NAMES) {
        const sqlitePath = path_1.default.join(path_1.default.dirname(dbPath), fileName);
        if (!fs_1.default.existsSync(sqlitePath))
            continue;
        try {
            fs_1.default.chmodSync(sqlitePath, 0o600);
        }
        catch {
            // Best effort; extracted archives may already have writable files.
        }
    }
    let db = null;
    try {
        db = new better_sqlite3_1.default(dbPath, { fileMustExist: true });
        db.pragma('wal_checkpoint(TRUNCATE)');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${label} failed to checkpoint ${appConstants_1.DB_FILENAME}: ${message}`);
    }
    finally {
        db?.close();
    }
};
const toPosixPath = (value) => value.replace(/\\/g, '/');
const shouldExcludeOpenClawStateSummaryPath = (relativePosixPath) => {
    const segments = relativePosixPath.split('/').filter(Boolean);
    if (segments.some(segment => OPENCLAW_STATE_SUMMARY_EXCLUDED_SEGMENTS.has(segment))) {
        return true;
    }
    if (OPENCLAW_STATE_SUMMARY_EXCLUDED_RELATIVE_PATHS.some(excludedPath => (relativePosixPath === excludedPath
        || relativePosixPath.startsWith(`${excludedPath}/`)))) {
        return true;
    }
    const fileName = segments[segments.length - 1] ?? '';
    return OPENCLAW_STATE_SUMMARY_EXCLUDED_FILE_NAMES.has(fileName);
};
const readOpenClawStateMigrationSummarySync = (userDataPath) => {
    const stateRoot = path_1.default.join(userDataPath, ...OPENCLAW_STATE_RELATIVE_PATH.split('/'));
    if (!fs_1.default.existsSync(stateRoot))
        return { exists: false };
    if (!fs_1.default.statSync(stateRoot).isDirectory()) {
        return { exists: false, error: `${OPENCLAW_STATE_RELATIVE_PATH} is not a directory` };
    }
    try {
        const files = [];
        const visit = (dirPath) => {
            for (const entryName of fs_1.default.readdirSync(dirPath)) {
                const absolutePath = path_1.default.join(dirPath, entryName);
                const relativePath = toPosixPath(path_1.default.relative(stateRoot, absolutePath));
                if (!relativePath || shouldExcludeOpenClawStateSummaryPath(relativePath))
                    continue;
                const stat = fs_1.default.lstatSync(absolutePath);
                if (stat.isSymbolicLink())
                    continue;
                if (stat.isDirectory()) {
                    visit(absolutePath);
                    continue;
                }
                if (!stat.isFile())
                    continue;
                files.push({ relativePath, absolutePath, sizeBytes: stat.size });
            }
        };
        visit(stateRoot);
        files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
        const hash = crypto_1.default.createHash('sha256');
        let totalSizeBytes = 0;
        for (const file of files) {
            totalSizeBytes += file.sizeBytes;
            hash.update(file.relativePath);
            hash.update('\0');
            hash.update(String(file.sizeBytes));
            hash.update('\0');
            hash.update(fs_1.default.readFileSync(file.absolutePath));
            hash.update('\0');
        }
        return {
            exists: true,
            fileCount: files.length,
            totalSizeBytes,
            checksumSha256: hash.digest('hex'),
            cronFileCount: files.filter(file => file.relativePath === 'cron' || file.relativePath.startsWith('cron/')).length,
            cronRunFileCount: files.filter(file => file.relativePath.startsWith('cron/runs/')).length,
            agentSessionFileCount: files.filter(file => file.relativePath.includes('/sessions/')).length,
            openclawConfigExists: files.some(file => file.relativePath === 'openclaw.json'),
            sampledRelativePaths: files.slice(0, 50).map(file => file.relativePath),
        };
    }
    catch (error) {
        return {
            exists: true,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};
const assertOpenClawStateSummaryMatches = (sourceUserDataPath, targetUserDataPath, label) => {
    const sourceSummary = readOpenClawStateMigrationSummarySync(sourceUserDataPath);
    const targetSummary = readOpenClawStateMigrationSummarySync(targetUserDataPath);
    assertOpenClawStateSummaryValuesMatch(sourceSummary, targetSummary, label);
};
const assertOpenClawStateSummaryValuesMatch = (sourceSummary, targetSummary, label) => {
    if (sourceSummary.error || targetSummary.error) {
        throw new Error(`${label} engine state summary failed: ${sourceSummary.error || targetSummary.error}`);
    }
    for (const fieldName of [
        'exists',
        'fileCount',
        'totalSizeBytes',
        'checksumSha256',
        'cronFileCount',
        'cronRunFileCount',
        'agentSessionFileCount',
        'openclawConfigExists',
    ]) {
        if (sourceSummary[fieldName] !== targetSummary[fieldName]) {
            throw new Error(`${label} engine state ${fieldName} mismatch: expected ${String(sourceSummary[fieldName])}, got ${String(targetSummary[fieldName])}.`);
        }
    }
};
const readMigrationManifestSync = (sourceRoot) => {
    const manifestPath = path_1.default.join(sourceRoot, MANIFEST_FILE_NAME);
    if (!fs_1.default.existsSync(manifestPath)) {
        throw new Error(`Backup archive is missing ${MANIFEST_FILE_NAME}.`);
    }
    let manifest;
    try {
        manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Backup archive contains an unreadable ${MANIFEST_FILE_NAME}: ${message}`);
    }
    if (manifest.format !== ARCHIVE_FORMAT) {
        throw new Error(`Backup archive manifest format is unsupported: ${manifest.format || 'missing'}.`);
    }
    if (manifest.version !== ARCHIVE_FORMAT_VERSION) {
        throw new Error(`Backup archive manifest version is unsupported: ${String(manifest.version ?? 'missing')}.`);
    }
    if (manifest.archiveRoot !== CURRENT_ARCHIVE_ROOT) {
        throw new Error(`Backup archive manifest root is unsupported: ${manifest.archiveRoot || 'missing'}.`);
    }
    return manifest;
};
const assertManifestSqliteSummaryMatches = (manifestSummary, actualSummary, label) => {
    if (!manifestSummary) {
        throw new Error(`${label} is missing sqlite summary.`);
    }
    if (manifestSummary.exists !== actualSummary.exists) {
        throw new Error(`${label} sqlite existence mismatch.`);
    }
    if (!manifestSummary.exists) {
        return;
    }
    if (manifestSummary.error || actualSummary.error) {
        throw new Error(`${label} sqlite summary failed: ${manifestSummary.error || actualSummary.error}`);
    }
    if (manifestSummary.quickCheck !== actualSummary.quickCheck) {
        throw new Error(`${label} sqlite quick_check mismatch.`);
    }
    if (manifestSummary.sizeBytes !== actualSummary.sizeBytes) {
        throw new Error(`${label} sqlite sizeBytes mismatch.`);
    }
    if (manifestSummary.checksumSha256 !== actualSummary.checksumSha256) {
        throw new Error(`${label} sqlite checksum mismatch.`);
    }
    assertSqliteCriticalSummaryMatches(manifestSummary, actualSummary, label);
};
const validateExtractedArchiveContentSync = (sourceRoot) => {
    const manifest = readMigrationManifestSync(sourceRoot);
    const sqliteSummary = assertMigrationSqliteReadySync(path_1.default.join(sourceRoot, appConstants_1.DB_FILENAME), 'Backup archive');
    assertManifestSqliteSummaryMatches(manifest.sqlite, sqliteSummary, 'Backup archive manifest');
    if (!manifest.openclawState) {
        throw new Error('Backup archive manifest is missing the engine state summary.');
    }
    assertOpenClawStateSummaryValuesMatch(manifest.openclawState, readOpenClawStateMigrationSummarySync(sourceRoot), 'Backup archive manifest');
    return manifest;
};
const buildManifest = (input, manifestUserDataPath = resolvePath(input.userDataPath)) => {
    const now = input.now ?? new Date();
    const archiveKind = input.archiveKind ?? 'backup';
    const sqliteSourcePath = input.sqliteSnapshotPath
        ? resolvePath(input.sqliteSnapshotPath)
        : path_1.default.join(resolvePath(input.userDataPath), appConstants_1.DB_FILENAME);
    return {
        format: ARCHIVE_FORMAT,
        version: ARCHIVE_FORMAT_VERSION,
        appName: appConstants_1.APP_NAME,
        archiveKind,
        archiveRoot: CURRENT_ARCHIVE_ROOT,
        createdAt: now.toISOString(),
        platform: process.platform,
        arch: process.arch,
        includesWorkingDirectories: false,
        ...getExclusionManifestFields(archiveKind),
        sqlite: readSqliteMigrationSummarySync(sqliteSourcePath),
        openclawState: readOpenClawStateMigrationSummarySync(manifestUserDataPath),
    };
};
const createMigrationArchiveSync = (input) => {
    const userDataPath = resolvePath(input.userDataPath);
    const outputPath = resolvePath(input.outputPath);
    const archiveKind = input.archiveKind ?? 'backup';
    const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), `${appConstants_1.APP_ID}-data-migration-`));
    const stageParent = path_1.default.join(tempRoot, 'stage');
    const stageUserDataRoot = path_1.default.join(stageParent, CURRENT_ARCHIVE_ROOT);
    try {
        ensureDirSync(stageUserDataRoot);
        copyDirectorySync(userDataPath, stageUserDataRoot, (relativePosixPath, absolutePath) => shouldExcludeSourcePath(relativePosixPath, absolutePath, {
            ...input,
            userDataPath,
            outputPath,
        }));
        if (input.sqliteSnapshotPath) {
            copyFileSync(resolvePath(input.sqliteSnapshotPath), path_1.default.join(stageUserDataRoot, appConstants_1.DB_FILENAME));
        }
        if (archiveKind !== 'rollback') {
            assertMigrationSqliteReadySync(path_1.default.join(stageUserDataRoot, appConstants_1.DB_FILENAME), 'Backup staging');
            assertOpenClawStateSummaryMatches(userDataPath, stageUserDataRoot, 'Backup staging');
        }
        writeJsonSync(path_1.default.join(stageUserDataRoot, MANIFEST_FILE_NAME), buildManifest(input, stageUserDataRoot));
        ensureDirSync(path_1.default.dirname(outputPath));
        tar.create({
            sync: true,
            gzip: true,
            file: outputPath,
            cwd: stageParent,
            portable: true,
        }, [CURRENT_ARCHIVE_ROOT]);
        if (archiveKind !== 'rollback') {
            (0, exports.inspectMigrationArchiveSync)(outputPath);
        }
        return {
            outputPath,
            sizeBytes: fs_1.default.statSync(outputPath).size,
        };
    }
    finally {
        removeDirIfExistsSync(tempRoot);
    }
};
exports.createMigrationArchiveSync = createMigrationArchiveSync;
const createMigrationArchive = async (input) => (0, exports.createMigrationArchiveSync)(input);
exports.createMigrationArchive = createMigrationArchive;
const normalizeArchiveEntryPath = (entryPath) => {
    let normalized = entryPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    while (normalized.startsWith('./')) {
        normalized = normalized.slice(2);
    }
    return normalized;
};
const assertSafeArchiveEntryPath = (entryPath) => {
    const normalized = normalizeArchiveEntryPath(entryPath);
    if (!normalized || normalized.includes('\0')) {
        throw new Error('Backup archive contains an empty or invalid path.');
    }
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
        throw new Error(`Backup archive contains an absolute path: ${entryPath}`);
    }
    if (normalized.split('/').some(segment => segment === '..')) {
        throw new Error(`Backup archive contains a parent-directory path: ${entryPath}`);
    }
    return normalized;
};
const resolveArchiveRoot = (entryPath) => {
    if (entryPath === CURRENT_ARCHIVE_ROOT || entryPath.startsWith(`${CURRENT_ARCHIVE_ROOT}/`)) {
        return { root: CURRENT_ARCHIVE_ROOT };
    }
    return null;
};
const isArchiveSqliteDatabaseEntry = (entryPath, root) => entryPath === `${root}/${appConstants_1.DB_FILENAME}`;
const isArchiveRootParentDirectory = (entryPath) => (`${CURRENT_ARCHIVE_ROOT}/`.startsWith(`${entryPath}/`));
const isArchiveManifestEntry = (entryPath, root) => entryPath === `${root}/${MANIFEST_FILE_NAME}`;
const inspectArchiveEntry = (archivePath, entry, state) => {
    const normalizedPath = assertSafeArchiveEntryPath(entry.path);
    if (entry.type && !ALLOWED_ENTRY_TYPES.has(entry.type)) {
        throw new Error(`Backup archive contains an unsupported entry type: ${entry.type}`);
    }
    const root = resolveArchiveRoot(normalizedPath);
    if (!root) {
        if (entry.type === 'Directory' && isArchiveRootParentDirectory(normalizedPath)) {
            return;
        }
        throw new Error(`Backup archive does not contain ${appConstants_1.APP_NAME} user data: ${entry.path}`);
    }
    if (state.root && state.root.root !== root.root) {
        throw new Error(`Backup archive contains multiple root directories: ${archivePath}`);
    }
    state.root = root;
    state.entryCount += 1;
    if (isArchiveSqliteDatabaseEntry(normalizedPath, root.root)) {
        if (entry.type && entry.type !== 'File' && entry.type !== 'OldFile') {
            throw new Error(`Backup archive ${appConstants_1.DB_FILENAME} entry is not a file.`);
        }
        state.hasSqliteDatabase = true;
    }
    if (isArchiveManifestEntry(normalizedPath, root.root)) {
        if (entry.type && entry.type !== 'File' && entry.type !== 'OldFile') {
            throw new Error(`Backup archive ${MANIFEST_FILE_NAME} entry is not a file.`);
        }
        state.hasManifest = true;
    }
};
const validateArchiveContentSync = (archivePath, root) => {
    const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'lobsterai-data-migration-inspect-'));
    try {
        tar.extract({
            sync: true,
            file: archivePath,
            cwd: tempRoot,
            preservePaths: false,
            unlink: true,
            filter: (entryPath, entry) => {
                const normalizedPath = assertSafeArchiveEntryPath(entryPath);
                if ('type' in entry && entry.type && !ALLOWED_ENTRY_TYPES.has(entry.type)) {
                    throw new Error(`Backup archive contains an unsupported entry type: ${entry.type}`);
                }
                const archiveRoot = resolveArchiveRoot(normalizedPath);
                const isDirectoryEntry = 'type' in entry
                    ? entry.type === 'Directory'
                    : entry.isDirectory();
                return Boolean((archiveRoot && archiveRoot.root === root)
                    || (isDirectoryEntry && isArchiveRootParentDirectory(normalizedPath)));
            },
        });
        validateExtractedArchiveContentSync(path_1.default.join(tempRoot, ...root.split('/')));
    }
    finally {
        removeDirIfExistsSync(tempRoot);
    }
};
const inspectMigrationArchiveSync = (archivePath, options = {}) => {
    const resolvedArchivePath = resolvePath(archivePath);
    if (!isSupportedMigrationArchivePath(resolvedArchivePath)) {
        throw new Error('Backup archive must be a .tar.gz or .tgz file.');
    }
    const requireSqliteDatabase = options.requireSqliteDatabase ?? true;
    const validateSqliteDatabase = options.validateSqliteDatabase ?? true;
    const requireManifest = options.requireManifest ?? true;
    const validateManifest = options.validateManifest ?? true;
    const state = {
        root: null,
        entryCount: 0,
        hasSqliteDatabase: false,
        hasManifest: false,
    };
    tar.list({
        sync: true,
        file: resolvedArchivePath,
        onentry: entry => inspectArchiveEntry(resolvedArchivePath, entry, state),
    });
    if (!state.root || state.entryCount <= 0) {
        throw new Error('Backup archive is empty or missing Caisra user data.');
    }
    if (requireSqliteDatabase && !state.hasSqliteDatabase) {
        throw new Error(`Backup archive is missing ${appConstants_1.DB_FILENAME}.`);
    }
    if (requireManifest && !state.hasManifest) {
        throw new Error(`Backup archive is missing ${MANIFEST_FILE_NAME}.`);
    }
    if ((requireSqliteDatabase && validateSqliteDatabase)
        || (requireManifest && validateManifest)) {
        validateArchiveContentSync(resolvedArchivePath, state.root.root);
    }
    return {
        archivePath: resolvedArchivePath,
        root: state.root.root,
        entryCount: state.entryCount,
        hasSqliteDatabase: state.hasSqliteDatabase,
        hasManifest: state.hasManifest,
    };
};
exports.inspectMigrationArchiveSync = inspectMigrationArchiveSync;
const inspectMigrationArchive = async (archivePath) => (0, exports.inspectMigrationArchiveSync)(archivePath);
exports.inspectMigrationArchive = inspectMigrationArchive;
const extractMigrationArchiveToTempSync = (archivePath, options = {}) => {
    const info = (0, exports.inspectMigrationArchiveSync)(archivePath, {
        requireSqliteDatabase: options.requireSqliteDatabase,
        requireManifest: options.requireManifest,
        validateSqliteDatabase: false,
        validateManifest: false,
    });
    const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'lobsterai-data-migration-restore-'));
    try {
        tar.extract({
            sync: true,
            file: info.archivePath,
            cwd: tempRoot,
            preservePaths: false,
            unlink: true,
            filter: (entryPath, entry) => {
                const normalizedPath = assertSafeArchiveEntryPath(entryPath);
                if ('type' in entry && entry.type && !ALLOWED_ENTRY_TYPES.has(entry.type)) {
                    throw new Error(`Backup archive contains an unsupported entry type: ${entry.type}`);
                }
                const root = resolveArchiveRoot(normalizedPath);
                const isDirectoryEntry = 'type' in entry
                    ? entry.type === 'Directory'
                    : entry.isDirectory();
                return Boolean((root && root.root === info.root)
                    || (isDirectoryEntry && isArchiveRootParentDirectory(normalizedPath)));
            },
        });
        const sourceRoot = path_1.default.join(tempRoot, ...info.root.split('/'));
        if (!fs_1.default.existsSync(sourceRoot) || !fs_1.default.statSync(sourceRoot).isDirectory()) {
            throw new Error('Backup archive did not extract a valid Caisra user data directory.');
        }
        if (options.validateArchiveContent ?? true) {
            validateExtractedArchiveContentSync(sourceRoot);
        }
        return { tempRoot, sourceRoot, info };
    }
    catch (error) {
        removeDirIfExistsSync(tempRoot);
        throw error;
    }
};
const writePendingRestoreRequestSync = (userDataPath, archivePath, now = new Date()) => {
    const request = {
        archivePath: resolvePath(archivePath),
        requestedAt: now.toISOString(),
    };
    writeJsonSync((0, exports.getPendingRestoreRequestPath)(userDataPath), request);
    return request;
};
exports.writePendingRestoreRequestSync = writePendingRestoreRequestSync;
const consumeLastRestoreResultSync = (userDataPath) => {
    const resultPath = (0, exports.getLastRestoreResultPath)(userDataPath);
    const result = readJsonFileSync(resultPath);
    if (result) {
        try {
            fs_1.default.unlinkSync(resultPath);
        }
        catch {
            // Ignore marker cleanup failures.
        }
    }
    return result;
};
exports.consumeLastRestoreResultSync = consumeLastRestoreResultSync;
const writeRestoreResultSync = (userDataPath, result) => {
    writeJsonSync((0, exports.getLastRestoreResultPath)(userDataPath), result);
};
const buildFailedRestoreResult = (archivePath, rollbackPath, error, now) => ({
    status: constants_1.DataMigrationRestoreStatus.Failed,
    archivePath,
    rollbackPath,
    restoredAt: now.toISOString(),
    error: error instanceof Error ? error.message : String(error),
});
const clearRestorableUserDataSync = (userDataPath) => {
    ensureDirSync(userDataPath);
    const clearEntry = (absolutePath, relativePosixPath) => {
        if (isPreservedRestoreTopLevelEntry(relativePosixPath))
            return;
        if (isPreservedRestoreRelativeEntry(relativePosixPath))
            return;
        if (isTopLevelSqliteRestoreEntry(relativePosixPath))
            return;
        if (hasPreservedRestoreRelativeDescendant(relativePosixPath)) {
            const stat = fs_1.default.lstatSync(absolutePath);
            if (!stat.isDirectory() || stat.isSymbolicLink()) {
                removeDirIfExistsSync(absolutePath);
                return;
            }
            for (const entry of fs_1.default.readdirSync(absolutePath)) {
                clearEntry(path_1.default.join(absolutePath, entry), `${relativePosixPath}/${entry}`);
            }
            if (fs_1.default.readdirSync(absolutePath).length === 0) {
                removeDirIfExistsSync(absolutePath);
            }
            return;
        }
        removeDirIfExistsSync(absolutePath);
    };
    for (const entry of fs_1.default.readdirSync(userDataPath)) {
        clearEntry(path_1.default.join(userDataPath, entry), entry);
    }
};
const replaceSqliteDatabaseSync = (sourceRoot, userDataPath, options = {}) => {
    const sourceDbPath = path_1.default.join(sourceRoot, appConstants_1.DB_FILENAME);
    const targetDbPath = path_1.default.join(userDataPath, appConstants_1.DB_FILENAME);
    for (const fileName of SQLITE_RESTORE_FILE_NAMES) {
        removePathWithRetrySync(path_1.default.join(userDataPath, fileName));
    }
    if (!fs_1.default.existsSync(sourceDbPath)) {
        return;
    }
    if (!fs_1.default.statSync(sourceDbPath).isFile()) {
        throw new Error(`Backup archive ${appConstants_1.DB_FILENAME} entry is not a file.`);
    }
    copyFileReplacingWithRetrySync(sourceDbPath, targetDbPath);
    if (!options.includeSidecars) {
        return;
    }
    for (const fileName of SQLITE_RESTORE_FILE_NAMES.slice(1)) {
        const sourcePath = path_1.default.join(sourceRoot, fileName);
        if (!fs_1.default.existsSync(sourcePath))
            continue;
        if (!fs_1.default.statSync(sourcePath).isFile())
            continue;
        copyFileReplacingWithRetrySync(sourcePath, path_1.default.join(userDataPath, fileName));
    }
};
const removeSqliteSidecarsWithRetrySync = (userDataPath) => {
    for (const fileName of SQLITE_RESTORE_FILE_NAMES.slice(1)) {
        removePathWithRetrySync(path_1.default.join(userDataPath, fileName));
    }
};
const invalidateMcpLaunchResolutionsSync = (dbPath) => {
    if (!fs_1.default.existsSync(dbPath))
        return;
    let db = null;
    try {
        db = new better_sqlite3_1.default(dbPath);
        if (!tableExists(db, 'mcp_launch_resolutions'))
            return;
        const columns = new Set(getTableColumns(db, 'mcp_launch_resolutions'));
        const clauses = [];
        const params = [];
        if (columns.has('install_dir')) {
            clauses.push('install_dir IS NOT NULL');
        }
        if (columns.has('command')) {
            clauses.push('command LIKE ?');
            params.push('%mcp-packages%');
        }
        if (columns.has('args_json')) {
            clauses.push('args_json LIKE ?');
            params.push('%mcp-packages%');
        }
        if (clauses.length === 0) {
            db.prepare('DELETE FROM mcp_launch_resolutions').run();
            return;
        }
        db.prepare(`DELETE FROM mcp_launch_resolutions WHERE ${clauses.join(' OR ')}`).run(...params);
    }
    finally {
        db?.close();
    }
};
const replaceRestorableUserDataSync = (sourceRoot, userDataPath, shouldExcludeCopiedEntry = (relativePosixPath) => isExcludedMigrationEntry(relativePosixPath), options = {}) => {
    clearRestorableUserDataSync(userDataPath);
    copyDirectorySync(sourceRoot, userDataPath, (relativePosixPath, absolutePath) => (isTopLevelSqliteRestoreEntry(relativePosixPath)
        || isPreservedRestoreRelativeEntry(relativePosixPath)
        || shouldExcludeCopiedEntry(relativePosixPath, absolutePath)));
    replaceSqliteDatabaseSync(sourceRoot, userDataPath, {
        includeSidecars: options.includeSqliteSidecars,
    });
};
const assertSqliteRestoredSync = (sourceRoot, userDataPath, sourceSummary = assertMigrationSqliteReadySync(path_1.default.join(sourceRoot, appConstants_1.DB_FILENAME), 'Backup archive')) => {
    const targetSummary = assertMigrationSqliteReadySync(path_1.default.join(userDataPath, appConstants_1.DB_FILENAME), 'Restored data');
    if (sourceSummary.checksumSha256 !== targetSummary.checksumSha256) {
        throw new Error(`Restored ${appConstants_1.DB_FILENAME} checksum does not match the backup archive.`);
    }
    for (const tableName of SQLITE_MIGRATION_TABLES) {
        const sourceCount = sourceSummary.rowCounts?.[tableName] ?? 0;
        const targetCount = targetSummary.rowCounts?.[tableName] ?? 0;
        if (sourceCount !== targetCount) {
            throw new Error(`Restored ${appConstants_1.DB_FILENAME} row count mismatch for ${tableName}: expected ${sourceCount}, got ${targetCount}.`);
        }
    }
    for (const key of sourceSummary.kvKeys ?? []) {
        if (!targetSummary.kvKeys?.includes(key)) {
            throw new Error(`Restored ${appConstants_1.DB_FILENAME} is missing required kv key ${key}.`);
        }
    }
    assertSqliteCriticalSummaryMatches(sourceSummary, targetSummary, `Restored ${appConstants_1.DB_FILENAME}`);
};
const restoreRollbackArchiveSync = (rollbackPath, userDataPath) => {
    const rollback = extractMigrationArchiveToTempSync(rollbackPath, {
        requireSqliteDatabase: false,
        requireManifest: false,
        validateArchiveContent: false,
    });
    try {
        replaceRestorableUserDataSync(rollback.sourceRoot, userDataPath, isPreservedRestoreTopLevelEntry, {
            includeSqliteSidecars: true,
        });
    }
    finally {
        removeDirIfExistsSync(rollback.tempRoot);
    }
};
const performDataMigrationRestoreSync = (input) => {
    const now = input.now ?? new Date();
    const archivePath = resolvePath(input.archivePath);
    let rollbackPath;
    let rollbackReady = false;
    let extractedTempRoot = null;
    let targetWasTouched = false;
    try {
        ensureDirSync(input.rollbackRootPath);
        if (fs_1.default.existsSync(input.userDataPath)) {
            rollbackPath = path_1.default.join(input.rollbackRootPath, (0, exports.buildDataMigrationRollbackFileName)(now));
            (0, exports.createMigrationArchiveSync)({
                userDataPath: input.userDataPath,
                outputPath: rollbackPath,
                now,
                archiveKind: 'rollback',
            });
            rollbackReady = true;
        }
        const extracted = extractMigrationArchiveToTempSync(archivePath);
        extractedTempRoot = extracted.tempRoot;
        assertMigrationSqliteReadySync(path_1.default.join(extracted.sourceRoot, appConstants_1.DB_FILENAME), 'Backup archive');
        checkpointSqliteDatabaseSync(path_1.default.join(extracted.sourceRoot, appConstants_1.DB_FILENAME), 'Backup archive');
        invalidateMcpLaunchResolutionsSync(path_1.default.join(extracted.sourceRoot, appConstants_1.DB_FILENAME));
        checkpointSqliteDatabaseSync(path_1.default.join(extracted.sourceRoot, appConstants_1.DB_FILENAME), 'Backup archive');
        const sourceSummary = assertMigrationSqliteReadySync(path_1.default.join(extracted.sourceRoot, appConstants_1.DB_FILENAME), 'Backup archive');
        targetWasTouched = true;
        replaceRestorableUserDataSync(extracted.sourceRoot, input.userDataPath);
        assertSqliteRestoredSync(extracted.sourceRoot, input.userDataPath, sourceSummary);
        assertOpenClawStateSummaryMatches(extracted.sourceRoot, input.userDataPath, 'Restored data');
        removeSqliteSidecarsWithRetrySync(input.userDataPath);
        const result = {
            status: constants_1.DataMigrationRestoreStatus.Success,
            archivePath,
            rollbackPath,
            restoredAt: now.toISOString(),
        };
        writeRestoreResultSync(input.userDataPath, result);
        return result;
    }
    catch (error) {
        if (targetWasTouched && rollbackReady && rollbackPath) {
            try {
                restoreRollbackArchiveSync(rollbackPath, input.userDataPath);
            }
            catch {
                // Leave the original error as the reported failure.
            }
        }
        const result = buildFailedRestoreResult(archivePath, rollbackPath, error, now);
        try {
            writeRestoreResultSync(input.userDataPath, result);
        }
        catch {
            // If even marker writing fails, return the result to the caller.
        }
        return result;
    }
    finally {
        if (extractedTempRoot) {
            removeDirIfExistsSync(extractedTempRoot);
        }
    }
};
exports.performDataMigrationRestoreSync = performDataMigrationRestoreSync;
const performPendingDataMigrationRestoreSync = (input) => {
    const pendingPath = (0, exports.getPendingRestoreRequestPath)(input.userDataPath);
    const request = readJsonFileSync(pendingPath);
    if (!request?.archivePath)
        return null;
    try {
        fs_1.default.unlinkSync(pendingPath);
    }
    catch {
        // The request has already been read; continue.
    }
    return (0, exports.performDataMigrationRestoreSync)({
        ...input,
        archivePath: request.archivePath,
    });
};
exports.performPendingDataMigrationRestoreSync = performPendingDataMigrationRestoreSync;
//# sourceMappingURL=dataMigrationService.js.map
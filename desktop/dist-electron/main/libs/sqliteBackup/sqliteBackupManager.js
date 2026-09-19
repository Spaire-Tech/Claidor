"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openSqliteDatabaseWithRecovery = exports.getSqliteMainDbPath = exports.SqliteBackupManager = exports.retainLatestSnapshots = exports.buildSqliteBackupPaths = exports.formatTimestampForLocalPath = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const appConstants_1 = require("../../appConstants");
const constants_1 = require("./constants");
const SQLITE_BACKUP_PROGRESS_PAGE_RATE = 100;
const SINGLE_BACKUP_FILE_NAME = constants_1.SQLITE_BACKUP_FILE_NAME;
const applyRecommendedPragmas = (db) => {
    // WAL mode: persists across connections, never reverts. NORMAL sync is safe under WAL
    // (no data loss on OS crash; power-loss risk is the same as DELETE mode).
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -8000'); // 8 MB; negative value = kibibytes
    db.pragma('wal_autocheckpoint = 1000'); // checkpoint every ~4 MB of WAL writes
};
const isRecoverableSqliteStartupError = (error) => {
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    if (candidate.code === 'SQLITE_CORRUPT' || candidate.code === 'SQLITE_NOTADB') {
        return true;
    }
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
    return (message.includes('database disk image is malformed') ||
        message.includes('file is not a database') ||
        message.includes('malformed'));
};
const readPragmaNumber = (db, pragma) => {
    const value = db.pragma(pragma, { simple: true });
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
const fileExists = (filePath) => {
    try {
        return fs_1.default.existsSync(filePath);
    }
    catch {
        return false;
    }
};
const removeFileIfExists = (filePath) => {
    if (!fileExists(filePath))
        return;
    fs_1.default.rmSync(filePath, { force: true });
};
const ensureDir = (dirPath) => {
    fs_1.default.mkdirSync(dirPath, { recursive: true });
};
const copyFile = (sourcePath, destinationPath) => {
    ensureDir(path_1.default.dirname(destinationPath));
    fs_1.default.copyFileSync(sourcePath, destinationPath);
};
const padTimestampSegment = (value, width = 2) => {
    return value.toString().padStart(width, '0');
};
const formatTimestampForLocalPath = (value) => {
    const date = new Date(value);
    return [
        padTimestampSegment(date.getFullYear(), 4),
        padTimestampSegment(date.getMonth() + 1),
        padTimestampSegment(date.getDate()),
    ].join('-')
        + 'T'
        + [
            padTimestampSegment(date.getHours()),
            padTimestampSegment(date.getMinutes()),
            padTimestampSegment(date.getSeconds()),
        ].join('-')
        + '-'
        + padTimestampSegment(date.getMilliseconds(), 3);
};
exports.formatTimestampForLocalPath = formatTimestampForLocalPath;
const computeFileSha256 = (filePath) => {
    const hash = crypto_1.default.createHash('sha256');
    hash.update(fs_1.default.readFileSync(filePath));
    return hash.digest('hex');
};
const readQuickCheck = (db) => {
    const row = db.prepare('PRAGMA quick_check').pluck().get();
    return typeof row === 'string' ? row : '';
};
const readIntegrityCheck = (db) => {
    const row = db.prepare('PRAGMA integrity_check').pluck().get();
    return typeof row === 'string' ? row : '';
};
const buildSqliteBackupPaths = (userDataPath) => {
    const backupDir = path_1.default.join(userDataPath, constants_1.SQLITE_BACKUP_DIR_NAME);
    return {
        backupDir,
        snapshotsDir: path_1.default.join(backupDir, constants_1.SQLITE_BACKUP_SNAPSHOTS_DIR_NAME),
        quarantineDir: path_1.default.join(backupDir, constants_1.SQLITE_BACKUP_QUARANTINE_DIR_NAME),
        manifestPath: path_1.default.join(backupDir, constants_1.SQLITE_BACKUP_MANIFEST_FILE_NAME),
    };
};
exports.buildSqliteBackupPaths = buildSqliteBackupPaths;
const retainLatestSnapshots = (records) => {
    const sorted = [...records].sort((left, right) => right.createdAt - left.createdAt);
    return {
        retained: sorted.slice(0, constants_1.SQLITE_BACKUP_RETENTION_COUNT),
        removed: sorted.slice(constants_1.SQLITE_BACKUP_RETENTION_COUNT),
    };
};
exports.retainLatestSnapshots = retainLatestSnapshots;
const emptyManifest = () => ({
    version: constants_1.SQLITE_BACKUP_MANIFEST_VERSION,
    snapshots: [],
    updatedAt: Date.now(),
});
const isTruthyEnvValue = (value) => {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
};
const buildSingleBackupRecord = (record) => ({
    ...record,
    fileName: SINGLE_BACKUP_FILE_NAME,
});
const buildBackupSwapPath = (backupFilePath) => `${backupFilePath}.previous`;
const resolveBackupRestorePath = (backupFilePath) => {
    if (fileExists(backupFilePath)) {
        return backupFilePath;
    }
    const swapPath = buildBackupSwapPath(backupFilePath);
    if (fileExists(swapPath)) {
        return swapPath;
    }
    return null;
};
const publishBackupFile = (tempFilePath, finalFilePath) => {
    const swapFilePath = buildBackupSwapPath(finalFilePath);
    if (!fileExists(finalFilePath)) {
        fs_1.default.renameSync(tempFilePath, finalFilePath);
        removeFileIfExists(swapFilePath);
        return;
    }
    removeFileIfExists(swapFilePath);
    fs_1.default.renameSync(finalFilePath, swapFilePath);
    try {
        fs_1.default.renameSync(tempFilePath, finalFilePath);
        removeFileIfExists(swapFilePath);
    }
    catch (error) {
        if (!fileExists(finalFilePath) && fileExists(swapFilePath)) {
            try {
                fs_1.default.renameSync(swapFilePath, finalFilePath);
            }
            catch (restoreError) {
                console.error('[SqliteBackup] Failed to restore previous backup after publish error:', restoreError);
            }
        }
        throw error;
    }
};
class SqliteBackupManager {
    userDataPath;
    periodicTimer = null;
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
    }
    getPaths() {
        return (0, exports.buildSqliteBackupPaths)(this.userDataPath);
    }
    readManifest() {
        const { manifestPath } = this.getPaths();
        if (!fileExists(manifestPath)) {
            return emptyManifest();
        }
        try {
            const parsed = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf8'));
            if (!Array.isArray(parsed.snapshots)) {
                return emptyManifest();
            }
            return {
                version: constants_1.SQLITE_BACKUP_MANIFEST_VERSION,
                snapshots: parsed.snapshots
                    .filter((item) => Boolean(item?.fileName))
                    .sort((left, right) => right.createdAt - left.createdAt),
                updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
            };
        }
        catch (error) {
            console.warn('[SqliteBackup] Failed to read backup manifest, using empty state:', error);
            return emptyManifest();
        }
    }
    verifyDatabaseHealth(db) {
        try {
            const quickCheck = readQuickCheck(db);
            if (quickCheck === constants_1.SQLITE_BACKUP_HEALTH_OK) {
                return { ok: true };
            }
            return { ok: false, reason: quickCheck || 'quick_check returned an empty result' };
        }
        catch (error) {
            return {
                ok: false,
                reason: error instanceof Error ? error.message : 'quick_check failed',
            };
        }
    }
    async createBackup(input) {
        const { snapshotsDir } = this.getPaths();
        ensureDir(snapshotsDir);
        const createdAt = Date.now();
        const id = crypto_1.default.randomUUID();
        const tempFileName = `.tmp-${id}.sqlite`;
        const tempFilePath = path_1.default.join(snapshotsDir, tempFileName);
        const finalFileName = SINGLE_BACKUP_FILE_NAME;
        const finalFilePath = path_1.default.join(snapshotsDir, finalFileName);
        console.log(`[SqliteBackup] Starting ${input.trigger} backup to ${finalFileName}`);
        try {
            await input.db.backup(tempFilePath, {
                progress: (progress) => {
                    const transferredPages = Math.max(0, progress.totalPages - progress.remainingPages);
                    console.debug(`[SqliteBackup] Backup progress: transferred ${transferredPages}/${progress.totalPages} pages, ${progress.remainingPages} remaining`);
                    return SQLITE_BACKUP_PROGRESS_PAGE_RATE;
                },
            });
            const verifyDb = new better_sqlite3_1.default(tempFilePath, { readonly: true });
            const quickCheck = readQuickCheck(verifyDb);
            const sourceUserVersion = readPragmaNumber(verifyDb, 'user_version');
            const sourceSchemaVersion = readPragmaNumber(verifyDb, 'schema_version');
            verifyDb.close();
            if (quickCheck !== constants_1.SQLITE_BACKUP_HEALTH_OK) {
                throw new Error(`Backup quick_check failed: ${quickCheck}`);
            }
            publishBackupFile(tempFilePath, finalFilePath);
            const stat = fs_1.default.statSync(finalFilePath);
            const record = buildSingleBackupRecord({
                id,
                fileName: finalFileName,
                createdAt,
                trigger: input.trigger,
                sizeBytes: stat.size,
                checksumSha256: computeFileSha256(finalFilePath),
                quickCheck: 'ok',
                sourceUserVersion,
                sourceSchemaVersion,
                restoreTested: false,
            });
            const nextManifest = this.writeManifest({
                version: constants_1.SQLITE_BACKUP_MANIFEST_VERSION,
                snapshots: [record],
                updatedAt: Date.now(),
            });
            console.log(`[SqliteBackup] Completed ${input.trigger} backup with ${nextManifest.snapshots.length} retained snapshot(s)`);
            return record;
        }
        catch (error) {
            removeFileIfExists(tempFilePath);
            console.error('[SqliteBackup] Backup creation failed:', error);
            throw error;
        }
    }
    restoreLatestBackup(dbFilePath) {
        const manifest = this.readManifest();
        const { snapshotsDir, quarantineDir } = this.getPaths();
        const quarantineStamp = (0, exports.formatTimestampForLocalPath)(Date.now());
        const quarantineTargetDir = path_1.default.join(quarantineDir, quarantineStamp);
        let hasQuarantinedCurrentFiles = false;
        for (const snapshot of manifest.snapshots.sort((left, right) => right.createdAt - left.createdAt)) {
            const snapshotPath = resolveBackupRestorePath(path_1.default.join(snapshotsDir, snapshot.fileName));
            if (!snapshotPath)
                continue;
            try {
                if (!hasQuarantinedCurrentFiles) {
                    ensureDir(quarantineTargetDir);
                    this.quarantineDatabaseFiles(dbFilePath, quarantineTargetDir);
                    hasQuarantinedCurrentFiles = true;
                }
                copyFile(snapshotPath, dbFilePath);
                removeFileIfExists(`${dbFilePath}-wal`);
                removeFileIfExists(`${dbFilePath}-shm`);
                const restoredDb = new better_sqlite3_1.default(dbFilePath);
                const integrityCheck = readIntegrityCheck(restoredDb);
                restoredDb.close();
                if (integrityCheck !== constants_1.SQLITE_BACKUP_HEALTH_OK) {
                    throw new Error(`integrity_check failed: ${integrityCheck}`);
                }
                this.markSnapshotAsRestoreTested(snapshot.fileName);
                fs_1.default.writeFileSync(path_1.default.join(quarantineTargetDir, 'restore-context.json'), JSON.stringify({
                    restoredSnapshot: snapshot.fileName,
                    restoredAt: Date.now(),
                }, null, 2), 'utf8');
                console.log(`[SqliteBackup] Restored database from snapshot ${snapshot.fileName}`);
                return { restored: true, snapshotFileName: snapshot.fileName };
            }
            catch (error) {
                console.warn(`[SqliteBackup] Failed to restore snapshot ${snapshot.fileName}:`, error);
                removeFileIfExists(dbFilePath);
            }
        }
        if (!hasQuarantinedCurrentFiles) {
            ensureDir(quarantineTargetDir);
            this.quarantineDatabaseFiles(dbFilePath, quarantineTargetDir);
        }
        return { restored: false };
    }
    shouldCreatePeriodicBackup(now = Date.now()) {
        if (isTruthyEnvValue(process.env[constants_1.SQLITE_BACKUP_ALWAYS_ON_STARTUP_ENV])) {
            console.log(`[SqliteBackup] Forced startup backup is enabled via ${constants_1.SQLITE_BACKUP_ALWAYS_ON_STARTUP_ENV}`);
            return true;
        }
        const latest = this.readManifest().snapshots[0];
        if (!latest)
            return true;
        const backupPath = path_1.default.join(this.getPaths().snapshotsDir, latest.fileName);
        if (!resolveBackupRestorePath(backupPath)) {
            console.warn('[SqliteBackup] Backup file is missing; scheduling a replacement backup');
            return true;
        }
        return now - latest.createdAt >= constants_1.SQLITE_BACKUP_INTERVAL_MS;
    }
    async startPeriodicBackupLoop(getDb) {
        if (this.shouldCreatePeriodicBackup()) {
            await this.createBackup({ db: getDb(), trigger: constants_1.SqliteBackupTrigger.Periodic });
        }
        this.stopPeriodicBackupLoop();
        this.periodicTimer = setInterval(() => {
            if (!this.shouldCreatePeriodicBackup())
                return;
            void this.createBackup({ db: getDb(), trigger: constants_1.SqliteBackupTrigger.Periodic }).catch((error) => {
                console.error('[SqliteBackup] Periodic backup failed:', error);
            });
        }, constants_1.SQLITE_BACKUP_INTERVAL_MS);
    }
    stopPeriodicBackupLoop() {
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
    }
    writeManifest(manifest) {
        const { backupDir, manifestPath, snapshotsDir } = this.getPaths();
        ensureDir(backupDir);
        ensureDir(snapshotsDir);
        const { retained, removed } = (0, exports.retainLatestSnapshots)(manifest.snapshots);
        const nextManifest = {
            version: constants_1.SQLITE_BACKUP_MANIFEST_VERSION,
            snapshots: retained,
            updatedAt: Date.now(),
        };
        const tempManifestPath = `${manifestPath}.tmp`;
        fs_1.default.writeFileSync(tempManifestPath, JSON.stringify(nextManifest, null, 2), 'utf8');
        fs_1.default.renameSync(tempManifestPath, manifestPath);
        for (const record of removed) {
            if (record.fileName !== SINGLE_BACKUP_FILE_NAME) {
                removeFileIfExists(path_1.default.join(snapshotsDir, record.fileName));
            }
        }
        return nextManifest;
    }
    quarantineDatabaseFiles(dbFilePath, quarantineTargetDir) {
        const candidates = [dbFilePath, `${dbFilePath}-wal`, `${dbFilePath}-shm`];
        for (const candidate of candidates) {
            if (!fileExists(candidate))
                continue;
            fs_1.default.renameSync(candidate, path_1.default.join(quarantineTargetDir, path_1.default.basename(candidate)));
        }
    }
    markSnapshotAsRestoreTested(fileName) {
        const manifest = this.readManifest();
        const snapshots = manifest.snapshots.map((snapshot) => snapshot.fileName === fileName ? { ...snapshot, restoreTested: true } : snapshot);
        this.writeManifest({
            ...manifest,
            snapshots,
            updatedAt: Date.now(),
        });
    }
}
exports.SqliteBackupManager = SqliteBackupManager;
const getSqliteMainDbPath = (userDataPath) => {
    return path_1.default.join(userDataPath, appConstants_1.DB_FILENAME);
};
exports.getSqliteMainDbPath = getSqliteMainDbPath;
const openSqliteDatabaseWithRecovery = (userDataPath, dbFilePath = (0, exports.getSqliteMainDbPath)(userDataPath)) => {
    let db = null;
    try {
        db = new better_sqlite3_1.default(dbFilePath);
        applyRecommendedPragmas(db);
        return db;
    }
    catch (error) {
        try {
            db?.close();
        }
        catch {
            // Ignore close failures during recovery.
        }
        if (!isRecoverableSqliteStartupError(error)) {
            throw error;
        }
        console.warn('[SqliteBackup] SQLite startup failed; attempting snapshot recovery:', error);
        const backupManager = new SqliteBackupManager(userDataPath);
        const restoreResult = backupManager.restoreLatestBackup(dbFilePath);
        if (!restoreResult.restored) {
            console.warn('[SqliteBackup] Snapshot recovery did not restore any database file');
            throw error;
        }
        const recoveredDb = new better_sqlite3_1.default(dbFilePath);
        applyRecommendedPragmas(recoveredDb);
        return recoveredDb;
    }
};
exports.openSqliteDatabaseWithRecovery = openSqliteDatabaseWithRecovery;
//# sourceMappingURL=sqliteBackupManager.js.map
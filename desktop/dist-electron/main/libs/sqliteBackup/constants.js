"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLITE_BACKUP_HEALTH_OK = exports.SQLITE_BACKUP_MANIFEST_VERSION = exports.SQLITE_BACKUP_ALWAYS_ON_STARTUP_ENV = exports.SQLITE_BACKUP_INTERVAL_MS = exports.SQLITE_BACKUP_RETENTION_COUNT = exports.SQLITE_BACKUP_FILE_NAME = exports.SQLITE_BACKUP_MANIFEST_FILE_NAME = exports.SQLITE_BACKUP_QUARANTINE_DIR_NAME = exports.SQLITE_BACKUP_SNAPSHOTS_DIR_NAME = exports.SQLITE_BACKUP_DIR_NAME = exports.SqliteBackupTrigger = void 0;
exports.SqliteBackupTrigger = {
    Periodic: 'periodic',
    Manual: 'manual',
};
exports.SQLITE_BACKUP_DIR_NAME = 'backups/sqlite';
exports.SQLITE_BACKUP_SNAPSHOTS_DIR_NAME = 'snapshots';
exports.SQLITE_BACKUP_QUARANTINE_DIR_NAME = 'quarantine';
exports.SQLITE_BACKUP_MANIFEST_FILE_NAME = 'manifest.json';
exports.SQLITE_BACKUP_FILE_NAME = 'lobsterai-latest.sqlite';
exports.SQLITE_BACKUP_RETENTION_COUNT = 1;
exports.SQLITE_BACKUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
exports.SQLITE_BACKUP_ALWAYS_ON_STARTUP_ENV = 'LOBSTERAI_SQLITE_BACKUP_ALWAYS_ON_STARTUP';
exports.SQLITE_BACKUP_MANIFEST_VERSION = 1;
exports.SQLITE_BACKUP_HEALTH_OK = 'ok';
//# sourceMappingURL=constants.js.map
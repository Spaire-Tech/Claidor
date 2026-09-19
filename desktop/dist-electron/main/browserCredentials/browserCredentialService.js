"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserCredentialService = exports.normalizeBrowserCredentialOrigin = void 0;
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("../../shared/browserCredentials/constants");
const MAX_ORIGIN_LENGTH = 2_048;
const MAX_USERNAME_LENGTH = 512;
const MAX_PASSWORD_LENGTH = 8_192;
const isLoopbackHostname = (hostname) => {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (normalized === 'localhost' || normalized === '::1')
        return true;
    return /^127(?:\.\d{1,3}){3}$/.test(normalized);
};
const normalizeBrowserCredentialOrigin = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ORIGIN_LENGTH) {
        throw new Error('A valid website origin is required.');
    }
    let parsed;
    try {
        parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    }
    catch {
        throw new Error('A valid website origin is required.');
    }
    if (parsed.username || parsed.password) {
        throw new Error('The website origin must not include credentials.');
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))) {
        throw new Error('Saved browser credentials require HTTPS, except for localhost.');
    }
    return parsed.origin;
};
exports.normalizeBrowserCredentialOrigin = normalizeBrowserCredentialOrigin;
const normalizeUsername = (value) => {
    const username = value.trim();
    if (!username || username.length > MAX_USERNAME_LENGTH) {
        throw new Error('A valid username is required.');
    }
    return username;
};
const validatePassword = (value) => {
    if (!value || value.length > MAX_PASSWORD_LENGTH) {
        throw new Error('A valid password is required.');
    }
    return value;
};
const rowToSummary = (row) => ({
    id: row.id,
    origin: row.origin,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}),
});
class BrowserCredentialService {
    db;
    encryption;
    platform;
    initialized = false;
    constructor(db, encryption, platform = process.platform) {
        this.db = db;
        this.encryption = encryption;
        this.platform = platform;
    }
    getAvailability() {
        if (!this.encryption.isEncryptionAvailable()) {
            return {
                available: false,
                reason: constants_1.BrowserCredentialAvailabilityReason.EncryptionUnavailable,
            };
        }
        if (this.platform === 'linux') {
            const backend = this.encryption.getSelectedStorageBackend();
            if (backend === 'basic_text' || backend === 'unknown') {
                return {
                    available: false,
                    reason: constants_1.BrowserCredentialAvailabilityReason.InsecureStorageBackend,
                };
            }
        }
        return { available: true };
    }
    list(origin) {
        this.ensureTable();
        const normalizedOrigin = origin ? (0, exports.normalizeBrowserCredentialOrigin)(origin) : undefined;
        const rows = normalizedOrigin
            ? this.db.prepare(`
          SELECT id, origin, username, encrypted_password, created_at, updated_at, last_used_at
          FROM browser_credentials
          WHERE origin = ?
          ORDER BY username COLLATE NOCASE ASC
        `).all(normalizedOrigin)
            : this.db.prepare(`
          SELECT id, origin, username, encrypted_password, created_at, updated_at, last_used_at
          FROM browser_credentials
          ORDER BY origin COLLATE NOCASE ASC, username COLLATE NOCASE ASC
        `).all();
        return rows.map(rowToSummary);
    }
    save(request) {
        this.assertAvailable();
        this.ensureTable();
        const origin = (0, exports.normalizeBrowserCredentialOrigin)(request.origin);
        const username = normalizeUsername(request.username);
        const password = validatePassword(request.password);
        const encryptedPassword = this.encryption.encryptString(password);
        const now = Date.now();
        const requestedId = request.id?.trim();
        if (requestedId) {
            const current = this.getRow(requestedId);
            if (!current)
                throw new Error('The saved browser credential no longer exists.');
            this.db.prepare(`
        UPDATE browser_credentials
        SET origin = ?, username = ?, encrypted_password = ?, updated_at = ?
        WHERE id = ?
      `).run(origin, username, encryptedPassword, now, requestedId);
            return rowToSummary(this.requireRow(requestedId));
        }
        const existing = this.db.prepare(`
      SELECT id, origin, username, encrypted_password, created_at, updated_at, last_used_at
      FROM browser_credentials
      WHERE origin = ? AND username = ? COLLATE NOCASE
    `).get(origin, username);
        if (existing) {
            this.db.prepare(`
        UPDATE browser_credentials
        SET username = ?, encrypted_password = ?, updated_at = ?
        WHERE id = ?
      `).run(username, encryptedPassword, now, existing.id);
            return rowToSummary(this.requireRow(existing.id));
        }
        const id = crypto_1.default.randomUUID();
        this.db.prepare(`
      INSERT INTO browser_credentials (
        id, origin, username, encrypted_password, created_at, updated_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(id, origin, username, encryptedPassword, now, now);
        return rowToSummary(this.requireRow(id));
    }
    delete(id) {
        this.ensureTable();
        const normalizedId = id.trim();
        if (!normalizedId)
            return false;
        return this.db.prepare('DELETE FROM browser_credentials WHERE id = ?').run(normalizedId).changes > 0;
    }
    getSecret(id, expectedOrigin) {
        this.assertAvailable();
        this.ensureTable();
        const row = this.requireRow(id.trim());
        const origin = (0, exports.normalizeBrowserCredentialOrigin)(expectedOrigin);
        if (row.origin !== origin) {
            throw new Error('The saved browser credential does not match the current website.');
        }
        return {
            summary: rowToSummary(row),
            password: this.encryption.decryptString(row.encrypted_password),
        };
    }
    markUsed(id) {
        this.ensureTable();
        this.db.prepare('UPDATE browser_credentials SET last_used_at = ? WHERE id = ?')
            .run(Date.now(), id.trim());
    }
    assertAvailable() {
        const availability = this.getAvailability();
        if (!availability.available) {
            throw new Error('Secure browser credential storage is unavailable on this device.');
        }
    }
    ensureTable() {
        if (this.initialized)
            return;
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS browser_credentials (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        username TEXT NOT NULL,
        encrypted_password BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER,
        UNIQUE(origin, username COLLATE NOCASE)
      );
      CREATE INDEX IF NOT EXISTS idx_browser_credentials_origin
        ON browser_credentials(origin);
    `);
        this.initialized = true;
    }
    getRow(id) {
        return this.db.prepare(`
      SELECT id, origin, username, encrypted_password, created_at, updated_at, last_used_at
      FROM browser_credentials
      WHERE id = ?
    `).get(id);
    }
    requireRow(id) {
        const row = this.getRow(id);
        if (!row)
            throw new Error('The saved browser credential no longer exists.');
        return row;
    }
}
exports.BrowserCredentialService = BrowserCredentialService;
//# sourceMappingURL=browserCredentialService.js.map
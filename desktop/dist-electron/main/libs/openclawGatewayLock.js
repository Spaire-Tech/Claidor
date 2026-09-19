"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayLockCleanupAction = void 0;
exports.resolveGatewayLockDir = resolveGatewayLockDir;
exports.resolveGatewayLockPathForConfig = resolveGatewayLockPathForConfig;
exports.parseGatewayLockPayload = parseGatewayLockPayload;
exports.cleanupStaleGatewayLocks = cleanupStaleGatewayLocks;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
exports.GatewayLockCleanupAction = {
    RemovedUnreadable: 'removed-unreadable',
    RemovedDeadOwner: 'removed-dead-owner',
    KeptAliveOwner: 'kept-alive-owner',
    RemoveFailed: 'remove-failed',
};
const GATEWAY_LOCK_FILE_RE = /^gateway\.[0-9a-f]{8}\.lock$/;
/** Mirrors OpenClaw v2026.6.1 resolveGatewayLockDir(). */
function resolveGatewayLockDir() {
    const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    const suffix = uid != null ? `openclaw-${uid}` : 'openclaw';
    return path_1.default.join(os_1.default.tmpdir(), suffix);
}
/**
 * Mirrors OpenClaw v2026.6.1 resolveGatewayLockPath(): the gateway resolves
 * OPENCLAW_CONFIG_PATH through resolveUserPath() which is path.resolve() for
 * absolute paths, then hashes the resolved string.
 */
function resolveGatewayLockPathForConfig(configPath, lockDir = resolveGatewayLockDir()) {
    const resolved = path_1.default.resolve(configPath.trim());
    const hash = crypto_1.default.createHash('sha256').update(resolved).digest('hex').slice(0, 8);
    return path_1.default.join(lockDir, `gateway.${hash}.lock`);
}
function normalizePathForCompare(input) {
    const resolved = path_1.default.resolve(input.trim());
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function parseGatewayLockPayload(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        const pid = parsed.pid;
        if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
            return null;
        }
        const configPath = parsed.configPath;
        return {
            pid,
            ...(typeof configPath === 'string' ? { configPath } : {}),
        };
    }
    catch {
        return null;
    }
}
function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        // EPERM means the process exists but we lack permission to signal it.
        return err.code === 'EPERM';
    }
}
function removeLockFile(lockPath, action, ownerPid) {
    try {
        fs_1.default.rmSync(lockPath, { force: true });
        return { lockPath, action, ...(ownerPid != null ? { ownerPid } : {}) };
    }
    catch {
        return { lockPath, action: exports.GatewayLockCleanupAction.RemoveFailed, ...(ownerPid != null ? { ownerPid } : {}) };
    }
}
/**
 * Reclaim stale gateway lock files for our config path.
 *
 * MUST only be called when the caller knows it has no live gateway child of
 * its own (before spawning a gateway, or right after confirming the previous
 * one exited). A lock whose payload is readable and whose owner pid is alive
 * is never touched.
 *
 * Two matching strategies:
 * - The exact lock path for our configPath (hash replica). An unreadable
 *   payload here is reclaimed: only our own gateway can legitimately own it,
 *   and the caller guarantees no such process is starting right now.
 * - Any other `gateway.*.lock` in the directory whose readable payload points
 *   at our configPath with a dead owner (guards against hash-input drift).
 *   Unreadable payloads under other hashes are left alone — they may belong
 *   to a user-run OpenClaw CLI with a different config.
 */
function cleanupStaleGatewayLocks(options) {
    const lockDir = options.lockDir ?? resolveGatewayLockDir();
    const pidAlive = options.isPidAliveFn ?? isPidAlive;
    const results = [];
    const ownLockPath = resolveGatewayLockPathForConfig(options.configPath, lockDir);
    const ownConfigKey = normalizePathForCompare(options.configPath);
    let entries;
    try {
        entries = fs_1.default.readdirSync(lockDir);
    }
    catch {
        return results;
    }
    for (const entry of entries) {
        if (!GATEWAY_LOCK_FILE_RE.test(entry)) {
            continue;
        }
        const lockPath = path_1.default.join(lockDir, entry);
        const isOwnLock = lockPath === ownLockPath;
        let raw = null;
        try {
            raw = fs_1.default.readFileSync(lockPath, 'utf8');
        }
        catch {
            // Unreadable file handle: treat like an unreadable payload below.
            raw = null;
        }
        const payload = raw != null ? parseGatewayLockPayload(raw) : null;
        if (!payload) {
            if (isOwnLock) {
                results.push(removeLockFile(lockPath, exports.GatewayLockCleanupAction.RemovedUnreadable));
            }
            continue;
        }
        const matchesOurConfig = isOwnLock
            || (payload.configPath != null && normalizePathForCompare(payload.configPath) === ownConfigKey);
        if (!matchesOurConfig) {
            continue;
        }
        if (pidAlive(payload.pid)) {
            results.push({ lockPath, action: exports.GatewayLockCleanupAction.KeptAliveOwner, ownerPid: payload.pid });
            continue;
        }
        results.push(removeLockFile(lockPath, exports.GatewayLockCleanupAction.RemovedDeadOwner, payload.pid));
    }
    return results;
}
//# sourceMappingURL=openclawGatewayLock.js.map
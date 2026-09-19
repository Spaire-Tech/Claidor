"use strict";
/**
 * IM Pairing Store
 *
 * Reads and writes OpenClaw pairing JSON files directly from the main process.
 * Compatible with the OpenClaw SDK pairing-store format.
 *
 * File formats:
 *   credentials/<channel>-pairing.json            → { version: 1, requests: PairingRequest[] }
 *   credentials/<channel>-allowFrom.json           → { version: 1, allowFrom: string[] }
 *   credentials/<channel>-<accountId>-allowFrom.json → (account-scoped variant)
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPairingRequests = listPairingRequests;
exports.readAllowFromStore = readAllowFromStore;
exports.approvePairingCode = approvePairingCode;
exports.rejectPairingRequest = rejectPairingRequest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ---------- Constants (match OpenClaw SDK) ----------
const PAIRING_PENDING_TTL_MS = 3600 * 1000; // 1 hour
// ---------- Path helpers ----------
function safeChannelKey(channel) {
    const raw = channel.trim().toLowerCase();
    if (!raw)
        throw new Error('invalid pairing channel');
    const safe = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_');
    if (!safe || safe === '_')
        throw new Error('invalid pairing channel');
    return safe;
}
function resolveCredentialsDir(stateDir) {
    return path.join(stateDir, 'credentials');
}
function resolvePairingPath(channel, stateDir) {
    return path.join(resolveCredentialsDir(stateDir), `${safeChannelKey(channel)}-pairing.json`);
}
function resolveAllowFromPath(channel, stateDir, accountId) {
    const base = safeChannelKey(channel);
    const normalized = typeof accountId === 'string' ? accountId.trim().toLowerCase() : '';
    if (!normalized || normalized === 'default') {
        return path.join(resolveCredentialsDir(stateDir), `${base}-allowFrom.json`);
    }
    const safeAccount = normalized.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_');
    return path.join(resolveCredentialsDir(stateDir), `${base}-${safeAccount}-allowFrom.json`);
}
// ---------- JSON helpers ----------
function readJsonFileSync(filePath, fallback) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return fallback;
    }
}
function writeJsonFileSync(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
// ---------- Internal readers ----------
function readPairingFile(channel, stateDir) {
    const filePath = resolvePairingPath(channel, stateDir);
    const file = readJsonFileSync(filePath, { version: 1, requests: [] });
    return Array.isArray(file.requests) ? file.requests : [];
}
function writePairingFile(channel, stateDir, requests) {
    const filePath = resolvePairingPath(channel, stateDir);
    writeJsonFileSync(filePath, { version: 1, requests });
}
function readAllowFromFile(channel, stateDir, accountId) {
    const filePath = resolveAllowFromPath(channel, stateDir, accountId);
    const file = readJsonFileSync(filePath, { version: 1, allowFrom: [] });
    return Array.isArray(file.allowFrom) ? file.allowFrom : [];
}
function writeAllowFromFile(channel, stateDir, allowFrom, accountId) {
    const filePath = resolveAllowFromPath(channel, stateDir, accountId);
    writeJsonFileSync(filePath, { version: 1, allowFrom });
}
// ---------- Public API ----------
/**
 * List pending pairing requests for a channel, filtering out expired ones.
 */
function listPairingRequests(channel, stateDir) {
    const requests = readPairingFile(channel, stateDir);
    const now = Date.now();
    return requests.filter((r) => {
        const createdAt = new Date(r.createdAt).getTime();
        return !isNaN(createdAt) && now - createdAt < PAIRING_PENDING_TTL_MS;
    });
}
/**
 * Read the allowFrom store (approved sender IDs) for a channel.
 */
function readAllowFromStore(channel, stateDir) {
    return readAllowFromFile(channel, stateDir);
}
/**
 * Approve a pairing request by code.
 * Removes the request from the pairing file and adds the sender ID to allowFrom.
 * Returns the approved request, or null if the code was not found.
 */
function approvePairingCode(channel, code, stateDir) {
    const requests = readPairingFile(channel, stateDir);
    const upperCode = code.toUpperCase().trim();
    const idx = requests.findIndex((r) => r.code === upperCode);
    if (idx === -1)
        return null;
    const [approved] = requests.splice(idx, 1);
    // Write back remaining requests (versioned format)
    writePairingFile(channel, stateDir, requests);
    // Resolve accountId from request meta (default account uses simple path)
    const accountId = approved.meta?.accountId;
    // Add to allowFrom
    const allowFrom = readAllowFromFile(channel, stateDir, accountId);
    if (!allowFrom.includes(approved.id)) {
        allowFrom.push(approved.id);
        writeAllowFromFile(channel, stateDir, allowFrom, accountId);
    }
    return approved;
}
/**
 * Reject a pairing request by code.
 * Removes the request from the pairing file without adding to allowFrom.
 * Returns the rejected request, or null if the code was not found.
 */
function rejectPairingRequest(channel, code, stateDir) {
    const requests = readPairingFile(channel, stateDir);
    const upperCode = code.toUpperCase().trim();
    const idx = requests.findIndex((r) => r.code === upperCode);
    if (idx === -1)
        return null;
    const [rejected] = requests.splice(idx, 1);
    writePairingFile(channel, stateDir, requests);
    return rejected;
}
//# sourceMappingURL=imPairingStore.js.map
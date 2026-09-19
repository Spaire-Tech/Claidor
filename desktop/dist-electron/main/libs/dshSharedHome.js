"use strict";
// Single-writer protection for the shared dsh home.
//
// dsh's session persistence documents "one live writer per session": each
// backend keeps its own in-memory seq counter, so a second live process
// reusing a committed seq corrupts the log ("seq gap in committed region").
// Sharing ~/.dsh with a standalone dsh therefore requires that only one of
// them is running at a time.
//
// Two detections, in order of reliability:
//   1. a writer lock we maintain inside the shared home — authoritative for
//      LobsterAI-owned instances, including stale locks from a hard kill;
//   2. an HTTP probe of the standalone's documented default port — best
//      effort, since a standalone on a custom port is undetectable.
// When a foreign writer is found the caller falls back to the isolated home:
// history is not shared for that run, but nothing is corrupted.
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
exports.DshSharedHomeDecision = exports.DSH_STANDALONE_DEFAULT_PORT = exports.DSH_WRITER_LOCK_FILE = void 0;
exports.parseDshWriterLock = parseDshWriterLock;
exports.isBlockingWriterLock = isBlockingWriterLock;
exports.isProcessAlive = isProcessAlive;
exports.readWriterLock = readWriterLock;
exports.writeWriterLock = writeWriterLock;
exports.clearWriterLock = clearWriterLock;
exports.probeStandaloneDsh = probeStandaloneDsh;
exports.resolveSharedDataHome = resolveSharedDataHome;
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const path = __importStar(require("path"));
exports.DSH_WRITER_LOCK_FILE = '.lobsterai-dsh-writer.json';
exports.DSH_STANDALONE_DEFAULT_PORT = 3080;
const PROBE_TIMEOUT_MS = 1_500;
exports.DshSharedHomeDecision = {
    Shared: 'shared',
    IsolatedForeignLock: 'isolated-foreign-lock',
    IsolatedStandaloneRunning: 'isolated-standalone-running',
};
function parseDshWriterLock(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return null;
        const record = parsed;
        if (typeof record.pid !== 'number' || !Number.isInteger(record.pid) || record.pid <= 0)
            return null;
        return {
            pid: record.pid,
            port: typeof record.port === 'number' ? record.port : 0,
            startedAt: typeof record.startedAt === 'string' ? record.startedAt : '',
        };
    }
    catch {
        return null;
    }
}
// A lock only blocks sharing when it names a *live, foreign* process. Our own
// pid means a restart inside this app, and a dead pid is a leftover from a
// crash or hard kill.
function isBlockingWriterLock(lock, currentPid, isAlive) {
    if (!lock)
        return false;
    if (lock.pid === currentPid)
        return false;
    return isAlive(lock.pid);
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        // EPERM means the process exists but belongs to another user.
        return error.code === 'EPERM';
    }
}
function readWriterLock(sharedHome) {
    try {
        return parseDshWriterLock(fs.readFileSync(path.join(sharedHome, exports.DSH_WRITER_LOCK_FILE), 'utf8'));
    }
    catch {
        return null;
    }
}
function writeWriterLock(sharedHome, port) {
    try {
        fs.mkdirSync(sharedHome, { recursive: true, mode: 0o700 });
        const lock = { pid: process.pid, port, startedAt: new Date().toISOString() };
        fs.writeFileSync(path.join(sharedHome, exports.DSH_WRITER_LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, { mode: 0o600 });
    }
    catch (error) {
        console.warn('[DSH] Could not write the shared-home writer lock', error);
    }
}
function clearWriterLock(sharedHome) {
    const lockPath = path.join(sharedHome, exports.DSH_WRITER_LOCK_FILE);
    const lock = readWriterLock(sharedHome);
    // Never clear a lock another live process owns.
    if (lock && lock.pid !== process.pid && isProcessAlive(lock.pid))
        return;
    try {
        fs.rmSync(lockPath, { force: true });
    }
    catch {
        // Best effort.
    }
}
// Answers "is a dsh web server already serving on this port?" — a standalone
// run of `dsh web` with no --port lands on the documented default.
function probeStandaloneDsh(port = exports.DSH_STANDALONE_DEFAULT_PORT) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ type: 'client-request', rpcId: 'lobsterai-probe', method: 'host.describe', payload: {} });
        const request = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/host.describe',
            method: 'POST',
            timeout: PROBE_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (response) => {
            let raw = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                if (raw.length < 4_096)
                    raw += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(raw)?.result?.ok === true);
                }
                catch {
                    resolve(false);
                }
            });
        });
        request.on('timeout', () => {
            request.destroy();
            resolve(false);
        });
        request.on('error', () => resolve(false));
        request.end(body);
    });
}
// Decides whether this run may write the shared store. Returns the home to
// hand the config renderer (null = keep our isolated home).
async function resolveSharedDataHome(sharedHome) {
    if (isBlockingWriterLock(readWriterLock(sharedHome), process.pid, isProcessAlive)) {
        return { dataHome: null, decision: exports.DshSharedHomeDecision.IsolatedForeignLock };
    }
    if (await probeStandaloneDsh()) {
        return { dataHome: null, decision: exports.DshSharedHomeDecision.IsolatedStandaloneRunning };
    }
    return { dataHome: sharedHome, decision: exports.DshSharedHomeDecision.Shared };
}
//# sourceMappingURL=dshSharedHome.js.map
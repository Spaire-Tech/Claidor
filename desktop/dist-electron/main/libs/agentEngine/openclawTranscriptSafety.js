"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyOpenClawTranscriptSize = classifyOpenClawTranscriptSize;
exports.inspectOpenClawTranscriptSafety = inspectOpenClawTranscriptSafety;
exports.buildOpenClawTranscriptOversizedError = buildOpenClawTranscriptOversizedError;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../../shared/openclawTranscript/constants");
const OPENCLAW_SESSION_STORE_MAX_BYTES = 16 * 1024 * 1024;
const SAFE_SESSION_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
function classifyOpenClawTranscriptSize(transcriptBytes) {
    if (transcriptBytes >= constants_1.OpenClawTranscriptSafetyLimit.HardBytes) {
        return constants_1.OpenClawTranscriptSafetyStatus.Blocked;
    }
    if (transcriptBytes >= constants_1.OpenClawTranscriptSafetyLimit.SoftBytes) {
        return constants_1.OpenClawTranscriptSafetyStatus.CompactionRequired;
    }
    return constants_1.OpenClawTranscriptSafetyStatus.Safe;
}
const isPathInside = (parentPath, candidatePath) => {
    const relative = path_1.default.relative(parentPath, candidatePath);
    return relative.length > 0 && !relative.startsWith('..') && !path_1.default.isAbsolute(relative);
};
const resolveSessionsDir = (stateDir, agentId) => {
    const agentsDir = path_1.default.resolve(stateDir, 'agents');
    const sessionsDir = path_1.default.resolve(agentsDir, agentId, 'sessions');
    return isPathInside(agentsDir, sessionsDir) ? sessionsDir : null;
};
const resolveContainedTranscriptPath = async (sessionsDir, entry) => {
    const sessionFile = typeof entry.sessionFile === 'string' ? entry.sessionFile.trim() : '';
    const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId.trim() : '';
    const candidates = [];
    if (sessionFile) {
        candidates.push(path_1.default.isAbsolute(sessionFile)
            ? path_1.default.resolve(sessionFile)
            : path_1.default.resolve(sessionsDir, sessionFile));
    }
    if (SAFE_SESSION_ID_RE.test(sessionId)) {
        candidates.push(path_1.default.resolve(sessionsDir, `${sessionId}.jsonl`));
    }
    let realSessionsDir = sessionsDir;
    try {
        realSessionsDir = await fs_1.default.promises.realpath(sessionsDir);
    }
    catch {
        // The directory may not exist yet for a new session.
    }
    for (const candidate of candidates) {
        if (!isPathInside(sessionsDir, candidate))
            continue;
        let realCandidate = candidate;
        try {
            realCandidate = await fs_1.default.promises.realpath(candidate);
        }
        catch {
            // A missing candidate is handled by stat in the caller.
        }
        if (isPathInside(realSessionsDir, realCandidate)) {
            return realCandidate;
        }
    }
    return null;
};
async function inspectOpenClawTranscriptSafety(input) {
    const sessionsDir = resolveSessionsDir(input.stateDir, input.agentId);
    if (!sessionsDir) {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            reason: 'invalid_agent_sessions_path',
        };
    }
    const sessionStorePath = path_1.default.join(sessionsDir, 'sessions.json');
    let sessionStoreStat;
    try {
        sessionStoreStat = await fs_1.default.promises.stat(sessionStorePath);
    }
    catch {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            reason: 'session_store_missing',
        };
    }
    if (!sessionStoreStat.isFile() || sessionStoreStat.size > OPENCLAW_SESSION_STORE_MAX_BYTES) {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            reason: sessionStoreStat.isFile() ? 'session_store_too_large' : 'session_store_not_file',
        };
    }
    let store;
    try {
        const raw = await fs_1.default.promises.readFile(sessionStorePath, 'utf8');
        store = JSON.parse(raw);
    }
    catch {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            reason: 'session_store_invalid',
        };
    }
    const rawEntry = store[input.sessionKey];
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            reason: 'session_entry_missing',
        };
    }
    const transcriptPath = await resolveContainedTranscriptPath(sessionsDir, rawEntry);
    if (!transcriptPath) {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            reason: 'transcript_path_unresolved',
        };
    }
    try {
        const transcriptStat = await fs_1.default.promises.stat(transcriptPath);
        if (!transcriptStat.isFile()) {
            return {
                status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
                transcriptPath,
                reason: 'transcript_not_file',
            };
        }
        return {
            status: classifyOpenClawTranscriptSize(transcriptStat.size),
            transcriptBytes: transcriptStat.size,
            transcriptPath,
        };
    }
    catch {
        return {
            status: constants_1.OpenClawTranscriptSafetyStatus.Unknown,
            transcriptPath,
            reason: 'transcript_missing',
        };
    }
}
function buildOpenClawTranscriptOversizedError(inspection) {
    const transcriptBytes = inspection.transcriptBytes ?? constants_1.OpenClawTranscriptSafetyLimit.HardBytes;
    return new Error(`${constants_1.OpenClawTranscriptSafetyErrorCode.ActiveTranscriptOversized}: `
        + `the active conversation transcript is ${transcriptBytes} bytes; `
        + `safe limit is ${constants_1.OpenClawTranscriptSafetyLimit.HardBytes} bytes`);
}
//# sourceMappingURL=openclawTranscriptSafety.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSessionDiagnosticsDefaultFileName = buildSessionDiagnosticsDefaultFileName;
exports.buildSessionDiagnosticsStats = buildSessionDiagnosticsStats;
exports.buildSessionDiagnosticsArchiveEntries = buildSessionDiagnosticsArchiveEntries;
exports.exportSessionDiagnosticsZip = exportSessionDiagnosticsZip;
const fs_1 = __importDefault(require("fs"));
const promises_1 = require("stream/promises");
const yazl_1 = __importDefault(require("yazl"));
const EXPORT_TIMEOUT_MS = 30_000;
const MAX_TITLE_FILE_NAME_CHARS = 40;
const MAX_SESSION_ID_FILE_NAME_CHARS = 8;
const SESSION_DIAGNOSTICS_SCHEMA_VERSION = 1;
const padTwoDigits = (value) => value.toString().padStart(2, '0');
const formatTimestampForFileName = (date) => (`${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}${padTwoDigits(date.getDate())}`
    + `-${padTwoDigits(date.getHours())}${padTwoDigits(date.getMinutes())}${padTwoDigits(date.getSeconds())}`);
const sanitizeTitleFileNamePart = (value) => {
    const sanitized = value
        .normalize('NFKC')
        .replace(/[^\p{L}\p{M}\p{N} _()-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(sanitized).slice(0, MAX_TITLE_FILE_NAME_CHARS).join('').trim();
};
const sanitizeSessionIdFileNamePart = (value) => {
    return value
        .normalize('NFKC')
        .replace(/[^A-Za-z0-9_-]+/g, '')
        .slice(0, MAX_SESSION_ID_FILE_NAME_CHARS);
};
const parseJsonObject = (value) => {
    if (!value)
        return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : null;
    }
    catch {
        return null;
    }
};
const isVisibleRailMessage = (row) => {
    if (row.type === 'user')
        return Boolean(row.content.trim());
    if (row.type !== 'assistant' || !row.content.trim())
        return false;
    const metadata = parseJsonObject(row.metadata);
    return metadata?.isThinking !== true;
};
function buildSessionDiagnosticsDefaultFileName(input) {
    const titlePart = sanitizeTitleFileNamePart(input.title) || 'session';
    const sessionPart = sanitizeSessionIdFileNamePart(input.sessionId) || 'unknown';
    const timestamp = formatTimestampForFileName(input.now ?? new Date());
    return `lobsterai-diagnostics-${titlePart}-${sessionPart}-${timestamp}.zip`;
}
function buildSessionDiagnosticsStats(data) {
    const messagesByType = {};
    let visibleRailMessages = 0;
    let maxContentChars = 0;
    let maxAssistantContentChars = 0;
    let maxToolResultContentChars = 0;
    let totalContentChars = 0;
    for (const message of data.messages) {
        messagesByType[message.type] = (messagesByType[message.type] ?? 0) + 1;
        const contentChars = message.content.length;
        totalContentChars += contentChars;
        maxContentChars = Math.max(maxContentChars, contentChars);
        if (message.type === 'assistant') {
            maxAssistantContentChars = Math.max(maxAssistantContentChars, contentChars);
        }
        if (message.type === 'tool_result') {
            maxToolResultContentChars = Math.max(maxToolResultContentChars, contentChars);
        }
        if (isVisibleRailMessage(message)) {
            visibleRailMessages += 1;
        }
    }
    return {
        sessionId: data.session.id,
        title: data.session.title,
        totalMessages: data.messages.length,
        messagesByType,
        visibleRailMessages,
        maxContentChars,
        maxAssistantContentChars,
        maxToolResultContentChars,
        totalContentChars,
        hasContinuityCapsule: data.capsule !== null,
    };
}
function buildSessionDiagnosticsArchiveEntries(input) {
    const stats = buildSessionDiagnosticsStats(input.data);
    const manifest = {
        schemaVersion: SESSION_DIAGNOSTICS_SCHEMA_VERSION,
        packageType: 'lobsterai-session-diagnostics',
        exportedAt: input.exportedAt,
        appVersion: input.appVersion,
        sessionId: input.data.session.id,
        title: input.data.session.title,
        files: [
            'session.json',
            'messages.jsonl',
            'capsule.json',
            'agent.json',
            'stats.json',
        ],
    };
    const messagesJsonl = input.data.messages.map((message) => JSON.stringify(message)).join('\n');
    return [
        {
            archiveName: 'manifest.json',
            content: `${JSON.stringify(manifest, null, 2)}\n`,
        },
        {
            archiveName: 'session.json',
            content: `${JSON.stringify(input.data.session, null, 2)}\n`,
        },
        {
            archiveName: 'messages.jsonl',
            content: messagesJsonl ? `${messagesJsonl}\n` : '',
        },
        {
            archiveName: 'capsule.json',
            content: `${JSON.stringify(input.data.capsule, null, 2)}\n`,
        },
        {
            archiveName: 'agent.json',
            content: `${JSON.stringify(input.data.agent, null, 2)}\n`,
        },
        {
            archiveName: 'stats.json',
            content: `${JSON.stringify(stats, null, 2)}\n`,
        },
    ];
}
async function exportSessionDiagnosticsZip(outputPath, input) {
    const zipFile = new yazl_1.default.ZipFile();
    zipFile.on('error', (err) => {
        zipFile.outputStream.destroy(err);
    });
    for (const entry of buildSessionDiagnosticsArchiveEntries(input)) {
        zipFile.addBuffer(Buffer.from(entry.content, 'utf8'), entry.archiveName);
    }
    const outputStream = fs_1.default.createWriteStream(outputPath);
    const pipelinePromise = (0, promises_1.pipeline)(zipFile.outputStream, outputStream);
    zipFile.end();
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Session diagnostics export timed out')), EXPORT_TIMEOUT_MS);
    });
    try {
        await Promise.race([pipelinePromise, timeoutPromise]);
    }
    catch (error) {
        outputStream.destroy();
        pipelinePromise.catch(() => { });
        try {
            fs_1.default.unlinkSync(outputPath);
        }
        catch { /* ignore cleanup errors */ }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=archive.js.map
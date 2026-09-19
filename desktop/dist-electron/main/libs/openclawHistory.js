"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGatewayHistoryEntries = exports.extractGatewayHistoryEntry = exports.shouldSuppressHeartbeatText = exports.isPreCompactionMemoryFlushPromptText = exports.isHeartbeatPromptText = exports.stripTrailingSilentReplyTail = exports.stripTrailingSilentReplyToken = exports.isSilentReplyPrefixText = exports.isSilentReplyText = exports.isHeartbeatAckText = exports.buildScheduledReminderSystemMessage = exports.extractGatewayMessageThinking = exports.extractGatewayMessageText = void 0;
const coworkSystemMessages_1 = require("../../common/coworkSystemMessages");
const reminderText_1 = require("../../scheduledTask/reminderText");
const HEARTBEAT_ACK_RE = /^[`*_~"'“”‘’()[\]{}<>.,!?;:，。！？；：\s-]{0,8}HEARTBEAT_OK[`*_~"'“”‘’()[\]{}<>.,!?;:，。！？；：\s-]{0,8}$/i;
const SILENT_REPLY_RE = /^[`*_~"'“”‘’()[\]{}<>.,!?;:，。！？；：\s-]{0,8}NO_REPLY[`*_~"'“”‘’()[\]{}<>.,!?;:，。！？；：\s-]{0,8}$/i;
const SILENT_REPLY_TOKEN = 'NO_REPLY';
const HEARTBEAT_PROMPT_MARKERS = [
    'read heartbeat.md if it exists',
    'when reading heartbeat.md',
    'reply heartbeat_ok',
    'do not infer or repeat old tasks from prior chats',
];
const PRE_COMPACTION_MEMORY_FLUSH_MARKERS = [
    'pre-compaction memory flush',
    'store durable memories only in memory/',
    'reply with no_reply',
];
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const collectTextChunks = (value) => {
    if (typeof value === 'string') {
        const text = value.trim();
        return text ? [text] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectTextChunks(item));
    }
    if (!isRecord(value)) {
        return [];
    }
    const chunks = [];
    if (typeof value.text === 'string') {
        const text = value.text.trim();
        if (text) {
            chunks.push(text);
        }
    }
    // Skip thinking blocks from regular text extraction (handled separately)
    // if (value.type === 'thinking') → see collectThinkingChunks()
    if (value.content !== undefined) {
        chunks.push(...collectTextChunks(value.content));
    }
    if (value.parts !== undefined) {
        chunks.push(...collectTextChunks(value.parts));
    }
    return chunks;
};
const parseGatewayTimestamp = (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const extractGatewayTimestamp = (message) => {
    return parseGatewayTimestamp(message.timestamp)
        ?? parseGatewayTimestamp(message.createdAt)
        ?? parseGatewayTimestamp(message.created_at)
        ?? parseGatewayTimestamp(message.time);
};
const getStringArrayField = (message, keys) => {
    for (const key of keys) {
        const value = message[key];
        if (typeof value === 'string' && value.trim()) {
            return [value.trim()];
        }
        if (Array.isArray(value)) {
            return value
                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean);
        }
    }
    return [];
};
const extractGatewayMediaAttachments = (message) => {
    const paths = getStringArrayField(message, ['MediaPaths', 'mediaPaths', 'MediaPath', 'mediaPath']);
    if (paths.length === 0) {
        return undefined;
    }
    const mimeTypes = getStringArrayField(message, ['MediaTypes', 'mediaTypes', 'MediaType', 'mediaType']);
    const seen = new Set();
    const attachments = [];
    for (let index = 0; index < paths.length; index += 1) {
        const localPath = paths[index];
        const key = localPath.replace(/\\/g, '/').toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        const mimeType = mimeTypes[index] || mimeTypes[0];
        attachments.push({
            localPath,
            ...(mimeType ? { mimeType } : {}),
        });
    }
    return attachments.length > 0 ? attachments : undefined;
};
const extractGatewayMessageText = (message) => {
    if (typeof message === 'string') {
        return message;
    }
    if (!isRecord(message)) {
        return '';
    }
    const content = message.content;
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        const chunks = collectTextChunks(content);
        if (chunks.length > 0) {
            return chunks.join('\n');
        }
    }
    if (isRecord(content)) {
        const chunks = collectTextChunks(content);
        if (chunks.length > 0) {
            return chunks.join('\n');
        }
    }
    if (typeof message.text === 'string') {
        return message.text;
    }
    return '';
};
exports.extractGatewayMessageText = extractGatewayMessageText;
const collectThinkingChunks = (value) => {
    if (typeof value === 'string')
        return [];
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectThinkingChunks(item));
    }
    if (!isRecord(value))
        return [];
    const chunks = [];
    if (value.type === 'thinking' && typeof value.thinking === 'string') {
        const thinking = value.thinking.trim();
        if (thinking) {
            chunks.push(thinking);
        }
    }
    for (const key of ['reasoning_content', 'reasoning', 'reasoning_text']) {
        if (typeof value[key] === 'string') {
            const thinking = value[key].trim();
            if (thinking) {
                chunks.push(thinking);
            }
        }
    }
    if (value.content !== undefined) {
        chunks.push(...collectThinkingChunks(value.content));
    }
    if (value.parts !== undefined) {
        chunks.push(...collectThinkingChunks(value.parts));
    }
    return chunks;
};
const extractGatewayMessageThinking = (message) => {
    if (!isRecord(message))
        return '';
    return collectThinkingChunks(message).join('\n\n').trim();
};
exports.extractGatewayMessageThinking = extractGatewayMessageThinking;
const buildScheduledReminderSystemMessage = (text) => {
    const parsed = (0, reminderText_1.parseScheduledReminderPrompt)(text);
    if (!parsed) {
        return (0, reminderText_1.parseSimpleScheduledReminderText)(text)?.reminderText ?? null;
    }
    return parsed.reminderText;
};
exports.buildScheduledReminderSystemMessage = buildScheduledReminderSystemMessage;
const isHeartbeatAckText = (text) => HEARTBEAT_ACK_RE.test(text.trim());
exports.isHeartbeatAckText = isHeartbeatAckText;
const isSilentReplyText = (text) => SILENT_REPLY_RE.test(text.trim());
exports.isSilentReplyText = isSilentReplyText;
const isSilentReplyPrefixText = (text) => {
    const trimmed = text.trimStart();
    if (!trimmed || trimmed.length < 2)
        return false;
    if ((0, exports.isSilentReplyText)(trimmed))
        return false;
    if (trimmed !== trimmed.toUpperCase())
        return false;
    if (/[^A-Z_]/.test(trimmed))
        return false;
    const tokenUpper = SILENT_REPLY_TOKEN.toUpperCase();
    if (!tokenUpper.startsWith(trimmed))
        return false;
    if (trimmed.includes('_'))
        return true;
    return trimmed === 'NO';
};
exports.isSilentReplyPrefixText = isSilentReplyPrefixText;
const TRAILING_SILENT_REPLY_RE = /\n\s*NO_REPLY\s*$/i;
const stripTrailingSilentReplyToken = (text) => {
    return text.replace(TRAILING_SILENT_REPLY_RE, '').trimEnd();
};
exports.stripTrailingSilentReplyToken = stripTrailingSilentReplyToken;
const TRAILING_SILENT_REPLY_PARTIAL_TOKENS = [
    'NO_REPLY', 'NO_REPL', 'NO_REP', 'NO_RE', 'NO_R', 'NO_', 'NO',
];
const stripTrailingSilentReplyTail = (text) => {
    const stripped = text.replace(TRAILING_SILENT_REPLY_RE, '');
    if (stripped !== text)
        return stripped.trimEnd();
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline < 0)
        return text;
    const tail = text.slice(lastNewline + 1).trim().toUpperCase();
    if (!tail)
        return text;
    for (const token of TRAILING_SILENT_REPLY_PARTIAL_TOKENS) {
        if (tail === token) {
            return text.slice(0, lastNewline).trimEnd();
        }
    }
    return text;
};
exports.stripTrailingSilentReplyTail = stripTrailingSilentReplyTail;
const isHeartbeatPromptText = (text) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return HEARTBEAT_PROMPT_MARKERS.every((marker) => normalized.includes(marker));
};
exports.isHeartbeatPromptText = isHeartbeatPromptText;
const isPreCompactionMemoryFlushPromptText = (text) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return PRE_COMPACTION_MEMORY_FLUSH_MARKERS.every((marker) => normalized.includes(marker));
};
exports.isPreCompactionMemoryFlushPromptText = isPreCompactionMemoryFlushPromptText;
const shouldSuppressHeartbeatText = (role, text) => {
    if ((role === 'assistant' || role === 'system') && ((0, exports.isHeartbeatAckText)(text) || (0, exports.isSilentReplyText)(text))) {
        return true;
    }
    if (role === 'user' && ((0, exports.isHeartbeatPromptText)(text) || (0, exports.isPreCompactionMemoryFlushPromptText)(text))) {
        return true;
    }
    return false;
};
exports.shouldSuppressHeartbeatText = shouldSuppressHeartbeatText;
const extractGatewayHistoryEntry = (message) => {
    if (!isRecord(message)) {
        return null;
    }
    const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : '';
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        return null;
    }
    let text = (0, exports.extractGatewayMessageText)(message).trim();
    const mediaAttachments = extractGatewayMediaAttachments(message);
    if (!text && !(role === 'user' && mediaAttachments?.length)) {
        return null;
    }
    if (role === 'assistant') {
        text = (0, exports.stripTrailingSilentReplyToken)(text);
        if (!text) {
            return null;
        }
    }
    if ((0, exports.shouldSuppressHeartbeatText)(role, text)) {
        return null;
    }
    if (role === 'system' && (0, coworkSystemMessages_1.isInternalCompactionSystemText)(text)) {
        return null;
    }
    const reminderSystemMessage = role === 'user'
        ? (0, exports.buildScheduledReminderSystemMessage)(text)
        : null;
    const timestamp = extractGatewayTimestamp(message);
    if (reminderSystemMessage) {
        return {
            role: 'system',
            text: reminderSystemMessage,
            ...(timestamp != null && { timestamp }),
        };
    }
    // Extract usage and model for assistant messages
    let usage;
    let model;
    if (role === 'assistant') {
        if (isRecord(message.usage)) {
            const u = message.usage;
            const input = typeof u.input === 'number' ? u.input
                : typeof u.inputTokens === 'number' ? u.inputTokens : undefined;
            const output = typeof u.output === 'number' ? u.output
                : typeof u.outputTokens === 'number' ? u.outputTokens : undefined;
            const cacheRead = typeof u.cacheRead === 'number' ? u.cacheRead
                : typeof u.cacheReadTokens === 'number' ? u.cacheReadTokens : undefined;
            const totalTokens = typeof u.totalTokens === 'number' ? u.totalTokens : undefined;
            if (input != null || output != null || cacheRead != null || totalTokens != null) {
                usage = {
                    ...(input != null && { input }),
                    ...(output != null && { output }),
                    ...(cacheRead != null && { cacheRead }),
                    ...(totalTokens != null && { totalTokens }),
                };
            }
        }
        if (typeof message.model === 'string') {
            model = message.model;
        }
    }
    return {
        role,
        text,
        ...(timestamp != null && { timestamp }),
        ...(usage && { usage }),
        ...(model && { model }),
        ...(mediaAttachments && { mediaAttachments }),
    };
};
exports.extractGatewayHistoryEntry = extractGatewayHistoryEntry;
const extractGatewayHistoryEntries = (messages) => {
    return messages
        .map((message) => (0, exports.extractGatewayHistoryEntry)(message))
        .filter((entry) => entry !== null);
};
exports.extractGatewayHistoryEntries = extractGatewayHistoryEntries;
//# sourceMappingURL=openclawHistory.js.map
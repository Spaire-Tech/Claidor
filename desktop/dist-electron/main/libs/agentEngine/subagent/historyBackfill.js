"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectBackfillableHistoryToolEntries = exports.isHistoryToolResultRole = exports.getHistoryToolName = exports.getHistoryToolCallId = void 0;
const openclawHistory_1 = require("../../openclawHistory");
const sessionKeys_1 = require("./sessionKeys");
const BACKFILLABLE_HISTORY_TOOL_NAMES = new Set([
    'agents_list',
    'sessions_read',
    'sessions_resume',
    'sessions_spawn',
    'sessions_yield',
]);
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const getHistoryToolCallId = (value) => {
    const candidates = [
        value.id,
        value.toolCallId,
        value.tool_call_id,
        value.toolUseId,
        value.tool_use_id,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
};
exports.getHistoryToolCallId = getHistoryToolCallId;
const getHistoryToolName = (value) => {
    const candidates = [value.name, value.toolName, value.tool_name];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
};
exports.getHistoryToolName = getHistoryToolName;
const getHistoryToolArguments = (value) => {
    const candidates = [value.arguments, value.args, value.input];
    for (const candidate of candidates) {
        if (isRecord(candidate)) {
            return candidate;
        }
        if (typeof candidate === 'string' && candidate.trim()) {
            try {
                const parsed = JSON.parse(candidate);
                if (isRecord(parsed)) {
                    return parsed;
                }
            }
            catch { /* ignore malformed historical tool arguments */ }
        }
    }
    return {};
};
const getHistoryMessageTimestamp = (message) => {
    const candidates = [message.timestamp, message.createdAt, message.created_at];
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return candidate;
        }
        if (typeof candidate === 'string' && candidate.trim()) {
            const parsed = Date.parse(candidate);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return undefined;
};
const isBackfillableHistoryToolName = (toolName) => (BACKFILLABLE_HISTORY_TOOL_NAMES.has(toolName.trim().toLowerCase()));
const isHistoryToolCallBlock = (value) => {
    const blockType = typeof value.type === 'string' ? value.type.trim() : '';
    return blockType === 'toolCall' || blockType === 'tool_use' || blockType === 'tool_call';
};
const isHistoryToolResultRole = (role) => {
    const normalized = role.trim().toLowerCase();
    return normalized === 'tool'
        || normalized === 'toolresult'
        || normalized === 'tool_result';
};
exports.isHistoryToolResultRole = isHistoryToolResultRole;
const getHistoryToolResultIsError = (message) => (Boolean(message.isError)
    || Boolean(message.is_error)
    || Boolean(message.error));
const inferSessionsSpawnArgsFromResultText = (resultText) => {
    try {
        const parsed = JSON.parse(resultText);
        if (!isRecord(parsed))
            return null;
        const childSessionKey = typeof parsed.childSessionKey === 'string' ? parsed.childSessionKey.trim() : '';
        if (!childSessionKey)
            return null;
        const agentId = (0, sessionKeys_1.parseAgentIdFromSubagentSessionKey)(childSessionKey);
        const args = {};
        if (agentId) {
            args.agentId = agentId;
        }
        const taskName = typeof parsed.taskName === 'string' ? parsed.taskName.trim() : '';
        if (taskName) {
            args.taskName = taskName;
        }
        return args;
    }
    catch {
        return null;
    }
};
const collectBackfillableHistoryToolEntries = (messages) => {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (isRecord(message) && message.role === 'user') {
            lastUserIdx = i;
            break;
        }
    }
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    const toolCalls = new Map();
    const toolResults = new Map();
    for (let index = startIdx; index < messages.length; index++) {
        const message = messages[index];
        if (!isRecord(message))
            continue;
        const role = typeof message.role === 'string' ? message.role.trim() : '';
        if (role === 'assistant' && Array.isArray(message.content)) {
            let blockIndex = 0;
            for (const block of message.content) {
                blockIndex++;
                if (!isRecord(block) || !isHistoryToolCallBlock(block))
                    continue;
                const toolName = (0, exports.getHistoryToolName)(block).trim().toLowerCase();
                if (!isBackfillableHistoryToolName(toolName))
                    continue;
                const toolCallId = (0, exports.getHistoryToolCallId)(block);
                if (!toolCallId || toolCalls.has(toolCallId))
                    continue;
                toolCalls.set(toolCallId, {
                    toolName,
                    args: getHistoryToolArguments(block),
                    order: index * 1000 + blockIndex,
                });
            }
            continue;
        }
        if (!(0, exports.isHistoryToolResultRole)(role))
            continue;
        const toolCallId = (0, exports.getHistoryToolCallId)(message);
        if (!toolCallId || toolResults.has(toolCallId))
            continue;
        const text = (0, openclawHistory_1.extractGatewayMessageText)(message);
        if (!text.trim())
            continue;
        const toolName = (0, exports.getHistoryToolName)(message).trim().toLowerCase();
        toolResults.set(toolCallId, {
            toolName,
            text,
            timestamp: getHistoryMessageTimestamp(message),
            isError: getHistoryToolResultIsError(message),
            order: index * 1000,
        });
    }
    const entries = [];
    const consumedResultIds = new Set();
    for (const [toolCallId, call] of toolCalls.entries()) {
        const result = toolResults.get(toolCallId);
        if (!result?.text.trim())
            continue;
        consumedResultIds.add(toolCallId);
        entries.push({
            toolCallId,
            toolName: call.toolName,
            args: call.args,
            resultText: result.text,
            resultTimestamp: result.timestamp,
            resultIsError: result.isError,
            order: Math.min(call.order, result.order),
        });
    }
    for (const [toolCallId, result] of toolResults.entries()) {
        if (consumedResultIds.has(toolCallId))
            continue;
        const resultToolName = result.toolName;
        if (isBackfillableHistoryToolName(resultToolName)) {
            entries.push({
                toolCallId,
                toolName: resultToolName,
                args: {},
                resultText: result.text,
                resultTimestamp: result.timestamp,
                resultIsError: result.isError,
                order: result.order,
            });
            continue;
        }
        const inferredSpawnArgs = inferSessionsSpawnArgsFromResultText(result.text);
        if (inferredSpawnArgs) {
            entries.push({
                toolCallId,
                toolName: 'sessions_spawn',
                args: inferredSpawnArgs,
                resultText: result.text,
                resultTimestamp: result.timestamp,
                resultIsError: result.isError,
                order: result.order,
            });
        }
    }
    return entries.sort((a, b) => a.order - b.order);
};
exports.collectBackfillableHistoryToolEntries = collectBackfillableHistoryToolEntries;
//# sourceMappingURL=historyBackfill.js.map